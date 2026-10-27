/**
 * Pieces (2026-10-26, the data standard for scenes: monorepo
 * docs/board-editor/pieces.md): each element of a scene its own piece,
 * normalized, patched, undone, placed per clock stage, and hit by a click.
 */

import { describe, it, expect } from "vitest";
import { normalizeBoard, normalizePiece, normalizePieces, normalizeStages, pieceAt, pieceHull, pieceAtPoint, applyPatch, diffBoard, recordTarget } from "../src/map/scrapboard/model.js";

const HOUSE = () => ({ kind: "building", name: "The Wheatsheaf", x: 1000, y: 800, w: 400, h: 200, r: 0, layer: "standing", img: { url: "modules/fvtt-heart-content/assets/art/map/boards/plenty/pieces/ordinary.webp", w: 800, h: 400 }, src: { from: "plenty-kit", id: "ordinary" } });

describe("normalizePiece", () => {
  it("keeps a building whole", () => {
    const p = normalizePiece(HOUSE(), "ordinary");
    expect(p).toMatchObject({ id: "ordinary", kind: "building", name: "The Wheatsheaf", x: 1000, y: 800, w: 400, h: 200, layer: "standing", state: "known" });
    expect(p.img.url).toMatch(/ordinary\.webp$/);
    expect(p.src).toEqual({ from: "plenty-kit", id: "ordinary" });
  });

  it("drops a piece with no place", () => {
    expect(normalizePiece({ kind: "tree" })).toBeNull();
    expect(normalizePiece(null)).toBeNull();
  });

  it("refuses a picture from another site or a way up", () => {
    expect(normalizePiece({ ...HOUSE(), img: { url: "https://evil.example/x.webp" } }).img).toBeUndefined();
    expect(normalizePiece({ ...HOUSE(), img: { url: "javascript:alert(1)" } }).img).toBeUndefined();
    expect(normalizePiece({ ...HOUSE(), img: { url: "../../secrets.webp" } }).img).toBeUndefined();
  });

  it("keeps a shape as a polygon or a line, and its strokes cleaned", () => {
    const fence = normalizePiece({ kind: "fence", x: 0, y: 0, layer: "low", shape: { line: [-50, 0, 50, 0], w: 6 } });
    expect(fence.shape).toEqual({ line: [-50, 0, 50, 0], w: 6 });
    const thawed = normalizePiece({ ...HOUSE(), img: null, marks: { m1: { c: 1, w: 4, pts: [0, 0, 10, 10] }, bad: { pts: [] } } });
    expect(Object.keys(thawed.marks)).toEqual(["m1"]);
    expect(thawed.img).toBeUndefined();
  });

  it("an unknown layer stands; a hidden piece stays hidden", () => {
    expect(normalizePiece({ ...HOUSE(), layer: "sky" }).layer).toBe("standing");
    expect(normalizePiece({ ...HOUSE(), state: "hidden" }).state).toBe("hidden");
  });

  it("keeps a person's places per stage", () => {
    const p = normalizePiece({ kind: "npc", x: 10, y: 20, layer: "people", times: { dusk: { x: 30, y: 40 }, late: { hidden: true }, "Bad Stage!": { x: 1, y: 1 } } });
    expect(p.times).toEqual({ dusk: { x: 30, y: 40 }, late: { hidden: true } });
  });
});

