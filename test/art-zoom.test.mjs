/**
 * The art viewer's zoom and pan (src/common/art-zoom.js, 2026-10-02): the
 * wheel zooms about the cursor, a drag pans, and the image always covers the
 * stage between 1x and 12x.
 */

import { describe, it, expect } from "vitest";
import { clampPan, zoomAt, panBy, wheelFactor, FITTED, MAX_ZOOM } from "../src/common/art-zoom.js";

const size = { w: 800, h: 600 };
// the stage point a spot of the image (in fitted px) sits at
const at = (v, s) => ({ x: v.x + s.x * v.k, y: v.y + s.y * v.k });

describe("zooming about the cursor", () => {
  it("the spot under the cursor stays under it", () => {
    const p = { x: 300, y: 200 };
    const v = zoomAt(FITTED, p, 2, size);
    expect(v.k).toBe(2);
    expect(at(v, { x: 300, y: 200 })).toEqual(p);
    // and again, from the zoomed view, about another point
    const q = { x: 650, y: 500 };
    const spot = { x: (q.x - v.x) / v.k, y: (q.y - v.y) / v.k };
    const w = zoomAt(v, q, 1.5, size);
    expect(at(w, spot).x).toBeCloseTo(q.x, 6);
    expect(at(w, spot).y).toBeCloseTo(q.y, 6);
  });

  it("never below fitted nor above 12x", () => {
    expect(zoomAt(FITTED, { x: 10, y: 10 }, 0.5, size)).toEqual({ k: 1, x: 0, y: 0 });
    expect(zoomAt({ k: 10, x: -100, y: -100 }, { x: 0, y: 0 }, 4, size).k).toBe(MAX_ZOOM);
  });

  it("zooming back out to fitted puts the piece back", () => {
    const v = zoomAt(FITTED, { x: 700, y: 50 }, 3, size);
    expect(zoomAt(v, { x: 100, y: 500 }, 1 / 3, size)).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe("panning", () => {
  it("moves with the drag", () => {
    const v = { k: 2, x: -400, y: -300 };
    expect(panBy(v, 50, -20, size)).toEqual({ k: 2, x: -350, y: -320 });
  });

  it("stops at the image's edges: no gap shows", () => {
    expect(panBy({ k: 2, x: -10, y: -10 }, 100, 100, size)).toEqual({ k: 2, x: 0, y: 0 });
    expect(panBy({ k: 2, x: -790, y: -590 }, -100, -100, size)).toEqual({ k: 2, x: -800, y: -600 });
  });

  it("fitted, it doesn't move", () => {
    expect(panBy(FITTED, 120, -40, size)).toEqual({ k: 1, x: 0, y: 0 });
  });

  it("clampPan keeps a view in bounds", () => {
    expect(clampPan({ k: 0.2, x: 5, y: 5 }, size)).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe("the wheel", () => {
  it("down zooms out, up zooms in, about 16% a notch", () => {
    expect(wheelFactor(-100)).toBeCloseTo(1.1618, 3);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });
});
