import { generateKolam, smoothLoop, type Kolam, type Polyline } from "./kolam.ts";
import { mulberry32 } from "./random.ts";
import { MARK_PATH, MARK_VIEWBOX } from "./brand.ts";

/**
 * One renderer, one timeline. `draw(t)` is a pure function of the greeting
 * data and time, so the live preview, the replay, and the exported video are
 * the same frames. All composition happens in a 1080×1920 logical frame.
 */

export const FRAME_W = 1080;
export const FRAME_H = 1920;
export const DURATION = 14;
/** Where the creator's live stage settles: kolam drawn, lamps lit. */
export const STAGE_SETTLE = 7.9;
/** A still frame with the whole greeting composed, for reduced motion. */
export const STILL_FRAME = 10.6;

export type RenderMode = "play" | "stage";

export interface SceneData {
  recipientName: string;
  message: string;
  seed: number;
  /** Optional: who it's from, signed at the bottom. */
  senderName?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const COLORS = {
  oxide: [134, 52, 33] as const,
  powder: "#f4efe4",
  gold: "#ffc95c",
  ink: "#f3ece0",
  petals: ["#e2457f", "#f4a930", "#43a86c"],
};

const FONT_DISPLAY = "Eczar, Georgia, serif";
const FONT_UI = '"Anek Latin", Eczar, system-ui, sans-serif';

/** The closing invitation. A video on someone's Status carries no link, so the address is spelled out. */
export const SITE_HOST = "diwali2026.interioring.com";
const INVITE_LINE = "Make a video like this for your family, friends or customers";
const INVITE_SITE = `Free at ${SITE_HOST}`;

// Timeline (seconds)
const T = {
  strike: [0.15, 0.95], // an ember falls to the first wick
  ignite: 0.95,
  lightFull: 2.3,
  dots: [1.0, 2.2], // the dots appear as the light reaches them
  line: [1.9, 6.3],
  petals: [5.5, 7.1],
  ripple: [5.5, 6.9],
  sideIgnite: [6.55, 6.9, 7.25, 7.6], // light runs out along the kolam to each lamp
  name: [7.7, 9.1], // a phuljhadi writes the name
  wish: [8.9, 10.0],
  sender: [9.9, 10.6],
  closing: [11.7, 12.8],
  camera: [0.3, 6.9],
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function makeCanvas(w: number, h: number): Canvas {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function ctx2d(c: Canvas): Ctx {
  const ctx = c.getContext("2d") as Ctx | null;
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

interface Lamp {
  x: number; // logical
  y: number;
  w: number;
  ignite: number;
  radius: number;
  strength: number;
  k: number;
  flame: number;
}

interface TextLines {
  lines: string[];
  size: number;
}

export class GreetingRenderer {
  private canvas: Canvas;
  private ctx: Ctx;
  private mode: RenderMode;
  private data: SceneData = { recipientName: "", message: "", seed: 1 };
  private kolam: Kolam = generateKolam(1);
  private W = 0;
  private H = 0;
  // logical → canvas: X = ox + x * s
  private s = 1;
  private ox = 0;
  private oy = 0;

  private floor: Canvas | null = null;
  private kolamFull: Canvas | null = null;
  private progress: Canvas | null = null;
  private progressDrawn = 0;
  private grains: Float32Array[] = [];
  private light: Canvas | null = null;
  private settled: Canvas | null = null;
  private petalSprites: Canvas[] = [];
  private polylines: Polyline[] = [];
  private markPath: Path2D | null = null;
  private lamps: Lamp[] = [];
  private kolamCenter = { x: 540, y: 760 };
  private kolamWidth = 940;
  private unit = 1;
  private nameText: TextLines | null = null;
  private wishText: TextLines | null = null;
  private closingText: TextLines | null = null;
  private senderText: { prefix: string; name: string; size: number } | null = null;
  /** Shown faintly where the name goes until one is typed; empty hides it. */
  stagePlaceholder = "";
  /** Draw the closing invitation (the site address). On in the exported video only. */
  showInvite = false;

  constructor(canvas: Canvas, mode: RenderMode) {
    this.canvas = canvas;
    this.ctx = ctx2d(canvas);
    this.mode = mode;
    try {
      this.markPath = new Path2D(MARK_PATH);
    } catch {
      this.markPath = null;
    }
  }

  setData(data: SceneData) {
    const seedChanged = data.seed !== this.data.seed || this.kolamFull === null;
    const textChanged =
      data.recipientName !== this.data.recipientName || data.message !== this.data.message || data.senderName !== this.data.senderName;
    this.data = { ...data };
    if (seedChanged) {
      this.kolam = generateKolam(data.seed);
      this.buildKolamAssets();
    }
    if (textChanged || seedChanged) this.layoutText();
  }

  /**
   * Size the renderer. In play mode `region` is the 9:16 frame (contain-fit by
   * default). In stage mode it is the box the kolam and name should occupy.
   */
  resize(width: number, height: number, region?: Rect) {
    const W = Math.max(2, Math.round(width));
    const H = Math.max(2, Math.round(height));
    this.canvas.width = W;
    this.canvas.height = H;
    this.W = W;
    this.H = H;

    if (this.mode === "play") {
      const r = region ?? containRect(W, H, FRAME_W / FRAME_H);
      this.s = r.w / FRAME_W;
      this.ox = r.x;
      this.oy = r.y;
    } else {
      // Stage box spans the kolam's top tip to the name line: logical y 270 → 1470.
      const r = region && region.w > 4 && region.h > 4 ? region : { x: 0, y: 0, w: W, h: H };
      const boxW = FRAME_W;
      const boxH = 1200;
      this.s = Math.min(r.w / boxW, r.h / boxH);
      this.ox = r.x + (r.w - boxW * this.s) / 2;
      this.oy = r.y + (r.h - boxH * this.s) / 2 - 270 * this.s;
    }

    this.floor = buildFloor(W, H, this.s, this.data.seed);
    this.progress = makeCanvas(W, H);
    this.light = makeCanvas(Math.ceil(W / 4), Math.ceil(H / 4));
    this.buildKolamAssets();
    this.layoutText();
  }

  private X(x: number) {
    return this.ox + x * this.s;
  }
  private Y(y: number) {
    return this.oy + y * this.s;
  }

  private buildKolamAssets() {
    if (!this.W) return;
    const { n } = this.kolam;
    this.unit = this.kolamWidth / (2 * n * Math.SQRT2);
    const u = this.unit;
    const cx = this.kolamCenter.x;
    const cy = this.kolamCenter.y;
    const map = (gx: number, gy: number): [number, number] => {
      const a = (gx - n) * u;
      const b = (gy - n) * u;
      return [this.X(cx + (a - b) / Math.SQRT2), this.Y(cy + (a + b) / Math.SQRT2)];
    };
    this.polylines = this.kolam.loops.map((loop) => smoothLoop(loop, map));

    // The main diya sits on the centre dot; four small ones stand just off the
    // kolam's four sides, lit one after another, clockwise from the top right.
    const off = this.kolamWidth * 0.25 + 72;
    this.lamps = [
      { x: cx, y: cy, w: 176, ignite: T.ignite, radius: 1150, strength: 1, k: 0.3, flame: 0.78 },
      { x: cx + off, y: cy - off, w: 92, ignite: T.sideIgnite[0], radius: 560, strength: 0.6, k: 1.7, flame: 0.66 },
      { x: cx + off, y: cy + off, w: 92, ignite: T.sideIgnite[1], radius: 560, strength: 0.6, k: 2.9, flame: 0.66 },
      { x: cx - off, y: cy + off, w: 92, ignite: T.sideIgnite[2], radius: 560, strength: 0.6, k: 4.1, flame: 0.66 },
      { x: cx - off, y: cy - off, w: 92, ignite: T.sideIgnite[3], radius: 560, strength: 0.6, k: 5.3, flame: 0.66 },
    ];

    // Powder grains along each line, placed once by arc length so a partly
    // drawn line and the finished line are made of the same grains.
    const rand = mulberry32(this.data.seed ^ 0x9e3779b9);
    const lw = 8.6 * this.s;
    this.grains = this.polylines.map((p) => {
      const count = Math.floor(p.length / (2.2 * this.s));
      const g = new Float32Array(count * 5);
      const ats = Array.from({ length: count }, () => rand() * p.length).sort((a, b) => a - b);
      for (let i = 0; i < count; i++) {
        const [gx, gy, nx, ny] = pointAt(p, ats[i]);
        const off = (rand() - 0.5) * lw * 2.6;
        g[i * 5] = ats[i];
        g[i * 5 + 1] = gx + nx * off;
        g[i * 5 + 2] = gy + ny * off;
        g[i * 5 + 3] = (0.5 + rand() * 1.1) * this.s;
        g[i * 5 + 4] = 0.25 + rand() * 0.55;
      }
      return g;
    });

    const full = makeCanvas(this.W, this.H);
    const fc = ctx2d(full);
    this.polylines.forEach((p, i) => this.drawLineRange(fc, i, 0, p.length));
    this.kolamFull = full;
    this.progressDrawn = 0;
    if (this.progress) ctx2d(this.progress).clearRect(0, 0, this.W, this.H);

    this.petalSprites = COLORS.petals.map((color, i) => buildPetal(color, u * this.s, this.data.seed + i * 17));
    this.settled = null;
  }

  /** Draw one kolam line between two arc lengths: powder spread, the pressed line, loose grains. */
  private drawLineRange(c: Ctx, index: number, from: number, to: number) {
    const p = this.polylines[index];
    if (to <= from) return;
    const lw = 8.6 * this.s;
    let i0 = 0;
    while (i0 < p.ls.length - 1 && p.ls[i0 + 1] <= from) i0++;
    const pts: Array<[number, number, number]> = [];
    const [fx, fy] = pointAt(p, from);
    pts.push([fx, fy, from]);
    for (let i = i0 + 1; i < p.ls.length && p.ls[i] < to; i++) pts.push([p.xs[i], p.ys[i], p.ls[i]]);
    const [tx, ty] = pointAt(p, to);
    pts.push([tx, ty, to]);

    c.lineJoin = "round";
    c.lineCap = "butt";
    c.strokeStyle = "rgba(244,239,228,0.16)";
    c.lineWidth = lw * 2.1;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
    c.stroke();

    c.lineCap = "round";
    c.strokeStyle = COLORS.powder;
    const chunk = 4;
    for (let k = 0; k < pts.length - 1; k += chunk) {
      const end = Math.min(k + chunk, pts.length - 1);
      c.lineWidth = lw * (0.82 + 0.3 * (0.5 + 0.5 * Math.sin(pts[k][2] / (61 * this.s) + this.data.seed)));
      c.beginPath();
      c.moveTo(pts[k][0], pts[k][1]);
      for (let j = k + 1; j <= end; j++) c.lineTo(pts[j][0], pts[j][1]);
      c.stroke();
    }

    const g = this.grains[index];
    for (let k = 0; k < g.length; k += 5) {
      const at = g[k];
      if (at < from) continue;
      if (at >= to) break;
      const r = g[k + 3];
      c.fillStyle = `rgba(246,241,231,${g[k + 4]})`;
      c.fillRect(g[k + 1] - r, g[k + 2] - r, r * 2, r * 2);
    }
  }

  private layoutText() {
    if (!this.W) return;
    const ctx = this.ctx;
    const name = this.data.recipientName.trim();
    ctx.save();
    if (name) {
      let size = 132;
      ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
      while (size > 76 && ctx.measureText(name).width > 920) {
        size -= 4;
        ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
      }
      this.nameText = ctx.measureText(name).width > 920 ? { lines: wrap(ctx, name, 920, 2), size } : { lines: [name], size };
    } else {
      this.nameText = null;
    }
    const msg = this.data.message.trim();
    if (msg) {
      let size = 50;
      let lines: string[] = [];
      for (; size >= 36; size -= 2) {
        ctx.font = `420 ${size}px ${FONT_UI}`;
        lines = wrap(ctx, msg, 880, 99);
        if (lines.length <= 3 || (size <= 38 && lines.length <= 4)) break;
      }
      // Balance the rag: the narrowest measure that keeps the same line count,
      // so no line ends on a lone word.
      for (let w = 840; w >= 600 && lines.length > 1; w -= 20) {
        const tighter = wrap(ctx, msg, w, 99);
        if (tighter.length !== lines.length) break;
        lines = tighter;
      }
      this.wishText = { lines: lines.slice(0, 4), size };
    } else {
      this.wishText = null;
    }
    const sender = (this.data.senderName ?? "").trim();
    if (sender) {
      let size = 42;
      ctx.font = `600 ${size}px ${FONT_UI}`;
      while (size > 28 && ctx.measureText(`With love, ${sender}`).width > 900) {
        size -= 2;
        ctx.font = `600 ${size}px ${FONT_UI}`;
      }
      this.senderText = { prefix: "With love, ", name: sender, size };
    } else {
      this.senderText = null;
    }
    ctx.font = `400 32px ${FONT_UI}`;
    this.closingText = { lines: wrap(ctx, "May your lives and homes shine brighter.", 900, 2), size: 32 };
    ctx.restore();
    this.settled = null;
  }

  /** Render the frame at time t (seconds). */
  draw(t: number) {
    const ctx = this.ctx;
    if (!this.floor || !this.kolamFull || !this.progress || !this.light) return;
    const stage = this.mode === "stage";
    const tb = stage ? Math.min(t, STAGE_SETTLE) : Math.min(t, DURATION);
    const W = this.W;
    const H = this.H;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // The camera: the film opens close on the first lamp and pulls back to
    // the whole threshold as the kolam is drawn. The words never move with it.
    if (!stage) {
      const e = 1 - easeInOut(seg(tb, T.camera[0], T.camera[1]));
      if (e > 0.0001) {
        const px = this.X(this.kolamCenter.x);
        const py = this.Y(this.kolamCenter.y - 40);
        ctx.translate(px, py);
        ctx.rotate(-0.045 * e);
        ctx.scale(1 + 0.5 * e, 1 + 0.5 * e);
        ctx.translate(-px, -py);
      }
    }

    // 1. The lit scene: floor, powder, petals, clay. Everything here is later
    // multiplied by the light it actually receives.
    if (tb >= T.petals[1] && this.settled) {
      ctx.drawImage(this.settled, 0, 0);
    } else {
      this.drawScene(ctx, tb);
      if (tb >= T.petals[1]) {
        const c = makeCanvas(W, H);
        this.drawScene(ctx2d(c), tb);
        this.settled = c;
      }
    }

    // 2. Light: ambient night plus each lamp's falloff, multiplied in.
    this.drawLightMap(t, tb);
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, W, H);

    // 3. Flames, their bloom, and reflections on the polished floor.
    ctx.globalCompositeOperation = "lighter";
    for (const lamp of this.lamps) this.drawGlow(ctx, lamp, t, tb);
    this.drawRipple(ctx, tb);
    ctx.globalCompositeOperation = "source-over";
    for (const lamp of this.lamps) this.drawFlame(ctx, lamp, t, tb);
    ctx.globalCompositeOperation = "lighter";
    this.drawEmbers(ctx, t, tb);
    this.drawRunners(ctx, tb);
    ctx.restore();

    // 4. Words.
    ctx.save();
    if (stage) this.drawStageText(ctx);
    else this.drawPlayText(ctx, t, tb);
    ctx.restore();
  }

  /** A soft ring of colour that washes outward as the petals bloom. */
  private drawRipple(c: Ctx, tb: number) {
    const q = seg(tb, T.ripple[0], T.ripple[1]);
    if (q <= 0 || q >= 1) return;
    const x = this.X(this.kolamCenter.x);
    const y = this.Y(this.kolamCenter.y);
    const r = this.kolamWidth * 0.78 * easeOut(q) * this.s;
    const band = 90 * this.s;
    const g = c.createRadialGradient(x, y, Math.max(0, r - band), x, y, r + band);
    const a = 0.32 * (1 - q);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, `rgba(255,150,120,${a})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r - band, y - r - band, (r + band) * 2, (r + band) * 2);
  }

  /** Points of light that travel to each wick before it catches. */
  private drawRunners(c: Ctx, tb: number) {
    const s = this.s;
    const cx = this.kolamCenter.x;
    const cy = this.kolamCenter.y;
    this.lamps.forEach((lamp, i) => {
      const start = i === 0 ? T.strike[0] : lamp.ignite - 0.5;
      const p = seg(tb, start, lamp.ignite);
      if (p <= 0 || p >= 1) return;
      const to = this.flameBase(lamp);
      let from: [number, number];
      let ctrl: [number, number];
      if (i === 0) {
        from = [this.X(cx + 40), this.Y(cy - 560)];
        ctrl = [this.X(cx + 260), this.Y(cy - 300)];
      } else {
        const dx = Math.sign(lamp.x - cx);
        const dy = Math.sign(lamp.y - cy);
        const q = this.kolamWidth / 4;
        from = [this.X(cx + dx * q), this.Y(cy + dy * q)];
        ctrl = [(from[0] + to.x) / 2 + dy * 40 * s, (from[1] + to.y) / 2 - 90 * s];
      }
      const pe = i === 0 ? p * p : easeInOut(p);
      const at = (u: number): [number, number] => {
        const v = 1 - u;
        return [v * v * from[0] + 2 * v * u * ctrl[0] + u * u * to.x, v * v * from[1] + 2 * v * u * ctrl[1] + u * u * to.y];
      };
      for (let k = 9; k >= 0; k--) {
        const u = pe - k * 0.028;
        if (u <= 0) continue;
        const [x, y] = at(u);
        const fade = 1 - k / 10;
        c.fillStyle = `rgba(255,${200 + k * 4},${120 + k * 8},${0.55 * fade})`;
        c.beginPath();
        c.arc(x, y, (5.5 - k * 0.42) * s, 0, Math.PI * 2);
        c.fill();
      }
      const [hx, hy] = at(pe);
      const g = c.createRadialGradient(hx, hy, 0, hx, hy, 46 * s);
      g.addColorStop(0, "rgba(255,248,225,0.95)");
      g.addColorStop(0.25, "rgba(255,196,110,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(hx - 46 * s, hy - 46 * s, 92 * s, 92 * s);
    });
  }

  /** Embers lifting off each lit flame. Pure in t: every ember is born on a schedule. */
  private drawEmbers(c: Ctx, t: number, tb: number) {
    const s = this.s;
    const life = 2.4;
    this.lamps.forEach((lamp, j) => {
      const rate = j === 0 ? 4.5 : 2;
      const lit = lamp.ignite + 0.3;
      if (tb < lit) return;
      const { x: fx, y: fy } = this.flameBase(lamp);
      const tipY = fy - lamp.w * lamp.flame * s * 0.85;
      const first = Math.max(Math.floor((t - life) * rate), Math.ceil(lit * rate));
      for (let i = first; i <= Math.floor(t * rate); i++) {
        const rnd = mulberry32(i * 131 + j * 977 + this.data.seed);
        const birth = i / rate + rnd() * (0.9 / rate);
        const age = t - birth;
        if (age < 0 || age > life) continue;
        const k = age / life;
        const x = fx + (rnd() - 0.5) * 12 * s + Math.sin(age * 2.2 + rnd() * 6) * 16 * s + (rnd() - 0.5) * 40 * s * age;
        const y = tipY - (70 + rnd() * 90) * s * age;
        const r = (1.4 + rnd() * 1.8) * s * (1 - k * 0.5);
        c.fillStyle = `rgba(255,${180 + Math.floor(rnd() * 60)},110,${0.85 * Math.pow(1 - k, 1.6)})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    });
  }

  private drawScene(c: Ctx, tb: number) {
    const s = this.s;
    c.globalCompositeOperation = "source-over";
    c.drawImage(this.floor!, 0, 0);

    // contact shadows sit on the floor, under the powder, warm not grey
    for (const lamp of this.lamps) {
      const x = this.X(lamp.x);
      const y = this.Y(lamp.y);
      const w = lamp.w * s;
      const sh = c.createRadialGradient(x + w * 0.05, y + w * 0.26, 0, x + w * 0.05, y + w * 0.26, w * 0.7);
      sh.addColorStop(0, "rgba(46,10,3,0.42)");
      sh.addColorStop(1, "rgba(46,10,3,0)");
      c.fillStyle = sh;
      c.beginPath();
      c.ellipse(x + w * 0.05, y + w * 0.26, w * 0.7, w * 0.18, 0, 0, Math.PI * 2);
      c.fill();
    }

    // pulli dots
    const { n, dots } = this.kolam;
    const u = this.unit;
    const cx = this.kolamCenter.x;
    const cy = this.kolamCenter.y;
    const maxRing = (n - 1) / 2;
    for (const d of dots) {
      const start = T.dots[0] + (d.ring / Math.max(1, maxRing)) * (T.dots[1] - T.dots[0] - 0.3);
      const p = seg(tb, start, start + 0.3);
      if (p <= 0) continue;
      const a = (d.x - n) * u;
      const b = (d.y - n) * u;
      const x = this.X(cx + (a - b) / Math.SQRT2);
      const y = this.Y(cy + (a + b) / Math.SQRT2);
      c.fillStyle = `rgba(246,241,231,${0.95 * p})`;
      c.beginPath();
      c.arc(x, y, 5.6 * s * easeOutBack(p), 0, Math.PI * 2);
      c.fill();
    }

    // the line
    const lp = easeInOut(seg(tb, T.line[0], T.line[1]));
    if (lp >= 1) {
      c.drawImage(this.kolamFull!, 0, 0);
    } else if (lp > 0) {
      // Draw only what is new since the last frame onto a kept layer; a jump
      // backwards (replay, scrubbing) starts the layer over.
      const pc = ctx2d(this.progress!);
      if (lp < this.progressDrawn) {
        pc.clearRect(0, 0, this.W, this.H);
        this.progressDrawn = 0;
      }
      this.polylines.forEach((p, i) => this.drawLineRange(pc, i, p.length * this.progressDrawn, p.length * lp));
      this.progressDrawn = lp;
      c.drawImage(this.progress!, 0, 0);
      // a pinch of powder falling at each line's head
      const frame = Math.floor(tb * 30);
      const rand = mulberry32(frame * 7919 + this.data.seed);
      for (const p of this.polylines) {
        const [hx, hy] = pointAt(p, p.length * lp);
        for (let g = 0; g < 7; g++) {
          const r = (0.8 + rand() * 1.6) * s;
          c.fillStyle = `rgba(250,246,238,${0.4 + rand() * 0.5})`;
          c.fillRect(hx + (rand() - 0.5) * 16 * s - r, hy + (rand() - 0.5) * 16 * s - r, r * 2, r * 2);
        }
      }
    }

    // powder petals: the inner ring all round, the outer ring on every other
    // dot, nothing between, so the line keeps the lead
    for (const d of dots) {
      const dxr = Math.abs(d.x - n) / 2;
      const dyr = Math.abs(d.y - n) / 2;
      const corner = dxr === dyr;
      const outer = d.ring === maxRing && maxRing > 1;
      const alt = ((d.x + d.y) / 2) % 2;
      if (outer && maxRing === 2) {
        // small kolam: leaf-green powder at the four outer corners only
        if (!corner) continue;
        const pd = seg(tb, T.petals[1] - 0.5, T.petals[1]);
        if (pd <= 0) continue;
        const a0 = (d.x - n) * u;
        const b0 = (d.y - n) * u;
        const leaf = this.petalSprites[2];
        const k = 0.58 * easeOut(pd);
        c.globalAlpha = pd;
        c.drawImage(
          leaf,
          this.X(cx + (a0 - b0) / Math.SQRT2) - (leaf.width * k) / 2,
          this.Y(cy + (a0 + b0) / Math.SQRT2) - (leaf.height * k) / 2,
          leaf.width * k,
          leaf.height * k,
        );
        c.globalAlpha = 1;
        continue;
      }
      if (d.ring === 0 || (d.ring !== 1 && !outer) || (outer && alt === 1)) continue;
      const start = T.petals[0] + ((d.ring - 1) / Math.max(1, maxRing)) * (T.petals[1] - T.petals[0] - 0.55);
      const p = seg(tb, start, start + 0.55);
      if (p <= 0) continue;
      const colour = d.ring === 1 ? (corner ? 1 : 0) : Math.abs((d.x - d.y) / 2) % 4 === 0 ? 0 : 2;
      const sprite = this.petalSprites[colour];
      const a = (d.x - n) * u;
      const b = (d.y - n) * u;
      const x = this.X(cx + (a - b) / Math.SQRT2);
      const y = this.Y(cy + (a + b) / Math.SQRT2);
      const sc = 0.35 + 0.65 * easeOut(p);
      c.globalAlpha = p;
      c.drawImage(sprite, x - (sprite.width * sc) / 2, y - (sprite.height * sc) / 2, sprite.width * sc, sprite.height * sc);
      c.globalAlpha = 1;
    }

    // clay diyas
    this.lamps.forEach((lamp, i) => drawDiyaBody(c, this.X(lamp.x), this.Y(lamp.y), lamp.w * s, this.data.seed + i * 101));
  }

  private lampLevel(lamp: Lamp, t: number, tb: number) {
    const rampEnd = lamp === this.lamps[0] ? T.lightFull : lamp.ignite + 0.7;
    const on = easeOut(seg(tb, lamp.ignite, rampEnd));
    const flicker = 1 + 0.05 * Math.sin(t * 13.1 + lamp.k) + 0.035 * Math.sin(t * 23.7 + lamp.k * 2) + 0.03 * Math.sin(t * 6.3 + lamp.k * 3);
    return on * flicker;
  }

  private drawLightMap(t: number, tb: number) {
    const lc = ctx2d(this.light!);
    const lw = this.light!.width;
    const lh = this.light!.height;
    const k = lw / this.W;
    const open = 0.55 + 0.45 * easeOut(seg(tb, 0, 0.9));
    const closingBoost = this.mode === "play" ? 1 + 0.12 * seg(tb, T.closing[0], T.closing[1]) : 1;
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = `rgb(${Math.round(74 * open)},${Math.round(64 * open)},${Math.round(82 * open)})`;
    lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = "lighter";
    // Warm light spilling from the open doorway behind the viewer, across the
    // bottom of the threshold: it carries the floor to every edge of the screen.
    const spill = 0.45 * easeOut(seg(tb, T.ignite, T.lightFull + 1)) * closingBoost;
    // The lamps' light carried across the whole floor, however wide the screen.
    const fill = 0.32 * this.lampLevel(this.lamps[0], t, tb) * closingBoost;
    if (fill > 0.001) {
      const fx = this.X(this.kolamCenter.x) * k;
      const fy = this.Y(this.kolamCenter.y) * k;
      const fr = Math.max(lw, lh) * 0.95;
      const fg = lc.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, `rgba(230,150,95,${0.55 * fill})`);
      fg.addColorStop(0.6, `rgba(170,90,55,${0.35 * fill})`);
      fg.addColorStop(1, `rgba(120,60,40,${0.18 * fill})`);
      lc.fillStyle = fg;
      lc.fillRect(0, 0, lw, lh);
    }
    if (spill > 0.001) {
      const sx = lw / 2;
      const sy = lh * 1.05;
      const sr = Math.max(lw, lh) * 0.85;
      const sg = lc.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, `rgba(255,190,120,${0.75 * spill})`);
      sg.addColorStop(0.45, `rgba(200,110,60,${0.38 * spill})`);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = sg;
      lc.fillRect(0, 0, lw, lh);
    }
    for (const lamp of this.lamps) {
      const I = this.lampLevel(lamp, t, tb) * lamp.strength * closingBoost;
      if (I <= 0.001) continue;
      const x = this.X(lamp.x) * k;
      const y = this.Y(lamp.y - lamp.w * 0.25) * k;
      const r = lamp.radius * this.s * k;
      const g = lc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,222,170,${Math.min(1, I)})`);
      g.addColorStop(0.12, `rgba(255,196,132,${0.9 * I})`);
      g.addColorStop(0.4, `rgba(226,140,84,${0.45 * I})`);
      g.addColorStop(0.7, `rgba(150,80,50,${0.16 * I})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = g;
      lc.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  private flameBase(lamp: Lamp) {
    return { x: this.X(lamp.x + lamp.w * 0.56), y: this.Y(lamp.y - lamp.w * 0.07) };
  }

