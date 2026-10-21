/**
 * The Heart map's editing controls (src/map/scrapboard/controls.js,
 * 2026-10-02): the one copy of what a press, Ctrl+press, box, drag, wheel,
 * and double-click do, run by both the Foundry map scene and the Heart Map
 * Board mock. A press on a selected scrap keeps the selection, so a drag
 * moves all of it (Luke, 2026-10-02: "multi-select doesn't move together").
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, removalOf, migrateLabels, revealOf, scrapLayout, tidyBoard } from "../src/map/scrapboard/model.js";
import { BoardControls, GRAB, applyPatch, mayMove, toolsFor } from "../src/map/scrapboard/controls.js";

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
const RAW = {
  scraps: {
    grip: { lib: "grip", x: 300, y: 300, r: 0 },
    sump: { lib: "sump", x: 1300, y: 300, r: 0 },
    mine: { type: "note", text: "mine", x: 800, y: 1200, r: 0, author: "ana" },
    theirs: { type: "note", text: "theirs", x: 1400, y: 1200, r: 0, author: "bo" },
  },
  links: {},
};
const host = (user, raw = RAW) => {
  const view = boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure);
  return { view: () => view, painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => raw };
};
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false };
const at = (c, key) => c.host.view().scraps.find((s) => s.key === key);

describe("selecting", () => {
  it("selects one scrap; Ctrl adds and takes away; the empty board clears", () => {
    const c = new BoardControls(host(GM));
    c.press("move", { x: 300, y: 300 });
    expect([...c.selection]).toEqual(["grip"]);
    c.press("move", { x: 1300, y: 300 }, { ctrl: true });
    expect([...c.selection].sort()).toEqual(["grip", "sump"]);
    c.press("move", { x: 1300, y: 300 }, { ctrl: true });
    expect([...c.selection]).toEqual(["grip"]);
    c.press("move", { x: 2900, y: 2900 });
    expect(c.selection.size).toBe(0);
  });

  it("keeps the selection when a selected scrap is pressed, so a drag moves all of it", () => {
    const c = new BoardControls(host(GM));
    c.press("move", { x: 300, y: 300 });
    c.press("move", { x: 1300, y: 300 }, { ctrl: true });
    // the press Foundry sends before a drag begins
    c.press("move", { x: 300, y: 300 });
    expect(c.selection.size).toBe(2);
    expect(c.dragStart({ x: 300, y: 300 })).toBe("move");
    const patch = c.dragMove({ x: 350, y: 320 });
    expect(patch.scraps.grip).toEqual({ x: 350, y: 320 });
    expect(patch.scraps.sump).toEqual({ x: 1350, y: 320 });
    expect(c.dragEnd()).toEqual(patch);
  });

  it("selects what a box takes in", () => {
    const c = new BoardControls(host(GM));
    expect(c.dragStart({ x: 0, y: 0 })).toBe("box");
    c.dragMove({ x: 1500, y: 600 });
    expect(c.marks().box).toEqual({ x0: 0, y0: 0, x1: 1500, y1: 600 });
    expect(c.dragEnd()).toEqual({ select: true });
    expect([...c.selection].sort()).toEqual(["grip", "sump"]);
  });
});

describe("sizing and turning (the GM's)", () => {
  it("sizes the selection by its corner square and turns it by its corner circle", () => {
    const c = new BoardControls(host(GM));
    c.press("move", { x: 300, y: 300 });
    const b = c.bounds();
    expect(c.dragStart(b.handle)).toBe("size");
    const grow = c.dragMove({ x: b.c.x + (b.handle.x - b.c.x) * 2, y: b.c.y + (b.handle.y - b.c.y) * 2 });
    expect(grow.scraps.grip.s).toBeCloseTo(2, 1);
    c.dragEnd();
    expect(c.dragStart(b.rotor)).toBe("turn");
    const turn = c.dragMove({ x: b.c.x + (b.rotor.y - b.c.y) * -1, y: b.c.y + (b.rotor.x - b.c.x) });
    expect(Math.abs(turn.scraps.grip.r)).toBeGreaterThan(45);
  });

  it("sizes without a largest size, and never below two reticles across at the closest zoom", () => {
    const c = new BoardControls({ ...host(GM), finest: () => 1 / 3 });
    c.press("move", { x: 300, y: 300 });
    const b = c.bounds();
    const P = at(c, "grip").layout.paper;
    expect(c.dragStart(b.handle)).toBe("size");
    const huge = c.dragMove({ x: b.c.x + (b.handle.x - b.c.x) * 12, y: b.c.y + (b.handle.y - b.c.y) * 12 });
    expect(huge.scraps.grip.s).toBeGreaterThan(10);
    const tiny = c.dragMove({ x: b.c.x + 0.01, y: b.c.y + 0.01 });
    // (GRAB screen px at 3x zoom, on the paper's shorter side)
    expect(tiny.scraps.grip.s * Math.min(P.w, P.h) * 3).toBeCloseTo(GRAB, 0);
  });

  it("turns with Ctrl+wheel and sizes with Shift+wheel", () => {
    const c = new BoardControls(host(GM));
    expect(c.wheel(1, { ctrl: true })).toBeNull();
    c.press("move", { x: 300, y: 300 });
    expect(c.wheel(1, { ctrl: true })).toEqual({ scraps: { grip: { r: 5 } } });
    expect(c.wheel(-1, { shift: true })).toEqual({ scraps: { grip: { s: 1.05 } } });
    expect(c.wheel(1, {})).toBeNull();
  });
});

describe("players", () => {
  it("select and move only their own notes", () => {
    const c = new BoardControls(host(ANA));
    c.press("move", { x: 300, y: 300 });
    expect(c.selection.size).toBe(0);
    c.press("move", { x: 1400, y: 1200 });
    expect(c.selection.size).toBe(0);
    c.press("move", { x: 800, y: 1200 });
    expect([...c.selection]).toEqual(["mine"]);
    c.dragStart({ x: 0, y: 0 });
    c.dragMove({ x: 3000, y: 3000 });
    c.dragEnd();
    expect([...c.selection]).toEqual(["mine"]);
    expect(c.wheel(1, { ctrl: true })).toBeNull();
    expect(c.marks().handle).toBeNull();
  });

  it("add notes and writing, and edit only their own", () => {
    const c = new BoardControls(host(ANA));
    expect(c.press("note", { x: 2000, y: 2000 })).toEqual({ do: "add", type: "note", at: { x: 2000, y: 2000 } });
    expect(c.press("write", { x: 2000, y: 2000 })).toMatchObject({ do: "add", type: "scrawl" });
    expect(c.press("note", { x: 800, y: 1200 })).toEqual({ do: "edit", key: "mine" });
    expect(c.press("note", { x: 1400, y: 1200 })).toBeNull();
  });
});

describe("the GM's other tools", () => {
  it("reveal, string, and erase", () => {
    const c = new BoardControls(host(GM));
    expect(c.press("reveal", { x: 300, y: 300 })).toMatchObject({ do: "reveal", dir: 1 });
    expect(c.press("reveal", { x: 300, y: 300 }, { right: true })).toMatchObject({ do: "reveal", dir: -1 });
    expect(c.press("string", { x: 300, y: 300 })).toEqual({ do: "select" });
    expect(c.marks().from).toBeTruthy();
    expect(c.press("string", { x: 1300, y: 300 })).toMatchObject({ do: "string", a: "grip", aPt: null, b: "sump", bPt: null });
    expect(c.press("erase", { x: 1300, y: 300 })).toMatchObject({ do: "erase" });
  });

  it("a patch applies to the board's JSON", () => {
    const b = structuredClone(RAW);
    applyPatch(b, { scraps: { grip: { x: 1, r: 9 } } });
    expect(b.scraps.grip).toMatchObject({ x: 1, y: 300, r: 9 });
    expect(mayMove(at(new BoardControls(host(GM)), "grip"), GM)).toBe(true);
  });
});

describe("strings with loose ends (Luke, 2026-10-02: drag them off places and onto them freely)", () => {
  const RAW2 = { ...RAW, links: { l1: { a: "grip", b: "sump", kind: "delve" } } };

  it("run from where the first click was to where the second was, places or not", () => {
    const c = new BoardControls(host(GM));
    expect(c.press("string", { x: 2600, y: 2600 })).toEqual({ do: "select" });
    expect(c.marks().fromPt).toEqual({ x: 2600, y: 2600 });
    expect(c.marks().from).toBeNull();
    expect(c.press("string", { x: 300, y: 300 })).toMatchObject({ do: "string", a: null, aPt: { x: 2600, y: 2600 }, b: "grip", bPt: null });
    c.press("string", { x: 300, y: 300 });
    expect(c.press("string", { x: 2000, y: 3000 })).toMatchObject({ do: "string", a: "grip", aPt: null, b: null, bPt: { x: 2000, y: 3000 } });
  });

  it("come loose when an end is dragged off its place, and tie on where they're dropped", () => {
    const c = new BoardControls(host(GM, RAW2));
    const l = c.host.view().links[0];
    const end = l.ends[1];
    c.press("move", end);
    expect(c.dragStart(end)).toBe("piece");
    const off = c.dragMove({ x: 2500, y: 2500 });
    expect(off.link).toEqual(["l1", { b: null, bAt: null, bPt: { x: 2500, y: 2500 } }]);
    const on = c.dragMove({ x: 800, y: 1200 });
    expect(on.link[1]).toMatchObject({ b: "mine", bPt: null });
    expect(on.link[1].bAt).toBeTruthy();
    // never onto its own other end's place
    expect(c.dragMove({ x: 300, y: 300 }).link[1]).toMatchObject({ b: null });
  });

  it("stay on the board with a loose end, which stays put", () => {
    const b = { ...RAW, links: { l1: { a: "grip", bPt: { x: 2000, y: 2000 } } } };
    const v = host(GM, b).view();
    expect(v.links).toHaveLength(1);
    expect(v.links[0].ends[1]).toMatchObject({ x: 2000, y: 2000 });
    const moved = host(GM, applyPatch(structuredClone(b), { scraps: { grip: { x: 900 } } })).view();
    expect(moved.links[0].ends[1]).toMatchObject({ x: 2000, y: 2000 });
    expect(moved.links[0].ends[0].x).toBeGreaterThan(v.links[0].ends[0].x);
  });
});

describe("round three (Luke, 2026-10-02): strings pulled and jointed, pins, the marker, players' boards", () => {
  const W = { ...RAW, scraps: { ...RAW.scraps, hidden: { lib: "sump", x: 2600, y: 300, r: 0, state: "hidden" } }, links: { l1: { a: "grip", b: "sump" }, l2: { a: "sump", b: "hidden" } } };
  const live = (user, raw) => {
    // a host whose board a drag changes as it goes (as both editors do)
    const box = { raw: structuredClone(raw) };
    const h = {
      view: () => boardView(look, normalizeBoard(box.raw), user.isGM ? "gm" : "player", size, measure),
      painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => box.raw,
    };
    return { c: new BoardControls(h), box };
  };
  const mid = (c, id) => { const l = c.host.view().links.find((x) => x.id === id); const n = l.points.length / 2; return { x: l.points[2 * Math.floor(n / 2)], y: l.points[2 * Math.floor(n / 2) + 1] }; };

  it("Ctrl+drag pins one joint into a string, however far it is dragged", () => {
    const { c, box } = live(GM, W);
    const p = mid(c, "l1");
    expect(c.dragStart(p, { ctrl: true })).toBe("joint");
    for (const dy of [20, 40, 60]) applyPatch(box.raw, c.dragMove({ x: p.x, y: p.y + dy }));
    // (a pin of its own, as every joint is, one however far it went)
    const [j] = box.raw.links.l1.joints;
    expect(box.raw.links.l1.joints).toEqual([{ pin: j.pin }]);
    expect(Object.keys(box.raw.pins ?? {}).filter((id) => id === j.pin)).toHaveLength(1);
    expect(box.raw.pins[j.pin]).toMatchObject({ x: Math.round(p.x), y: Math.round(p.y + 60) });
    const l = c.host.view().links.find((x) => x.id === "l1");
    expect(l.spans).toHaveLength(2);
    expect(l.joints).toHaveLength(1);
    // and Erase takes it out again
    // (and its pin with it: no loose pin left where it was)
    const a = c.press("erase", l.joints[0]);
    expect(a).toMatchObject({ do: "remove", what: { pins: [j.pin] } });
    const r = removalOf(box.raw, a.what);
    applyPatch(box.raw, { pins: Object.fromEntries(r.pins.map((id) => [id, null])), links: r.edits });
    expect(box.raw.links.l1.joints).toEqual([]);
    expect(box.raw.pins?.[j.pin]).toBeUndefined();
  });

  it("Alt+drag reshapes a span through the point it was dragged to", () => {
    const { c, box } = live(GM, W);
    const p = mid(c, "l1");
    expect(c.dragStart(p, { alt: true })).toBe("pull");
    applyPatch(box.raw, c.dragMove({ x: p.x, y: p.y - 300 }));
    applyPatch(box.raw, c.dragMove({ x: p.x, y: p.y - 400 }));
    const l = c.host.view().links.find((x) => x.id === "l1");
    expect(box.raw.links.l1.pulls[0]).toBeTruthy();
    // the curve runs (near enough) through where it was let go
    const near = Math.min(...Array.from({ length: l.points.length / 2 }, (_, i) => Math.hypot(l.points[2 * i] - p.x, l.points[2 * i + 1] - (p.y - 400))));
    expect(near).toBeLessThan(40);
  });

  it("Reveal draws a string or hides it, but not one to a hidden place", () => {
    const { c } = live(GM, W);
    expect(c.press("reveal", mid(c, "l1"))).toMatchObject({ do: "reveal", to: "hidden" });
    // (hidden, it may stay so; drawn, it may not be, while its place is hidden: 2026-10-06)
    expect(c.press("reveal", mid(c, "l2"))).toMatchObject({ do: "reveal", to: "hidden" });
    const { c: c2 } = live(GM, { ...W, links: { ...W.links, l2: { ...W.links.l2, state: "hidden" } } });
    expect(c2.press("reveal", mid(c2, "l2"))).toEqual({ do: "refuse", why: "hidden-place" });
  });

  it("Pin: a click asks for one (Ctrl: the last), in the scrap under it or loose; a drag carries it off or on", () => {
    const { c, box } = live(GM, W);
    expect(c.press("pin", { x: 2000, y: 2000 })).toEqual({ do: "pin", at: { x: 2000, y: 2000 }, on: null, uv: null, quick: false });
    expect(c.press("pin", { x: 800, y: 1200 }, { ctrl: true })).toMatchObject({ do: "pin", on: "mine", quick: true });
    box.raw.pins = { pin1: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } };
    expect(c.dragStart({ x: 2000, y: 2000 })).toBe("piece");
    applyPatch(box.raw, c.dragMove({ x: 800, y: 1200 }));
    expect(box.raw.pins.pin1).toMatchObject({ on: "mine", x: null });
    const v = c.host.view();
    expect(v.pins[0].on).toBe("mine");
  });

  it("the marker draws a stroke, and Shift+drag rubs out what the user may", () => {
    const { c, box } = live(ANA, W);
    expect(c.dragStart({ x: 100, y: 3000 }, { tool: "mark" })).toBe("mark");
    c.dragMove({ x: 140, y: 3010 });
    c.dragMove({ x: 200, y: 3030 });
    const a = c.dragEnd();
    expect(a.do).toBe("mark");
    box.raw.marks = { ana: { m1: { c: 0, w: 6, pts: a.pts } }, gm: { m1: { c: 1, w: 6, pts: [150, 2990, 150, 3060] } } };
    expect(c.dragStart({ x: 150, y: 2980 }, { tool: "mark", shift: true })).toBe("unmark");
    c.dragMove({ x: 150, y: 3060 });
    expect(c.dragEnd()).toEqual({ do: "unmark", strokes: [["ana", "m1"]] });
  });

  it("a players' board's owners edit notes and strings, never places, and never reveal", () => {
    const OWNER = { id: "ana", isGM: false, owner: true };
    expect(toolsFor(OWNER)).not.toContain("reveal");
    expect(toolsFor(OWNER)).toContain("pin");
    expect(mayMove({ type: "note", author: "bo" }, OWNER)).toBe(true);
    expect(mayMove({ type: "landmark" }, OWNER)).toBe(false);
    const { c } = live(OWNER, W);
    expect(c.press("reveal", { x: 300, y: 300 })).toBeNull();
  });

  it("a selected card's pieces have handles; one dragged moves on its card", () => {
    const { c, box } = live(GM, W);
    c.press("move", { x: 300, y: 300 });
    const parts = c.marks().parts;
    expect(parts.map((p) => p.id)).toContain("clip");
    const clip = parts.find((p) => p.id === "clip");
    expect(c.dragStart(clip)).toBe("part");
    applyPatch(box.raw, c.dragMove({ x: clip.x + 20, y: clip.y }));
    expect(box.raw.scraps.grip.parts.clip).toBeTruthy();
    expect(c.host.view().scraps.find((s) => s.key === "grip").layout.clip.box.cx).toBeCloseTo(clip.x + 20, 0);
  });

  it("String: a press and drag runs from just where it was pressed to where it lets go", () => {
    const { c } = live(GM, W);
    c.press("string", { x: 310, y: 290 });
    expect(c.dragStart({ x: 310, y: 290 }, { tool: "string" })).toBe("string");
    c.dragMove({ x: 1500, y: 2400 });
    expect(c.marks().line).toEqual([{ x: 310, y: 290 }, { x: 1500, y: 2400 }]);
    c.dragMove({ x: 2000, y: 2400 });
    // (the start stays put while it is dragged)
    expect(c.marks().line[0]).toEqual({ x: 310, y: 290 });
    const a = c.dragEnd();
    expect(a).toMatchObject({ do: "string", a: "grip", aPt: null, b: null, bPt: { x: 2000, y: 2400 }, quick: false });
    // tied on its scrap just where it was pressed
    const v = live(GM, { ...W, links: { n: { a: "grip", aAt: a.aAt, bPt: a.bPt } } }).c.host.view();
    expect(v.links[0].ends[0].x).toBeCloseTo(310, 0);
    expect(v.links[0].ends[0].y).toBeCloseTo(290, 0);
  });

  it("the reticle catches a pin within reach, and a press there takes it", () => {
    const { c, box } = live(GM, { ...W, pins: { p1: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } } });
    c.hover({ x: 2012, y: 2010 }, "move");
    expect(c.grab).toMatchObject({ x: 2000, y: 2000, key: "pin:p1" });
    expect(c.marks().grab.locked).toBe(false);
    c.grab.since -= 200;
    expect(c.marks().grab.locked).toBe(true);
    // once caught, a press within reach selects it; a drag carries it
    c.press("move", { x: 2012, y: 2010 });
    expect([...c.pins]).toEqual(["p1"]);
    expect(c.dragStart({ x: 2012, y: 2010 })).toBe("piece");
    applyPatch(box.raw, c.dragMove({ x: 2100, y: 2000 }));
    expect(box.raw.pins.p1).toMatchObject({ x: 2100, y: 2000 });
  });

  it("Ctrl+drag from a pin runs a new string from it, moving nothing", () => {
    const { c, box } = live(GM, { ...W, pins: { p1: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } } });
    expect(c.dragStart({ x: 2000, y: 2000 }, { ctrl: true })).toBe("string");
    c.dragMove({ x: 2500, y: 2600 });
    const a = c.dragEnd();
    // (it shares the pin: one pin, two strings)
    expect(a).toMatchObject({ do: "string", a: null, aPt: null, aPin: "p1", b: null, bPt: { x: 2500, y: 2600 }, quick: true, prep: null });
    expect(box.raw.pins.p1).toMatchObject({ x: 2000, y: 2000 });
    // from a string's end on a place: tied to that place, the kind it came from
    const end = c.host.view().links.find((l) => l.id === "l1").ends[1];
    c.dragStart(end, { ctrl: true });
    c.dragMove({ x: 1400, y: 2600 });
    // (the end becomes a pin of the board's own in its place, which both share)
    const b = c.dragEnd();
    expect(b).toMatchObject({ a: null, quick: true, kind: "delve" });
    expect(b.prep.pins[b.aPin]).toMatchObject({ on: "sump" });
    expect(b.prep.links.l1).toMatchObject({ bPin: b.aPin, b: null });
  });

  it("a box takes pins, and strings whose pins are all inside; they move together", () => {
    const raw = { ...W, pins: { p1: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } }, links: { ...W.links, l3: { aPt: { x: 1900, y: 1900 }, bPt: { x: 2300, y: 2100 }, joints: [{ x: 2100, y: 2200 }] } } };
    const { c, box } = live(GM, raw);
    c.dragStart({ x: 1800, y: 1800 });
    c.dragMove({ x: 2500, y: 2500 });
    c.dragEnd();
    expect([...c.pins]).toEqual(["p1"]);
    expect([...c.links]).toEqual(["l3"]);
    expect(c.selection.size).toBe(0);
    // a drag on any of it moves all of it
    expect(c.dragStart({ x: 2000, y: 2000 })).toBe("move");
    applyPatch(box.raw, c.dragMove({ x: 2100, y: 2050 }));
    expect(box.raw.pins.p1).toMatchObject({ x: 2100, y: 2050 });
    expect(box.raw.links.l3).toMatchObject({ aPt: { x: 2000, y: 1950 }, bPt: { x: 2400, y: 2150 }, joints: [{ x: 2200, y: 2250 }] });
    expect(c.removal()).toEqual({ scraps: [], pins: ["p1"], links: ["l3"], cards: [] });
  });

  it("a selected card's writing has a handle of its own", () => {
    const { c, box } = live(GM, W);
    c.press("move", { x: 800, y: 1200 });
    const t = c.marks().parts.find((p) => p.id === "text");
    expect(t).toBeTruthy();
    c.dragStart(t);
    applyPatch(box.raw, c.dragMove({ x: t.x, y: t.y + 20 }));
    const after = c.host.view().scraps.find((s) => s.key === "mine").layout.parts.find((p) => p.id === "text");
    expect(after.y).toBeCloseTo(t.y + 20, 0);
  });

  it("the grab reticle sits on a string under the pointer", () => {
    const { c } = live(GM, W);
    const p = mid(c, "l1");
    expect(c.hover({ x: p.x, y: p.y + 3 }, "move")).toBe(true);
    expect(c.grab).toBeTruthy();
    expect(Math.hypot(c.grab.x - p.x, c.grab.y - p.y)).toBeLessThan(6);
  });
});

describe("round six (Luke, 2026-10-02): shared pins, name tags as notes, pieces alone, two states", () => {
  const W6 = { ...RAW, links: { l1: { a: "grip", b: "sump", kind: "delve", joints: [{ x: 800, y: 700 }] } } };
  const live6 = (user, raw) => {
    const box = { raw: structuredClone(raw) };
    const h = {
      view: () => boardView(look, normalizeBoard(box.raw), user.isGM ? "gm" : "player", size, measure),
      painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => box.raw,
    };
    return { c: new BoardControls(h), box };
  };

  it("Ctrl+drag from a joint makes it a pin both strings share, not a second pin", () => {
    const { c, box } = live6(GM, W6);
    const j = c.host.view().links[0].joints[0];
    expect(c.dragStart(j, { ctrl: true })).toBe("string");
    c.dragMove({ x: 1500, y: 1500 });
    const a = c.dragEnd();
    expect(a.aPin).toBeTruthy();
    applyPatch(box.raw, a.prep);
    box.raw.links.n = { kind: "delve", aPin: a.aPin, bPt: a.bPt };
    const v = c.host.view();
    expect(box.raw.links.l1.joints[0]).toEqual({ pin: a.aPin });
    // one pin, both strings through it, their own pins not drawn there
    expect(v.pins.map((p) => p.id)).toEqual([a.aPin]);
    expect(v.links.find((l) => l.id === "l1").joints[0].shared).toBe(a.aPin);
    expect(v.links.find((l) => l.id === "n").ends[0].shared).toBe(a.aPin);
    expect(v.pins[0].pulls.length).toBe(3);
    // the pin moved: both strings follow
    applyPatch(box.raw, { pins: { [a.aPin]: { x: 900, y: 760 } } });
    expect(c.host.view().links.find((l) => l.id === "n").ends[0]).toMatchObject({ x: 900, y: 760 });
  });

  it("taking a pin off takes the strings it ends, and lets go of joints it held", () => {
    const raw = { scraps: RAW.scraps, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 900, y: 900 } }, links: { x: { a: "grip", bPin: "p" }, y: { a: "grip", b: "sump", joints: [{ pin: "p" }] } } };
    const r = removalOf(raw, { pins: ["p"] });
    expect(r.links).toEqual(["x"]);
    expect(r.edits.y.joints).toEqual([]);
    // a scrap takes its pins with it
    const r2 = removalOf({ ...raw, pins: { q: { tex: "t", on: "grip", at: { u: 0, v: 0 } } } }, { scraps: ["grip"] });
    expect(r2.pins).toEqual(["q"]);
  });

  it("a name is a tag: a pin in the string, a note, and a thread; an older board's tags become just that", () => {
    const raw = { scraps: RAW.scraps, links: { l1: { a: "grip", b: "sump", kind: "delve", label: "Rust Chute", tagDx: 10, tagDy: 90 } } };
    const { board: b, changed } = migrateLabels(raw, look, size, measure);
    expect(changed).toBe(true);
    expect(b.links.l1.label).toBeUndefined();
    const v = boardView(look, normalizeBoard(b), "gm", size, measure);
    const l = v.links.find((x) => x.id === "l1");
    expect(l.named).toBe("Rust Chute");
    expect(b.scraps[l.nameNote]).toMatchObject({ type: "note", tag: true, text: "Rust Chute" });
    // cut the thread: just a note, and the string has no name
    const r = removalOf(b, { links: l.threads });
    for (const id of r.links) delete b.links[id];
    const v2 = boardView(look, normalizeBoard(b), "gm", size, measure);
    expect(v2.links.find((x) => x.id === "l1").named).toBeUndefined();
    expect(v2.scraps.some((s) => s.key === l.nameNote)).toBe(true);
  });

  it("only a place has three states; a note, a pin, and a string are shown or not", () => {
    expect(revealOf({ type: "landmark", state: "hidden" })).toBe("rumoured");
    expect(revealOf({ type: "note", state: "hidden" })).toBe("known");
    expect(revealOf({ type: "note", state: "known" })).toBe("hidden");
    expect(normalizeBoard({ scraps: { n: { type: "note", x: 0, y: 0, state: "rumoured" } } }).scraps.n.state).toBe("known");
    const { c } = live6(GM, { ...RAW, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } } });
    expect(c.press("reveal", { x: 2000, y: 2000 })).toMatchObject({ do: "reveal", to: "hidden" });
  });

  it("a card's piece, pressed, is selected alone; it turns and sizes by itself", () => {
    const { c, box } = live6(GM, W6);
    c.press("move", { x: 300, y: 300 });
    const clip = c.marks().parts.find((p) => p.id === "clip");
    c.press("move", clip);
    expect(c.part).toEqual({ key: "grip", id: "clip" });
    expect(c.selection.size).toBe(0);
    expect(c.marks().partBox).toHaveLength(8);
    applyPatch(box.raw, c.wheel(1, { ctrl: true }));
    applyPatch(box.raw, c.wheel(-1, { shift: true }));
    expect(box.raw.scraps.grip.parts.clip).toMatchObject({ s: 1.05 });
    expect(box.raw.scraps.grip.parts.clip.r).toBeDefined();
    // a selected pin of the board's own sizes and turns too
    box.raw.pins = { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } };
    c.press("move", { x: 2000, y: 2000 });
    expect(c.wheel(-1, { shift: true })).toEqual({ pins: { p: { s: 1.05 } } });
  });
});

describe("a card's pieces stand on the card by themselves (2026-10-02)", () => {
  it("moving the clipping takes its tape and pins with it (Luke, 2026-10-06)", () => {
    const L = normalizeLook({ ...look, pools: { ...look.pools, tapes: ["tx/fixtures__tape"] } });
    const base = { lib: "grip", x: 500, y: 500, r: 0 };
    for (let seed = 0; seed < 12; seed++) {
      const a = scrapLayout(normalizeBoard({ scraps: { grip: { ...base, seed } } }).scraps.grip, L, size, measure, L.library.grip);
      const b = scrapLayout(normalizeBoard({ scraps: { grip: { ...base, seed, parts: { clip: { u: 0.3, v: -0.2 } } } } }).scraps.grip, L, size, measure, L.library.grip);
      const rel = (o, list, kx, ky) => list.map((t) => [Math.round(t[kx] - o.clip.box.cx), Math.round(t[ky] - o.clip.box.cy)]);
      expect(rel(b, b.tapes, "cx", "cy")).toEqual(rel(a, a.tapes, "cx", "cy"));
      expect(rel(b, b.clipPins, "x", "y")).toEqual(rel(a, a.clipPins, "x", "y"));
    }
  });

  it("a name tag is as narrow as its writing", () => {
    const w = (text) => scrapLayout(normalizeBoard({ scraps: { t: { type: "note", tag: true, text, x: 0, y: 0, r: 0 } } }).scraps.t, look, size, measure, null).box.w;
    expect(w("Rust Chute")).toBeLessThan(w("The Long Dark Below the Grip"));
    expect(w("ab")).toBeLessThan(look.scrap.w * 0.6);
  });

  it("a pin is grabbed alone: it moves off its note, and the note stays", () => {
    const raw = { ...RAW, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", on: "mine", at: { u: 0, v: -0.3 } } }, links: { s: { a: "grip", bPin: "p" } } };
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    const p = c.host.view().pins[0];
    expect(c.dragStart(p)).toBe("piece");
    applyPatch(box.raw, c.dragMove({ x: 2600, y: 2600 }));
    expect(box.raw.scraps.mine.x).toBe(800);
    expect(box.raw.pins.p).toMatchObject({ on: null, x: 2600, y: 2600 });
  });
});

describe("pins joined and pulled apart (Luke, 2026-10-02)", () => {
  const J = { scraps: RAW.scraps, links: { s: { aPt: { x: 2000, y: 2000 }, bPt: { x: 2400, y: 2000 } }, t: { aPt: { x: 2000, y: 2600 }, bPt: { x: 2700, y: 2600 } } } };
  const live7 = (raw) => {
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    return { c, box };
  };

  it("a string's end dragged onto another's joins them in one pin, with a ring on the way", () => {
    const { c, box } = live7(J);
    const from = c.host.view().links.find((l) => l.id === "s").ends[1];
    expect(c.dragStart(from)).toBe("piece");
    c.dragMove({ x: 2690, y: 2595 });
    expect(c.marks().join).toEqual({ x: 2700, y: 2600 });
    applyPatch(box.raw, c.dragEnd());
    const pinId = box.raw.links.s.bPin;
    expect(pinId).toBeTruthy();
    expect(box.raw.links.t.bPin).toBe(pinId);
    expect(box.raw.pins[pinId]).toMatchObject({ x: 2700, y: 2600 });
    const v = c.host.view();
    expect(v.pins.find((p) => p.id === pinId).pulls).toHaveLength(2);
  });

  it("no ring away from any string's pin, nor over the string's own", () => {
    const { c } = live7(J);
    const from = c.host.view().links.find((l) => l.id === "s").ends[1];
    c.dragStart(from);
    c.dragMove({ x: 2010, y: 2005 });
    expect(c.marks().join).toBeNull();
    c.dragMove({ x: 1500, y: 1500 });
    expect(c.marks().join).toBeNull();
  });

  it("a board pin joined to another hands its strings over and goes", () => {
    const raw = { scraps: RAW.scraps, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 }, q: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2600, y: 2000 } }, links: { s: { aPin: "p", bPt: { x: 2000, y: 2500 } }, t: { aPin: "q", bPt: { x: 2600, y: 2500 } } } };
    const { c, box } = live7(raw);
    c.dragStart({ x: 2000, y: 2000 });
    c.dragMove({ x: 2595, y: 2004 });
    applyPatch(box.raw, c.dragEnd());
    expect(box.raw.pins.p).toBeUndefined();
    expect(box.raw.links.s.aPin).toBe("q");
  });

  it("Shift+drag pulls the string you drag toward off a shared pin; the rest stay", () => {
    const raw = { scraps: RAW.scraps, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } }, links: { s: { aPin: "p", bPt: { x: 2600, y: 2000 } }, t: { aPin: "p", bPt: { x: 1400, y: 2000 } } } };
    const { c, box } = live7(raw);
    expect(c.dragStart({ x: 2000, y: 2000 }, { shift: true })).toBe("split");
    c.dragMove({ x: 2100, y: 2010 });
    applyPatch(box.raw, c.dragEnd());
    expect(box.raw.links.t.aPin).toBe("p");
    expect(box.raw.links.s.aPin).not.toBe("p");
    expect(box.raw.pins[box.raw.links.s.aPin]).toMatchObject({ x: 2100, y: 2010 });
  });
});

describe("one kind of pin (Luke, 2026-10-02: tighten it up)", () => {
  it("an older board is made whole: every string end and joint a pin, stuck in its card or loose", () => {
    const raw = { scraps: RAW.scraps, links: { l1: { a: "grip", b: "sump" }, l2: { aPt: { x: 2000, y: 2000 }, bPt: { x: 2500, y: 2000 }, joints: [{ x: 2200, y: 2300 }] } } };
    const before = boardView(look, normalizeBoard(raw), "gm", size, measure).links.find((l) => l.id === "l1").ends;
    const { board: b, changed } = tidyBoard(raw, look, size, measure);
    expect(changed).toBe(true);
    expect(b.links.l1).toMatchObject({ aPin: expect.any(String), bPin: expect.any(String) });
    expect(b.links.l1.a).toBeUndefined();
    expect(b.pins[b.links.l1.aPin].on).toBe("grip");
    expect(b.pins[b.links.l2.aPin]).toMatchObject({ x: 2000, y: 2000 });
    expect(b.links.l2.joints[0].pin).toBeTruthy();
    // drawn just where it was
    const after = boardView(look, normalizeBoard(b), "gm", size, measure).links.find((l) => l.id === "l1").ends;
    expect(after[0].x).toBeCloseTo(before[0].x, 0);
    expect(after[1].y).toBeCloseTo(before[1].y, 0);
    // and once whole, it stays as it is
    expect(tidyBoard(b, look, size, measure).changed).toBe(false);
  });

  it("a loose pin lying on a card is stuck in it, and goes with it", () => {
    const raw = { scraps: RAW.scraps, links: {}, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 800, y: 1200 } } };
    const { board: b } = tidyBoard(raw, look, size, measure);
    expect(b.pins.p.on).toBe("mine");
    b.scraps.mine.x += 100;
    expect(boardView(look, normalizeBoard(b), "gm", size, measure).pins[0].x).toBeCloseTo(900, 0);
  });

  it("a name tag set back on its route's pin hides its thread and the tag's own pin", () => {
    const raw = { scraps: RAW.scraps, links: { l1: { a: "grip", b: "sump", kind: "delve", label: "Rust Chute", tagDx: 0, tagDy: 0 } } };
    const { board: b } = tidyBoard(raw, look, size, measure);
    const v = boardView(look, normalizeBoard(b), "gm", size, measure);
    const l = v.links.find((x) => x.id === "l1");
    const thread = v.links.find((x) => x.id === l.threads[0]);
    expect(thread.collapsed).toBe(true);
    expect(v.pins.find((p) => p.id === thread.bPin).hidden).toBe(true);
    // the tag moved: the route's pin is stuck in it and goes with it
    const note = b.scraps[l.nameNote];
    note.x += 400;
    const v2 = boardView(look, normalizeBoard(b), "gm", size, measure);
    expect(v2.links.find((x) => x.id === l.threads[0]).collapsed).toBe(true);
    expect(v2.pins.find((p) => p.id === thread.aPin).x).toBeCloseTo(v.pins.find((p) => p.id === thread.aPin).x + 400, 0);
    // the pin dragged off the tag: the thread shows again
    b.pins[thread.aPin] = { tex: b.pins[thread.aPin].tex, x: 300, y: 900 };
    const v3 = boardView(look, normalizeBoard(b), "gm", size, measure);
    expect(v3.links.find((x) => x.id === l.threads[0]).collapsed).toBeUndefined();
  });

  it("a pin's size comes from the hand alone, never its strings' length or joining (Luke, 2026-10-06)", () => {
    const raw = { scraps: {}, links: { s: { aPin: "p", bPt: { x: 2300, y: 2000 } }, t: { aPin: "p", bPt: { x: 1800, y: 2000 } } }, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } } };
    const one = boardView(look, normalizeBoard({ ...raw, links: { s: raw.links.s } }), "gm", size, measure).pins[0].w;
    const two = boardView(look, normalizeBoard(raw), "gm", size, measure).pins[0].w;
    expect(two).toBe(one);
    const far = boardView(look, normalizeBoard({ ...raw, links: { s: { aPin: "p", bPt: { x: 4000, y: 2000 } } } }), "gm", size, measure).pins[0].w;
    expect(far).toBe(one);
    const hand = boardView(look, normalizeBoard({ ...raw, pins: { p: { ...raw.pins.p, s: 2 } } }), "gm", size, measure).pins[0];
    expect(hand.sEff).toBeCloseTo(2, 5);
  });

  it("the reticle says what a press does", () => {
    const raw = { scraps: RAW.scraps, links: { s: { aPin: "p", bPt: { x: 2300, y: 2000 } } }, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 2000, y: 2000 } } };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => raw });
    c.hover({ x: 2004, y: 2003 }, "move");
    c.grab.since -= 200;
    expect(c.marks().caption).toMatch(/ctrl\+drag: new string/);
  });
});

describe("layers (Luke, 2026-10-02)", () => {
  it("PageUp and PageDown move a card one past the next card it overlaps; writing stays under", () => {
    const raw = { scraps: { a: { type: "note", text: "a", x: 1000, y: 1000, r: 0 }, b: { type: "note", text: "b", x: 1030, y: 1010, r: 0 }, c: { type: "note", text: "c", x: 1060, y: 1020, r: 0 }, w: { type: "scrawl", text: "under", x: 1030, y: 1000, r: 0, z: 9 } }, links: {} };
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    const order = () => c.host.view().scraps.map((s) => s.key);
    expect(order()).toEqual(["w", "a", "b", "c"]);
    c.selection.add("a");
    applyPatch(box.raw, c.layer(1));
    expect(order()).toEqual(["w", "b", "a", "c"]);
    applyPatch(box.raw, c.layer(1));
    expect(order()).toEqual(["w", "b", "c", "a"]);
    expect(c.layer(1)).toBeNull();
    applyPatch(box.raw, c.layer(-1));
    expect(order()).toEqual(["w", "b", "a", "c"]);
  });
});

describe("the marker on cards, and its own Select (Luke, 2026-10-03)", () => {
  const live11 = (raw, user = GM) => {
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ look: () => look, view: () => boardView(look, normalizeBoard(box.raw), user.isGM ? "gm" : "player", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => box.raw });
    return { c, box };
  };
  const draw = (c, box, pts, user = GM) => {
    c.dragStart({ x: pts[0], y: pts[1] }, { tool: "mark" });
    for (let i = 2; i < pts.length; i += 2) c.dragMove({ x: pts[i], y: pts[i + 1] });
    const a = c.dragEnd();
    const st = { c: 2, w: 6, o: 0.8, pts: a.pts };
    if (a.on) applyPatch(box.raw, { scraps: { [a.patch.key]: { marks: { [a.patch.id]: { ...a.patch.stroke(st), by: user.id } } } } });
    else applyPatch(box.raw, { marks: { [user.id]: { m1: st } } });
    return a;
  };

  it("a stroke begun on a card is the card's, in its frame, and goes where the card goes", () => {
    const { c, box } = live11(RAW);
    const a = draw(c, box, [300, 300, 320, 310, 340, 330]);
    expect(a.on).toBe("grip");
    const st = at(c, "grip").layout.strokes[0];
    expect(st.pts[0]).toBeCloseTo(300, 3);
    expect(st.pts[5]).toBeCloseTo(330, 3);
    applyPatch(box.raw, { scraps: { grip: { x: 500 } } });
    expect(at(c, "grip").layout.strokes[0].pts[0]).toBeCloseTo(500, 3);
  });

  it("begun on the sheet, it is the sheet's", () => {
    const { c, box } = live11(RAW);
    expect(draw(c, box, [2400, 2400, 2450, 2420]).on).toBeNull();
    expect(Object.keys(box.raw.marks.gm)).toEqual(["m1"]);
  });

  it("Select: a stroke moved wholly onto a card is the card's; wholly off it, the sheet's again", () => {
    const { c, box } = live11(RAW);
    draw(c, box, [2400, 2400, 2420, 2410]);
    c.markMode = "select";
    expect(c.press("mark", { x: 2410, y: 2405 })).toEqual({ do: "select" });
    expect(c.markSel.size).toBe(1);
    expect(c.dragStart({ x: 2410, y: 2405 }, { tool: "mark" })).toBe("mmove");
    c.dragMove({ x: 310, y: 305 });
    applyPatch(box.raw, c.dragEnd());
    expect(box.raw.marks?.gm).toBeUndefined();
    expect(Object.keys(box.raw.scraps.grip.marks)).toHaveLength(1);
    // (and the selection followed it)
    expect([...c.markSel][0]).toContain("@grip");
    // half off: still the card's
    expect(c.dragStart({ x: 310, y: 305 }, { tool: "mark" })).toBe("mmove");
    c.dragMove({ x: 410, y: 305 });
    const p = c.dragEnd();
    applyPatch(box.raw, p);
    if (at(c, "grip").layout.strokes.length) expect(box.raw.marks?.gm).toBeUndefined();
    // wholly off: the sheet's
    const sel = at(c, "grip").layout.strokes[0];
    c.markSel = new Set([JSON.stringify(["@grip", sel.id])]);
    expect(c.dragStart({ x: sel.pts[0], y: sel.pts[1] }, { tool: "mark" })).toBe("mmove");
    c.dragMove({ x: sel.pts[0] + 1500, y: sel.pts[1] + 1500 });
    applyPatch(box.raw, c.dragEnd());
    expect(Object.keys(box.raw.scraps.grip.marks)).toHaveLength(0);
    expect(Object.keys(box.raw.marks.gm)).toHaveLength(1);
  });

  it("Select sizes and turns the selection by its corners", () => {
    const { c, box } = live11(RAW);
    draw(c, box, [2400, 2400, 2500, 2400]);
    c.markMode = "select";
    c.press("mark", { x: 2450, y: 2400 });
    const b = c.bounds();
    expect(c.dragStart(b.handle, { tool: "mark" })).toBe("msize");
    c.dragMove({ x: b.c.x + (b.handle.x - b.c.x) * 2, y: b.c.y + (b.handle.y - b.c.y) * 2 });
    applyPatch(box.raw, c.dragEnd());
    const st = box.raw.marks.gm.m1;
    expect(st.pts[2] - st.pts[0]).toBeCloseTo(200, 0);
    expect(st.w).toBeCloseTo(12, 0);
  });

  it("a player takes hold of their own strokes only; the GM, any", () => {
    const raw = { ...structuredClone(RAW), marks: { gm: { m1: { c: 0, w: 6, pts: [2400, 2400, 2500, 2400] } }, ana: { m1: { c: 0, w: 6, pts: [2400, 2600, 2500, 2600] } } } };
    const { c } = live11(raw, ANA);
    c.markMode = "select";
    c.press("mark", { x: 2450, y: 2400 });
    expect(c.markSel.size).toBe(0);
    c.press("mark", { x: 2450, y: 2600 });
    expect([...c.markSel]).toEqual([JSON.stringify(["ana", "m1"])]);
    const g = live11(raw, GM).c;
    g.markMode = "select";
    g.press("mark", { x: 2450, y: 2400 });
    expect(g.markSel.size).toBe(1);
  });
});

describe("strings in a chain while Ctrl is held (Luke, 2026-10-03)", () => {
  it("the String tool: Ctrl at the second press ties it at once and carries on from its end", () => {
    const c = new BoardControls(host(GM));
    expect(c.press("string", { x: 2400, y: 2400 })).toEqual({ do: "select" });
    const a = c.press("string", { x: 2600, y: 2500 }, { ctrl: true });
    expect(a).toMatchObject({ do: "string", quick: true, chain: true });
    expect(a.endPt).toEqual({ x: 2600, y: 2500 });
    c.chainFrom("pin9", a.endPt);
    expect(c.from).toEqual({ pin: "pin9", pt: { x: 2600, y: 2500 } });
    // Ctrl let go: the chain ends
    expect(c.endChain()).toBe(true);
    expect(c.from).toBeNull();
  });

  it("without Ctrl, the second press asks as before", () => {
    const c = new BoardControls(host(GM));
    c.press("string", { x: 2400, y: 2400 });
    expect(c.press("string", { x: 2600, y: 2500 })).toMatchObject({ do: "string", quick: false });
    expect(c.endChain()).toBe(false);
  });
});

describe("players' own strings, and cards locked (Luke, 2026-10-03)", () => {
  const pin = (x, y, extra = {}) => ({ tex: "tx/fixtures__fixture_grey_tack_small", x, y, ...extra });
  const RAW2 = { scraps: { grip: { lib: "grip", x: 300, y: 300, r: 0 } }, pins: { a: pin(1000, 2000), b: pin(2000, 2000), c: pin(1000, 2600), d: pin(2000, 2600) },
    links: { gm: { kind: "delve", aPin: "a", bPin: "b" }, ana: { kind: "path", color: 3, author: "ana", aPin: "c", bPin: "d" } } };
  const live12 = (user) => {
    const box = { raw: structuredClone(RAW2) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), user.isGM ? "gm" : "player", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => box.raw });
    return { c, box };
  };
  const midOf = (c, id) => { const l = c.host.view().links.find((x) => x.id === id); const i = 2 * Math.floor(l.points.length / 4); return { x: l.points[i], y: l.points[i + 1] }; };

  it("a player has the String tool, and selects and breaks only their own strings", () => {
    expect(toolsFor(ANA)).toContain("string");
    const { c } = live12(ANA);
    c.press("move", midOf(c, "gm"));
    expect(c.links.size).toBe(0);
    c.press("move", midOf(c, "ana"));
    expect([...c.links]).toEqual(["ana"]);
    expect(c.dragStart(midOf(c, "gm"), { shift: true })).not.toBe("break");
    c.dragEnd();
    expect(c.dragStart(midOf(c, "ana"), { shift: true })).toBe("break");
  });

  it("a player takes off only their own", () => {
    const { c } = live12(ANA);
    c.links.add("gm"); c.links.add("ana"); c.pins.add("a"); c.pins.add("c");
    expect(c.removal()).toEqual({ scraps: [], pins: ["c"], links: ["ana"], cards: [] });
  });

  it("right-click locks a card (no menu: Luke 2026-10-06); locked, it neither moves nor shows its handles", () => {
    const { c, box } = live12(GM);
    const a = c.press("move", { x: 300, y: 300 }, { right: true });
    expect(a).toEqual({ do: "patch", patch: { scraps: { grip: { locked: true } } } });
    applyPatch(box.raw, a.patch);
    c.press("move", { x: 300, y: 300 });
    expect(c.bounds()).toBeNull();
    expect(c.dragStart({ x: 300, y: 300 })).toBe("box");
    expect(c.marks().locks).toHaveLength(1);
    expect(c.lockPatch("grip").scraps.grip.locked).toBe(false);
  });
});

describe("Enter smooths a pin away (Luke, 2026-10-03)", () => {
  const pin = (x, y) => ({ tex: "tx/fixtures__fixture_grey_tack_small", x, y });
  const live10 = (raw) => {
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    return { c, box };
  };

  it("a joint goes, its pin with it; the string runs on between its neighbours", () => {
    const { c, box } = live10({ scraps: {}, pins: { a: pin(1000, 2000), j: pin(1500, 2400), k: pin(1800, 2300), b: pin(2000, 2000) }, links: { s: { kind: "rail", aPin: "a", bPin: "b", joints: [{ pin: "j" }, { pin: "k" }] } } });
    c.pins.add("j");
    applyPatch(box.raw, c.smooth());
    expect(box.raw.links.s.joints).toEqual([{ pin: "k" }]);
    expect(box.raw.pins.j).toBeUndefined();
  });

  it("two strings meeting end to end become one, their joints in order", () => {
    const { c, box } = live10({ scraps: {}, pins: { a: pin(1000, 2000), m: pin(1500, 2000), b: pin(2000, 2000), j1: pin(1200, 2200), j2: pin(1800, 2200) },
      links: { s: { kind: "delve", aPin: "m", bPin: "a", joints: [{ pin: "j1" }] }, t: { kind: "path", aPin: "m", bPin: "b", joints: [{ pin: "j2" }] } } });
    c.pins.add("m");
    applyPatch(box.raw, c.smooth());
    expect(Object.keys(box.raw.links)).toEqual(["s"]);
    expect(box.raw.links.s).toMatchObject({ kind: "delve", aPin: "a", bPin: "b", joints: [{ pin: "j1" }, { pin: "j2" }] });
    expect(box.raw.pins.m).toBeUndefined();
  });

  it("a pin holding more than that, or nothing, is left alone", () => {
    const { c } = live10({ scraps: {}, pins: { a: pin(1000, 2000), m: pin(1500, 2000), b: pin(2000, 2000), d: pin(1500, 2600), lone: pin(400, 400) },
      links: { s: { aPin: "a", bPin: "m" }, t: { aPin: "m", bPin: "b" }, u: { aPin: "m", bPin: "d" } } });
    c.pins.add("m");
    expect(c.smooth()).toBeNull();
    c.pins.clear();
    c.pins.add("lone");
    expect(c.smooth()).toBeNull();
  });
});

describe("Shift+drag breaks a string (Luke, 2026-10-02)", () => {
  const pin = (x, y) => ({ tex: "tx/fixtures__fixture_grey_tack_small", x, y });
  const live9 = (raw) => {
    const box = { raw: structuredClone(raw) };
    const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });
    return { c, box };
  };

  it("where it is grabbed: two strings, the far half's new end at the pointer", () => {
    const { c, box } = live9({ scraps: {}, pins: { a: pin(1000, 2000), b: pin(2000, 2000) }, links: { s: { kind: "rail", aPin: "a", bPin: "b" } } });
    const l = c.host.view().links[0];
    const p = { x: l.points[2 * Math.floor(l.points.length / 4)], y: l.points[2 * Math.floor(l.points.length / 4) + 1] };
    expect(c.dragStart(p, { shift: true })).toBe("break");
    c.dragMove({ x: p.x + 50, y: p.y + 200 });
    applyPatch(box.raw, c.dragEnd());
    const v = c.host.view();
    expect(v.links).toHaveLength(2);
    const near = box.raw.links.s;
    const farId = Object.keys(box.raw.links).find((k) => k !== "s");
    expect(near.aPin).toBe("a");
    expect(box.raw.links[farId]).toMatchObject({ bPin: "b", kind: "rail" });
    expect(box.raw.pins[box.raw.links[farId].aPin]).toMatchObject({ x: Math.round(p.x + 50), y: Math.round(p.y + 200) });
  });

  it("at a joint pin: it ends the near half; the far half starts at the pointer", () => {
    const { c, box } = live9({ scraps: {}, pins: { a: pin(1000, 2000), j: pin(1500, 2100), b: pin(2000, 2000) }, links: { s: { aPin: "a", bPin: "b", joints: [{ pin: "j" }] } } });
    expect(c.dragStart({ x: 1500, y: 2100 }, { shift: true })).toBe("break");
    c.dragMove({ x: 1600, y: 2300 });
    applyPatch(box.raw, c.dragEnd());
    expect(box.raw.links.s).toMatchObject({ aPin: "a", bPin: "j", joints: [] });
    const farId = Object.keys(box.raw.links).find((k) => k !== "s");
    expect(box.raw.links[farId].bPin).toBe("b");
    expect(box.raw.pins[box.raw.links[farId].aPin]).toMatchObject({ x: 1600, y: 2300 });
  });
});
