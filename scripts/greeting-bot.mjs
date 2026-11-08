#!/usr/bin/env node
// Watches a contacts CSV. For every row whose status is "ready" it:
//   1. creates the greeting on the site,
//   2. makes its MP4 (the site's own exporter, in a hidden Chrome),
//   3. uploads it to R2, served publicly at <site>/v/<id>.mp4 while the greeting is live,
//   4. if the row has a WhatsApp number, sends the video with a caption through
//      WhatsApp Web in a Chrome window you can watch,
//   5. writes what happened back into the CSV: status, greeting_link, video_link, sent_at, note.
//
//   node scripts/greeting-bot.mjs ~/Desktop/diwali-contacts.csv --from "Srini"
//
// Columns you fill: name, phone, wish, from, status (type "ready"), and optionally
// "internal name": your own label for the person (say "Hari Datta Varma" when the
// video says "Hari annaya"). It only appears in this sheet and the bot's log; it is
// never sent to the site or put in the video or caption.
// Columns it fills: status, greeting_link, video_link, sent_at, note, ref (leave ref alone).
// See scripts/greeting-bot.example.csv. Set a failed row back to "ready" to retry it.
//
// Options:
//   --from "Name"        Signs every video "With love, Name" unless the row has its own "from"
//   --wish "..."         Wish for rows with an empty wish
//   --caption "..."      The WhatsApp caption; {name} {link} {video} {from} {site} are filled in
//   --country 91         Country code for 10-digit numbers (default 91)
//   --gap 4-6            Seconds between WhatsApp sends, picked at random (default 4-6, about 5)
//   --daily-limit 0      Most WhatsApp sends per day; 0 means no limit (the default)
//   --batch 30           After this many sends, take a break (default 30)
//   --batch-pause 120    The break, in seconds (default 120)
//   --ahead 40           Make videos up to this many people ahead of the sending (default 40)
//   --no-send            Make videos and links only; never open WhatsApp
//   --once               Do the rows marked ready now, then exit (no watching)
//   --base URL           The site (default https://diwali2026.interioring.com; localhost uploads to local R2)
//   --bucket NAME        R2 bucket (default diwali2026-videos)
//   --out bulk-out       Where videos and the bot's memory are kept (private: has phone numbers)
//
// It never sends the same video to the same person twice, even if the CSV is
// reverted: what was sent is remembered in <out>/bot-state.json.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, appendFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateGreetingInput } from "../shared/greeting.ts";
import { CURATED_WISHES } from "../shared/wishes.ts";
import { toCsv, normalizePhone, createGreeting, sleep } from "./lib/contacts.mjs";
import { Sheet, BOT_COLUMNS, DEFAULT_CAPTION, fillTemplate as fill, newRef } from "./lib/sheet.mjs";
import { trackedUrl } from "../shared/links.ts";
import { VideoMaker } from "./lib/video.mjs";
import { WhatsApp, FakeWhatsApp, PROFILE_DIR } from "./lib/whatsapp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

// --- arguments ---------------------------------------------------------------
const opts = {
  from: "",
  wish: CURATED_WISHES.warm[0],
  caption: DEFAULT_CAPTION,
  country: "91",
  gap: "4-6",
  "daily-limit": "0",
  batch: "30",
  ahead: "40",
  "batch-pause": "120",
  base: "https://diwali2026.interioring.com",
  bucket: "diwali2026-videos",
  out: "bulk-out",
};
const flags = { send: true, once: false };
let csvPath = "";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") usage(0);
  else if (a === "--no-send") flags.send = false;
  else if (a === "--once") flags.once = true;
  else if (a.startsWith("--")) {
    const key = a.slice(2);
    if (!(key in opts) || i + 1 >= argv.length) usage(1, `Unknown or incomplete option: ${a}`);
    opts[key] = argv[++i];
  } else csvPath = a;
}
if (!csvPath) usage(1, "Give the contacts CSV file.");
opts.base = opts.base.replace(/\/+$/, "");
const [gapMin, gapMax] = opts.gap.split("-").map(Number);
const dailyLimit = Number(opts["daily-limit"]);
const batch = Math.max(1, Number(opts.batch) || 30);
const ahead = Math.max(1, Number(opts.ahead) || 40);
const batchPauseMs = Math.max(0, Number(opts["batch-pause"]) || 0) * 1000;
const pauseText = batchPauseMs >= 60_000 && batchPauseMs % 60_000 === 0 ? `${batchPauseMs / 60_000}-minute` : `${Math.round(batchPauseMs / 1000)}-second`;
if (!(gapMin >= 0 && gapMax >= gapMin) || !(dailyLimit >= 0)) usage(1, "--gap is like 8-20 and --daily-limit is a number (0 for none).");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(opts.base);

