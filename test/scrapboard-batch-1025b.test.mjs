/**
 * The seventh map batch (Luke, 2026-10-25): strings with no kind (a white
 * thread, the default for everyone), a pin's own paint, the wash nib and its
 * width, the tools' order, and the board's pan letting go of what the
 * pointer rested on.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, pinTint, LINK_KINDS, markMax, cleanStroke, newStringPatch, WASH_MAX } from "../src/map/scrapboard/model.js";
import { BoardControls, GM_TOOLS, PLAYER_TOOLS, OWNER_TOOLS } from "../src/map/scrapboard/controls.js";

const look = normalizeLook({});
const size = () => null;
const measure = (t, px) => String(t).length * px * 0.5;

describe("a string with no kind", () => {
  it("is a kind of its own, white, its pins their own colour", () => {
    expect(LINK_KINDS[0]).toBe("plain");
    expect(look.ropes.plain.texs.length).toBeGreaterThan(0);
    expect(pinTint(look, { kind: "plain", color: null }, "tx/fixtures__fixture_grey_tack_small")).toBeNull();
    expect(pinTint(look, { kind: "plain", color: 3 }, "x")).toBe(look.ink.marker[3]);
    expect(pinTint(look, { kind: "plain", color: 3, plainPins: true }, "x")).toBeNull();
  });

  it("is kept as itself, and made without a colour", () => {
    const { patch } = newStringPatch({ scraps: {}, links: {}, pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 100, y: 0 } }, "plain", look);
    const l = Object.values(patch.newLinks)[0];
    expect(l.kind).toBe("plain");
    expect("color" in l).toBe(false);
    expect(normalizeBoard({ links: { l1: { kind: "plain", aPt: { x: 0, y: 0 }, bPt: { x: 5, y: 5 } } } }).links.l1.kind).toBe("plain");
  });
});

describe("a pin's own paint", () => {
  it("over its string's colour; none, as it was", () => {
    const raw = { scraps: {}, links: { l1: { kind: "delve", color: 5, aPin: "p1", bPin: "p2" } }, pins: { p1: { tex: "t", x: 0, y: 0, c: 2 }, p2: { tex: "t", x: 100, y: 0 } } };
    const v = boardView(look, normalizeBoard(raw), "gm", size, measure);
    expect(v.pins.find((p) => p.id === "p1").tint).toBe(look.ink.marker[2]);
    expect(v.pins.find((p) => p.id === "p2").tint).toBe(look.ink.marker[5]);
  });
});

describe("the wash", () => {
  it("is a nib, broader than the rest may be", () => {
    expect(cleanStroke({ c: 1, w: 120, n: "wash", pts: [0, 0, 9, 9] })).toMatchObject({ n: "wash", w: 120 });
    expect(cleanStroke({ c: 1, w: 120, pts: [0, 0, 9, 9] }).w).toBe(60);
    expect(markMax(look, "wash")).toBe(WASH_MAX);
    expect(markMax(look, "brush")).toBeLessThan(WASH_MAX);
    expect(normalizeLook({ nib: "wash" }).nib).toBe("wash");
  });
});

describe("the tools, and the pan", () => {
  it("Erase right below the brush, Write below Pin", () => {
    expect(GM_TOOLS.slice(0, 8)).toEqual(["inspect", "move", "mark", "erase", "note", "string", "pin", "write"]);
    expect(PLAYER_TOOLS).toEqual(["inspect", "move", "mark", "erase", "note", "string", "write"]);
    expect(OWNER_TOOLS).toEqual(["inspect", "move", "mark", "erase", "note", "string", "pin", "write"]);
  });

  it("a pan lets go of what the pointer rested on; the one-time pick keeps strokes alone", () => {
    const raw = { scraps: { n1: { type: "note", x: 500, y: 500, text: "a" } }, links: {}, pins: {}, marks: { gm: { m1: { c: 0, w: 6, pts: [100, 100, 200, 100] } } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    c.over = { key: "x", since: 0 };
    expect(c.panned()).toBe(true);
    expect(c.over).toBeNull();
    c.selection.add("n1");
    c.markSel.add(JSON.stringify(["gm", "m1"]));
    c.keepStrokesOnly();
    expect(c.selection.size).toBe(0);
    expect(c.markSel.size).toBe(1);
  });
});
