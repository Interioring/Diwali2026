/**
 * Browser, OS and device type from a User-Agent, coarse on purpose: enough to see
 * what people use, never enough to tell two people apart.
 */
export interface Agent {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  automated: boolean;
}

const AUTOMATED = /bot\b|crawl|spider|slurp|HeadlessChrome|Lighthouse|PhantomJS|Puppeteer|Playwright|preview|curl\/|wget|python-|node-fetch|undici|axios\//i;

const BROWSERS: Array<[RegExp, string]> = [
  [/Instagram/i, "Instagram app"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook app"],
  [/WhatsApp/i, "WhatsApp app"],
  [/LinkedInApp/i, "LinkedIn app"],
  [/Snapchat/i, "Snapchat app"],
  [/SamsungBrowser\//i, "Samsung Internet"],
  [/Edg(e|A|iOS)?\//i, "Edge"],
  [/OPR\/|Opera|OPiOS/i, "Opera"],
  [/Firefox\/|FxiOS/i, "Firefox"],
  [/MiuiBrowser|XiaoMi/i, "Mi Browser"],
  [/UCBrowser/i, "UC Browser"],
  [/CriOS\//i, "Chrome"],
  [/Chrome\/|Chromium/i, "Chrome"],
  [/Version\/[\d.]+.*Safari\//i, "Safari"],
];

const SYSTEMS: Array<[RegExp, string]> = [
  [/Windows NT/i, "Windows"],
  [/iPad/i, "iPadOS"],
  [/iPhone|iPod/i, "iOS"],
  [/Android/i, "Android"],
  [/CrOS/i, "ChromeOS"],
  [/Mac OS X|Macintosh/i, "macOS"],
  [/Linux/i, "Linux"],
];

/** `touchPoints` from the page fixes iPads, which say they are Macs. */
export function parseAgent(ua: string, touchPoints = 0): Agent {
  const text = ua ?? "";
  const browser = BROWSERS.find(([re]) => re.test(text))?.[1] ?? "Other";
  let os = SYSTEMS.find(([re]) => re.test(text))?.[1] ?? "Other";
  if (os === "macOS" && touchPoints > 1) os = "iPadOS";
  const tablet = os === "iPadOS" || /Tablet/i.test(text) || (/Android/i.test(text) && !/Mobile/i.test(text));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android/i.test(text);
  return { browser, os, device: tablet ? "tablet" : mobile ? "mobile" : "desktop", automated: AUTOMATED.test(text) };
}
