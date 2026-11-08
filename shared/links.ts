/**
 * Every link we send out says who shared it (the user's request, 8 Nov 2026):
 * `utm_source` is the channel and `utm_sender` the sender's "With love" name as a slug.
 * The visit log stores both, so /stats can show which senders bring people in.
 *
 * Channels: whatsapp, copy, share (the page's buttons), whatsapp_direct (the greeting
 * bot and send desk), whatsapp_group (the desk's group message).
 */
export function senderSlug(name: string | undefined | null): string {
  return (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function trackedUrl(url: string, source: string, sender?: string | null): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  const slug = senderSlug(sender);
  if (slug) u.searchParams.set("utm_sender", slug);
  else u.searchParams.delete("utm_sender");
  return u.toString();
}
