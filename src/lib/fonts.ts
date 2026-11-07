/** Canvas text needs its faces loaded first, or it silently uses a fallback. */
export async function loadGreetingFonts(sample = ""): Promise<void> {
  if (!("fonts" in document)) return;
  const text = `Happy Diwali 2026 Interioring ${sample}`;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 100px "Eczar"', text),
        document.fonts.load('600 100px "Eczar"', text),
        document.fonts.load('420 48px "Anek Latin"', text),
        document.fonts.load('760 48px "Anek Latin"', "Interioring"),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // fall through with whatever loaded
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
