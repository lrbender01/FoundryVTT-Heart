/**
 * The brush (Luke, 2026-10-06): each stroke its own brightness (dim, as it
 * is, bright), kept wherever it is moved; a box in Select takes every stroke
 * it touches, not only those wholly inside it; a brown and a darker grey
 * among the paints.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, cleanStroke, DEFAULT_LOOK } from "../src/map/scrapboard/model.js";
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

  it("goes with a stroke moved in Select", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, b: 2, pts: [100, 100, 200, 120, 300, 100] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    c.markMode = "select";
    c.press("mark", { x: 200, y: 118 });
    expect(c.markSel.size).toBe(1);
    expect(c.dragStart({ x: 200, y: 118 }, { tool: "mark" })).toBe("mmove");
    c.dragMove({ x: 260, y: 150 });
    const patch = c.dragEnd();
    expect(patch.marks.gm.m1).toMatchObject({ c: 2, b: 2 });
  });
});

describe("a box in Select (Luke, 2026-10-06: partly covered strokes too)", () => {
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
    c.markMode = "select";
    expect(c.dragStart({ x: 400, y: 400 }, { tool: "mark" })).toBe("mbox");
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
    expect(P.length).toBe(14);
    expect(lum(P[0]) - lum(P[11])).toBeGreaterThan(90);
    const b = parseInt(P[13].slice(1), 16);
    expect((b >> 16) > ((b >> 8) & 255) && ((b >> 8) & 255) > (b & 255)).toBe(true);
  });
});
