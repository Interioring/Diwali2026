/**
 * Two records, both anonymous:
 * - funnel events: an event name, counted per day. Share events are recorded as
 *   initiated; the app cannot see a share complete.
 * - page views (`recordVisit`): one row per view; the Worker adds coarse location and
 *   device and a daily-changing visitor hash. No IP, no cookies.
 * Automated browsers (webdriver) send neither, so the greeting bot doesn't count as usage.
 */
export type EventName =
  | "landing_view"
  | "create_start"
  | "greeting_created"
  | "recipient_view"
  | "recipient_create_start"
  | "create_another"
  | "send_back"
  | "export_started"
  | "export_completed"
  | "export_failed"
  | "share_whatsapp"
  | "share_native"
  | "share_copy"
  | "share_video"
  | "download_video"
  | "feedback_sent"
  | "share_post_message";

const sent = new Set<EventName>();

export function track(name: EventName, opts: { once?: boolean } = {}) {
  if (automated()) return;
  if (opts.once) {
    if (sent.has(name)) return;
    sent.add(name);
  }
  try {
    const body = JSON.stringify({ name });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", body);
    else void fetch("/api/events", { method: "POST", body, keepalive: true });
  } catch {
    // never block the experience on analytics
  }
}

function automated(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}

/** Browsers whose owner asked not to be tracked. */
function optedOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
  } catch {
    return false;
  }
}

let lastVisit = "";

/** One page view. Called once per page; repeat calls for the same path are ignored. */
export function recordVisit(page: "home" | "greeting", role?: "sender" | "recipient") {
  if (automated() || optedOut()) return;
  const key = `${page}:${location.pathname}`;
  if (key === lastVisit) return;
  lastVisit = key;
  try {
    const params = new URLSearchParams(location.search);
    const body = JSON.stringify({
      page,
      ...(role ? { role } : {}),
      ref: document.referrer || "",
      utm: params.get("utm_source") ?? "",
      sender: params.get("utm_sender") ?? "",
      lang: navigator.language || "",
      screen: `${screen.width}x${screen.height}`,
      touch: navigator.maxTouchPoints || 0,
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/visit", body);
    else void fetch("/api/visit", { method: "POST", body, keepalive: true });
  } catch {
    // never block the experience on analytics
  }
}