  private drawGlow(c: Ctx, lamp: Lamp, t: number, tb: number) {
    const I = this.lampLevel(lamp, t, tb);
    if (I <= 0.001) return;
    const { x, y } = this.flameBase(lamp);
    const r = lamp.w * 1.05 * this.s;
    const fy = y - lamp.w * 0.32 * this.s;
    const g = c.createRadialGradient(x, fy, 0, x, fy, r);
    g.addColorStop(0, `rgba(255,186,96,${0.42 * I})`);
    g.addColorStop(0.35, `rgba(255,140,60,${0.14 * I})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r, fy - r, r * 2, r * 2);
    // reflection on the polished floor, below the bowl
    const ry = this.Y(lamp.y + lamp.w * 0.42);
    const rw = lamp.w * 0.1 * this.s;
    const rh = lamp.w * 0.75 * this.s;
    const rg = c.createLinearGradient(0, ry, 0, ry + rh);
    rg.addColorStop(0, `rgba(255,140,48,${0.3 * I})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = rg;
    c.beginPath();
    c.ellipse(this.X(lamp.x + lamp.w * 0.56), ry + rh / 2, rw, rh / 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  private drawFlame(c: Ctx, lamp: Lamp, t: number, tb: number) {
    const p = seg(tb, lamp.ignite, lamp.ignite + 0.55);
    if (p <= 0) return;
    const s = this.s;
    const { x, y } = this.flameBase(lamp);
    const grow = easeOutBack(p);
    const flick = 0.92 + 0.06 * Math.sin(t * 9.1 + lamp.k) + 0.04 * Math.sin(t * 17.3 + lamp.k * 1.7);
    const h = lamp.w * lamp.flame * s * grow * flick;
    const w = lamp.w * 0.2 * s * (0.6 + 0.4 * grow);
    const sway = (0.1 * Math.sin(t * 4.7 + lamp.k) + 0.06 * Math.sin(t * 10.9 + lamp.k * 2)) * h;
    const tipX = x + sway;
    const tipY = y - h;

    const shape = (scale: number) => {
      const hh = h * scale;
      const ww = w * scale;
      const tx = x + sway * scale;
      const ty = y - hh;
      c.beginPath();
      c.moveTo(x, y + ww * 0.35);
      c.bezierCurveTo(x - ww * 1.05, y + ww * 0.1, x - ww * 0.55, y - hh * 0.55, tx, ty);
      c.bezierCurveTo(x + ww * 0.55, y - hh * 0.55, x + ww * 1.05, y + ww * 0.1, x, y + ww * 0.35);
      c.closePath();
    };

    const g = c.createRadialGradient(x, y - h * 0.22, 0, x, y - h * 0.3, h * 0.85);
    g.addColorStop(0, "rgba(255,250,228,1)");
    g.addColorStop(0.3, "rgba(255,214,120,0.98)");
    g.addColorStop(0.65, "rgba(255,138,40,0.9)");
    g.addColorStop(1, "rgba(214,70,16,0.2)");
    shape(1);
    c.fillStyle = g;
    c.fill();
    shape(0.5);
    c.fillStyle = "rgba(255,253,240,0.95)";
    c.fill();
    // cool blue at the root of the flame
    c.fillStyle = "rgba(120,150,255,0.35)";
    c.beginPath();
    c.ellipse(x, y + w * 0.1, w * 0.45, w * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    // the spark of ignition
    if (p < 1) {
      const sp = 1 - p;
      c.fillStyle = `rgba(255,248,220,${sp})`;
      c.beginPath();
      c.arc(tipX, tipY, (2 + 6 * sp) * s, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawStageText(c: Ctx) {
    const y = this.Y(1420);
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    if (this.nameText) {
      const size = this.nameText.size;
      c.font = `700 ${size * this.s}px ${FONT_DISPLAY}`;
      c.fillStyle = COLORS.gold;
      const lines = this.nameText.lines;
      lines.forEach((line, i) => c.fillText(line, this.X(540), y + (i - (lines.length - 1)) * size * 0.95 * this.s));
    } else if (this.stagePlaceholder) {
      c.font = `600 ${104 * this.s}px ${FONT_DISPLAY}`;
      c.fillStyle = "rgba(243,236,224,0.22)";
      c.fillText(this.stagePlaceholder, this.X(540), y);
    }
  }

  /** Where the phuljhadi's tip is while writing the name, in canvas px. */
  private sparklerHead(c: Ctx, at: number): { x: number; y: number; line: number; written: number } | null {
    if (!this.nameText) return null;
    const w = seg(at, T.name[0], T.name[1]);
    if (w <= 0 || w >= 1) return null;
    const { lines, size } = this.nameText;
    const s = this.s;
    c.font = `700 ${size * s}px ${FONT_DISPLAY}`;
    const widths = lines.map((l) => c.measureText(l).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let dist = easeInOut(w) * total;
    const base = lines.length > 1 ? 1380 : 1430;
    for (let i = 0; i < lines.length; i++) {
      if (dist <= widths[i] || i === lines.length - 1) {
        const written = Math.min(dist, widths[i]);
        const left = this.X(540) - widths[i] / 2;
        const y = this.Y(base + i * size * 0.95) - size * s * (0.34 + 0.16 * Math.sin(written / (size * s * 0.18)));
        return { x: left + written, y, line: i, written };
      }
      dist -= widths[i];
    }
    return null;
  }

  private drawPlayText(c: Ctx, t: number, tb: number) {
    const s = this.s;
    const cp = easeOut(seg(tb, T.closing[0], T.closing[1]));
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    const shadow = (on: boolean) => {
      c.shadowColor = "rgba(20,6,2,0.55)";
      c.shadowBlur = on ? 14 * s : 0;
      c.shadowOffsetY = on ? 3 * s : 0;
    };

    // Opening title, so the film's first frame (and its thumbnail) already
    // says who it is for. It gives way as the first lamp catches.
    const title = 1 - easeOut(seg(tb, 0.7, 1.4));
    if (this.nameText && title > 0) {
      shadow(true);
      c.globalAlpha = title;
      c.font = `400 ${40 * s}px ${FONT_UI}`;
      c.fillStyle = "#d9c8b6";
      c.fillText("A Diwali greeting for", this.X(540), this.Y(1330));
      c.font = `600 ${Math.min(96, this.nameText.size * 0.8) * s}px ${FONT_DISPLAY}`;
      c.fillStyle = COLORS.powder;
      c.fillText(this.data.recipientName.trim(), this.X(540), this.Y(1430));
      c.globalAlpha = 1;
    }

    // Where everything rests in the sign-off: the gift first (name, wish,
    // signature), then "Happy Diwali 2026", the line and the lockup, smaller.
    // Each part eases from its place in the film to its place here, all
    // together, so nothing ever passes through anything else.
    const L = this.closingLayout();

    // The name: written in light by a phuljhadi, then kept as the headline.
    let wishTop = 1514;
    if (this.nameText && tb >= T.name[0]) {
      const { lines, size } = this.nameText;
      const base = lines.length > 1 ? 1380 : 1430;
      const writing = seg(tb, T.name[0], T.name[1]);
      if (writing < 1) {
        c.font = `700 ${size * s}px ${FONT_DISPLAY}`;
        const widths = lines.map((l) => c.measureText(l).width);
        const total = widths.reduce((a, b) => a + b, 0);
        let dist = easeInOut(writing) * total;
        lines.forEach((line, i) => {
          const written = Math.max(0, Math.min(dist, widths[i]));
          dist -= widths[i];
          if (written <= 0) return;
          const left = this.X(540) - widths[i] / 2;
          const y = this.Y(base + i * size * 0.95);
          const top = y - size * s * 1.05;
          const h = size * s * 1.45;
          c.save();
          c.beginPath();
          c.rect(left - 24 * s, top, written + 24 * s, h);
          c.clip();
          shadow(true);
          c.fillStyle = COLORS.gold;
          c.fillText(line, this.X(540), y);
          shadow(false);
          if (written < widths[i]) {
            const head = left + written;
            const hot = c.createLinearGradient(head - 190 * s, 0, head, 0);
            hot.addColorStop(0, "rgba(255,248,226,0)");
            hot.addColorStop(1, "rgba(255,252,238,1)");
            c.beginPath();
            c.rect(head - 190 * s, top, 190 * s, h);
            c.clip();
            c.fillStyle = hot;
            c.fillText(line, this.X(540), y);
          }
          c.restore();
        });
        this.drawSparkler(c, t, tb);
      } else {
        const sz = lerp(size, L.nameSize, cp);
        const y0 = lerp(base, L.nameBase, cp);
        shadow(true);
        c.font = `700 ${sz * s}px ${FONT_DISPLAY}`;
        c.fillStyle = COLORS.gold;
        lines.forEach((line, i) => c.fillText(line, this.X(540), this.Y(y0 + i * sz * 0.95)));
      }
      wishTop = base + (lines.length - 1) * size * 0.95 + 84;
    }

    // the wish, line by line; it stays to the end, because it is the gift
    shadow(true);
    let wishBottom = wishTop;
    if (this.wishText) {
      const { lines, size } = this.wishText;
      const sz = lerp(size, L.wishSize, cp);
      const y0 = lerp(wishTop, L.wishTop, cp);
      c.font = `420 ${sz * s}px ${FONT_UI}`;
      c.fillStyle = COLORS.ink;
      lines.forEach((line, i) => {
        const a = T.wish[0] + i * 0.24;
        const wp = easeOut(seg(tb, a, a + 0.75));
        if (wp <= 0) return;
        c.globalAlpha = wp * 0.94;
        c.fillText(line, this.X(540), this.Y(y0 + i * sz * 1.32 + (1 - wp) * 18));
      });
      c.globalAlpha = 1;
      wishBottom = wishTop + (lines.length - 1) * size * 1.32;
    }

    // signed by the sender, under the wish, in the film and the sign-off alike
    const sp = easeOut(seg(tb, T.sender[0], T.sender[1]));
    if (this.senderText && sp > 0) {
      const { prefix, name, size } = this.senderText;
      const sz = lerp(size, L.senderSize, cp);
      const restY = wishBottom + 92 + (1 - sp) * 14;
      const y = this.Y(lerp(restY, L.senderY, cp));
      c.globalAlpha = sp;
      c.font = `400 ${sz * s}px ${FONT_UI}`;
      const pw = c.measureText(prefix).width;
      c.font = `650 ${sz * s}px ${FONT_UI}`;
      const nw = c.measureText(name).width;
      const left = this.X(540) - (pw + nw) / 2;
      c.textAlign = "left";
      c.font = `400 ${sz * s}px ${FONT_UI}`;
      c.fillStyle = "#d9c8b6";
      c.fillText(prefix, left, y);
      c.font = `650 ${sz * s}px ${FONT_UI}`;
      c.fillStyle = COLORS.powder;
      c.fillText(name, left + pw, y);
      c.textAlign = "center";
      c.globalAlpha = 1;
    }

    // maker's mark, discreet, until the sign-off takes over
    shadow(false);
    const mm = easeOut(seg(tb, 1.2, 2.4)) * (1 - seg(tb, T.closing[0] - 0.1, T.closing[0] + 0.3));
    if (mm > 0) {
      c.globalAlpha = mm * 0.6;
      c.font = `500 ${27 * s}px ${FONT_UI}`;
      // In the video the footer also carries the address, so it's readable for most of the film.
      const label = this.showInvite ? `Made with love by Interioring · ${SITE_HOST}` : "Made with love by Interioring";
      const tw = c.measureText(label).width;
      const iconW = 34 * s;
      const gap = 10 * s;
      const total = iconW + gap + tw;
      const left = this.X(540) - total / 2;
      this.drawMark(c, left, this.Y(1872) - 27 * s, iconW, COLORS.ink);
      c.textAlign = "left";
      c.fillStyle = COLORS.ink;
      c.fillText(label, left + iconW + gap, this.Y(1872));
      c.textAlign = "center";
    }

    // the sign-off, smaller, once the gift has settled
    const bp = easeOut(seg(tb, T.closing[0] + 0.45, T.closing[1] + 0.45));
    if (bp > 0) {
      const lift = (1 - bp) * 20;
      shadow(true);
      c.globalAlpha = bp;
      c.font = `600 ${50 * s}px ${FONT_DISPLAY}`;
      c.fillStyle = COLORS.powder;
      c.fillText("Happy Diwali 2026", this.X(540), this.Y(L.hdY + lift));
      const ct = this.closingText!;
      c.font = `400 ${ct.size * s}px ${FONT_UI}`;
      c.fillStyle = COLORS.ink;
      ct.lines.forEach((line, i) => c.fillText(line, this.X(540), this.Y(L.taglineY + i * 42 + lift)));
      // Interioring lockup at maker's-mark scale: official mark + wordmark
      shadow(false);
      const lp = easeOut(seg(tb, T.closing[0] + 0.6, T.closing[1] + 0.6));
      c.globalAlpha = lp * 0.85;
      setWordmarkFont(c, 28 * s);
      const word = "Interioring";
      const ww = c.measureText(word).width;
      const iconW = 37 * s;
      const gap = 8 * s;
      const left = this.X(540) - (iconW + gap + ww) / 2;
      const baseY = this.Y(L.lockupY + (1 - lp) * 10);
      this.drawMark(c, left, baseY - 29 * s, iconW, COLORS.powder);
      c.textAlign = "left";
      c.fillStyle = COLORS.powder;
      c.fillText(word, left + iconW + gap, baseY);
      resetFontStretch(c);
      c.textAlign = "center";

      // In the video only: how to send one of your own. A video on someone's
      // Status carries no link; on the page, the button below does this job.
      const ip = this.showInvite ? easeOut(seg(tb, T.closing[0] + 0.6, T.closing[1] + 0.6)) : 0;
      if (ip > 0) {
        const y = L.inviteY + (1 - ip) * 10;
        shadow(true);
        c.globalAlpha = ip;
        c.font = `400 ${28 * s}px ${FONT_UI}`;
        c.fillStyle = "#d9c8b6";
        c.fillText(INVITE_LINE, this.X(540), this.Y(y));
        c.font = `650 ${34 * s}px ${FONT_UI}`;
        c.fillStyle = COLORS.powder;
        c.fillText(INVITE_SITE, this.X(540), this.Y(y + 44));
      }
    }
    c.globalAlpha = 1;
  }

  /**
   * The sign-off's resting layout, in frame units. The gift block (name, wish,
   * signature) starts just under the kolam's lowest loop (~y 1235) and scales
   * down, never below 70%, when it and the brand lines (plus the invitation, in
   * the video) would run past the foot of the frame.
   */
  private closingLayout() {
    const nameLines = this.nameText?.lines.length ?? 0;
    const wishLines = this.wishText?.lines.length ?? 0;
    const ctLines = this.closingText?.lines.length ?? 1;
    const name0 = this.nameText ? Math.min(this.nameText.size, nameLines > 1 ? 84 : 100) : 0;
    const wish0 = this.wishText ? Math.min(this.wishText.size, 42) : 0;
    const sender0 = this.senderText ? Math.min(this.senderText.size, 38) : 0;
    const TOP = 1268;
    // The video ends lower (it carries the invitation); the page keeps clear of its buttons.
    const MAX = this.showInvite ? 1872 : 1844;
    const place = (f: number) => {
      const nameSize = name0 * f;
      const wishSize = wish0 * f;
      const senderSize = sender0 * f;
      const nameBase = TOP + nameSize * 0.74;
      let y = nameLines ? nameBase + (nameLines - 1) * nameSize * 0.95 : TOP;
      const wishTop = y + (nameLines ? 74 * f : 40);
      if (wishLines) y = wishTop + (wishLines - 1) * wishSize * 1.32;
      const senderY = y + 64 * f;
      if (this.senderText) y = senderY;
      const hdY = y + 94;
      const taglineY = hdY + 46;
      const lockupY = taglineY + (ctLines - 1) * 42 + 60;
      const inviteY = lockupY + 58;
      const last = this.showInvite ? inviteY + 44 : lockupY;
      return { nameSize, nameBase, wishSize, wishTop, senderSize, senderY, hdY, taglineY, lockupY, inviteY, last, giftSpan: y - TOP };
    };
    const full = place(1);
    return full.last <= MAX ? full : place(Math.max(0.7, 1 - (full.last - MAX) / full.giftSpan));
  }

  /** The phuljhadi: a glowing tip on a wire, throwing sparks. Pure in t. */
  private drawSparkler(c: Ctx, t: number, tb: number) {
    const s = this.s;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    const rate = 260;
    const life = 0.46;
    const first = Math.ceil(T.name[0] * rate);
    const last = Math.floor(Math.min(tb, T.name[1]) * rate);
    c.lineCap = "round";
    for (let i = Math.max(first, Math.floor((tb - life) * rate)); i <= last; i++) {
      const birth = i / rate;
      const age = tb - birth;
      if (age < 0 || age > life) continue;
      const head = this.sparklerHead(c, birth);
      if (!head) continue;
      const rnd = mulberry32(i * 7349 + this.data.seed);
      const ang = rnd() * Math.PI * 2;
      const speed = (260 + rnd() * 640) * s;
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed;
      const g = 1100 * s;
      const x = head.x + vx * age;
      const y = head.y + vy * age + 0.5 * g * age * age;
      const tail = 0.03;
      const k = age / life;
      c.strokeStyle = `rgba(255,${226 - Math.floor(k * 60)},${170 - Math.floor(k * 90)},${0.95 * (1 - k)})`;
      c.lineWidth = (1.8 + rnd() * 2.2) * s;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - vx * tail, y - (vy + g * age) * tail);
      c.stroke();
    }
    const head = this.sparklerHead(c, tb);
    if (head) {
      // the wire, held from below right
      c.globalCompositeOperation = "source-over";
      const wire = c.createLinearGradient(head.x, head.y, head.x + 120 * s, head.y + 200 * s);
      wire.addColorStop(0, "rgba(255,180,90,0.9)");
      wire.addColorStop(0.18, "rgba(120,100,90,0.85)");
      wire.addColorStop(1, "rgba(90,80,76,0)");
      c.strokeStyle = wire;
      c.lineWidth = 3 * s;
      c.beginPath();
      c.moveTo(head.x, head.y);
      c.lineTo(head.x + 120 * s, head.y + 200 * s);
      c.stroke();
      c.globalCompositeOperation = "lighter";
      const flick = 0.85 + 0.15 * Math.sin(t * 61);
      const R = 130 * s;
      const gl = c.createRadialGradient(head.x, head.y, 0, head.x, head.y, R);
      gl.addColorStop(0, `rgba(255,252,240,${flick})`);
      gl.addColorStop(0.1, `rgba(255,236,190,${0.85 * flick})`);
      gl.addColorStop(0.3, `rgba(255,190,110,${0.3 * flick})`);
      gl.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gl;
      c.fillRect(head.x - R, head.y - R, R * 2, R * 2);
    }
    c.restore();
  }

  /** The official mark, scaled to `width`, top-left at (x, y). */
  private drawMark(c: Ctx, x: number, y: number, width: number, color: string) {
    if (!this.markPath) return;
    const k = width / MARK_VIEWBOX.w;
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = color;
    c.fill(this.markPath);
    c.restore();
  }
}

export function containRect(W: number, H: number, aspect: number): Rect {
  if (W / H > aspect) {
    const w = H * aspect;
    return { x: (W - w) / 2, y: 0, w, h: H };
  }
  const h = W / aspect;
  return { x: 0, y: (H - h) / 2, w: W, h };
}

function setWordmarkFont(c: Ctx, px: number) {
  const anyC = c as Ctx & { fontStretch?: string };
  c.font = `760 ${px}px ${FONT_UI}`;
  if ("fontStretch" in c) anyC.fontStretch = "semi-expanded";
  c.letterSpacing = `${-0.02 * px}px`;
}

function resetFontStretch(c: Ctx) {
  const anyC = c as Ctx & { fontStretch?: string };
  if ("fontStretch" in c) anyC.fontStretch = "normal";
  c.letterSpacing = "0px";
}

function wrap(c: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  // balance a two-line split so neither line is a widow
  if (lines.length === 2 && words.length > 2) {
    let bestSplit = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = c.measureText(words.slice(0, i).join(" ")).width;
      const b = c.measureText(words.slice(i).join(" ")).width;
      if (a <= maxWidth && b <= maxWidth && Math.abs(a - b) < bestDiff) {
        bestDiff = Math.abs(a - b);
        bestSplit = i;
      }
    }
    return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
  }
  return lines;
}

/** Point and unit normal at a distance along the polyline. */
function pointAt(p: Polyline, at: number): [number, number, number, number] {
  let lo = 0;
  let hi = p.ls.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.ls[mid] < at) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const segLen = p.ls[i] - p.ls[i - 1] || 1;
  const f = clamp01((at - p.ls[i - 1]) / segLen);
  const dx = p.xs[i] - p.xs[i - 1];
  const dy = p.ys[i] - p.ys[i - 1];
  const len = Math.hypot(dx, dy) || 1;
  return [p.xs[i - 1] + dx * f, p.ys[i - 1] + dy * f, -dy / len, dx / len];
}

function buildFloor(W: number, H: number, s: number, seed: number): Canvas {
  const c = makeCanvas(W, H);
  const f = ctx2d(c);
  const [r, g, b] = COLORS.oxide;
  f.fillStyle = `rgb(${r},${g},${b})`;
  f.fillRect(0, 0, W, H);
  const rand = mulberry32(seed ^ 0x51ed27);
  // mottling of a hand-polished oxide floor
  const blobs = Math.round((W * H) / (220 * 220));
  for (let i = 0; i < blobs; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const rad = (90 + rand() * 340) * s;
    const dark = rand() < 0.55;
    const gr = f.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + rand() * 0.1;
    gr.addColorStop(0, dark ? `rgba(78,22,12,${a})` : `rgba(176,78,50,${a})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = gr;
    f.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // broad polish sheen
  for (let i = 0; i < 4; i++) {
    const x = rand() * W;
    const gr = f.createLinearGradient(x - 300 * s, 0, x + 300 * s, H);
    gr.addColorStop(0, "rgba(255,200,170,0)");
    gr.addColorStop(0.5, "rgba(255,200,170,0.035)");
    gr.addColorStop(1, "rgba(255,200,170,0)");
    f.fillStyle = gr;
    f.fillRect(0, 0, W, H);
  }
  // fine grain
  try {
    const img = f.getImageData(0, 0, W, H);
    const d = img.data;
    let state = seed >>> 0 || 1;
    for (let i = 0; i < d.length; i += 4) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const n = ((state >>> 0) / 4294967296 - 0.5) * 16;
      d[i] = d[i] + n;
      d[i + 1] = d[i + 1] + n * 0.8;
      d[i + 2] = d[i + 2] + n * 0.7;
    }
    f.putImageData(img, 0, 0);
  } catch {
    // tainted or unavailable: the floor still reads without grain
  }
  return c;
}

function buildPetal(color: string, unitPx: number, seed: number): Canvas {
  const size = Math.ceil(unitPx * 2.1);
  const c = makeCanvas(size, size);
  const p = ctx2d(c);
  const cx = size / 2;
  const cy = size / 2;
  const L = unitPx * 0.78;
  const Wd = unitPx * 0.34;
  const rand = mulberry32(seed);
  p.fillStyle = color;
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    p.save();
    p.translate(cx, cy);
    p.rotate(ang);
    p.beginPath();
    p.moveTo(unitPx * 0.14, 0);
    p.bezierCurveTo(unitPx * 0.3, -Wd, L * 0.9, -Wd * 0.7, L, 0);
    p.bezierCurveTo(L * 0.9, Wd * 0.7, unitPx * 0.3, Wd, unitPx * 0.14, 0);
    p.closePath();
    p.fill();
    p.restore();
  }
  // powder grain over the colour
  p.globalCompositeOperation = "source-atop";
  for (let i = 0; i < size * size * 0.12; i++) {
    const x = rand() * size;
    const y = rand() * size;
    p.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)";
    p.fillRect(x, y, 1.2, 1.2);
  }
  p.globalCompositeOperation = "source-over";
  // centre dot stays visible
  p.fillStyle = COLORS.powder;
  p.beginPath();
  p.arc(cx, cy, unitPx * 0.12, 0, Math.PI * 2);
  p.fill();
  return c;
}

function drawDiyaBody(c: Ctx, x: number, y: number, w: number, seed: number) {
  // belly
  c.beginPath();
  c.moveTo(x - w * 0.5, y);
  c.bezierCurveTo(x - w * 0.47, y + w * 0.3, x + w * 0.3, y + w * 0.34, x + w * 0.5, y + w * 0.02);
  c.lineTo(x + w * 0.66, y - w * 0.07);
  c.bezierCurveTo(x + w * 0.4, y - w * 0.12, x - w * 0.2, y - w * 0.16, x - w * 0.5, y);
  c.closePath();
  const bg = c.createLinearGradient(0, y - w * 0.1, 0, y + w * 0.3);
  bg.addColorStop(0, "#c8693a");
  bg.addColorStop(0.5, "#9a4423");
  bg.addColorStop(1, "#5a2210");
  c.fillStyle = bg;
  c.fill();
  // fired-clay grain and mottle, kept inside the belly
  c.save();
  c.clip();
  const rand = mulberry32(seed);
  for (let i = 0; i < 7; i++) {
    const mx = x - w * 0.45 + rand() * w * 1.0;
    const my = y + rand() * w * 0.28;
    const mr = w * (0.12 + rand() * 0.16);
    const mg = c.createRadialGradient(mx, my, 0, mx, my, mr);
    mg.addColorStop(0, rand() < 0.5 ? "rgba(60,18,6,0.35)" : "rgba(226,140,90,0.3)");
    mg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = mg;
    c.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  }
  for (let i = 0; i < 900; i++) {
    const gx = x - w * 0.5 + rand() * w * 1.16;
    const gy = y - w * 0.16 + rand() * w * 0.5;
    const r = Math.max(0.8, w * (0.006 + rand() * 0.012));
    c.fillStyle = rand() < 0.55 ? `rgba(40,12,4,${0.3 + rand() * 0.3})` : `rgba(245,180,130,${0.2 + rand() * 0.2})`;
    c.fillRect(gx, gy, r, r);
  }
  c.restore();

  // rim, a teardrop seen from above at a slight angle
  c.beginPath();
  c.moveTo(x - w * 0.5, y);
  c.bezierCurveTo(x - w * 0.5, y - w * 0.2, x + w * 0.25, y - w * 0.2, x + w * 0.66, y - w * 0.07);
  c.bezierCurveTo(x + w * 0.25, y + w * 0.12, x - w * 0.5, y + w * 0.18, x - w * 0.5, y);
  c.closePath();
  c.fillStyle = "#d27a45";
  c.fill();

  // oil
  c.beginPath();
  c.ellipse(x - w * 0.04, y - w * 0.01, w * 0.38, w * 0.105, -0.06, 0, Math.PI * 2);
  const og = c.createLinearGradient(0, y - w * 0.1, 0, y + w * 0.1);
  og.addColorStop(0, "#5b2c0c");
  og.addColorStop(1, "#8a4a14");
  c.fillStyle = og;
  c.fill();

  // incised dots along the belly
  c.fillStyle = "rgba(255,214,170,0.45)";
  for (let i = 0; i < 7; i++) {
    const f = (i + 0.5) / 7;
    const px = x - w * 0.42 + f * w * 0.84;
    const py = y + w * 0.13 + Math.sin(f * Math.PI) * w * 0.07;
    c.beginPath();
    c.arc(px, py, Math.max(1, w * 0.016), 0, Math.PI * 2);
    c.fill();
  }

  // wick
  c.strokeStyle = "#2a1408";
  c.lineWidth = Math.max(1.5, w * 0.03);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x + w * 0.46, y - w * 0.04);
  c.lineTo(x + w * 0.56, y - w * 0.07);
  c.stroke();
}
