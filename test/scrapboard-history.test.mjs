/**
 * The Heart map's history and bin (Luke, 2026-10-06: "There is no working
 * proper undo/redo stack ... I just deleted something that I cannot get
 * back"): every edit kept as what it changed, so undoing one never puts back
 * what anyone else did since; cards never deleted outright, but taken off
 * into the board's bin and put back from it; a card's own pieces (tape, a pin
 * through its clipping, a ring) taken off one by one, its picture and writing
 * never.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeLook, normalizeBoard, boardView, applyPatch, diffBoard, recordTarget, recordUpdate, updateRoots, mergeRecords,
  binPatch, unbinPatch, binList, BIN_MAX, scrapLayout,
} from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";
import { mayHistory } from "../src/map/scrapboard/notes.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const SIZES = {
  "tx/paper__portrait__a": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/fixtures__fixture_grey_tack_small": { w: 40, h: 50 },
  "tx/fixtures__fixture_tape_a": { w: 200, h: 60 },
};
const size = (id) => SIZES[id] ?? null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({
  pools: { papers: ["tx/paper__portrait__a"], notes: ["tx/paper__portrait__a"], pins: ["tx/fixtures__fixture_grey_tack_small"], tapes: ["tx/fixtures__fixture_tape_a"] },
  library: { grip: { name: "Grip Station" } },
});
const pin = (x, y, extra = {}) => ({ tex: "tx/fixtures__fixture_grey_tack_small", x, y, ...extra });

describe("an edit kept as what it changed", () => {
  const before = { scraps: { a: { type: "note", text: "hi", x: 10, y: 20, parts: { text: { u: 0, v: 0, w: 1 } } } }, links: {}, pins: { p: pin(1, 2) } };

  it("goes down to the values that changed, and back", () => {
    const after = clone(before);
    after.scraps.a.x = 99;
    delete after.scraps.a.parts.text.w;
    after.pins.q = pin(5, 6);
    delete after.pins.p;
    const rec = diffBoard(before, after);
    const paths = rec.ops.map((o) => o.path.join("."));
    expect(paths.sort()).toEqual(["pins.p", "pins.q", "scraps.a.parts.text.w", "scraps.a.x"]);
    expect(recordTarget(after, rec, "before")).toEqual(before);
    expect(recordTarget(before, rec, "after")).toEqual(after);
    // (it survives being sent as JSON: a missing value stays missing)
    expect(recordTarget(after, clone(rec), "before")).toEqual(before);
  });

  it("undone, it leaves what others did since alone", () => {
    const mine = clone(before);
    mine.scraps.a.x = 50;
    const rec = diffBoard(before, mine);
    // (someone else then moves it down and writes on it)
    const now = clone(mine);
    now.scraps.a.y = 400;
    now.scraps.a.text = "theirs";
    const undone = recordTarget(now, rec, "before");
    expect(undone.scraps.a).toMatchObject({ x: 10, y: 400, text: "theirs" });
  });

  it("as a scene update: a value set, or a key taken away", () => {
    const after = clone(before);
    after.scraps.a.x = 99;
    after.scraps.b = { type: "note", text: "new", x: 0, y: 0 };
    const rec = diffBoard(before, after);
    expect(recordUpdate(after, rec, "before")).toEqual({ "flags.heart.board.scraps.a.x": 10, "flags.heart.board.scraps.-=b": null });
    expect(recordUpdate(before, rec, "after")).toEqual({ "flags.heart.board.scraps.a.x": 99, "flags.heart.board.scraps.b": after.scraps.b });
  });

  it("only what the update touched is compared", () => {
    expect(updateRoots({ "flags.heart.board.scraps.a.x": 1, "flags.heart.board.pins.-=p": null, "flags.heart.board.marks.gm.m1": {}, "flags.heart.board.decor": [] }))
      .toEqual([["scraps", "a"], ["pins", "p"], ["marks", "gm", "m1"], ["decor"]]);
    expect(updateRoots({ "flags.heart.board": {} })).toBeNull();
    const after = clone(before);
    after.scraps.a.x = 1;
    after.pins.p.x = 7;
    expect(diffBoard(before, after, [["scraps", "a"]]).ops.map((o) => o.path.join("."))).toEqual(["scraps.a.x"]);
  });

  it("several, undone as one, in the right order", () => {
    const one = clone(before);
    one.scraps.a.x = 20;
    const two = clone(one);
    two.scraps.a.x = 30;
    const rec = mergeRecords([diffBoard(before, one), diffBoard(one, two)]);
    expect(recordTarget(two, rec, "before").scraps.a.x).toBe(10);
    expect(recordTarget(before, rec, "after").scraps.a.x).toBe(30);
  });
});

describe("the bin: cards never deleted outright", () => {
  const RAW = {
    scraps: { grip: { lib: "grip", x: 300, y: 300 }, n1: { type: "note", text: "keep", x: 1200, y: 300 } },
    pins: { a: { tex: "tx/fixtures__fixture_grey_tack_small", on: "grip", at: { u: 0, v: -0.4 } }, b: { tex: "tx/fixtures__fixture_grey_tack_small", on: "n1", at: { u: 0, v: -0.4 } }, loose: pin(2000, 2000) },
    links: { l1: { kind: "delve", aPin: "a", bPin: "b" }, l2: { kind: "path", aPin: "b", bPin: "loose" } },
  };

  it("a card goes into the bin with its pins and strings, and comes back", () => {
    const b = clone(RAW);
    applyPatch(b, binPatch(b, ["grip"], { at: 5, by: "gm" }));
    expect(b.scraps.grip).toBeUndefined();
    expect(b.pins.a).toBeUndefined();
    expect(b.links.l1).toBeUndefined();
    expect(b.links.l2).toBeDefined();
    expect(b.bin.grip).toMatchObject({ at: 5, by: "gm", scrap: RAW.scraps.grip, pins: { a: RAW.pins.a }, links: { l1: RAW.links.l1 } });
    expect(binList(b, look)).toEqual([{ key: "grip", at: 5, by: "gm", type: "landmark", name: "Grip Station" }]);
    applyPatch(b, unbinPatch(b, "grip"));
    expect(b.scraps.grip).toEqual(RAW.scraps.grip);
    expect(b.pins.a).toEqual(RAW.pins.a);
    expect(b.links.l1).toMatchObject({ aPin: "a", bPin: "b" });
    expect(b.bin.grip).toBeUndefined();
  });

  it("put back, its ids taken since are given new ones", () => {
    const b = clone(RAW);
    applyPatch(b, binPatch(b, ["grip"], { at: 5 }));
    // (a new pin took its pin's id, and the place went back on the board)
    b.pins.a = pin(50, 50);
    b.scraps.grip = { lib: "grip", x: 900, y: 900 };
    applyPatch(b, unbinPatch(b, "grip"));
    const back = Object.keys(b.scraps).find((k) => k !== "grip" && k !== "n1");
    expect(back).toBeTruthy();
    const myPin = Object.keys(b.pins).find((id) => b.pins[id].on === back);
    expect(myPin).not.toBe("a");
    expect(b.pins.a).toEqual(pin(50, 50));
    const l = Object.values(b.links).find((x) => x.aPin === myPin);
    expect(l).toMatchObject({ bPin: "b" });
  });

  it("a string whose other end has gone stays in the bin", () => {
    const b = clone(RAW);
    applyPatch(b, binPatch(b, ["grip"], { at: 5 }));
    delete b.pins.b;
    const p = unbinPatch(b, "grip");
    expect(Object.keys(p.newLinks)).toEqual([]);
  });

  it("keeps the newest BIN_MAX", () => {
    const b = clone(RAW);
    b.bin = Object.fromEntries(Array.from({ length: BIN_MAX }, (_, i) => [`old${i}`, { at: i, scrap: { type: "note", text: String(i), x: 0, y: 0 } }]));
    const p = binPatch(b, ["n1"], { at: 1e9 });
    expect(p.bin.old0).toBeNull();
    applyPatch(b, p);
    expect(Object.keys(b.bin)).toHaveLength(BIN_MAX);
    expect(b.bin.n1).toBeDefined();
  });
});

describe("Delete and Erase (Luke, 2026-10-06: never text or pictures)", () => {
  const RAW = { scraps: { grip: { lib: "grip", x: 600, y: 600, r: 0, fix: "tape" } }, links: {}, pins: { p1: pin(2000, 2000) } };
  const live = () => {
    const box = { raw: clone(RAW) };
    const GM = { id: "gm", isGM: true };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    return { c, box };
  };

  it("Delete takes pins and strings, never cards (it says which stayed)", () => {
    const { c } = live();
    c.selection.add("grip");
    c.pins.add("p1");
    expect(c.removal()).toEqual({ scraps: [], pins: ["p1"], links: [], cards: ["grip"] });
  });

  it("a card's tape comes off by itself, its picture and writing never", () => {
    const { c, box } = live();
    const s = c.host.view().scraps[0];
    const tape = s.layout.parts.find((p) => p.id.startsWith("tape"));
    expect(tape).toBeTruthy();
    expect(c.dropPatch("grip", "clip")).toBeNull();
    expect(c.dropPatch("grip", "text")).toBeNull();
    // (Erase on the tape)
    const a = c.press("erase", { x: tape.x, y: tape.y });
    expect(a).toEqual({ do: "patch", patch: { scraps: { grip: { drop: [tape.id] } } } });
    applyPatch(box.raw, a.patch);
    const after = scrapLayout(normalizeBoard(box.raw).scraps.grip, look, size, measure, look.library.grip);
    expect(after.tapes.some((t) => t.id === tape.id)).toBe(false);
    expect(after.parts.some((p) => p.id === tape.id)).toBe(false);
    // (the other pieces keep their ids)
    const others = s.layout.tapes.filter((t) => t.id !== tape.id).map((t) => t.id);
    expect(after.tapes.map((t) => t.id)).toEqual(others);
  });

  it("a selected piece comes off with Delete", () => {
    const { c } = live();
    const s = c.host.view().scraps[0];
    const tape = s.layout.parts.find((p) => p.id.startsWith("tape"));
    c.part = { key: "grip", id: tape.id };
    expect(c.pieceOut()).toEqual({ scraps: { grip: { drop: [tape.id] } } });
    c.part = { key: "grip", id: "clip" };
    expect(c.pieceOut()).toBeNull();
  });
});

describe("a player's own undo, checked on the GM's client", () => {
  const board = {
    scraps: { p1: { type: "note", text: "mine", x: 10, y: 10, author: "ana" }, grip: { lib: "grip", x: 300, y: 300 } },
    links: { s: { kind: "path", color: 2, author: "ana", aPin: "a", bPin: "b" }, g: { kind: "delve", aPin: "c", bPin: "d" } },
    pins: { a: pin(0, 0, { author: "ana" }), b: pin(9, 9, { author: "ana" }), c: pin(1, 1), d: pin(2, 2) },
    marks: { ana: { m1: { c: 1, w: 4, pts: [0, 0, 5, 5] } }, gm: { m1: { c: 1, w: 4, pts: [0, 0, 5, 5] } } },
  };
  const ANA = { id: "ana", isGM: false, owner: false };
  const rec = (path, b, a) => ({ ops: [{ path, ...(b === undefined ? {} : { b }), ...(a === undefined ? {} : { a }) }] });

  it("their own notes, strings, pins, and strokes", () => {
    expect(mayHistory(board, rec(["scraps", "p1", "x"], 5, 10), "before", ANA)).toBe(true);
    expect(mayHistory(board, rec(["links", "s", "color"], 1, 2), "before", ANA)).toBe(true);
    expect(mayHistory(board, rec(["pins", "a", "x"], 4, 0), "before", ANA)).toBe(true);
    expect(mayHistory(board, rec(["marks", "ana", "m1"], undefined, board.marks.ana.m1), "before", ANA)).toBe(true);
  });

  it("never anyone else's, nor the GM's places", () => {
    expect(mayHistory(board, rec(["scraps", "grip", "x"], 5, 300), "before", ANA)).toBe(false);
    expect(mayHistory(board, rec(["links", "g", "kind"], "path", "delve"), "before", ANA)).toBe(false);
    expect(mayHistory(board, rec(["marks", "gm", "m1"], undefined, board.marks.gm.m1), "before", ANA)).toBe(false);
    expect(mayHistory(board, rec(["bin", "x"], undefined, {}), "before", ANA)).toBe(false);
    // (nor a note of theirs made the GM's)
    expect(mayHistory(board, rec(["scraps", "p1", "author"], "gm", "ana"), "before", ANA)).toBe(false);
  });
});
