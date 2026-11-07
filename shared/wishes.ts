import type { WishStyle } from "./greeting.ts";

// Curated wishes: the core journey never depends on AI. Faith-neutral on purpose,
// so a greeting suits a colleague or customer as well as family.
export const CURATED_WISHES: Record<WishStyle, string[]> = {
  warm: [
    "May every lamp you light this Diwali bring warmth to your home and peace to your heart.",
    "Wishing you a Diwali full of light, sweetness, and the people you love most.",
    "May this festival of lights fill your days with joy and your home with glow.",
    "Here's to a bright Diwali and a year that keeps shining long after the last diya.",
    "May your home be bright, your table full, and your heart light this Diwali.",
    "Sending you light, love, and every good thing the new season can hold.",
  ],
  cheerful: [
    "Happy Diwali! Light up, eat well, smile big.",
    "More light, more sweets, more laughs. Happy Diwali!",
    "Wishing you a sparkling Diwali and a sweet new start.",
    "Bright lamps, full plates, happy hearts. Happy Diwali!",
    "Here's to a Diwali as bright as you are.",
    "Shine on! Wishing you the happiest Diwali yet.",
  ],
  family: [
    "May this Diwali gather everyone you love under one warm, glowing roof.",
    "Wishing your family a Diwali of long talks, shared sweets, and lamps lit together.",
    "May your home be full of voices, laughter, and light this Diwali.",
    "To the people who make home feel like home: a very happy Diwali.",
    "May every diya at your door welcome someone you love.",
    "Wishing you and your family a Diwali of togetherness and bright beginnings.",
  ],
  playful: [
    "Compiling joy... 100%. Wishing you a bug-free, light-full Diwali!",
    "No errors, only light. Happy Diwali!",
    "Your Diwali build is ready: warmth, sweets, and zero downtime.",
    "Rendering a year of good things for you, at maximum brightness.",
    "May your lamps stay lit and your worries stay offline. Happy Diwali!",
    "Shipping you a little extra light this Diwali. Enjoy!",
  ],
};

export function pickCurated(style: WishStyle, index: number): string {
  const list = CURATED_WISHES[style];
  return list[((index % list.length) + list.length) % list.length];
}
