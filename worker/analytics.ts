import { parseAgent } from "../shared/agent.ts";
import { senderSlug } from "../shared/links.ts";

interface Env {
  DB: D1Database;
  STATS_KEY?: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Days are India time: the campaign's audience, and Diwali evening stays on one date. */
export const istDay = (ms = Date.now()) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

const PAGES = new Set(["home", "greeting"]);
const ROLES = new Set(["sender", "recipient"]);
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Today's salt; older ones are deleted so yesterday's hashes can't be recomputed. */
async function saltFor(env: Env, day: string): Promise<string> {
  const row = await env.DB.prepare("SELECT salt FROM daily_salt WHERE day = ?").bind(day).first<{ salt: string }>();
  if (row) return row.salt;
  const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const twoDaysAgo = istDay(Date.now() - 2 * 86_400_000);
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO daily_salt (day, salt) VALUES (?, ?)").bind(day, fresh),
    env.DB.prepare("DELETE FROM daily_salt WHERE day < ?").bind(twoDaysAgo),
  ]);
  return (await env.DB.prepare("SELECT salt FROM daily_salt WHERE day = ?").bind(day).first<{ salt: string }>())?.salt ?? fresh;
}

function referrerHost(raw: unknown, ownHost: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").slice(0, 100);
    return host && host !== ownHost ? host : null;
  } catch {
    return null;
  }
}

