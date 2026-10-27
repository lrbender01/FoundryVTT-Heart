/**
 * The crowd from afar (2026-10-27, crowd.js) and the board's frame cap
 * (quality.js): the pure rules, in node.
 */

import { describe, it, expect } from "vitest";
import { SYMBOL_BELOW_PX, MARK_PX, screenPx, underSwitch, kindOf, isSymbol, markShown, atlasLayout, glyphUrl, markScale } from "../src/map/scrapboard/crowd.js";
import { frameCapFor, tickerFps, FRAME_CAP } from "../src/map/scrapboard/quality.js";

describe("the size switch", () => {
  it("a token is its symbol under about 16 screen pixels, its picture from there up", () => {
    expect(SYMBOL_BELOW_PX).toBe(16);
    expect(underSwitch(15.9)).toBe(true);
    expect(underSwitch(16)).toBe(false);
  });
  it("follows the zoom and the token's larger side", () => {
    // (a 1-square token, 50 px grid: 25 px at half zoom, 10 px at a fifth)
    expect(screenPx({ width: 1, height: 1 }, 50, 0.5)).toBe(25);
    expect(underSwitch(screenPx({ width: 1, height: 1 }, 50, 0.2))).toBe(true);
    expect(screenPx({ width: 0.5, height: 2 }, 50, 0.1)).toBe(10);
    // (a half-square hen turns before a person does)
    expect(underSwitch(screenPx({ width: 0.5, height: 0.5 }, 50, 0.5))).toBe(true);
    expect(underSwitch(screenPx({ width: 1, height: 1 }, 50, 0.5))).toBe(false);
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
    expect(markScale(22, 0.2)).toBe(markScale(22, 0.1) / 2);
  });
});

describe("which tokens become symbols", () => {
  const base = { kind: "anon", px: 8 };
  it("a small NPC does, a big one does not", () => {
    expect(isSymbol(base)).toBe(true);
    expect(isSymbol({ ...base, px: 40 })).toBe(false);
  });
  it("a player's own token, a selected one, a dragged one, and a non-NPC never do", () => {
    expect(isSymbol({ ...base, own: true })).toBe(false);
    expect(isSymbol({ ...base, controlled: true })).toBe(false);
    expect(isSymbol({ ...base, preview: true })).toBe(false);
    expect(isSymbol({ kind: null, px: 4 })).toBe(false);
  });
});

describe("who is shown a mark", () => {
  it("the GM sees every named sigil, seen or not (through roofs)", () => {
    expect(markShown({ gm: true, kind: "named", seen: false })).toBe(true);
  });
  it("the GM sees an anonymous mark only for a token they could see", () => {
    expect(markShown({ gm: true, kind: "anon", seen: true })).toBe(true);
    expect(markShown({ gm: true, kind: "anon", seen: false })).toBe(false);
  });
  it("a player sees any mark only for a token they could see anyway; nobody learns where a named villager hides", () => {
    expect(markShown({ kind: "named", seen: false })).toBe(false);
    expect(markShown({ kind: "named", seen: true })).toBe(true);
    expect(markShown({ kind: "anon", seen: false })).toBe(false);
    expect(markShown({ kind: "anon", seen: true })).toBe(true);
  });
  it("the GM in Player view is a player", () => {
    expect(markShown({ gm: true, preview: true, kind: "named", seen: false })).toBe(false);
    expect(markShown({ gm: true, preview: true, kind: "named", seen: true })).toBe(true);
  });
  it("a token that is no crowd member shows nothing", () => {
    expect(markShown({ gm: true, kind: null, seen: true })).toBe(false);
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
