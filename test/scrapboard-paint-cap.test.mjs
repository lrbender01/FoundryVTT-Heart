// The painter's background against a canvas factory that counts (2026-10-27).
// Luke's Map Dreamer died on a 500 m board before its first frame: the sheet
// was baked as one 25,080 px canvas (629 Mpx, which Chrome refuses without a
// word) and a layer was built for every stroke (3,452 canvases, 1.5 GB).
//   - drawBackground past BAKE_MAX_PIXELS paints live, within the area it is
//     given, and never asks for a canvas larger than the cap
//   - a stroke's layer is built only for a stroke that reaches the area
//   - a board under the cap is baked as it always was (Foundry's pictures)
//   - an incomplete bake is mended where an arrived image lies, not whole
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { normalizeLook, normalizeBoard, boardView, sheetLook, bareSheet } from "../src/map/scrapboard/model.js";

let log;
// a canvas that counts: every size it is given, the layers made, the clips cut
function trackedCanvas(w = 300, h = 150) {
  const c = { sets: 0, rects: [], transform: { a: 1, b: 0 } };
  let cw = w, ch = h;
  const note = () => { c.sets++; log.largest = Math.max(log.largest, cw * ch); log.sizes.push([cw, ch]); };
  Object.defineProperty(c, "width", { get: () => cw, set: (v) => { cw = v; note(); } });
  Object.defineProperty(c, "height", { get: () => ch, set: (v) => { ch = v; note(); } });
  const ctx = new Proxy({ canvas: c }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "setTransform") return (a, b) => { c.transform = { a, b }; };
      if (k === "getTransform") return () => ({ a: c.transform.a, b: c.transform.b, inverse() { throw new Error("none"); } });
      if (k === "rect") return (...r) => { c.rects.push(r); };
      if (k === "measureText") return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
      if (k === "createPattern") return () => ({ setTransform() {} });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
      if (k === "getImageData") return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh) * 4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  c.getContext = () => ctx;
  log.canvases.push(c);
  return c;
}

let createPainter, sheetGeometry, BAKE_MAX_PIXELS;
beforeAll(async () => {
  globalThis.document = { createElement: () => trackedCanvas() };
  globalThis.DOMMatrix = class { translate() { return this; } rotate() { return this; } scale() { return this; } };
  ({ createPainter, sheetGeometry, BAKE_MAX_PIXELS } = await import("../src/map/scrapboard/paint.js"));
});
beforeEach(() => { log = { canvases: [], sizes: [], largest: 0 }; });

const stroke = (x, y, w = 30) => ({ c: 1, w, pts: [x, y, x + 200, y + 60, x + 400, y + 10] });
const measure = (t, px) => String(t).length * px * 0.5;
function setup(look, marks, env = {}) {
  const board = normalizeBoard({ scraps: {}, links: {}, marks: { gm: marks } });
  const view = boardView(look, board, "gm", () => null, measure);
  const P = createPainter({ img: () => null, piece: () => null, measure, pxs: () => 1, ...env });
  P.set({ look, view, geo: sheetGeometry(look, () => null, () => null) });
  return P;
}
const ctxOf = () => trackedCanvas().getContext("2d");

