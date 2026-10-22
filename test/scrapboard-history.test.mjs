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
  binPatch, unbinPatch, binList, BIN_MAX, scrapLayout, keysTaken, takeOffPatch, doodlePatch, labelPatch,
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

describe("the bin's edge cases (2026-10-21 code audit)", () => {
  const two = () => ({
    scraps: { a: { type: "note", text: "a", x: 0, y: 0 }, b: { type: "note", text: "b", x: 500, y: 0 } },
    pins: { pa: { tex: "t", on: "a", at: { u: 0, v: 0 } }, pb: { tex: "t", on: "b", at: { u: 0, v: 0 } } },
    links: { ab: { kind: "path", aPin: "pa", bPin: "pb" } },
  });

  it("a string between two cards binned together comes back with the second", () => {
    const b = two();
    applyPatch(b, binPatch(b, ["a", "b"], { at: 1 }));
    applyPatch(b, unbinPatch(b, "a"));
    expect(b.links.ab).toBeUndefined();
    expect(b.bin.b.links.ab).toBeDefined();
    applyPatch(b, unbinPatch(b, "b"));
    expect(b.links.ab).toMatchObject({ aPin: "pa", bPin: "pb" });
  });

  it("a full bin never lets go of the card going in under a key it already holds", () => {
    const b = two();
    b.bin = Object.fromEntries(Array.from({ length: BIN_MAX }, (_, i) => [i ? `old${i}` : "a", { at: i, scrap: { type: "note", text: String(i), x: 0, y: 0 } }]));
    const p = binPatch(b, ["a"], { at: 1e9 });
    expect(p.bin.a).toMatchObject({ at: 1e9, scrap: { text: "a" } });
    applyPatch(b, p);
    expect(b.bin.a.scrap.text).toBe("a");
  });

  it("a card put back under a new key never takes a binned card's", () => {
    const b = two();
    applyPatch(b, binPatch(b, ["a"], { at: 1 }));
    b.scraps.a = { type: "note", text: "new a", x: 1, y: 1 };
    b.bin.n1 = { at: 2, scrap: { type: "note", text: "n1", x: 0, y: 0 }, pins: {}, links: {} };
    const p = unbinPatch(b, "a");
    expect(Object.keys(p.newScraps)).toEqual(["n2"]);
    expect(keysTaken(b)).toMatchObject({ a: expect.anything(), n1: expect.anything(), b: expect.anything() });
  });

  it("takeOffPatch: cards into the bin and pins off, as one patch", () => {
    const b = two();
    b.pins.loose = { tex: "t", x: 9, y: 9 };
    b.links.l2 = { kind: "path", aPin: "pb", bPin: "loose" };
    const p = takeOffPatch(b, { scraps: ["a"], pins: ["loose"] }, { at: 3, by: "gm" });
    applyPatch(b, p);
    expect(b.scraps.a).toBeUndefined();
    expect(b.bin.a).toMatchObject({ at: 3, by: "gm", links: { ab: expect.anything() } });
    expect(b.pins.loose).toBeUndefined();
    expect(b.links.l2).toBeUndefined();
    expect(b.scraps.b).toBeDefined();
    expect(takeOffPatch(b, { scraps: ["nothing"] })).toBeNull();
  });

  it("a record's path through __proto__ is never followed", () => {
    const rec = { ops: [{ path: ["__proto__", "polluted"], a: "yes" }, { path: ["constructor", "prototype", "x"], a: 1 }] };
    recordTarget({}, rec, "after");
    recordUpdate({}, rec, "after");
    expect({}.polluted).toBeUndefined();
    expect({}.x).toBeUndefined();
  });

  it("an undo of a field of a card gone since makes no blank card; a stroke's new layer is made", () => {
    const board = { scraps: {}, marks: {} };
    expect(recordTarget(board, { ops: [{ path: ["scraps", "c1", "x"], b: 5, a: 9 }] }, "before").scraps).toEqual({});
    expect(recordTarget(board, { ops: [{ path: ["marks", "ana", "m1"], a: { c: 0 } }] }, "after").marks).toEqual({ ana: { m1: { c: 0 } } });
  });
});

