/**
 * A map's sheet grown or cut a page at a time, on any side (Luke,
 * 2026-10-24): each board its own pages (model.js sheetLook, boardSheet),
 * never smaller than what is placed (resizeSheet, contentBounds), everything
 * placed moved with a page added or cut on the left or top (shiftBoard), each
 * page's paper and folds seeded by its place among the look's own pages so
 * nothing already there changes (sheetPanels, foldLines, sheetPages), and
 * depth fixed per page (depthAt).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, sheetLook, boardSheet, resizeSheet, resizedBoard, contentBounds, sheetPanels, sheetPages, foldLines, depthAt, shiftBoard } from "../src/map/scrapboard/model.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ size: { w: 3200, h: 3600 }, sheet: { folds: { cols: 4, rows: 4 }, papers: ["a", "b", "c", "d", "e"] }, pools: { notes: ["tx/paper"], papers: ["tx/paper"] } });
const P = look.page;

describe("a board's own sheet", () => {
  it("is the look's until it has one", () => {
    expect(sheetLook(look, {})).toBe(look);
    expect(boardSheet(look, {})).toEqual({ cols: 4, rows: 4, left: 0, top: 0 });
  });
  it("grows a page at a time: its size, its grid, the same object for the same sheet", () => {
    const L = sheetLook(look, { sheet: { cols: 6, rows: 5, left: 1, top: 0 } });
    expect([L.w, L.h]).toEqual([P.w * 6, P.h * 5]);
    expect(L.sheet.folds.cols).toBe(6);
    expect(sheetLook(look, { sheet: { cols: 6, rows: 5, left: 1, top: 0 } })).toBe(L);
  });
  it("keeps every page's paper and fold where it was when pages are added on the left and top", () => {
    const before = sheetPanels(look);
    const L = sheetLook(look, { sheet: { cols: 5, rows: 5, left: 1, top: 1 } });
    const after = sheetPanels(L);
    // (the look's first page is now the second across and down)
    for (const p of before) {
      const q = after.find((x) => Math.abs(x.x - (p.x + P.w)) < 0.5 && Math.abs(x.y - (p.y + P.h)) < 0.5);
      expect(q.tex === p.tex || before.length < 3).toBe(true);
      expect([q.flipX, q.flipY, q.dx, q.dy]).toEqual([p.flipX, p.flipY, p.dx, p.dy]);
    }
    const fv = foldLines(look).find((f) => f.along === "y" && f.at === 1);
    const gv = foldLines(L).find((f) => f.along === "y" && f.at === 2);
    expect(gv.pts[2] - P.w).toBeCloseTo(fv.pts[2], 1);
    expect(sheetPages(L).find((p) => p.c === 1 && p.r === 1)).toMatchObject({ ac: 0, ar: 0 });
  });
  it("depth is fixed per page: growing the sheet never changes it; pages below the look's foot are as deep", () => {
    const L = sheetLook(look, { sheet: { cols: 4, rows: 7, left: 0, top: 1 } });
    expect(depthAt(P.h + 1000, L)).toBeCloseTo(depthAt(1000, look), 6);
    expect(depthAt(L.h - 10, L)).toBe(1);
    expect(depthAt(10, L)).toBe(0);
  });
});

describe("resizing a sheet", () => {
  const raw = () => ({ scraps: { n: { type: "note", text: "near the left", x: 500, y: 500, paper: "tx/paper" } }, links: { l: { aPt: { x: 900, y: 900 }, bPt: { x: 1100, y: 1000 }, kind: "path" } }, pins: { p: { tex: "t", x: 1200, y: 1200 } }, marks: { gm: { m1: { c: 0, w: 6, pts: [1500, 1500, 1600, 1600] } } }, bits: {}, decor: [], bin: { b: { at: 1, scrap: { type: "note", text: "x", x: 10, y: 10 } } } });
  const bounds = (r) => contentBounds(boardView(sheetLook(look, r), normalizeBoard(r), "gm", size, measure), size);
  it("adds pages on the left and top, moving everything placed by them", () => {
    const r = raw();
    const next = resizedBoard(look, r, { left: 1, top: 2 }, bounds(r));
    expect(next.sheet).toEqual({ cols: 5, rows: 6, left: 1, top: 2 });
    expect(next.scraps.n.x).toBe(500 + Math.round(P.w));
    expect(next.scraps.n.y).toBe(500 + Math.round(2 * P.h));
    expect(next.links.l.aPt.x).toBe(900 + Math.round(P.w));
    expect(next.pins.p.y).toBe(1200 + Math.round(2 * P.h));
    expect(next.marks.gm.m1.pts[0]).toBe(1500 + Math.round(P.w));
    expect(next.bin.b.scrap.x).toBe(10 + Math.round(P.w));
  });
  it("adds pages on the right and bottom, moving nothing", () => {
    const r = raw();
    const next = resizedBoard(look, r, { right: 3, bottom: 1 }, bounds(r));
    expect(next.sheet).toEqual({ cols: 7, rows: 5, left: 0, top: 0 });
    expect(next.scraps.n.x).toBe(500);
  });
  it("never cuts through what is placed, nor below a page", () => {
    const r = raw();
    expect(resizeSheet(look, r, { left: -1 }, bounds(r))).toEqual({ refused: "left" });
    expect(resizeSheet(look, r, { right: -1 }, bounds(r)).sheet).toEqual({ cols: 3, rows: 4, left: 0, top: 0 });
    expect(resizeSheet(look, r, { right: -2 }, bounds(r))).toEqual({ refused: "right" });
    expect(resizeSheet(look, {}, { left: -2, right: -2 }, null)).toEqual({ refused: "left" });
    expect(resizeSheet(look, {}, { left: -3 }, null).sheet).toEqual({ cols: 1, rows: 4, left: -3, top: 0 });
  });
  it("a page taken away on the left moves everything back, and the pages keep their places", () => {
    const r = resizedBoard(look, raw(), { left: 2 }, null);
    const back = resizedBoard(look, r, { left: -2 }, null);
    expect(back.sheet).toEqual({ cols: 4, rows: 4, left: 0, top: 0 });
    expect(back.scraps.n.x).toBe(500);
  });
  it("shiftBoard leaves pins in cards and string joints held by pins alone", () => {
    const b = { pins: { on: { tex: "t", on: "n", at: { u: 0, v: 0 } } }, links: { l: { aPin: "on", bPt: { x: 1, y: 1 }, joints: [{ pin: "on" }, { x: 5, y: 5 }] } } };
    shiftBoard(b, 10, 20);
    expect(b.pins.on).toEqual({ tex: "t", on: "n", at: { u: 0, v: 0 } });
    expect(b.links.l.joints).toEqual([{ pin: "on" }, { x: 15, y: 25 }]);
    expect(b.links.l.bPt).toEqual({ x: 11, y: 21 });
  });
});
