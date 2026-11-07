import Anthropic from "@anthropic-ai/sdk";
import {
  ID_PATTERN,
  isWishStyle,
  validateGreetingInput,
  type Greeting,
  type WishStyle,
} from "../shared/greeting.ts";
import { CURATED_WISHES } from "../shared/wishes.ts";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  RL_GREETINGS?: RateLimiter;
  RL_WISHES?: RateLimiter;
}

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000; // greetings live 45 days
const WISH_CACHE_MS = 6 * 60 * 60 * 1000; // reuse generated wishes for 6 hours
const WISH_MODEL = "claude-opus-5-5";

const EVENTS = new Set([
  "landing_view",
  "create_start",
  "greeting_created",
  "wish_ai_requested",
  "recipient_view",
  "recipient_create_start",
  "export_started",
  "export_completed",
  "export_failed",
  "share_whatsapp",
  "share_native",
  "share_copy",
  "share_video",
  "download_video",
]);

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "anon";
}

async function allowed(limiter: RateLimiter | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key: clientKey(request) });
    return success;
  } catch {
    return true;
  }
}

async function readJson(request: Request, maxBytes = 4096): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("too large");
  return JSON.parse(text);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newId(): string {
  // 12 base62 chars via rejection sampling: ~71 bits of randomness, unguessable.
  let out = "";
  while (out.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 248 && out.length < 12) out += ALPHABET[b % 62];
    }
  }
  return out;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getGreeting(env: Env, id: string): Promise<Greeting | null> {
  if (!ID_PATTERN.test(id)) return null;
  const row = await env.DB.prepare(
    "SELECT id, recipient_name, sender_name, message, style, seed, created_at FROM greetings WHERE id = ? AND reported_at IS NULL AND expires_at > ?",
  )
    .bind(id, Date.now())
    .first<{ id: string; recipient_name: string; sender_name: string | null; message: string; style: string; seed: number; created_at: number }>();
  if (!row) return null;
  return {
    id: row.id,
    recipientName: row.recipient_name,
    ...(row.sender_name ? { senderName: row.sender_name } : {}),
    message: row.message,
    style: isWishStyle(row.style) ? row.style : "warm",
    seed: row.seed,
    createdAt: row.created_at,
  };
}

async function createGreeting(request: Request, env: Env): Promise<Response> {
  if (!(await allowed(env.RL_GREETINGS, request))) return error(429, "Too many greetings at once. Wait a minute and try again.");
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return error(400, "Could not read the greeting.");
  }
  const result = validateGreetingInput(body);
  if (!result.ok) return error(400, result.error);
  const { recipientName, senderName, message, style, seed } = result.value;
  const now = Date.now();
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO greetings (id, recipient_name, sender_name, message, style, seed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, recipientName, senderName ?? null, message, style, seed, now, now + RETENTION_MS)
    .run();
  const greeting: Greeting = { id, recipientName, ...(senderName ? { senderName } : {}), message, style, seed, createdAt: now };
  return json(greeting, 201);
}

async function reportGreeting(env: Env, id: string): Promise<Response> {
  if (!ID_PATTERN.test(id)) return error(404, "Greeting not found.");
  await env.DB.prepare("UPDATE greetings SET reported_at = ? WHERE id = ? AND reported_at IS NULL").bind(Date.now(), id).run();
  return json({ ok: true });
}

const WISH_SCHEMA = {
  type: "object",
  properties: {
    wishes: { type: "array", items: { type: "string" } },
  },
  required: ["wishes"],
  additionalProperties: false,
} as const;

const STYLE_BRIEF: Record<WishStyle, string> = {
  warm: "warm and traditional in feeling",
  cheerful: "short and cheerful, under 14 words each",
  family: "about family, home, and togetherness",
  playful: "light and playful with one gentle software or tech wink (compile, render, ship), still clearly festive",
};

function cleanWish(text: string): string | null {
  const t = text.replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (t.length < 12 || t.length > 160) return null;
  if (/https?:|www\.|@|#/.test(t)) return null;
  return t;
}

async function generateWishes(env: Env, style: WishStyle): Promise<string[] | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: WISH_MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: WISH_SCHEMA },
      },
      system:
        "You write short Diwali greeting wishes for an animated greeting video. Each wish is one or two sentences, at most 150 characters, in plain English. Do not include names, emoji, hashtags, or quotation marks. Keep wishes inclusive: never assume the reader's religion, deity, caste, region, or politics; talk about light, home, warmth, sweets, togetherness, and new beginnings.",
      messages: [
        {
          role: "user",
          content: `Write 6 distinct wishes that are ${STYLE_BRIEF[style]}. Return them in the wishes array.`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = JSON.parse(text.text) as { wishes?: unknown };
    if (!Array.isArray(parsed.wishes)) return null;
    const wishes = parsed.wishes
      .filter((w): w is string => typeof w === "string")
      .map(cleanWish)
      .filter((w): w is string => w !== null);
    return wishes.length >= 2 ? wishes.slice(0, 6) : null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn("wish generation failed", err.status);
    else console.warn("wish generation failed");
    return null;
  }
}

