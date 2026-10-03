/**
 * One gallery for every sheet (src/common/art.js, 2026-10-02): a sheet's
 * gallery holds every piece of art the sheet shows, and a character's own
 * class, calling, or ancestry with alternates offers its key-art pick.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { piecesOf, plainPiece, gearPieces, uniquePieces, currentVariant, canPickKeyArt, startAt } from "../src/common/art.js";

const ART = "flags.fvtt-heart-content.art";
function item(type, name, art, { owned = true, owner = true, child = false, variant } = {}) {
  return {
    documentName: "Item", type, name,
    isEmbedded: owned, isOwner: owner, isChild: child,
    pack: null, _stats: {},
    flags: { "fvtt-heart-content": { art }, heart: variant !== undefined ? { artVariant: variant } : {} },
  };
}
const cls = (opts) => item("class", "Cleaver", {
  src: "a/cleaver.webp", ar: 1.5,
  alts: [{ src: "a/cleaver_2.webp", ar: 1.2 }],
  gallery: [{ src: "a/club.webp", ar: 1 }],
}, opts);

beforeEach(() => {
  globalThis.localizeHeart = (s) => s;
  game.packs = [];
});

describe("a document's pieces", () => {
  it("main, alternates (variants), then the book's drawings", () => {
    const c = cls();
    expect(piecesOf(c).map((p) => [p.src, p.variant, p.label])).toEqual([
      ["a/cleaver.webp", 0, "Cleaver"],
      ["a/cleaver_2.webp", 1, "Cleaver"],
      ["a/club.webp", null, "Cleaver"],
    ]);
    expect(piecesOf(c).every((p) => p.doc === c)).toBe(true);
  });

  it("no art: no pieces", () => {
    expect(piecesOf(item("class", "Bare", null))).toEqual([]);
  });
});

describe("key-art picks", () => {
  it("a character's own class, calling, or ancestry with alternates", () => {
    for (const type of ["class", "calling", "ancestry"]) {
      expect(canPickKeyArt(item(type, "X", { src: "m.webp", alts: [{ src: "b.webp" }] }))).toBe(true);
    }
  });

  it("not without alternates, not unowned, not outside a character, not gear", () => {
    expect(canPickKeyArt(item("calling", "X", { src: "m.webp" }))).toBe(false);
    expect(canPickKeyArt(cls({ owner: false }))).toBe(false);
    expect(canPickKeyArt(cls({ owned: false }))).toBe(false);
    expect(canPickKeyArt(item("equipment", "Knife", { src: "k.webp", alts: [{ src: "b.webp" }] }))).toBe(false);
    expect(canPickKeyArt(null)).toBe(false);
  });

  it("the current pick, 0 by default", () => {
    expect(currentVariant(cls())).toBe(0);
    expect(currentVariant(cls({ variant: 1 }))).toBe(1);
  });
});

describe("a sheet's gallery", () => {
  it("each drawing once, plain pieces for gear and decorations", () => {
    const pieces = uniquePieces([
      plainPiece("x.webp", "Banner"),
      plainPiece("y.webp", "Members"),
      plainPiece("x.webp", "Notes"),
      plainPiece("", "nothing"),
    ]);
    expect(pieces.map((p) => [p.src, p.label, p.variant, p.doc])).toEqual([
      ["x.webp", "Banner", null, null],
      ["y.webp", "Members", null, null],
    ]);
  });

  it("gear on the sheet: one piece each, only gear with art", () => {
    const knife = item("equipment", "Knife", { src: "knife.webp", ar: 2 });
    const rope = item("equipment", "Rope", null);
    expect(gearPieces([knife, rope]).map((p) => [p.src, p.label])).toEqual([["knife.webp", "Knife"]]);
  });

  it("opens at the clicked document's current piece", () => {
    const anc = item("ancestry", "Human", { src: "h.webp" });
    const c = cls({ variant: 1 });
    const pieces = [...piecesOf(anc), ...piecesOf(c)];
    expect(startAt(pieces, anc)).toBe(0);
    expect(startAt(pieces, c)).toBe(2);
  });
});
