/**
 * The board as a file (src/map/scrapboard/boardfile.js, Luke 2026-10-21):
 * File, Download the board names its file from the scene and the day, and
 * Import reads it back (or a board pasted from the editor) whole, loose
 * pieces, bin, and pins' tidy mark included. A place's cards follow its
 * actor's renames.
 */

import { describe, it, expect } from "vitest";
import { boardFileName, boardFromText, renamedCards } from "../src/map/scrapboard/boardfile.js";

describe("the board's file name", () => {
  it("is the scene's name and the day", () => {
    expect(boardFileName("The Heart Map", new Date(2026, 9, 21, 23, 5))).toBe("The Heart Map 2026-10-21.json");
  });

  it("makes the name safe for a file, and falls back when there is none", () => {
    expect(boardFileName('Map: "Spire"/2?', new Date(2026, 0, 2))).toBe("Map Spire 2 2026-01-02.json");
    expect(boardFileName("  ", new Date(2026, 0, 2), "Heart Map")).toBe("Heart Map 2026-01-02.json");
  });
});

describe("a board read back from text", () => {
  const BOARD = {
    scraps: { grip: { lib: "grip", x: 10, y: 20, seed: 2 }, bad: { x: "no" } },
    links: { l1: { a: "grip", bPt: { x: 5, y: 5 }, kind: "delve" } },
    pins: { pin1: { tex: "tx/pin", x: 1, y: 2 } },
    marks: { gm: { m1: { c: 1, w: 6, pts: [0, 0, 10, 10] } } },
    bits: { b1: { tex: "tx/tape", x: 3, y: 4, w: 40 } },
    decor: [{ tex: "tx/stain", x: 1, y: 1, w: 9 }],
    bin: { n1: { at: 5, scrap: { type: "note", text: "gone", x: 1, y: 1 } }, junk: { at: 1 } },
    pinsEd: 1,
  };

  it("keeps a downloaded board whole: its loose pieces, bin, and pins' tidy mark, minus what can't be placed", () => {
    const read = boardFromText(JSON.stringify(BOARD));
    expect(read.scraps).toBe(1);
    expect(read.links).toBe(1);
    expect(Object.keys(read.board.scraps)).toEqual(["grip"]);
    expect(read.board.scraps.grip).toEqual(BOARD.scraps.grip);
    expect(read.board.bits).toEqual(BOARD.bits);
    expect(read.board.pins).toEqual(BOARD.pins);
    expect(read.board.marks.gm.m1).toEqual(BOARD.marks.gm.m1);
    expect(Object.keys(read.board.bin)).toEqual(["n1"]);
    expect(read.board.pinsEd).toBe(1);
    expect(read.board.decor).toEqual(BOARD.decor);
  });

  it("reads the editor's whole file ({ look, board })", () => {
    expect(boardFromText(JSON.stringify({ look: {}, board: BOARD })).scraps).toBe(1);
  });

  it("refuses what isn't a board", () => {
    expect(boardFromText("not json")).toBeNull();
    expect(boardFromText("[1, 2]")).toBeNull();
    expect(boardFromText(JSON.stringify({ hello: 1 }))).toBeNull();
    expect(boardFromText("")).toBeNull();
  });
});

describe("a place's cards follow its actor's name", () => {
  const raw = { scraps: { c1: { uuid: "Actor.a", name: "Old" }, c2: { uuid: "Actor.a", name: "New" }, c3: { uuid: "Actor.b", name: "Old" }, grip: { lib: "grip" } } };

  it("renames only that actor's cards whose name isn't its own", () => {
    expect(renamedCards(raw, "Actor.a", "New")).toEqual({ c1: { name: "New" } });
    expect(renamedCards(raw, "Actor.c", "New")).toEqual({});
    expect(renamedCards(raw, "Actor.a", "")).toEqual({});
  });
});

describe("the map safety fixes (Luke, 2026-10-25)", () => {
  it("a Download reminder when never downloaded, or not for a week", async () => {
    const { downloadDue, DOWNLOAD_DAYS } = await import("../src/map/scrapboard/boardfile.js");
    const now = Date.UTC(2026, 9, 25);
    expect(downloadDue(undefined, now)).toBe(true);
    expect(downloadDue(now - 864e5, now)).toBe(false);
    expect(downloadDue(now - (DOWNLOAD_DAYS + 1) * 864e5, now)).toBe(true);
  });

  it("a board's dated copy in the world, named for its scene, the day, and its id", async () => {
    const { worldCopyName } = await import("../src/map/scrapboard/boardfile.js");
    expect(worldCopyName("The Ledger: Act I", "abc123", new Date(2026, 9, 25))).toBe("The Ledger Act I 2026-10-25 abc123.json");
  });

  it("a full bin lets its oldest cards go, and says how many", async () => {
    const { binPatch, binLetGo, BIN_MAX } = await import("../src/map/scrapboard/model.js");
    const bin = Object.fromEntries(Array.from({ length: BIN_MAX }, (_, i) => [`old${i}`, { at: i, scrap: { type: "note", text: String(i) } }]));
    const raw = { scraps: { n1: { type: "note", text: "new", x: 0, y: 0 } }, links: {}, pins: {}, bin };
    const p = binPatch(raw, ["n1"], { at: BIN_MAX + 1 });
    expect(binLetGo(p)).toBe(1);
    expect(p.bin.old0).toBeNull();
    expect(binLetGo(binPatch({ ...raw, bin: {} }, ["n1"]))).toBe(0);
  });
});