async function wishes(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let style: WishStyle = "warm";
  try {
    const body = (await readJson(request, 512)) as { style?: unknown };
    if (isWishStyle(body.style)) style = body.style;
  } catch {
    // default style
  }
  const cached = await env.DB.prepare("SELECT wishes, created_at FROM wish_cache WHERE style = ?")
    .bind(style)
    .first<{ wishes: string; created_at: number }>();
  const fresh = cached && Date.now() - cached.created_at < WISH_CACHE_MS;
  if (cached && fresh) return json({ source: "ai", style, wishes: JSON.parse(cached.wishes) as string[] });

  if (!(await allowed(env.RL_WISHES, request))) {
    const list = cached ? (JSON.parse(cached.wishes) as string[]) : CURATED_WISHES[style];
    return json({ source: cached ? "ai" : "curated", style, wishes: list });
  }

  const generated = await generateWishes(env, style);
  if (generated) {
    ctx.waitUntil(
      env.DB.prepare(
        "INSERT INTO wish_cache (style, wishes, created_at) VALUES (?, ?, ?) ON CONFLICT(style) DO UPDATE SET wishes = excluded.wishes, created_at = excluded.created_at",
      )
        .bind(style, JSON.stringify(generated), Date.now())
        .run(),
    );
    return json({ source: "ai", style, wishes: generated });
  }
  if (cached) return json({ source: "ai", style, wishes: JSON.parse(cached.wishes) as string[] });
  return json({ source: "curated", style, wishes: CURATED_WISHES[style] });
}

async function trackEvent(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await readJson(request, 256)) as { name?: unknown };
    if (typeof body.name === "string" && EVENTS.has(body.name)) {
      await env.DB.prepare(
        "INSERT INTO event_counts (day, name, count) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET count = count + 1",
      )
        .bind(today(), body.name)
        .run();
    }
  } catch {
    // analytics never fails the client
  }
  return new Response(null, { status: 204 });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

class MetaRewriter {
  constructor(private readonly tags: Record<string, string>) {}
  element(element: Element) {
    const key = element.getAttribute("property") ?? element.getAttribute("name");
    if (key && key in this.tags) element.setAttribute("content", this.tags[key]);
  }
}

class TitleRewriter {
  constructor(private readonly title: string) {}
  element(element: Element) {
    element.setInnerContent(this.title);
  }
}

async function greetingPage(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(new URL("/", url).toString(), request));
  const greeting = await getGreeting(env, id).catch(() => null);
  if (!greeting) return asset;
  const title = `A Diwali greeting for ${greeting.recipientName}`;
  const description = greeting.senderName
    ? escapeAttr(`From ${greeting.senderName}: a kolam drawn and diyas lit for you. Open your Diwali 2026 greeting.`)
    : "A kolam drawn and diyas lit for you. Open your Diwali 2026 greeting.";
  const tags: Record<string, string> = {
    "og:title": escapeAttr(title),
    "og:description": description,
    "og:url": `${url.origin}/g/${greeting.id}`,
    "og:image": `${url.origin}/og.png`,
    "twitter:title": escapeAttr(title),
    "twitter:description": description,
    "twitter:image": `${url.origin}/og.png`,
    description,
  };
  const rewritten = new HTMLRewriter()
    .on("meta", new MetaRewriter(tags))
    .on("title", new TitleRewriter(`${title} · Diwali 2026`))
    .transform(asset);
  const headers = new Headers(rewritten.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex");
  return new Response(rewritten.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/health") return json({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY) });
      if (pathname === "/api/greetings" && method === "POST") return await createGreeting(request, env);
      const match = pathname.match(/^\/api\/greetings\/([^/]+)(\/report)?$/);
      if (match) {
        const [, id, report] = match;
        if (report && method === "POST") return await reportGreeting(env, id);
        if (!report && method === "GET") {
          const greeting = await getGreeting(env, id);
          return greeting ? json(greeting) : error(404, "This greeting is no longer available.");
        }
        return error(405, "Method not allowed.");
      }
      if (pathname === "/api/wishes/generate" && method === "POST") return await wishes(request, env, ctx);
      if (pathname === "/api/events" && method === "POST") return await trackEvent(request, env);
      if (pathname.startsWith("/api/")) return error(404, "Not found.");

      const page = pathname.match(/^\/g\/([^/]+)\/?$/);
      if (page && method === "GET") return await greetingPage(request, env, page[1]);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("request failed", pathname, err instanceof Error ? err.message : "unknown");
      if (pathname.startsWith("/api/")) return error(500, "Something went wrong on our side. Please try again.");
      return env.ASSETS.fetch(request);
    }
  },
} satisfies ExportedHandler<Env>;