function usage(code, why) {
  if (why) console.error(`\n${why}\n`);
  console.log(`Usage: node scripts/greeting-bot.mjs contacts.csv [--from "Your name"] [--no-send] [--once] [--caption "..."] [--gap 4-6] [--batch 30] [--daily-limit 0] [--base URL]

Mark a row's status "ready" and it is made, uploaded and (with a phone number) sent on WhatsApp.
See the top of scripts/greeting-bot.mjs and scripts/greeting-bot.example.csv.`);
  process.exit(code);
}

// --- memory: what was made and sent, so nothing is sent twice -----------------
const outDir = resolve(ROOT, opts.out); // relative to the project, wherever it's run from
const videosDir = join(outDir, "videos");
mkdirSync(videosDir, { recursive: true });
const statePath = join(outDir, "bot-state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
state.jobs ??= {};
state.sentByDay ??= {};
// One video per name + wish + "From" (the user's request, 8 Nov 2026): two people both greeted
// as "Amma" with the same wish and sender share a greeting and its video. Each person still
// has their own job, so nobody gets it twice.
state.videos ??= {};
const videoKeyOf = (name, wish, from) => [name, wish, from ?? ""].join("|");
for (const job of Object.values(state.jobs)) {
  if (!job.id || !job.uploaded || !job.key) continue;
  const [name, , wish, from] = job.key.split("|");
  state.videos[videoKeyOf(name, wish, from)] ??= { id: job.id, withMusic: job.withMusic, uploaded: true, for: job.internal || job.name };
}
function saveState() {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

// One bot per output folder: two would race to send the same rows.
const lockPath = join(outDir, "bot.lock");
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, "utf8"));
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive) usage(1, `Another greeting bot is already running (process ${pid}). Stop it first.`);
}
writeFileSync(lockPath, String(process.pid));
process.on("exit", () => {
  try {
    unlinkSync(lockPath);
  } catch {}
});

