/**
 * A note's writing keeps its size once moved, sized, or turned (Luke,
 * 2026-10-25): only untouched notes fit their writing to their paper. The
 * size is kept on the writing's part (`fs`, against the paper's width); older
 * boards' touched notes get theirs once (NOTES_EDITION 2).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, scrapLayout, freezeNoteText, tidyBoard, NOTES_EDITION } from "../src/map/scrapboard/model.js";

const look = normalizeLook({});
const size = () => null;
const measure = (t, px) => String(t).length * px * 0.5;
const note = (extra = {}) => ({ type: "note", x: 500, y: 500, text: "a few words on a note", ...extra });
const layout = (raw) => scrapLayout(normalizeBoard({ scraps: { n1: raw } }).scraps.n1, look, size, measure);

describe("a note's writing size", () => {
  it("an untouched note fits its writing, and says how big that is", () => {
    const L = layout(note());
    expect(L.textFs).toBeGreaterThan(0);
    expect(L.lines[0].size).toBe(Math.floor(L.textFs * L.box.w + 1e-3));
  });

  it("kept once moved: longer writing does not shrink it", () => {
    const fs = layout(note()).textFs;
    const long = "far more words than before, enough to need a smaller hand to fit the paper";
    const fitted = layout(note({ text: long }));
    const kept = layout(note({ text: long, parts: { text: { u: 0, v: 0.1, fs } } }));
    expect(fitted.lines[0].size).toBeLessThan(kept.lines[0].size);
    expect(kept.lines[0].size).toBe(Math.floor(fs * kept.box.w + 1e-3));
    expect(kept.textFs).toBe(fs);
  });

  it("read and written with the part", () => {
    expect(normalizeBoard({ scraps: { n1: note({ parts: { text: { u: 0, v: 0, fs: 0.12 } } }) } }).scraps.n1.parts.text.fs).toBe(0.12);
  });
});

describe("older boards: their touched notes frozen once", () => {
  it("a note moved by hand gets its size; untouched ones and the bin's too", () => {
    const board = {
      scraps: { n1: note({ parts: { text: { u: 0.1, v: 0 } } }), n2: note() },
      bin: { n3: { scrap: note({ parts: { text: { u: 0, v: 0, w: 0.6 } } }) } },
    };
    expect(freezeNoteText(board, look, size, measure)).toBe(2);
    expect(board.scraps.n1.parts.text.fs).toBeGreaterThan(0);
    expect(board.scraps.n2.parts).toBeUndefined();
    expect(board.bin.n3.scrap.parts.text.fs).toBeGreaterThan(0);
  });

  it("tidy does it once, at edition 2, without fitting notes again", () => {
    const raw = { scraps: { n1: note({ s: 1.3, parts: { text: { u: 0.1, v: 0 } } }) }, notesEd: 1, pinsEd: 1 };
    const { board, changed } = tidyBoard(raw, look, size, measure);
    expect(changed).toBe(true);
    expect(board.notesEd).toBe(NOTES_EDITION);
    expect(board.scraps.n1.s).toBe(1.3);
    expect(board.scraps.n1.parts.text.fs).toBeGreaterThan(0);
  });
});
