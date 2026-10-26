/**
 * The Heart map's writes and the GM relay's board handlers (Luke,
 * 2026-10-21 code audit, monorepo docs/history/heart-code-audit/map.md): every
 * board write through api.js update() is one edit to undo, kept as what it
 * changed; the relay's handlers (notes.js) check who asked, write with a
 * sink, and hand the asker back their own edit; a player's undo is checked
 * before it is applied, so a crafted record can't empty the board or reach
 * past it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetWorld, fakeUser, setUsers, FakeCollection } from "./helpers.mjs";
import { runQueued, registerRelayHandler } from "../src/common/relay.js";
import { registerBoardRelay, forgetHandedRecords, freeHand, safeKey } from "../src/map/scrapboard/notes.js";
import { addPin, addScrap, setScrap, removeMany, undo, redo, binCards, applyBoardPatch, replaceBoard, restoreBackup, followRename, boardOf, pushEdit, setBoardScene } from "../src/map/scrapboard/api.js";
import { backupsToDrop } from "../src/map/scrapboard/backups.js";
import { onRelayMessage } from "../src/common/relay.js";
import { recordUpdate, normalizeLook, markMax, freshStrokeIds } from "../src/map/scrapboard/model.js";

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function merge(into, v) {
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith("-=")) delete into[k.slice(2)];
    else if (isPlain(x) && isPlain(into[k])) merge(into[k], x);
    else into[k] = clone(x);
  }
}
// A scene update as Foundry applies one: dotted keys, objects merged,
// '-=key' taking a key away
function applyUpdate(doc, data) {
  for (const [path, v] of Object.entries(data)) {
    const keys = path.split(".");
    const last = keys.pop();
    let at = doc;
    for (const k of keys) {
      if (!isPlain(at[k])) at[k] = {};
      at = at[k];
    }
    if (last.startsWith("-=")) delete at[last.slice(2)];
    else if (isPlain(v) && isPlain(at[last])) merge(at[last], v);
    else at[last] = clone(v);
  }
}
// (active: everyone sees it; `seen`: the users given Limited or more)
function fakeScene(board, id = "s1", { active = true, seen = [] } = {}) {
  const scene = { id, name: "Map", active, flags: { heart: { board: clone(board) } }, updates: [] };
  scene.testUserPermission = (user) => Boolean(user?.isGM || seen.includes(user?.id));
  scene.update = async (data) => {
    scene.updates.push(data);
    applyUpdate(scene, data);
    return scene;
  };
  return scene;
}

const note = (author, x = 100, extra = {}) => ({ type: "note", text: `${author}'s`, x, y: 100, author, ...extra });
let gm;
let ana;
let bo;
let scene;
const ask = (op, data, who = ana) => runQueued(op, { sceneId: scene.id, ...data }, who.id);

beforeEach(() => {
  resetWorld();
  gm = fakeUser({ id: "gm", isGM: true });
  ana = fakeUser({ id: "ana" });
  bo = fakeUser({ id: "bo" });
  setUsers([gm, ana, bo], { self: gm, activeGM: gm });
  game.settings.store.set("heart.boardHands", { ana: "Reenie Beanie" });
  scene = fakeScene({
    scraps: { grip: { lib: "grip", x: 500, y: 500 }, mine: note("ana", 900), theirs: note("bo", 1300) },
    links: {},
    pins: {},
    marks: { bo: { m1: { c: 0, w: 4, pts: [0, 0, 9, 9] } } },
  });
  game.scenes = new FakeCollection([scene]);
  forgetHandedRecords();
  registerBoardRelay();
});

describe("the GM's quick edits each keep their own ids (Luke, 2026-10-25)", () => {
  it("two pins put in at once: two pins", async () => {
    const [a, b] = await Promise.all([addPin(scene, { tex: "t", x: 1, y: 1 }), addPin(scene, { tex: "t", x: 2, y: 2 })]);
    expect(a).not.toBe(b);
    expect(boardOf(scene).pins[a]).toMatchObject({ x: 1 });
    expect(boardOf(scene).pins[b]).toMatchObject({ x: 2 });
  });

  it("two strokes laid at once, made with the same id from the board as it was: both kept", async () => {
    const st = (x) => ({ marks: { gm: { m1: { c: 0, w: 4, pts: [x, 0, x + 9, 9] } } } });
    await Promise.all([applyBoardPatch(scene, (b) => freshStrokeIds(b, st(10))), applyBoardPatch(scene, (b) => freshStrokeIds(b, st(20)))]);
    expect(Object.values(boardOf(scene).marks.gm).map((s) => s.pts[0]).sort()).toEqual([10, 20]);
  });

  it("a whole board replaced from a function sees the writes queued before it (Luke, 2026-10-26: the tidy wiped the Plenty sketch)", async () => {
    let seen = null;
    await Promise.all([
      applyBoardPatch(scene, { marks: { gm: { m1: { c: 0, w: 4, pts: [1, 1, 9, 9] } } } }),
      replaceBoard(scene, (now) => { seen = Object.keys(now.marks?.gm ?? {}); return { ...now, sheet: { bare: true, w: 1000, h: 1000 } }; }, { record: false }),
    ]);
    expect(seen).toEqual(["m1"]);
    expect(boardOf(scene).marks.gm.m1).toBeDefined();
    expect(boardOf(scene).sheet).toMatchObject({ bare: true });
    // (null: no write at all)
    const writes = scene.updates.length;
    await replaceBoard(scene, () => null);
    expect(scene.updates.length).toBe(writes);
  });

  it("two cards added at once: two cards", async () => {
    const [k1, k2] = await Promise.all([addScrap(scene, { type: "note", text: "a", x: 1, y: 1 }), addScrap(scene, { type: "note", text: "b", x: 2, y: 2 })]);
    expect(k1).not.toBe(k2);
    expect([boardOf(scene).scraps[k1].text, boardOf(scene).scraps[k2].text]).toEqual(["a", "b"]);
  });
});

describe("the GM's writes, undone and done again", () => {
  it("an edit undone puts back only what it changed, and redo does it again", async () => {
    await setScrap(scene, "grip", { x: 600 });
    // (someone else then moves it down)
    await scene.update({ "flags.heart.board.scraps.grip.y": 900 });
    await undo(scene);
    expect(boardOf(scene).scraps.grip).toMatchObject({ x: 500, y: 900 });
    await redo(scene);
    expect(boardOf(scene).scraps.grip).toMatchObject({ x: 600, y: 900 });
  });

  it("cards and pins taken off together are one write and one undo", async () => {
    await applyBoardPatch(scene, { pins: { p1: { tex: "t", x: 1, y: 1 } } });
    const writes = scene.updates.length;
    await removeMany(scene, { scraps: ["grip"], pins: ["p1"], links: [] });
    expect(scene.updates.length).toBe(writes + 1);
    expect(boardOf(scene).scraps.grip).toBeUndefined();
    expect(boardOf(scene).bin.grip.scrap.lib).toBe("grip");
    expect(boardOf(scene).pins.p1).toBeUndefined();
    await undo(scene);
    expect(boardOf(scene).scraps.grip).toMatchObject({ lib: "grip", x: 500 });
    expect(boardOf(scene).pins.p1).toBeDefined();
    expect(boardOf(scene).bin?.grip).toBeUndefined();
  });

  it("a card binned under a key already in the bin replaces that entry, never merges into it", async () => {
    scene.flags.heart.board.bin = { grip: { at: 1, by: "gm", scrap: { lib: "grip", x: 1, y: 1, marks: { old: { c: 0, w: 2, pts: [0, 0, 1, 1] } } }, pins: { oldPin: { tex: "t" } }, links: {} } };
    await binCards(scene, ["grip"]);
    const e = boardOf(scene).bin.grip;
    expect(e.scrap).toEqual({ lib: "grip", x: 500, y: 500 });
    expect(e.pins).toEqual({});
  });

  it("a board put back keeps its backup whole, never merged with the one before", async () => {
    await replaceBoard(scene, { scraps: { a: note("gm") } }, { backup: true });
    await replaceBoard(scene, { scraps: { b: note("gm") } }, { backup: true });
    expect(Object.keys(scene.flags.heart.boardBackup.scraps)).toEqual(["a"]);
    await restoreBackup(scene);
    expect(Object.keys(boardOf(scene).scraps)).toEqual(["a"]);
    expect(Object.keys(scene.flags.heart.boardBackup.scraps)).toEqual(["b"]);
  });

  it("a place's rename reaches its cards on the board and in the bin", async () => {
    scene.flags.heart.board.scraps.own = { type: "landmark", uuid: "Actor.x", name: "Old", x: 1, y: 1 };
    scene.flags.heart.board.bin = { gone: { at: 1, scrap: { type: "landmark", uuid: "Actor.x", name: "Old", x: 1, y: 1 }, pins: {}, links: {} } };
    await followRename({ type: "landmark", uuid: "Actor.x", name: "New" });
    expect(boardOf(scene).scraps.own.name).toBe("New");
    expect(boardOf(scene).bin.gone.scrap.name).toBe("New");
  });
});

describe("the relay's board handlers", () => {
  it("board.addNote: a player's note, in their hand, its key never a binned card's, their edit handed back", async () => {
    scene.flags.heart.board.bin = { p1: { at: 1, scrap: note("bo"), pins: {}, links: {} } };
    const res = await ask("board.addNote", { type: "note", x: 10, y: 20, text: "  hello  ", typed: true });
    expect(res.status).toBe("done");
    expect(res.key).toBe("p2");
    expect(boardOf(scene).scraps.p2).toMatchObject({ type: "note", text: "hello", author: "ana", hand: "Reenie Beanie" });
    // (typed only by a Witness's player)
    expect(boardOf(scene).scraps.p2.typed).toBeUndefined();
    expect(res.undo.ops.map((o) => o.path.join("."))).toEqual(["scraps.p2"]);
  });

  it("board.addNote: refused without a claimed hand, or as a landmark", async () => {
    expect((await ask("board.addNote", { x: 1, y: 1, text: "x" }, bo)).status).toBe("not-allowed");
    expect((await ask("board.addNote", { type: "landmark", x: 1, y: 1, text: "x" })).status).toBe("not-allowed");
    expect((await ask("board.addNote", { x: "a", y: 1, text: "x" })).status).toBe("not-allowed");
  });

  // (board.moveOwn's two tests, on board.edit { own }, the route the layer
  // takes: Luke 2026-10-25, the health audit A3)
  const move = (moves, who = ana) => ask("board.edit", { own: { scraps: moves } }, who);

  it("board.edit own: their own notes moved, nothing else", async () => {
    expect((await move({ mine: { x: 50.4, y: 60 } })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 50, y: 60 });
    expect((await move({ theirs: { x: 1, y: 1 } })).status).toBe("not-allowed");
    expect((await move({ grip: { x: 1, y: 1 } })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.grip.x).toBe(500);
  });

  it("board.edit own: their own notes sized and turned (Luke, 2026-10-23), within bounds", async () => {
    expect((await move({ mine: { s: 1.23456, r: 12.6 } })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 900, y: 100, s: 1.235, r: 13 });
    expect((await move({ theirs: { r: 5 } })).status).toBe("not-allowed");
    expect((await move({ grip: { s: 2 } })).status).toBe("not-allowed");
    // (no size of nothing, none past the cap, no half a move, no empty ask)
    expect((await move({ mine: { s: 0 } })).status).toBe("not-allowed");
    expect((await move({ mine: { s: 50 } })).status).toBe("not-allowed");
    expect((await move({ mine: { x: 5 } })).status).toBe("not-allowed");
    expect((await move({ mine: {} })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 900, s: 1.235, r: 13 });
    expect(boardOf(scene).scraps.theirs.r).toBeUndefined();
  });

  it("board.edit own: a locked note of theirs is refused, only let go", async () => {
    scene.flags.heart.board.scraps.mine.locked = true;
    expect((await move({ mine: { x: 50, y: 60 } })).status).toBe("not-allowed");
    expect((await move({ mine: { s: 2 } })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 900, y: 100 });
    expect((await move({ mine: { locked: false } })).status).toBe("done");
    expect(boardOf(scene).scraps.mine.locked).toBe(false);
  });

  it("board.moveOwn is gone", async () => {
    await expect(ask("board.moveOwn", { moves: { mine: { x: 1, y: 1 } } })).rejects.toThrow(/no relay handler/);
  });

  it("board.editNote: their own note's text, never another's", async () => {
    const res = await ask("board.editNote", { key: "mine", text: "new words", style: { bold: true } });
    expect(res.status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ text: "new words", bold: true, typed: false });
    expect(res.undo.ops.length).toBeGreaterThan(0);
    expect((await ask("board.editNote", { key: "theirs", text: "mine now" })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.theirs.text).toBe("bo's");
  });

  it("board.history: a player's own edit undone; another's, a whole collection, or a path past the board refused", async () => {
    const made = await ask("board.addNote", { type: "note", x: 10, y: 20, text: "undo me" });
    expect((await ask("board.history", { record: made.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps[made.key]).toBeUndefined();
    // (bo's own note's history is bo's; a record never handed out is refused)
    const bos = { ops: [{ path: ["scraps", "theirs", "x"], b: 1, a: 1300 }] };
    expect((await ask("board.history", { record: bos, side: "before" })).status).toBe("forgotten");
    // (a record naming every card)
    const wipe = { ops: [{ path: ["scraps"], b: boardOf(scene).scraps, a: {} }] };
    expect((await ask("board.history", { record: wipe, side: "after" })).status).toBe("forgotten");
    expect(boardOf(scene).scraps.grip).toBeDefined();
    // (a path through __proto__)
    const poison = { ops: [{ path: ["__proto__", "polluted"], a: "yes" }] };
    expect((await ask("board.history", { record: poison, side: "after" })).status).toBe("missing");
    expect({}.polluted).toBeUndefined();
  });

  it("board.history: a player's first stroke on a place is theirs to undo", async () => {
    const res = await ask("board.edit", { mark: { on: "grip", c: 1, w: 3, pts: [0, 0, 0.1, 0.1] } });
    expect(res.status).toBe("done");
    expect(res.undo.ops[0].path).toEqual(["scraps", "grip", "marks"]);
    expect((await ask("board.history", { record: res.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps.grip.marks ?? {}).toEqual({});
    // (bo may not undo it for ana: it was never handed to bo)
    await ask("board.history", { record: res.undo, side: "after" });
    expect((await ask("board.history", { record: res.undo, side: "before" }, bo)).status).toBe("forgotten");
  });

  it("an undo of a move of a card taken off since makes no blank card", async () => {
    const rec = { ops: [{ path: ["scraps", "gone", "x"], b: 1, a: 2 }] };
    expect(recordUpdate(boardOf(scene), rec, "before")).toEqual({});
  });

  it("board.edit: a sheet stroke on their own layer, never rubbing out another's", async () => {
    expect((await ask("board.edit", { mark: { c: 1, w: 5, pts: [1, 2, 3, 4] } })).status).toBe("done");
    expect(Object.values(boardOf(scene).marks.ana)).toHaveLength(1);
    await ask("board.edit", { unmark: [["bo", "m1"]] });
    expect(boardOf(scene).marks.bo.m1).toBeDefined();
    expect((await ask("board.edit", { remark: { marks: { bo: { m1: { c: 0, w: 4, pts: [5, 5, 9, 9] } } } } })).status).toBe("not-allowed");
  });

  it("board.edit: a player's pen and wash keep their nib, a wash its width (Luke, 2026-10-25)", async () => {
    expect((await ask("board.edit", { mark: { c: 1, w: 3, n: "pen", pts: [1, 2, 3, 4] } })).status).toBe("done");
    expect((await ask("board.edit", { mark: { c: 1, w: 40, n: "wash", pts: [5, 6, 7, 8] } })).status).toBe("done");
    expect((await ask("board.edit", { mark: { c: 1, w: 40, n: "nonsense", pts: [9, 9, 12, 12] } })).status).toBe("done");
    const mine = Object.values(boardOf(scene).marks.ana);
    expect(mine.find((st) => st.pts[0] === 1)).toMatchObject({ n: "pen", w: 3 });
    expect(mine.find((st) => st.pts[0] === 5)).toMatchObject({ n: "wash", w: 40 });
    // (anything else is the brush, at the brush's widest)
    const brush = mine.find((st) => st.pts[0] === 9);
    expect(brush.n).toBeUndefined();
    expect(brush.w).toBeLessThan(40);
    // (on a card too)
    expect((await ask("board.edit", { mark: { on: "grip", c: 1, w: 40, n: "wash", pts: [0, 0, 0.1, 0.1] } })).status).toBe("done");
    expect(Object.values(boardOf(scene).scraps.grip.marks)[0]).toMatchObject({ n: "wash", w: 40 });
  });

  it("board.edit: part of a stroke rubbed out, theirs or public; the cut worked out by the GM (Luke, 2026-10-25)", async () => {
    scene.flags.heart.board.marks.ana = { a1: { c: 2, w: 6, pts: [0, 0, 300, 0] } };
    const sweep = { pts: [150, -40, 150, 40], r: 10 };
    expect((await ask("board.edit", { cut: { sweep, strokes: [["ana", "a1"]] } })).status).toBe("done");
    const left = boardOf(scene).marks.ana;
    expect(Object.keys(left)).toHaveLength(2);
    expect(left.a1.span[0]).toBe(0);
    expect(left.a1.seed).toBe("mark:a1:4");
    // (another's: left as it is; made public: anyone's)
    await ask("board.edit", { cut: { sweep: { pts: [5, 0], r: 8 }, strokes: [["bo", "m1"]] } });
    expect(boardOf(scene).marks.bo.m1.pts).toEqual([0, 0, 9, 9]);
    scene.flags.heart.board.marks.bo.m1.open = true;
    scene.flags.heart.board.marks.bo.m1.pts = [0, 0, 200, 0];
    await ask("board.edit", { cut: { sweep: { pts: [100, 0], r: 8 }, strokes: [["bo", "m1"]] } });
    expect(Object.keys(boardOf(scene).marks.bo)).toHaveLength(2);
    // (a sweep that isn't one is refused)
    expect((await ask("board.edit", { cut: { sweep: { pts: [1], r: 5 }, strokes: [["ana", "a1"]] } })).status).toBe("not-allowed");
  });

  it("board.edit: a player's doodle, its strokes and ids worked out by the GM, never overwriting what is there (Luke, 2026-10-25)", async () => {
    // (a stroke of theirs the asker's board has not seen yet, at m1)
    scene.flags.heart.board.marks.ana = { m1: { c: 2, w: 6, pts: [0, 0, 300, 0] } };
    const brush = { size: 60, c: 1, w: 6, b: 1, o: 0.85 };
    expect((await ask("board.edit", { doodle: { a: { kind: "gate", seed: "gate:1", at: { x: 400, y: 400 } }, brush } })).status).toBe("done");
    const mine = boardOf(scene).marks.ana;
    expect(mine.m1.pts).toEqual([0, 0, 300, 0]);
    expect(Object.keys(mine).length).toBeGreaterThan(5);
    // (a second one laid at once: both kept)
    const n = Object.keys(mine).length;
    expect((await ask("board.edit", { doodle: { a: { kind: "gate", seed: "gate:2", at: { x: 600, y: 400 } }, brush } })).status).toBe("done");
    expect(Object.keys(boardOf(scene).marks.ana)).toHaveLength(n + (n - 1));
    // (on a card, laid out to find its frame; never a kind there is none
    // of, nor off the sheet)
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ measureText: (t) => ({ width: String(t).length * 8 }) }) }) });
    try {
      expect((await ask("board.edit", { doodle: { a: { kind: "sun", seed: "sun:1", at: { x: 100, y: 100 }, on: "grip" }, brush } })).status).toBe("done");
    } finally {
      vi.unstubAllGlobals();
    }
    const onCard = Object.values(boardOf(scene).scraps.grip.marks ?? {});
    expect(onCard.length).toBeGreaterThan(0);
    expect(onCard.every((st) => st.by === "ana")).toBe(true);
    expect((await ask("board.edit", { doodle: { a: { kind: "nonsense", at: { x: 400, y: 400 } }, brush } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { doodle: { a: { kind: "gate", at: { x: 1e9, y: 0 } }, brush } })).status).toBe("not-allowed");
  });

  it("a stroke's lock let go is written, merged as Foundry merges (Luke, 2026-10-25)", async () => {
    scene.flags.heart.board.marks.ana = { a1: { c: 2, w: 6, pts: [0, 0, 300, 0], locked: true } };
    await ask("board.edit", { remark: { marks: { ana: { a1: { c: 2, w: 6, pts: [0, 0, 300, 0] } } } } });
    expect(boardOf(scene).marks.ana.a1.locked).toBe(false);
  });

  it("board.edit: a player's own cards into the bin; another's refused whole", async () => {
    const res = await ask("board.edit", { ownCards: ["mine"] });
    expect(res.status).toBe("done");
    expect(boardOf(scene).bin.mine).toMatchObject({ by: "ana", scrap: { text: "ana's" } });
    expect((await ask("board.history", { record: res.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toBeDefined();
    expect((await ask("board.edit", { ownCards: ["mine", "theirs"] })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.theirs).toBeDefined();
  });

  it("board.edit: a plain player's patch, string, or card taken off is refused", async () => {
    expect((await ask("board.edit", { patch: { scraps: { grip: { x: 1 } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { removeScrap: "theirs" })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.grip.x).toBe(500);
  });

  it("board.edit: a players' board's owner edits its notes, never the GM's places", async () => {
    scene.flags.heart.boardOwners = "all";
    expect((await ask("board.edit", { patch: { scraps: { theirs: { x: 7, y: 100 } } } })).status).toBe("done");
    expect(boardOf(scene).scraps.theirs.x).toBe(7);
    expect((await ask("board.edit", { patch: { scraps: { grip: { x: 7 } } } })).status).toBe("not-allowed");
  });
});

describe("a player's undo only of what the GM's client handed them (M31, Luke 2026-10-21)", () => {
  it("a record changed on its way back is refused, the board untouched; the one handed out works", async () => {
    const made = await ask("board.addNote", { type: "note", x: 10, y: 20, text: "plain" });
    expect((await ask("board.history", { record: made.undo, side: "before" })).status).toBe("done");
    // (the same edit, its note made typed and bigger on the way back)
    const forged = clone(made.undo);
    Object.assign(forged.ops[0].a, { typed: true, s: 3 });
    expect((await ask("board.history", { record: forged, side: "after" })).status).toBe("forgotten");
    expect(boardOf(scene).scraps[made.key]).toBeUndefined();
    expect((await ask("board.history", { record: made.undo, side: "after" })).status).toBe("done");
    expect(boardOf(scene).scraps[made.key]).toMatchObject({ text: "plain" });
    expect(boardOf(scene).scraps[made.key].typed).toBeUndefined();
  });

  it("a record whose keys come back in another order is the same record", async () => {
    const made = await ask("board.addNote", { type: "note", x: 10, y: 20, text: "order" });
    const turned = { ops: made.undo.ops.map((o) => Object.fromEntries(Object.entries(o).reverse())) };
    expect((await ask("board.history", { record: turned, side: "before" })).status).toBe("done");
  });

  it("after the GM's client reloads, older records are forgotten; new ones work", async () => {
    const old = await ask("board.edit", { own: { scraps: { mine: { x: 40, y: 40 } } } });
    forgetHandedRecords();
    expect((await ask("board.history", { record: old.undo, side: "before" })).status).toBe("forgotten");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 40, y: 40 });
    const fresh = await ask("board.edit", { own: { scraps: { mine: { x: 70, y: 70 } } } });
    expect((await ask("board.history", { record: fresh.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 40, y: 40 });
  });

  it("on the player's client: a forgotten record is said once, plainly, and the stale ones let go", async () => {
    const old = await ask("board.edit", { own: { scraps: { mine: { x: 40, y: 40 } } } });
    // (a socket between ana's client and the GM's, in one process)
    setUsers([gm, ana, bo], { self: ana, activeGM: gm });
    game.socket = {
      emit: (channel, msg) => queueMicrotask(async () => {
        if (msg.kind === "request") {
          game.user = gm;
          await onRelayMessage(msg, msg.from);
        } else {
          game.user = ana;
          await onRelayMessage(msg, gm.id);
        }
      }),
    };
    pushEdit(scene, old.undo);
    pushEdit(scene, old.undo);
    forgetHandedRecords();
    ui.notifications.info.mockClear();
    ui.notifications.warn.mockClear();
    expect(await undo(scene)).toBe(false);
    expect(game.user).toBe(ana);
    expect(ui.notifications.info).toHaveBeenCalledWith("heart.board.undo-forgotten");
    expect(ui.notifications.warn).not.toHaveBeenCalled();
    // (nothing older is left to refuse again)
    ui.notifications.info.mockClear();
    expect(await undo(scene)).toBe(false);
    expect(ui.notifications.info).toHaveBeenCalledWith("heart.board.nothing-to-undo");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 40, y: 40 });
  });
});

describe("where a player's note may land (M32, Luke 2026-10-21)", () => {
  const other = (opts) => {
    const s2 = fakeScene({ scraps: {}, links: {}, pins: {}, marks: {} }, "s2", opts);
    game.scenes = new FakeCollection([scene, s2]);
    return s2;
  };

  it("never on a board the player can't see; on one they may see, or are on", async () => {
    const hidden = other({ active: false });
    expect((await ask("board.addNote", { sceneId: "s2", x: 10, y: 20, text: "sneaky" })).status).toBe("not-allowed");
    expect(hidden.updates).toHaveLength(0);
    const theirs = other({ active: false, seen: ["ana"] });
    expect((await ask("board.addNote", { sceneId: "s2", x: 10, y: 20, text: "allowed" })).status).toBe("done");
    expect(Object.values(boardOf(theirs).scraps)[0]).toMatchObject({ text: "allowed" });
    const pulled = other({ active: false });
    ana.viewedScene = "s2";
    expect((await ask("board.addNote", { sceneId: "s2", x: 10, y: 20, text: "pulled here" })).status).toBe("done");
    expect(Object.values(boardOf(pulled).scraps)).toHaveLength(1);
  });

  it("never off the sheet", async () => {
    for (const [x, y] of [[-1, 20], [20, -1], [1e7, 20], [20, 1e7]]) {
      expect((await ask("board.addNote", { x, y, text: "off" })).status).toBe("not-allowed");
    }
    expect(Object.keys(boardOf(scene).scraps).sort()).toEqual(["grip", "mine", "theirs"]);
    expect((await ask("board.addNote", { x: 0, y: 0, text: "corner" })).status).toBe("done");
  });
});

// Luke, 2026-10-25: the board health audit's batches A (the relay) and B
// (keeping the board safe), monorepo docs/history/board-health-audit.md
describe("the relay's checks (the health audit, batch A)", () => {
  const move = (moves, who = ana) => ask("board.edit", { own: { scraps: moves } }, who);
  const stroke = (x = 0) => ({ c: 0, w: 4, pts: [x, 0, x + 9, 9] });
  const anaString = () => {
    scene.flags.heart.board.pins = { p1: { tex: "t", x: 10, y: 10, author: "ana" } };
    scene.flags.heart.board.links = { l1: { kind: "plain", aPin: "p1", bPt: { x: 50, y: 50 }, author: "ana" } };
  };

  it("A1: a key that reaches an object's prototype is refused, nothing polluted", async () => {
    const req = JSON.parse('{"remark":{"marks":{"__proto__":{"polluted":{"c":0,"w":4,"pts":[0,0,9,9]}}}}}');
    expect((await ask("board.edit", req)).status).toBe("not-allowed");
    expect({}.polluted).toBeUndefined();
    for (const k of ["constructor", "prototype"]) expect((await ask("board.edit", { unmark: [[k, "m1"]] })).status).toBe("not-allowed");
    expect((await ask("board.editNote", { key: "constructor", text: "x" })).status).toBe("not-allowed");
  });

  it("A2: an id with a dot, or one starting -=, never becomes an update path", async () => {
    const writes = scene.updates.length;
    expect((await ask("board.edit", { ownPatch: { newLinks: { "l9.kind": { aPt: { x: 1, y: 1 }, bPt: { x: 5, y: 5 } } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { remark: { marks: { ana: { "-=m1": stroke() } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { mark: { on: "grip.marks", c: 1, w: 3, pts: [0, 0, 0.1, 0.1] } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { ownCards: ["mine", "a".repeat(41)] })).status).toBe("not-allowed");
    expect(scene.updates.length).toBe(writes);
    expect((await ask("board.edit", { ownPatch: { newLinks: { l9: { aPt: { x: 1, y: 1 }, bPt: { x: 5, y: 5 } } } } })).status).toBe("done");
    expect(["p12", "m3", "pin_1", "grip-station"].every(safeKey)).toBe(true);
    expect(["", "a.b", "-=a", "__proto__", 7].some(safeKey)).toBe(false);
  });

  it("A4: ownPatch and ownString keep the lock rule, and only a pin's and a string's own fields", async () => {
    anaString();
    scene.flags.heart.board.scraps.mine.locked = true;
    // (a pin of theirs put into their locked note, a new string tied into it)
    expect((await ask("board.edit", { ownPatch: { pins: { p1: { on: "mine", at: { u: 0, v: 0 }, x: null, y: null } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { ownString: { act: { a: "mine", aAt: { u: 0, v: 0 }, bPt: { x: 300, y: 300 } } } })).status).toBe("not-allowed");
    // (a field no pin or string of a player's has)
    expect((await ask("board.edit", { ownPatch: { pins: { p1: { state: "hidden" } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { ownPatch: { link: ["l1", { delve: "Actor.x" }] } })).status).toBe("not-allowed");
    // (its kind, whether it is shown, and its maker never taken from a player)
    expect((await ask("board.edit", { ownPatch: { link: ["l1", { kind: "delve", state: "hidden", author: "bo", color: 2 }], pins: { p1: { x: 40, y: 40 } } } })).status).toBe("done");
    expect(boardOf(scene).links.l1).toMatchObject({ kind: "plain", author: "ana", color: 2 });
    expect(boardOf(scene).links.l1.state).toBeUndefined();
    expect(boardOf(scene).pins.p1).toMatchObject({ x: 40, y: 40, author: "ana" });
    // (let go, the note takes the string)
    scene.flags.heart.board.scraps.mine.locked = false;
    expect((await ask("board.edit", { ownString: { act: { a: "mine", aAt: { u: 0, v: 0 }, bPt: { x: 300, y: 300 } } } })).status).toBe("done");
  });

  it("A5: a players' board owner's patch is checked field by field; never the bin, a card's maker, or the strokes", async () => {
    scene.flags.heart.boardOwners = "all";
    const bin = { theirs: { at: 1, by: "gm", scrap: note("bo"), pins: {}, links: {} } };
    expect((await ask("board.edit", { patch: { bin } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { patch: { scraps: { theirs: { author: "ana" } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { patch: { scraps: { theirs: { open: true } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { patch: { marks: { bo: { m1: null } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { patch: { newScraps: { w9: { type: "note", text: "made up", x: 1, y: 1 } } } })).status).toBe("not-allowed");
    expect(boardOf(scene).marks.bo.m1).toBeDefined();
    expect(boardOf(scene).scraps.theirs.author).toBe("bo");
    expect(boardOf(scene).scraps.w9).toBeUndefined();
    // (a name tag renamed, as the String window does, and a string's kind)
    scene.flags.heart.board.links = { l1: { kind: "plain", aPt: { x: 1, y: 1 }, bPt: { x: 50, y: 50 } } };
    expect((await ask("board.edit", { patch: { scraps: { theirs: { text: "  renamed " } }, link: ["l1", { kind: "rail", state: "hidden" }] } })).status).toBe("done");
    expect(boardOf(scene).scraps.theirs.text).toBe("renamed");
    expect(boardOf(scene).links.l1.kind).toBe("rail");
    expect(boardOf(scene).links.l1.state).toBeUndefined();
  });

  it("A6: board.edit, board.editNote, and board.history refuse a board the player can't see", async () => {
    const hidden = fakeScene({ scraps: { n: note("ana") }, links: {}, pins: {}, marks: {} }, "s2", { active: false });
    game.scenes = new FakeCollection([scene, hidden]);
    expect((await ask("board.edit", { sceneId: "s2", mark: { c: 1, w: 3, pts: [1, 2, 3, 4] } })).status).toBe("not-allowed");
    expect((await ask("board.editNote", { sceneId: "s2", key: "n", text: "x" })).status).toBe("not-allowed");
    expect((await ask("board.history", { sceneId: "s2", record: { ops: [] }, side: "before" })).status).toBe("not-allowed");
    expect(hidden.updates).toHaveLength(0);
  });

  it("A7: points far off the sheet and sizes past the model's limits are refused", async () => {
    expect((await move({ mine: { x: 1e12, y: 100 } })).status).toBe("not-allowed");
    expect((await move({ mine: { parts: { text: { u: 0, v: 0, s: 1e9 } } } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { mark: { c: 1, w: 3, pts: [0, 0, 1e9, 5] } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { mark: { on: "grip", c: 1, w: 3, pts: [0, 0, 500, 0] } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { remark: { marks: { ana: { m9: { c: 0, w: 4, pts: [0, 0, -1e9, 0] } } } } })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 900, y: 100 });
    // (a little off the sheet is fine)
    expect((await move({ mine: { x: -50, y: 100 } })).status).toBe("done");
  });

  it("A8: no more than 200 things at once, 2000 strokes on a layer, or 300 notes of a player's", async () => {
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`m${i + 1}`, stroke(i)]));
    expect((await ask("board.edit", { remark: { marks: { ana: many } } })).status).toBe("not-allowed");
    scene.flags.heart.board.marks.ana = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`m${i + 1}`, stroke()]));
    expect((await ask("board.edit", { mark: { c: 1, w: 3, pts: [1, 2, 3, 4] } })).status).toBe("not-allowed");
    expect((await ask("board.edit", { remark: { marks: { ana: { m9999: stroke() } } } })).status).toBe("not-allowed");
    for (let i = 0; i < 300; i++) scene.flags.heart.board.scraps[`n${i}`] = note("ana", 10);
    expect((await ask("board.addNote", { x: 10, y: 20, text: "one more" })).status).toBe("not-allowed");
  });

  it("A9: a stroke moved is no wider than its nib allows, or than it was", async () => {
    const cap = markMax(normalizeLook({}), null);
    expect(cap).toBeLessThan(50);
    scene.flags.heart.board.marks.ana = { a1: { c: 2, w: 3, pts: [0, 0, 300, 0] }, a2: { c: 2, w: cap + 5, pts: [0, 9, 300, 9] } };
    await ask("board.edit", { remark: { marks: { ana: { a1: { c: 2, w: 50, pts: [10, 0, 310, 0] }, a2: { c: 2, w: cap + 5, pts: [10, 9, 310, 9] } } } } });
    expect(boardOf(scene).marks.ana.a1.w).toBe(cap);
    expect(boardOf(scene).marks.ana.a2.w).toBe(cap + 5);
    // (on a card too)
    await ask("board.edit", { remark: { scraps: { mine: { marks: { c1: { c: 2, w: 50, pts: [0, 0, 0.5, 0] } } } } } });
    expect(boardOf(scene).scraps.mine.marks.c1.w).toBe(cap);
  });

  it("A11: a string named nothing is refused", async () => {
    anaString();
    expect((await ask("board.edit", { ownLabel: { id: "l1", text: "   " } })).status).toBe("not-allowed");
  });

  it("A11: the GM letting a hand go waits its turn in the relay's queue", async () => {
    let release;
    const hold = new Promise((r) => { release = r; });
    registerRelayHandler("test.claimLate", async () => {
      await hold;
      game.settings.store.set("heart.boardHands", { ...game.settings.store.get("heart.boardHands"), bo: "Caveat" });
      return { status: "done" };
    });
    const claimed = runQueued("test.claimLate", {}, bo.id);
    const freed = freeHand("Reenie Beanie");
    await Promise.resolve();
    expect(game.settings.store.get("heart.boardHands")).toEqual({ ana: "Reenie Beanie" });
    release();
    await Promise.all([claimed, freed]);
    expect(game.settings.store.get("heart.boardHands")).toEqual({ bo: "Caveat" });
  });
});

describe("keeping the board safe (the health audit, batch B)", () => {
  it("B1: a GM's undo whose write fails keeps its record and says so", async () => {
    await setScrap(scene, "grip", { x: 600 });
    const write = scene.update;
    scene.update = async () => { throw new Error("offline"); };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await undo(scene)).toBe(false);
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.board.undo-failed");
    scene.update = write;
    expect(await undo(scene)).toBe(true);
    expect(boardOf(scene).scraps.grip.x).toBe(500);
  });

  it("B2: a board replaced in one write, nothing of the old one merged into it", async () => {
    scene.flags.heart.board.scraps.grip.locked = true;
    const writes = scene.updates.length;
    await replaceBoard(scene, { scraps: { grip: { lib: "grip", x: 1, y: 2 }, fresh: note("gm") } }, { backup: true });
    expect(scene.updates.length).toBe(writes + 1);
    expect(boardOf(scene).scraps).toEqual({ grip: { lib: "grip", x: 1, y: 2 }, fresh: note("gm") });
    expect(boardOf(scene).marks).toEqual({});
    expect(scene.flags.heart.boardBackup.scraps.grip.locked).toBe(true);
  });

  it("B3: a scene no longer a board loses its owners, backup, sheet, grid, and style", async () => {
    Object.assign(scene.flags.heart, { boardOwners: "all", boardBackup: { scraps: {} }, boardSheetAt: { left: 0, top: 0 }, boardGrid: 3, boardStyle: "village" });
    await setBoardScene(scene, false);
    expect(scene.flags.heart).toEqual({});
  });

  it("B4: the start and replaced copies are a pool of their own, never pushed out by removals", () => {
    const kept = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, why: i % 2 ? "start" : "replaced" }));
    const removed = Array.from({ length: 45 }, (_, i) => ({ id: 100 + i, why: "removed" }));
    expect(backupsToDrop([...removed, ...kept])).toEqual([1, 2, 100, 101, 102, 103, 104]);
    expect(backupsToDrop([{ id: 1, why: "start" }, ...removed.slice(0, 40)])).toEqual([]);
  });

  it("B6: a request that wrote part of what it asked and then failed hands back what it wrote", async () => {
    scene.flags.heart.boardOwners = "all";
    scene.flags.heart.board.links = { l1: { kind: "plain", aPt: { x: 1, y: 1 }, bPt: { x: 50, y: 50 } } };
    const write = scene.update;
    scene.update = async (data) => {
      if (Object.keys(data).some((k) => k.includes("-=l1"))) throw new Error("lost");
      return write(data);
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await ask("board.edit", { patch: { scraps: { theirs: { x: 7, y: 100 } } }, removeLink: "l1" });
    expect(res.status).toBe("failed");
    expect(res.undo.ops.map((o) => o.path.join("."))).toEqual(["scraps.theirs.x"]);
    scene.update = write;
    expect((await ask("board.history", { record: res.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps.theirs.x).toBe(1300);
  });
});
