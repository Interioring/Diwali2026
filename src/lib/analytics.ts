/**
 * Aggregate, anonymous funnel counts only: an event name, counted per day.
 * Share events are recorded as initiated; the app cannot see a share complete.
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
  | "download_video";

const sent = new Set<EventName>();

export function track(name: EventName, opts: { once?: boolean } = {}) {
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
