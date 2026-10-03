/**
 * What is under the pointer on the scrapboard map (src/map/scrapboard/
 * hits.js, 2026-10-02): pins first (a string's ends, a named string's
 * junction and tag pin, a scrap's own and added pins), then tags, then
 * scraps and strings; and a dragged pin's place kept on its paper.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView } from "../src/map/scrapboard/model.js";
import { hitAt, onPaper, onTagAt } from "../src/map/scrapboard/hits.js";

const SIZES = {
  "tx/paper__portrait__a": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/fixtures__fixture_grey_tack_small": { w: 40, h: 50 },
};
const size = (id) => SIZES[id] ?? null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({
  pools: { papers: ["tx/paper__portrait__a"], notes: ["tx/paper__portrait__a"], pins: ["tx/fixtures__fixture_grey_tack_small"], tapes: [] },
  library: { grip: { name: "Grip Station" }, sump: { name: "Sump Station" } },
});
const board = normalizeBoard({
  scraps: {
    grip: { lib: "grip", x: 300, y: 300, r: 0 },
    sump: { lib: "sump", x: 1300, y: 300, r: 0 },
    loose: { type: "note", text: "rent", x: 800, y: 1200, r: 0, pins: [{ u: 0.4, v: 0.4 }] },
  },
  links: { l1: { a: "grip", b: "sump", kind: "path", label: "Gutter Run", tagDx: 0, tagDy: 200 } },
});
const view = boardView(look, board, "gm", size, measure);
// the painter's part: a tag 200 x 50 at its junction + (tagDx, tagDy)
const painter = {
  tagOf: (l) => (l.label && l.junction ? { x: l.junction.x, y: l.junction.y + 200, w: 200, h: 50, rot: 0, over: false, mid: l.junction, pin: { x: l.junction.x - 80, y: l.junction.y + 200, w: 20 } } : null),
  onTag: (T, p) => Math.abs(p.x - T.x) < T.w / 2 && Math.abs(p.y - T.y) < T.h / 2,
};
const at = (pt) => hitAt(view, painter, size, pt, 6);

describe("what is under the pointer", () => {
  const l = view.links[0];

  it("finds a string's end pins before the scrap under them", () => {
    expect(at(l.ends[0])).toMatchObject({ kind: "end", side: 0 });
    expect(at(l.ends[1])).toMatchObject({ kind: "end", side: 1 });
  });

  it("finds a named string's junction, its tag's pin, and its tag", () => {
    expect(at(l.junction)).toMatchObject({ kind: "join" });
    const T = painter.tagOf(l);
    expect(at(T.pin)).toMatchObject({ kind: "tagPin" });
    expect(at({ x: T.x + 40, y: T.y })).toMatchObject({ kind: "tag" });
  });

  it("finds a loose scrap's own pin and its added pins", () => {
    const s = view.scraps.find((x) => x.key === "loose");
    expect(at(s.layout.pin)).toMatchObject({ kind: "scrapPin", idx: -1 });
    expect(at(s.layout.pins[0])).toMatchObject({ kind: "scrapPin", idx: 0 });
  });

  it("skips the own pin of a scrap its strings hold", () => {
    const s = view.scraps.find((x) => x.key === "grip");
    expect(s.tied).toBe(true);
    expect(at(s.layout.pin)?.kind).not.toBe("scrapPin");
  });

  it("falls back to scraps and the empty board", () => {
    expect(at({ x: 300, y: 330 })).toMatchObject({ kind: "scrap" });
    expect(at({ x: 2000, y: 2000 })).toBeNull();
  });
});

describe("a dragged pin's place", () => {
  it("is kept on the scrap's paper, against its text box", () => {
    const s = view.scraps.find((x) => x.key === "grip");
    expect(onPaper(s, { x: 300, y: 300 })).toEqual({ u: 0, v: 0 });
    const far = onPaper(s, { x: 9000, y: 300 });
    // clamped to the paper's edge, a little past the text box
    expect(far.u).toBeGreaterThan(0.5);
    expect(far.u).toBeLessThan(0.7);
  });

  it("is kept on its tag", () => {
    expect(onTagAt({ x: 0, y: 0, w: 200, h: 50, rot: 0 }, { x: 500, y: 10 })).toEqual({ u: 0.5, v: 0.2 });
  });
});
