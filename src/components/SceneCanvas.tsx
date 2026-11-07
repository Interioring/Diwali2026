import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DURATION, GreetingRenderer, STAGE_SETTLE, STILL_FRAME, containRect, type Rect, type RenderMode, type SceneData } from "../greeting/renderer.ts";
import { loadGreetingFonts, prefersReducedMotion } from "../lib/fonts.ts";

interface Props {
  mode: RenderMode;
  data: SceneData;
  /**
   * Play mode: CSS px reserved at the bottom for actions; the 9:16 frame fits
   * above. When it grows (the actions arrive), the frame eases into its new place.
   */
  reserveBottom?: number;
  /** Stage mode: element whose box the kolam and name should occupy. */
  stageRef?: React.RefObject<HTMLElement | null>;
  /** Changing this restarts playback from t = 0. */
  playKey?: number;
  /** Changing this (to non-zero) jumps playback forward to `skipTo` seconds. */
  skipKey?: number;
  skipTo?: number;
  onTime?: (t: number) => void;
  className?: string;
  label: string;
}

const FEATHER =
  "linear-gradient(to right, transparent, #000 9%, #000 91%, transparent), linear-gradient(to bottom, #000 76%, transparent)";

function clearEasing(canvas: HTMLCanvasElement, backdrop: HTMLCanvasElement | null) {
  canvas.style.transition = "none";
  canvas.style.transform = "";
  for (const prefix of ["", "-webkit-"]) {
    canvas.style.removeProperty(`${prefix}mask-image`);
    canvas.style.removeProperty(`${prefix}mask-composite`);
  }
  if (backdrop) backdrop.style.opacity = "0";
}

/**
 * Full-bleed canvas behind the page: the floor extends to every edge while
 * the greeting itself is laid out in its frame.
 */
