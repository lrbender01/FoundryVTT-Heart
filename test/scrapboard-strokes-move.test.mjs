/**
 * Strokes with Move (Luke, 2026-10-24): the brush's Select gone, strokes are
 * picked with Move like everything else. A card wins the click, but once it
 * is selected its own strokes are picked one by one; a right-click locks a
 * stroke (owners too), and a locked stroke is neither moved nor rubbed out;
 * Erase is for brush strokes alone; the palette restyles the selected strokes.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, applyPatch } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";

const size = () => null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({});
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false };

function live(raw, user = GM) {
  const c = new BoardControls({
    view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure),
    painter: () => ({ tagOf: () => null, onTag: () => false }),
    size,
    user: () => user,
    px: () => 1,
    raw: () => raw,
  });
  return c;
}

const sheet = () => ({ scraps: {}, links: {}, marks: { gm: { m1: { c: 2, w: 6, pts: [100, 100, 200, 100, 300, 100] } } } });

describe("a stroke on the sheet with Move", () => {
  it("hovering it makes it the hot one", () => {
    const c = live(sheet());
    c.hover({ x: 200, y: 102 }, "move");
    expect(JSON.stringify(c.marks().hot ?? null)).toContain("m1");
  });

  it("right-click locks it, and again lets it go", () => {
    const raw = sheet();
    const c = live(raw);
    const a = c.press("move", { x: 200, y: 102 }, { right: true });
    expect(a).toEqual({ do: "patch", patch: { marks: { gm: { m1: { c: 2, w: 6, pts: [100, 100, 200, 100, 300, 100], locked: true } } } } });
    applyPatch(raw, a.patch);
    const b = c.press("move", { x: 200, y: 102 }, { right: true });
    expect(b.patch.marks.gm.m1.locked).toBeUndefined();
  });

  it("locked, it does not move with a drag", () => {
    const raw = sheet();
    raw.marks.gm.m1.locked = true;
    const c = live(raw);
    c.press("move", { x: 200, y: 102 });
    expect(c.dragStart({ x: 200, y: 102 }, { tool: "move" })).not.toBe("mmove");
  });

  it("an owner may lock a stroke of their own, never another's", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { a1: { c: 1, w: 6, pts: [100, 300, 300, 300] } }, gm: { m1: { c: 2, w: 6, pts: [100, 100, 300, 100] } } } };
    const c = live(raw, ANA);
    expect(c.press("move", { x: 200, y: 301 }, { right: true })?.patch?.marks?.ana?.a1?.locked).toBe(true);
    expect(c.press("move", { x: 200, y: 101 }, { right: true })?.patch?.marks?.gm).toBeUndefined();
  });
});

describe("Erase: brush strokes alone", () => {
  it("a click on a stroke rubs it out", () => {
    const c = live(sheet());
    expect(c.press("erase", { x: 200, y: 102 })).toMatchObject({ do: "cut", strokes: [["gm", "m1"]] });
  });

  it("never a locked stroke, by click or by drag", () => {
    const raw = sheet();
    raw.marks.gm.m1.locked = true;
    const c = live(raw);
    expect(c.press("erase", { x: 200, y: 102 })).toBeNull();
    expect(c.dragStart({ x: 200, y: 80 }, { tool: "erase" })).toBe("unmark");
    c.dragMove({ x: 200, y: 120 });
    expect(c.dragEnd()).toBeNull();
  });

  it("a drag across a stroke rubs it out", () => {
    const c = live(sheet());
    c.dragStart({ x: 200, y: 80 }, { tool: "erase" });
    c.dragMove({ x: 200, y: 100 });
    c.dragMove({ x: 200, y: 120 });
    expect(c.dragEnd()).toMatchObject({ do: "cut", strokes: [["gm", "m1"]] });
  });

  it("leaves a card, a pin, and a string alone", () => {
    const raw = { scraps: { n1: { type: "note", text: "Down past the Grip", x: 1000, y: 1000 } }, links: {}, pins: { p1: { x: 1500, y: 1500 } } };
    const c = live(raw);
    expect(c.press("erase", { x: 1000, y: 1000 })).toBeNull();
    expect(c.press("erase", { x: 1500, y: 1500 })).toBeNull();
  });

  it("a player rubs out their own strokes, never the GM's", () => {
    const raw = { scraps: {}, links: {}, marks: { ana: { a1: { c: 1, w: 6, pts: [100, 300, 300, 300] } }, gm: { m1: { c: 2, w: 6, pts: [100, 100, 300, 100] } } } };
    const c = live(raw, ANA);
    expect(c.press("erase", { x: 200, y: 301 })).toMatchObject({ do: "cut", strokes: [["ana", "a1"]] });
    expect(c.press("erase", { x: 200, y: 101 })).toBeNull();
  });
});

describe("a card's strokes with Move", () => {
  const card = () => ({ scraps: { n1: { type: "note", text: "x", x: 1000, y: 1000, marks: { k1: { c: 1, w: 4, by: "gm", pts: [-20, 0, 20, 0] } } } }, links: {} });

  it("the card wins the first click; selected, its stroke is picked alone", () => {
    const raw = card();
    const c = live(raw);
    const st = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0].layout.strokes?.[0];
    expect(st).toBeTruthy();
    const at = { x: (st.pts[0] + st.pts[2]) / 2, y: (st.pts[1] + st.pts[3]) / 2 };
    c.press("move", at);
    expect(c.selection.has("n1")).toBe(true);
    expect(c.markSel.size).toBe(0);
    c.press("move", at);
    expect([...c.markSel].map((k) => JSON.parse(k))).toEqual([["@n1", "k1"]]);
  });

  it("selected, its stroke over the writing is the hot one, and a drag moves it, not the writing", () => {
    const raw = card();
    const c = live(raw);
    const st = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0].layout.strokes[0];
    // (along it, clear of the writing's dot: there the reticle wins, Luke 2026-10-25)
    const len = Math.hypot(st.pts[2] - st.pts[0], st.pts[3] - st.pts[1]);
    const at = { x: (st.pts[0] + st.pts[2]) / 2 + ((st.pts[2] - st.pts[0]) / len) * 45, y: (st.pts[1] + st.pts[3]) / 2 + ((st.pts[3] - st.pts[1]) / len) * 45 };
    c.press("move", at);
    c.hover(at, "move");
    expect(JSON.stringify(c.marks().hot ?? null)).toContain("k1");
    expect(c.dragStart(at, { tool: "move" })).toBe("mmove");
    expect(c.part).toBeNull();
  });
});

describe("the palette restyles the selected strokes (no Select mode)", () => {
  it("paint, brightness, and width, in Move", () => {
    const raw = sheet();
    const c = live(raw);
    c.press("move", { x: 200, y: 102 });
    expect(c.markSel.size).toBe(1);
    expect(c.restylePatch({ c: 5, b: 0, w: 9 })).toEqual({ marks: { gm: { m1: { c: 5, b: 0, w: 9, pts: [100, 100, 200, 100, 300, 100] } } }, scraps: {} });
  });

  it("nothing selected, nothing changes", () => {
    expect(live(sheet()).restylePatch({ c: 5 })).toBeNull();
  });
});

describe("the reticle over a stroke (Luke, 2026-10-25)", () => {
  // a note with a pin stuck in its middle, and a stroke on it through the pin
  const board = () => ({
    scraps: { n1: { type: "note", x: 500, y: 500, text: "here", marks: { k1: { by: "gm", c: 1, w: 6, pts: [-0.45, 0, 0.45, 0] } } } },
    links: {}, pins: { p1: { tex: "t", on: "n1", at: { u: 0, v: 0 } } }, marks: {},
  });

  it("shows on the pin, and a press takes the pin, not the stroke", () => {
    const raw = board();
    const c = live(raw);
    c.press("move", { x: 560, y: 560 });
    expect(c.selection.has("n1")).toBe(true);
    const pin = boardView(look, normalizeBoard(raw), "gm", size, measure).pins.find((p) => p.id === "p1");
    c.hover({ x: pin.x, y: pin.y }, "move");
    expect(c.marks().grab).toBeTruthy();
    // (held: its ring shows)
    c.grab.since -= 10000;
    c.press("move", { x: pin.x + 1, y: pin.y });
    expect([...c.pins]).toEqual(["p1"]);
    expect(c.markSel.size).toBe(0);
  });

  it("away from the reticle, the stroke is taken", () => {
    const raw = board();
    const c = live(raw);
    c.press("move", { x: 560, y: 560 });
    const st = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0].layout.strokes[0];
    const at = { x: st.pts[0] + (st.pts[2] - st.pts[0]) * 0.9, y: st.pts[1] + (st.pts[3] - st.pts[1]) * 0.9 };
    c.hover(at, "move");
    c.press("move", at);
    expect(c.markSel.size).toBe(1);
  });
});
