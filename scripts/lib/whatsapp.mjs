// Sends a video with a caption through WhatsApp Web, in a Chrome window you can
// watch. You sign in once by scanning the QR code; the session is kept in
// ~/.diwali2026-whatsapp (outside the project, so it can't be committed).
//
// WhatsApp Web changes its markup now and then. As of 8 Nov 2026 (checked against the
// live page): the composer's paperclip is button[aria-label="Attach"], its menu has a
// "Photos & videos" menuitem that opens a file chooser, and the media editor (outside
// #main) has a "Type a message" caption box and a "Send 1 selected" button. Older hooks
// (data-icon names, a bare file input, dropping the file) stay as fallbacks.
import { chromium } from "playwright-core";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CHROME } from "./video.mjs";
import { sleep } from "./contacts.mjs";

export const PROFILE_DIR = join(homedir(), ".diwali2026-whatsapp");

// In-page: the conversation's message rows (old data-id rows, or role=row), newest last,
// and the names of the icons inside an element (svg <title>, data-icon, aria-label).
// WhatsApp draws ticks as inline SVGs named like "msg-dblcheck"; a clock means pending.
const PAGE_HELPERS = `
  window.__diwaliRows = () => {
    const main = document.querySelector("#main");
    if (!main) return [];
    return [...main.querySelectorAll('[data-id], [role="row"]')].filter((r) => !r.closest("footer") && !r.querySelector('[data-id], [role="row"]'));
  };
  window.__diwaliKey = (row) => (row ? row.getAttribute("data-id") || (row.innerText || "").trim().slice(0, 120) : "");
  window.__diwaliIcons = (el) => [
    ...[...el.querySelectorAll("svg title")].map((t) => t.textContent || ""),
    ...[...el.querySelectorAll("[data-icon]")].map((e) => e.getAttribute("data-icon") || ""),
    ...[...el.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") || ""),
  ].join(" ");
`;

const COMPOSER = '#main footer div[contenteditable="true"]';
const ATTACH = [
  '#main footer [data-icon="plus-rounded"]',
  '#main footer [data-icon="plus"]',
  '#main footer [data-icon="attach-menu-plus"]',
  '#main footer [data-icon="clip"]',
  '#main footer [aria-label="Attach"]',
  '#main footer [title="Attach"]',
].join(", ");
const MEDIA_INPUT = 'input[type="file"][accept*="video"]';
// The media editor's send button. The chat's own composer (in #main footer) never matches.
const SEND_BUTTON = ['[aria-label^="Send" i]', '[data-icon="send"]', '[data-icon="wds-ic-send-filled"]', '[data-icon="send-light"]']
  .map((sel) => `${sel}:not(#main footer *)`)
  .join(", ");
const CAPTION = 'div[contenteditable="true"][aria-label="Type a message"]:not(#main footer *), div[contenteditable="true"][aria-label*="caption" i]';

export class WhatsApp {
  constructor({ errorsDir }) {
    this.errorsDir = errorsDir;
    this.ctx = null;
    this.page = null;
  }

  async open() {
    mkdirSync(PROFILE_DIR, { recursive: true });
    this.ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: CHROME,
      headless: false,
      viewport: null,
      args: ["--window-size=1280,900"],
      // The bot stops itself on Ctrl+C, after any send in progress has finished.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    await this.ctx.addInitScript(PAGE_HELPERS);
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    await this.page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
  }

  async ensurePage() {
    if (!this.ctx || this.page?.isClosed()) {
      // The window was closed: open it again with the saved sign-in.
      await this.ctx?.close().catch(() => {});
      await this.open();
    }
  }

  /** "in", "qr" (needs scanning) or "loading". */
  async loginState() {
    return this.page
      .evaluate(() => {
        if (document.querySelector("#pane-side, #side")) return "in";
        if (document.querySelector("canvas[aria-label], div[data-ref] canvas, [data-ref]")) return "qr";
        return "loading";
      })
      .catch(() => "loading");
  }