// --- helpers ------------------------------------------------------------------
const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const log = (msg) => console.log(`${stamp()}  ${msg}`);
const localDay = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
const localWhen = () => `${localDay()} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
let stopping = false;
async function nap(ms) {
  const end = Date.now() + ms;
  while (!stopping && Date.now() < end) await sleep(Math.min(500, end - Date.now()));
}

// What the bot is doing right now, for scripts/send-desk.mjs to show.
const statusPath = join(outDir, "bot-status.json");
const status = { pid: process.pid, whatsapp: flags.send ? "opening" : "off", current: null, preparing: null, nextSendAt: 0, dailyLimit, batch, sentToday: 0, stopped: false };
function writeStatus(patch = {}) {
  Object.assign(status, patch, { sentToday: state.sentByDay[localDay()] ?? 0, updatedAt: Date.now() });
  try {
    writeFileSync(`${statusPath}.tmp`, JSON.stringify(status));
    renameSync(`${statusPath}.tmp`, statusPath);
  } catch {}
}

// Every outcome, one line each, never rewritten: the record of what was sent.
const sentLogPath = join(outDir, "sent-log.csv");
const SENT_LOG_HEADER = ["time", "result", "internal name", "name", "phone", "wish", "from", "whatsapp text", "greeting_link", "video_link", "note"];
function record(fields) {
  const line = SENT_LOG_HEADER.map((h) => fields[h] ?? "");
  appendFileSync(sentLogPath, toCsv(existsSync(sentLogPath) ? [line] : [SENT_LOG_HEADER, line]));
}

async function upload(job) {
  const wrangler = join(ROOT, "node_modules", ".bin", "wrangler");
  const args = ["r2", "object", "put", `${opts.bucket}/${job.id}.mp4`, "--file", job.file, "--content-type", "video/mp4", isLocal ? "--local" : "--remote"];
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await run(wrangler, args, { cwd: ROOT, timeout: 180_000 });
      return;
    } catch (err) {
      last = err;
      await sleep(3000);
    }
  }
  const detail = String(last?.stderr || last?.message || "").trim().split("\n").filter(Boolean).slice(-2).join(" ");
  throw new Error(`Upload to R2 failed: ${detail}`);
}

// --- the work -------------------------------------------------------------------
const sheet = new Sheet(resolve(csvPath));
writeStatus();
const videos = new VideoMaker(opts.base);
const whatsapp = !flags.send ? null : process.env.DIWALI_FAKE_WHATSAPP === "1" ? new FakeWhatsApp() : new WhatsApp({ errorsDir: join(outDir, "errors") });
let nextSendAt = 0;
let failuresInARow = 0;
const onQr = () => {
  writeStatus({ whatsapp: "scan" });
  log("Scan the QR code in the WhatsApp window: on your phone, WhatsApp → Settings → Linked devices → Link a device.");
};

// --- one person: what both workers need, worked out from their row ---------------------
function contextFor(v) {
  const input = { recipientName: v.name, message: v.wish || opts.wish, senderName: v.from || opts.from, style: "warm", seed: 1 };
  const check = validateGreetingInput(input);
  const { phone, problem } = normalizePhone(v.phone, opts.country);
  const key = [v.name, phone, input.message, input.senderName].join("|");
  // Same content as an earlier job: carry on with it. Otherwise keep the row's own ref
  // (the send desk tracks rows by it) unless an earlier, different job already uses it.
  let ref = v.ref && state.jobs[v.ref]?.key === key ? v.ref : "";
  if (!ref) ref = Object.entries(state.jobs).find(([, j]) => j.key === key)?.[0] ?? "";
  if (!ref) ref = v.ref && !state.jobs[v.ref] ? v.ref : newRef();
  const match = (x) =>
    !x.ref && /^(ready|working)$/i.test(x.status) && x.name === v.name && x.phone === v.phone && x.wish === v.wish && x.from === v.from;
  let where = v.ref;
  const set = (patch) => {
    const ok = sheet.update(where, where ? null : match, { ...patch, ref });
    if (ok) where = ref;
    return ok;
  };
  const who = `${v.name || "(no name)"} (${v.internal ? `${v.internal}, ` : ""}line ${v.line})`;
  const logRecord = (result, extra = {}) => {
    const id = state.jobs[ref]?.id;
    record({
      time: localWhen(),
      result,
      "internal name": v.internal,
      name: v.name,
      phone: phone ? `+${phone}` : v.phone,
      wish: input.message,
      from: input.senderName,
      ...(id ? { greeting_link: `${opts.base}/g/${id}`, video_link: `${opts.base}/v/${id}.mp4` } : {}),
      ...extra,
    });
  };
  if (!check.ok) {
    const why = v.name ? check.error : "The name column is empty: fill in how the video should address them.";
    set({ status: "failed", note: why });
    logRecord("failed", { note: why });
    log(`✗ ${who}: ${why}`);
    return null;
  }
  // The internal name isn't part of the key: editing it never makes or sends anything again.
  const job = (state.jobs[ref] ??= { key, name: check.value.recipientName, phone, createdAt: new Date().toISOString() });
  if (v.internal) job.internal = v.internal;
  const links = () => ({ greeting_link: `${opts.base}/g/${job.id}`, video_link: `${opts.base}/v/${job.id}.mp4` });
  if (job.sentAt) {
    set({ status: "sent", sent_at: job.sentAt, ...links(), note: "Already sent earlier, so not sent again." });
    return null;
  }
  return { v, input, check, phone, problem, ref, job, set, who, logRecord, links, wantsSend: Boolean(phone) && flags.send, rowRef: () => where };
}

// Rows waiting on the bot. "working" rows are ones a stopped run left half-done.
const queued = () => sheet.rows().filter((r) => (r.name || r.internal) && /^(ready|working)$/i.test(r.status));
// Made, uploaded, and (when it's going on WhatsApp) on this computer, ready to attach.
const isReady = (c) => Boolean(c.job.id && c.job.uploaded && (!c.wantsSend || (c.job.file && existsSync(c.job.file))));
// Videos made for people still waiting to send. Finished people (sent, not on WhatsApp, no
// number, failed) don't count, or a pile of them would stop the video maker for good.
const waitingJob = (j) => !j.sentAt && !j.outcome;
const madeAhead = () => Object.values(state.jobs).filter((j) => j.file && waitingJob(j) && existsSync(j.file)).length;
// Drop a finished person's local copy (the team's link is on R2; it's fetched again if ever
// needed), unless someone still waiting shares the same video.
function releaseFile(job) {
  const file = job.file;
  job.file = null;
  if (file && !Object.values(state.jobs).some((j) => j !== job && j.file === file && waitingJob(j))) {
    try {
      unlinkSync(file);
    } catch {}
  }
  saveState();
}
const limitReached = () => dailyLimit > 0 && (state.sentByDay[localDay()] ?? 0) >= dailyLimit;
const limitNote = `Today's limit of ${dailyLimit} sends is reached. Sends tomorrow, or restart with a higher --daily-limit.`;

