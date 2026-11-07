import { describe, expect, it } from "vitest";
import { generateKolam, traceLoops } from "../src/greeting/kolam.ts";

describe("kolam generation", () => {
  it("is deterministic for a seed", () => {
    expect(JSON.stringify(generateKolam(1234))).toBe(JSON.stringify(generateKolam(1234)));
  });

  it("covers every diagonal segment exactly once across its loops", () => {
    for (const seed of [1, 7, 99, 2026, 31337]) {
      const k = generateKolam(seed);
      // Each n×n grid has 4 diagonal segments per cell.
      const segments = k.loops.reduce((sum, loop) => sum + loop.length, 0);
      expect(segments).toBe(4 * k.n * k.n);
      for (const loop of k.loops) {
        const last = loop[loop.length - 1];
        expect(loop.some((p) => p.x === last.x && p.y === last.y)).toBe(true);
      }
    }
  });

  it("an empty mirror set on an n×n square makes n loops", () => {
    expect(traceLoops(5, new Set()).length).toBe(5);
  });

  it("usually finds a single continuous line", () => {
    let single = 0;
    for (let seed = 1; seed <= 40; seed++) if (generateKolam(seed).loops.length === 1) single++;
    expect(single).toBeGreaterThan(20);
  });
});
