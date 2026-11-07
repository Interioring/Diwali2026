export function greetingUrl(id: string): string {
  return `${window.location.origin}/g/${id}`;
}

export function shareMessage(url: string): string {
  return `I made a little Diwali surprise for you! ✨\nOpen your personalized greeting: ${url}\nHappy Diwali!`;
}

export function whatsappHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage(url))}`;
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Returns false when the user dismissed the sheet or sharing is unavailable. */
export async function nativeShare(url: string): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    await navigator.share({ title: "A Diwali greeting for you", text: shareMessage(url).replace(url, "").trim(), url });
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: "Diwali 2026 greeting" });
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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

/** WhatsApp, Instagram, Facebook in-app browsers often block downloads. */
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);
}
