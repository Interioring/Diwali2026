import { ID_PATTERN, isWishStyle, validateGreetingInput, videoFilename, type Greeting } from "../shared/greeting.ts";
import { parseAgent } from "../shared/agent.ts";
import { authorised, istDay, recordVisit, saveFeedback, stats } from "./analytics.ts";
import statsPage from "./stats.html?raw";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RL_GREETINGS?: RateLimiter;
  /** Videos uploaded by scripts/greeting-bot.mjs, one per greeting: `<id>.mp4`. */
  VIDEOS?: R2Bucket;
  RL_VISITS?: RateLimiter;
  RL_FEEDBACK?: RateLimiter;
  /** Unlocks /stats (a Worker secret: `wrangler secret put STATS_KEY`). */
  STATS_KEY?: string;
}

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000; // greetings live 45 days

const EVENTS = new Set([
  "landing_view",
  "create_start",
  "greeting_created",
  "recipient_view",
  "recipient_create_start",
  "create_another",
  "send_back",
  "export_started",
  "export_completed",
  "export_failed",
  "share_whatsapp",
  "share_native",
  "share_copy",
  "share_video",
  "download_video",
  "feedback_sent",
  "share_post_message",
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

// India time, like the visit log, so a Diwali evening stays on one date.
const today = () => istDay();

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

async function trackEvent(request: Request, env: Env): Promise<Response> {
  // Automated browsers (crawlers, the greeting bot's video maker) aren't people using the site.
  if (parseAgent(request.headers.get("user-agent") ?? "").automated) return new Response(null, { status: 204 });
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

const videoGone = () =>
  new Response("This greeting is no longer available.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * GET /v/<id>.mp4: the greeting's video, streamed from R2 with byte ranges so
 * phones can seek. It follows the greeting: once that expires or is reported,
 * the link stops working too. `?download` asks the browser to save it.
 */
async function serveVideo(request: Request, env: Env, id: string): Promise<Response> {
  if (!env.VIDEOS) return videoGone();
  const greeting = await getGreeting(env, id);
  if (!greeting) return videoGone();
  const key = `${id}.mp4`;
  const filename = videoFilename(greeting.recipientName);
  const headers = new Headers({
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=3600",
    "x-robots-tag": "noindex",
    "content-disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${filename}"`,
  });
  if (request.method === "HEAD") {
    const head = await env.VIDEOS.head(key);
    if (!head) return videoGone();
    headers.set("etag", head.httpEtag);
    headers.set("content-length", String(head.size));
    return new Response(null, { headers });
  }
  let object: R2Object | R2ObjectBody | null;
  try {
    object = await env.VIDEOS.get(key, { range: request.headers, onlyIf: request.headers });
  } catch {
    const head = await env.VIDEOS.head(key);
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${head?.size ?? 0}` } });
  }
  if (!object) return videoGone();
  headers.set("etag", object.httpEtag);
  if (!("body" in object)) return new Response(null, { status: request.headers.has("if-none-match") ? 304 : 412, headers });
  const range = request.headers.has("range") ? object.range : undefined;
  if (range) {
    const size = object.size;
    const start = "suffix" in range && range.suffix !== undefined ? size - range.suffix : (range as { offset?: number }).offset ?? 0;
    const length = "length" in range && range.length !== undefined ? range.length : size - start;
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/health") return json({ ok: true });
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
      if (pathname === "/api/events" && method === "POST") return await trackEvent(request, env);
      if (pathname === "/api/visit" && method === "POST") {
        // Never fails the page: a dropped visit is better than an error.
        if (await allowed(env.RL_VISITS, request)) await recordVisit(request, env).catch(() => undefined);
        return new Response(null, { status: 204 });
      }
      if (pathname === "/api/feedback" && method === "POST") {
        if (!(await allowed(env.RL_FEEDBACK, request))) return error(429, "Thanks! Please wait a minute before sending more.");
        const problem = await saveFeedback(request, env);
        return problem ? error(400, problem) : json({ ok: true });
      }
      if (pathname === "/api/stats" && method === "GET") {
        const auth = await authorised(request, env);
        if (auth === "unset") return error(503, "STATS_KEY isn't set.");
        if (auth === "denied") return error(401, "Wrong key.");
        return json(await stats(env, Number(url.searchParams.get("days") ?? 30)));
      }
      if (pathname.startsWith("/api/")) return error(404, "Not found.");

      if (pathname === "/stats" && method === "GET") {
        return new Response(statsPage, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex",
            "x-frame-options": "DENY",
            "referrer-policy": "no-referrer",
          },
        });
      }

      const clip = pathname.match(/^\/v\/([A-Za-z0-9]{12})\.mp4$/);
      if (clip && (method === "GET" || method === "HEAD")) return await serveVideo(request, env, clip[1]);
      if (pathname.startsWith("/v/")) return videoGone();

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
