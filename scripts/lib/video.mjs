// Makes a greeting's MP4 the way a visitor does: opens /g/<id> in a hidden Chrome
// and presses "Download video". The site's own exporter renders it, so the file is
// identical to what the page gives people (same frames, same music).
import { chromium } from "playwright-core";

export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export class VideoMaker {
  constructor(base) {
    this.base = base;
    this.browser = null;
  }

  async make(id, outPath) {
    // Google Chrome, not Playwright's Chromium: it has the H.264 and AAC encoders.
    if (!this.browser?.isConnected()) this.browser = await chromium.launch({ executablePath: CHROME, headless: true, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
    const ctx = await this.browser.newContext({ acceptDownloads: true, viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
    // Desktop Chrome would offer the share sheet; make "Save video" a plain download.
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "canShare", { value: () => false, configurable: true }));
    const page = await ctx.newPage();
    try {
      // ?t=14 freezes the last frame, so the actions are there at once.
      await page.goto(`${this.base}/g/${id}?t=14`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.getByRole("button", { name: "Download video" }).click({ timeout: 30_000 });
      const save = page.getByRole("button", { name: "Save video" });
      const failed = page.getByRole("alert");
      await save.or(failed).first().waitFor({ timeout: 180_000 });
      if (await failed.isVisible()) throw new Error((await failed.innerText()).trim());
      const withMusic = await page.getByText("Music included").isVisible();
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), save.click()]);
      await download.saveAs(outPath);
      return { withMusic };
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }
}