describe("the board", () => {
  it("normalizeBoard reads pieces and stages, and drops bad ids", () => {
    const B = normalizeBoard({ pieces: { ordinary: HOUSE(), "Bad Id": HOUSE() }, stages: ["afternoon", { id: "dusk", name: "Dusk" }, "dusk", "No!"] });
    expect(Object.keys(B.pieces)).toEqual(["ordinary"]);
    expect(B.stages).toEqual([{ id: "afternoon", name: "afternoon" }, { id: "dusk", name: "Dusk" }]);
  });

  it("an old board has none, and is otherwise as it was", () => {
    const B = normalizeBoard({});
    expect(B.pieces).toEqual({});
    expect(B.stages).toEqual([]);
  });

  it("applyPatch sets a piece field by field, takes a field off with null, and a piece off", () => {
    const b = { pieces: { ordinary: HOUSE() } };
    applyPatch(b, { pieces: { ordinary: { x: 1200, locked: true } } });
    expect(b.pieces.ordinary).toMatchObject({ x: 1200, y: 800, locked: true, name: "The Wheatsheaf" });
    applyPatch(b, { pieces: { ordinary: { locked: null } } });
    expect("locked" in b.pieces.ordinary).toBe(false);
    applyPatch(b, { pieces: { well: { kind: "well", x: 5, y: 5 } } });
    applyPatch(b, { pieces: { ordinary: null } });
    expect(Object.keys(b.pieces)).toEqual(["well"]);
  });

  it("a piece's move is undone by its record", () => {
    const before = { pieces: { ordinary: HOUSE() } };
    const after = applyPatch(JSON.parse(JSON.stringify(before)), { pieces: { ordinary: { x: 1300 } } });
    const rec = diffBoard(before, after, [["pieces", "ordinary"]]);
    expect(rec.ops.length).toBeGreaterThan(0);
    expect(recordTarget(after, rec, "before").pieces.ordinary.x).toBe(1000);
  });
});

describe("normalizeStages", () => {
  it("is empty for anything but a list", () => {
    expect(normalizeStages(null)).toEqual([]);
    expect(normalizeStages({ a: 1 })).toEqual([]);
  });
});

describe("pieceAt (clock stages)", () => {
  const stages = [{ id: "afternoon" }, { id: "dusk" }, { id: "evening" }, { id: "late" }];
  const p = normalizePiece({ kind: "npc", x: 10, y: 20, layer: "people", times: { dusk: { x: 30, y: 40 }, late: { hidden: true } } });

  it("its own place with no stage", () => {
    expect(pieceAt(p)).toEqual({ x: 10, y: 20, r: 0, hidden: false });
  });

  it("a stage's own place", () => {
    expect(pieceAt(p, "dusk", stages)).toMatchObject({ x: 30, y: 40, hidden: false });
  });

  it("a stage without one keeps the last stage's place", () => {
    expect(pieceAt(p, "evening", stages)).toMatchObject({ x: 30, y: 40 });
    expect(pieceAt(p, "late", stages)).toMatchObject({ x: 30, y: 40, hidden: true });
  });

  it("before any of its stages, its own place", () => {
    expect(pieceAt(p, "afternoon", stages)).toMatchObject({ x: 10, y: 20 });
  });
});

describe("hitting a piece", () => {
  const pieces = normalizePieces({
    field: { kind: "field", x: 1000, y: 800, w: 2000, h: 2000, layer: "ground" },
    ordinary: HOUSE(),
    fence: { kind: "fence", x: 1000, y: 1200, layer: "low", shape: { line: [-300, 0, 300, 0], w: 8 } },
  });

  it("the topmost layer first", () => {
    expect(pieceAtPoint(pieces, { x: 1000, y: 800 })?.id).toBe("ordinary");
    expect(pieceAtPoint(pieces, { x: 300, y: 300 })?.id).toBe("field");
  });

  it("a line's piece within its width, and the reach", () => {
    expect(pieceAtPoint(pieces, { x: 1100, y: 1203 })?.id).toBe("fence");
    expect(pieceAtPoint(pieces, { x: 1100, y: 1210 })?.id).toBe("field");
    expect(pieceAtPoint(pieces, { x: 1100, y: 1210 }, { tol: 8 })?.id).toBe("fence");
  });

  it("a turned box", () => {
    const h = pieceHull({ x: 0, y: 0, w: 20, h: 10, r: 90 });
    expect(h.map((v) => Math.round(v))).toEqual([5, -10, 5, 10, -5, 10, -5, -10]);
  });

  it("skips what it is told to (a hidden piece for a player)", () => {
    expect(pieceAtPoint(pieces, { x: 1000, y: 800 }, { skip: (p) => p.id === "ordinary" })?.id).toBe("field");
  });
});
