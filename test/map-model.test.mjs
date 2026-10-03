/**
 * The Heart map's pure half (src/map/model.js, 2026-10-02; the scrapbook
 * map the same day): the tuner's layout (look, depth gauge, art library)
 * merged with a scene's state (what the GM placed where), what the GM and a
 * player each see, state cycling, and the hand-drawn geometry (seeded, so
 * every client draws the same map).
 */

import { describe, it, expect } from "vitest";
import {
  normalizeLayout,
  buildMap,
  viewFor,
  nextState,
  depthAt,
  bandAt,
  inkAt,
  INK_TOP,
  INK_DEEP,
  DEFAULT_INK,
  wobbleAt,
  raggedAt,
  inkCurve,
  sketchPass,
  linkPoints,
  dashes,
  railTies,
  pathLength,
  blob,
  inkBlot,
  tornRect,
  wrapName,
  labelPlace,
  scrapFor,
  gaugeStrip,
  artBox,
  pointInPoly,
  nodeAt,
  linkAt,
  customKey,
  hasLink,
  libraryKeyFor,
  rng,
  hashSeed,
  NODE_SIZE,
} from "../src/map/model.js";

// a small layout in the tuner's export shape (docs/plans/heart-map.md)
const LAYOUT = {
  v: 2,
  size: { w: 1000, h: 2000 },
  gauge: {
    x: 60,
    marks: [
      { id: "t1", label: "Tier 1", sub: "The Undercity", y: 500 },
      { id: "t0", label: "Tier 0", y: 0 },
      { id: "heart", label: "The Heart", y: 1500 },
    ],
  },
  ink: { delve: "#ff0000" },
  library: {
    derelictus: { uuid: "Compendium.x.landmarks.Actor.aaa", name: "Derelictus", tier: "0", frame: { z: 120, x: 40, y: 50 } },
    grip: { uuid: "Compendium.x.landmarks.Actor.bbb", name: "Grip Station", tier: "1" },
    sump: { uuid: "Compendium.x.landmarks.Actor.ccc", name: "Sump Station", tier: "1", s: 0.5 },
  },
  links: [{ id: "bad", a: "grip", b: "grip" }],
};
const L = normalizeLayout(LAYOUT);
const PLACED = {
  nodes: {
    derelictus: { x: 500, y: 200, state: "known" },
    grip: { x: 300, y: 700, state: "hidden" },
    sump: { x: 700, y: 800, state: "rumoured" },
  },
  links: {
    c1: { a: "derelictus", b: "grip", kind: "path", state: "rumoured" },
    c2: { a: "grip", b: "sump", kind: "rail", state: "known" },
  },
};

describe("normalizeLayout", () => {
  it("returns null for nothing", () => {
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout("x")).toBeNull();
  });

  it("defaults to the small portrait map", () => {
    const E = normalizeLayout({});
    expect([E.w, E.h]).toEqual([2400, 3600]);
    expect(E.ink).toEqual(DEFAULT_INK);
    expect(E.board).toEqual({ img: null, w: 1200, o: 100 });
    expect(E.scraps).toEqual({ imgs: [], w: 900 });
  });

  it("sorts the gauge's tier marks and gives each its foot", () => {
    expect(L.gauge.marks.map((b) => b.id)).toEqual(["t0", "t1", "heart"]);
    expect(L.gauge.marks.map((b) => b.y1)).toEqual([500, 1500, 2000]);
    expect(L.gauge.marks[1].sub).toBe("The Undercity");
  });

  it("reads a v1 layout's bands as the gauge and its nodes as the library", () => {
    const v1 = normalizeLayout({ bands: [{ id: "t0", y: 0 }], nodes: { a: { uuid: "u", name: "A", x: 5, y: 5 } } });
    expect(v1.gauge.marks.map((m) => m.id)).toEqual(["t0"]);
    expect(v1.library.a).toMatchObject({ uuid: "u", name: "A", s: 1, frame: null });
  });

  it("keeps the library's framing and reads ink colours", () => {
    expect(L.library.derelictus.frame).toEqual({ z: 120, x: 40, y: 50 });
    expect(L.library.sump.s).toBe(0.5);
    expect(L.ink.delve).toBe(0xff0000);
    expect(L.ink.rail).toBe(DEFAULT_INK.rail);
    expect(L.links).toEqual([]);
  });
});