export function SceneCanvas({ mode, data, reserveBottom = 0, stageRef, playKey = 0, skipKey = 0, skipTo = 0, onTime, className = "", label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GreetingRenderer | null>(null);
  const startRef = useRef(0);
  const onTimeRef = useRef(onTime);
  const readyRef = useRef(false);
  const lastTRef = useRef(0);
  const dataRef = useRef(data);
  const backdropRef = useRef<HTMLCanvasElement>(null);
  // The reserve the canvas is actually laid out for; trails `reserveBottom`
  // by the length of the easing when the frame has to make room.
  const [appliedReserve, setAppliedReserve] = useState(reserveBottom);
  onTimeRef.current = onTime;
  dataRef.current = data;

  // Size to the viewport, at up to 2× device pixels.
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    // A finished easing hands over to the real layout in the same frame.
    clearEasing(canvas, backdropRef.current);
    const renderer = new GreetingRenderer(canvas, mode);
    rendererRef.current = renderer;
    let raf = 0;
    const layout = () => {
      const box = canvas.getBoundingClientRect();
      const cssW = box.width || window.innerWidth;
      const cssH = box.height || window.innerHeight;
      // A page-tall floor stays within a ~3.5 MP budget so phones keep up.
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.5e6 / (cssW * cssH)));
      const W = cssW * dpr;
      const H = cssH * dpr;
      let region: Rect | undefined;
      if (mode === "play") {
        const avail = { w: cssW, h: Math.max(240, cssH - appliedReserve) };
        const r = containRect(avail.w, avail.h, 9 / 16);
        region = { x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr };
      } else if (stageRef?.current) {
        const b = stageRef.current.getBoundingClientRect();
        region = { x: (b.left - box.left) * dpr, y: (b.top - box.top) * dpr, w: b.width * dpr, h: b.height * dpr };
      }
      renderer.resize(W, H, region);
      renderer.setData(dataRef.current);
      // Resizing clears the canvas; repaint the last frame (still frames never tick again).
      if (readyRef.current) renderer.draw(lastTRef.current);
    };
    layout();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };
    window.addEventListener("resize", onResize);
    // Web fonts and late layout can move the stage box; follow it.
    const ro = typeof ResizeObserver !== "undefined" && stageRef?.current ? new ResizeObserver(onResize) : null;
    if (ro && stageRef?.current) ro.observe(stageRef.current);
    if (ro && mode === "stage") ro.observe(canvas);
    void document.fonts?.ready.then(onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [mode, appliedReserve, stageRef]);

  // Making room for the actions: scale and lift the frame onto where the new
  // layout will put it, then lay it out for real. A blurred still of the floor
  // fills the edges the shrinking canvas uncovers meanwhile.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reserveBottom === appliedReserve) return;
    const ease = mode === "play" && reserveBottom > appliedReserve && readyRef.current && !prefersReducedMotion();
    if (!ease) {
      setAppliedReserve(reserveBottom);
      return;
    }
    const box = canvas.getBoundingClientRect();
    const w = box.width || window.innerWidth;
    const h = box.height || window.innerHeight;
    const from = containRect(w, Math.max(240, h - appliedReserve), 9 / 16);
    const to = containRect(w, Math.max(240, h - reserveBottom), 9 / 16);
    const k = to.w / from.w;
    const bd = backdropRef.current;
    if (bd) {
      bd.width = Math.max(2, Math.round(canvas.width / 8));
      bd.height = Math.max(2, Math.round(canvas.height / 8));
      bd.getContext("2d")?.drawImage(canvas, 0, 0, bd.width, bd.height);
      bd.style.opacity = "1";
    }
    canvas.style.transformOrigin = "0 0";
    canvas.style.transition = "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";
    // Feather the edges into the backdrop while the canvas is smaller than the screen.
    for (const prefix of ["", "-webkit-"]) {
      canvas.style.setProperty(`${prefix}mask-image`, FEATHER);
      canvas.style.setProperty(`${prefix}mask-composite`, prefix ? "source-in" : "intersect");
    }
    const raf = requestAnimationFrame(() => {
      canvas.style.transform = `translate(${to.x - k * from.x}px, ${to.y - k * from.y}px) scale(${k})`;
    });
    const done = setTimeout(() => setAppliedReserve(reserveBottom), 720);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      clearEasing(canvas, bd);
    };
  }, [reserveBottom, appliedReserve, mode]);

  useEffect(() => {
    rendererRef.current?.setData(data);
  }, [data]);

  // Animation loop.
  useEffect(() => {
    let raf = 0;
    let alive = true;
    const reduced = prefersReducedMotion();
    const paint = (t: number) => {
      lastTRef.current = t;
      rendererRef.current?.draw(t);
    };
    startRef.current = performance.now();
    readyRef.current = false;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    loadGreetingFonts(dataRef.current.recipientName).then(() => {
      if (!alive) return;
      readyRef.current = true;
      rendererRef.current?.setData({ ...dataRef.current });
      startRef.current = performance.now();
      // `?t=8.5` freezes one frame: used for review captures and the OG image.
      const frozen = Number(new URLSearchParams(window.location.search).get("t"));
      if (Number.isFinite(frozen) && frozen > 0) {
        paint(frozen);
        onTimeRef.current?.(frozen);
        return;
      }
      if (reduced) {
        // Still frames only: the composed greeting, then the sign-off.
        const settle = mode === "stage" ? STAGE_SETTLE : STILL_FRAME;
        paint(settle);
        onTimeRef.current?.(settle);
        if (mode === "play") {
          swapTimer = setTimeout(() => {
            if (!alive) return;
            paint(DURATION);
            onTimeRef.current?.(DURATION);
          }, 4500);
        }
        return;
      }
      let frame = 0;
      const tick = (now: number) => {
        if (!alive) return;
        const t = (now - startRef.current) / 1000;
        frame++;
        // After the build settles, only the flames move: draw at half rate.
        const settled = mode === "stage" ? t > STAGE_SETTLE : t > DURATION;
        if (!settled || frame % 2 === 0) paint(t);
        onTimeRef.current?.(t);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (swapTimer) clearTimeout(swapTimer);
    };
  }, [mode, playKey]);

  // Skip: move the clock's origin so the running loop continues from skipTo.
  useEffect(() => {
    if (!skipKey || !readyRef.current) return;
    if (prefersReducedMotion()) {
      rendererRef.current?.draw(DURATION);
      lastTRef.current = DURATION;
      onTimeRef.current?.(DURATION);
      return;
    }
    startRef.current = Math.min(startRef.current, performance.now() - skipTo * 1000);
  }, [skipKey, skipTo]);

  // In reduced motion, redraw still frames when text changes.
  useEffect(() => {
    if (!readyRef.current) return;
    const frozen = Number(new URLSearchParams(window.location.search).get("t"));
    if (!prefersReducedMotion() && !(frozen > 0)) return;
    rendererRef.current?.draw(lastTRef.current);
  }, [data, mode]);

  // Play fills the viewport and never scrolls. Stage sits at the top of a page
  // that scrolls, fading into the page's own unlit floor colour below.
  const position =
    mode === "play"
      ? "fixed inset-0 h-dvh w-full"
      : "absolute inset-0 h-full w-full";
  return (
    <>
      {mode === "play" && (
        <canvas
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 h-dvh w-full scale-110 opacity-0 [filter:blur(18px)]"
        />
      )}
      <canvas ref={canvasRef} role="img" aria-label={label} className={`pointer-events-none ${position} ${className}`} />
    </>
  );
}