describe("a sheet too big to bake", () => {
  const big = () => sheetLook(normalizeLook({}), { sheet: bareSheet(25000, 25000) });

  it("is a 500 m board past the cap, and a small one is not", () => {
    const P = setup(big(), {});
    expect(P.bakeFits(1)).toBe(false);
    expect(25080 * 25080).toBeGreaterThan(BAKE_MAX_PIXELS);
    expect(BAKE_MAX_PIXELS).toBe(64e6);
    expect(setup(sheetLook(normalizeLook({}), { sheet: bareSheet(3000, 3000) }), {}).bakeFits(1)).toBe(true);
  });

  it("never asks for a canvas past the cap, whatever the area", () => {
    const marks = {};
    for (let i = 0; i < 40; i++) marks[`s${i}`] = stroke((i % 8) * 3000, Math.floor(i / 8) * 4000);
    const P = setup(big(), marks);
    const g = ctxOf();
    g.canvas.transform = { a: 0.05, b: 0 };
    P.drawBackground(g, { key: "k", live: true, area: { x0: 0, y0: 0, x1: 8000, y1: 5000 } });
    // (and with no `live`: the cap alone sends it the live way)
    P.drawBackground(g, { key: "k", area: { x0: 0, y0: 0, x1: 8000, y1: 5000 } });
    expect(log.largest).toBeLessThanOrEqual(BAKE_MAX_PIXELS);
    // (nothing like the sheet's 25,080 px)
    expect(Math.max(0, ...log.sizes.flat())).toBeLessThan(4200);
  });

  it("is never baked, not even asked to be, when it is too big", () => {
    const P = setup(big(), { s1: stroke(100, 100) });
    const g = ctxOf();
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k", area: { x0: 0, y0: 0, x1: 2000, y1: 2000 } });
    // (a bake is one canvas of the sheet: here only stroke layers are made, each small)
    for (const c of log.canvases.slice(before)) expect(c.width * c.height).toBeLessThan(4096 * 4096 + 1);
  });

  it("builds a layer only for the strokes that reach the area", () => {
    const marks = {};
    for (let i = 0; i < 30; i++) marks[`s${i}`] = stroke(i * 800, 20000);
    marks.near = stroke(100, 100);
    const P = setup(big(), marks);
    const g = ctxOf();
    g.canvas.transform = { a: 1, b: 0 };
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true, area: { x0: 0, y0: 0, x1: 1000, y1: 1000 } });
    const made = log.canvases.length - before;
    // (the one near stroke, and nothing for the thirty far away)
    expect(made).toBeGreaterThanOrEqual(1);
    expect(made).toBeLessThan(6);
    const none = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true, area: { x0: 9000, y0: 9000, x1: 9500, y1: 9500 } });
    expect(log.canvases.length).toBe(none);
  });

  it("builds thousands of strokes small on the screen in one shared canvas, not a canvas each", () => {
    const marks = {};
    for (let i = 0; i < 1500; i++) marks[`s${i}`] = stroke((i % 50) * 450, Math.floor(i / 50) * 700);
    const P = setup(big(), marks);
    const g = ctxOf();
    g.canvas.transform = { a: 0.05, b: 0 };
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true, area: { x0: 0, y0: 0, x1: 25000, y1: 25000 } });
    expect(log.canvases.length - before).toBeLessThan(10);
    expect(P.layers.pieces).toBe(0);
  });

  it("keeps a board under the cap on the kept layers it always had (a second paint builds nothing)", () => {
    const look = sheetLook(normalizeLook({}), { sheet: bareSheet(2000, 1000) });
    const P = setup(look, { a: stroke(100, 100), b: stroke(600, 300) });
    const g = ctxOf();
    g.canvas.transform = { a: 1, b: 0 };
    P.drawBackground(g, { key: "k", live: true });
    expect(P.layers.pieces).toBe(2);
    const n = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true });
    expect(log.canvases.length).toBe(n);
  });

  it("builds a stroke's layer at the scale it is drawn at, and only the part in the area", () => {
    const P = setup(big(), { wide: { c: 1, w: 40, pts: [0, 0, 8000, 100, 16000, 0, 24000, 200] } });
    const g = ctxOf();
    g.canvas.transform = { a: 0.1, b: 0 };
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true, area: { x0: 0, y0: 0, x1: 3000, y1: 1000 } });
    const layers = log.canvases.slice(before);
    // (a 24,000 px stroke at 0.1 px per board px, the area's part: a few hundred px across)
    expect(layers.length).toBeGreaterThanOrEqual(1);
    for (const c of layers) expect(c.width).toBeLessThan(1000);
  });
});

describe("a sheet under the cap", () => {
  it("is baked whole as it always was, into one canvas of the sheet and its pad", () => {
    const look = sheetLook(normalizeLook({}), { sheet: bareSheet(2000, 1000) });
    const P = setup(look, {});
    expect(P.bakeFits(1)).toBe(true);
    const g = ctxOf();
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k" });
    const bake = log.canvases[before];
    expect([bake.width, bake.height]).toEqual([2080, 1080]);
    // (drawn again with nothing changed: the same bake, no new canvas)
    const n = log.canvases.length;
    P.drawBackground(g, { key: "k" });
    expect(log.canvases.length).toBe(n);
  });

  it("is painted live, whole, when asked (no area)", () => {
    const look = sheetLook(normalizeLook({}), { sheet: bareSheet(2000, 1000) });
    const P = setup(look, { s1: stroke(100, 100) });
    const g = ctxOf();
    g.canvas.transform = { a: 1, b: 0 };
    const before = log.canvases.length;
    P.drawBackground(g, { key: "k", live: true });
    for (const c of log.canvases.slice(before)) expect(c.width * c.height).toBeLessThan(2000 * 1000);
  });
});

describe("an incomplete bake", () => {
  // a sheet of one repeated paper and no grime, so the paper's arrival lies in one place
  const look = () => normalizeLook({ sheet: { mode: "tile", paper: "paper", tile: 400, scratches: [{ tex: "grime", o: 40, tile: 300 }] } });
  const flat = () => sheetLook(look(), { sheet: bareSheet(1000, 800) });

  it("is mended where the images that came lie, never baked whole again", () => {
    // (a bare sheet draws no paper: the box is the sheet's, from a card's art)
    const have = new Set();
    let epoch = 1;
    const L = { ...flat(), bare: false };
    const P = setup(L, {}, { img: (id) => (have.has(id) ? { naturalWidth: 400, naturalHeight: 400 } : null), epoch: () => epoch });
    const g = ctxOf();
    P.drawBackground(g, { key: "k" });
    const bake = log.canvases.find((c) => c.width === 1080);
    expect(bake).toBeTruthy();
    const sets = bake.sets;
    // an image nothing lies in came (a piece's picture): the epoch moves, nothing is painted
    epoch++;
    have.add("unrelated");
    P.drawBackground(g, { key: "k" });
    expect(bake.sets).toBe(sets);
    expect(bake.rects.length).toBe(0);
    // the paper came: only the box it lies in
    epoch++;
    have.add("paper");
    P.drawBackground(g, { key: "k" });
    expect(bake.sets).toBe(sets);
    expect(bake.rects.length).toBeGreaterThan(0);
    // the grime (lying anywhere) came: the sheet is baked again, whole
    epoch++;
    have.add("grime");
    P.drawBackground(g, { key: "k" });
    expect(bake.sets).toBeGreaterThan(sets);
  });
});