describe("buildMap", () => {
  it("starts empty: nothing is on the map until the scene places it", () => {
    expect(buildMap(L, {}).nodes).toEqual({});
  });

  it("places book landmarks where the scene says, with their framing", () => {
    const map = buildMap(L, PLACED);
    expect(Object.keys(map.nodes)).toEqual(["derelictus", "grip", "sump"]);
    expect(map.nodes.derelictus).toMatchObject({ x: 500, y: 200, state: "known", custom: false, tier: "0", frame: { z: 120, x: 40, y: 50 } });
    expect(map.nodes.sump.radius).toBe(NODE_SIZE / 4);
  });

  it("ignores a book entry with no position, and a custom one with no uuid", () => {
    const map = buildMap(L, { nodes: { grip: { state: "known" }, c9: { x: 1, y: 1 } } });
    expect(map.nodes).toEqual({});
  });

  it("adds the GM's own landmarks", () => {
    const map = buildMap(L, { nodes: { c1: { uuid: "Actor.mine", name: "My Den", x: 100, y: 900 } } });
    expect(map.nodes.c1).toMatchObject({ custom: true, state: "known", name: "My Den", frame: null });
  });

  it("pins a world copy and names through the resolver", () => {
    const resolve = (uuid) =>
      uuid === "Actor.world1" ? { name: "Grip (ours)" } : uuid === "Actor.d1" ? { name: "The Long Dark", resistance: 0, max: 8 } : null;
    const map = buildMap(L, {
      nodes: { grip: { x: 1, y: 1, actor: "Actor.world1" }, sump: { x: 2, y: 2 } },
      links: { c1: { a: "grip", b: "sump", kind: "delve", delve: "Actor.d1" } },
    }, resolve);
    expect(map.nodes.grip).toMatchObject({ name: "Grip (ours)", uuid: "Actor.world1", bookUuid: "Compendium.x.landmarks.Actor.bbb" });
    expect(map.links[0]).toMatchObject({ delveName: "The Long Dark", crossed: true, custom: true, state: "known" });
  });

  it("drops a link to a landmark that isn't placed", () => {
    const map = buildMap(L, { nodes: { grip: { x: 1, y: 1 } }, links: { c1: { a: "grip", b: "sump" } } });
    expect(map.links).toEqual([]);
  });
});

describe("viewFor", () => {
  const map = buildMap(L, PLACED);

  it("shows the GM everything, hidden things as ghosts", () => {
    const view = viewFor(map, "gm");
    expect(view.nodes.map((n) => [n.key, n.look])).toEqual([
      ["derelictus", "known"],
      ["grip", "ghost"],
      ["sump", "rumoured"],
    ]);
    expect(view.links.map((l) => [l.id, l.look])).toEqual([
      ["c1", "ghost"],
      ["c2", "ghost"],
    ]);
  });

  it("shows a player only what is rumoured or known, never a link to a hidden place", () => {
    const view = viewFor(map, "player");
    expect(view.nodes.map((n) => n.key)).toEqual(["derelictus", "sump"]);
    expect(view.links).toEqual([]);
  });

  it("gives every node its scrap and label, every link its line", () => {
    const view = viewFor(map, "gm");
    for (const n of view.nodes) {
      expect(n.scrap.pts.length).toBeGreaterThan(20);
      expect(n.place.lines.length).toBeGreaterThan(0);
    }
    for (const l of view.links) expect(l.points.length).toBeGreaterThan(8);
  });
});

describe("nextState", () => {
  it("cycles hidden, rumoured, known, both ways", () => {
    expect(nextState("hidden")).toBe("rumoured");
    expect(nextState("rumoured")).toBe("known");
    expect(nextState("known")).toBe("hidden");
    expect(nextState("hidden", -1)).toBe("known");
    expect(nextState("nonsense")).toBe("rumoured");
  });
});

describe("depth", () => {
  it("runs from 0 at the top to 1 at the foot", () => {
    expect(depthAt(0, L)).toBe(0);
    expect(depthAt(1000, L)).toBe(0.5);
    expect(depthAt(5000, L)).toBe(1);
  });

  it("finds the tier mark at a height", () => {
    expect(bandAt(10, L).id).toBe("t0");
    expect(bandAt(1999, L).id).toBe("heart");
  });

  it("reddens the ink, shakes the hand, and rags the paper with depth", () => {
    expect(inkAt(0)).toBe(INK_TOP);
    expect(inkAt(1)).toBe(INK_DEEP);
    expect(wobbleAt(1)).toBeGreaterThan(wobbleAt(0.5));
    expect(raggedAt(1)).toBeGreaterThan(raggedAt(0));
  });
});

