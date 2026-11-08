#!/usr/bin/env node
// Make a personal Diwali 2026 greeting for everyone in a contacts spreadsheet,
// then write a "send list" page: one click per person opens their WhatsApp Web
// chat with the message already typed. You press Enter yourself. WhatsApp bans
// automated sending from personal numbers, so the tool never sends for you.
//
//   node scripts/bulk-greetings.mjs contacts.csv --from "Srini"
//
// CSV columns (a header row, any order, any case):
//   name   required  Their name, as it is written in light (40 characters max)
//   phone  needed for one-click send. 10-digit numbers get +91; otherwise include the country code
//   wish   optional  This person's wish (180 characters max); empty uses --wish or the default
//   from   optional  Signs this one greeting instead of --from
//
// Options:
//   --from "Name"        Your name, shown as "With love, Name" (optional)
//   --wish "..."         Wish for rows with an empty wish column
//   --message "..."      The WhatsApp text; {name}, {link} and {from} are filled in
//   --country 91         Country code for 10-digit numbers (default 91)
//   --out bulk-out       Output folder (default ./bulk-out)
//   --base URL           Site to create greetings on (default https://diwali2026.interioring.com)
//
// Phone numbers stay on this computer: only names and wishes go to the server,
// exactly as when someone uses the website. Re-running skips people already
// done (bulk-out/greetings.json), so an interrupted run can simply be resumed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { validateGreetingInput, LIMITS } from "../shared/greeting.ts";
import { parseCsv, findColumns, normalizePhone, createGreeting } from "./lib/contacts.mjs";
import { trackedUrl } from "../shared/links.ts";
import { CURATED_WISHES } from "../shared/wishes.ts";

const DEFAULT_MESSAGE = "Happy Diwali, {name}! ✨\nI made a little Diwali greeting just for you: {link}";

// --- arguments ---------------------------------------------------------------
const argv = process.argv.slice(2);
const opts = { from: "", wish: CURATED_WISHES.warm[0], message: DEFAULT_MESSAGE, country: "91", out: "bulk-out", base: "https://diwali2026.interioring.com" };
let csvPath = "";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-h" || a === "--help") usage(0);
  if (a.startsWith("--")) {
    const key = a.slice(2);
    if (!(key in opts) || i + 1 >= argv.length) usage(1, `Unknown or incomplete option: ${a}`);
    opts[key] = argv[++i];
  } else csvPath = a;
}
if (!csvPath) usage(1, "Give the contacts CSV file.");
opts.base = opts.base.replace(/\/+$/, "");

function usage(code, why) {
  if (why) console.error(`\n${why}\n`);
  console.log(`Usage: node scripts/bulk-greetings.mjs contacts.csv [--from "Your name"] [--wish "..."] [--message "..."] [--country 91] [--out bulk-out] [--base URL]

CSV header row: name, phone, wish (optional), from (optional).
See scripts/contacts.example.csv.`);
  process.exit(code);
}

const csvFile = resolve(csvPath);
if (!existsSync(csvFile)) usage(1, `Can't find ${csvFile}`);
const table = parseCsv(readFileSync(csvFile, "utf8")).rows;
if (table.length < 2) usage(1, "The CSV needs a header row and at least one person.");
const col = findColumns(table[0]);
if (col.name < 0) usage(1, `No "name" column. The header row has: ${table[0].join(", ")}`);

// --- check every row before creating anything --------------------------------
const people = [];
const errors = [];
const warnings = [];
const seenPhones = new Map();
table.slice(1).forEach((cells, i) => {
  const line = i + 2;
  const get = (k) => (col[k] >= 0 ? (cells[col[k]] ?? "").trim() : "");
  const input = {
    recipientName: get("name"),
    message: get("wish") || opts.wish,
    senderName: get("from") || opts.from,
    style: "warm",
    seed: Math.floor(Math.random() * 2147483646) + 1,
  };
  const check = validateGreetingInput(input);
  if (!check.ok) {
    errors.push(`Line ${line} (${input.recipientName || "no name"}): ${check.error}`);
    return;
  }
  const { phone, problem } = normalizePhone(get("phone"), opts.country);
  if (problem) warnings.push(`Line ${line} (${check.value.recipientName}): ${problem}. Their row will have "Copy message" instead.`);
  if (phone && seenPhones.has(phone)) warnings.push(`Line ${line} (${check.value.recipientName}): same number as line ${seenPhones.get(phone)}.`);
  if (phone) seenPhones.set(phone, line);
  people.push({ line, phone, ...check.value });
});

