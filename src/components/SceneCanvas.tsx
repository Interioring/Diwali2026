import { useEffect, useLayoutEffect, useRef } from "react";
import { DURATION, GreetingRenderer, STAGE_SETTLE, STILL_FRAME, containRect, type Rect, type RenderMode, type SceneData } from "../greeting/renderer.ts";
import { loadGreetingFonts, prefersReducedMotion } from "../lib/fonts.ts";

interface Props {
  mode: RenderMode;
  data: SceneData;
  /** Play mode: CSS px reserved at the bottom for actions; the 9:16 frame fits above. */
  reserveBottom?: number;
  /** Stage mode: element whose box the kolam and name should occupy. */
  stageRef?: React.RefObject<HTMLElement | null>;
  /** Changing this restarts playback from t = 0. */
  playKey?: number;
  onTime?: (t: number) => void;
  className?: string;
  label: string;
}

/**
 * Full-bleed canvas behind the page: the floor extends to every edge while
 * the greeting itself is laid out in its frame.
 */
export function SceneCanvas({ mode, data, reserveBottom = 0, stageRef, playKey = 0, onTime, className = "", label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GreetingRenderer | null>(null);
  const startRef = useRef(0);
  const onTimeRef = useRef(onTime);
  const readyRef = useRef(false);
  const lastTRef = useRef(0);
  const dataRef = useRef(data);
  onTimeRef.current = onTime;
  dataRef.current = data;

  // Size to the viewport, at up to 2× device pixels.
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
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
        const avail = { w: cssW, h: Math.max(240, cssH - reserveBottom) };
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
  }, [mode, reserveBottom, stageRef]);

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
  return <canvas ref={canvasRef} role="img" aria-label={label} className={`pointer-events-none ${position} ${className}`} />;
}
