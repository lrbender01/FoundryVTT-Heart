/**
 * The party sheet's decoration layout (src/actors/party/decor.js,
 * 2026-10-02): the Heart Party Sheet Art tool's rules (docs/mocks/party-art/
 * template.html) kept identical: anchor points, the nine corners, layer
 * routing, the clip host, and the transform / opacity / blend style.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeArt,
  anchorPoint,
  decorLayout,
  decorStyle,
  partyArtUrl,
  POINTS,
  SECTION_ANCHORS,
} from "../src/actors/party/decor.js";

// the tool's export shape (docs/plans/heart-party-art.md)
const EXPORT = {
  banner: { on: true, img: "delvers_camp_around_fire_cut", z: 100, x: 50, y: 57 },
  decor: [
    { id: "members", img: "delvers_camp_around_fire_cut", anchor: "members", corner: "c", x: 150, y: 0, w: 420, r: 0, o: 17, flip: false, layer: "in", clip: true, blend: "normal", hover: "none" },
  ],
};
const boxes = {
  sheet: { left: 0, top: 0, width: 799, height: 1400 },
  header: { left: 0, top: 0, width: 799, height: 324 },
  members: { left: 12, top: 360, width: 775, height: 180 },
  notes: { left: 12, top: 900, width: 380, height: 120 },
};
const one = (d) => normalizeArt({ decor: [{ img: "x", ...d }] });

describe("normalizing the export", () => {
  it("keeps the tool's fields and fills the rest", () => {
    const art = normalizeArt(EXPORT);
    expect(art.banner).toEqual({ img: "delvers_camp_around_fire_cut", z: 100, x: 50, y: 57, ar: null });
    expect(art.decor[0]).toMatchObject({ id: "members", anchor: "members", corner: "c", x: 150, w: 420, o: 17, layer: "in", clip: true });
  });

  it("nothing to draw: null", () => {
    expect(normalizeArt(null)).toBeNull();
    expect(normalizeArt({ banner: { on: false, img: "a" }, decor: [] })).toBeNull();
    expect(normalizeArt({ decor: [{ anchor: "members" }] })).toBeNull();
  });

  // hover: lift when unknown or missing (2026-10-02, Luke: new pieces lift)
  it("unknown values fall back to the tool's defaults", () => {
    const [d] = normalizeArt({ decor: [{ img: "a", anchor: "attic", corner: "zz", layer: "under", blend: "weird", hover: "spin", o: 300, w: -5 }] }).decor;
    expect(d).toMatchObject({ anchor: "sheet", corner: "c", layer: "over", blend: "normal", hover: "lift", o: 100, w: 1 });
    expect(one({}).decor[0].hover).toBe("lift");
    expect(one({ hover: "none" }).decor[0].hover).toBe("none");
  });

  it("the banner off still keeps the decorations", () => {
    const art = normalizeArt({ banner: { on: false, img: "a" }, decor: EXPORT.decor });
    expect(art.banner).toBeNull();
    expect(art.decor).toHaveLength(1);
  });
});

describe("anchor points", () => {
  it.each(Object.entries(POINTS))("%s is that fraction of the box", (corner, [fx, fy]) => {
    const box = { left: 10, top: 20, width: 200, height: 100 };
    const p = anchorPoint(box, corner);
    expect(p.local).toEqual({ x: 200 * fx, y: 100 * fy });
    expect(p).toMatchObject({ x: 10 + 200 * fx, y: 20 + 100 * fy });
  });

  it("an unknown corner is the centre", () => {
    expect(anchorPoint({ left: 0, top: 0, width: 10, height: 10 }, "zz").local).toEqual({ x: 5, y: 5 });
  });
});

describe("layout", () => {
  it("in a section: placed from the section's own box, in its clip host", () => {
    const [d] = decorLayout(normalizeArt(EXPORT), boxes);
    expect(d).toMatchObject({ layer: "in", host: "members", clip: true, left: 775 / 2 + 150, top: 180 / 2 });
  });

  it("in a section, unclipped: on the section itself", () => {
    const [d] = decorLayout(one({ anchor: "notes", layer: "in", clip: false, corner: "br", x: -10, y: 5 }), boxes);
    expect(d).toMatchObject({ layer: "in", host: "notes", clip: false, left: 380 - 10, top: 120 + 5 });
  });

  it("behind and over: from the sheet-level origin", () => {
    const [behind] = decorLayout(one({ anchor: "notes", layer: "behind", corner: "tl", x: 4, y: -6 }), boxes);
    expect(behind).toMatchObject({ layer: "behind", host: "behind", left: 12 + 4, top: 900 - 6 });
    const [over] = decorLayout(one({ anchor: "header", layer: "over", corner: "b" }), boxes);
    expect(over).toMatchObject({ layer: "over", host: "over", left: 799 / 2, top: 324 });
  });

  it("'in' on the sheet or the header goes behind, as the tool does", () => {
    const [d] = decorLayout(one({ anchor: "header", layer: "in", corner: "c" }), boxes);
    expect(d).toMatchObject({ layer: "behind", host: "behind", clip: false });
  });

  it("a section the sheet doesn't show is skipped", () => {
    expect(decorLayout(one({ anchor: "companions", layer: "in" }), boxes)).toEqual([]);
  });

  it("draws in array order", () => {
    const art = normalizeArt({ decor: [
      { id: "a", img: "x", anchor: "sheet", layer: "over" },
      { id: "b", img: "y", anchor: "members", layer: "in" },
      { id: "c", img: "z", anchor: "notes", layer: "behind" },
    ] });
    expect(decorLayout(art, boxes).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("every section key can host an in-section decoration", () => {
    for (const key of SECTION_ANCHORS) {
      const [d] = decorLayout(one({ anchor: key, layer: "in" }), { [key]: { left: 0, top: 0, width: 100, height: 50 } });
      expect(d).toMatchObject({ layer: "in", host: key, left: 50, top: 25 });
    }
  });
});

describe("style", () => {
  it("turn, mirror, opacity, blend, and width, as the tool's custom properties", () => {
    const [d] = normalizeArt({ decor: [{ img: "x", r: -12, flip: true, o: 45, blend: "screen", w: 260 }] }).decor;
    expect(decorStyle(d)).toBe("--r:-12deg;--fx:-1;--o:0.45;--blend:screen;--lift:1.0769;width:260px");
  });

  // the lift is a set number of pixels (20), not a share of the size
  it("the lift adds 20px of width to a piece of any size", () => {
    for (const w of [100, 400, 1000]) {
      const [d] = normalizeArt({ decor: [{ img: "x", w }] }).decor;
      const lift = Number(decorStyle(d).match(/--lift:([\d.]+)/)[1]);
      expect(w * lift - w).toBeCloseTo(20, 1);
    }
  });

  it("unflipped is scaleX 1", () => {
    const [d] = normalizeArt({ decor: [{ img: "x" }] }).decor;
    expect(decorStyle(d)).toContain("--fx:1;");
  });
});

describe("image paths", () => {
  it("a bare name is a webp in the content module's party folder", () => {
    expect(partyArtUrl("rope_coil")).toBe("modules/fvtt-heart-content/assets/art/party/rope_coil.webp");
    expect(partyArtUrl("rope_coil.png")).toBe("modules/fvtt-heart-content/assets/art/party/rope_coil.png");
  });

  it("a path inside the module, or a full path, stays", () => {
    expect(partyArtUrl("assets/art/item/rope_coil.webp")).toBe("modules/fvtt-heart-content/assets/art/item/rope_coil.webp");
    expect(partyArtUrl("modules/other/x.webp")).toBe("modules/other/x.webp");
    expect(partyArtUrl("")).toBe("");
  });
});
