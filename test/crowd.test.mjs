/**
 * The crowd from afar (2026-10-27, crowd.js) and the board's frame cap
 * (quality.js): the pure rules, in node.
 */

import { describe, it, expect } from "vitest";
import { CROWD_Z, markEventMode, MARK_PX, kindOf, markShown, aboveRoofs, nameShown, hoverNames, asGM, atlasLayout, glyphUrl, markScale } from "../src/map/scrapboard/crowd.js";
import { frameCapFor, tickerFps, FRAME_CAP } from "../src/map/scrapboard/quality.js";

describe("the mark sizes", () => {
  it("one table: named sigils 36 px, crowd marks 12 px", () => {
    expect(MARK_PX).toEqual({ anon: 12, named: 36 });
  });
});

describe("which marks take the pointer", () => {
  it("only a named sigil does, and the crowd container sits above the board layer (z 260)", () => {
    expect(markEventMode("named")).toBe("static");
    expect(markEventMode("anon")).toBe("none");
    expect(CROWD_Z).toBeGreaterThan(260);
  });
});

describe("named versus anonymous", () => {
  it("only a Plenty NPC token is a crowd member; named comes from the flag Place NPCs writes", () => {
    expect(kindOf(undefined)).toBeNull();
    expect(kindOf({ board: "plenty" })).toBeNull();
    expect(kindOf({ id: "ann", named: true })).toBe("named");
    expect(kindOf({ id: "hen-2", named: false })).toBe("anon");
  });
  it("a token placed before the flag counts as named by its hover name, the named's rule", () => {
    expect(kindOf({ id: "ann" }, true)).toBe("named");
    expect(kindOf({ id: "ann" }, false)).toBe("anon");
    // (the flag wins when it is there)
    expect(kindOf({ id: "ann", named: false }, true)).toBe("anon");
  });
  it("the named are drawn larger than the anonymous", () => {
    expect(MARK_PX.named).toBeGreaterThan(MARK_PX.anon);
    expect(markScale(MARK_PX.named, 0.1)).toBeGreaterThan(markScale(MARK_PX.anon, 0.1));
    // (a mark keeps its size on screen: twice the zoom, half the scene scale)
    expect(markScale(36, 0.2)).toBe(markScale(36, 0.1) / 2);
  });
});

describe("who is shown a mark", () => {
  it("the GM, with the mode on, sees every NPC's mark, named or not, through roofs", () => {
    expect(markShown({ gm: true, kind: "named", on: true })).toBe(true);
    expect(markShown({ gm: true, kind: "anon", on: true })).toBe(true);
  });
  it("with the mode off, nobody sees a mark", () => {
    expect(markShown({ gm: true, kind: "named", on: false })).toBe(false);
    expect(markShown({ gm: true, kind: "anon" })).toBe(false);
  });
  it("a player never sees a mark, mode or no mode", () => {
    expect(markShown({ kind: "named", on: true })).toBe(false);
    expect(markShown({ gm: false, kind: "anon", on: true })).toBe(false);
  });
  it("the GM in Player view is a player", () => {
    expect(asGM({ gm: true, preview: true })).toBe(false);
    expect(markShown({ gm: true, preview: true, kind: "named", on: true })).toBe(false);
  });
  it("a token that is no NPC shows nothing", () => {
    expect(markShown({ gm: true, kind: null, on: true })).toBe(false);
  });
});

describe("the named above the roofs and their names", () => {
  it("the GM sees the named above roofs at every zoom; the crowd and players do not", () => {
    expect(aboveRoofs({ gm: true, kind: "named" })).toBe(true);
    expect(aboveRoofs({ gm: true, kind: "anon" })).toBe(false);
    expect(aboveRoofs({ gm: false, kind: "named" })).toBe(false);
    expect(aboveRoofs({ gm: true, preview: true, kind: "named" })).toBe(false);
    expect(aboveRoofs({ gm: true, kind: null })).toBe(false);
  });
  it("a named name is always shown to the GM, on hover to a player, never for the crowd", () => {
    expect(nameShown({ gm: true, kind: "named" })).toBe(true);
    expect(nameShown({ gm: false, kind: "named" })).toBe(false);
    expect(nameShown({ gm: false, kind: "named", hovered: true })).toBe(true);
    expect(nameShown({ gm: true, preview: true, kind: "named" })).toBe(false);
    expect(nameShown({ gm: true, kind: "anon", hovered: true })).toBe(false);
  });
  it("hovering a mark names a named sigil and shows nothing for a crowd mark", () => {
    expect(hoverNames("named")).toBe(true);
    expect(hoverNames("anon")).toBe(false);
  });
});

describe("the atlas and the glyphs", () => {
  it("the dot and the halo first, each sigil once, in rows of eight", () => {
    const L = atlasLayout(["skills/hunt", "domains/wild", "skills/hunt", "bad id"]);
    expect(L.count).toBe(4);
    expect(L.index.get("skills/hunt")).toBe(2);
    expect(L.index.get("domains/wild")).toBe(3);
    expect(L.rect(3)).toEqual({ x: 192, y: 0, w: 64, h: 64 });
    expect(L.rect(9)).toEqual({ x: 64, y: 64, w: 64, h: 64 });
    expect(L.width).toBe(512);
    expect(L.height).toBe(64);
  });
  it("a glyph is served from the system's icons; a bad id is refused", () => {
    expect(glyphUrl("skills/hunt")).toBe("systems/heart/assets/icons/skills/hunt.svg");
    expect(glyphUrl("../x")).toBeNull();
    expect(glyphUrl(undefined)).toBeNull();
  });
});

describe("the frame cap", () => {
  it("30 fps under Auto and Light; Ultra and the rest are left alone", () => {
    expect(FRAME_CAP).toBe(30);
    expect(frameCapFor("auto")).toBe(30);
    expect(frameCapFor("light")).toBe(30);
    expect(frameCapFor("ultra")).toBeNull();
    expect(frameCapFor("high")).toBeNull();
    expect(frameCapFor("standard")).toBeNull();
  });
  it("only on a board scene, and never above what Foundry allows", () => {
    expect(tickerFps({ board: true, picked: "auto", foundryFps: 60 })).toBe(30);
    expect(tickerFps({ board: true, picked: "auto", foundryFps: 0 })).toBe(30);
    expect(tickerFps({ board: true, picked: "auto", foundryFps: 20 })).toBe(20);
    expect(tickerFps({ board: false, picked: "auto", foundryFps: 60 })).toBe(60);
    expect(tickerFps({ board: true, picked: "ultra", foundryFps: 0 })).toBe(0);
  });
});

describe("the named's names decluttered (2026-10-28, as Map Dreamer's page does)", async () => {
  const { namePx, keepNames, NAME_PX, FAR_NAME_PX } = await import("../src/map/scrapboard/crowd.js");
  it("sets the type 14 px far out and 18 px near", () => {
    expect(namePx(10)).toBe(FAR_NAME_PX);
    expect(namePx(33)).toBe(FAR_NAME_PX);
    expect(namePx(34)).toBe(NAME_PX);
    expect(namePx(200)).toBe(NAME_PX);
  });
  it("lays the names nearest the centre first and leaves out one that would overlap", () => {
    const box = (id, d, x) => ({ id, d, x0: x, x1: x + 60, y0: 0, y1: 16 });
    const keep = keepNames([box("far", 90, 40), box("near", 5, 0), box("clear", 50, 200), box("touch", 20, 60)]);
    // ("far" overlaps "near"; "touch" only meets it at an edge)
    expect([...keep].sort()).toEqual(["clear", "near", "touch"]);
    expect(keepNames([]).size).toBe(0);
  });
});
