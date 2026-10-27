/**
 * Backdrop level of detail (Luke, 2026-10-27): which baked tiles are drawn
 * and which let go for a zoom (backdrop.js, the pure rules).
 */

import { describe, it, expect } from "vitest";
import { covers, tilesToShow, tilesToRelease } from "../src/map/scrapboard/backdrop.js";

// a 100 x 100 map: level l has 2^l tiles across
const tile = (lvl, x, y, extra = {}) => {
  const n = 2 ** lvl;
  const s = 100 / n;
  return { key: `b:${lvl}:${x}_${y}`, group: "base", lvl, rect: { x0: x * s, y0: y * s, x1: (x + 1) * s, y1: (y + 1) * s }, pin: false, ...extra };
};
const level = (lvl) => {
  const n = 2 ** lvl;
  const out = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push(tile(lvl, x, y));
  return out;
};
const ALL = { x0: 0, y0: 0, x1: 100, y1: 100 };

describe("covers", () => {
  it("is true when tiles fill the rect and false with a gap", () => {
    const rects = (l) => l.map((t) => t.rect);
    expect(covers({ x0: 0, y0: 0, x1: 50, y1: 50 }, rects(level(2).filter((t) => t.rect.x1 <= 50 && t.rect.y1 <= 50)))).toBe(true);
    expect(covers(ALL, rects(level(1).slice(0, 3)))).toBe(false);
  });
});

describe("tilesToShow", () => {
  it("never draws a tile finer than the zoom needs", () => {
    const shown = tilesToShow([...level(0), ...level(1), ...level(2)], new Map([["base", 1]]), ALL);
    expect([...shown].some((k) => k.startsWith("b:2:"))).toBe(false);
    expect(shown.has("b:1:0_0")).toBe(true);
  });

  it("hides a coarser tile once the current level covers it", () => {
    const shown = tilesToShow([...level(0), ...level(1)], new Map([["base", 1]]), ALL);
    expect(shown.has("b:0:0_0")).toBe(false);
    expect(shown.size).toBe(4);
  });

  it("keeps a coarser tile as a stand-in while the finer ones have not all arrived", () => {
    const shown = tilesToShow([...level(0), ...level(1).slice(0, 3)], new Map([["base", 1]]), ALL);
    expect(shown.has("b:0:0_0")).toBe(true);
  });

  it("looks only at the part of a coarse tile in view", () => {
    const near = { x0: 0, y0: 0, x1: 40, y1: 40 };
    const shown = tilesToShow([...level(0), tile(1, 0, 0)], new Map([["base", 1]]), near);
    expect(shown.has("b:0:0_0")).toBe(false);
  });

  it("a mid level stands in too, and the coarsest goes when a mid one covers", () => {
    const quadrant = level(2).filter((t) => t.rect.x1 <= 50 && t.rect.y1 <= 50);
    const pieces = [...level(0), ...level(1), ...quadrant];
    const shown = tilesToShow(pieces, new Map([["base", 2]]), ALL);
    expect(shown.has("b:1:0_0")).toBe(false);
    expect(shown.has("b:1:1_1")).toBe(true);
    expect(shown.has("b:0:0_0")).toBe(false);
  });

  it("leaves the overview and the roofs (no group) alone and stacks apart", () => {
    const over = { key: "overview", group: null, lvl: 0, rect: ALL };
    const other = { key: "o:a:1:0_0", group: "o:a", lvl: 1, rect: { x0: 0, y0: 0, x1: 10, y1: 10 } };
    const shown = tilesToShow([over, other, ...level(1)], new Map([["base", 1], ["o:a", 0]]), ALL);
    expect(shown.has("overview")).toBe(true);
    expect(shown.has("o:a:1:0_0")).toBe(false);
  });
});

describe("tilesToRelease", () => {
  const view = (r) => r.x1 >= 0 && r.x0 <= 40 && r.y1 >= 0 && r.y0 <= 40;

  it("lets go every finer tile at once, in view or not", () => {
    const gone = tilesToRelease([...level(1), ...level(2)], new Map([["base", 1]]), () => true, false);
    expect(gone.length).toBe(16);
    expect(gone.every((k) => k.startsWith("b:2:"))).toBe(true);
  });

  it("lets go a far coarser tile out of view only when the level changed", () => {
    const pieces = [...level(0), ...level(1), ...level(3).slice(0, 4)];
    const cur = new Map([["base", 3]]);
    expect(tilesToRelease(pieces, cur, view, false)).toEqual([]);
    const gone = tilesToRelease(pieces, cur, () => false, true);
    expect(gone).toContain("b:1:0_0");
    expect(gone).toContain("b:0:0_0");
    expect(tilesToRelease(pieces, cur, () => true, true)).toEqual([]);
  });

  it("keeps the current level and the next coarser one", () => {
    const gone = tilesToRelease([...level(1), ...level(2)], new Map([["base", 2]]), () => false, true);
    expect(gone).toEqual([]);
  });

  it("never lets go a pinned piece or a stack with no level named", () => {
    const pinned = tile(0, 0, 0, { pin: true });
    const off = { key: "o:z:3:0_0", group: "o:z", lvl: 3, rect: ALL, pin: false };
    expect(tilesToRelease([pinned, off, tile(3, 0, 0)], new Map([["base", 1]]), () => false, true)).toEqual(["b:3:0_0"]);
  });
});
