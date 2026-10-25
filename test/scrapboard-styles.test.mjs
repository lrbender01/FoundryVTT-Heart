/**
 * Board styles and sizes (Luke, 2026-10-25): a board's pages their own size
 * (the tiling), its sheet reshaped from the scene's Board tab, and a board on
 * its scene's own background (any scene a board: no sheet, the scene's size).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, sheetLook, pageOf, reshapeSheet, resizeSheet, bareSheet, isBareBoard, boardSheet, pxPerInch, normalizeBoard } from "../src/map/scrapboard/model.js";

const look = normalizeLook({});
const P = look.page;

describe("a board's pages their own size", () => {
  it("the sheet is cols x rows of them; the grid's inch stays the style's", () => {
    const raw = { sheet: { cols: 3, rows: 2, left: 0, top: 0, pw: 1000, ph: 1200 } };
    const L = sheetLook(look, raw);
    expect(L.w).toBe(3000);
    expect(L.h).toBe(2400);
    expect(L.page).toMatchObject({ w: 1000, h: 1200, w0: P.w, h0: P.h });
    expect(pxPerInch(L)).toBeCloseTo(pxPerInch(look));
    expect(pageOf(look, raw)).toEqual({ w: 1000, h: 1200 });
  });

  it("none given: the style's own page, as before", () => {
    const raw = { sheet: { cols: 2, rows: 2, left: 1, top: 0 } };
    const L = sheetLook(look, raw);
    expect(L.w).toBe(Math.round(P.w * 2));
    expect(pageOf(look, raw)).toEqual({ w: P.w, h: P.h });
  });

  it("a page too small or too big is the style's, or held to the most", () => {
    expect(boardSheet(look, { sheet: { cols: 1, rows: 1, pw: 20 } }).pw).toBeUndefined();
    expect(boardSheet(look, { sheet: { cols: 1, rows: 1, pw: 99999 } }).pw).toBe(6000);
  });

  it("resized a page at a time by its own pages, keeping their size", () => {
    const raw = { sheet: { cols: 2, rows: 2, left: 0, top: 0, pw: 500, ph: 500 } };
    const r = resizeSheet(look, raw, { left: 1 });
    expect(r.sheet).toMatchObject({ cols: 3, left: 1, pw: 500, ph: 500 });
    expect(r.dx).toBe(500);
  });
});

describe("the sheet reshaped (the Board tab)", () => {
  it("pages and page size; nothing placed moves", () => {
    const r = reshapeSheet(look, { sheet: { cols: 4, rows: 4, left: 0, top: 0 } }, { cols: 6, rows: 3, pw: 900, ph: 0 });
    expect(r.sheet).toEqual({ cols: 6, rows: 3, left: 0, top: 0, pw: 900 });
  });

  it("never through what is placed: refused with the size it needs", () => {
    const r = reshapeSheet(look, null, { cols: 1, rows: 1 }, { x0: 10, y0: 10, x1: 2500, y1: 300 });
    expect(r).toEqual({ refused: "right", w: 2500, h: 300 });
  });

  it("a bare board gets a sheet of the style's", () => {
    const r = reshapeSheet(look, { sheet: bareSheet(1920, 1080) }, { cols: 2, rows: 2 });
    expect(r.sheet).toEqual({ cols: 2, rows: 2, left: 0, top: 0 });
  });
});

describe("growing a sheet with something hanging past it (Luke, 2026-10-25)", () => {
  // (a card over the sheet's left and bottom edges)
  const past = { x0: -40, y0: 10, x1: 300, y1: 99999 };
  const raw = { sheet: { cols: 2, rows: 2, left: 0, top: 0 } };

  it("pages added on any side are never refused", () => {
    for (const side of ["left", "right", "top", "bottom"]) expect(resizeSheet(look, raw, { [side]: 1 }, past).sheet).toBeTruthy();
  });

  it("a side coming in still never cuts through it", () => {
    expect(resizeSheet(look, raw, { left: -1 }, past)).toEqual({ refused: "left" });
  });

  it("the Board tab grows it too, and refuses only shrinking through it", () => {
    expect(reshapeSheet(look, raw, { cols: 3, rows: 3 }, past).sheet).toBeTruthy();
    expect(reshapeSheet(look, raw, { cols: 2, rows: 1 }, past).refused).toBe("bottom");
  });
});

describe("a board on its scene's own background", () => {
  const raw = { sheet: bareSheet(1920, 1080) };

  it("no sheet, light, or wash; the scene's size, one page", () => {
    const L = sheetLook(look, raw);
    expect(L.bare).toBe(true);
    expect([L.w, L.h]).toEqual([1920, 1080]);
    expect(L.fire + L.glow + L.vignette + L.wash.bottom).toBe(0);
    expect(L.sheet.folds).toMatchObject({ cols: 1, rows: 1 });
    expect(L.decor).toEqual([]);
    // (its cards, strings, and paints the style's)
    expect(L.ink.marker).toBe(look.ink.marker);
  });

  it("kept as it is read and written; its sheet never resized by pages", () => {
    expect(isBareBoard(raw)).toBe(true);
    expect(normalizeBoard(raw).sheet).toEqual({ bare: true, w: 1920, h: 1080 });
    expect(resizeSheet(look, raw, { right: 1 })).toEqual({ refused: "bare" });
    // (a sheet left over beside it is passed over)
    expect(isBareBoard({ sheet: { cols: 3, rows: 3, bare: true, w: 800, h: 600 } })).toBe(true);
  });

  it("the same look for the same board, so a host's caches hold", () => {
    expect(sheetLook(look, raw)).toBe(sheetLook(look, { sheet: bareSheet(1920, 1080) }));
  });
});
