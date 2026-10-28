/**
 * Baked backgrounds (2026-10-25, the Village of Plenty): the manifest a bake
 * writes, the level a zoom needs, the tiles a view needs, the tiles kept
 * within a budget, overlays and roofs shown or not, and the NPC fog's rule
 * (baked.js; design in monorepo docs/plans/board-baked-backgrounds.md).
 */

import { describe, it, expect } from "vitest";
import { cleanManifest, tileUrl, levelFor, tileGrid, tilesIn, TileCache, cleanBakedFlags, overlayShown, overlaySort, partShown, shownParts, fogHides, fogDistance, unitPx, metrePx, metresPer, squareIn, SQUARES } from "../src/map/scrapboard/baked.js";

const MANIFEST = () => ({
  format: "heart-board-tiles",
  version: 1,
  id: "plenty",
  name: "The Village of Plenty",
  rev: "r42",
  unit: "m",
  size: [500, 500],
  tilePx: 512,
  levels: [
    { z: 3, pxPerUnit: 32, path: "base/z3/{x}_{y}.webp" },
    { z: 0, pxPerUnit: 4, path: "base/z0/{x}_{y}.webp" },
    { z: 1, pxPerUnit: 8, path: "base/z1/{x}_{y}.webp" },
    { z: 2, pxPerUnit: 16, path: "base/z2/{x}_{y}.webp" },
  ],
  overview: "base/overview.webp",
  overlays: [
    { id: "festival", name: "The Fall Leaving set-up", audience: "all", shown: true, rect: [175, 180, 325, 305], levels: [{ pxPerUnit: 4, path: "overlays/festival/z0/{x}_{y}.webp" }, { pxPerUnit: 32, path: "overlays/festival/z3/{x}_{y}.webp" }] },
    { id: "labels-gm", audience: "gm", shown: true, rect: [0, 0, 500, 500], levels: [{ pxPerUnit: 4, path: "overlays/labels-gm/z0/{x}_{y}.webp" }] },
    { id: "empty", rect: [0, 0, 10, 10], levels: [] },
  ],
  roofs: [
    { id: "meetinghouse", name: "The meetinghouse", building: "meetinghouse", parts: [{ id: "nave", rect: [248, 216, 266, 232], image: "roofs/mh-nave.webp" }, { id: "vestibule", rect: [244, 220, 249, 226], image: "roofs/mh-vest.webp" }] },
    { id: "smithy", rect: [300, 300, 310, 308], image: "roofs/smithy.webp" },
  ],
});
const BASE = "modules/fvtt-heart-content/assets/art/map/boards/plenty/";

describe("cleanManifest", () => {
  it("takes a bake's manifest: levels coarse to fine, every path in its folder with the bake's stamp", () => {
    const m = cleanManifest(MANIFEST(), BASE);
    expect(m.levels.map((l) => l.pxPerUnit)).toEqual([4, 8, 16, 32]);
    expect(tileUrl(m.levels[3], 3, 7)).toBe(`${BASE}base/z3/3_7.webp?v=r42`);
    expect(m.overview).toBe(`${BASE}base/overview.webp?v=r42`);
    expect(m.size).toEqual({ w: 500, h: 500 });
    // (an overlay with no levels dropped; a GM's kept as the GM's)
    expect(m.overlays.map((o) => [o.id, o.audience])).toEqual([["festival", "all"], ["labels-gm", "gm"]]);
    // (a roof in parts, and one of a single image: one part, its own id)
    expect(m.roofs[0].parts.map((p) => p.id)).toEqual(["nave", "vestibule"]);
    expect(m.roofs[1].parts).toEqual([{ id: "smithy", rect: { x0: 300, y0: 300, x1: 310, y1: 308 }, image: `${BASE}roofs/smithy.webp?v=r42` }]);
  });

  it("refuses what isn't one: another format, no stamp, no levels, a bad size", () => {
    expect(cleanManifest({ ...MANIFEST(), format: "other" })).toBeNull();
    expect(cleanManifest({ ...MANIFEST(), version: 2 })).toBeNull();
    expect(cleanManifest({ ...MANIFEST(), rev: "" })).toBeNull();
    expect(cleanManifest({ ...MANIFEST(), levels: [{ pxPerUnit: 4, path: "no-coords.webp" }] })).toBeNull();
    expect(cleanManifest({ ...MANIFEST(), size: [500, 0] })).toBeNull();
    expect(cleanManifest(null)).toBeNull();
  });

  it("never a path out of its folder, nor one with a scheme", () => {
    const j = MANIFEST();
    j.levels.push({ pxPerUnit: 64, path: "../../evil/{x}_{y}.webp" });
    j.roofs.push({ id: "bad", rect: [0, 0, 1, 1], image: "https://elsewhere/x.webp" });
    j.overview = "/abs.webp";
    const m = cleanManifest(j, BASE);
    expect(m.levels.map((l) => l.pxPerUnit)).toEqual([4, 8, 16, 32]);
    expect(m.roofs.map((r) => r.id)).toEqual(["meetinghouse", "smithy"]);
    expect(m.overview).toBeNull();
  });
});

