/**
 * The words that go out with the video, in one place: the site's "Copy message",
 * the greeting bot's WhatsApp caption and the send desk all use this.
 * The video carries the music, so it says what to do with it (the user's words, 8 Nov 2026).
 * {name} is the recipient; {site} is the site's address, tagged with who shared it.
 */
export const POST_MESSAGE =
  "Happy Diwali, {name}! 🪔\nI made this little Diwali film for you. Watch it, enjoy it, share it as your Status and post it on Instagram.\n\nMake one for your own family and friends, free: {site}";

export function postMessage(name: string, site: string): string {
  return POST_MESSAGE.replace("{name}", name).replace("{site}", site);
}

/** For someone who received a greeting and posts it themselves: their voice, not the sender's. */
export function recipientPostMessage(sender: string | undefined, site: string): string {
  const who = sender?.trim() ? `${sender.trim()} made this little Diwali film for me 🪔` : "This little Diwali film was made just for me 🪔";
  return `${who}\nMake one for your own family and friends, free: ${site}`;
}
