/**
 * Cards and pins (Luke, 2026-10-06): papers turned and mirrored so the same
 * paper never looks the same twice, a landmark's paper the shape of its art,
 * tape only holding pictures on, landmarks rarely pinned through their
 * clipping, pins in their string's colour, a hidden string's name tag hidden
 * with it, and the white reticle on pins for the String tool and on the pins
 * through a clipping.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, scrapLayout, paperAs, safeAspect, pinTint, KIND_TINT, applyPatch } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";

const SIZES = {
  "tx/paper__portrait__a": { w: 300, h: 420, safe: [0.1, 0.05, 0.9, 0.95], cover: 0.8 },
  "tx/paper__portrait__b": { w: 280, h: 400, safe: [0.08, 0.08, 0.92, 0.92], cover: 0.8 },
  "tx/fixtures__fixture_grey_tack_small": { w: 40, h: 50 },
  "tx/fixtures__fixture_red_pushpin_long": { w: 40, h: 70 },
  "tx/fixtures__fixture_tape_a": { w: 200, h: 60 },
  "tx/ink__ink_coffee_ring_orange": { w: 200, h: 200 },
  "tx/frames__frame_ink_rough_box_landscape": { w: 400, h: 300 },
  "tx/decorations__deco_web_corner_many_spiders_1_crop": { w: 200, h: 200 },
  "art/landmark__wide": { w: 1600, h: 900 },
  "art/landmark__tall": { w: 800, h: 1300 },
};
const size = (id) => SIZES[id] ?? null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({
  pools: {
    papers: ["tx/paper__portrait__a", "tx/paper__portrait__b"], notes: ["tx/paper__portrait__a", "tx/paper__portrait__b"],
    pins: ["tx/fixtures__fixture_grey_tack_small"], tapes: ["tx/fixtures__fixture_tape_a"],
    ends: { delve: ["tx/fixtures__fixture_red_pushpin_long", "tx/fixtures__fixture_grey_tack_small"], rail: [], path: ["tx/fixtures__fixture_grey_tack_small"] },
  },
  library: { wide: { name: "Wide", art: "art/landmark__wide" }, tall: { name: "Tall", art: "art/landmark__tall" } },
});
const lay = (scrap, lib = null) => scrapLayout(normalizeBoard({ scraps: { k: { x: 500, y: 500, r: 0, ...scrap } } }).scraps.k, look, size, measure, lib);

describe("papers turned and mirrored", () => {
  it("a quarter turn lays a portrait paper's solid region on its side", () => {
    const z = { w: 300, h: 420, safe: [0.1, 0.05, 0.9, 0.95] };
    const t = paperAs(z, 1);
    expect([t.w, t.h]).toEqual([420, 300]);
    expect(t.safe.map((v) => +v.toFixed(3))).toEqual([0.05, 0.1, 0.95, 0.9]);
    expect(safeAspect(t)).toBeCloseTo(1 / safeAspect(z), 6);
    expect(paperAs(z, 2).safe.map((v) => +v.toFixed(3))).toEqual([0.1, 0.05, 0.9, 0.95]);
    expect(paperAs({ w: 1, h: 1, safe: [0.1, 0, 0.5, 1] }, 0, true).safe).toEqual([0.5, 0, 0.9, 1]);
  });

  it("notes lie every way, and mirrored, across seeds", () => {
    const turns = new Set();
    const flips = new Set();
    for (let i = 0; i < 40; i++) {
      const o = lay({ type: "note", text: "x", seed: i });
      turns.add(o.paper.turn);
      flips.add(o.paper.flip);
    }
    expect(turns.size).toBeGreaterThanOrEqual(3);
    expect(flips.size).toBe(2);
  });

  it("a landmark's paper takes its art's shape", () => {
    for (let i = 0; i < 12; i++) {
      const w = lay({ lib: "wide", seed: i }, look.library.wide);
      const t = lay({ lib: "tall", seed: i }, look.library.tall);
      expect(w.box.w / w.box.h).toBeGreaterThan(1);
      expect(t.box.w / t.box.h).toBeLessThan(1);
    }
  });
});

describe("tape only holds the pictures on (Luke, 2026-10-06)", () => {
  it("no card has tape of its own at its corners or edges", () => {
    for (let i = 0; i < 60; i++) {
      for (const o of [lay({ type: "note", text: "x", seed: i }), lay({ lib: "wide", seed: i }, look.library.wide)]) {
        expect((o.extras ?? []).filter((e) => /tape/.test(e.tex))).toEqual([]);
      }
    }
  });

  it("a landmark's own tape lies on its clipping", () => {
    for (let i = 0; i < 30; i++) {
      const o = lay({ lib: "wide", seed: i, fix: "tape" }, look.library.wide);
      const B = o.clip.box;
      for (const t of o.tapes) expect(Math.hypot(t.cx - B.cx, t.cy - B.cy)).toBeLessThan(Math.hypot(B.w, B.h) * 0.6);
    }
  });
});

describe("what on a card can be taken (Luke, 2026-10-06)", () => {
  it("a web is a piece to move or take off; a ring is the paper's own and isn't", () => {
    let webs = 0, rings = 0;
    for (let i = 0; i < 800 && !(webs && rings); i++) {
      const o = lay({ type: "note", text: "x", seed: i });
      const ids = new Set((o.parts ?? []).map((q) => q.id));
      for (const e of o.extras ?? []) {
        if (/web/.test(e.tex)) { webs++; expect(e.thing).toBe(true); expect(ids.has(e.id)).toBe(true); }
        if (/ring/.test(e.tex)) { rings++; expect(e.thing).toBe(false); expect(ids.has(e.id)).toBe(false); }
      }
    }
    expect(webs).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(0);
  });
});

describe("tape and webs come off their cards (Luke, 2026-10-06)", () => {
  const GM = { id: "gm", isGM: true };
  const raw0 = () => ({ scraps: { w: { lib: "wide", x: 600, y: 600, r: 0, fix: "tape", seed: 3 } }, pins: {}, links: {} });
  const ctl = (box) => new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), "gm", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => GM, px: () => 1, raw: () => box.raw });

  it("a strip of tape dragged off its card is the board's own, the card without it", () => {
    const box = { raw: raw0() };
    const c = ctl(box);
    const s = c.host.view().scraps[0];
    const t = s.layout.tapes[0];
    expect(t).toBeTruthy();
    c.selection.add("w");
    expect(c.dragStart({ x: t.cx, y: t.cy }, { tool: "move" })).toBe("part");
    const off = { x: 1500, y: 1500 };
    const patch = c.dragMove(off);
    expect(patch.bits.bit1).toMatchObject({ tex: t.tex, x: 1500, y: 1500 });
    expect(patch.scraps.w.drop).toContain(t.id);
    applyPatch(box.raw, c.dragEnd());
    const v = c.host.view();
    expect(v.scraps[0].layout.tapes.some((x) => x.id === t.id)).toBe(false);
    expect(v.bits).toHaveLength(1);
    // (then a piece by itself: moved, sized, and taken off)
    expect(c.press("move", { x: 1500, y: 1500 })).toEqual({ do: "select" });
    expect(c.bit).toBe("bit1");
    c.dragStart({ x: 1500, y: 1500 }, { tool: "move" });
    expect(c.dragMove({ x: 1520, y: 1490 })).toEqual({ bits: { bit1: { x: 1520, y: 1490 } } });
    c.dragEnd();
    expect(c.wheel(1, { shift: true }).bits.bit1.w).toBeLessThan(v.bits[0].w);
    expect(c.pieceOut()).toEqual({ bits: { bit1: null } });
    expect(c.press("erase", { x: 1500, y: 1500 })).toEqual({ do: "patch", patch: { bits: { bit1: null } } });
  });

  it("the picture never comes off", () => {
    const box = { raw: raw0() };
    const c = ctl(box);
    const clip = c.host.view().scraps[0].layout.parts.find((p) => p.id === "clip");
    c.selection.add("w");
    c.dragStart({ x: clip.x, y: clip.y }, { tool: "move" });
    const patch = c.dragMove({ x: 2500, y: 2500 });
    expect(patch.bits).toBeUndefined();
  });
});

describe("one kind of pin a string (Luke, 2026-10-06)", () => {
  it("a new string's two pins are one kind; run on from a pin, that pin's kind and size", async () => {
    const { newStringPatch, unifyStringPins } = await import("../src/map/scrapboard/model.js");
    const { patch } = newStringPatch({ pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 500, y: 0 } }, "delve", look);
    const made = Object.values(patch.pins);
    expect(made).toHaveLength(2);
    expect(made[0].tex).toBe(made[1].tex);
    const raw = { pins: { p: { tex: "tx/fixtures__fixture_red_pushpin_long", s: 1.6, x: 0, y: 0 } } };
    const run = newStringPatch(raw, { aPin: "p", bPt: { x: 500, y: 0 } }, "path", look).patch;
    expect(Object.values(run.pins)[0]).toMatchObject({ tex: "tx/fixtures__fixture_red_pushpin_long", s: 1.6 });
    // (an older board's strings made one kind, their shared pins left be)
    const old = { pins: { a: { tex: "tx/fixtures__fixture_red_pushpin_long", x: 0, y: 0 }, b: { tex: "tx/fixtures__fixture_grey_tack_small", x: 9, y: 0 }, c: { tex: "tx/fixtures__fixture_grey_tack_small", x: 20, y: 0 } }, links: { l: { kind: "delve", aPin: "a", bPin: "b" }, m: { kind: "delve", aPin: "c", bPin: "b" } } };
    unifyStringPins(old, look);
    expect(old.pins.b.tex).toBe("tx/fixtures__fixture_grey_tack_small");
    const one = { pins: { a: { tex: "tx/fixtures__fixture_red_pushpin_long", x: 0, y: 0 }, b: { tex: "tx/fixtures__fixture_grey_tack_small", x: 9, y: 0 } }, links: { l: { kind: "delve", aPin: "a", bPin: "b" } } };
    unifyStringPins(one, look);
    expect(one.pins.b.tex).toBe("tx/fixtures__fixture_red_pushpin_long");
  });
});

describe("a note's dialog answered (Luke, 2026-10-06)", () => {
  it("its writing in a brush paint and brightness, its paper turned, its own turn, its writing's place", async () => {
    const { noteFields } = await import("../src/map/scrapboard/model.js");
    expect(noteFields({ paint: 3, bright: 2 }, look)).toMatchObject({ paint: 3, bright: 2, ink: null });
    expect(noteFields({ paint: null }, look)).toMatchObject({ paint: null, bright: null });
    expect(noteFields({ pturn: 5, r: 12.4, textAt: { u: 0.9, v: -0.1 } }, look, { parts: { text: { w: 0.5 } } })).toMatchObject({ pturn: 1, r: 12, parts: { text: { w: 0.5, u: 0.6, v: -0.1 } } });
    // (a paper turned by hand stays turned so, and the writing takes its paint)
    const o = lay({ type: "note", text: "x", seed: 4, pturn: 1, paint: 1, bright: 2 });
    expect(o.paper.turn).toBe(1);
    expect(o.ink).not.toBe(lay({ type: "note", text: "x", seed: 4 }).ink);
  });
});

describe("pins in their string's colour", () => {
  it("a string with a colour paints its pins; a plain pin of a delve is red; its own pushpin isn't touched", () => {
    expect(pinTint(look, { kind: "path", color: 2 }, "tx/fixtures__fixture_red_pushpin_long")).toBe(look.ink.marker[2]);
    expect(pinTint(look, { kind: "delve", color: null }, "tx/fixtures__fixture_grey_tack_small")).toBe(KIND_TINT.delve);
    expect(pinTint(look, { kind: "delve", color: null }, "tx/fixtures__fixture_red_pushpin_long")).toBeNull();
    expect(pinTint(look, { kind: "path", color: null }, "tx/fixtures__fixture_grey_tack_small")).toBeNull();
  });

  it("the board's pins a coloured string runs through take its colour", () => {
    const raw = { scraps: {}, pins: { a: { tex: "tx/fixtures__fixture_grey_tack_small", x: 0, y: 0 }, b: { tex: "tx/fixtures__fixture_grey_tack_small", x: 900, y: 0 } }, links: { s: { kind: "path", color: 4, aPin: "a", bPin: "b" } } };
    const v = boardView(look, normalizeBoard(raw), "gm", size, measure);
    expect(v.pins.map((p) => p.tint)).toEqual([look.ink.marker[4], look.ink.marker[4]]);
  });
});

describe("a hidden string's name goes with it (Luke, 2026-10-06)", () => {
  // a delve from a known place to a hidden one, named: a pin in it, a thread, a tag
  const raw = {
    scraps: { top: { lib: "wide", x: 300, y: 300, state: "known" }, deep: { lib: "tall", x: 1800, y: 1800, state: "hidden" }, t1: { type: "note", tag: true, text: "The Long Stair", x: 1100, y: 1200 } },
    pins: { a: { tex: "tx/fixtures__fixture_grey_tack_small", on: "top", at: { u: 0, v: 0 } }, b: { tex: "tx/fixtures__fixture_grey_tack_small", on: "deep", at: { u: 0, v: 0 } }, j: { tex: "tx/fixtures__fixture_grey_tack_small", x: 1000, y: 1000 }, tp: { tex: "tx/fixtures__fixture_grey_tack_small", on: "t1", at: { u: 0, v: -0.4 } } },
    links: { d: { kind: "delve", aPin: "a", bPin: "b", joints: [{ pin: "j" }] }, th: { kind: "delve", aPin: "j", bPin: "tp" } },
  };

  it("players see neither the string nor its tag, thread, or pins", () => {
    const v = boardView(look, normalizeBoard(raw), "player", size, measure);
    expect(v.links.map((l) => l.id)).toEqual([]);
    expect(v.scraps.map((s) => s.key)).toEqual(["top"]);
    expect(v.pins.map((p) => p.id).sort()).toEqual(["a"]);
  });

  it("the GM sees all of it as a ghost", () => {
    const v = boardView(look, normalizeBoard(raw), "gm", size, measure);
    expect(v.links.find((l) => l.id === "th").look).toBe("ghost");
    expect(v.scraps.find((s) => s.key === "t1").look).toBe("ghost");
  });
});

describe("the reticle (Luke, 2026-10-06)", () => {
  const raw = { scraps: { w: { lib: "wide", x: 600, y: 600, r: 0, fix: "pin" } }, pins: { p: { tex: "tx/fixtures__fixture_grey_tack_small", x: 1500, y: 1500 } }, links: {} };
  const ctl = (user) => new BoardControls({ view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => raw });
  const GM = { id: "gm", isGM: true };

  it("the String tool catches a pin, and a press there ties to it", () => {
    const c = ctl(GM);
    c.hover({ x: 1508, y: 1506 }, "string");
    expect(c.grab).toMatchObject({ x: 1500, y: 1500 });
    c.grab.since -= 1000;
    c.press("string", { x: 1508, y: 1506 });
    expect(c.from).toMatchObject({ pin: "p" });
    // (and a drag shows it on the pin it would end on)
    c.from = { pt: { x: 0, y: 0 } };
    c.dragStart({ x: 0, y: 0 }, { tool: "string" });
    c.dragMove({ x: 1510, y: 1495 });
    expect(c.marks().grab).toMatchObject({ x: 1500, y: 1500, locked: true });
    expect(c.dragEnd()).toMatchObject({ do: "string", bPin: "p" });
  });

  it("Ctrl+drag on a chosen pin is a new string, though its handles lie under the pointer", () => {
    const c = ctl(GM);
    c.pins.add("p");
    c.onHandle = () => true;
    expect(c.dragStart({ x: 1503, y: 1502 }, { ctrl: true, tool: "move" })).toBe("string");
    expect(c.dragStart({ x: 1503, y: 1502 }, { tool: "move" })).toBe("size");
  });

  it("a pin pulled by its handle grows no more than three times", () => {
    const c = ctl(GM);
    c.pins.add("p");
    c.onHandle = () => true;
    c.dragStart({ x: 1503, y: 1502 }, { tool: "move" });
    const patch = c.dragMove({ x: 1503 + 400, y: 1502 + 400 });
    expect(patch?.pins?.p?.s).toBeLessThanOrEqual(3);
  });

  it("a pin through a landmark's clipping shows the reticle and is taken by itself", () => {
    const c = ctl(GM);
    const s = c.host.view().scraps[0];
    const p = s.layout.clipPins[0];
    expect(p).toBeTruthy();
    c.hover({ x: p.x + 3, y: p.y + 2 }, "move");
    expect(c.grab).toMatchObject({ x: p.x, y: p.y });
    c.press("move", { x: p.x, y: p.y });
    expect(c.part).toEqual({ key: "w", id: p.id });
  });
});
