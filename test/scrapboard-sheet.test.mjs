/**
 * The sheet (Luke, 2026-10-06): its edge torn deeper (the raggedness mock's
 * A), damp and foxing (D) and more blood by default, the board's own inches
 * (each fold panel a printer's page, 11 inches tall), blood prints at their
 * own size, and the newsprint pages toned to lie in the sheet.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, sheetOutline, raggedRect, pxPerInch, printOf, PRINTS } from "../src/map/scrapboard/model.js";

describe("the sheet's edge, torn deep", () => {
  const look = normalizeLook({ size: { w: 3200, h: 4800 }, sheet: { folds: { cols: 4, rows: 5 }, edge: { margin: 4 } } });

  it("stays inside the sheet, wanders in, and is the same every time", () => {
    const pts = sheetOutline(look);
    expect(pts).toEqual(sheetOutline(look));
    let deepest = 0;
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(4 - 6);
      expect(pts[i]).toBeLessThanOrEqual(3196 + 6);
      expect(pts[i + 1]).toBeGreaterThanOrEqual(4 - 6);
      expect(pts[i + 1]).toBeLessThanOrEqual(4796 + 6);
      deepest = Math.max(deepest, Math.min(pts[i] - 4, 3196 - pts[i], pts[i + 1] - 4, 4796 - pts[i + 1]));
    }
    // (bitten somewhere well in from the straight edge)
    expect(deepest).toBeGreaterThan(30);
  });

  it("without tearing, the old fine-torn edge", () => {
    const flat = normalizeLook({ sheet: { edge: { tear: 0 } } });
    const torn = normalizeLook({});
    expect(sheetOutline(flat).length).not.toBe(sheetOutline(torn).length);
    expect(raggedRect(100, 100, { tear: 0.5 }).length).toBeGreaterThan(40);
  });
});

describe("defaults and scale", () => {
  it("damp at 60, blood at 75, the pages toned", () => {
    const look = normalizeLook({});
    expect(look.grime.damp).toBe(60);
    expect(look.grime.blood).toBe(75);
    expect(look.sheet.edge.tear).toBe(100);
    expect(look.sheet.pages).toEqual({ darken: 55, sepia: 55, contrast: 72, soak: 36 });
  });

  it("a fold panel is 11 inches tall", () => {
    const look = normalizeLook({ size: { w: 3200, h: 4800 }, sheet: { folds: { cols: 4, rows: 5 } } });
    expect(pxPerInch(look)).toBeCloseTo(960 / 11, 6);
  });

  it("knows each blood print's size", () => {
    expect(printOf("tx/blood__blood_handprint_a1")).toMatchObject({ kind: "hand", inches: 7.5 });
    expect(printOf("tx/blood__blood_splatter_a1")).toBeNull();
    for (const p of Object.values(PRINTS)) expect(p.frac).toBeGreaterThan(0.1);
  });
});