describe("the level and the tiles a view needs", () => {
  const m = cleanManifest(MANIFEST(), BASE);

  it("the coarsest level fine enough, else the finest", () => {
    expect(levelFor(m.levels, 3).pxPerUnit).toBe(4);
    expect(levelFor(m.levels, 9).pxPerUnit).toBe(16);
    expect(levelFor(m.levels, 32).pxPerUnit).toBe(32);
    expect(levelFor(m.levels, 150).pxPerUnit).toBe(32);
  });

  it("a level's grid, its edge tiles cropped to the map", () => {
    expect(tileGrid(m.levels[3], 512, m.size)).toEqual({ cols: 32, rows: 32 });
    const last = tilesIn(m.levels[3], 512, { x0: 497, y0: 497, x1: 500, y1: 500 }, m.size);
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ x: 31, y: 31, rect: { x0: 496, y0: 496, x1: 500, y1: 500 } });
  });

  it("the tiles in view and a margin, nearest the middle first, none off the map", () => {
    const T = tilesIn(m.levels[3], 512, { x0: 100, y0: 100, x1: 140, y1: 130 }, m.size, { margin: 16 });
    // (16 m a tile: 84..156 is tiles 5..9 across, 84..146 tiles 5..9 down)
    expect(new Set(T.map((t) => t.x))).toEqual(new Set([5, 6, 7, 8, 9]));
    expect(Math.min(...T.map((t) => t.y))).toBe(5);
    expect(T[0]).toMatchObject({ x: 7, y: 7 });
    expect(tilesIn(m.levels[0], 512, { x0: -900, y0: -900, x1: -800, y1: -800 }, m.size)).toEqual([]);
  });

  it("an overlay's tiles start at its own corner", () => {
    const o = m.overlays[0];
    const T = tilesIn(o.levels[1], 512, { x0: 180, y0: 185, x1: 181, y1: 186 }, { w: 150, h: 125 }, { origin: { x: 175, y: 180 } });
    expect(T).toEqual([{ x: 0, y: 0, rect: { x0: 175, y0: 180, x1: 191, y1: 196 } }]);
  });
});

describe("an overlay under the pieces (Luke, 2026-10-28)", () => {
  it("takes an optional under: pieces, and sorts between the base and the ground pieces", () => {
    const j = MANIFEST();
    j.overlays[0].under = "pieces";
    j.overlays[1].under = "nonsense";
    const m = cleanManifest(j, BASE);
    expect(m.overlays.map((o) => o.under)).toEqual(["pieces", null]);
    expect(overlaySort(m.overlays[0])).toBe(40.5);
    expect(overlaySort(m.overlays[1])).toBe(50);
    // (an old manifest, with no field, is as it was)
    expect(cleanManifest(MANIFEST(), BASE).overlays.every((o) => o.under === null && overlaySort(o) === 50)).toBe(true);
  });
});

describe("TileCache", () => {
  it("lets the least recently used go past its budget, never one still wanted", () => {
    const C = new TileCache(300);
    C.put("a", "A", 100);
    C.put("b", "B", 100);
    C.put("c", "C", 100);
    C.get("a");
    C.put("d", "D", 100);
    expect(C.prune(new Set(["b"]))).toEqual(["C"]);
    expect(C.bytes).toBe(300);
    expect([C.has("a"), C.has("b"), C.has("c"), C.has("d")]).toEqual([true, true, false, true]);
    expect(C.clear().sort()).toEqual(["A", "B", "D"]);
    expect(C.bytes).toBe(0);
  });
});

