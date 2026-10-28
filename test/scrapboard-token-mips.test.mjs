/**
 * Token mip chains (token-mips.js): the path rule, the level rule by size and
 * quality, the manifest reading.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { splitPath, splitAnyPath, drawnPx, levelFile, chainFor, neededPx, pickLevel, readManifest, clearManifests, sizedScale } from "../src/map/scrapboard/token-mips.js";

const DIR = "modules/fvtt-heart-content/assets/art/map/boards/plenty-looks";
const MANIFEST = { format: "heart-mips", version: 1, levels: [256, 128, 64, 32], files: { "ada.webp": [256, 128, 64, 32], "short.webp": [128, 64] } };

describe("splitPath", () => {
  it("splits a picture of the three folders", () => {
    expect(splitPath(`${DIR}/ada.webp`)).toEqual({ dir: DIR, name: "ada.webp" });
    expect(splitPath("x/boards/plenty-named/m.webp?v=2")).toEqual({ dir: "x/boards/plenty-named", name: "m.webp" });
    expect(splitPath("x/boards/plenty-tokens/t.webp")?.name).toBe("t.webp");
  });
  it("knows the named's folder, plenty-named, and no longer the retired plenty-main", () => {
    expect(splitPath(`${DIR.replace("plenty-looks", "plenty-named")}/abner-thatcher.webp`)).toEqual({ dir: DIR.replace("plenty-looks", "plenty-named"), name: "abner-thatcher.webp" });
    expect(splitPath("x/boards/plenty-main/m.webp")).toBeNull();
    // (plenty-named's mips.json is version 1: levels 256, 128, 64, 32 below a 512 top)
    const NAMED = { format: "heart-mips", version: 1, levels: [256, 128, 64, 32], files: { "abner-thatcher.webp": [256, 128, 64, 32] } };
    expect(chainFor(NAMED, "abner-thatcher.webp")).toEqual([32, 64, 128, 256, 512]);
  });
  it("leaves every other picture alone", () => {
    expect(splitPath("icons/svg/mystery-man.svg")).toBeNull();
    expect(splitPath("x/boards/plenty/ada.webp")).toBeNull();
    expect(splitPath(`${DIR}/sub/ada.webp`)).toBeNull();
    expect(splitPath(null)).toBeNull();
  });
});

describe("levelFile", () => {
  it("names the levels beside the picture", () => {
    expect(levelFile("ada.webp", 256)).toBe("ada@256.webp");
    expect(levelFile("ada.webp", 32)).toBe("ada@32.webp");
    expect(levelFile("ada.webp", 512)).toBe("ada.webp");
  });
});

describe("chainFor", () => {
  it("returns the levels ascending with the top", () => {
    expect(chainFor(MANIFEST, "ada.webp")).toEqual([32, 64, 128, 256, 512]);
    expect(chainFor(MANIFEST, "short.webp")).toEqual([64, 128, 512]);
  });
  it("returns null with no entry or a bad manifest", () => {
    expect(chainFor(MANIFEST, "reroll.webp")).toBeNull();
    expect(chainFor(null, "ada.webp")).toBeNull();
    expect(chainFor({ format: "other", files: {} }, "ada.webp")).toBeNull();
  });
  it("finds a name written with %20", () => {
    expect(chainFor({ format: "heart-mips", files: { "a b.webp": [64] } }, "a%20b.webp")).toEqual([64, 512]);
  });
});

describe("pickLevel", () => {
  const levels = [32, 64, 128, 256, 512];
  it("picks the smallest level at least the pixels needed", () => {
    expect(neededPx(40, 1)).toBe(40);
    expect(pickLevel({ sizePx: 40, dpr: 1, quality: "auto", levels })).toBe(64);
    expect(pickLevel({ sizePx: 64, dpr: 1, quality: "high", levels })).toBe(64);
    expect(pickLevel({ sizePx: 65, dpr: 1, quality: "high", levels })).toBe(128);
    expect(pickLevel({ sizePx: 10, dpr: 1, quality: "light", levels })).toBe(32);
  });
  it("counts the device pixel ratio", () => {
    expect(pickLevel({ sizePx: 40, dpr: 2, quality: "auto", levels })).toBe(128);
  });
  it("goes one level finer under Ultra, never above 512", () => {
    expect(pickLevel({ sizePx: 40, dpr: 1, quality: "ultra", levels })).toBe(128);
    expect(pickLevel({ sizePx: 300, dpr: 1, quality: "ultra", levels })).toBe(512);
    expect(pickLevel({ sizePx: 900, dpr: 2, quality: "ultra", levels })).toBe(512);
  });
  it("uses only the levels the picture has", () => {
    expect(pickLevel({ sizePx: 40, dpr: 1, quality: "auto", levels: [128, 512] })).toBe(128);
  });
  it("shows the top when there is no chain or the size is unknown", () => {
    expect(pickLevel({ sizePx: 40, quality: "auto" })).toBe(512);
    expect(pickLevel({ sizePx: 900, dpr: 1, quality: "auto", levels })).toBe(512);
  });
});

describe("version 1 entries with the picture's real side", () => {
  const CROWD = { format: "heart-mips", version: 1, files: { "face.webp": [128, 64, 32] } };
  it("tops a 192 px picture at 192, not 512", () => {
    expect(chainFor(CROWD, "face.webp", 192)).toEqual([32, 64, 128, 192]);
  });
  it("drops listed levels at or above the real side", () => {
    expect(chainFor(MANIFEST, "ada.webp", 192)).toEqual([32, 64, 128, 192]);
  });
  it("behaves exactly as before for a 512 top, given or not", () => {
    expect(chainFor(MANIFEST, "ada.webp", 512)).toEqual(chainFor(MANIFEST, "ada.webp"));
    expect(chainFor(MANIFEST, "ada.webp", undefined)).toEqual([32, 64, 128, 256, 512]);
    expect(chainFor(MANIFEST, "ada.webp", 0)).toEqual([32, 64, 128, 256, 512]);
  });
  it("picks the smallest level at least the pixels needed, for any top", () => {
    const c192 = chainFor(CROWD, "face.webp", 192);
    expect(pickLevel({ sizePx: 100, dpr: 1, quality: "auto", levels: c192 })).toBe(128);
    expect(pickLevel({ sizePx: 150, dpr: 1, quality: "auto", levels: c192 })).toBe(192);
    expect(pickLevel({ sizePx: 400, dpr: 1, quality: "auto", levels: c192 })).toBe(192);
    expect(pickLevel({ sizePx: 100, dpr: 1, quality: "ultra", levels: c192 })).toBe(192);
    const c512 = chainFor(MANIFEST, "ada.webp", 512);
    expect(pickLevel({ sizePx: 100, dpr: 1, quality: "auto", levels: c512 })).toBe(128);
    expect(pickLevel({ sizePx: 150, dpr: 1, quality: "auto", levels: c512 })).toBe(256);
  });
  it("names the top as the picture itself and a level beside it", () => {
    expect(levelFile("face.webp", 192, 192)).toBe("face.webp");
    expect(levelFile("face.webp", 128, 192)).toBe("face@128.webp");
  });
});

describe("version 2 manifests (pieces)", () => {
  const V2 = { format: "heart-mips", version: 2, files: { "fence.webp": { w: 5285, h: 400, levels: [4096, 2048, 1024, 512, 256] }, "tall.webp": { w: 300, h: 900, levels: [450, 225] }, "bad.webp": { w: 0, h: 0, levels: [64] } } };
  it("returns the levels ascending with the picture's longer side as the top", () => {
    expect(chainFor(V2, "fence.webp")).toEqual([256, 512, 1024, 2048, 4096, 5285]);
    expect(chainFor(V2, "tall.webp")).toEqual([225, 450, 900]);
    expect(chainFor(V2, "bad.webp")).toBeNull();
    expect(chainFor(V2, "none.webp")).toBeNull();
  });
  it("drops levels at or above the top", () => {
    expect(chainFor({ format: "heart-mips", version: 2, files: { "a.webp": { w: 100, h: 50, levels: [100, 64, 200] } } }, "a.webp")).toEqual([64, 100]);
  });
  it("picks the smallest level at least the pixels needed, never above the picture", () => {
    const fence = chainFor(V2, "fence.webp");
    expect(pickLevel({ sizePx: 1440, dpr: 1, quality: "auto", levels: fence })).toBe(2048);
    expect(pickLevel({ sizePx: 1440, dpr: 1, quality: "ultra", levels: fence })).toBe(4096);
    expect(pickLevel({ sizePx: 4500, dpr: 1, quality: "auto", levels: fence })).toBe(5285);
    expect(pickLevel({ sizePx: 9000, dpr: 2, quality: "ultra", levels: fence })).toBe(5285);
    expect(pickLevel({ sizePx: 100, dpr: 1, quality: "auto", levels: fence })).toBe(256);
  });
  it("names a level beside the picture by the longer side", () => {
    expect(levelFile("fence.webp", 2048, 5285)).toBe("fence@2048.webp");
    expect(levelFile("fence.webp", 5285, 5285)).toBe("fence.webp");
  });
  it("splits any webp path and leaves other files alone", () => {
    expect(splitAnyPath("modules/x/a b/fence.webp?v=3")).toEqual({ dir: "modules/x/a b", name: "fence.webp" });
    expect(splitAnyPath("x/y.png")).toBeNull();
    expect(splitAnyPath(null)).toBeNull();
  });
  it("measures the drawn longer side", () => {
    expect(drawnPx(100, 40, 2, 0.5)).toBe(100);
    expect(drawnPx(40, 100, 2)).toBe(200);
  });
  it("reads versions 1 and 2 and no other", async () => {
    clearManifests();
    expect(await readManifest("d2", async () => ({ ok: true, json: async () => V2 }))).toEqual(V2);
    clearManifests();
    expect(await readManifest("d3", async () => ({ ok: true, json: async () => ({ ...V2, version: 3 }) }))).toBeNull();
    clearManifests();
  });
});

describe("sizedScale", () => {
  const board = (s, w) => Math.abs(s) * w;
  it("keeps the size on the board at every level", () => {
    const before = { scale: { x: 0.1, y: 0.1 }, w: 512, h: 512 };
    for (const px of [256, 128, 64, 32]) {
      const s = sizedScale(before, { w: px, h: px });
      expect(board(s.x, px)).toBeCloseTo(51.2, 6);
      expect(board(s.y, px)).toBeCloseTo(51.2, 6);
    }
  });
  it("does not depend on what the texture setter did to the scale", () => {
    // the scale read before the swap is the only input
    const a = sizedScale({ scale: { x: 0.1, y: 0.1 }, w: 512, h: 512 }, { w: 64, h: 64 });
    expect(a.x).toBeCloseTo(0.8, 9);
  });
  it("keeps a mirrored token mirrored and goes back to the top", () => {
    const s = sizedScale({ scale: { x: -0.8, y: 0.8 }, w: 64, h: 64 }, { w: 512, h: 512 });
    expect(s.x).toBeCloseTo(-0.1, 9);
    expect(s.y).toBeCloseTo(0.1, 9);
  });
});

describe("readManifest", () => {
  beforeEach(() => clearManifests());
  it("fetches a folder once and keeps it", async () => {
    let calls = 0;
    const f = async () => {
      calls += 1;
      return { ok: true, json: async () => MANIFEST };
    };
    expect(await readManifest(DIR, f)).toEqual(MANIFEST);
    expect(await readManifest(DIR, f)).toEqual(MANIFEST);
    expect(calls).toBe(1);
  });
  it("means no chain on any failure, and does not ask again", async () => {
    let calls = 0;
    const f = async () => {
      calls += 1;
      throw new Error("offline");
    };
    expect(await readManifest(DIR, f)).toBeNull();
    expect(await readManifest(DIR, f)).toBeNull();
    expect(calls).toBe(1);
    clearManifests();
    expect(await readManifest(DIR, async () => ({ ok: false }))).toBeNull();
    clearManifests();
    expect(await readManifest(DIR, async () => ({ ok: true, json: async () => ({ format: "nope" }) }))).toBeNull();
  });
});
