import { describe, expect, it } from "vitest";
import { parseAgent } from "../shared/agent.ts";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  instagram: "Mozilla/5.0 (Linux; Android 13; RMX3085) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 352.0.0.36.98 Android",
  samsungTablet: "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  headless: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
  whatsappPreview: "WhatsApp/2.23.20.0 A",
};

describe("parseAgent", () => {
  it("reads common phones and browsers", () => {
    expect(parseAgent(UA.androidChrome)).toMatchObject({ browser: "Chrome", os: "Android", device: "mobile", automated: false });
    expect(parseAgent(UA.iphoneSafari)).toMatchObject({ browser: "Safari", os: "iOS", device: "mobile" });
    expect(parseAgent(UA.iphoneChrome)).toMatchObject({ browser: "Chrome", os: "iOS", device: "mobile" });
    expect(parseAgent(UA.windowsEdge)).toMatchObject({ browser: "Edge", os: "Windows", device: "desktop" });
  });

  it("names in-app browsers and tablets", () => {
    expect(parseAgent(UA.instagram)).toMatchObject({ browser: "Instagram app", device: "mobile" });
    expect(parseAgent(UA.samsungTablet)).toMatchObject({ browser: "Samsung Internet", device: "tablet" });
    expect(parseAgent(UA.ipadAsMac, 5)).toMatchObject({ os: "iPadOS", device: "tablet" });
    expect(parseAgent(UA.ipadAsMac, 0)).toMatchObject({ os: "macOS", device: "desktop" });
  });

  it("flags automated clients", () => {
    expect(parseAgent(UA.headless).automated).toBe(true);
    expect(parseAgent(UA.whatsappPreview).browser).toBe("WhatsApp app");
  });
});
