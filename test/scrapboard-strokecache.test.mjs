// The brush's kept layers and the renderer's partial repaints (Luke,
// 2026-10-21: mission critical before live sessions; a year's board took
// half a minute to paint, every stroke built anew at every repaint). The
// pixels are checked in the editor (monorepo docs/mocks/heart-map/tests/
// visual/); here: the keys, the memory bound, what is built, and where an
// image that comes is painted again.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { normalizeLook, normalizeBoard, boardView } from "../src/map/scrapboard/model.js";

// a canvas that records nothing but its size and its saved states
const made = [];
function recordingCanvas(w = 64, h = 64) {
  const c = { width: w, height: h, depth: 0 };
  const ctx = new Proxy({ canvas: c }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "save") return () => { c.depth++; };
      if (k === "restore") return () => { c.depth = Math.max(0, c.depth - 1); };
      if (k === "measureText") return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
      if (k === "createPattern") return () => ({ setTransform() {} });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
      if (k === "getImageData") return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh) * 4) });
      if (k === "getTransform") return () => ({ a: 1, b: 0, inverse() { throw new Error("none"); } });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  c.getContext = () => ctx;
  return c;
}

let paint;
beforeAll(async () => {
  globalThis.document = { createElement: () => { const c = recordingCanvas(); made.push(c); return c; } };
  globalThis.DOMMatrix = class { translate() { return this; } rotate() { return this; } scale() { return this; } };
  paint = await import("../src/map/scrapboard/paint.js");
});
beforeEach(() => { made.length = 0; });

// a long stroke across the sheet, a short one, and a bright one
const STROKES = {
  gm: {
    long: { c: 1, w: 8, pts: Array.from({ length: 200 }, (_, i) => (i % 2 ? 300 + Math.round(Math.sin(i / 7) * 40) : 100 + i * 10)) },
    short: { c: 2, w: 6, pts: [400, 400, 430, 420, 470, 410] },
    bright: { c: 0, w: 10, b: 2, pts: [600, 600, 650, 640, 700, 610, 760, 650] },
  },
};
function painterFor(marks = STROKES, { img = () => null, piece = () => null, look = {} } = {}) {
  const L = normalizeLook(look);
  const view = boardView(L, normalizeBoard({ scraps: {}, links: {}, marks }), "gm", () => null, (t, px) => String(t).length * px * 0.5);
  const P = paint.createPainter({ img, piece, measure: (t, px) => String(t).length * px * 0.5, pxs: () => 1 });
  P.set({ look: L, view, geo: paint.sheetGeometry(L, () => null, () => null) });
  return P;
}

describe("pointsHash", () => {
  it("is the same for the same numbers in another array, and differs when any changes", () => {
    const a = [1, 2, 3.5, 4, 5, 6];
    expect(paint.pointsHash(a)).toBe(paint.pointsHash([...a]));
    for (let i = 0; i < a.length; i++) {
      const b = [...a];
      b[i] += 0.001;
      expect(paint.pointsHash(b)).not.toBe(paint.pointsHash(a));
    }
    expect(paint.pointsHash([1, 2, 3, 4])).not.toBe(paint.pointsHash([2, 1, 3, 4]));
    expect(paint.pointsHash([1, 2])).not.toBe(paint.pointsHash([1, 2, 0, 0]));
  });
  it("to a tenth, ignores what rounds away", () => {
    expect(paint.pointsHash([1.01, 2.04], { round: true })).toBe(paint.pointsHash([1.0, 2.0], { round: true }));
    expect(paint.pointsHash([1.01, 2.04])).not.toBe(paint.pointsHash([1.0, 2.0]));
  });
  it("is kept per array, and made again when the array grows", () => {
    const a = [1, 2, 3, 4];
    const h = paint.pointsHash(a);
    a.push(5, 6);
    expect(paint.pointsHash(a)).not.toBe(h);
    expect(paint.pointsHash(a)).toBe(paint.pointsHash([1, 2, 3, 4, 5, 6]));
  });
});

