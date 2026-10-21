// The scrapboard painter (paint.js) against a recording 2D context: it must
// leave a canvas as it found it. (Luke, 2026-10-03: a save never restored in
// the sheet's edge kept the first repainted part's clip on the canvas, so
// marker strokes drawn later showed only inside that rectangle.)
import { describe, it, expect, beforeAll } from "vitest";
import { normalizeLook, normalizeBoard, boardView } from "../src/map/scrapboard/model.js";

// a 2D context that does nothing but count how deep its saved states go
function recordingCanvas(w = 64, h = 64) {
  const c = { width: w, height: h, depth: 0, deepest: 0 };
  const ctx = new Proxy({ canvas: c }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "save") return () => { c.depth++; c.deepest = Math.max(c.deepest, c.depth); };
      if (k === "restore") return () => { c.depth = Math.max(0, c.depth - 1); };
      if (k === "measureText") return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
      if (k === "createPattern") return () => ({ setTransform() {} });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
      if (k === "getImageData") return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh) * 4) });
      if (k === "getTransform") return () => ({ inverse() { throw new Error("none"); } });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  c.getContext = () => ctx;
  return c;
}

let createPainter, sheetGeometry;
beforeAll(async () => {
  globalThis.document = { createElement: () => recordingCanvas() };
  globalThis.DOMMatrix = class { translate() { return this; } rotate() { return this; } scale() { return this; } };
  ({ createPainter, sheetGeometry } = await import("../src/map/scrapboard/paint.js"));
});

describe("the painter leaves a canvas as it found it", () => {
  it("painting the sheet whole, or a part at a time, restores every save", () => {
    const look = normalizeLook({});
    const board = normalizeBoard({ scraps: {}, links: {}, marks: { gm: { m1: { c: 1, w: 8, pts: [100, 100, 300, 200, 500, 150] } } } });
    const view = boardView(look, board, "gm", () => null, (t, px) => String(t).length * px * 0.5);
    const P = createPainter({ img: () => null, piece: () => null, measure: (t, px) => String(t).length * px * 0.5, pxs: () => 1 });
    P.set({ look, view, geo: sheetGeometry(look, () => null, () => null) });
    const c = recordingCanvas(400, 400);
    P.paintSheet(c, 1, 0, 0);
    expect(c.depth).toBe(0);
    for (const area of [{ x0: 80, y0: 80, x1: 320, y1: 220 }, { x0: 400, y0: 100, x1: 600, y1: 300 }]) {
      P.paintSheet(c, 1, 0, 0, area);
      expect(c.depth).toBe(0);
    }
    P.drawForeground(c.getContext());
    P.drawLight(c.getContext());
    expect(c.depth).toBe(0);
  });
});
