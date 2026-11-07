import type { ButtonHTMLAttributes, ReactNode } from "react";
import { MARK_PATH } from "../greeting/brand.ts";

type Variant = "flame" | "powder" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-ui font-semibold transition-[transform,background-color,box-shadow,color,opacity] duration-200 ease-out select-none disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  // Flame gold is reserved for the one active action on screen.
  flame:
    "min-h-14 px-7 text-[1.06rem] bg-gold text-oxide-900 shadow-[0_10px_30px_-8px_rgba(255,170,60,0.55),0_2px_6px_rgba(20,6,2,0.4)] hover:bg-[#ffd47a] disabled:hover:bg-gold",
  powder:
    "min-h-12 px-5 text-[0.98rem] text-ink powder-ring bg-oxide-900/35 hover:bg-oxide-700/70 hover:text-powder",
  quiet: "min-h-11 px-3 text-[0.95rem] text-ink-dim hover:text-powder underline-offset-4 hover:underline",
};

export function Button({
  variant = "powder",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "powder",
  className = "",
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <a className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </a>
  );
}

/** The official Interioring mark, unaltered, in the current text colour. */
export function InterioringMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 133" className={className} aria-hidden="true" focusable="false">
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function MakerMark({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://www.interioring.com"
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1.5 text-[0.82rem] text-ink-faint hover:text-ink transition-colors ${className}`}
    >
      <InterioringMark className="h-[1.05rem] w-auto" />
      <span>
        Made with love by <span className="font-[760] tracking-tight [font-stretch:112%]">Interioring</span>
      </span>
    </a>
  );
}

/** Step numeral drawn as a pulli dot ring. */
export function StepNumber({ n, active = false }: { n: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-7 shrink-0 place-items-center rounded-full font-display text-[0.95rem] font-semibold leading-none ${
        active ? "text-gold [box-shadow:inset_0_0_0_1.5px_var(--color-gold)]" : "text-ink-dim powder-ring"
      }`}
    >
      {n}
    </span>
  );
}