describe("StrokeLayerCache", () => {
  const part = (i0, j0, i1, j1) => ({ canvas: {}, i0, j0, i1, j1 });
  it("finds a piece by its stroke and any piece that covers the part asked for", () => {
    const C = new paint.StrokeLayerCache(1e9);
    const p = C.put("s", part(0, 0, 100, 100));
    expect(C.get("s", 10, 10, 50, 50)).toBe(p);
    expect(C.get("s", 0, 0, 100, 100)).toBe(p);
    expect(C.get("s", 50, 50, 120, 90)).toBe(null);
    expect(C.get("t", 10, 10, 50, 50)).toBe(null);
  });
  it("keeps to its budget, letting the least recently used go first", () => {
    const C = new paint.StrokeLayerCache(4 * 100 * 100 * 4);
    for (const k of ["a", "b", "c", "d"]) C.put(k, part(0, 0, 100, 100));
    expect(C.bytes).toBe(4 * 40000);
    // (a used: b is now the oldest)
    expect(C.get("a", 0, 0, 10, 10)).not.toBe(null);
    C.put("e", part(0, 0, 100, 100));
    expect(C.bytes).toBeLessThanOrEqual(C.budget);
    expect(C.get("b", 0, 0, 10, 10)).toBe(null);
    for (const k of ["a", "c", "d", "e"]) expect(C.get(k, 0, 0, 10, 10)).not.toBe(null);
  });
  it("never keeps a piece larger than a quarter of its budget", () => {
    const C = new paint.StrokeLayerCache(100 * 100 * 4);
    C.put("big", part(0, 0, 60, 60));
    expect(C.get("big", 0, 0, 1, 1)).toBe(null);
    expect(C.bytes).toBe(0);
  });
  it("lets a stroke's smaller pieces go when a piece covering them comes", () => {
    const C = new paint.StrokeLayerCache(1e9);
    C.put("s", part(0, 0, 50, 50));
    C.put("s", part(50, 0, 100, 50));
    C.put("s", part(0, 0, 100, 100));
    expect(C.pieces.size).toBe(1);
    expect(C.bytes).toBe(100 * 100 * 4);
    C.clear();
    expect(C.bytes).toBe(0);
    expect(C.get("s", 0, 0, 1, 1)).toBe(null);
  });
});

describe("arrivalAreas and sheetBands", () => {
  it("paints again only where the images that came lie", () => {
    const uses = [{ id: "a", box: { x0: 0, y0: 0, x1: 10, y1: 10 } }, { id: "b", box: { x0: 50, y0: 50, x1: 60, y1: 60 } }, { id: "c", box: null }];
    const r = paint.arrivalAreas(uses, new Set(["a"]));
    expect(r).toEqual({ whole: false, areas: [uses[0].box], rest: [uses[1], uses[2]] });
    expect(paint.arrivalAreas(uses, new Set(["c"])).whole).toBe(true);
    expect(paint.arrivalAreas(uses, new Set(["x"])).areas).toEqual([]);
  });
  it("makes more than eight parts the one box round them", () => {
    const uses = Array.from({ length: 9 }, (_, i) => ({ id: "a", box: { x0: i * 10, y0: 0, x1: i * 10 + 5, y1: 5 + i } }));
    expect(paint.arrivalAreas(uses, new Set(["a"])).areas).toEqual([{ x0: 0, y0: 0, x1: 85, y1: 13 }]);
  });
  it("cuts a tile into bands that cover it with no gap", () => {
    const R = { x0: -6.4, y0: 93.6, x1: 812.8, y1: 912.8 };
    const B = paint.sheetBands(R, 1.25);
    expect(B.length).toBe(4);
    expect(B[0].y0).toBe(R.y0);
    expect(B[B.length - 1].y1).toBe(R.y1);
    for (let i = 1; i < B.length; i++) expect(B[i].y0).toBe(B[i - 1].y1);
    for (const b of B) expect([b.x0, b.x1]).toEqual([R.x0, R.x1]);
  });
});

