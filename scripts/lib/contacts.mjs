// Shared by scripts/bulk-greetings.mjs and scripts/greeting-bot.mjs:
// reading and writing contact CSVs, cleaning phone numbers, and creating greetings.

/** RFC 4180 CSV with a sniffed delimiter. Keeps what's needed to write the file back the same way. */
export function parseCsv(text) {
  const bom = text.startsWith("﻿");
  if (bom) text = text.slice(1);
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]).sort((x, y) => y[1] - x[1])[0][0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.filter((r) => r.some((c) => c.trim() !== "")), delim, bom, eol };
}

export function toCsv(rows, { delim = ",", bom = false, eol = "\n" } = {}) {
  const cell = (v) => {
    const s = String(v ?? "");
    return s.includes(delim) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return (bom ? "﻿" : "") + rows.map((r) => r.map(cell).join(delim)).join(eol) + eol;
}

export const HEADERS = {
  name: ["name", "recipient", "recipient name", "their name", "to"],
  phone: ["phone", "mobile", "number", "whatsapp", "phone number", "mobile number", "whatsapp number"],
  wish: ["wish", "message", "greeting"],
  from: ["from", "sender", "your name", "signed"],
};

/** Column index for each known field (-1 when absent), matched case-insensitively. */
export function findColumns(header, fields = HEADERS) {
  const norm = header.map((h) => h.trim().toLowerCase());
  return Object.fromEntries(Object.entries(fields).map(([k, names]) => [k, norm.findIndex((h) => names.includes(h))]));
}

/** Digits with country code (WhatsApp's form), or a reason the number can't be used. */
export function normalizePhone(raw, cc = "91") {
  const text = String(raw ?? "").trim();
  if (!text) return { phone: "", problem: "no phone number" };
  if (/e\+?\d/i.test(text)) return { phone: "", problem: `"${text}" was mangled by the spreadsheet (format the column as text)` };
  const international = text.startsWith("+") || text.startsWith("00");
  let digits = text.replace(/^00/, "").replace(/\D/g, "");
  if (!international) {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10) digits = cc + digits;
  }
  // With a + it's already international: Singapore or Denmark numbers are only 10 digits in all.
  if (digits.length < (international ? 8 : 11) || digits.length > 15) return { phone: "", problem: `"${text}" doesn't look like a WhatsApp number` };
  return { phone: digits, problem: "" };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST /api/greetings. Waits out the site's 12-a-minute limit. Returns the new id. */
export async function createGreeting(base, p, { onWait } = {}) {
  const body = JSON.stringify({
    recipientName: p.recipientName,
    message: p.message,
    style: p.style ?? "warm",
    seed: p.seed ?? Math.floor(Math.random() * 2147483646) + 1,
    ...(p.senderName ? { senderName: p.senderName } : {}),
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${base}/api/greetings`, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (res.status === 201) return (await res.json()).id;
    if (res.status === 429) {
      onWait?.();
      await sleep(61_000);
      continue;
    }
    const detail = await res.text().catch(() => "");
    throw new Error(`the site said ${res.status} ${detail.slice(0, 200)}`);
  }
  throw new Error("still rate-limited after several minutes");
}
