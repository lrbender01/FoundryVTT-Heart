/**
 * A card's writing set a stretch at a time (Luke, 2026-10-25): bold, italic,
 * underlined, or struck through over part of it (`fmt`: [[start, end,
 * flags]]), kept through wrapping onto each line's letters, and carried when
 * writing comes off a note or goes onto one.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, scrapLayout, fmtOf, fmtFlags, lineFx, wrapText, handLine, breakAwayPatch, absorbPatch, boardView } from "../src/map/scrapboard/model.js";

const look = normalizeLook({});
const size = () => null;
const measure = (t, px) => String(t).length * px * 0.5;

describe("the setting's ranges", () => {
  it("kept sorted, joined, held to the text, and only b, i, u, s", () => {
    expect(fmtOf([[4, 8, "ib"], [0, 2, "b"], [2, 4, "b"], [6, 99, "sx"]], 10)).toEqual([[0, 4, "b"], [4, 6, "bi"], [6, 10, "s"]]);
    expect(fmtOf([[0, 3, ""]], 5)).toEqual([]);
    expect(fmtOf("nope", 5)).toEqual([]);
    expect(fmtFlags([[1, 3, "u"]], 4)).toEqual(["", "u", "u", ""]);
  });

  it("read with the card", () => {
    const s = normalizeBoard({ scraps: { n1: { type: "note", x: 0, y: 0, text: "hello there", fmt: [[0, 5, "b"]] } } }).scraps.n1;
    expect(s.fmt).toEqual([[0, 5, "b"]]);
  });
});

describe("onto each line's letters", () => {
  it("wrapped lines keep each letter's setting; a gap takes the space before the word", () => {
    const text = "one  two\nthree";
    const lines = wrapText(text, (t) => t.length, 100);
    expect(lines).toEqual(["one two", "three"]);
    const fx = lineFx(text, [[2, 6, "b"], [9, 11, "i"]], lines);
    expect(fx[0]).toEqual(["", "", "b", "b", "b", "", ""]);
    expect(fx[1]).toEqual(["i", "i", "", "", ""]);
  });

  it("none set: no line has any", () => {
    expect(lineFx("a b", [], ["a b"])).toBeNull();
    expect(lineFx("a b", [[0, 1, "b"]], ["a b"])[0]).toEqual(["b", "", ""]);
  });

  it("a note's lines and writing on the sheet carry them; others none", () => {
    const L = scrapLayout(normalizeBoard({ scraps: { n1: { type: "note", x: 0, y: 0, text: "bold then plain", fmt: [[0, 4, "b"]] } } }).scraps.n1, look, size, measure);
    expect(L.lines[0].text.startsWith("bold")).toBe(true);
    expect(L.lines[0].fx.slice(0, 4)).toEqual(["b", "b", "b", "b"]);
    expect(L.lines.flatMap((l) => l.fx ?? []).filter(Boolean).length).toBe(4);
    const W = scrapLayout(normalizeBoard({ scraps: { w1: { type: "scrawl", x: 0, y: 0, text: "a struck word", fmt: [[2, 8, "s"]] } } }).scraps.w1, look, size, measure);
    expect(W.lines.flatMap((l) => l.fx ?? []).filter((f) => f === "s").length).toBe(6);
    const plain = scrapLayout(normalizeBoard({ scraps: { n2: { type: "note", x: 0, y: 0, text: "plain" } } }).scraps.n2, look, size, measure);
    expect(plain.lines[0].fx).toBeUndefined();
  });

  it("each letter knows its place in the line, for its own face", () => {
    const seen = [];
    const hl = handLine("ab", (ch, i) => { seen.push(i); return 10; }, 0, "s");
    expect(seen).toEqual([0, 1]);
    expect(hl.glyphs.map((g) => g.i)).toEqual([0, 1]);
  });
});

describe("carried with the writing", () => {
  it("off a note, and back onto a blank one", () => {
    const raw = { scraps: { n1: { type: "note", x: 500, y: 500, text: "keep this bold", fmt: [[10, 14, "b"]] } } };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const vs = view.scraps.find((s) => s.key === "n1");
    const off = breakAwayPatch(raw, vs, { x: 900, y: 900 }, look, "w1");
    expect(off.newScraps.w1.fmt).toEqual([[10, 14, "b"]]);
    expect(off.scraps.n1.fmt).toEqual([]);
    const board = { scraps: { n1: { ...raw.scraps.n1, text: "", fmt: [] }, w1: off.newScraps.w1 } };
    expect(absorbPatch(board, "w1", "n1").scraps.n1.fmt).toEqual([[10, 14, "b"]]);
  });
});

describe("the note box's writing (richtext.js richHtml; Luke 2026-10-25, the health audit's test gaps)", () => {
  it("each stretch in its tags, the rest plain, escaped", async () => {
    const { richHtml } = await import("../src/map/scrapboard/richtext.js");
    expect(richHtml("a bold <tag>", [[2, 6, "b"]])).toBe("a <b>bold</b> &lt;tag&gt;");
    expect(richHtml("both", [[0, 4, "bi"]])).toBe("<i><b>both</b></i>");
  });

  it("a setting over all of it, and lines kept, a last empty one shown", async () => {
    const { richHtml } = await import("../src/map/scrapboard/richtext.js");
    expect(richHtml("one\ntwo", [], "u")).toBe("<u>one<br>two</u>");
    expect(richHtml("end\n")).toBe("end<br><br>");
    expect(richHtml("")).toBe("");
  });

  it("ranges and letters say the same thing (model.js fmtRanges and fmtFlags)", async () => {
    const { fmtRanges } = await import("../src/map/scrapboard/model.js");
    const fmt = [[0, 2, "b"], [2, 5, "bi"], [7, 9, "s"]];
    expect(fmtRanges(fmtFlags(fmt, 10))).toEqual(fmt);
  });
});