  async waitForLogin(onQr) {
    await this.ensurePage();
    let told = false;
    for (;;) {
      const s = await this.loginState();
      if (s === "in") return;
      if (s === "qr" && !told) {
        told = true;
        onQr?.();
      }
      await sleep(2000);
    }
  }

  async screenshot(tag) {
    try {
      mkdirSync(this.errorsDir, { recursive: true });
      const path = join(this.errorsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${tag}.png`);
      await this.page.screenshot({ path });
      return path;
    } catch {
      return "";
    }
  }

  async openChat(phone) {
    await this.page.goto(`https://web.whatsapp.com/send?phone=${phone}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const s = await this.page
        .evaluate((composer) => {
          const shown = (el) => {
            const r = el?.getBoundingClientRect();
            return Boolean(r && r.width > 0 && r.height > 0);
          };
          if (shown(document.querySelector(composer))) return "chat";
          const popups = [...document.querySelectorAll('[data-animate-modal-popup="true"], div[role="dialog"]')].filter(shown);
          if (popups.some((p) => /invalid|not on whatsapp|isn.t on whatsapp/i.test(p.innerText))) return "invalid";
          if (!document.querySelector("#pane-side, #side") && document.querySelector("canvas[aria-label], div[data-ref] canvas")) return "logged-out";
          return "wait";
        }, COMPOSER)
        .catch(() => "wait");
      if (s !== "wait") return s;
      await sleep(1000);
    }
    return "timeout";
  }

  /** A key for the newest message row in the open chat ("" if none), to spot the new one after sending. */
  lastOutgoingId() {
    return this.page.evaluate(() => window.__diwaliKey(window.__diwaliRows().at(-1))).catch(() => "");
  }

  async attach(file) {
    // 1) Attach → "Photos & videos" → the file chooser, as a person would do it
    try {
      await this.page.locator(ATTACH).first().click({ timeout: 8_000 });
      const items = this.page.getByRole("menuitem");
      await items.first().waitFor({ timeout: 5_000 });
      const media = this.page.getByRole("menuitem", { name: /photo|video/i });
      const item = (await media.count()) ? media.first() : items.nth(1); // it's the second item in English
      const [chooser] = await Promise.all([this.page.waitForEvent("filechooser", { timeout: 8_000 }), item.click()]);
      if (!/video/.test((await chooser.element().getAttribute("accept")) ?? "")) throw new Error("not the media chooser");
      await chooser.setFiles(file);
      return true;
    } catch {
      await this.page.keyboard.press("Escape").catch(() => {});
    }
    // 2) an older layout: the menu's file input is already in the page
    try {
      await this.page.locator(ATTACH).first().click({ timeout: 8_000 });
      const input = this.page.locator(MEDIA_INPUT).first();
      await input.waitFor({ state: "attached", timeout: 5_000 });
      await input.setInputFiles(file);
      return true;
    } catch {
      await this.page.keyboard.press("Escape").catch(() => {});
    }
    // 3) drop the file onto the chat, which opens the same media editor
    try {
      const b64 = readFileSync(file).toString("base64");
      return await this.page.evaluate(async (data) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], "diwali-2026.mp4", { type: "video/mp4" }));
        const target = document.querySelector("#main");
        if (!target) return false;
        for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        return true;
      }, b64);
    } catch {
      return false;
    }
  }

  async typeLines(text) {
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      if (line) await this.page.keyboard.insertText(line);
      if (i < lines.length - 1) await this.page.keyboard.press("Shift+Enter");
    }
  }

  /** Focus the media editor's caption box. False if there isn't one to find. */
  async focusCaption() {
    const found = await this.page
      .evaluate((labelled) => {
        document.querySelectorAll("[data-diwali-caption]").forEach((el) => el.removeAttribute("data-diwali-caption"));
        const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const named = [...document.querySelectorAll(labelled)].filter(shown).at(-1);
        if (named) {
          named.setAttribute("data-diwali-caption", "1");
          return true;
        }
        const boxes = [...document.querySelectorAll('div[contenteditable="true"]')].filter((el) => {
          if (el.closest("#side, #pane-side, #main footer")) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const box = boxes.at(-1);
        if (!box) return false;
        box.setAttribute("data-diwali-caption", "1");
        return true;
      }, CAPTION)
      .catch(() => false);
    if (!found) return false;
    await this.page.click("[data-diwali-caption]").catch(() => {});
    return true;
  }

  async sendText(text) {
    await this.page.click(COMPOSER);
    await this.typeLines(text);
    await this.page.keyboard.press("Enter");
  }

  /**
   * Close the media editor without sending (Escape, then "Discard" if WhatsApp asks).
   * WhatsApp then moves the typed caption into the chat's box as a draft, so clear that too.
   */
  async discardEditor() {
    await this.page.keyboard.press("Escape").catch(() => {});
    await this.page.getByRole("button", { name: /discard/i }).click({ timeout: 3_000 }).catch(() => {});
    await sleep(800);
    await this.clearDraft();
  }

  async clearDraft() {
    const box = this.page.locator(COMPOSER);
    if (!(await box.innerText().catch(() => "")).trim()) return;
    await box.click().catch(() => {});
    await this.page.keyboard.press("Meta+A").catch(() => {});
    await this.page.keyboard.press("Backspace").catch(() => {});
  }

  /**
   * After the editor has closed: wait for the upload to finish before the chat is left,
   * so a slow upload is never cut off. "done" (a tick), "unconfirmed" (nothing uploading
   * any more, but no tick we can read) or "failed" (WhatsApp shows a retry).
   */
  async waitForUpload(beforeId, timeoutMs = 5 * 60_000) {
    const start = Date.now();
    let quietSince = 0;
    while (Date.now() - start < timeoutMs) {
      const s = await this.page
        .evaluate((before) => {
          const rows = window.__diwaliRows();
          const last = rows.at(-1);
          const fresh = last && window.__diwaliKey(last) !== before ? last : null;
          const main = document.querySelector("#main");
          if (!main) return { fresh: false, busy: true };
          const icons = window.__diwaliIcons(fresh ?? main);
          return {
            fresh: Boolean(fresh),
            busy: /msg-time|clock|pending|schedul|sending|upload/i.test(icons) || Boolean((fresh ?? main).querySelector('[role="progressbar"]')),
            tick: /check|tick|delivered|\bread\b|\bsent\b/i.test(icons),
            failed: /error|alert|failed|retry/i.test(fresh ? icons : ""),
          };
        }, beforeId)
        .catch(() => ({ fresh: false, busy: true }));
      if (s.failed) return "failed";
      if (s.fresh && s.tick && !s.busy) return "done";
      quietSince = s.busy ? 0 : quietSince || Date.now();
      // Nothing uploading for 8 s, and at least 20 s since sending: done, though without a tick we can read.
      if (quietSince && Date.now() - quietSince > 8_000 && Date.now() - start > 20_000) return "unconfirmed";
      await sleep(1500);
    }
    return "unconfirmed";
  }

  /** What the newest messages look like, for fixing the tick check if WhatsApp changes. */
  async recordLastRow(tag) {
    try {
      const info = await this.page.evaluate(() => {
        const rows = window.__diwaliRows();
        const strip = (html) => html.replace(/ class="[^"]*"/g, "").replace(/<path[^>]*>/g, "").slice(-4000);
        return {
          rows: rows.length,
          lastKeys: rows.slice(-3).map((r) => window.__diwaliKey(r).slice(0, 80)),
          lastIcons: rows.slice(-2).map((r) => window.__diwaliIcons(r)),
          lastHtml: rows.slice(-1).map((r) => strip(r.outerHTML)),
          mainIcons: window.__diwaliIcons(document.querySelector("#main") ?? document.body).slice(-1500),
        };
      });
      mkdirSync(this.errorsDir, { recursive: true });
      writeFileSync(join(this.errorsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${tag}.json`), JSON.stringify(info, null, 2));
    } catch {}
  }

  /**
   * Sends one video with its caption.
   * Returns { status: "sent" | "not-on-whatsapp" | "logged-out" | "failed", note }.
   * Once WhatsApp has taken the message it is never reported as failed, so a retry
   * can't send it twice.
   */
  async sendVideo(phone, file, caption) {
    await this.ensurePage();
    const chat = await this.openChat(phone);
    if (chat === "invalid") return { status: "not-on-whatsapp", note: "WhatsApp says this number isn't on WhatsApp." };
    if (chat === "logged-out") return { status: "logged-out", note: "WhatsApp Web is signed out." };
    // Failures before WhatsApp has taken the message are safe to try again ("retryable").
    if (chat !== "chat") return { status: "failed", retryable: true, note: `Couldn't open the chat. ${await this.screenshot("chat")}`.trim() };

    await sleep(1500); // let the chat settle
    const before = await this.lastOutgoingId();
    if (!(await this.attach(file))) return { status: "failed", retryable: true, note: `Couldn't attach the video. ${await this.screenshot("attach")}`.trim() };

    const send = this.page.locator(SEND_BUTTON).filter({ visible: true }).last();
    try {
      await send.waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      const shot = await this.screenshot("editor");
      await this.discardEditor();
      return { status: "failed", retryable: true, note: `The video editor didn't open. ${shot}`.trim() };
    }
    await sleep(1500); // WhatsApp makes the preview

    let captionInEditor = false;
    if (caption && (await this.focusCaption())) {
      await this.typeLines(caption);
      const typed = await this.page.locator("[data-diwali-caption]").innerText().catch(() => "");
      captionInEditor = typed.replace(/\s+/g, " ").includes(caption.split("\n")[0].slice(0, 12));
      if (!captionInEditor) {
        await this.page.keyboard.press("Meta+A").catch(() => {});
        await this.page.keyboard.press("Backspace").catch(() => {});
      }
    }
    await send.click().catch(async () => this.page.keyboard.press("Enter"));

    // The editor closes once WhatsApp has taken the message.
    const taken = await send.waitFor({ state: "hidden", timeout: 30_000 }).then(() => true, () => false);
    if (!taken) {
      const shot = await this.screenshot("send");
      await this.discardEditor();
      return { status: "failed", retryable: true, note: `WhatsApp didn't take the video. ${shot}`.trim() };
    }
    const upload = await this.waitForUpload(before);
    if (upload === "failed") {
      await this.recordLastRow("upload-failed");
      return { status: "failed", note: `WhatsApp shows the video as not sent (check the chat for a retry). ${await this.screenshot("upload")}`.trim() };
    }
    // Confirmed against the live page (8 Nov 2026): a delivered message's meta carries
    // aria-label "Delivered" and an svg titled "wds-ic-read". Keep a snapshot only when no tick shows.
    if (upload === "unconfirmed") await this.recordLastRow("unconfirmed");

    if (caption && !captionInEditor) {
      // Couldn't put the caption on the video: send it as its own message right after.
      const beforeText = await this.lastOutgoingId();
      await this.sendText(caption);
      await this.waitForUpload(beforeText, 60_000);
    }
    return { status: "sent", note: upload === "unconfirmed" ? "Sent; WhatsApp hadn't shown a tick yet, so check the chat." : "" };
  }

  async close() {
    await this.ctx?.close().catch(() => {});
  }
}

/**
 * A stand-in for testing the bot's pacing and queue without WhatsApp: DIWALI_FAKE_WHATSAPP=1.
 * Numbers ending 0000 are "not on WhatsApp"; everything else "sends" after a moment.
 */
export class FakeWhatsApp {
  async open() {}
  async waitForLogin() {}
  async loginState() {
    return "in";
  }
  async sendVideo(phone, file) {
    await sleep(700);
    if (!file) return { status: "failed", note: "no video file" };
    return phone.endsWith("0000") ? { status: "not-on-whatsapp", note: "WhatsApp says this number isn't on WhatsApp." } : { status: "sent", note: "" };
  }
  async close() {}
}
