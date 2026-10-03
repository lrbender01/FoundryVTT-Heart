/**
 * The Heart map's scrapboard model (src/map/scrapboard/model.js, 2026-10-02):
 * the one pure copy the Heart Map Board mock (the primary editor) and the
 * Foundry map scene both run. Covers the look and board documents as they
 * round-trip between the two, the layout of a scrap on its paper's text
 * bounds, strings (gravity, junctions), the sheet's panels, and what the GM
 * and players each see.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeLook,
  normalizeBoard,
  scrapLayout,
  stringPoints,
  viaPoint,
  viaFrom,
  sheetPanels,
  boardView,
  pinScale,
  pointInPoly,
} from "../src/map/scrapboard/model.js";

// textures: a 3:4 paper with a known solid region, a pin, a tape
const SIZES = {
  "tx/paper__portrait__a": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/paper__portrait__b": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/paper__portrait__c": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/paper__landscape__n": { w: 400, h: 300, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/fixtures__fixture_grey_tack_small": { w: 40, h: 50 },
  "tx/fixtures__fixture_red_pushpin_long": { w: 40, h: 70 },
  "tx/fixtures__tape": { w: 100, h: 30 },
};
const size = (id) => SIZES[id] ?? null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = (extra = {}) =>
  normalizeLook({
    pools: {
      papers: ["tx/paper__portrait__a", "tx/paper__portrait__b"],
      notes: ["tx/paper__landscape__n"],
      pins: ["tx/fixtures__fixture_grey_tack_small"],
      tapes: ["tx/fixtures__tape"],
      ends: { delve: ["tx/fixtures__fixture_red_pushpin_long"] },
    },
    library: { grip: { name: "Grip Station", tier: 1, art: null }, sump: { name: "Sump Station", tier: 1 } },
    ...extra,
  });

describe("the look", () => {
  it("defaults to a 4 x 4 sheet and the small scrap size", () => {
    const L = normalizeLook({});
    expect([L.w, L.h]).toEqual([3200, 3600]);
    expect([L.sheet.folds.cols, L.sheet.folds.rows]).toEqual([4, 4]);
    expect(L.scrap.w).toBe(200);
    expect(L.string.slack).toBe(100);
  });

  it("gives every string kind its drawings, even from an older look", () => {
    const L = normalizeLook({ ropes: { delve: { tex: "rope/red" } } });
    for (const k of ["delve", "rail", "path"]) expect(L.ropes[k].texs.length).toBeGreaterThan(0);
  });
});

describe("the board round-trips", () => {
  it("keeps ids and every placement field", () => {
    const B = normalizeBoard({
      scraps: { grip: { type: "landmark", lib: "grip", x: 100, y: 200, pinAt: { u: 0.2, v: -0.4 }, pinShow: true, pins: [{ u: 0.4, v: 0.4 }] } },
      links: { l1: { a: "grip", b: "grip2", kind: "rail", label: "Line", slack: 50, via: { t: 0.4, off: 30 }, aAt: { u: 0, v: 0.5 }, tagPinAt: { u: 0.3, v: 0 } } },
    });
    const s = B.scraps.grip;
    expect(s.pinAt).toEqual({ u: 0.2, v: -0.4 });
    expect(s.pinShow).toBe(true);
    expect(s.pins).toEqual([{ u: 0.4, v: 0.4 }]);
    const l = B.links.l1;
    expect([l.kind, l.label, l.slack]).toEqual(["rail", "Line", 50]);
    expect(l.via).toEqual({ t: 0.4, off: 30 });
    expect(l.aAt).toEqual({ u: 0, v: 0.5 });
    expect(l.tagPinAt).toEqual({ u: 0.3, v: 0 });
  });

  it("drops what can't be placed and clamps the rest", () => {
    const B = normalizeBoard({
      scraps: { bad: { x: "nope", y: 1 }, ok: { x: 1, y: 2, s: 99 }, tiny: { x: 1, y: 2, s: -4 } },
      links: { self: { a: "ok", b: "ok" }, l: { a: "ok", b: "x", slack: 9999, aAt: { u: 9, v: -9 } } },
    });
    expect(Object.keys(B.scraps)).toEqual(["ok", "tiny"]);
    // (no largest size; never nothing)
    expect(B.scraps.ok.s).toBe(99);
    expect(B.scraps.tiny.s).toBe(0.001);
    expect(Object.keys(B.links)).toEqual(["l"]);
    expect(B.links.l.slack).toBe(400);
    expect(B.links.l.aAt).toEqual({ u: 2, v: -2 });
  });
});

describe("a scrap on its paper", () => {
  const L = look();
  const scrap = normalizeBoard({ scraps: { grip: { type: "landmark", lib: "grip", x: 500, y: 600, r: 0 } } }).scraps.grip;
  const lay = scrapLayout(scrap, L, size, measure, L.library.grip);

  it("puts its text box at its place and the paper around it", () => {
    expect([lay.box.cx, lay.box.cy]).toEqual([500, 600]);
    expect(lay.paper.w).toBeGreaterThan(lay.box.w);
    expect(lay.paper.h).toBeGreaterThan(lay.box.h);
  });

  it("keeps its writing and its pin inside the text box", () => {
    const B = lay.box;
    const inBox = (p) => Math.abs(p.x - B.cx) <= B.w / 2 + 1 && Math.abs(p.y - B.cy) <= B.h / 2 + 1;
    for (const ln of lay.lines) expect(inBox(ln)).toBe(true);
    expect(inBox(lay.pin)).toBe(true);
  });

  it("puts a moved pin and added pins where the GM put them", () => {
    const moved = normalizeBoard({ scraps: { g: { lib: "grip", x: 500, y: 600, r: 0, pinAt: { u: 0.5, v: 0.5 }, pins: [{ u: -0.5, v: -0.5 }] } } }).scraps.g;
    const m = scrapLayout(moved, L, size, measure, L.library.grip);
    expect(m.pin.x).toBeCloseTo(500 + m.box.w / 2);
    expect(m.pin.y).toBeCloseTo(600 + m.box.h / 2);
    expect(m.pins).toHaveLength(1);
    expect(m.pins[0].x).toBeCloseTo(500 - m.box.w / 2);
  });
});

describe("strings", () => {
  const mid = (pts) => ({ x: pts[Math.floor(pts.length / 4) * 2], y: pts[Math.floor(pts.length / 4) * 2 + 1] });

  it("hang under gravity, more when level than when steep", () => {
    const level = stringPoints({ x: 0, y: 0 }, { x: 600, y: 0 }, { wander: 0 });
    const steep = stringPoints({ x: 0, y: 0 }, { x: 0, y: 600 }, { wander: 0 });
    const sagLevel = Math.max(...level.filter((_, i) => i % 2));
    const sagSteep = Math.max(...steep.filter((_, i) => i % 2 === 0).map(Math.abs));
    expect(sagLevel).toBeGreaterThan(40);
    expect(sagSteep).toBeLessThan(sagLevel);
  });

  it("pull taut with no slack", () => {
    const pts = stringPoints({ x: 0, y: 0 }, { x: 600, y: 0 }, { wander: 0, slack: 0 });
    for (let i = 1; i < pts.length; i += 2) expect(Math.abs(pts[i])).toBeLessThan(1e-6);
    expect(mid(pts).x).toBeGreaterThan(0);
  });

  it("place a junction from where it was dragged, and back", () => {
    const a = { x: 100, y: 100 };
    const b = { x: 700, y: 400 };
    const pt = { x: 350, y: 380 };
    const v = viaFrom(a, b, pt);
    const back = viaPoint(a, b, v);
    expect(back.x).toBeCloseTo(pt.x);
    expect(back.y).toBeCloseTo(pt.y);
  });
});

describe("the sheet's panels", () => {
  it("never put the same paper side by side", () => {
    const L = look({ sheet: { papers: ["tx/paper__portrait__a", "tx/paper__portrait__b", "tx/paper__portrait__c"] } });
    const P = sheetPanels(L);
    const cols = L.sheet.folds.cols;
    P.forEach((p, i) => {
      if (i % cols) expect(p.tex).not.toBe(P[i - 1].tex);
      if (i >= cols) expect(p.tex).not.toBe(P[i - cols].tex);
    });
  });

  it("show only each paper's solid region, evened toward one tone", () => {
    const L = look({ sheet: { papers: ["tx/paper__portrait__a", "tx/paper__portrait__b"], match: 100 } });
    const tones = { "tx/paper__portrait__a": [240, 230, 200], "tx/paper__portrait__b": [200, 190, 160] };
    const P = sheetPanels(L, (id) => tones[id], (id) => SIZES[id]?.safe);
    expect(P[0].src).toEqual([0.1, 0.1, 0.9, 0.9]);
    const a = P.find((p) => p.tex.endsWith("a")).gain;
    const b = P.find((p) => p.tex.endsWith("b")).gain;
    expect(a[0]).toBeLessThan(1);
    expect(b[0]).toBeGreaterThan(1);
  });
});

describe("what the GM and players see", () => {
  const L = look();
  const board = normalizeBoard({
    scraps: {
      grip: { lib: "grip", x: 300, y: 300 },
      sump: { lib: "sump", x: 900, y: 320 },
      lost: { lib: "grip", x: 600, y: 900, state: "hidden" },
      loose: { type: "note", text: "rent", x: 1200, y: 1200 },
    },
    links: {
      rail: { a: "grip", b: "sump", kind: "delve", label: "Gutter Run" },
      secret: { a: "sump", b: "lost", kind: "delve" },
    },
  });

  it("hides what is hidden, and every string touching it, from players", () => {
    const P = boardView(L, board, "player", size, measure);
    expect(P.scraps.map((s) => s.key).sort()).toEqual(["grip", "loose", "sump"]);
    expect(P.links.map((l) => l.id)).toEqual(["rail"]);
    const G = boardView(L, board, "gm", size, measure);
    expect(G.links.find((l) => l.id === "secret").look).toBe("ghost");
  });

  it("gives a named string a junction, and marks scraps its strings hold", () => {
    const V = boardView(L, board, "player", size, measure);
    const l = V.links.find((x) => x.id === "rail");
    expect(l.junction).toBeTruthy();
    expect(l.ends[0].tex).toBe("tx/fixtures__fixture_red_pushpin_long");
    expect(V.scraps.find((s) => s.key === "grip").tied).toBe(true);
    expect(V.scraps.find((s) => s.key === "loose").tied).toBeFalsy();
  });

  it("ties a string's ends on the scraps' text boxes", () => {
    const V = boardView(L, board, "gm", size, measure);
    const l = V.links.find((x) => x.id === "rail");
    const grip = V.scraps.find((s) => s.key === "grip").layout;
    expect(pointInPoly(l.ends[0], grip.hull)).toBe(true);
  });
});

describe("pins", () => {
  it("even out the pin families' sizes", () => {
    expect(pinScale("tx/fixtures__fixture_grey_tack_head_round")).toBeLessThan(1);
    expect(pinScale("tx/fixtures__unknown")).toBe(1);
  });
});

describe("a landmark's assembly (2026-10-02)", () => {
  const L = look();
  const lay = (key, extra = {}) => {
    const b = normalizeBoard({ scraps: { [key]: { lib: "grip", x: 500, y: 500, r: 0, ...extra } } });
    return scrapLayout(b.scraps[key], L, size, measure, L.library.grip);
  };
  const turnOf = (o) => o.clip.box.rot;

  it("is the same every time for the same scrap", () => {
    expect(JSON.stringify(lay("grip"))).toBe(JSON.stringify(lay("grip")));
  });

  it("is reshuffled by its seed, and nothing else moves", () => {
    const shapes = new Set();
    for (let seed = 0; seed < 12; seed++) {
      const o = lay("grip", { seed });
      shapes.add(JSON.stringify([o.clip.box, o.tapes.length, o.clipPins.length]));
      expect(o.box).toEqual(lay("grip").box);
    }
    expect(shapes.size).toBeGreaterThan(6);
  });

  it("keeps the clipping mostly upright, on the paper, held by tape or pins", () => {
    for (let seed = 0; seed < 40; seed++) {
      const o = lay("grip", { seed });
      expect(Math.abs(turnOf(o))).toBeLessThanOrEqual((6 * Math.PI) / 180 + 1e-9);
      expect(Math.abs(o.clip.box.cx - 500)).toBeLessThan(o.box.w / 2);
      expect(o.tapes.length + o.clipPins.length).toBeGreaterThan(0);
      if (o.fix === "pin") expect(o.clipPins.length).toBeGreaterThan(0);
    }
  });

  it("follows a fixed choice of tape or pin", () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(lay("grip", { seed, fix: "pin" }).clipPins.length).toBeGreaterThan(0);
      expect(lay("grip", { seed, fix: "tape" }).clipPins.length).toBe(0);
    }
  });
});

describe("round three's data (2026-10-02)", () => {
  const L = look();
  const view = (raw) => boardView(L, normalizeBoard(raw), "gm", size, measure);
  const two = { grip: { lib: "grip", x: 400, y: 400, r: 0 }, sump: { lib: "sump", x: 1400, y: 400, r: 0 } };

  it("keeps a string's joints and pulls; it runs through each joint", () => {
    const v = view({ scraps: two, links: { l1: { a: "grip", b: "sump", joints: [{ x: 900, y: 900 }], pulls: [null, { t: 0.5, u: 0, v: 0 }] } } });
    const l = v.links[0];
    expect(l.waypoints.map((w) => w.kind)).toEqual(["end", "joint", "end"]);
    expect(l.spans).toHaveLength(2);
    const at = l.spans[0].to;
    expect([l.points[2 * at], l.points[2 * at + 1]]).toEqual([900, 900]);
    // a span pulled to its own straight line runs (nearly) straight
    const S = l.spans[1], mx = l.points[2 * Math.round((S.from + S.to) / 2) + 1];
    expect(Math.abs(mx - (900 + l.ends[1].y) / 2)).toBeLessThan(25);
  });

  it("keeps the board's own pins, in a scrap (going with it) or loose, mostly upright", () => {
    const raw = { scraps: { ...two, grip: { ...two.grip, r: 40 } }, links: {}, pins: { p1: { tex: "tx/fixtures__fixture_grey_tack_small", on: "grip", at: { u: 0, v: 0 } }, p2: { tex: "tx/fixtures__fixture_grey_tack_small", x: 50, y: 60 } } };
    const v = view(raw);
    const [p1, p2] = v.pins;
    expect(p1).toMatchObject({ x: 400, y: 400, on: "grip" });
    expect(Math.abs(p1.rot)).toBeLessThan((40 * Math.PI) / 180 * 0.5);
    expect(p2).toMatchObject({ x: 50, y: 60, on: null });
    raw.scraps.grip.x = 700;
    expect(view(raw).pins[0].x).toBe(700);
  });

  it("writes each card in one of a few preset inks, and keeps the marker's layers", () => {
    const v = view({ scraps: { ...two, n1: { type: "note", text: "x", x: 900, y: 1500, ink: 2 }, w1: { type: "scrawl", text: "y", x: 900, y: 2000 } }, links: {}, marks: { ana: { m1: { c: 1, w: 8, pts: [1, 2, 3, 4] }, bad: { pts: [1] } } } });
    const inkOf = (k) => v.scraps.find((s) => s.key === k).layout.ink;
    expect(inkOf("n1")).toBe(L.ink.paper[2]);
    expect(L.ink.paper).toContain(inkOf("grip"));
    expect(L.ink.sheet).toContain(inkOf("w1"));
    expect(v.marks).toEqual({ ana: { m1: { c: 1, w: 8, pts: [1, 2, 3, 4] } } });
  });
});

describe("a string's pins (2026-10-02)", () => {
  it("come in three sizes, bigger the further the string runs", () => {
    const L = look();
    const w = (bx) => boardView(L, normalizeBoard({ scraps: {}, links: { l: { aPt: { x: 0, y: 0 }, bPt: { x: bx, y: 0 } } } }), "gm", size, measure).links[0].ends[0].w;
    const sizes = [w(300), w(500), w(1200), w(1400), w(2500), w(2900)];
    expect(sizes[0]).toBe(sizes[1]);
    expect(sizes[2]).toBe(sizes[3]);
    expect(sizes[4]).toBe(sizes[5]);
    expect(sizes[0]).toBeLessThan(sizes[2]);
    expect(sizes[2]).toBeLessThan(sizes[4]);
  });
});
