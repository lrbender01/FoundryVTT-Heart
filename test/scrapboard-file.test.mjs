/**
 * The board as a file (src/map/scrapboard/boardfile.js, Luke 2026-10-21):
 * File, Download the board names its file from the scene and the day, and
 * Import reads it back (or a board pasted from the editor) whole, loose
 * pieces, bin, and pins' tidy mark included. A place's cards follow its
 * actor's renames.
 */

import { describe, it, expect } from "vitest";
import { boardFileName, boardFromText, boardParts, renamedCards } from "../src/map/scrapboard/boardfile.js";

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

  it("keeps the scene's pieces and clock stages through boardParts, a download's text, and a read back (2026-10-27)", () => {
    const whole = {
      ...BOARD,
      pieces: { hut1: { kind: "house", x: 100, y: 200, w: 50, h: 40 }, "bad id": { x: 1, y: 1 } },
      stages: [{ id: "dawn", name: "Dawn" }, { id: "dusk", name: "Dusk", block: "dawn" }],
    };
    const text = JSON.stringify(boardParts(whole), null, 1);
    const parts = JSON.parse(text);
    expect(Object.keys(parts.pieces)).toEqual(["hut1", "bad id"]);
    expect(parts.stages).toHaveLength(2);
    const read = boardFromText(text);
    expect(Object.keys(read.board.pieces)).toEqual(["hut1"]);
    expect(read.board.pieces.hut1).toEqual(whole.pieces.hut1);
    expect(read.board.stages).toEqual(whole.stages);
    // (an older file without them, and a board with none, stay without)
    expect(boardFromText(JSON.stringify(BOARD)).board).not.toHaveProperty("pieces");
    expect(boardFromText(JSON.stringify(BOARD)).board).not.toHaveProperty("stages");
    expect(boardParts(BOARD)).not.toHaveProperty("pieces");
    expect(boardParts({ ...BOARD, pieces: {}, stages: [] })).not.toHaveProperty("stages");
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

describe("Map Dreamer's map published for Foundry (2026-10-28)", async () => {
  const { publishedMeta, cleanPublished, cleanLink, linkState, publishedUrls, PUBLISH_FORMAT } = await import("../src/map/scrapboard/boardfile.js");
  const META = publishedMeta({ map: "plenty-pieces", name: "Plenty (pieces)", rev: 166, at: "2026-10-28T20:00:00.000Z", bytes: 1466928, pieces: 1504, baked: { id: "plenty-pieces", rev: "r1" } });

  it("writes a meta file that reads back the same, and names where Foundry fetches the files", () => {
    expect(META).toMatchObject({ format: PUBLISH_FORMAT, version: 1, map: "plenty-pieces", rev: 166, bytes: 1466928, pieces: 1504, baked: { id: "plenty-pieces", rev: "r1" } });
    expect(cleanPublished(JSON.parse(JSON.stringify(META)))).toEqual({ map: "plenty-pieces", name: "Plenty (pieces)", rev: 166, at: "2026-10-28T20:00:00.000Z", bytes: 1466928, pieces: 1504, baked: { id: "plenty-pieces", rev: "r1" } });
    expect(publishedUrls("plenty-pieces")).toEqual({ board: "modules/fvtt-heart-content/assets/boards/plenty-pieces/board.json", meta: "modules/fvtt-heart-content/assets/boards/plenty-pieces/board.meta.json" });
  });

  it("refuses a meta that is not one (the wrong format, a map id that is not one, no rev)", () => {
    expect(cleanPublished(null)).toBeNull();
    expect(cleanPublished({ ...META, format: "other" })).toBeNull();
    expect(cleanPublished({ ...META, map: "../x" })).toBeNull();
    expect(cleanPublished({ ...META, rev: -1 })).toBeNull();
    expect(cleanPublished({ ...META, rev: "x" })).toBeNull();
  });

  it("keeps what a scene remembers of its last bring-in, and drops what is not one", () => {
    expect(cleanLink({ map: "plenty-pieces", rev: 12, at: "t", broughtIn: "u", extra: 1 })).toEqual({ map: "plenty-pieces", rev: 12, at: "t", broughtIn: "u", auto: false });
    expect(cleanLink({ map: "plenty-pieces", rev: 12, auto: true }).auto).toBe(true);
    expect(cleanLink({ map: "plenty-pieces", rev: 12, auto: "yes" }).auto).toBe(false);
    expect(cleanLink({ map: "Bad Map", rev: 1 })).toBeNull();
    expect(cleanLink({ map: "ok" })).toBeNull();
    expect(cleanLink(undefined)).toBeNull();
  });

  it("says where a scene stands: none published, unlinked, current, or behind", () => {
    const meta = cleanPublished(META);
    const link = (rev, map = "plenty-pieces") => cleanLink({ map, rev });
    expect(linkState({ link: link(166), meta: null })).toEqual({ state: "none" });
    expect(linkState({ link: null, meta })).toEqual({ state: "unlinked" });
    expect(linkState({ link: link(166), meta })).toEqual({ state: "current" });
    expect(linkState({ link: link(150), meta })).toEqual({ state: "behind" });
    // (Map Dreamer went back to an earlier rev: still not the one the scene took)
    expect(linkState({ link: link(170), meta })).toEqual({ state: "behind" });
    expect(linkState({ link: link(166, "other"), meta })).toEqual({ state: "behind" });
  });

  it("notes a baked map rebuilt on disk since the scene loaded it, beside the board's state", () => {
    const meta = cleanPublished(META);
    const link = cleanLink({ map: "plenty-pieces", rev: 166 });
    expect(linkState({ link, meta, bakedNow: "r1", bakedDisk: "r1" })).toEqual({ state: "current" });
    expect(linkState({ link, meta, bakedNow: "r1", bakedDisk: "r2" })).toEqual({ state: "current", bakeStale: true });
    expect(linkState({ link, meta, bakedNow: null, bakedDisk: "r2" })).toEqual({ state: "current" });
  });
});

describe("Map Dreamer's map brought in without costing the table what it made (2026-10-27)", async () => {
  const { mergePublished, cleanLink, cleanLinkIds, countTotal, bannerInfo, cleanPublished, publishedMeta } = await import("../src/map/scrapboard/boardfile.js");
  const piece = (extra = {}) => ({ x: 1, y: 2, w: 3, h: 4, ...extra });
  // the scene: two things the last bring-in put there (p1 a prep piece, c1 a card, m1 a stroke), plus
  // what the table made (p9 a table piece, p8 a piece with origin "prep" the bring-in has no record of, c9 a card,
  // l9 a string, n1 a pin, m9 a stroke in its own layer, a bin entry)
  const SCENE = {
    scraps: { c1: { name: "old card" }, c9: { name: "table card" } },
    links: { l9: { a: "c9", kind: "delve" } },
    pins: { n1: { tex: "pin", x: 0, y: 0 } },
    marks: { gm: { m1: { c: 1, pts: [0, 0, 1, 1] }, m9: { c: 2, pts: [1, 1, 2, 2] } } },
    bits: {},
    decor: [{ tex: "old" }],
    bin: { gone: { scrap: { name: "binned" } } },
    pieces: { p1: piece({ name: "old" }), p8: piece({ origin: "prep" }), p9: piece({ origin: "table" }) },
    sheet: { cols: 1, rows: 1 },
    stages: ["night"],
  };
  const LINK = { map: "plenty-pieces", rev: 5, ids: { scraps: ["c1"], links: [], pins: [], bits: [], pieces: ["p1"], marks: ["gm/m1"] } };
  const PUB = {
    scraps: { c1: { name: "new card" }, c2: { name: "another new card" } },
    links: {},
    pins: {},
    marks: { gm: { m1: { c: 3, pts: [5, 5, 6, 6] }, m2: { c: 4, pts: [7, 7, 8, 8] } } },
    bits: {},
    decor: [{ tex: "new" }],
    pieces: { p1: piece({ name: "new" }), p2: piece(), p9: piece({ name: "the published p9" }) },
    sheet: { cols: 3, rows: 2 },
    stages: ["dawn", "night"],
  };

  it("replaces what the last bring-in put there and every piece marked prep, keeps the rest", () => {
    const { board, replaced, kept } = mergePublished(SCENE, PUB, cleanLink(LINK));
    // the table's pieces and card, string, pin, and stroke stay as they were
    expect(board.pieces.p9).toEqual(SCENE.pieces.p9);
    expect(board.scraps.c9).toEqual({ name: "table card" });
    expect(board.links.l9).toEqual(SCENE.links.l9);
    expect(board.pins.n1).toEqual(SCENE.pins.n1);
    expect(board.marks.gm.m9).toEqual(SCENE.marks.gm.m9);
    // what Map Dreamer drew is its newest
    expect(board.pieces.p1.name).toBe("new");
    expect(board.pieces.p2).toBeDefined();
    expect(board.scraps.c1.name).toBe("new card");
    expect(board.scraps.c2).toBeDefined();
    expect(board.marks.gm.m1.c).toBe(3);
    expect(board.marks.gm.m2).toBeDefined();
    // the prep piece the bring-in had no record of is replaced (gone: the published board lacks it)
    expect(board.pieces.p8).toBeUndefined();
    expect(replaced).toEqual({ cards: 1, strings: 0, pins: 0, bits: 0, pieces: 2, strokes: 1 });
    expect(kept).toEqual({ cards: 1, strings: 1, pins: 1, bits: 0, pieces: 1, strokes: 1, collided: 1 });
  });

  it("keeps the table's item on an id collision and counts it, and does not record that id", () => {
    const { board, kept, ids } = mergePublished(SCENE, PUB, cleanLink(LINK));
    expect(board.pieces.p9.name).toBeUndefined();
    expect(kept.collided).toBe(1);
    expect(ids.pieces).toEqual(["p1", "p2"]);
    expect(ids.scraps).toEqual(["c1", "c2"]);
    expect(ids.marks).toEqual(["gm/m1", "gm/m2"]);
  });

  it("takes the sheet, the stages, and the decor from the published board, and leaves the bin the scene's", () => {
    const { board } = mergePublished(SCENE, PUB, cleanLink(LINK));
    expect(board.sheet).toEqual({ cols: 3, rows: 2 });
    expect(board.stages).toEqual(["dawn", "night"]);
    expect(board.decor).toEqual([{ tex: "new" }]);
    expect(board.bin).toEqual(SCENE.bin);
  });

  it("a scene with no recorded ids replaces only its prep pieces", () => {
    const { board, replaced, kept } = mergePublished(SCENE, PUB, null);
    expect(replaced).toEqual({ cards: 0, strings: 0, pins: 0, bits: 0, pieces: 1, strokes: 0 });
    expect(board.scraps.c1.name).toBe("old card");
    expect(kept.collided).toBeGreaterThan(0);
  });

  it("an empty scene board takes the whole published board and records every id", () => {
    const { board, replaced, ids } = mergePublished({}, PUB, null);
    expect(countTotal(replaced)).toBe(0);
    expect(Object.keys(board.pieces)).toEqual(["p1", "p2", "p9"]);
    expect(ids.pieces).toEqual(["p1", "p2", "p9"]);
    expect(ids.links).toEqual([]);
  });

  it("never lets an id walk into an object's prototype", () => {
    const evil = JSON.parse('{"scraps":{"__proto__":{"x":1},"ok":{"name":"ok"}},"links":{},"pins":{},"marks":{},"bits":{},"decor":[]}');
    const { board } = mergePublished({}, evil, null);
    expect(Object.keys(board.scraps)).toEqual(["ok"]);
    expect({}.x).toBeUndefined();
  });

  it("keeps a link's ids only when they are there, always as six lists", () => {
    expect(cleanLink({ map: "plenty-pieces", rev: 1 }).ids).toBeUndefined();
    const l = cleanLink({ map: "plenty-pieces", rev: 1, ids: { pieces: ["a", 7, "b"] } });
    expect(l.ids).toEqual({ scraps: [], links: [], pins: [], bits: [], pieces: ["a", "b"], marks: [] });
    expect(cleanLinkIds("no")).toBeNull();
    expect(cleanLinkIds([])).toBeNull();
  });

  it("says what the banner says: nothing when nothing is published, else current, behind, or by hand", () => {
    const meta = cleanPublished(publishedMeta({ map: "plenty-pieces", rev: 9, at: "t", bytes: 1 }));
    expect(bannerInfo({ link: null, meta: null })).toBeNull();
    expect(bannerInfo({ link: null, meta })).toEqual({ kind: "unlinked", have: null, now: 9, merges: false });
    expect(bannerInfo({ link: cleanLink({ map: "plenty-pieces", rev: 9 }), meta })).toMatchObject({ kind: "current", have: 9, now: 9 });
    expect(bannerInfo({ link: cleanLink({ map: "plenty-pieces", rev: 7, ids: {} }), meta })).toEqual({ kind: "behind", have: 7, now: 9, merges: true });
  });
});

describe("a board is brought in only at the ground's scale (2026-10-27)", async () => {
  const { boardScaleCheck } = await import("../src/map/scrapboard/boardfile.js");
  // a bare sheet 25,000 px wide over a 500 m map: 50 px a metre
  const board = { sheet: { bare: true, w: 25000, h: 25000 } };
  const mapSize = { w: 500, h: 500 };
  it("refuses a scene at 32.8 px a metre (a 5 ft square at 50 px), naming both numbers", () => {
    expect(boardScaleCheck({ board, mapSize, mapUnitMetres: 1, scenePxPerMetre: 50 / (5 * 0.3048) })).toEqual({ boardPxPerMetre: 50, scenePxPerMetre: 32.8 });
  });
  it("passes a scene at 50 px a metre, and one within 1 percent of it", () => {
    expect(boardScaleCheck({ board, mapSize, mapUnitMetres: 1, scenePxPerMetre: 50 })).toBeNull();
    expect(boardScaleCheck({ board, mapSize, mapUnitMetres: 1, scenePxPerMetre: 50.3 })).toBeNull();
  });
  it("counts the map's unit in metres", () => {
    expect(boardScaleCheck({ board, mapSize: { w: 1640.4, h: 1640.4 }, mapUnitMetres: 0.3048, scenePxPerMetre: 50 })).toBeNull();
  });
  it("has nothing to compare without a bare sheet or a map size", () => {
    expect(boardScaleCheck({ board: { sheet: { cols: 1, rows: 1 } }, mapSize, mapUnitMetres: 1, scenePxPerMetre: 32.8 })).toBeNull();
    expect(boardScaleCheck({ board: {}, mapSize, mapUnitMetres: 1, scenePxPerMetre: 32.8 })).toBeNull();
    expect(boardScaleCheck({ board, mapSize: null, mapUnitMetres: 1, scenePxPerMetre: 32.8 })).toBeNull();
  });
});

describe("the table layer out of Foundry (Luke, 2026-10-27)", async () => {
  const { tableLayerName, tableLayerDoc, worldCopyName } = await import("../src/map/scrapboard/boardfile.js");
  const edge = (id, over = {}) => ({
    id: `table-${id}`,
    type: "at",
    from: `person:plenty/${id}`,
    to: [12.345, 6],
    when: "noon",
    layer: "table",
    prov: { by: "foundry:luke", at: "2026-10-27T19:30:00-07:00", origin: "table", provisional: false },
    ...over,
  });

  it("is named for the daily copy, ending .table.json", () => {
    const date = new Date(2026, 9, 27);
    expect(tableLayerName("Plenty: the Green", "abc123", date)).toBe("Plenty the Green 2026-10-27 abc123.table.json");
    expect(tableLayerName("Plenty", "abc123", date)).toBe(worldCopyName("Plenty", "abc123", date).replace(/\.json$/, ".table.json"));
  });

  it("is a document of the edges sorted by id, in metres to the centimetre", () => {
    const d = tableLayerDoc({ world: "heart", scene: { id: "s1", name: "Plenty" }, board: "plenty", day: "2026-10-27", written: "2026-10-27T19:31:00-07:00", edges: [edge("zed"), edge("ada", { hidden: true, flip: true })] });
    expect(d).toMatchObject({ format: "heart-table-layer", version: 1, world: "heart", scene: { id: "s1", name: "Plenty" }, board: "plenty", day: "2026-10-27" });
    expect(d.edges.map((e) => e.id)).toEqual(["table-ada", "table-zed"]);
    expect(d.edges[0]).toEqual(edge("ada", { hidden: true, flip: true, to: [12.35, 6] }));
    // (hidden and flip only when true)
    expect("hidden" in d.edges[1] || "flip" in d.edges[1]).toBe(false);
  });

  it("gives the same bytes for the same edges in any order", () => {
    const base = { world: "heart", scene: { id: "s1", name: "Plenty" }, board: "plenty", day: "2026-10-27", written: "t" };
    const a = JSON.stringify(tableLayerDoc({ ...base, edges: [edge("b"), edge("a")] }));
    const b = JSON.stringify(tableLayerDoc({ ...base, edges: [edge("a"), edge("b")] }));
    expect(a).toBe(b);
  });

  it("leaves out an edge that is not a placement on the table layer, and keeps one edge to an id", () => {
    const d = tableLayerDoc({ edges: [null, edge("x", { type: "move" }), edge("x", { when: "" }), edge("x", { to: [1] }), edge("x", { to: [NaN, 2] }), edge("x", { id: "" }), edge("keep", { layer: "beat", to: [1, 2] }), edge("keep", { to: [3, 4] })] });
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0]).toMatchObject({ id: "table-keep", layer: "table", to: [3, 4] });
    expect(tableLayerDoc({}).edges).toEqual([]);
  });
});