if (errors.length) {
  console.error(`\nFix these rows first (nothing was created):\n  ${errors.join("\n  ")}\n`);
  console.error(`Limits: name ${LIMITS.nameMax}, wish ${LIMITS.messageMax}, from ${LIMITS.senderMax} characters.`);
  process.exit(1);
}
if (warnings.length) console.warn(`\nHeads up:\n  ${warnings.join("\n  ")}\n`);

// --- create the greetings (resumable) ----------------------------------------
const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const statePath = join(outDir, "greetings.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const keyOf = (p) => [p.recipientName, p.phone, p.message, p.senderName ?? ""].join("|");
console.log(`\nMaking ${people.length} greetings on ${opts.base}\n`);
let made = 0;
for (const [i, p] of people.entries()) {
  const key = keyOf(p);
  if (!state[key]) {
    try {
      state[key] = { id: await createGreeting(opts.base, p, { onWait: () => process.stdout.write("   (pausing a minute: the site allows 12 greetings a minute)\n") }) };
      made++;
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error(`\nStopped at ${p.recipientName} (line ${p.line}): ${err.message}\nRun the same command again to continue from here.`);
      process.exit(1);
    }
  }
  p.link = trackedUrl(`${opts.base}/g/${state[key].id}`, "whatsapp_direct", p.senderName);
  p.text = opts.message.replaceAll("{name}", p.recipientName).replaceAll("{link}", p.link).replaceAll("{from}", p.senderName ?? "");
  console.log(`  ${String(i + 1).padStart(3)}/${people.length}  ${p.recipientName.padEnd(24)} ${p.link}`);
}

// --- outputs ------------------------------------------------------------------
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
writeFileSync(
  join(outDir, "greetings.csv"),
  ["name,phone,link,whatsapp_text", ...people.map((p) => [p.recipientName, p.phone ? `+${p.phone}` : "", p.link, p.text].map(csvCell).join(","))].join("\n") + "\n",
);
const listId = Buffer.from(people.map((p) => p.link).join()).toString("base64").slice(-16);
writeFileSync(join(outDir, "send-list.html"), sendListHtml(people, listId));

console.log(`\nDone: ${made} new, ${people.length - made} already made.`);
console.log(`Open the send list:  open "${join(outDir, "send-list.html")}"`);
console.log(`Links and messages:  ${join(outDir, "greetings.csv")}`);
console.log(`Keep ${opts.out}/ private: it has your contacts' phone numbers.\n`);

function sendListHtml(list, id) {
  const data = JSON.stringify(
    list.map((p) => ({ name: p.recipientName, phone: p.phone, wish: p.message, link: p.link, text: p.text })),
  ).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Diwali greetings to send</title>
<style>
  :root { --bg:#1c0a06; --panel:#2b110a; --line:rgba(244,239,228,.16); --ink:#f3ece0; --dim:#d9c8b6; --faint:#b9a28e; --gold:#ffc95c; --ok:#7fd49b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font: 700 2rem/1.1 Georgia, serif; margin: 0 0 6px; }
  .lede { color: var(--dim); margin: 0 0 22px; max-width: 62ch; }
  .bar { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 14px 0; display:flex; gap:14px; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--line); }
  .count { font-variant-numeric: tabular-nums; color: var(--dim); }
  .count b { color: var(--ink); }
  button, a.btn { font: inherit; border: 0; border-radius: 999px; cursor: pointer; text-decoration: none; display:inline-flex; align-items:center; justify-content:center; min-height: 44px; padding: 0 18px; }
  .next { background: var(--gold); color: #1c0a06; font-weight: 650; min-height: 52px; padding: 0 26px; box-shadow: 0 8px 24px -10px rgba(255,170,60,.6); }
  .next:disabled { opacity:.5; cursor: default; }
  .quiet { background: transparent; color: var(--dim); box-shadow: inset 0 0 0 1.5px var(--line); }
  .quiet:hover { color: var(--ink); }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  ol { list-style: none; margin: 8px 0 0; padding: 0; }
  li { display:grid; grid-template-columns: 1fr auto; gap: 6px 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .who { font-weight: 650; }
  .who small { font-weight: 400; color: var(--faint); margin-left: 8px; font-variant-numeric: tabular-nums; }
  .wish { grid-column: 1; color: var(--dim); font-size: .92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acts { grid-row: 1 / span 2; grid-column: 2; display:flex; gap:8px; align-items:center; }
  .open { background: var(--ink); color: #1c0a06; font-weight: 600; }
  li.done .open { background: transparent; color: var(--ok); box-shadow: inset 0 0 0 1.5px rgba(127,212,155,.5); }
  li.done .who::after { content: "  ✓ opened"; color: var(--ok); font-weight: 500; font-size: .85rem; }
  li.done.copy .who::after { content: "  ✓ copied"; }
  .preview { color: var(--faint); font-size: .9rem; }
  .preview:hover { color: var(--ink); }
  .note { color: var(--faint); font-size: .88rem; margin-top: 24px; max-width: 70ch; }
  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color:#1c0a06; padding: 10px 18px; border-radius: 999px; font-weight: 600; opacity: 0; transition: opacity .2s; pointer-events:none; }
  .toast.on { opacity: 1; }
  @media (max-width: 600px) { li { grid-template-columns: 1fr; } .acts { grid-row: auto; grid-column: 1; } }
</style>
</head>
<body>
<main>
  <h1>Diwali greetings to send</h1>
  <p class="lede">Keep WhatsApp Web signed in. Each “Open chat” opens that person's chat in one WhatsApp Web tab with the message already typed. Press Enter there to send it, then come back here for the next one.</p>
  <div class="bar">
    <button class="next" id="next">Open next chat</button>
    <span class="count" id="count"></span>
    <button class="quiet" id="reset" type="button">Start over</button>
  </div>
  <ol id="list"></ol>
  <p class="note">This page only remembers which chats you opened, in this browser. It can't see whether you pressed Send. Rows marked “Copy message” have no usable phone number: copy the message and paste it into their chat yourself.</p>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
  const people = ${data};
  const KEY = "diwali2026-send-${id}";
  let opened = new Set();
  try { opened = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...opened])); } catch {} };
  const list = document.getElementById("list");
  const toast = (msg) => { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 1800); };
  const waUrl = (p) => "https://web.whatsapp.com/send?phone=" + p.phone + "&text=" + encodeURIComponent(p.text);
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
  function act(i) {
    const p = people[i];
    if (p.phone) window.open(waUrl(p), "diwali-whatsapp");
    else copy(p.text).then((ok) => toast(ok ? "Message copied for " + p.name : "Couldn't copy"));
    opened.add(i); save(); render();
  }
  function render() {
    list.innerHTML = "";
    people.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = (opened.has(i) ? "done " : "") + (p.phone ? "" : "copy");
      const who = document.createElement("div"); who.className = "who"; who.textContent = p.name;
      const num = document.createElement("small"); num.textContent = p.phone ? "+" + p.phone : "no number"; who.append(num);
      const wish = document.createElement("div"); wish.className = "wish"; wish.textContent = p.wish; wish.title = p.wish;
      const acts = document.createElement("div"); acts.className = "acts";
      const pv = document.createElement("a"); pv.className = "preview"; pv.href = p.link; pv.target = "_blank"; pv.rel = "noopener"; pv.textContent = "Preview";
      const b = document.createElement("button"); b.className = "btn open"; b.type = "button";
      b.textContent = p.phone ? (opened.has(i) ? "Open again" : "Open chat") : "Copy message";
      b.onclick = () => act(i);
      acts.append(pv, b); li.append(who, wish, acts); list.append(li);
    });
    const next = people.findIndex((_, i) => !opened.has(i));
    const btn = document.getElementById("next");
    btn.disabled = next < 0;
    btn.textContent = next < 0 ? "All done. Happy Diwali!" : "Open next: " + people[next].name;
    btn.onclick = () => next >= 0 && act(next);
    document.getElementById("count").innerHTML = "<b>" + opened.size + "</b> of " + people.length + " opened";
  }
  document.getElementById("reset").onclick = () => { opened.clear(); save(); render(); };
  render();
</script>
</body>
</html>
`;
}