describe("the hand-drawn geometry", () => {
  it("draws the same line for the same seed, pinned to its ends", () => {
    const a = inkCurve({ x: 0, y: 0 }, { x: 500, y: 0 }, { amp: 10, seed: "s" });
    expect(a).toEqual(inkCurve({ x: 0, y: 0 }, { x: 500, y: 0 }, { amp: 10, seed: "s" }));
    expect(a).not.toEqual(inkCurve({ x: 0, y: 0 }, { x: 500, y: 0 }, { amp: 10, seed: "t" }));
    expect(a[0]).toBeCloseTo(0);
    expect(a[a.length - 2]).toBeCloseTo(500);
  });

  it("goes over a line a second time, close to it", () => {
    const line = inkCurve({ x: 0, y: 0 }, { x: 400, y: 0 }, { seed: "s" });
    const pass = sketchPass(line, "s", 2);
    expect(pass.length).toBe(line.length);
    for (let i = 0; i < line.length; i++) expect(Math.abs(pass[i] - line[i])).toBeLessThan(6);
    expect(pass).not.toEqual(line);
  });

  it("sags a link downward by default, whichever way it runs", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    const mid = (p) => p[Math.floor(p.length / 4) * 2 + 1];
    expect(mid(linkPoints({ id: "x", depth: 0 }, a, b))).toBeGreaterThan(20);
    expect(mid(linkPoints({ id: "x", depth: 0 }, b, a))).toBeGreaterThan(20);
    expect(mid(linkPoints({ id: "x", depth: 0, bend: -100 }, a, b))).toBeLessThan(0);
  });

  it("cuts dashes and lays askew rail ties along a line", () => {
    const line = [0, 0, 320, 0];
    expect(pathLength(line)).toBe(320);
    expect(dashes(line, 20, 12).length).toBe(10);
    const ties = railTies(line, 32, 10);
    expect(ties.length).toBe(10);
    for (const t of ties) expect(Math.hypot(t[2] - t[0], t[3] - t[1])).toBeGreaterThan(15);
  });

  it("tears a circle close to its radius, and splatters a blot", () => {
    const pts = blob(0, 0, 100, { rough: 0.05, n: 40 });
    for (let i = 0; i < pts.length; i += 2) expect(Math.hypot(pts[i], pts[i + 1])).toBeLessThan(110);
    expect(inkBlot({ key: "k", x: 0, y: 0, radius: 100 }).length).toBeGreaterThanOrEqual(3);
  });

  it("tears a rectangle around its box", () => {
    const pts = tornRect(0, 0, 200, 100, 0, { jag: 4 });
    expect(pts.length).toBeGreaterThan(40);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.abs(pts[i])).toBeLessThan(100 + 5);
      expect(Math.abs(pts[i + 1])).toBeLessThan(50 + 5);
    }
    expect(pointInPoly({ x: 0, y: 0 }, pts)).toBe(true);
    expect(pointInPoly({ x: 300, y: 0 }, pts)).toBe(false);
  });

  it("wraps a long name", () => {
    expect(wrapName("Sonderwood - The Temple of Community", 34, 300).length).toBeGreaterThan(1);
    expect(wrapName("Grip", 34, 300)).toEqual(["Grip"]);
  });

  it("sizes a scrap to hold the art and the name, with a pin or tape", () => {
    const node = { key: "grip", name: "Grip Station", x: 500, y: 500, radius: 100, depth: 0.2, look: "known" };
    const place = labelPlace(node);
    expect(place.y).toBe(614);
    const scrap = scrapFor({ ...node, place });
    expect(scrap.w).toBeGreaterThanOrEqual(256);
    expect(scrap.cy).toBeGreaterThan(500);
    expect(["pin", "tape"]).toContain(scrap.fix.kind);
    expect(pointInPoly({ x: 500, y: 500 }, scrap.pts)).toBe(true);
    expect(pointInPoly({ x: 500, y: place.y + 10 }, scrap.pts)).toBe(true);
    const note = scrapFor({ ...node, look: "rumoured" });
    expect(note.w).toBeLessThan(scrap.w + 1);
  });

  it("rules the depth gauge with a tick at each tier", () => {
    const g = gaugeStrip(L);
    expect(g.ticks.map((t) => t.id)).toEqual(["t0", "t1", "heart"]);
    expect(g.ticks[0].y).toBe(g.top + 30);
    expect(g.pts.length).toBeGreaterThan(40);
  });

  it("frames art in a node's circle", () => {
    const node = { x: 100, y: 100, radius: 50, frame: { z: 100, x: 50, y: 50 } };
    expect(artBox(node, 2)).toEqual({ x: 0, y: 50, w: 200, h: 100 });
  });

  it("is deterministic across runs", () => {
    expect(hashSeed("heart")).toBe(hashSeed("heart"));
    const r1 = rng("x");
    const r2 = rng("x");
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe("hit tests and edits", () => {
  const view = viewFor(buildMap(L, PLACED), "gm");

  it("finds the scrap under a point", () => {
    expect(nodeAt(view, { x: 305, y: 700 }).key).toBe("grip");
    expect(nodeAt(view, { x: 990, y: 1990 })).toBeNull();
  });

  it("finds the link under a point", () => {
    const l = view.links.find((x) => x.id === "c2");
    const i = Math.floor(l.points.length / 4) * 2;
    expect(linkAt(view, { x: l.points[i], y: l.points[i + 1] }).id).toBe("c2");
  });

  it("makes fresh keys, spots duplicate links, and finds a landmark's library entry", () => {
    expect(customKey("c", { c1: {}, c2: {} })).toBe("c3");
    expect(hasLink(buildMap(L, PLACED), "sump", "grip")).toBe(true);
    expect(libraryKeyFor(L, { uuid: "Compendium.x.landmarks.Actor.bbb" })).toBe("grip");
    expect(libraryKeyFor(L, { uuid: "Actor.w", source: "Compendium.x.landmarks.Actor.ccc" })).toBe("sump");
    expect(libraryKeyFor(L, { uuid: "Actor.w", name: "Derelictus" })).toBe("derelictus");
    expect(libraryKeyFor(L, { uuid: "Actor.other", name: "Elsewhere" })).toBeNull();
  });
});