describe("a doodle laid down (doodlePatch, both hosts, 2026-10-21)", () => {
  it("on the sheet in the placer's layer, or on the card under it in its frame", () => {
    const raw = { scraps: { n1: { type: "note", text: "x", x: 600, y: 600 } }, marks: { ana: { m1: { c: 0, w: 2, pts: [0, 0, 1, 1] } } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const brush = { size: 40, c: 2, w: 99, b: 1, o: 0.8 };
    const sheet = doodlePatch(raw, view, { kind: "ring", seed: "s", at: { x: 2000, y: 2000 } }, brush, look, "ana");
    const ids = Object.keys(sheet.marks.ana);
    expect(ids).not.toContain("m1");
    expect(Object.values(sheet.marks.ana)[0]).toMatchObject({ c: 2, o: 0.8 });
    expect(Object.values(sheet.marks.ana)[0].w).toBeLessThanOrEqual(look.string.w * 3);
    const card = doodlePatch(raw, view, { kind: "ring", seed: "s", at: { x: 600, y: 600 }, on: "n1" }, brush, look, "ana");
    expect(Object.values(card.scraps.n1.marks)[0]).toMatchObject({ by: "ana", c: 2 });
  });
});

describe("a player's name for their own string (labelPatch author, 2026-10-21)", () => {
  it("the tag, its thread, and their pins are the player's", () => {
    const raw = { scraps: {}, pins: { a: pin(1000, 2000, { author: "ana" }), b: pin(2000, 2000, { author: "ana" }) }, links: { s: { kind: "path", aPin: "a", bPin: "b", author: "ana", color: 1 } } };
    const p = labelPatch(raw, "s", "Home", look, size, measure, { author: "ana" });
    expect(Object.values(p.newScraps)[0]).toMatchObject({ type: "note", tag: true, author: "ana" });
    expect(Object.values(p.newLinks)[0].author).toBe("ana");
    expect(Object.values(p.pins).every((x) => x.author === "ana")).toBe(true);
    // (the GM's, as before: no author)
    expect(Object.values(labelPatch(raw, "s", "Home", look, size, measure).newScraps)[0].author).toBeUndefined();
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

describe("joints through a binned card's pins come back with it (M9, Luke 2026-10-21)", () => {
  const JOINTS = [{ x: 10, y: 10 }, { pin: "pc" }, { x: 20, y: 20 }];
  const PULLS = [null, { t: 0.5, u: 0.1, v: 0 }, null, null];
  const board = () => ({
    scraps: { a: { type: "note", text: "a", x: 0, y: 0 }, b: { type: "note", text: "b", x: 900, y: 0 }, c: { type: "note", text: "c", x: 450, y: 400 } },
    pins: { pa: { tex: "t", on: "a", at: { u: 0, v: 0 } }, pb: { tex: "t", on: "b", at: { u: 0, v: 0 } }, pc: { tex: "t", on: "c", at: { u: 0, v: 0 } } },
    links: { ab: { kind: "path", aPin: "pa", bPin: "pb", joints: clone(JOINTS), pulls: clone(PULLS) } },
  });

  it("taken off, the string lets go of the joint; put back, it runs through it again, pulls and all", () => {
    const b = board();
    applyPatch(b, binPatch(b, ["c"], { at: 1 }));
    expect(b.links.ab.joints).toEqual([{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    expect(b.bin.c.joints.ab).toEqual({ was: JOINTS, pulls: PULLS });
    applyPatch(b, unbinPatch(b, "c"));
    expect(b.links.ab.joints).toEqual(JOINTS);
    expect(b.links.ab.pulls).toEqual(PULLS);
    expect(b.pins.pc).toBeDefined();
    expect(b.bin.c).toBeUndefined();
  });

  it("reshaped since, the joint goes back after the one it followed, and the pulls let go", () => {
    const b = board();
    applyPatch(b, binPatch(b, ["c"], { at: 1 }));
    b.links.ab.joints = [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 20, y: 20 }];
    applyPatch(b, unbinPatch(b, "c"));
    expect(b.links.ab.joints).toEqual([{ x: 10, y: 10 }, { pin: "pc" }, { x: 50, y: 50 }, { x: 20, y: 20 }]);
    expect(b.links.ab.pulls).toEqual([]);
  });

  it("its pin's id taken since, the joint follows the pin's new id", () => {
    const b = board();
    applyPatch(b, binPatch(b, ["c"], { at: 1 }));
    b.pins.pc = { tex: "t", x: 5, y: 5 };
    applyPatch(b, unbinPatch(b, "c"));
    const mine = Object.keys(b.pins).find((id) => b.pins[id].on === "c");
    expect(mine).not.toBe("pc");
    expect(b.links.ab.joints[1]).toEqual({ pin: mine });
  });

  it("a string in the bin since waits there, its joint put back in it", () => {
    const b = board();
    applyPatch(b, binPatch(b, ["c"], { at: 1 }));
    applyPatch(b, binPatch(b, ["a"], { at: 2 }));
    expect(b.bin.a.links.ab.joints).toEqual([{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    applyPatch(b, unbinPatch(b, "c"));
    expect(b.bin.a.links.ab.joints).toEqual(JOINTS);
    applyPatch(b, unbinPatch(b, "a"));
    expect(b.links.ab.joints).toEqual(JOINTS);
  });

  it("a string gone, or already through the pin, is left as it is", () => {
    const gone = board();
    applyPatch(gone, binPatch(gone, ["c"], { at: 1 }));
    delete gone.links.ab;
    expect(unbinPatch(gone, "c").links).toBeUndefined();
    const again = board();
    applyPatch(again, binPatch(again, ["c"], { at: 1 }));
    again.links.ab.joints = [{ pin: "pc" }];
    expect(unbinPatch(again, "c").links).toBeUndefined();
  });
});
