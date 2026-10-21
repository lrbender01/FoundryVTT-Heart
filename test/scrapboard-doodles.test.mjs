/**
 * The brush's doodles (Luke, 2026-10-06): a bank of quick brush drawings a
 * card may come with, laid on it as ordinary strokes of its owner's (theirs
 * to move or rub out), and laid down by hand from the brush's doodle palette.
 */

import { describe, it, expect } from "vitest";
import { DOODLES, DOODLE_KINDS, DOODLE_SIZE, doodleStrokes, doodleBoard, seasonMarks, normalizeBoard, normalizeLook, boardView, cleanStroke, PIN_SCALE } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";
import { mayRubOut } from "../src/map/scrapboard/controls.js";

describe("the doodles", () => {
  it("each is one or more clean strokes, on the card, the same for the same seed", () => {
    for (const kind of Object.keys(DOODLES)) {
      const out = doodleStrokes(kind, "k1", { u: 0.1, v: -0.1, size: 0.2, c: 1, w: 3, by: "ana" });
      expect(Object.keys(out).length).toBeGreaterThan(0);
      expect(doodleStrokes(kind, "k1", { u: 0.1, v: -0.1, size: 0.2, c: 1, w: 3, by: "ana" })).toEqual(out);
      for (const st of Object.values(out)) {
        expect(cleanStroke(st, { card: true })).toEqual(st);
        expect(st.by).toBe("ana");
        for (let i = 0; i < st.pts.length; i += 2) {
          expect(Math.abs(st.pts[i] - 0.1)).toBeLessThan(0.35);
          expect(Math.abs(st.pts[i + 1] + 0.1)).toBeLessThan(0.35);
        }
      }
    }
  });

  it("about a card in four comes seasoned, its owner's to rub out", () => {
    let seasoned = 0;
    for (let i = 0; i < 200; i++) {
      const m = seasonMarks(`n${i}`, { by: "ana", type: "note" });
      if (Object.keys(m).length) {
        seasoned++;
        for (const st of Object.values(m)) expect(mayRubOut(st.by, { id: "ana", isGM: false })).toBe(true);
      }
    }
    expect(seasoned).toBeGreaterThan(35);
    expect(seasoned).toBeLessThan(90);
    // (normalized with the card, the strokes keep their owner)
    const raw = { scraps: { n: { type: "note", text: "x", x: 0, y: 0, marks: doodleStrokes("ring", "n", { by: "ana" }) } } };
    expect(Object.values(normalizeBoard(raw).scraps.n.marks)[0].by).toBe("ana");
  });

  it("a doodle laid on the sheet: hand-drawn (no straight segments), the brush's weight, where it was clicked", () => {
    expect(DOODLE_KINDS.length).toBeGreaterThanOrEqual(24);
    for (const kind of DOODLE_KINDS) {
      const strokes = doodleBoard(kind, "s", { x: 1000, y: 800, size: 60, c: 2, w: 8, b: 2 });
      expect(strokes.length).toBeGreaterThan(0);
      for (const st of strokes) {
        expect(st).toMatchObject({ c: 2, w: 9.6, b: 2 });
        for (let k = 0; k < st.pts.length; k += 2) {
          expect(Math.abs(st.pts[k] - 1000)).toBeLessThan(80);
          expect(Math.abs(st.pts[k + 1] - 800)).toBeLessThan(80);
        }
      }
    }
    // (a long line walked in short steps, wavering: no two-point lines)
    const [u] = doodleBoard("underline", "s", { x: 0, y: 0, size: 60 });
    expect(u.pts.length).toBeGreaterThan(30);
  });

  it("with one in hand, a click with the brush lays it down (on the card under it, or the sheet)", () => {
    const look = normalizeLook({});
    const raw = { scraps: {}, links: {} };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", () => null, (t, px) => t.length * px * 0.5), painter: () => ({ tagOf: () => null, onTag: () => false }), size: () => null, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });
    expect(c.press("mark", { x: 10, y: 10 })).toBeNull();
    c.doodle = "star";
    // (the ghost under the pointer is the very doodle the click lays)
    const ghost = c.marks({ pointer: { x: 10, y: 10 } }).doodle;
    expect(ghost).toMatchObject({ kind: "star", at: { x: 10, y: 10 } });
    const laid = c.press("mark", { x: 10, y: 10 });
    expect(laid).toEqual({ do: "doodle", kind: "star", seed: ghost.seed, at: { x: 10, y: 10 }, on: null });
    expect(c.marks({ pointer: { x: 10, y: 10 } }).doodle.seed).not.toBe(ghost.seed);
    expect(c.dragStart({ x: 10, y: 10 }, { tool: "mark" })).toBeNull();
    // (never on a right-click: Luke 2026-10-06)
    expect(c.press("mark", { x: 10, y: 10 }, { right: true })).toBeNull();
  });

  it("every doodle fills the same box, and its line keeps its weight against it, small or large (Luke, 2026-10-06)", () => {
    expect(DOODLE_KINDS.length).toBeGreaterThanOrEqual(50);
    for (const kind of DOODLE_KINDS) {
      for (const size of [20, DOODLE_SIZE, 150]) {
        const strokes = doodleBoard(kind, "s", { x: 0, y: 0, size, w: 8 });
        const all = strokes.flatMap((st) => st.pts);
        const xs = all.filter((_, i) => i % 2 === 0), ys = all.filter((_, i) => i % 2 === 1);
        const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
        // (a hand's waver and overshoot aside, its widest way the size)
        expect(half / size).toBeGreaterThan(0.8);
        expect(half / size).toBeLessThan(1.25);
        for (const st of strokes) expect(st.w / size).toBeCloseTo(Math.max(1.5, (8 * size) / DOODLE_SIZE) / size, 2);
      }
    }
  });

});

describe("pins alike (Luke, 2026-10-06)", () => {
  it("every pin's head comes out half its base width", () => {
    // (each head's measured share of its image's width)
    const HEAD = { fixture_dark_tack_head_flat: 0.668, fixture_grey_tack_small: 0.712, fixture_iron_nails_three_2_crop: 0.573, fixture_red_pushpin_long: 0.455, fixture_brass_pushpins_pair_crop: 0.593, fixture_violet_pushpin_patterned: 0.716 };
    for (const [k, h] of Object.entries(HEAD)) expect(PIN_SCALE[k] * h).toBeCloseTo(0.5, 2);
  });
});