// --- worker 1: make and upload the videos, ahead of the sending --------------------------
async function prepare(c) {
  const { v, check, job, set, who, links, logRecord } = c;
  writeStatus({ preparing: { ref: c.ref, name: v.name, internal: v.internal } });
  delete job.outcome; // queued again (a retry)
  set({ status: "working", note: "Making the video" });
  try {
    const videoKey = videoKeyOf(check.value.recipientName, check.value.message, check.value.senderName);
    const shared = state.videos[videoKey];
    if (!job.id && shared?.id) {
      Object.assign(job, { id: shared.id, uploaded: shared.uploaded, withMusic: shared.withMusic });
      log(`… ${who}: same name, wish and sender as ${shared.for}, so reusing that video`);
      saveState();
    }
    if (!job.id) {
      log(`… ${who}: creating the greeting`);
      job.id = await createGreeting(opts.base, { ...check.value, seed: Math.floor(Math.random() * 2147483646) + 1 }, { onWait: () => log("   pausing a minute: the site makes 12 greetings a minute") });
      saveState();
    }
    if ((!job.file || !existsSync(job.file)) && job.uploaded && c.wantsSend) {
      // Already on R2 (made for someone else, or deleted after sending): fetching it is quicker than remaking it.
      try {
        const res = await fetch(`${opts.base}/v/${job.id}.mp4`);
        if (res.ok) {
          const file = join(videosDir, `${job.id}.mp4`);
          writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          job.file = file;
          saveState();
        }
      } catch {}
    }
    if (!job.uploaded || ((!job.file || !existsSync(job.file)) && c.wantsSend)) {
      log(`… ${who}: making the video`);
      const file = join(videosDir, `${job.id}.mp4`);
      const { withMusic } = await videos.make(job.id, file);
      Object.assign(job, { file, withMusic });
      saveState();
    }
    if (!job.uploaded) {
      log(`… ${who}: uploading the video`);
      await upload(job);
      job.uploaded = true;
      saveState();
    }
    state.videos[videoKey] ??= { id: job.id, withMusic: job.withMusic, uploaded: true, for: v.internal || v.name };
    saveState();
    set(links());
    if (!c.wantsSend) {
      const why = !c.phone ? `${c.problem[0].toUpperCase()}${c.problem.slice(1)}: share the video link yourself.` : "Made with --no-send: not sent.";
      set({ status: "video ready", note: job.withMusic === false ? `${why} (Made without music.)` : why });
      logRecord("video ready", { note: why });
      log(`✓ ${who}: video ready ${links().video_link}`);
      job.outcome = "video ready";
      releaseFile(job);
      return;
    }
    set({ status: "ready", note: "Video made: sends in turn." });
    log(`✓ ${who}: video made, waiting its turn to send`);
  } catch (err) {
    saveState();
    const msg = String(err?.message ?? err).split("\n")[0].slice(0, 300);
    set({ status: "failed", note: `${msg} Set status to ready to try again.` });
    logRecord("failed", { note: msg });
    log(`✗ ${who}: ${msg}`);
    job.outcome = "failed";
    saveState();
  } finally {
    writeStatus({ preparing: null });
  }
}

