/**
 * Strokes, owned or public (Luke, 2026-10-25): a stroke's maker (its layer
 * on the sheet, `by` on a card) or the GM makes it public, and then anyone may
 * move, restyle, lock, or rub it out; the pointer says whose it is. A stroke
 * let go of its lock, or made its maker's again, is written `false`, never
 * left out (Foundry merges a written object into the stored one: a stroke
 * could be locked, never unlocked). The Pin tool's pin, shown where it will go.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, sharePatch, mayShareStroke, strokeMaker, cleanStroke, pinPreview, pinScale } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";
import { patchData, strokeOver } from "../src/map/scrapboard/api.js";
import { mayHistory } from "../src/map/scrapboard/notes.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] } });
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false, owner: false };
const BO = { id: "bo", isGM: false, owner: false };

const live = (raw, user) => new BoardControls({
  view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure),
  look: () => look,
  painter: () => ({ tagOf: () => null, onTag: () => false }),
  size,
  user: () => user,
  px: () => 1,
  raw: () => raw,
});
const sheet = (extra = {}) => ({ scraps: {}, links: {}, marks: { ana: { a1: { c: 1, w: 6, pts: [100, 100, 300, 100], ...extra } } } });

describe("a lock let go is written false (Luke, 2026-10-25: strokes never unlocked)", () => {
  it("strokeOver keeps a key the stored stroke has as false", () => {
    expect(strokeOver({ locked: true, c: 1 }, { c: 1 })).toEqual({ c: 1, locked: false });
    expect(strokeOver({ open: true }, { c: 2 })).toEqual({ c: 2, open: false });
    expect(strokeOver({ c: 1 }, { c: 2 })).toEqual({ c: 2 });
    expect(strokeOver(null, { c: 2 })).toEqual({ c: 2 });
  });

  it("patchData writes it so for the sheet's strokes and a card's", () => {
    const scene = { flags: { heart: { board: { scraps: { n1: { type: "note", marks: { k1: { c: 1, w: 4, by: "ana", pts: [0, 0, 1, 1], locked: true } } } }, links: {}, marks: { ana: { a1: { c: 1, w: 6, pts: [0, 0, 5, 5], locked: true } } } } } } };
    const data = patchData(scene, { marks: { ana: { a1: { c: 1, w: 6, pts: [0, 0, 5, 5] } } }, scraps: { n1: { marks: { k1: { c: 1, w: 4, by: "ana", pts: [0, 0, 1, 1] } } } } });
    expect(data["flags.heart.board.marks.ana.a1"].locked).toBe(false);
    expect(data["flags.heart.board.scraps.n1.marks.k1"].locked).toBe(false);
    // (and read back, a false lock is no lock)
    expect("locked" in cleanStroke({ c: 1, w: 6, pts: [0, 0, 5, 5], locked: false })).toBe(false);
  });

  it("a right-click lets a locked stroke go, written false", () => {
    const raw = sheet({ locked: true });
    const c = live(raw, ANA);
    const a = c.press("move", { x: 200, y: 101 }, { right: true });
    const scene = { flags: { heart: { board: raw } } };
    expect(patchData(scene, a.patch)["flags.heart.board.marks.ana.a1"].locked).toBe(false);
  });
});

describe("public strokes (Luke, 2026-10-25)", () => {
  it("its maker or the GM switches it; nobody else", () => {
    const st = sheet().marks.ana.a1;
    expect(strokeMaker("ana", st)).toBe("ana");
    expect(strokeMaker("@n1", { by: "bo" })).toBe("bo");
    expect(mayShareStroke("ana", st, ANA)).toBe(true);
    expect(mayShareStroke("ana", st, GM)).toBe(true);
    expect(mayShareStroke("ana", st, BO)).toBe(false);
  });

  it("sharePatch writes the stroke whole, open true or false", () => {
    const raw = sheet();
    expect(sharePatch(raw, null, { strokes: [["ana", "a1"]] }, true, ANA)).toEqual({ marks: { ana: { a1: { c: 1, w: 6, pts: [100, 100, 300, 100], open: true } } } });
    expect(sharePatch(raw, null, { strokes: [["ana", "a1"]] }, true, BO)).toBeNull();
    const open = sheet({ open: true });
    expect(sharePatch(open, null, { strokes: [["ana", "a1"]] }, false, ANA).marks.ana.a1.open).toBe(false);
  });

  it("Shift+right-click switches it, its maker's; another's is refused", () => {
    const raw = sheet();
    expect(live(raw, ANA).press("move", { x: 200, y: 101 }, { right: true, shift: true })).toMatchObject({ do: "share", on: true, sel: { strokes: [["ana", "a1"]] } });
    expect(live(raw, BO).press("move", { x: 200, y: 101 }, { right: true, shift: true })).toEqual({ do: "refuse", why: "not-maker" });
  });

  it("the toolbar's Public takes the selected strokes", () => {
    const raw = sheet();
    const c = live(raw, ANA);
    c.press("move", { x: 200, y: 101 });
    expect(c.shareState()).toEqual({ on: true, n: 1 });
    expect(c.shareSel().strokes).toEqual([["ana", "a1"]]);
    expect(c.sharePatch().marks.ana.a1.open).toBe(true);
  });

  it("public, anyone may take hold of it and rub it out; private, only its maker", () => {
    const priv = live(sheet(), BO);
    expect(priv.press("erase", { x: 200, y: 101 })).toBeNull();
    priv.press("move", { x: 200, y: 101 });
    expect(priv.markSel.size).toBe(0);
    const pub = live(sheet({ open: true }), BO);
    expect(pub.press("erase", { x: 200, y: 101 })).toMatchObject({ do: "cut", strokes: [["ana", "a1"]] });
    pub.press("move", { x: 200, y: 101 });
    expect(pub.markSel.size).toBe(1);
  });

  it("the pointer says whose a stroke is", () => {
    const c = live(sheet(), BO);
    c.hover({ x: 200, y: 101 }, "move");
    expect(c.over).toMatchObject({ kind: "stroke", author: "ana", open: false });
    const p = live(sheet({ open: true }), BO);
    p.hover({ x: 200, y: 101 }, "inspect");
    expect(p.over).toMatchObject({ kind: "stroke", author: "ana", open: true });
  });

  it("a player may undo their edit of a public stroke in another's layer", () => {
    const board = sheet({ open: true });
    const rec = { ops: [{ path: ["marks", "ana", "a1", "c"], b: 1, a: 4 }] };
    expect(mayHistory(board, rec, "before", BO)).toBe(true);
    expect(mayHistory(sheet(), rec, "before", BO)).toBe(false);
  });
});

describe("the Pin tool's pin, where it will go (Luke, 2026-10-25)", () => {
  it("loose on the sheet, at the board's size for a pin", () => {
    const raw = { scraps: {}, links: {}, pins: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const p = pinPreview(raw, view, look, "tx/pin", { x: 50, y: 60 });
    expect(p).toMatchObject({ tex: "tx/pin", x: 50, y: 60, on: null, locked: false });
    expect(p.w).toBeCloseTo(Math.max(11, look.scrap.w * 0.13 * 0.85) * pinScale("tx/pin"), 5);
  });

  it("stuck in the card under it; a locked card says so", () => {
    const raw = { scraps: { n1: { type: "note", text: "x", x: 1000, y: 1000, locked: true } }, links: {}, pins: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const B = view.scraps[0].layout.box ?? view.scraps[0].layout.paper;
    const p = pinPreview(raw, view, look, "tx/pin", { x: B.cx, y: B.cy });
    expect(p.on).toBe("n1");
    expect(p.locked).toBe(true);
    expect(Math.hypot(p.x - B.cx, p.y - B.cy)).toBeLessThan(2);
  });
});
