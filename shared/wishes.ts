import type { WishStyle } from "./greeting.ts";

// Curated wishes, cycled by "Another wish". Faith-neutral on purpose, so a
// greeting suits a colleague or customer as well as family.
export const CURATED_WISHES: Record<WishStyle, string[]> = {
  warm: [
    "May every lamp you light this Diwali bring warmth to your home and peace to your heart.",
    "Wishing you a Diwali full of light, sweetness, and the people you love most.",
    "May this festival of lights fill your days with joy and your home with glow.",
    "Here's to a bright Diwali and a year that keeps shining long after the last diya.",
    "May your home be bright, your table full, and your heart light this Diwali.",
    "Sending you light, love, and every good thing the new season can hold.",
    "May the glow of every diya stay with you long after the festival ends.",
    "Wishing you quiet mornings, bright evenings, and a heart full of light this Diwali.",
    "May this Diwali light up every corner of your home and every day of your year.",
    "Sending warm wishes for a Diwali of peace, plenty, and gentle light.",
  ],
  cheerful: [
    "Happy Diwali! Light up, eat well, smile big.",
    "More light, more sweets, more laughs. Happy Diwali!",
    "Wishing you a sparkling Diwali and a sweet new start.",
    "Bright lamps, full plates, happy hearts. Happy Diwali!",
    "Here's to a Diwali as bright as you are.",
    "Shine on! Wishing you the happiest Diwali yet.",
    "Lights on, worries off. Happy Diwali!",
    "Sweets in hand, smiles all round. Happy Diwali!",
    "Glow big this Diwali. You deserve every sparkle.",
    "Wishing you a Diwali full of sparkle and second helpings!",
  ],
  family: [
    "May this Diwali gather everyone you love under one warm, glowing roof.",
    "Wishing your family a Diwali of long talks, shared sweets, and lamps lit together.",
    "May your home be full of voices, laughter, and light this Diwali.",
    "To the people who make home feel like home: a very happy Diwali.",
    "May every diya at your door welcome someone you love.",
    "Wishing you and your family a Diwali of togetherness and bright beginnings.",
    "Here's to full houses, shared sweets, and lamps lit together. Happy Diwali!",
    "Wishing your whole family a Diwali as warm as home.",
    "May this Diwali bring everyone home, and keep everyone close all year.",
    "May the laughter at your table be as bright as the lamps at your door.",
  ],
  playful: [
    "Compiling joy... 100%. Wishing you a bug-free, light-full Diwali!",
    "No errors, only light. Happy Diwali!",
    "Your Diwali build is ready: warmth, sweets, and zero downtime.",
    "Rendering a year of good things for you, at maximum brightness.",
    "May your lamps stay lit and your worries stay offline. Happy Diwali!",
    "Shipping you a little extra light this Diwali. Enjoy!",
    "Status: all lamps online. Happy Diwali!",
    "Diwali update installed: more light, more sweets, fewer worries.",
    "Deploying good vibes to your home. Happy Diwali!",
    "404: worries not found. Wishing you a bright Diwali!",
  ],
};

export function pickCurated(style: WishStyle, index: number): string {
  const list = CURATED_WISHES[style];
  return list[((index % list.length) + list.length) % list.length];
}