async function prepareWorker() {
  while (!stopping) {
    let worked = false;
    try {
      if (madeAhead() < ahead) {
        for (const v of queued()) {
          if (stopping) break;
          const c = contextFor(v);
          if (!c || isReady(c)) continue;
          await prepare(c);
          worked = true;
          break; // re-read the sheet: the queue may have changed
        }
      }
    } catch (err) {
      log(`Couldn't read the CSV (${String(err?.message ?? err).split("\n")[0]}). Trying again.`);
    }
    if (!worked && flags.once) return;
    if (!worked) await nap(3000);
  }
}

// --- worker 2: send the finished videos on WhatsApp, in sheet order, paced ---------------
async function send(c) {
  const { v, input, check, phone, job, set, who, logRecord, links } = c;
  const step = (name) => writeStatus({ current: { ref: c.ref, name: v.name, internal: v.internal, step: name } });
  if (limitReached()) {
    set({ note: limitNote });
    return false;
  }
  try {
    const wait = nextSendAt - Date.now();
    if (wait > 0) {
      step("waiting");
      set({ note: status.onBreak ? `A ${pauseText} break after ${batch} sends: sends in about ${Math.ceil(wait / 1000)} s.` : `Sends in about ${Math.ceil(wait / 1000)} s.` });
      await nap(wait);
      if (stopping) return false;
      // Taken out of the queue while it waited?
      const now = sheet.rows().find((r) => r.ref === c.rowRef());
      if (!now || !/^(ready|working)$/i.test(now.status)) return false;
    }
    delete job.outcome;
    set({ status: "working", note: "" });
    if ((await whatsapp.loginState()) !== "in") {
      set({ note: "Waiting for WhatsApp Web sign-in." });
      await whatsapp.waitForLogin(onQr);
      writeStatus({ whatsapp: "in" });
    }
    step("sending");
    log(`… ${who}: sending on WhatsApp to +${phone}`);
    // Links in the message say they came from a direct send by this sender (utm_source/utm_sender).
    const caption = fill(v.caption || opts.caption, {
      name: check.value.recipientName,
      link: trackedUrl(links().greeting_link, "whatsapp_direct", input.senderName),
      video: links().video_link,
      from: input.senderName,
      site: trackedUrl(opts.base, "whatsapp_direct", input.senderName),
    });
    let result = await whatsapp.sendVideo(phone, job.file, caption);
    if (result.status === "logged-out") {
      set({ note: "Waiting for WhatsApp Web sign-in." });
      await whatsapp.waitForLogin(onQr);
      writeStatus({ whatsapp: "in" });
      result = await whatsapp.sendVideo(phone, job.file, caption);
    }
    if (result.status === "failed" && result.retryable && !stopping) {
      // WhatsApp never took it (a pop-up closed the chat, say): one more go is safe.
      log(`   ${who}: ${result.note.split(" /")[0]} Trying once more.`);
      await sleep(3000);
      result = await whatsapp.sendVideo(phone, job.file, caption);
    }
    nextSendAt = Date.now() + (gapMin + Math.random() * (gapMax - gapMin)) * 1000;
    writeStatus({ nextSendAt, onBreak: false });
    const sentText = { "whatsapp text": caption };

    if (result.status === "sent") {
      job.sentAt = localWhen();
      state.sentByDay[localDay()] = (state.sentByDay[localDay()] ?? 0) + 1;
      saveState();
      failuresInARow = 0;
      set({ status: "sent", sent_at: job.sentAt, note: result.note });
      logRecord("sent", { ...sentText, time: job.sentAt, note: result.note });
      log(`✓ ${who}: sent. Video ${links().video_link}`);
      const today = state.sentByDay[localDay()];
      if (batchPauseMs && today % batch === 0) {
        // Every `batch` sends, a longer rest; the video maker keeps going meanwhile.
        nextSendAt = Math.max(nextSendAt, Date.now() + batchPauseMs);
        writeStatus({ nextSendAt, onBreak: true });
        log(`   ${today} sent today: taking a ${pauseText} break (every ${batch} sends).`);
      }
      releaseFile(job);
    } else if (result.status === "not-on-whatsapp") {
      set({ status: "not on whatsapp", note: `${result.note} Share the video link instead.` });
      logRecord("not on whatsapp", { note: result.note });
      log(`✗ ${who}: +${phone} isn't on WhatsApp`);
      job.outcome = "not on whatsapp";
      releaseFile(job);
    } else {
      failuresInARow++;
      set({ status: "failed", note: `${result.note} Set status to ready to try again.` });
      logRecord("failed", { ...sentText, note: result.note });
      log(`✗ ${who}: ${result.note}`);
      job.outcome = "failed"; // keeps its video for a retry, but stops counting as "made ahead"
      saveState();
      if (failuresInARow >= 3) {
        log("Three WhatsApp sends failed in a row, so the bot has stopped. WhatsApp Web may have changed; check its window and the screenshots in " + join(outDir, "errors"));
        stopping = true;
      }
    }
  } catch (err) {
    saveState();
    const msg = String(err?.message ?? err).split("\n")[0].slice(0, 300);
    set({ status: "failed", note: `${msg} Set status to ready to try again.` });
    logRecord("failed", { note: msg });
    log(`✗ ${who}: ${msg}`);
    job.outcome = "failed";
    saveState();
  } finally {
    writeStatus({ current: null });
  }
  return true;
}