describe("what is shown, and to whom", () => {
  const m = cleanManifest(MANIFEST(), BASE);

  it("the scene's flags, cleaned", () => {
    expect(cleanBakedFlags({ manifest: " x/manifest.json ", fog: "30", overlays: { festival: false, "bad key": true }, roofs: { smithy: true, "meetinghouse/nave": true, "a/b/c": true, gone: false } })).toEqual({
      manifest: "x/manifest.json", fog: 30, dark: 40, lit: true, overlays: { festival: false }, roofs: { smithy: true, "meetinghouse/nave": true },
    });
    expect(cleanBakedFlags({ manifest: "x", dark: 250, lit: false })).toMatchObject({ dark: 100, lit: false });
    expect(cleanBakedFlags({ manifest: "" })).toBeNull();
  });

  it("the fog at night (Luke, 2026-10-26): shorter as it darkens, the whole distance for an NPC in light", () => {
    const f = { fog: 30, dark: 40, lit: true };
    expect(fogDistance(f, { darkness: 0 })).toBe(30);
    expect(fogDistance(f, { darkness: 1 })).toBeCloseTo(12);
    expect(fogDistance(f, { darkness: 0.5 })).toBeCloseTo(21);
    expect(fogDistance(f, { darkness: 1, inLight: true })).toBe(30);
    expect(fogDistance({ ...f, lit: false }, { darkness: 1, inLight: true })).toBeCloseTo(12);
    expect(fogDistance({ fog: 0 }, { darkness: 1 })).toBe(0);
  });

  it("a scene measured in feet or metres (Luke, 2026-10-26: 5 ft squares)", () => {
    const ft = { grid: { size: 50, distance: 5, units: "ft" } };
    expect(unitPx(ft)).toBe(10);
    expect(metrePx(ft)).toBeCloseTo(32.808, 2);
    expect(squareIn(ft, "m")).toEqual({ distance: 1.524, units: "m" });
    const m = { grid: { size: 50, distance: 1.524, units: "m" } };
    expect(metrePx(m)).toBeCloseTo(metrePx(ft), 6);
    expect(squareIn(m, "ft")).toEqual({ distance: 5, units: "ft" });
    expect(metresPer("yd")).toBe(0.9144);
    expect(SQUARES["5ft"]).toEqual({ distance: 5, units: "ft" });
  });

  it("an NPC the GM marked always seen is never hidden", () => {
    expect(fogHides({ npc: true, at: { x: 999, y: 0 }, party: [{ x: 0, y: 0 }], dist: 10, underRoof: true, seen: true })).toBe(false);
  });

  it("an overlay: the GM's switch, else the bake's; a GM's never for a player", () => {
    const [fest, gmOnly] = m.overlays;
    expect(overlayShown(fest, null, false)).toBe(true);
    expect(overlayShown(fest, { overlays: { festival: false } }, false)).toBe(false);
    expect(overlayShown(gmOnly, null, true)).toBe(true);
    expect(overlayShown(gmOnly, { overlays: { "labels-gm": true } }, false)).toBe(false);
  });

  it("a roof lifted whole, or one part of it", () => {
    const [mh, smithy] = m.roofs;
    expect(shownParts(m, null)).toHaveLength(3);
    expect(partShown(smithy, smithy.parts[0], { roofs: { smithy: true } })).toBe(false);
    expect(shownParts(m, { roofs: { "meetinghouse/vestibule": true } }).map((s) => s.part.id)).toEqual(["nave", "smithy"]);
    expect(shownParts(m, { roofs: { meetinghouse: true } }).map((s) => s.roof.id)).toEqual(["smithy"]);
    expect(mh.parts).toHaveLength(2);
  });

  it("the NPC fog: the party always seen; an NPC under a roof, or past the distance from every one of them, hidden", () => {
    const party = [{ x: 0, y: 0 }, { x: 1000, y: 0 }];
    expect(fogHides({ npc: false, at: { x: 9999, y: 9999 }, party, dist: 100 })).toBe(false);
    expect(fogHides({ npc: true, at: { x: 1050, y: 0 }, party, dist: 100 })).toBe(false);
    expect(fogHides({ npc: true, at: { x: 500, y: 0 }, party, dist: 100 })).toBe(true);
    expect(fogHides({ npc: true, at: { x: 10, y: 0 }, party, dist: 100, underRoof: true })).toBe(true);
    // (no distance set: only roofs hide)
    expect(fogHides({ npc: true, at: { x: 500, y: 0 }, party, dist: 0 })).toBe(false);
    expect(fogHides({ npc: true, at: { x: 5, y: 0 }, party: [], dist: 100 })).toBe(true);
  });
});
