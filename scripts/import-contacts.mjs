#!/usr/bin/env node
// Turns a contacts export (a name column as saved in your phone, and a phone column)
// into the greeting bot's sheet:
//
//   node scripts/import-contacts.mjs ~/Downloads/whatsapp-contacts.csv ~/Desktop/diwali-contacts.csv
//
// - The saved name ("Sankar Bava Friend") goes to "internal name", which is never sent.
// - "name", how the video greets them, gets a first guess ("Sankar Bava"): the first name
//   plus any family title you used (Mama, Uncle, Bava, Akka, Sir...), without the
//   workplace, town or class words. Check it before marking a row ready.
// - Phones are written as "+91 98765 43210". The spaces make Excel and Google Sheets keep
//   them as text, so they can't turn into 9.19E+11 when the sheet is saved.
// - Nobody is marked ready.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv, toCsv, findColumns, normalizePhone } from "./lib/contacts.mjs";

const [input, output, ...rest] = process.argv.slice(2);
const force = rest.includes("--force");
if (!input || !output) {
  console.log("Usage: node scripts/import-contacts.mjs contacts-export.csv diwali-contacts.csv [--force]");
  process.exit(1);
}
if (existsSync(resolve(output)) && !force) {
  console.error(`${output} already exists. Pass --force to replace it.`);
  process.exit(1);
}

// Words that say how you address someone: kept after the first name.
const TITLES = new Set(
  "mama mamayya mavaya mavayya mamaiah attaya attayya akkayya annagaru akkagaru uncle aunty auntie anna annaya annayya anni akka bava bavagaru garu sir madam mam ji bhai bhaiya didi babai pinni atha atta athayya vadina tata thatha ammamma nanamma peddamma chinnamma peddananna chinnanna nanna amma ayya mavayya maam swamy swami guruji"
    .split(" "),
);
// First words that are half of a two-word given name ("Sri Hari", "Sai Umesh").
const JOINERS = new Set("sri shri shree sai chinna pedda peda bala venkata siva shiva rama lakshmi".split(" "));
// Honorifics that come before a name.
const PREFIXES = new Set("dr dr. mr mr. mrs mrs. ms ms. prof prof.".split(" "));

const titleCase = (w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

function greetingName(saved) {
  const words = saved
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, " ") // emoji, symbols, digits
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && (words[i].length === 1 || PREFIXES.has(words[i].toLowerCase()))) i++; // initials, Dr
  const first = words[i];
  if (!first) return "";
  const parts = [titleCase(first)];
  if (JOINERS.has(first.toLowerCase()) && words[i + 1] && !TITLES.has(words[i + 1].toLowerCase())) parts.push(titleCase(words[++i]));
  const title = words.slice(i + 1).find((w) => TITLES.has(w.toLowerCase()));
  if (title) parts.push(titleCase(title));
  return parts.join(" ").slice(0, 40);
}

// Country codes with one or two digits (ITU E.164); every other code has three.
const CC1 = ["1", "7"];
const CC2 = "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split(" ");
function prettyPhone(digits) {
  if (digits.startsWith("91") && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  const cc = CC1.includes(digits[0]) ? digits[0] : CC2.includes(digits.slice(0, 2)) ? digits.slice(0, 2) : digits.slice(0, 3);
  return `+${cc} ${digits.slice(cc.length)}`;
}

const { rows } = parseCsv(readFileSync(resolve(input), "utf8"));
const col = findColumns(rows[0], {
  name: ["name", "full name", "display name", "contact name", "internal name"],
  phone: ["phone", "mobile", "number", "whatsapp", "phone number", "mobile number", "whatsapp number", "phone 1 - value"],
  wish: ["wish", "message"],
  from: ["from", "sender"],
});
if (col.name < 0 || col.phone < 0) {
  console.error(`Need a name column and a phone column. The header row has: ${rows[0].join(", ")}`);
  process.exit(1);
}

const out = [["internal name", "name", "phone", "wish", "from", "status", "greeting_link", "video_link", "sent_at", "note"]];
const stats = { people: 0, noName: 0, badPhone: 0, duplicate: 0 };
const seen = new Map();
for (const r of rows.slice(1)) {
  const saved = (r[col.name] ?? "").trim();
  const rawPhone = (r[col.phone] ?? "").trim();
  const { phone, problem } = normalizePhone(rawPhone);
  const notes = [];
  if (!saved) {
    stats.noName++;
    notes.push("No saved name: fill in name.");
  }
  if (problem) {
    stats.badPhone++;
    notes.push(`${problem[0].toUpperCase()}${problem.slice(1)}.`);
  }
  if (phone && seen.has(phone)) {
    stats.duplicate++;
    notes.push(`Same number as ${seen.get(phone) || "another row"}.`);
  }
  if (phone) seen.set(phone, saved);
  out.push([
    saved,
    greetingName(saved),
    phone ? prettyPhone(phone) : rawPhone,
    col.wish >= 0 ? (r[col.wish] ?? "").trim() : "",
    col.from >= 0 ? (r[col.from] ?? "").trim() : "",
    "",
    "",
    "",
    "",
    notes.join(" "),
  ]);
  stats.people++;
}
writeFileSync(resolve(output), toCsv(out, { bom: true }));
console.log(`Wrote ${stats.people} people to ${output}`);
console.log(`  no saved name: ${stats.noName} · number problems: ${stats.badPhone} · repeated numbers: ${stats.duplicate}`);
console.log(`  Nobody is marked ready. Check "name" (how the video greets them), then type ready in status.`);
