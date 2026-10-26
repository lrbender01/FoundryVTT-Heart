/**
 * What the renderer paints again after an edit (2026-10-25, changes.js, out
 * of render.js: the audit's last test gap). A piece missed here is an edit
 * that never shows until something else repaints there.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { normalizeLook, normalizeBoard, boardView } from "../src/map/scrapboard/model.js";

let C;
beforeAll(async () => {
  // (paint.js makes canvases; none are drawn here)
  globalThis.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({}) }) }) };
  C = await import("../src/map/scrapboard/changes.js");
});

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] } });
const view = (raw) => boardView(look, normalizeBoard(raw), "gm", size, measure);
const painter = (marks = new Map()) => ({ tagOf: () => null, markState: () => marks });
const RAW = () => ({
  scraps: { n1: { type: "note", text: "hello", x: 1000, y: 1000 } },
  links: {},
  pins: { p1: { id: "p1", tex: "tx/pin", x: 400, y: 400 } },
});

describe("sigOf and boxOf", () => {
  it("compares numbers to a tenth, and a long run of numbers by its hash", () => {
    expect(C.sigOf({ x: 1.04 })).toBe(C.sigOf({ x: 1.0 }));
    expect(C.sigOf({ x: 1.06 })).not.toBe(C.sigOf({ x: 1.0 }));
    const long = Array.from({ length: 40 }, (_, i) => i);
    expect(C.sigOf({ pts: long })).toMatch(/#40:/);
    expect(C.sigOf({ pts: long })).not.toBe(C.sigOf({ pts: long.map((v, i) => (i === 7 ? v + 1 : v)) }));
  });
  it("the box round points, padded; none for no points", () => {
    expect(C.boxOf([0, 0, 10, 20], 5)).toEqual({ x0: -5, y0: -5, x1: 15, y1: 25 });
    expect(C.boxOf([])).toBeNull();
  });
});

describe("piecesOf and changes", () => {
  it("nothing changed, nothing to paint", () => {
    const a = C.piecesOf(view(RAW()), painter());
    const b = C.piecesOf(view(RAW()), painter());
    expect(C.changes(a, b)).toEqual([]);
  });

  it("a card moved: where it was and where it is", () => {
    const moved = RAW();
    moved.scraps.n1.x = 1600;
    const out = C.changes(C.piecesOf(view(RAW()), painter()), C.piecesOf(view(moved), painter()));
    expect(out).toHaveLength(2);
    expect(out[0].box.x0).toBeLessThan(1000);
    expect(out[1].box.x1).toBeGreaterThan(1600);
    expect(out.every((c) => !c.sheet)).toBe(true);
  });

  it("a pin taken off: where it was; a new one: where it is", () => {
    const gone = RAW();
    delete gone.pins.p1;
    const out = C.changes(C.piecesOf(view(RAW()), painter()), C.piecesOf(view(gone), painter()));
    expect(out).toHaveLength(1);
    expect(C.meets(out[0].box, { x0: 400, y0: 400, x1: 400, y1: 400 })).toBe(true);
  });

  it("a stroke changed repaints the sheet where it lies", () => {
    const box = { x0: 10, y0: 10, x1: 50, y1: 50 };
    const was = C.piecesOf(view(RAW()), painter(new Map([["gm:m1", { sig: "a", box }]])));
    const now = C.piecesOf(view(RAW()), painter(new Map([["gm:m1", { sig: "b", box }]])));
    expect(C.changes(was, now)).toEqual([{ box, sheet: true }, { box, sheet: true }]);
  });

  it("anyMeets: whether anything drawn reaches a tile (a bare board's empty tiles never painted; Luke, 2026-10-26)", () => {
    const P = C.piecesOf(view(RAW()), painter(new Map([["gm:m1", { sig: "a", box: { x0: 5000, y0: 5000, x1: 5100, y1: 5100 } }]])));
    expect(C.anyMeets(P, { x0: 0, y0: 0, x1: 200, y1: 200 })).toBe(false);
    expect(C.anyMeets(P, { x0: 350, y0: 350, x1: 450, y1: 450 })).toBe(true);
    expect(C.anyMeets(P, { x0: 5050, y0: 5050, x1: 6000, y1: 6000 })).toBe(true);
    expect(C.anyMeets(new Map(), { x0: 0, y0: 0, x1: 1e6, y1: 1e6 })).toBe(false);
  });

  it("a long string: a box for each stretch, not one round it all", () => {
    const raw = { ...RAW(), pins: { a: { id: "a", tex: "tx/pin", x: 100, y: 100 }, b: { id: "b", tex: "tx/pin", x: 4000, y: 3000 } }, links: { l1: { id: "l1", aPin: "a", bPin: "b", kind: "plain", joints: [] } } };
    const p = C.piecesOf(view(raw), painter()).get("l:l1");
    expect(p?.boxes?.length).toBeGreaterThan(1);
    for (const b of p.boxes) expect(b.x1 - b.x0).toBeLessThan(3900);
  });
});
