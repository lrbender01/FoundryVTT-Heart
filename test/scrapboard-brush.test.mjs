/**
 * The brush (Luke, 2026-10-06): each stroke its own brightness (dim, as it
 * is, bright), kept wherever it is moved; a box in Select takes every stroke
 * it touches, not only those wholly inside it; a brown and a darker grey
 * among the paints.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, cleanStroke, DEFAULT_LOOK, PAINT_ORDER, PAINT_NAMES } from "../src/map/scrapboard/model.js";
import { BoardControls, strokeMeets } from "../src/map/scrapboard/controls.js";

const size = () => null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({});

describe("a stroke's brightness", () => {
  it("is kept, 0 to 2, and left out when it is the default", () => {
    expect(cleanStroke({ c: 1, w: 6, b: 2, pts: [0, 0, 5, 5] }).b).toBe(2);
    expect(cleanStroke({ c: 1, w: 6, b: 9, pts: [0, 0, 5, 5] }).b).toBe(2);
    expect(cleanStroke({ c: 1, w: 6, b: -1, pts: [0, 0, 5, 5] }).b).toBe(0);
    expect("b" in cleanStroke({ c: 1, w: 6, pts: [0, 0, 5, 5] })).toBe(false);
  });

  it("goes with a stroke moved with Move (Luke, 2026-10-24: strokes select with everything else)", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, b: 2, pts: [100, 100, 200, 120, 300, 100] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    c.press("move", { x: 200, y: 118 });
    expect(c.markSel.size).toBe(1);
    expect(c.dragStart({ x: 200, y: 118 }, { tool: "move" })).toBe("mmove");
    c.dragMove({ x: 260, y: 150 });
    const patch = c.dragEnd();
    expect(patch.marks.gm.m1).toMatchObject({ c: 2, b: 2 });
  });

  it("Ctrl with the brush selects strokes: a click takes or lets go of one, a drag boxes them or moves one; a plain drag paints (Luke, 2026-10-25)", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, pts: [100, 100, 200, 120, 300, 100] }, m2: { c: 1, w: 6, pts: [100, 300, 300, 300] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    // (a click)
    expect(c.press("mark", { x: 200, y: 118 }, { ctrl: true })).toEqual({ do: "select" });
    expect([...c.markSel].map((k) => JSON.parse(k)[1])).toEqual(["m1"]);
    c.press("mark", { x: 200, y: 118 }, { ctrl: true });
    expect(c.markSel.size).toBe(0);
    expect(c.press("mark", { x: 200, y: 118 })).toBeNull();
    // (a box round both)
    expect(c.dragStart({ x: 50, y: 50 }, { tool: "mark", ctrl: true })).toBe("mbox");
    c.dragMove({ x: 350, y: 350 });
    expect(c.dragEnd()).toEqual({ select: true });
    expect([...c.markSel].map((k) => JSON.parse(k)[1]).sort()).toEqual(["m1", "m2"]);
    // (a stroke dragged where it goes)
    expect(c.dragStart({ x: 200, y: 300 }, { tool: "mark", ctrl: true })).toBe("mmove");
    c.dragMove({ x: 200, y: 340 });
    expect(c.dragEnd().marks.gm.m2.pts[1]).toBeCloseTo(340, 0);
    // (no Ctrl: a stroke, the selection let go)
    expect(c.dragStart({ x: 50, y: 50 }, { tool: "mark" })).toBe("mark");
    expect(c.markSel.size).toBe(0);
  });

  it("the doodle's Pick takes anyone's stroke for a player; restyling still takes only their own (Luke, 2026-10-25)", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, pts: [100, 100, 300, 100] } }, ana: { m2: { c: 1, w: 6, pts: [100, 300, 300, 300] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "ana", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "ana", isGM: false }), px: () => 1, raw: () => raw });
    c.pickAny = true;
    // (a box round both)
    c.drag = { kind: "box", start: { x: 50, y: 50 }, to: { x: 350, y: 350 }, ctrl: false };
    c.dragEnd();
    expect([...c.markSel].map((k) => JSON.parse(k)[1]).sort()).toEqual(["m1", "m2"]);
    // (Ctrl+click lets one go and takes it again)
    expect(c.pickAt({ x: 200, y: 100 })).toBe(true);
    expect(c.markSel.size).toBe(1);
    c.pickAt({ x: 200, y: 100 });
    expect(c.selectedStrokes()).toHaveLength(2);
    // (kept when the board is pruned after Pick ends)
    c.pickAny = false;
    c.prune();
    expect(c.markSel.size).toBe(2);
    // (the palette restyles only her own)
    expect(Object.keys(c.restylePatch({ c: 3 }).marks)).toEqual(["ana"]);
  });

  it("a pen stays a pen, a wash a wash, filled or not, when moved (Luke, 2026-10-25: moving one made it a brush)", () => {
    for (const nib of [{ n: "pen" }, { n: "wash" }, { n: "wash", fill: true }]) {
      const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, ...nib, pts: [100, 100, 200, 120, 300, 100] } } } };
      const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
      c.press("move", { x: 200, y: 118 });
      expect(c.dragStart({ x: 200, y: 118 }, { tool: "move" })).toBe("mmove");
      c.dragMove({ x: 260, y: 150 });
      expect(c.dragEnd().marks.gm.m1).toMatchObject(nib);
    }
  });
});

describe("a Move box takes strokes (Luke, 2026-10-06: partly covered strokes too; 2026-10-24: with Move)", () => {
  it("touches a stroke by a point in it, or a stretch crossing it", () => {
    const B = { x0: 100, y0: 100, x1: 200, y1: 200 };
    expect(strokeMeets([150, 150, 400, 400], 4, B)).toBe(true);
    // (crossing it with no point inside)
    expect(strokeMeets([0, 150, 400, 150], 4, B)).toBe(true);
    // (clear of it)
    expect(strokeMeets([0, 0, 400, 50], 4, B)).toBe(false);
    // (its width reaches in)
    expect(strokeMeets([0, 96, 400, 96], 10, B)).toBe(true);
  });

  it("takes a stroke it only partly covers", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { long: { c: 1, w: 6, pts: [0, 500, 1000, 500] }, far: { c: 1, w: 6, pts: [0, 900, 1000, 900] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    expect(c.dragStart({ x: 400, y: 400 }, { tool: "move" })).toBe("box");
    c.dragMove({ x: 600, y: 600 });
    expect(c.marks().box).toEqual({ x0: 400, y0: 400, x1: 600, y1: 600 });
    c.dragEnd();
    expect([...c.markSel].map((k) => JSON.parse(k)[1])).toEqual(["long"]);
  });
});

describe("the paints", () => {
  it("have a brown, and a grey clear of the bone", () => {
    const P = DEFAULT_LOOK.ink.marker;
    const lum = (h) => { const v = parseInt(h.slice(1), 16); return 0.3 * (v >> 16) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255); };
    expect(P.length).toBe(80);
    expect(lum(P[0]) - lum(P[11])).toBeGreaterThan(90);
    const b = parseInt(P[13].slice(1), 16);
    expect((b >> 16) > ((b >> 8) & 255) && ((b >> 8) & 255) > (b & 255)).toBe(true);
  });

  it("are a fuller palette (Luke, 2026-10-24): eighty, each its own, the first fourteen where they were", () => {
    const P = DEFAULT_LOOK.ink.marker;
    expect(new Set(P).size).toBe(80);
    expect(P.slice(0, 14)).toEqual(['#e9dfc8', '#d4483a', '#e07a3a', '#e3b54a', '#c9c75a', '#8fbf5a', '#4fb3a0', '#6aa6e0', '#7a78e0', '#b07ad8', '#e070a0', '#6f6a65', '#3a3431', '#9a6a40']);
    expect([...PAINT_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 80 }, (_, i) => i));
    expect(PAINT_NAMES.length).toBe(80);
    expect(new Set(PAINT_NAMES).size).toBe(80);
  });

  it("a look saved with the first fourteen gets the rest; one of its own is kept", () => {
    const old = DEFAULT_LOOK.ink.marker.slice(0, 14);
    expect(normalizeLook({ ink: { marker: old } }).ink.marker.length).toBe(80);
    expect(normalizeLook({ ink: { marker: DEFAULT_LOOK.ink.marker.slice(0, 40) } }).ink.marker.length).toBe(80);
    const own = ['#112233', '#445566'];
    expect(normalizeLook({ ink: { marker: own } }).ink.marker).toEqual([0x112233, 0x445566]);
  });
});
