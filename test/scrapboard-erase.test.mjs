/**
 * Part of a stroke rubbed out (Luke, 2026-10-25): the eraser's sweep cuts a
 * stroke into the pieces left, each a stroke of its own that keeps the whole
 * stroke's seed and its stretch of it (span), so what is left is painted as
 * it was (model.js cutStroke, cutPatch; the controls' cut).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, cutStroke, cutPatch, cleanStroke } from "../src/map/scrapboard/model.js";
import { BoardControls, thinPath } from "../src/map/scrapboard/controls.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] } });
const line = { c: 2, w: 6, pts: [0, 0, 300, 0] };

describe("cutStroke: the pieces a sweep leaves", () => {
  it("a sweep across the middle leaves two pieces, each its stretch of the whole", () => {
    const pieces = cutStroke(line, { pts: [150, -40, 150, 40], r: 10 });
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces;
    expect(a.span[0]).toBe(0);
    expect(a.span[1]).toBeGreaterThan(0.43);
    expect(a.span[1]).toBeLessThan(0.48);
    expect(b.span[0]).toBeGreaterThan(0.52);
    expect(b.span[1]).toBe(1);
    // (cut where the sweep's reach ends, new points there)
    expect(a.pts.slice(0, 2)).toEqual([0, 0]);
    expect(a.pts.at(-2)).toBeCloseTo(300 * a.span[1], 0);
    expect(b.pts.at(-2)).toBe(300);
  });

  it("a miss is null; a sweep over all of it leaves nothing", () => {
    expect(cutStroke(line, { pts: [150, 200], r: 10 })).toBeNull();
    expect(cutStroke(line, { pts: [-20, 0, 320, 0], r: 10 })).toEqual([]);
  });

  it("a dab at its end trims it; a dab near its end keeps the stub it never touched", () => {
    const [p] = cutStroke(line, { pts: [298, 0], r: 10 });
    expect(p.span[0]).toBe(0);
    expect(p.span[1]).toBeLessThan(0.97);
    const [stub, rest] = cutStroke(line, { pts: [9, 0], r: 6 });
    expect(stub.span[1]).toBeLessThan(0.02);
    expect(rest.span[1]).toBe(1);
  });

  it("a piece cut again keeps its stretch of the first whole", () => {
    const piece = { ...line, pts: [150, 0, 300, 0], span: [0.5, 1] };
    const [a, b] = cutStroke(piece, { pts: [225, -40, 225, 40], r: 5 });
    expect(a.span[0]).toBe(0.5);
    expect(a.span[1]).toBeGreaterThan(0.7);
    expect(b.span[1]).toBe(1);
  });

  it("a long stroke crossed three times leaves four pieces, in order, each its own points", () => {
    // (a long wavy brush stroke, 400 points over 4000 px)
    const pts = [];
    for (let i = 0; i < 400; i++) pts.push(i * 10, Math.round(Math.sin(i / 9) * 40));
    const long = { c: 2, w: 12, pts };
    const sweep = { pts: [1000, -120, 1000, 120, 2000, 120, 2000, -120, 3000, -120, 3000, 120], r: 8 };
    const pieces = cutStroke(long, sweep);
    expect(pieces).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(pieces[i].span[0]).toBeGreaterThan(pieces[i - 1].span[1]);
    expect(pieces[0].span[0]).toBe(0);
    expect(pieces[3].span[1]).toBe(1);
    // (cut near each crossing, its points the stroke's own between)
    expect(pieces[0].pts.at(-2)).toBeGreaterThan(985);
    expect(pieces[0].pts.at(-2)).toBeLessThan(1000);
    expect(pieces[1].pts[0]).toBeGreaterThan(1000);
    expect(pieces[1].pts.length).toBeGreaterThan(150);
    // (and all of them kept as strokes)
    for (const p of pieces) expect(cleanStroke({ ...long, ...p }).pts).toEqual(p.pts);
  });

  it("a broad stroke crossed by a narrow eraser: cut through, every circle of the eraser's on its ink a bite", () => {
    for (const nib of [{}, { n: "pen" }, { n: "wash" }]) {
      const broad = { c: 2, w: 40, ...nib, pts: [0, 0, 300, 0] };
      const pieces = cutStroke(broad, { pts: [150, -60, 150, 60], r: 6 });
      expect(pieces).toHaveLength(2);
      // (the eraser's circles over the ink, half its radius apart: none left out)
      const bites = pieces.flatMap((p) => p.bites ?? []);
      for (let y = -18; y <= 18; y += 3) expect(bites.some(([bx, by, br]) => Math.hypot(bx - 150, by - y) <= 3.1 && br === 6)).toBe(true);
    }
  });

  it("a graze off its middle bites its edge, never cuts it", () => {
    const broad = { c: 2, w: 40, pts: [0, 0, 300, 0] };
    const pieces = cutStroke(broad, { pts: [50, 26, 250, 26], r: 6 });
    expect(pieces).toHaveLength(1);
    expect(pieces[0].pts).toEqual(broad.pts);
    expect(pieces[0].span).toEqual([0, 1]);
    // (all along it, not six of them)
    expect(pieces[0].bites.length).toBeGreaterThan(50);
    // (a narrow eraser down its middle leaves its edges: bitten, not cut)
    expect(cutStroke(broad, { pts: [50, 0, 250, 0], r: 6 })).toHaveLength(1);
    // (beyond the ink's reach, a miss)
    expect(cutStroke(broad, { pts: [50, 40, 250, 40], r: 6 })).toBeNull();
  });

  it("a stroke cut again keeps the bites that still touch each piece", () => {
    const broad = { c: 2, w: 40, pts: [0, 0, 300, 0] };
    const [whole] = cutStroke(broad, { pts: [50, 26, 100, 26], r: 6 });
    const [a, b] = cutStroke({ ...broad, ...whole }, { pts: [200, -60, 200, 60], r: 6 });
    expect(a.bites.some(([x, y]) => x === 50 && y === 26)).toBe(true);
    expect((b.bites ?? []).some(([x, y]) => x === 50 && y === 26)).toBe(false);
  });

  it("a long scrub's bites are all kept as the stroke's", () => {
    const broad = { c: 2, w: 40, pts: [0, 0, 3000, 0] };
    const [p] = cutStroke(broad, { pts: [0, 24, 3000, 24], r: 6 });
    expect(p.bites.length).toBeGreaterThan(500);
    expect(cleanStroke({ ...broad, ...p }).bites).toHaveLength(Math.min(600, p.bites.length));
  });

  it("a piece keeps its seed and stretch when cleaned, the whole stroke none", () => {
    expect(cleanStroke({ ...line, seed: "mark:m1:4", span: [0.2, 0.6] })).toMatchObject({ seed: "mark:m1:4", span: [0.2, 0.6] });
    expect("span" in cleanStroke({ ...line, span: [0, 1] })).toBe(false);
    expect("span" in cleanStroke({ ...line, span: [0.6, 0.2] })).toBe(false);
  });
});

describe("cutPatch: the strokes asked for, cut", () => {
  it("on the sheet: the first piece keeps the id, the next a new one, each with the whole's seed", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { m1: { ...line, open: true } } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const p = cutPatch(raw, view, { pts: [150, -40, 150, 40], r: 10 }, [["ana", "m1"]], look);
    expect(Object.keys(p.marks.ana).sort()).toEqual(["m1", "m2"]);
    expect(p.marks.ana.m1).toMatchObject({ c: 2, w: 6, open: true, seed: "mark:m1:4" });
    expect(p.marks.ana.m2.seed).toBe("mark:m1:4");
  });

  it("one drag across many strokes keeps every piece of each, each its own id (Luke, 2026-10-25: the gate's bars lost their lower halves)", () => {
    const bars = {};
    for (let i = 1; i <= 6; i++) bars[`m${i}`] = { c: 2, w: 6, pts: [i * 40, 0, i * 40, 200] };
    const raw = { scraps: {}, links: {}, marks: { ana: bars } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const p = cutPatch(raw, view, { pts: [0, 100, 300, 100], r: 8 }, Object.keys(bars).map((id) => ["ana", id]), look);
    const pieces = Object.entries(p.marks.ana).filter(([, st]) => st);
    expect(pieces).toHaveLength(12);
    // (each bar's top and bottom, none lost)
    for (let i = 1; i <= 6; i++) {
      const mine = pieces.filter(([, st]) => st.pts[0] === i * 40);
      expect(mine.map(([, st]) => (st.span[0] === 0 ? "top" : "bottom")).sort()).toEqual(["bottom", "top"]);
    }
  });

  it("a stroke named twice is cut once", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { m1: line } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const p = cutPatch(raw, view, { pts: [150, -40, 150, 40], r: 10 }, [["ana", "m1"], ["ana", "m1"]], look);
    expect(Object.values(p.marks.ana).filter(Boolean)).toHaveLength(2);
  });

  it("the same on a card", () => {
    const marks = {};
    for (let i = 1; i <= 4; i++) marks[`k${i}`] = { c: 1, w: 4, by: "ana", pts: [-0.3 + i * 0.12, -0.3, -0.3 + i * 0.12, 0.3] };
    const raw = { scraps: { n1: { type: "note", text: "x", x: 1000, y: 1000, marks } }, links: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const L = view.scraps[0].layout.strokes;
    const ys = L.flatMap((st) => [st.pts[1], st.pts[3]]);
    const xs = L.flatMap((st) => [st.pts[0], st.pts[2]]);
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const p = cutPatch(raw, view, { pts: [Math.min(...xs) - 50, midY, Math.max(...xs) + 50, midY], r: 5 }, Object.keys(marks).map((id) => ["@n1", id]), look);
    expect(Object.values(p.scraps.n1.marks).filter(Boolean)).toHaveLength(8);
  });

  it("all of it rubbed out: the stroke goes", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { m1: line } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    expect(cutPatch(raw, view, { pts: [-20, 0, 320, 0], r: 10 }, [["ana", "m1"]], look)).toEqual({ marks: { ana: { m1: null } } });
  });

  it("never a locked stroke, or one the asker may not rub out", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { m1: { ...line, locked: true } } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    expect(cutPatch(raw, view, { pts: [150, 0], r: 10 }, [["ana", "m1"]], look)).toBeNull();
    const open = { scraps: {}, links: {}, marks: { ana: { m1: line } } };
    expect(cutPatch(open, view, { pts: [150, 0], r: 10 }, [["ana", "m1"]], look, () => false)).toBeNull();
  });

  it("on a card: cut in board px, the pieces back in the card's units, the drawer's, the card's seed", () => {
    const raw = { scraps: { n1: { type: "note", text: "x", x: 1000, y: 1000, marks: { k1: { c: 1, w: 4, by: "ana", pts: [-0.4, 0, 0.4, 0] } } } }, links: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const st = view.scraps[0].layout.strokes[0];
    const mid = { x: (st.pts[0] + st.pts[2]) / 2, y: (st.pts[1] + st.pts[3]) / 2 };
    const p = cutPatch(raw, view, { pts: [mid.x, mid.y], r: 6 }, [["@n1", "k1"]], look);
    const marks = p.scraps.n1.marks;
    expect(Object.keys(marks).sort()).toEqual(["k1", "m1"]);
    expect(marks.k1).toMatchObject({ by: "ana", seed: "cmark:n1:k1" });
    expect(Math.abs(marks.k1.pts[0] + 0.4)).toBeLessThan(0.01);
    expect(marks.m1.span[1]).toBe(1);
  });

  it("a locked card's strokes are left alone", () => {
    const raw = { scraps: { n1: { type: "note", text: "x", x: 1000, y: 1000, locked: true, marks: { k1: { c: 1, w: 4, by: "ana", pts: [-0.4, 0, 0.4, 0] } } } }, links: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const st = view.scraps[0].layout.strokes[0];
    expect(cutPatch(raw, view, { pts: [st.pts[0], st.pts[1]], r: 30 }, [["@n1", "k1"]], look)).toBeNull();
  });
});

describe("the eraser cuts (Luke, 2026-10-25)", () => {
  const live = (raw) => new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), look: () => look, painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });

  it("a click rubs out a dab where it lands", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: line } } };
    expect(live(raw).press("erase", { x: 150, y: 1 })).toEqual({ do: "cut", sweep: { pts: [150, 1], r: 14 }, strokes: [["gm", "m1"]] });
  });

  it("a drag records its path, and shows it as it goes", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: line } } };
    const c = live(raw);
    c.dragStart({ x: 150, y: -40 }, { tool: "erase" });
    c.dragMove({ x: 150, y: 0 });
    c.dragMove({ x: 150, y: 40 });
    expect(c.marks().sweep.pts.length).toBeGreaterThanOrEqual(4);
    const a = c.dragEnd();
    expect(a).toMatchObject({ do: "cut", strokes: [["gm", "m1"]] });
    expect(a.sweep.pts.slice(0, 2)).toEqual([150, -40]);
  });

  it("a long scrub keeps its whole path, thinned: a stroke it reaches at the end is cut there", () => {
    // (a stroke far off, reached only after thousands of moves back and forth)
    const far = { c: 2, w: 6, pts: [5000, -100, 5000, 100] };
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: line, m2: far } } };
    const c = live(raw);
    c.dragStart({ x: 0, y: 200 }, { tool: "erase" });
    for (let i = 1; i <= 3000; i++) c.dragMove({ x: (i % 2) * 300, y: 200 + (i % 7) * 5 });
    for (let x = 300; x <= 5000; x += 4) c.dragMove({ x, y: 0 });
    const a = c.dragEnd();
    expect(a.sweep.pts.length).toBeLessThanOrEqual(4000);
    expect(a.strokes).toContainEqual(["gm", "m2"]);
    // (the far stroke cut where the path crossed it)
    const p = cutPatch(raw, boardView(look, normalizeBoard(raw), "gm", size, measure), a.sweep, [["gm", "m2"]], look);
    expect(Object.values(p.marks.gm).filter(Boolean)).toHaveLength(2);
  });
});

describe("thinPath: an eraser's long path, thinned", () => {
  it("fits its limit, keeps both ends of a scrub back and forth, and every point within its tolerance", () => {
    const P = [];
    for (let i = 0; i <= 1000; i++) P.push((i % 2) * 100, i * 0.01);
    const T = thinPath(P, 2, 200);
    expect(T.length).toBeLessThanOrEqual(200);
    expect(Math.min(...T.filter((_, i) => i % 2 === 0))).toBeLessThan(2);
    expect(Math.max(...T.filter((_, i) => i % 2 === 0))).toBeGreaterThan(98);
    // (a short path as it is)
    expect(thinPath([1, 2, 3, 4], 2, 200)).toEqual([1, 2, 3, 4]);
  });
});