/** POST /api/visit from the page: one row per page view, enriched here with location and device. */
export async function recordVisit(request: Request, env: Env): Promise<void> {
  const text = await request.text();
  if (text.length > 2048) return;
  const body = JSON.parse(text) as Record<string, unknown>;
  const page = typeof body.page === "string" && PAGES.has(body.page) ? body.page : null;
  if (!page) return;
  const ua = request.headers.get("user-agent") ?? "";
  const agent = parseAgent(ua, typeof body.touch === "number" ? body.touch : 0);
  if (agent.automated) return; // crawlers, link previews, and our own headless video maker

  const now = Date.now();
  const day = istDay(now);
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const visitor = (await sha256Hex(`${ip}|${ua}|${day}|${await saltFor(env, day)}`)).slice(0, 20);
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const screen = typeof body.screen === "string" && /^\d{2,5}x\d{2,5}$/.test(body.screen) ? body.screen : null;
  await env.DB.prepare(
    `INSERT INTO visits (at, day, page, role, visitor, country, region, city, timezone, browser, os, device, referrer, utm_source, utm_sender, lang, screen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      now,
      day,
      page,
      typeof body.role === "string" && ROLES.has(body.role) ? body.role : null,
      visitor,
      clip(cf.country, 8),
      clip(cf.region, 60),
      clip(cf.city, 60),
      clip(cf.timezone, 60),
      agent.browser,
      agent.os,
      agent.device,
      referrerHost(body.ref, new URL(request.url).hostname),
      clip(body.utm, 60),
      senderSlug(typeof body.sender === "string" ? body.sender : "") || null,
      clip(body.lang, 20),
      screen,
    )
    .run();
}

const FEEDBACK_LIMITS = { message: 1000, name: 60, business: 80, contact: 100 };

/** POST /api/feedback from the end of the greeting page. Returns an error message, or null when saved. */
export async function saveFeedback(request: Request, env: Env): Promise<string | null> {
  const text = await request.text();
  if (text.length > 4096) return "That's a bit long. Please shorten it.";
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return "Couldn't read that.";
  }
  const field = (k: keyof typeof FEEDBACK_LIMITS) => (typeof body[k] === "string" ? (body[k] as string).trim().replace(/\s+/g, " ") : "");
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const name = field("name"), business = field("business"), contact = field("contact");
  if (!message && !contact) return "Write a line, or leave a way to reach you.";
  for (const [k, v] of Object.entries({ message, name, business, contact }) as Array<[keyof typeof FEEDBACK_LIMITS, string]>) {
    if (v.length > FEEDBACK_LIMITS[k]) return `Please keep that under ${FEEDBACK_LIMITS[k]} characters.`;
  }
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const agent = parseAgent(request.headers.get("user-agent") ?? "");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO feedback (at, day, message, name, business, contact, role, country, city, device, utm_sender)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      now,
      istDay(now),
      message || null,
      name || null,
      business || null,
      contact || null,
      body.role === "sender" || body.role === "recipient" ? body.role : null,
      clip(cf.country, 8),
      clip(cf.city, 60),
      agent.device,
      senderSlug(typeof body.sender === "string" ? body.sender : "") || null,
    )
    .run();
  return null;
}

/** Constant-time comparison, so the key can't be guessed one character at a time. */
async function keyMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authorised(request: Request, env: Env): Promise<"ok" | "unset" | "denied"> {
  if (!env.STATS_KEY) return "unset";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return given && (await keyMatches(given, env.STATS_KEY)) ? "ok" : "denied";
}

type Count = { key: string | null; visits: number; visitors: number };

/** GET /api/stats?days=30: everything the stats page shows, in one response. */
export async function stats(env: Env, days: number) {
  const span = Math.min(Math.max(Math.floor(days) || 30, 1), 366);
  const since = istDay(Date.now() - (span - 1) * 86_400_000);
  const today = istDay();
  const db = env.DB;
  // "Visitors" are unique per day; across several days they're summed visitor-days.
  const breakdown = (expr: string, limit = 12) =>
    db
      .prepare(
        `SELECT ${expr} AS key, COUNT(*) AS visits, COUNT(DISTINCT visitor || day) AS visitors
         FROM visits WHERE day >= ? GROUP BY key ORDER BY visits DESC LIMIT ${limit}`,
      )
      .bind(since);
  const createdDay = "date((created_at + 19800000) / 1000, 'unixepoch')"; // India time
  const [byDay, greetingsByDay, eventsByDay, totals, countries, cities, devices, browsers, systems, referrers, pages, sources, languages, senders, senderGreetings, feedback] =
    await db.batch([
      db.prepare(
        `SELECT day, COUNT(*) AS visits, COUNT(DISTINCT visitor) AS visitors,
                SUM(page = 'home') AS home, SUM(page = 'greeting') AS greeting
         FROM visits WHERE day >= ? GROUP BY day ORDER BY day`,
      ).bind(since),
      db.prepare(`SELECT ${createdDay} AS day, COUNT(*) AS greetings FROM greetings WHERE ${createdDay} >= ? GROUP BY day`).bind(since),
      db.prepare("SELECT day, name, count FROM event_counts WHERE day >= ?").bind(since),
      db.prepare(
        `SELECT (SELECT COUNT(*) FROM greetings) AS greetings_all,
                (SELECT COUNT(*) FROM visits) AS visits_all,
                (SELECT COUNT(DISTINCT visitor) FROM visits WHERE day = ?) AS visitors_today,
                (SELECT COUNT(*) FROM visits WHERE day = ?) AS visits_today,
                (SELECT COUNT(*) FROM greetings WHERE ${createdDay} = ?) AS greetings_today`,
      ).bind(today, today, today),
      breakdown("country"),
      breakdown("CASE WHEN city IS NULL THEN NULL ELSE city || ', ' || COALESCE(region, country, '') END", 15),
      breakdown("device"),
      breakdown("browser"),
      breakdown("os"),
      breakdown("referrer"),
      breakdown("CASE WHEN page = 'greeting' THEN 'Greeting page (' || COALESCE(role, 'unknown') || ')' ELSE 'Home / maker' END"),
      breakdown("utm_source"),
      breakdown("lang", 8),
      breakdown("utm_sender", 15),
      db.prepare(
        `SELECT sender_name AS key, COUNT(*) AS visits, 0 AS visitors FROM greetings
         WHERE ${createdDay} >= ? AND sender_name IS NOT NULL GROUP BY lower(sender_name) ORDER BY visits DESC LIMIT 15`,
      ).bind(since),
      db.prepare(
        "SELECT at, message, name, business, contact, role, country, city, device, utm_sender FROM feedback ORDER BY at DESC LIMIT 100",
      ),
    ]);

  const events: Record<string, number> = {};
  const eventDays: Record<string, Record<string, number>> = {};
  for (const r of eventsByDay.results as Array<{ day: string; name: string; count: number }>) {
    events[r.name] = (events[r.name] ?? 0) + r.count;
    (eventDays[r.day] ??= {})[r.name] = r.count;
  }
  const greetingDays = Object.fromEntries((greetingsByDay.results as Array<{ day: string; greetings: number }>).map((r) => [r.day, r.greetings]));
  const visitDays = Object.fromEntries((byDay.results as Array<{ day: string }>).map((r) => [r.day, r]));
  const series: Array<{ day: string; visits: number; visitors: number; home: number; greeting: number; greetings: number; videos: number }> = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = istDay(Date.now() - i * 86_400_000);
    const v = (visitDays[day] ?? {}) as { visits?: number; visitors?: number; home?: number; greeting?: number };
    series.push({
      day,
      visits: v.visits ?? 0,
      visitors: v.visitors ?? 0,
      home: v.home ?? 0,
      greeting: v.greeting ?? 0,
      greetings: greetingDays[day] ?? 0,
      videos: eventDays[day]?.export_completed ?? 0,
    });
  }
  const sum = (k: "visits" | "visitors" | "greetings" | "videos") => series.reduce((a, d) => a + d[k], 0);
  const rows = (r: D1Result) => r.results as Count[];
  return {
    days: span,
    since,
    today,
    totals: {
      visits: sum("visits"),
      visitors: sum("visitors"),
      greetings: sum("greetings"),
      videos: events.export_completed ?? 0,
      shares: ["share_whatsapp", "share_native", "share_copy", "share_video", "download_video", "share_post_message"].reduce((a, k) => a + (events[k] ?? 0), 0),
      recipientViews: events.recipient_view ?? 0,
      ...(totals.results[0] as Record<string, number>),
    },
    funnel: [
      ["Opened the maker", events.landing_view ?? 0],
      ["Started a greeting", events.create_start ?? 0],
      ["Made a greeting", events.greeting_created ?? 0],
      ["Made the video", events.export_completed ?? 0],
      ["Shared the link", (events.share_whatsapp ?? 0) + (events.share_native ?? 0) + (events.share_copy ?? 0)],
      ["Recipients who opened one", events.recipient_view ?? 0],
      ["Recipients who made their own", (events.recipient_create_start ?? 0) + (events.send_back ?? 0)],
    ],
    series,
    breakdowns: {
      countries: rows(countries),
      cities: rows(cities),
      devices: rows(devices),
      browsers: rows(browsers),
      systems: rows(systems),
      referrers: rows(referrers),
      pages: rows(pages),
      sources: rows(sources),
      languages: rows(languages),
      senders: rows(senders),
      senderGreetings: rows(senderGreetings),
    },
    feedback: feedback.results,
  };
}
