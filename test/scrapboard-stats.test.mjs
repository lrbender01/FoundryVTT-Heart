/**
 * The board's statistics (Luke, 2026-10-25, File for everyone): what is on
 * the board as this user sees it, and what everyone else is doing live
 * (stats.js boardCounts, liveCounts, fmtBytes).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView } from "../src/map/scrapboard/model.js";
import { boardCounts, boardBytes, liveCounts, fmtBytes } from "../src/map/scrapboard/stats.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] } });

describe("boardCounts: the board as this user sees it", () => {
  const raw = {
    scraps: {
      n1: { type: "note", text: "x", x: 1000, y: 1000, marks: { k1: { c: 1, w: 4, by: "ana", pts: [-0.4, 0, 0.4, 0] } } },
      n2: { type: "note", text: "secret", x: 2000, y: 1000, state: "hidden" },
    },
    links: {},
    pins: { p1: { id: "p1", tex: "tx/pin", x: 10, y: 10 } },
    marks: {
      gm: { m1: { c: 2, w: 6, pts: [0, 0, 100, 0, 200, 0] }, m2: { c: 2, w: 40, n: "wash", fill: true, pts: [0, 0, 50, 0, 50, 50] } },
      ana: { m3: { c: 1, w: 3, n: "pen", pts: [0, 0, 9, 9], span: [0.2, 0.6], bites: [[1, 1, 4], [2, 2, 4]] } },
    },
  };

  it("counts cards, strokes by nib, points, the eraser's pieces and bites, and pins", () => {
    const c = boardCounts(boardView(look, normalizeBoard(raw), "gm", size, measure));
    expect(c).toMatchObject({ cards: 2, notes: 2, places: 0, strokes: 4, onCards: 1, points: 2 + 3 + 3 + 2, brush: 2, pen: 1, filled: 1, wash: 0, pieces: 1, bites: 2, pins: 1 });
    expect(boardBytes(raw)).toBe(JSON.stringify(raw).length);
    expect(boardBytes(null)).toBe(0);
  });

  it("a player's counts leave out what is hidden from them", () => {
    expect(boardCounts(boardView(look, normalizeBoard(raw), "ana", size, measure)).cards).toBe(1);
  });

  it("nothing at all: zeros", () => {
    expect(boardCounts(null)).toMatchObject({ cards: 0, strokes: 0, pins: 0 });
  });
});

describe("liveCounts and fmtBytes", () => {
  it("counts the peers heard and what each is doing", () => {
    const peers = [{ stroke: { pts: [] } }, { string: {}, drag: {} }, { moving: [{}] }, { moving: [] }, null];
    expect(liveCounts(peers)).toEqual({ peers: 4, painting: 1, tying: 1, dragging: 1, moving: 1 });
  });

  it("reads bytes as a person does", () => {
    expect(fmtBytes(812)).toBe("812 B");
    expect(fmtBytes(41 * 1024)).toBe("41 KB");
    expect(fmtBytes(3.2 * 1024 * 1024)).toBe("3.2 MB");
    expect(fmtBytes(undefined)).toBe("0 B");
  });
});
