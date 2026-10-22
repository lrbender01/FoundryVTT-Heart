/**
 * The Heart map's writes and the GM relay's board handlers (Luke,
 * 2026-10-21 code audit, monorepo docs/plans/heart-code-audit/map.md): every
 * board write through api.js update() is one edit to undo, kept as what it
 * changed; the relay's handlers (notes.js) check who asked, write with a
 * sink, and hand the asker back their own edit; a player's undo is checked
 * before it is applied, so a crafted record can't empty the board or reach
 * past it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resetWorld, fakeUser, setUsers, FakeCollection } from "./helpers.mjs";
import { runQueued } from "../src/common/relay.js";
import { registerBoardRelay, forgetHandedRecords } from "../src/map/scrapboard/notes.js";
import { setScrap, removeMany, undo, redo, binCards, applyBoardPatch, replaceBoard, restoreBackup, followRename, boardOf, pushEdit } from "../src/map/scrapboard/api.js";
import { onRelayMessage } from "../src/common/relay.js";
import { recordUpdate } from "../src/map/scrapboard/model.js";

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

  it("board.moveOwn: their own notes, nothing else", async () => {
    expect((await ask("board.moveOwn", { moves: { mine: { x: 50.4, y: 60 } } })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 50, y: 60 });
    expect((await ask("board.moveOwn", { moves: { theirs: { x: 1, y: 1 } } })).status).toBe("not-allowed");
    expect((await ask("board.moveOwn", { moves: { grip: { x: 1, y: 1 } } })).status).toBe("not-allowed");
    expect(boardOf(scene).scraps.grip.x).toBe(500);
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
    expect((await ask("board.edit", { patch: { scraps: { theirs: { x: 7 } } } })).status).toBe("done");
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
    const old = await ask("board.moveOwn", { moves: { mine: { x: 40, y: 40 } } });
    forgetHandedRecords();
    expect((await ask("board.history", { record: old.undo, side: "before" })).status).toBe("forgotten");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 40, y: 40 });
    const fresh = await ask("board.moveOwn", { moves: { mine: { x: 70, y: 70 } } });
    expect((await ask("board.history", { record: fresh.undo, side: "before" })).status).toBe("done");
    expect(boardOf(scene).scraps.mine).toMatchObject({ x: 40, y: 40 });
  });

  it("on the player's client: a forgotten record is said once, plainly, and the stale ones let go", async () => {
    const old = await ask("board.moveOwn", { moves: { mine: { x: 40, y: 40 } } });
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
