/**
 * The map's fifth batch (Luke, 2026-10-25): a locked note frozen (nothing on
 * it changes until it is let go, strings still tie to it), its padlock shown
 * on hover; a card's pins and pieces caught only once it is selected; a
 * Ctrl+drag box over a selected card's contents; a note's writing deleted
 * alone; Look for the GM; the doodle in hand sized and turned; a user's own
 * kept drawings; a new string's pin picked.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, doodleBoard, doodlePatch, savedDoodleOf, cleanSavedDoodle, cleanSavedDoodles, newStringPatch, isSavedKind, SAVED_MAX, WEB_TEX } from "../src/map/scrapboard/model.js";
import { BoardControls, GM_TOOLS, OWNER_TOOLS, toolsFor, strokeCorner } from "../src/map/scrapboard/controls.js";
import { playerPatchOf, ownCardsOf } from "../src/map/scrapboard/notes.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : id === WEB_TEX ? { w: 100, h: 100 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] } });
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false, owner: false };

const live = (raw, user = GM) => new BoardControls({
  view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure),
  look: () => look,
  painter: () => ({ tagOf: () => null, onTag: () => false }),
  size,
  user: () => user,
  px: () => 1,
  raw: () => raw,
});
const viewOf = (raw, user = GM) => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure);
const noteBoard = (extra = {}) => ({
  scraps: { n1: { type: "note", text: "Down past the Grip", x: 1000, y: 1000, author: "ana", marks: { k1: { c: 1, w: 4, by: "ana", pts: [-20, 0, 20, 0] } }, ...extra } },
  links: {},
  pins: { stuck: { tex: "tx/pin", on: "n1", at: { u: 0.2, v: 0.2 }, author: "ana" } },
});
const centre = (raw) => {
  const s = viewOf(raw).scraps[0];
  const c = s.layout.box ?? s.layout.paper;
  return { x: c.cx, y: c.cy };
};

describe("Look for the GM (Luke, 2026-10-25)", () => {
  it("is the GM's first tool, and a board owner's", () => {
    expect(GM_TOOLS[0]).toBe("inspect");
    expect(OWNER_TOOLS[0]).toBe("inspect");
    expect(toolsFor(GM)[0]).toBe("inspect");
  });

  it("a click with it opens a place for the GM, and never edits a note", () => {
    const raw = noteBoard();
    const c = live(raw);
    expect(c.press("inspect", centre(raw))).toBeNull();
  });
});

describe("a card's pins and pieces only once it is selected", () => {
  it("its own pin and a pin stuck in it catch no reticle and take no press until then", () => {
    const raw = noteBoard();
    const c = live(raw);
    const pin = viewOf(raw).pins.find((p) => p.id === "stuck");
    c.hover({ x: pin.x, y: pin.y }, "move");
    expect(c.grab).toBeNull();
    c.press("move", { x: pin.x, y: pin.y });
    expect(c.selection.has("n1")).toBe(true);
    expect(c.pins.size).toBe(0);
    c.hover({ x: pin.x + 1, y: pin.y + 1 }, "move");
    expect(c.grab?.key).toBe("pin:stuck");
  });
});

describe("a locked note is frozen (Luke, 2026-10-25)", () => {
  const locked = () => noteBoard({ locked: true });

  it("selected, it shows no pieces and none of its strokes or pins are picked", () => {
    const raw = locked();
    const c = live(raw);
    c.press("move", centre(raw));
    expect(c.selection.has("n1")).toBe(true);
    expect(c.marks().parts).toEqual([]);
    const st = viewOf(raw).scraps[0].layout.strokes[0];
    c.press("move", { x: (st.pts[0] + st.pts[2]) / 2, y: (st.pts[1] + st.pts[3]) / 2 });
    expect(c.markSel.size).toBe(0);
  });

  it("is never edited: Note, Write, a double-click", () => {
    const raw = locked();
    const c = live(raw);
    expect(c.press("note", centre(raw))).toEqual({ do: "refuse", why: "locked" });
    expect(c.double("move", centre(raw))).toEqual({ do: "refuse", why: "locked" });
  });

  it("takes no pin, no brush stroke, and no doodle", () => {
    const raw = locked();
    const c = live(raw);
    expect(c.press("pin", centre(raw))).toEqual({ do: "refuse", why: "locked" });
    expect(c.dragStart(centre(raw), { tool: "mark" })).toBeNull();
    c.doodle = "star";
    expect(c.press("mark", centre(raw))).toEqual({ do: "refuse", why: "locked" });
  });

  it("its strokes are never rubbed out", () => {
    const raw = locked();
    const c = live(raw);
    const st = viewOf(raw).scraps[0].layout.strokes[0];
    expect(c.press("erase", { x: (st.pts[0] + st.pts[2]) / 2, y: (st.pts[1] + st.pts[3]) / 2 })).toBeNull();
  });

  it("is never deleted, nor switched public", () => {
    const raw = locked();
    const c = live(raw);
    c.press("move", centre(raw));
    expect(c.removal().cards).toEqual([]);
    expect(c.shareState()).toBeNull();
    expect(c.press("move", centre(raw), { right: true, shift: true })).toEqual({ do: "refuse", why: "locked" });
  });

  it("a string's pin in it moves on it, never off it; strings still tie to it", () => {
    const raw = locked();
    raw.links = { l1: { kind: "path", aPin: "stuck", bPt: { x: 1600, y: 1000 } } };
    const c = live(raw);
    const end = viewOf(raw).links[0].ends[0];
    expect(c.dragStart({ x: end.x, y: end.y }, { tool: "move" })).toBe("piece");
    // (dragged far off the note: it stays in it, kept to its paper)
    c.dragMove({ x: end.x + 3000, y: end.y + 3000 });
    const p = c.dragEnd();
    expect(p.pins.stuck.on).toBe("n1");
    expect(Number.isFinite(p.pins.stuck.at.u)).toBe(true);
    c.press("string", centre(raw));
    expect(c.from?.key).toBe("n1");
  });

  it("the GM's relay lets a player's pin move on it, never off it or into it", () => {
    const raw = locked();
    raw.pins.stuck.author = "ana";
    raw.links = { l1: { kind: "path", aPin: "stuck", bPt: { x: 1600, y: 1000 }, author: "ana" } };
    expect(playerPatchOf(raw, { pins: { stuck: { on: "n1", at: { u: 0.1, v: 0.1 } } } }, ANA, look)).not.toBeNull();
    expect(playerPatchOf(raw, { pins: { stuck: { on: null, at: null, x: 5, y: 5 } } }, ANA, look)).toBeNull();
  });

    it("is still let go by a right-click", () => {
    const raw = locked();
    const c = live(raw);
    expect(c.press("move", centre(raw), { right: true })?.patch?.scraps?.n1?.locked).toBe(false);
  });

  it("shows its padlock under the pointer in Move", () => {
    const raw = locked();
    const c = live(raw);
    c.hover(centre(raw), "move");
    expect(c.marks().hot?.lock).toBeTruthy();
  });

  it("the GM's relay refuses a player's edit of it, but lets it go", () => {
    const raw = locked();
    expect(playerPatchOf(raw, { scraps: { n1: { x: 1200, y: 1200 } } }, ANA, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { n1: { locked: false } } }, ANA, look)?.scraps?.n1).toEqual({ locked: false });
    // (a pin in it moves on it, never off it: Luke 2026-10-25)
    expect(playerPatchOf(raw, { pins: { stuck: { at: { u: 0, v: 0 } } } }, ANA, look)).not.toBeNull();
    expect(playerPatchOf(raw, { pins: { stuck: { on: null, x: 5, y: 5 } } }, ANA, look)).toBeNull();
    expect(ownCardsOf(raw, ["n1"], ANA)).toBeNull();
  });
});

describe("a locked stroke's padlock (Luke, 2026-10-25)", () => {
  it("shows under the pointer and by it once selected", () => {
    const raw = { scraps: {}, links: {}, marks: { gm: { m1: { c: 1, w: 6, pts: [100, 100, 300, 100], locked: true } } } };
    const c = live(raw);
    c.hover({ x: 200, y: 101 }, "move");
    expect(c.marks().hot?.lock).toEqual(strokeCorner([100, 100, 300, 100]));
    c.press("move", { x: 200, y: 101 });
    expect(c.marks().locks).toContainEqual({ x: 100, y: 100 });
  });
});

describe("Ctrl+drag over a selected card's contents (Luke, 2026-10-25)", () => {
  it("picks only what is on the card, the card kept; then they alone move and come off", () => {
    const raw = noteBoard();
    raw.marks = { gm: { sheet: { c: 1, w: 6, pts: [900, 1000, 1100, 1000] } } };
    const c = live(raw);
    c.press("move", centre(raw));
    expect(c.dragStart({ x: 600, y: 600 }, { tool: "move", ctrl: true })).toBe("box");
    c.dragMove({ x: 1400, y: 1400 });
    c.dragEnd();
    expect(c.selection.has("n1")).toBe(true);
    expect([...c.markSel].map((k) => JSON.parse(k))).toEqual([["@n1", "k1"]]);
    expect([...c.pins]).toEqual(["stuck"]);
    const what = c.removal();
    expect(what.cards).toEqual([]);
    expect(what.strokes).toEqual([["@n1", "k1"]]);
  });
});

describe("a note's writing deleted alone (Luke, 2026-10-25)", () => {
  it("at once, the note left blank", () => {
    const raw = noteBoard();
    const c = live(raw);
    c.part = { key: "n1", id: "text" };
    expect(c.pieceOut()).toEqual({ scraps: { n1: { text: "", fmt: [], drop: ["text"], parts: {} } } });
    expect(c.part).toBeNull();
  });

  it("a player's, checked on the GM's side", () => {
    const raw = noteBoard();
    const c = live(raw, ANA);
    c.part = { key: "n1", id: "text" };
    const p = c.pieceOut();
    expect(playerPatchOf(raw, p, ANA, look)).toEqual({ scraps: { n1: { text: "", fmt: [], drop: ["text"], parts: {} } } });
    expect(playerPatchOf(raw, p, { id: "bo", isGM: false, owner: false }, look)).toBeNull();
  });

    it("never a locked note's", () => {
    const raw = noteBoard({ locked: true });
    const c = live(raw);
    c.part = { key: "n1", id: "text" };
    expect(c.pieceOut()).toBeNull();
  });
});

describe("the doodle in hand, sized and turned (Luke, 2026-10-25)", () => {
  it("Ctrl+wheel turns it 5 degrees, Shift+wheel sizes it 5%, nothing to write", () => {
    const c = live({ scraps: {}, links: {} });
    c.doodle = "star";
    expect(c.wantsWheel({ ctrl: true })).toBe(true);
    expect(c.wheel(1, { ctrl: true })).toEqual({ doodle: true });
    expect(c.doodleRot).toBe(5);
    c.wheel(-1, { shift: true });
    expect(c.doodleSize).toBe(53);
    expect(c.marks({ pointer: { x: 0, y: 0 } }).doodle).toMatchObject({ size: 53, rot: (5 * Math.PI) / 180 });
  });

  it("laid at its turn", () => {
    const a = doodleBoard("bridge", "s", { x: 0, y: 0, size: 60 });
    const b = doodleBoard("bridge", "s", { x: 0, y: 0, size: 60, rot: Math.PI / 2 });
    // (a line across, turned a quarter, runs down)
    const spread = (st, i) => Math.max(...st.pts.filter((_, k) => k % 2 === i)) - Math.min(...st.pts.filter((_, k) => k % 2 === i));
    expect(spread(a[0], 0)).toBeGreaterThan(spread(a[0], 1));
    expect(spread(b[0], 1)).toBeGreaterThan(spread(b[0], 0));
  });
});

describe("a user's own kept drawings (Luke, 2026-10-25)", () => {
  const strokes = [{ c: 3, b: 2, o: 0.6, w: 8, pts: [100, 100, 300, 100] }, { c: 7, w: 4, pts: [200, 50, 200, 150] }];

  it("kept in their own frame and laid again in their own paints, sized and turned", () => {
    const d = savedDoodleOf(strokes);
    expect(d.strokes).toHaveLength(2);
    expect(Math.max(...d.strokes[0].pts.map(Math.abs))).toBeLessThanOrEqual(0.96);
    const laid = doodleBoard("saved:x", "s", { x: 500, y: 500, size: 100, saved: d });
    expect(laid.map((st) => st.c)).toEqual([3, 7]);
    expect(laid[0]).toMatchObject({ b: 2, o: 0.6 });
    // (100 board px across at size 100: its first stroke's half-width 95)
    expect(laid[0].pts[0]).toBeCloseTo(405, 0);
  });

  it("read back cleaned, at most SAVED_MAX", () => {
    expect(cleanSavedDoodle({ strokes: [{ c: 999, w: 9, pts: [0, 0, 5, 5] }] }).strokes[0]).toMatchObject({ c: 95, w: 1 });
    expect(cleanSavedDoodle({ strokes: [{ pts: [1] }] })).toBeNull();
    const many = Object.fromEntries(Array.from({ length: SAVED_MAX + 5 }, (_, i) => [`d${i}`, savedDoodleOf(strokes)]));
    expect(Object.keys(cleanSavedDoodles(many))).toHaveLength(SAVED_MAX);
    expect(Object.keys(cleanSavedDoodles({ "bad id!": savedDoodleOf(strokes) }))).toEqual([]);
    expect(isSavedKind("saved:d1")).toBe(true);
    expect(isSavedKind("star")).toBe(false);
  });

  it("laid down by doodlePatch", () => {
    const raw = { scraps: {}, links: {} };
    const p = doodlePatch(raw, viewOf(raw), { kind: "saved:d1", seed: "s", at: { x: 900, y: 900 }, saved: savedDoodleOf(strokes) }, { size: 80, c: 0, w: 8, b: 1, o: 0.85 }, look, "ana");
    expect(Object.values(p.marks.ana).map((st) => st.c)).toEqual([3, 7]);
  });
});

describe("a new string's pin (Luke, 2026-10-25: the String window)", () => {
  it("its ends are the pin picked, else its kind's own", () => {
    const { patch } = newStringPatch({ pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 500, y: 0 } }, "path", look, { pin: "tx/brass" });
    expect(Object.values(patch.pins).map((p) => p.tex)).toEqual(["tx/brass", "tx/brass"]);
    const own = newStringPatch({ pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 500, y: 0 } }, "path", look).patch;
    expect(Object.values(own.pins).map((p) => p.tex)).toEqual(["tx/pin", "tx/pin"]);
  });
});

describe("a string's pins given another picture by its player (Luke, 2026-10-25)", () => {
  // (ana's string, its end on a pin of hers)
  const raw = { scraps: {}, links: { l1: { aPin: "p1", bPt: { x: 900, y: 900 }, kind: "plain", author: "ana" } }, pins: { p1: { tex: "tx/pin", x: 500, y: 500, author: "ana" } } };
  const textures = { "tx/pin": { path: "a.webp" }, fixtures__brass_pin: { path: "b.webp" } };

  it("any pin the String window offers, the look's extra pins too", () => {
    expect(playerPatchOf(raw, { pins: { p1: { tex: "fixtures__brass_pin" } } }, ANA, look, { textures })?.pins?.p1?.tex).toBe("fixtures__brass_pin");
  });

  it("never one it doesn't offer", () => {
    expect(playerPatchOf(raw, { pins: { p1: { tex: "tx/someone-elses" } } }, ANA, look, { textures })).toBeNull();
  });
});