async function sendWorker() {
  while (!stopping) {
    let worked = false;
    try {
      for (const v of queued()) {
        if (stopping) break;
        const c = contextFor(v);
        if (!c || !c.wantsSend || !isReady(c)) continue;
        worked = await send(c);
        break; // re-read the sheet after each send
      }
    } catch (err) {
      log(`Couldn't read the CSV (${String(err?.message ?? err).split("\n")[0]}). Trying again.`);
    }
    if (!worked && flags.once) return;
    if (!worked) await nap(2000);
  }
}

async function shutdown(code = 0) {
  writeStatus({ stopped: true, current: null, preparing: null, whatsapp: "off" });
  await videos.close();
  await whatsapp?.close();
  try {
    unlinkSync(lockPath);
  } catch {}
  process.exit(code);
}
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  log("Stopping after the current step (press Ctrl+C again to quit now). Run the same command to carry on.");
});

// --- start ----------------------------------------------------------------------
try {
  const added = sheet.prepare();
  if (added.length) log(`Added the columns ${added.join(", ")} to ${csvPath}.`);
} catch (err) {
  console.error(`\n${err.message}\n`);
  await shutdown(1);
}
log(`Watching ${sheet.file}`);
log(
  `Site ${opts.base}${isLocal ? " (local R2)" : ""} · ${
    flags.send
      ? `WhatsApp sends ${opts.gap} s apart, a ${Math.round(batchPauseMs / 1000)} s break every ${batch}, ${dailyLimit > 0 ? `at most ${dailyLimit} a day` : "no daily limit"}; videos are made up to ${ahead} ahead`
      : "videos and links only, no WhatsApp"
  }`,
);
log(`Mark a row's status "ready" to send it. Editing in Excel? Save as CSV, and reopen the file to see the bot's updates.`);
// Videos start straight away, even while WhatsApp is still signing in.
const making = prepareWorker();
if (whatsapp) {
  log(`Opening WhatsApp Web (sign-in kept in ${PROFILE_DIR})`);
  await whatsapp.open();
  await whatsapp.waitForLogin(onQr);
  writeStatus({ whatsapp: "in" });
  log("WhatsApp Web is signed in.");
}
if (flags.once) {
  await making;
  if (whatsapp) await sendWorker();
} else {
  await Promise.all([making, whatsapp ? sendWorker() : null]);
}
await shutdown(0);
