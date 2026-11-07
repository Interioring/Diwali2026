import { mulberry32 } from "./random.ts";

/**
 * Pulli kolam as a "mirror curve": dots sit at the centres of an n×n grid of
 * cells, and one rice-powder line travels diagonally through the midpoints of
 * the cell edges, bouncing off the outer border and off mirrors placed on
 * chosen inner edges. Everything is in doubled grid units: cell centres are at
 * (odd, odd), horizontal-edge midpoints at (odd, even), vertical-edge
 * midpoints at (even, odd).
 */

export interface GridPoint {
  x: number;
  y: number;
  /** True where the line turns (a mirror or the border), false where it crosses. */
  turn: boolean;
}

export interface KolamDot {
  x: number;
  y: number;
  /** Square ring around the centre dot: 0 at the centre. */
  ring: number;
}

export interface Kolam {
  n: number;
  dots: KolamDot[];
  loops: GridPoint[][];
}

const key = (x: number, y: number) => `${x},${y}`;

function orbit(n: number, x: number, y: number): Array<[number, number]> {
  const seen = new Map<string, [number, number]>();
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    const k = key(px, py);
    if (seen.has(k)) continue;
    seen.set(k, [px, py]);
    // Rotate 90° about the centre. Four-fold rotation (not mirror symmetry) is
    // what lets a single unbroken line exist, as in a sikku kolam.
    stack.push([2 * n - py, px]);
  }
  return [...seen.values()];
}

function innerEdges(n: number): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  for (let x = 1; x < 2 * n; x += 2) for (let y = 2; y < 2 * n; y += 2) edges.push([x, y]);
  for (let x = 2; x < 2 * n; x += 2) for (let y = 1; y < 2 * n; y += 2) edges.push([x, y]);
  return edges;
}

export function traceLoops(n: number, mirrors: Set<string>): GridPoint[][] {
  const max = 2 * n;
  const isTurn = (x: number, y: number) => {
    if (x % 2 === 1) return y === 0 || y === max || mirrors.has(key(x, y));
    return x === 0 || x === max || mirrors.has(key(x, y));
  };
  const segKey = (ax: number, ay: number, bx: number, by: number) =>
    ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
  const visited = new Set<string>();
  const loops: GridPoint[][] = [];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x <= max && y <= max;

  for (let sx = 0; sx <= max; sx++) {
    for (let sy = 0; sy <= max; sy++) {
      if ((sx + sy) % 2 === 0) continue; // only edge midpoints
      for (const [sdx, sdy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        if (!inBounds(sx + sdx, sy + sdy)) continue;
        if (visited.has(segKey(sx, sy, sx + sdx, sy + sdy))) continue;
        const loop: GridPoint[] = [];
        let x = sx, y = sy, dx: number = sdx, dy: number = sdy;
        for (let guard = 0; guard < 20000; guard++) {
          visited.add(segKey(x, y, x + dx, y + dy));
          x += dx;
          y += dy;
          const turn = isTurn(x, y);
          if (turn) {
            if (x % 2 === 1) dy = -dy;
            else dx = -dx;
          }
          loop.push({ x, y, turn });
          if (x === sx && y === sy && dx === sdx && dy === sdy) break;
        }
        loops.push(loop);
      }
    }
  }
  return loops;
}

export function generateKolam(seed: number): Kolam {
  const rand = mulberry32(seed);
  const n = rand() < 0.3 ? 5 : 7;
  const orbits: Array<Array<[number, number]>> = [];
  const seen = new Set<string>();
  for (const [x, y] of innerEdges(n)) {
    if (seen.has(key(x, y))) continue;
    const o = orbit(n, x, y);
    o.forEach(([ox, oy]) => seen.add(key(ox, oy)));
    orbits.push(o);
  }

  let best: { loops: GridPoint[][]; score: number } | null = null;
  for (let attempt = 0; attempt < 240; attempt++) {
    const density = 0.16 + rand() * 0.34;
    const mirrors = new Set<string>();
    for (const o of orbits) if (rand() < density) o.forEach(([x, y]) => mirrors.add(key(x, y)));
    const loops = traceLoops(n, mirrors);
    const shortest = Math.min(...loops.map((l) => l.length));
    // One unbroken line is the ideal (a sikku kolam); tiny closed loops read as noise.
    const score = loops.length * 10 + (shortest < 8 ? 25 : 0) + Math.abs(density - 0.3) * 4;
    if (!best || score < best.score) best = { loops, score };
    if (loops.length === 1 && shortest >= 8) break;
  }

  const dots: KolamDot[] = [];
  for (let x = 1; x < 2 * n; x += 2) {
    for (let y = 1; y < 2 * n; y += 2) {
      dots.push({ x, y, ring: Math.max(Math.abs(x - n), Math.abs(y - n)) / 2 });
    }
  }
  return { n, dots, loops: best!.loops };
}

export interface Polyline {
  xs: Float32Array;
  ys: Float32Array;
  /** Cumulative length at each point. */
  ls: Float32Array;
  length: number;
}

/**
 * Smooth a loop into a closed polyline in screen space. Crossings stay
 * straight; each turn becomes a round arc that starts well before the corner,
 * so the line swells around its dots the way a hand-drawn kolam does.
 */
export function smoothLoop(
  loop: GridPoint[],
  map: (gx: number, gy: number) => [number, number],
  stepsPerCurve = 14,
): Polyline {
  const pts: Array<[number, number]> = [];
  const m = loop.length;
  const lerp = (a: GridPoint, b: GridPoint, f: number) => map(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  // How far along a segment a turn's arc may reach: halfway when the
  // neighbour also turns, most of the way when the neighbour is a crossing.
  const reach = (other: GridPoint) => (other.turn ? 0.5 : 0.74);
  const handle = 0.58;
  for (let i = 0; i < m; i++) {
    const prev = loop[(i - 1 + m) % m];
    const cur = loop[i];
    const next = loop[(i + 1) % m];
    const c = map(cur.x, cur.y);
    if (!cur.turn) {
      pts.push(c);
      continue;
    }
    const a = lerp(cur, prev, reach(prev));
    const b = lerp(cur, next, reach(next));
    const c1: [number, number] = [a[0] + (c[0] - a[0]) * handle, a[1] + (c[1] - a[1]) * handle];
    const c2: [number, number] = [b[0] + (c[0] - b[0]) * handle, b[1] + (c[1] - b[1]) * handle];
    for (let s = 0; s <= stepsPerCurve; s++) {
      const t = s / stepsPerCurve;
      const u = 1 - t;
      const k0 = u * u * u;
      const k1 = 3 * u * u * t;
      const k2 = 3 * u * t * t;
      const k3 = t * t * t;
      pts.push([k0 * a[0] + k1 * c1[0] + k2 * c2[0] + k3 * b[0], k0 * a[1] + k1 * c1[1] + k2 * c2[1] + k3 * b[1]]);
    }
  }
  pts.push(pts[0]);
  const xs = new Float32Array(pts.length);
  const ys = new Float32Array(pts.length);
  const ls = new Float32Array(pts.length);
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    xs[i] = pts[i][0];
    ys[i] = pts[i][1];
    if (i > 0) total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    ls[i] = total;
  }
  return { xs, ys, ls, length: total };
}
