/**
 * Blank notes and writing dropped on them (Luke, 2026-10-25): a note may be
 * a card with nothing on it (never written, or its writing taken off), and
 * writing on the sheet let go on a blank note becomes its writing (the
 * reverse of a note's writing dragged off it, breakAwayPatch).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, scrapLayout, noteBlank, absorbPatch, applyPatch } from "../src/map/scrapboard/model.js";

const look = normalizeLook({});
const size = () => null;
const measure = (t, px) => String(t).length * px * 0.5;

describe("a blank note", () => {
  it("is blank never written or with its writing taken off; a name tag never", () => {
    expect(noteBlank({ type: "note", text: "" })).toBe(true);
    expect(noteBlank({ type: "note", text: "   " })).toBe(true);
    expect(noteBlank({ type: "note", text: "kept", drop: ["text"] })).toBe(true);
    expect(noteBlank({ type: "note", text: "words" })).toBe(false);
    expect(noteBlank({ type: "note", text: "", tag: "l1" })).toBe(false);
    expect(noteBlank({ type: "scrawl", text: "" })).toBe(false);
  });

  it("is drawn with no writing on it (no '...')", () => {
    const s = normalizeBoard({ scraps: { n1: { type: "note", x: 0, y: 0, text: "" } } }).scraps.n1;
    expect(s).toBeTruthy();
    expect(scrapLayout(s, look, size, measure).lines).toEqual([]);
  });
});

describe("writing let go on a blank note", () => {
  const raw = () => ({
    scraps: {
      n1: { type: "note", x: 100, y: 100, text: "", drop: ["text", "web"], parts: { text: { u: 0.1, v: 0 }, web: { u: 0, v: 0 } }, author: "ana" },
      w1: { type: "scrawl", x: 110, y: 90, text: "the lift is out", hand: "Caveat", paint: 3, bright: 2, bold: true },
    },
  });

  it("becomes the note's writing, in its hand, paint, and setting; the writing gone", () => {
    const board = raw();
    const p = absorbPatch(board, "w1", "n1");
    applyPatch(board, p);
    expect(board.scraps.w1).toBeUndefined();
    expect(board.scraps.n1).toMatchObject({ text: "the lift is out", hand: "Caveat", paint: 3, bright: 2, bold: true, drop: ["web"] });
    // (fitted as a note's writing is: its old place on the note let go)
    expect(board.scraps.n1.parts).toEqual({ web: { u: 0, v: 0 } });
  });

  it("never onto a note with writing, a locked one, or locked writing", () => {
    const b1 = raw();
    b1.scraps.n1.text = "already";
    b1.scraps.n1.drop = [];
    expect(absorbPatch(b1, "w1", "n1")).toBeNull();
    const b2 = raw();
    b2.scraps.n1.locked = true;
    expect(absorbPatch(b2, "w1", "n1")).toBeNull();
    const b3 = raw();
    b3.scraps.w1.locked = true;
    expect(absorbPatch(b3, "w1", "n1")).toBeNull();
    expect(absorbPatch(raw(), "n1", "w1")).toBeNull();
  });
});
