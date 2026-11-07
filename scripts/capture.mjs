// Review captures: node scripts/capture.mjs <baseUrl> <outDir>
import { chromium } from "playwright-core";
const [base = "http://localhost:5199", out = ".impeccable/review"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", args: ["--enable-unsafe-webgpu"] });
const shots = JSON.parse(process.env.SHOTS ?? "[]");
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr ?? 2, isMobile: s.mobile ?? false, hasTouch: s.mobile ?? false });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text()); });
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await page.goto(base + s.path, { waitUntil: "networkidle" });
  if (s.type) { await page.fill(s.type.selector, s.type.text); }
  if (s.click) { await page.click(s.click); }
  if (s.scroll) { await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), s.scroll); }
  await page.waitForTimeout(s.wait ?? 1500);
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: s.full ?? false });
  console.log("saved", s.name);
  await ctx.close();
}
await browser.close();