describe("the painter keeps its strokes' layers", () => {
  it("builds each stroke's layer once, its light pass included, and none on the next paint", () => {
    const P = painterFor();
    const c = recordingCanvas(1200, 1200);
    made.length = 0;
    P.paintSheet(c, 1, 0, 0);
    // (three strokes, the bright one's light pass from the same layer)
    expect(made.length).toBe(3);
    expect(P.layers.pieces).toBe(3);
    made.length = 0;
    P.paintSheet(c, 1, 0, 0);
    expect(made.length).toBe(0);
    expect(c.depth).toBe(0);
    P.dropLayers();
    expect(P.layers).toMatchObject({ bytes: 0, pieces: 0 });
  });
  it("builds only the part of a stroke a part of the sheet needs, and finds it again", () => {
    const P = painterFor();
    const c = recordingCanvas(1200, 1200);
    made.length = 0;
    P.paintSheet(c, 1, 0, 0, { x0: 200, y0: 200, x1: 300, y1: 400 });
    // (the long stroke alone reaches it: a part of its layer, about the area wide)
    expect(made.length).toBe(1);
    expect(made[0].width).toBeLessThan(160);
    expect(made[0].width).toBeGreaterThanOrEqual(100);
    made.length = 0;
    P.paintSheet(c, 1, 0, 0, { x0: 220, y0: 220, x1: 280, y1: 380 });
    expect(made.length).toBe(0);
  });
  it("a stroke whose points, paint, width, or brightness change is built again", () => {
    const P = painterFor();
    const c = recordingCanvas(1200, 1200);
    P.paintSheet(c, 1, 0, 0);
    const changed = structuredClone(STROKES);
    changed.gm.short.pts[0] += 1;
    changed.gm.long.c = 3;
    changed.gm.bright.b = 1;
    const L = normalizeLook({});
    P.set({ view: boardView(L, normalizeBoard({ scraps: {}, links: {}, marks: changed }), "gm", () => null, (t, px) => String(t).length * px * 0.5) });
    made.length = 0;
    P.paintSheet(c, 1, 0, 0);
    expect(made.length).toBe(3);
  });
  it("a stroke bitten by the eraser, or a piece's stretch or seed changed, is a change the sheet repaints (Luke, 2026-10-25)", () => {
    const sigOf = (marks) => painterFor(marks).markState().get("gm:short").sig;
    const was = sigOf(STROKES);
    const bitten = structuredClone(STROKES);
    bitten.gm.short.bites = [[420, 415, 6]];
    expect(sigOf(bitten)).not.toBe(was);
    const more = structuredClone(bitten);
    more.gm.short.bites.push([440, 412, 6]);
    expect(sigOf(more)).not.toBe(sigOf(bitten));
    const piece = structuredClone(STROKES);
    piece.gm.short.span = [0.2, 0.6];
    expect(sigOf(piece)).not.toBe(was);
    const seeded = structuredClone(STROKES);
    seeded.gm.short.seed = "mark:m9:6";
    expect(sigOf(seeded)).not.toBe(was);
  });

  it("never keeps a stroke being drawn or moved", () => {
    const P = painterFor();
    const g = recordingCanvas(400, 400).getContext();
    made.length = 0;
    P.drawStroke(g, STROKES.gm.short, "moving");
    P.drawStroke(g, STROKES.gm.short, "moving");
    expect(made.length).toBe(2);
    expect(P.layers.pieces).toBe(0);
  });
});

describe("the painter notes where it drew without an image", () => {
  it("a page on the sheet, by where it lies", () => {
    const look = { decor: [{ layer: "page", tex: "tx/page", x: 500, y: 500, w: 200, r: 0, o: 100 }] };
    const P = painterFor({}, { look, piece: (id) => (id === "tx/page" ? { w: 100, h: 150 } : null) });
    const c = recordingCanvas(1200, 1200);
    P.watch();
    P.paintSheet(c, 1, 0, 0);
    const uses = P.unwatch();
    const page = uses.find((u) => u.id === "tx/page");
    expect(page.box.x0).toBeLessThanOrEqual(500 - 100);
    expect(page.box.y1).toBeGreaterThanOrEqual(500 + 150);
    expect(page.box.x1).toBeLessThan(800);
    // (not watching: nothing noted)
    P.paintSheet(c, 1, 0, 0);
    expect(P.unwatch()).toEqual([]);
  });
});
