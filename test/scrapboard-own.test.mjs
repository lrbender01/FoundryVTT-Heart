/**
 * Players take their own notes and writing off, and the GM reshuffles in
 * Foundry (Luke, 2026-10-21). A player's Delete lists their own selected
 * notes and writing (controls.js removal), which go to the bin through the
 * relay only when everything going with them is theirs (notes.js ownCardsOf),
 * and their undo may put them back (mayHistory, the bin). Reshuffle gives the
 * selected cards a new seed and their hand-moved pieces back (the editor's).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, binPatch, applyPatch, diffBoard } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";
import { ownCardsOf, mayHistory } from "../src/map/scrapboard/notes.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: [], tapes: [] }, library: { grip: { name: "Grip Station" } } });
const RAW = {
  scraps: {
    grip: { lib: "grip", x: 300, y: 300, seed: 2, parts: { clip: { u: 0.1, v: 0 } }, drop: ["tape0"] },
    mine: { type: "note", text: "mine", x: 800, y: 1200, author: "ana" },
    scrawl: { type: "scrawl", text: "on the sheet", x: 1600, y: 1200, author: "ana" },
    theirs: { type: "note", text: "theirs", x: 1400, y: 1200, author: "bo" },
    tied: { type: "note", text: "tied", x: 2000, y: 2000, author: "ana" },
  },
  links: { gmString: { a: "tied", b: "grip", kind: "delve" }, anaString: { a: "mine", bPt: { x: 900, y: 1500 }, kind: "path", color: 1, author: "ana" } },
  pins: {},
};
const host = (user, raw = RAW) => ({ view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => raw });
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false, owner: false };

describe("a player sizes and turns their own notes and writing (Luke, 2026-10-23)", () => {
  it("the corner handles and the wheel are theirs over their own notes", () => {
    const c = new BoardControls(host(ANA));
    c.selection.add("mine");
    c.selection.add("scrawl");
    expect(c.wantsWheel({ ctrl: true })).toBe(true);
    const turn = c.wheel(1, { ctrl: true });
    expect(Object.keys(turn.scraps).sort()).toEqual(["mine", "scrawl"]);
    expect(Number.isFinite(turn.scraps.mine.r)).toBe(true);
    expect(c.wheel(-1, { shift: true }).scraps.mine.s).toBeCloseTo(1.05, 2);
    const b = c.bounds();
    expect(c.onHandle(b.handle)).toBe(true);
    expect(c.onRotor(b.rotor)).toBe(true);
    expect(c.marks().handle).toEqual(b.handle);
  });

  it("never with anything else selected", () => {
    const c = new BoardControls(host(ANA));
    c.selection.add("mine");
    c.selection.add("theirs");
    expect(c.wantsWheel({ ctrl: true })).toBe(false);
    expect(c.wheel(1, { ctrl: true })).toBeNull();
    const b = c.bounds();
    expect(c.onHandle(b.handle)).toBe(false);
    expect(c.marks().handle).toBeNull();
    c.clear();
    c.selection.add("grip");
    expect(c.wantsWheel({ shift: true })).toBe(false);
  });
});

describe("a player takes their own notes and writing off", () => {
  it("Delete lists only the player's own selected notes and writing", () => {
    const c = new BoardControls(host(ANA));
    for (const k of ["grip", "mine", "scrawl", "theirs"]) c.selection.add(k);
    expect(c.removal().cards.sort()).toEqual(["mine", "scrawl"]);
  });

  it("lets them go when everything going with them is theirs", () => {
    expect(ownCardsOf(RAW, ["mine", "scrawl"], ANA)).toEqual(["mine", "scrawl"]);
  });

  it("refuses the lot when any card isn't theirs", () => {
    expect(ownCardsOf(RAW, ["mine", "theirs"], ANA)).toBeNull();
    expect(ownCardsOf(RAW, ["grip"], ANA)).toBeNull();
    expect(ownCardsOf(RAW, [], ANA)).toBeNull();
  });

  it("refuses a card someone else's string is tied to", () => {
    expect(ownCardsOf(RAW, ["tied"], ANA)).toBeNull();
    // (the GM may take any)
    expect(ownCardsOf(RAW, ["tied", "theirs"], GM)).toEqual(["tied", "theirs"]);
  });

  it("their own undo may put their card back out of the bin, never someone else's", () => {
    const before = structuredClone(RAW);
    const board = applyPatch(structuredClone(RAW), binPatch(RAW, ["mine"], { at: 1, by: "ana" }));
    expect(board.bin.mine.scrap.text).toBe("mine");
    // (scoped as api.js update() scopes it: by what the write touched)
    const rec = diffBoard(before, board, [["scraps", "mine"], ["bin", "mine"]]);
    expect(rec.ops.some((op) => op.path[0] === "bin")).toBe(true);
    // (a record naming the whole bin is refused: 2026-10-21)
    expect(mayHistory(board, diffBoard(before, board), "before", ANA)).toBe(false);
    expect(mayHistory(board, rec, "before", ANA)).toBe(true);
    expect(mayHistory(board, rec, "before", { id: "bo", isGM: false, owner: false })).toBe(false);
  });
});

describe("Reshuffle (the GM's)", () => {
  it("gives each selected card a new seed and its pieces back, never writing on the sheet", () => {
    const c = new BoardControls(host(GM));
    for (const k of ["grip", "mine", "scrawl"]) c.selection.add(k);
    expect(c.reshuffle()).toEqual({ scraps: { grip: { seed: 3, parts: null, drop: null }, mine: { seed: 1, parts: null, drop: null } } });
  });

  it("is nothing with no card selected, or for a player", () => {
    expect(new BoardControls(host(GM)).reshuffle()).toBeNull();
    const p = new BoardControls(host(ANA));
    p.selection.add("mine");
    expect(p.reshuffle()).toBeNull();
  });

  it("a reshuffled card is laid out afresh", () => {
    const c = new BoardControls(host(GM));
    c.selection.add("grip");
    const b = structuredClone(RAW);
    applyPatch(b, c.reshuffle());
    const n = normalizeBoard(b).scraps.grip;
    expect(n.seed).toBe(3);
    expect(n.parts).toEqual({});
    expect(n.drop).toEqual([]);
  });
});
