// Shared between the browser app and the Worker: limits, styles, validation.

export const WISH_STYLES = ["warm", "cheerful", "family", "playful"] as const;
export type WishStyle = (typeof WISH_STYLES)[number];

export const STYLE_LABELS: Record<WishStyle, string> = {
  warm: "Warm and traditional",
  cheerful: "Short and cheerful",
  family: "Family and togetherness",
  playful: "Light and a little techy",
};

export const LIMITS = {
  nameMax: 40,
  senderMax: 40,
  messageMax: 180,
} as const;

export interface GreetingInput {
  recipientName: string;
  message: string;
  style: WishStyle;
  seed: number;
  /** Optional sign-off name chosen by the sender. */
  senderName?: string;
}

export interface Greeting extends GreetingInput {
  id: string;
  createdAt: number;
}

/** Collapse whitespace, strip control and bidi-override characters. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F​‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function isWishStyle(value: unknown): value is WishStyle {
  return typeof value === "string" && (WISH_STYLES as readonly string[]).includes(value);
}

export type ValidationResult =
  | { ok: true; value: GreetingInput }
  | { ok: false; error: string };

export function validateGreetingInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  const rawName = typeof b.recipientName === "string" ? b.recipientName : "";
  const rawMessage = typeof b.message === "string" ? b.message : "";
  if (rawName.trim().length > LIMITS.nameMax) return { ok: false, error: `Name must be ${LIMITS.nameMax} characters or fewer.` };
  if (rawMessage.trim().length > LIMITS.messageMax) return { ok: false, error: `Wish must be ${LIMITS.messageMax} characters or fewer.` };
  const rawSender = typeof b.senderName === "string" ? b.senderName : "";
  if (rawSender.trim().length > LIMITS.senderMax) return { ok: false, error: `Your name must be ${LIMITS.senderMax} characters or fewer.` };
  const senderName = cleanText(rawSender, LIMITS.senderMax);
  const recipientName = cleanText(rawName, LIMITS.nameMax);
  const message = cleanText(rawMessage, LIMITS.messageMax);
  if (!recipientName) return { ok: false, error: "A recipient name is required." };
  if (!message) return { ok: false, error: "A wish is required." };
  const style = isWishStyle(b.style) ? b.style : "warm";
  const seedNum = typeof b.seed === "number" && Number.isFinite(b.seed) ? Math.floor(Math.abs(b.seed)) % 2147483647 : 1;
  return { ok: true, value: { recipientName, message, style, seed: seedNum, ...(senderName ? { senderName } : {}) } };
}

export const ID_PATTERN = /^[A-Za-z0-9]{12}$/;

/** The MP4's file name, the same on the page and from the Worker's /v/ links. */
export function videoFilename(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 30);
  return `diwali-2026${slug ? `-for-${slug}` : ""}.mp4`;
}
