#!/usr/bin/env node
// The send desk: a small page on your Mac that shows your contacts one at a time.
// Skip, or Send: check the name in the video, the wish and the WhatsApp text, then
// queue it. The greeting bot (started for you) makes the video and sends it on
// WhatsApp Web, paced, while you carry on with the next person.
//
//   node scripts/send-desk.mjs --from "Srini"
//   node scripts/send-desk.mjs ~/Desktop/diwali-contacts.csv --from "Srini" --port 5300
//
// What's stored, and where:
//   the sheet (default ~/Desktop/diwali-contacts.csv)   every decision and result, saved as it happens
//   bulk-out/sent-log.csv     one line per outcome: time, result, names, phone, wish, exact WhatsApp text, links
//   bulk-out/backups/         a copy of the sheet from each time the desk starts
//   bulk-out/bot-state.json   what was made and sent, so nobody gets the same video twice
// bulk-out/ is git-ignored and stays on this computer.
//
// Options passed on to the bot: --base, --gap, --daily-limit, --batch, --batch-pause, --ahead, --country, --wish, --no-send, --out.
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateGreetingInput } from "../shared/greeting.ts";
import { CURATED_WISHES } from "../shared/wishes.ts";
import { normalizePhone } from "./lib/contacts.mjs";
import { Sheet, BOT_COLUMNS, CAPTION_COLUMN, DEFAULT_CAPTION, viewOf } from "./lib/sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- arguments ---------------------------------------------------------------
const opts = { from: "", port: "5300", base: "https://diwali2026.interioring.com", out: "bulk-out", country: "91", gap: "4-6", "daily-limit": "0", batch: "30", "batch-pause": "120", ahead: "40", wish: CURATED_WISHES.warm[0] };
let send = true;
let csvPath = join(homedir(), "Desktop", "diwali-contacts.csv");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--no-send") send = false;
  else if (a.startsWith("--")) {
    const key = a.slice(2);
    if (!(key in opts) || i + 1 >= argv.length) {
      console.error(`Unknown or incomplete option: ${a}\nUsage: node scripts/send-desk.mjs [contacts.csv] --from "Your name" [--port 5300] [--no-send]`);
      process.exit(1);
    }
    opts[key] = argv[++i];
  } else csvPath = a;
}
opts.base = opts.base.replace(/\/+$/, "");
const csv = resolve(csvPath);
if (!existsSync(csv)) {
  console.error(`Can't find ${csv}`);
  process.exit(1);
}
const outDir = resolve(ROOT, opts.out);
const port = Number(opts.port);

// --- the sheet: columns, refs, and a backup before anything changes ----------
const sheet = new Sheet(csv);
mkdirSync(join(outDir, "backups"), { recursive: true });
const now = new Date();
const localStamp = `${now.toLocaleDateString("en-CA")}-${now.toLocaleTimeString("en-GB", { hour12: false }).replaceAll(":", "")}`;
const backup = join(outDir, "backups", `${basename(csv, ".csv")}-${localStamp}.csv`);
copyFileSync(csv, backup);
sheet.prepare({ ...BOT_COLUMNS, ...CAPTION_COLUMN }, { refs: true });

