/**
 * Roof pieces in the Map layers window and the NPC fog (Luke, 2026-10-28):
 * the pure rules in pieces-draw.js.
 */

import { describe, it, expect } from "vitest";
import { groupRoofPieces, roofLifted, roofPiecesHit, pieceLevelUrl } from "../src/map/scrapboard/pieces-draw.js";

describe("pieceLevelUrl", () => {
  const split = { dir: "m/pieces", name: "fence.webp" };
  it("names the level file beside the picture, and the picture itself at the top", () => {
    expect(pieceLevelUrl("m/pieces/fence.webp?v=2", split, 2048, 5285)).toBe("m/pieces/fence@2048.webp");
    expect(pieceLevelUrl("m/pieces/fence.webp?v=2", split, 5285, 5285)).toBe("m/pieces/fence.webp?v=2");
  });
});

describe("groupRoofPieces", () => {
  it("groups pieces that name a building, and leaves the rest standing alone", () => {
    const out = groupRoofPieces([
      { id: "a", name: "Nave", building: "meetinghouse" },
      { id: "b", name: "", building: "meetinghouse" },
      { id: "c", name: "Barn roof", building: null },
      { id: "d", name: "Smithy", building: "smithy" },
    ]);
    expect(out.groups).toEqual([{ id: "meetinghouse", pieces: [{ id: "a", name: "Nave" }, { id: "b", name: "b" }] }]);
    // (a building of one piece is that piece alone)
    expect(out.loose.map((p) => p.id).sort()).toEqual(["c", "d"]);
  });
});

describe("roofLifted and roofPiecesHit", () => {
  // (a hull is a flat list: x, y, x, y, ...)
  const square = (x, y, s) => [x, y, x + s, y, x + s, y + s, x, y + s];
  const entries = [
    { id: "a", building: "mh", hull: square(0, 0, 10) },
    { id: "b", building: null, hull: square(20, 0, 10) },
  ];

  it("a roof piece is lifted by its own id or its building's", () => {
    expect(roofLifted({ a: true }, "a", "mh")).toBe(true);
    expect(roofLifted({ mh: true }, "a", "mh")).toBe(true);
    expect(roofLifted({ mh: true }, "b", null)).toBe(false);
  });

  it("finds the unlifted roof pieces whose hull holds the point", () => {
    expect(roofPiecesHit(entries, { x: 5, y: 5 }, {})).toEqual(["a"]);
    expect(roofPiecesHit(entries, { x: 25, y: 5 }, {})).toEqual(["b"]);
    expect(roofPiecesHit(entries, { x: 15, y: 5 }, {})).toEqual([]);
    expect(roofPiecesHit(entries, { x: 5, y: 5 }, { mh: true })).toEqual([]);
  });
});

describe("picture versions (2026-10-28: a picture rewritten in place shows)", () => {
  const split = { dir: "m/pieces", name: "fence.webp" };
  it("puts ?v= on every address of a picture, the level files and the picture itself", async () => {
    const { withVersion, setPictureVersions } = await import("../src/map/scrapboard/pieces-draw.js");
    expect(withVersion("m/pieces/fence.webp", 1793141850964)).toBe("m/pieces/fence.webp?v=1793141850964");
    expect(withVersion("m/pieces/fence.webp?x=1", 7)).toBe("m/pieces/fence.webp?x=1&v=7");
    expect(withVersion("m/pieces/fence.webp", null)).toBe("m/pieces/fence.webp");
    expect(pieceLevelUrl("m/pieces/fence.webp", split, 256, 1024, 99)).toBe("m/pieces/fence@256.webp?v=99");
    expect(pieceLevelUrl("m/pieces/fence.webp", split, 1024, 1024, 99)).toBe("m/pieces/fence.webp?v=99");
    // (no version: the addresses are as they were)
    expect(pieceLevelUrl("m/pieces/fence.webp", split, 256, 1024)).toBe("m/pieces/fence@256.webp");
    // (setting versions says whether they changed, so the pieces are drawn again only then)
    expect(setPictureVersions({ a: 1 })).toBe(true);
    expect(setPictureVersions({ a: 1 })).toBe(false);
    expect(setPictureVersions({ a: 2 })).toBe(true);
    expect(setPictureVersions(null)).toBe(true);
    expect(setPictureVersions({})).toBe(false);
  });
  it("reads the clock stage a scene stands at from the toolkit's flags", async () => {
    const { stageOf } = await import("../src/map/scrapboard/pieces-draw.js");
    expect(stageOf({ flags: { "fvtt-heart-toolkit": { timeline: { stage: "dusk" } } } })).toBe("dusk");
    expect(stageOf({ flags: { "fvtt-heart-toolkit": { stage: "late" } } })).toBe("late");
    expect(stageOf({ flags: {} })).toBeNull();
    expect(stageOf(null)).toBeNull();
  });
});
