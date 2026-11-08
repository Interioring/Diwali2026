// The contacts sheet shared by scripts/greeting-bot.mjs and scripts/send-desk.mjs.
// Both processes write to the same CSV, so every change is read-modify-write under a
// cross-process lock, written atomically, and touches only the row it means to.
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { parseCsv, toCsv, findColumns, HEADERS } from "./contacts.mjs";

// The WhatsApp caption: the same words as the site's "Copy message" (shared/messages.ts).
export { POST_MESSAGE as DEFAULT_CAPTION } from "../../shared/messages.ts";

/** Fills {name}, {link}, {video}, {from}, {site}; unknown placeholders stay as they are. */
export const fillTemplate = (tpl, vars) => tpl.replaceAll("\\n", "\n").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export const BOT_COLUMNS = {
  status: ["status"],
  greeting_link: ["greeting_link", "greeting link"],
  video_link: ["video_link", "video link"],
  sent_at: ["sent_at", "sent at"],
  note: ["note", "notes"],
  ref: ["ref"],
};
// Yours only: never sent to the site, the video or WhatsApp.
export const PRIVATE_COLUMNS = { internal: ["internal name", "internal_name", "internal", "contact name", "saved as"] };
// This person's WhatsApp text; empty means the default caption.
export const CAPTION_COLUMN = { caption: ["caption", "whatsapp text", "whatsapp message"] };
export const ALL_COLUMNS = { ...HEADERS, ...PRIVATE_COLUMNS, ...CAPTION_COLUMN, ...BOT_COLUMNS };

export const viewOf = (cells, col) => Object.fromEntries(Object.keys(col).map((k) => [k, col[k] >= 0 ? (cells[col[k]] ?? "").trim() : ""]));
export const newRef = () => randomBytes(4).toString("hex");

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export class Sheet {
  constructor(file) {
    this.file = file;
    this.format = {};
    this.lock = join(tmpdir(), `diwali-sheet-${createHash("sha1").update(file).digest("hex").slice(0, 12)}.lock`);
  }

  read() {
    const parsed = parseCsv(readFileSync(this.file, "utf8"));
    if (!parsed.rows.length) throw new Error("The CSV is empty: it needs a header row.");
    this.format = { delim: parsed.delim, bom: parsed.bom, eol: parsed.eol };
    return { rows: parsed.rows, col: findColumns(parsed.rows[0], ALL_COLUMNS) };
  }

  /** Every row as an object: line, name, phone, wish, from, internal, caption, status, ... */
  rows() {
    const t = this.read();
    return t.rows.slice(1).map((cells, i) => ({ line: i + 2, ...viewOf(cells, t.col) }));
  }

  write(rows) {
    const width = Math.max(...rows.map((r) => r.length));
    const tmp = `${this.file}.tmp-${process.pid}`;
    writeFileSync(tmp, toCsv(rows.map((r) => [...r, ...Array(width - r.length).fill("")]), this.format));
    renameSync(tmp, this.file); // atomic: an editor never sees half a file
  }

  /** Runs read → change → write with no other process writing in between. */
  mutate(fn) {
    const start = Date.now();
    for (;;) {
      try {
        mkdirSync(this.lock); // atomic: only one process can create it
        break;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
        try {
          if (Date.now() - statSync(this.lock).mtimeMs > 15_000) rmdirSync(this.lock); // left by a crash
        } catch {}
        if (Date.now() - start > 15_000) throw new Error("The sheet stayed locked for 15 s.");
        pause(20);
      }
    }
    try {
      const t = this.read();
      const result = fn(t);
      if (result?.changed) this.write(t.rows);
      return result;
    } finally {
      try {
        rmdirSync(this.lock);
      } catch {}
    }
  }

  /** Adds the given columns if missing, and a ref to every row without one. */
  prepare(columns = BOT_COLUMNS, { refs = false } = {}) {
    return this.mutate((t) => {
      if (t.col.name < 0 && t.col.internal < 0) throw new Error(`No "name" column. The header row has: ${t.rows[0].join(", ")}`);
      const added = Object.keys(columns).filter((k) => t.col[k] < 0);
      for (const k of added) {
        t.rows[0].push(k);
        t.col[k] = t.rows[0].length - 1;
      }
      let changed = added.length > 0;
      if (refs) {
        for (const r of t.rows.slice(1)) {
          while (r.length <= t.col.ref) r.push("");
          if (!r[t.col.ref].trim()) {
            r[t.col.ref] = newRef();
            changed = true;
          }
        }
      }
      return { changed, added };
    }).added;
  }

  /**
   * Changes one row, found by `findRef` (or by `match` when it has no ref yet).
   * Returns false when the row is gone.
   */
  update(findRef, match, patch) {
    return (
      this.mutate((t) => {
        const rows = t.rows;
        let i = findRef && t.col.ref >= 0 ? rows.findIndex((r, j) => j > 0 && (r[t.col.ref] ?? "").trim() === findRef) : -1;
        if (i < 0 && match) i = rows.findIndex((r, j) => j > 0 && match(viewOf(r, t.col)));
        if (i < 0) return { changed: false, found: false };
        let changed = false;
        for (const [k, v] of Object.entries(patch)) {
          let c = t.col[k];
          if (c === undefined || c < 0) {
            rows[0].push(k);
            c = t.col[k] = rows[0].length - 1;
          }
          while (rows[i].length <= c) rows[i].push("");
          if (rows[i][c] !== v) {
            rows[i][c] = v;
            changed = true;
          }
        }
        return { changed, found: true };
      })?.found ?? false
    );
  }
}
