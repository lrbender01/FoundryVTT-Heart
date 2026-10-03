/**
 * The shared sheet decorations (src/common/decor.js, 2026-10-02): where a
 * click falls on a turned, mirrored, lifted piece (decorUV, behind the
 * click-to-open gallery), the character sheet's boxes and art file
 * (src/actors/character/decor.js), and that every box a tool can anchor to
 * is marked in the sheet templates.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decorUV, decorLayout, normalizeDecorArt, DEFAULT_HOVER } from "../src/common/decor.js";
import {
  CHARACTER_ANCHORS,
  CHARACTER_SECTIONS,
  CHARACTER_TABS,
  normalizeCharacterArt,
  characterArtUrl,
} from "../src/actors/character/decor.js";
import { ANCHORS as PARTY_ANCHORS } from "../src/actors/party/decor.js";

const src = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf8");
const near = (uv, u, v) => {
  expect(uv).not.toBeNull();
  expect(uv.u).toBeCloseTo(u, 6);
  expect(uv.v).toBeCloseTo(v, 6);
};

describe("where a click falls on a piece", () => {
  const piece = { center: { x: 100, y: 50 }, width: 200, height: 100 };

  it("the centre, the corners, and outside", () => {
    near(decorUV({ x: 100, y: 50 }, piece), 0.5, 0.5);
    near(decorUV({ x: 0, y: 0 }, piece), 0, 0);
    near(decorUV({ x: 200, y: 100 }, piece), 1, 1);
    expect(decorUV({ x: 201, y: 50 }, piece)).toBeNull();
    expect(decorUV({ x: 100, y: -1 }, piece)).toBeNull();
  });

  it("mirrored: left and right swap", () => {
    near(decorUV({ x: 50, y: 50 }, { ...piece, flip: true }), 0.75, 0.5);
  });

  it("turned 90 degrees clockwise: the image's top edge points right", () => {
    // a point right of the centre is on the image's top half
    near(decorUV({ x: 140, y: 50 }, { ...piece, r: 90 }), 0.5, 0.1);
    // its left edge points up
    near(decorUV({ x: 100, y: 0 }, { ...piece, r: 90 }), 0.25, 0.5);
  });

  it("turned and mirrored: the mirror applies before the turn", () => {
    near(decorUV({ x: 100, y: 0 }, { ...piece, r: 90, flip: true }), 0.75, 0.5);
  });

  it("lifted (scaled up): the edge moves out", () => {
    near(decorUV({ x: 205, y: 50 }, { ...piece, scale: 1.05 }), 1, 0.5);
    expect(decorUV({ x: 206, y: 50 }, { ...piece, scale: 1.05 })).toBeNull();
  });

  it("a piece with no size is never hit", () => {
    expect(decorUV({ x: 0, y: 0 }, { ...piece, width: 0 })).toBeNull();
  });
});

describe("defaults", () => {
  it("a piece lifts on hover unless the export says otherwise (2026-10-02, Luke)", () => {
    expect(DEFAULT_HOVER).toBe("lift");
    expect(normalizeDecorArt({ decor: [{ img: "x" }] }, ["sheet"]).decor[0].hover).toBe("lift");
  });

  it("layout keeps each piece's place in the export (the gallery opens at it)", () => {
    const art = normalizeDecorArt({ decor: [{ img: "a", anchor: "nowhere" }, { img: "b", anchor: "sheet" }] }, ["sheet"]);
    const box = { left: 0, top: 0, width: 10, height: 10 };
    expect(decorLayout(art, { sheet: box }, []).map((d) => d.index)).toEqual([0, 1]);
    // anchor "nowhere" fell back to the sheet; a missing box leaves a piece out
    const art2 = normalizeDecorArt({ decor: [{ img: "a", anchor: "x" }, { img: "b", anchor: "sheet" }] }, ["sheet", "x"]);
    expect(decorLayout(art2, { sheet: box }, ["x"]).map((d) => d.index)).toEqual([1]);
  });
});

describe("growing with the anchor (2026-10-02, Luke)", () => {
  const art = (grow, ref) => normalizeDecorArt({ decor: [{ img: "x", anchor: "notes", layer: "in", corner: "l", x: 20, y: -10, w: 100, grow, ref }] }, ["notes"]);
  const at = (box) => ({ notes: { left: 0, top: 0, ...box } });

  it("fixed by default: no grow, no ref", () => {
    expect(art().decor[0]).toMatchObject({ grow: "none", ref: 0 });
    const [d] = decorLayout(art(), at({ width: 300, height: 400 }), ["notes"]);
    expect(d).toMatchObject({ left: 20, top: 190 });
    expect(d.style).toContain("width:100px");
  });

  it("with the height: twice as tall, twice the size and twice the offsets from the pin", () => {
    const [d] = decorLayout(art("h", 200), at({ width: 300, height: 400 }), ["notes"]);
    expect(d).toMatchObject({ left: 40, top: 200 - 20 });
    expect(d.style).toContain("width:200px");
  });

  it("with the width", () => {
    const [d] = decorLayout(art("w", 600), at({ width: 300, height: 100 }), ["notes"]);
    expect(d).toMatchObject({ left: 10, top: 50 - 5 });
    expect(d.style).toContain("width:50px");
  });

  it("at the size it was tuned at, nothing moves", () => {
    const [d] = decorLayout(art("h", 400), at({ width: 300, height: 400 }), ["notes"]);
    expect(d).toMatchObject({ left: 20, top: 190 });
  });

  it("unknown grow or a missing ref is fixed", () => {
    expect(art("diagonal", 10).decor[0].grow).toBe("none");
    const [d] = decorLayout(art("h", 0), at({ width: 300, height: 400 }), ["notes"]);
    expect(d.style).toContain("width:100px");
  });
});

describe("above a section (2026-10-02, Luke)", () => {
  const boxes = { sheet: { left: 0, top: 0, width: 900, height: 1200 }, notes: { left: 20, top: 400, width: 300, height: 100 } };

  it("placed from the section's own box, in the section, clipped when asked", () => {
    const art = normalizeDecorArt({ decor: [{ img: "x", anchor: "notes", layer: "above", clip: true, x: 5 }] }, ["sheet", "notes"]);
    const [d] = decorLayout(art, boxes, ["notes"]);
    expect(d).toMatchObject({ layer: "above", host: "notes", clip: true, left: 155, top: 50 });
  });

  it("on a box that isn't a section it goes over everything", () => {
    const art = normalizeDecorArt({ decor: [{ img: "x", anchor: "sheet", layer: "above" }] }, ["sheet", "notes"]);
    expect(decorLayout(art, boxes, ["notes"])[0]).toMatchObject({ layer: "over", host: "over", clip: false });
  });
});

describe("the character sheet", () => {
  it("only decorations: a banner in the file is ignored (the art band is the character's)", () => {
    const art = normalizeCharacterArt({ banner: { on: true, img: "x" }, decor: [{ img: "rope", anchor: "beats", layer: "in" }] });
    expect(art).toEqual({ decor: [expect.objectContaining({ img: "rope", anchor: "beats", layer: "in" })] });
    expect(normalizeCharacterArt({ banner: { on: true, img: "x" }, decor: [] })).toBeNull();
    expect(normalizeCharacterArt(null)).toBeNull();
  });

  it("a tab is a box, not a section: an 'in' piece on it goes behind", () => {
    const art = normalizeCharacterArt({ decor: [{ img: "x", anchor: "tab-biography", layer: "in" }] });
    const [d] = decorLayout(art, { "tab-biography": { left: 0, top: 300, width: 900, height: 600 } }, CHARACTER_SECTIONS);
    expect(d).toMatchObject({ layer: "behind", host: "behind" });
  });

  it("art paths are in the content module's character folder", () => {
    expect(characterArtUrl("rope")).toBe("modules/fvtt-heart-content/assets/art/character/rope.webp");
  });

  it("every box is marked once in the templates", () => {
    const html = src("actors/character/sheet.html") + src("bonds/section.html");
    for (const key of CHARACTER_ANCHORS) {
      expect(html.split(`data-anchor="${key}"`).length - 1, key).toBe(1);
    }
    expect(CHARACTER_TABS.every((t) => CHARACTER_ANCHORS.includes(t))).toBe(true);
  });
});

describe("the party sheet", () => {
  it("every box is marked once in the template", () => {
    const html = src("actors/party/sheet.html");
    for (const key of PARTY_ANCHORS) {
      expect(html.split(`data-anchor="${key}"`).length - 1, key).toBe(1);
    }
  });
});