// --- the bot, in the background ------------------------------------------------
const botArgs = [csv, "--base", opts.base, "--out", opts.out, "--country", opts.country, "--gap", opts.gap, "--daily-limit", opts["daily-limit"], "--batch", opts.batch, "--batch-pause", opts["batch-pause"], "--ahead", opts.ahead, "--wish", opts.wish];
if (opts.from) botArgs.push("--from", opts.from);
if (!send) botArgs.push("--no-send");
let bot = null;
let botExit = null;
const botLog = [];
function remember(line) {
  if (!line.trim()) return;
  botLog.push(line);
  if (botLog.length > 300) botLog.shift();
  console.log(`  bot │ ${line}`);
}
function startBot() {
  botExit = null;
  // Its own process group: Ctrl+C reaches only the desk, which passes it on once, so the
  // bot finishes the send in progress instead of quitting mid-upload.
  bot = spawn(process.execPath, [join(ROOT, "scripts", "greeting-bot.mjs"), ...botArgs], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
  for (const stream of [bot.stdout, bot.stderr]) {
    let partial = "";
    stream.on("data", (buf) => {
      const lines = (partial + buf.toString()).split("\n");
      partial = lines.pop();
      lines.forEach(remember);
    });
  }
  bot.on("exit", (code) => {
    botExit = code ?? 0;
    bot = null;
    remember(`The sender stopped${code ? ` (exit ${code})` : ""}.`);
  });
}

function botStatus() {
  try {
    const s = JSON.parse(readFileSync(join(outDir, "bot-status.json"), "utf8"));
    return bot && s.pid === bot.pid ? s : null;
  } catch {
    return null;
  }
}

// --- state for the page -----------------------------------------------------------
function contacts() {
  return sheet.rows().map((r) => {
    const p = normalizePhone(r.phone, opts.country);
    return {
      ref: r.ref,
      line: r.line,
      internal: r.internal,
      name: r.name,
      phone: r.phone,
      phoneOk: Boolean(p.phone),
      phoneProblem: p.problem,
      wish: r.wish,
      from: r.from,
      caption: r.caption,
      status: r.status.toLowerCase(),
      note: r.note,
      sent_at: r.sent_at,
      greeting_link: r.greeting_link,
      video_link: r.video_link,
    };
  });
}

/** Applies a decision inside the sheet lock, so it can't race the bot. */
function decide(body) {
  const { ref, action } = body;
  const current = botStatus()?.current?.ref;
  return sheet.mutate((t) => {
    const i = t.rows.findIndex((r, j) => j > 0 && (r[t.col.ref] ?? "").trim() === ref);
    if (i < 0) return { error: "That contact isn't in the sheet any more." };
    const row = viewOf(t.rows[i], t.col);
    const status = row.status.toLowerCase();
    const set = (patch) => {
      for (const [k, v] of Object.entries(patch)) {
        while (t.rows[i].length <= t.col[k]) t.rows[i].push("");
        t.rows[i][t.col[k]] = v;
      }
      return { changed: true, ok: true };
    };
    if (action === "send") {
      if (status === "sent") return { error: `Already sent${row.sent_at ? ` on ${row.sent_at}` : ""}.` };
      if ((status === "ready" || status === "working") && ref === current) return { error: "It's being sent right now." };
      const check = validateGreetingInput({ recipientName: body.name, message: body.wish, senderName: body.from, style: "warm", seed: 1 });
      if (!check.ok) return { error: check.error };
      const caption = String(body.caption ?? "").replace(/\r\n/g, "\n").trim();
      if (!caption) return { error: "The WhatsApp message is empty." };
      if (caption.length > 1000) return { error: "The WhatsApp message is too long (1000 characters at most)." };
      const v = check.value;
      return set({ name: v.recipientName, wish: v.message, from: v.senderName ?? "", caption, status: "ready", note: "" });
    }
    if (action === "skip") {
      if (status !== "" && !(status === "ready" && ref !== current)) return { error: `Can't skip: it's ${status}.` };
      return set({ status: "skipped", note: "" });
    }
    if (action === "unskip") return status === "skipped" ? set({ status: "", note: "" }) : { error: "It isn't skipped." };
    if (action === "cancel") {
      if (status !== "ready" || ref === current) return { error: "It can't be cancelled now." };
      return set({ status: "", note: "" });
    }
    return { error: "Unknown action." };
  });
}

// --- the server (this computer only) -----------------------------------------------------
const token = randomBytes(18).toString("base64url");
const page = () =>
  readFileSync(join(ROOT, "scripts", "lib", "desk.html"), "utf8").replace(
    "/*BOOT*/",
    `window.DESK = ${JSON.stringify({
      token,
      sheet: csv.replace(homedir(), "~"),
      outDir: outDir.replace(homedir(), "~"),
      from: opts.from,
      site: opts.base,
      wish: opts.wish,
      wishes: Object.values(CURATED_WISHES).flat(),
      caption: DEFAULT_CAPTION,
      send,
    }).replace(/</g, "\\u003c")};`,
  );

function reply(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Only this computer, by name: stops other websites reaching the desk through DNS tricks.
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? "")) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" });
      res.end(page());
      return;
    }
    if (!url.pathname.startsWith("/api/")) return reply(res, 404, { error: "Not found." });
    if (req.headers["x-desk-token"] !== token) return reply(res, 403, { error: "Reload the page." });
    if (url.pathname === "/api/state" && req.method === "GET") {
      return reply(res, 200, { contacts: contacts(), bot: { running: Boolean(bot), exitCode: botExit, status: botStatus(), log: botLog.slice(-60) } });
    }
    if (url.pathname === "/api/decide" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16_384) return reply(res, 413, { error: "Too much text." });
      }
      const result = decide(JSON.parse(raw || "{}"));
      return result?.error ? reply(res, 400, { error: result.error }) : reply(res, 200, { ok: true });
    }
    if (url.pathname === "/api/restart" && req.method === "POST") {
      if (!bot) startBot();
      return reply(res, 200, { ok: true });
    }
    reply(res, 404, { error: "Not found." });
  } catch (err) {
    reply(res, 500, { error: String(err?.message ?? err).split("\n")[0] });
  }
});

let closing = false;
process.on("SIGINT", () => {
  if (closing) {
    bot?.kill("SIGINT"); // a second Ctrl+C: the bot quits now too
    process.exit(130);
  }
  closing = true;
  console.log("\nStopping: the sender finishes what it's doing first. Press Ctrl+C again to quit now.");
  server.close();
  if (!bot) process.exit(0);
  bot.on("exit", () => process.exit(0));
  bot.kill("SIGINT");
});
process.on("exit", () => bot?.kill("SIGINT")); // never leave the sender running on its own

server.listen(port, "127.0.0.1", () => {
  console.log(`\nSend desk: http://localhost:${port}`);
  console.log(`Sheet:     ${csv}`);
  console.log(`Records:   ${join(outDir, "sent-log.csv")} (backup of the sheet: ${backup})`);
  console.log(send ? "WhatsApp:  a Chrome window opens for WhatsApp Web; scan the QR code the first time.\n" : "WhatsApp:  off (--no-send): videos and links only.\n");
  startBot();
});
