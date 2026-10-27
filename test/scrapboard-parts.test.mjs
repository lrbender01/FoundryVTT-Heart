/**
 * The board's parts (2026-10-27, the ecosystem audit's first finding): the one
 * description in model.js (BOARD_PARTS) every list of a board's top-level keys
 * is derived from. The hand-kept lists dropped data twice (the pins' edition on
 * 2026-10-21; pieces and stages on 2026-10-27). These tests carry a board with
 * EVERY described part populated through each path that reads or writes a
 * board, and fail when any path drops one, so the next part added to the
 * description but missed anywhere is caught here and not at the table.
 *
 * What the code does with a key the description does not name (decided and
 * written here, 2026-10-27):
 *  - normalizeBoard (the view) leaves it out;
 *  - boardParts (a file, a copy, Map Dreamer's snapshot) carries it through;
 *  - boardFromText (a board read back) leaves it out of the board it returns
 *    and names it in `unknown`, since it would not reach the scene;
 *  - diffBoard with no roots diffs it, so a history record and a restore keep it.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BOARD_PARTS, PART_NAMES, normalizeBoard, diffBoard, recordTarget, recordUpdate, updateRoots, unknownParts, emptyBoardParts } from "../src/map/scrapboard/model.js";
import { boardFromText, boardParts } from "../src/map/scrapboard/boardfile.js";

// every described part, populated with something the model keeps
const FULL = {
  scraps: { grip: { lib: "grip", x: 10, y: 20, seed: 2 } },
  links: { l1: { a: "grip", bPt: { x: 5, y: 5 }, kind: "delve" } },
  pins: { pin1: { tex: "tx/pin", x: 1, y: 2 } },
  marks: { gm: { m1: { c: 1, w: 6, pts: [0, 0, 10, 10] } } },
  bits: { b1: { tex: "tx/tape", x: 3, y: 4, w: 40 } },
  decor: [{ tex: "tx/stain", x: 1, y: 1, w: 9 }],
  bin: { n1: { at: 5, scrap: { type: "note", text: "gone", x: 1, y: 1 } } },
  pinsEd: 1,
  notesEd: 2,
  sheet: { bare: true, w: 4000, h: 3000 },
  pieces: { hut1: { kind: "house", x: 100, y: 200, w: 50, h: 40 } },
  stages: [{ id: "dawn", name: "Dawn" }, { id: "dusk", name: "Dusk" }],
};
const FUTURE = { future: { a: 1 } };
const clone = (v) => JSON.parse(JSON.stringify(v));

describe("the description of a board's parts", () => {
  it("names every part once, and the test board populates all of them", () => {
    expect(new Set(PART_NAMES).size).toBe(PART_NAMES.length);
    for (const name of PART_NAMES) expect(FULL, `the test board has no ${name}`).toHaveProperty(name);
    expect(Object.keys(FULL).sort()).toEqual([...PART_NAMES].sort());
  });

  it("gives a part that is not always there a test for when it is worth keeping", () => {
    for (const p of BOARD_PARTS) if (!p.always) expect(typeof p.present, p.name).toBe("function");
  });

  it("matches what normalizeBoard returns, key for key", () => {
    const viewed = BOARD_PARTS.filter((p) => p.view).map((p) => p.name);
    expect(Object.keys(normalizeBoard({})).sort()).toEqual([...viewed].sort());
  });

  it("is the board boardOf answers for a scene without one: every always part, empty", () => {
    const empty = emptyBoardParts();
    expect(Object.keys(empty).sort()).toEqual(BOARD_PARTS.filter((p) => p.always).map((p) => p.name).sort());
    expect(empty.decor).toEqual([]);
    expect(empty.scraps).toEqual({});
  });
});

describe("every described part survives every path", () => {
  it("normalizeBoard keeps each viewed part", () => {
    const view = normalizeBoard(FULL);
    for (const p of BOARD_PARTS.filter((q) => q.view)) {
      const v = view[p.name];
      expect(v, p.name).toBeTruthy();
      if (p.kind !== "scalar") expect(Object.keys(v).length, p.name).toBeGreaterThan(0);
    }
  });

  it("boardParts carries each part, and the empty always-parts of an empty board", () => {
    const parts = boardParts(FULL);
    for (const name of PART_NAMES) expect(parts[name], name).toEqual(FULL[name]);
    const bare = boardParts({});
    expect(Object.keys(bare).sort()).toEqual(Object.keys(emptyBoardParts()).sort());
    for (const p of BOARD_PARTS.filter((q) => !q.always)) expect(bare, p.name).not.toHaveProperty(p.name);
  });

  it("boardFromText reads each part back from the text boardParts wrote", () => {
    const read = boardFromText(JSON.stringify(boardParts(FULL), null, 1));
    for (const name of PART_NAMES) expect(read.board[name], name).toEqual(FULL[name]);
    expect(read.unknown).toEqual([]);
  });

  it("diffBoard with no roots reaches each part, and a record puts it back", () => {
    const rec = diffBoard({}, FULL);
    const touched = new Set(rec.ops.map((op) => op.path[0]));
    for (const name of PART_NAMES) expect(touched.has(name), name).toBe(true);
    const built = recordTarget({}, rec, "after");
    for (const name of PART_NAMES) expect(built[name], name).toEqual(FULL[name]);
    // (and taken away again: undone)
    const undone = recordTarget(built, rec, "before");
    expect(Object.keys(undone)).toEqual([]);
  });

  it("recordUpdate writes each part under the board's path", () => {
    const data = recordUpdate({}, diffBoard({}, FULL), "after", "flags.heart.board");
    for (const name of PART_NAMES) expect(Object.keys(data).some((k) => k.startsWith(`flags.heart.board.${name}`)), name).toBe(true);
  });

  it("updateRoots reads each part at its described depth", () => {
    for (const p of BOARD_PARTS) {
      const roots = updateRoots({ [`flags.heart.board.${p.name}.a.b.c`]: 1 });
      expect(roots[0], p.name).toEqual([p.name, "a", "b", "c"].slice(0, p.depth));
    }
    // (the whole board replaced: no roots)
    expect(updateRoots({ "flags.heart.board": {} })).toBeNull();
  });
});

describe("a key the description does not name", () => {
  const board = { ...clone(FULL), ...FUTURE };

  it("is left out of the view", () => {
    expect(normalizeBoard(board)).not.toHaveProperty("future");
  });

  it("is named by unknownParts, never an unsafe name", () => {
    expect(unknownParts(board)).toEqual(["future"]);
    expect(unknownParts(JSON.parse('{"__proto__":1,"constructor":2,"future":3}'))).toEqual(["future"]);
  });

  it("is carried through by boardParts, with every described part", () => {
    const parts = boardParts(board);
    expect(parts.future).toEqual({ a: 1 });
    for (const name of PART_NAMES) expect(parts[name], name).toEqual(FULL[name]);
  });

  it("is reported, not placed, by boardFromText", () => {
    const read = boardFromText(JSON.stringify(board));
    expect(read.unknown).toEqual(["future"]);
    expect(read.board).not.toHaveProperty("future");
    for (const name of PART_NAMES) expect(read.board[name], name).toEqual(FULL[name]);
  });

  it("is diffed with no roots, so a record and a restore keep it", () => {
    const rec = diffBoard({}, board);
    expect(rec.ops.some((op) => op.path[0] === "future")).toBe(true);
    expect(recordTarget({}, rec, "after").future).toEqual({ a: 1 });
    // (a board that has it, taken to one that has not: the key is taken away)
    const gone = diffBoard(board, clone(FULL));
    expect(recordTarget(board, gone, "after")).not.toHaveProperty("future");
    // (and one that changes only it)
    expect(diffBoard({ ...FULL, future: { a: 1 } }, { ...FULL, future: { a: 2 } }).ops).toEqual([{ path: ["future", "a"], b: 1, a: 2 }]);
  });
});

describe("the real Plenty pieces board", () => {
  const file = fileURLToPath(new URL("../../../maps/plenty-pieces/board.json", import.meta.url));
  const present = existsSync(file);
  it.skipIf(!present)("round trips through boardParts and boardFromText without loss, part by part", () => {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const read = boardFromText(JSON.stringify(boardParts(raw)));
    expect(read.unknown).toEqual([]);
    const written = boardParts(raw);
    for (const p of BOARD_PARTS) {
      if (!(p.name in written)) {
        expect(read.board, p.name).not.toHaveProperty(p.name);
        continue;
      }
      expect(read.board[p.name], p.name).toEqual(written[p.name]);
    }
    // (the parts the file really has are all among the described ones)
    for (const k of Object.keys(raw)) expect(PART_NAMES.includes(k), `board.json has an undescribed key: ${k}`).toBe(true);
  });
});
