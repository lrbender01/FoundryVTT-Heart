/**
 * The Pen nib (Luke, 2026-10-25): each stroke drawn with the ink brush or a
 * pen (`n: 'pen'`), kept through cleaning, cards, doodles, kept drawings, and
 * live previews; a style says which a new stroke takes.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, cleanStroke, brushStroke, doodleBoard, savedDoodleOf, cleanSavedDoodle } from "../src/map/scrapboard/model.js";
import { livePeer } from "../src/map/scrapboard/live.js";

const look = normalizeLook({});

describe("a stroke's nib", () => {
  it("kept as pen, else the brush (left out)", () => {
    expect(cleanStroke({ c: 0, w: 4, n: "pen", pts: [0, 0, 5, 5] }).n).toBe("pen");
    expect(cleanStroke({ c: 0, w: 4, n: "brush", pts: [0, 0, 5, 5] }).n).toBeUndefined();
    expect(cleanStroke({ c: 0, w: 4, n: "quill", pts: [0, 0, 5, 5] }).n).toBeUndefined();
  });

  it("the brush in hand lays its nib; doodles and kept drawings keep it", () => {
    expect(brushStroke({ c: 1, w: 3, n: "pen" }, look, [0, 0, 1, 1]).n).toBe("pen");
    expect(doodleBoard("star", "s", { x: 0, y: 0, n: "pen" }).every((st) => st.n === "pen")).toBe(true);
    const kept = savedDoodleOf([{ c: 0, w: 4, n: "pen", pts: [0, 0, 10, 10] }]);
    expect(cleanSavedDoodle(kept).strokes[0].n).toBe("pen");
  });

  it("a live preview shows it", () => {
    const p = livePeer(null, { t: "stroke", from: "a", scene: "s", seq: 0, base: 0, pts: [0, 0, 1, 1], brush: { c: 0, n: "pen" } });
    expect(p.stroke.brush.n).toBe("pen");
  });

  it("a style says which a new stroke takes", () => {
    expect(look.nib).toBe("brush");
    expect(normalizeLook({ nib: "pen" }).nib).toBe("pen");
  });
});
