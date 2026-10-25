/**
 * Polygon washes (Luke, 2026-10-25; the Plenty map's request 2): a wash
 * stroke `fill`ed is a closed shape filled in the wash's own colour and soft
 * edge, any size. Kept by the model wherever a stroke goes (cleaned, on a
 * card and back, in a kept doodle, from the brush in hand), taken by the
 * pointer anywhere inside it, and rubbed out whole by the eraser.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, cleanStroke, nibOf, brushStroke, cutStroke, cutPatch, strokeToCard, savedDoodleOf, shapeTouched } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: [], tapes: [] } });
// a field: a square 400 across
const field = { c: 4, w: 40, o: 0.25, b: 1, n: "wash", fill: true, pts: [100, 100, 500, 100, 500, 500, 100, 500] };
const live = (raw) => new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), look: () => look, painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => ({ id: "gm", isGM: true }), px: () => 1, raw: () => raw });

describe("a filled wash, as the model keeps it", () => {
  it("a wash's fill kept; never another nib's", () => {
    expect(nibOf("wash", true)).toEqual({ n: "wash", fill: true });
    expect(nibOf("pen", true)).toEqual({ n: "pen" });
    expect(nibOf(undefined, true)).toEqual({});
    expect(cleanStroke(field)).toMatchObject({ n: "wash", fill: true });
    expect(cleanStroke({ ...field, n: "pen" }).fill).toBeUndefined();
  });

  it("from the brush in hand, with Fill on", () => {
    expect(brushStroke({ c: 4, w: 40, o: 0.25, b: 1, n: "wash", fill: true }, look, field.pts)).toMatchObject({ n: "wash", fill: true });
    expect(brushStroke({ c: 4, w: 8, n: "brush", fill: true }, look, field.pts).fill).toBeUndefined();
  });

  it("on a card and back again, its fill and its points kept", () => {
    const raw = { scraps: { n1: { type: "note", text: "", x: 300, y: 300, state: "known" } }, links: {}, pins: {} };
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const card = view.scraps[0];
    const onCard = strokeToCard({ ...field, pts: [280, 280, 320, 280, 320, 320, 280, 320] }, card, look);
    expect(onCard).toMatchObject({ n: "wash", fill: true });
    raw.scraps.n1.marks = { k1: { ...onCard, by: "gm" } };
    const back = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0].layout.strokes[0];
    expect(back).toMatchObject({ n: "wash", fill: true });
    // (to a twentieth of a board px: a card's points are kept to its unit's ten-thousandths)
    back.pts.forEach((v, i) => expect(Math.abs(v - [280, 280, 320, 280, 320, 320, 280, 320][i])).toBeLessThan(0.05));
  });

  it("in a doodle kept as one's own", () => {
    expect(savedDoodleOf([field]).strokes[0]).toMatchObject({ n: "wash", fill: true });
  });
});

describe("the pointer and the eraser on a filled wash", () => {
  const raw = () => ({ scraps: {}, links: {}, pins: {}, marks: { gm: { f1: field } } });

  it("a press with Erase in the middle of the field takes it, far from its edge", () => {
    const a = live(raw()).press("erase", { x: 300, y: 300 });
    expect(a?.strokes).toEqual([["gm", "f1"]]);
  });

  it("bitten where the eraser touches it, gone only when it covered all of it; never cut along a line (Luke, 2026-10-25)", () => {
    const [p] = cutStroke(field, { pts: [300, 300], r: 10 });
    expect(p.pts).toEqual(field.pts);
    expect(p.bites).toEqual([[300, 300, 10]]);
    expect(cutStroke(field, { pts: [700, 700], r: 10 })).toBeNull();
    // (just past its edge, its soft edge bitten)
    expect(cutStroke(field, { pts: [508, 300], r: 10 })).toHaveLength(1);
    const view = (r) => boardView(look, normalizeBoard(r), "gm", size, measure);
    const r = raw();
    expect(cutPatch(r, view(r), { pts: [300, 300], r: 10 }, [["gm", "f1"]], look).marks.gm.f1).toMatchObject({ n: "wash", fill: true, bites: [[300, 300, 10]] });
    // (scrubbed back and forth over all of it: gone)
    const scrub = [];
    for (let y = 90, i = 0; y <= 510; y += 10, i++) scrub.push(...(i % 2 ? [510, y, 90, y] : [90, y, 510, y]));
    expect(cutStroke(field, { pts: scrub, r: 10 })).toEqual([]);
    expect(cutPatch(r, view(r), { pts: scrub, r: 10 }, [["gm", "f1"]], look)).toEqual({ marks: { gm: { f1: null } } });
    expect(shapeTouched(field.pts, [505, 300], 10)).toBe(true);
  });

  it("a box drawn inside it selects it; its outline is closed", () => {
    const c = live(raw());
    c.dragStart({ x: 250, y: 250 }, { tool: "move" });
    c.dragMove({ x: 350, y: 350 });
    c.dragEnd();
    expect([...c.markSel]).toEqual([JSON.stringify(["gm", "f1"])]);
    const outline = c.marks().strokes[0].pts;
    expect(outline.slice(-2)).toEqual(outline.slice(0, 2));
  });
});
