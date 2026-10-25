/**
 * Owned or public, and the pieces on a note (Luke, 2026-10-24). Everything
 * anyone makes is its maker's or public; anyone may change, move, or take
 * off a public thing, and only its maker and the GM switch it (model.js
 * sharePatch, mayShare). Players move the writing, pins, and webs on notes
 * they may change, on the note or off it (writing dragged off is writing of
 * its own: breakAwayPatch), checked again on the GM's side (notes.js
 * playerPatchOf). A note's writing fits its paper (scrapLayout, fitText), and
 * an older board's grown notes keep their size (fitNotes, tidyBoard).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, scrapLayout, fitText, fitNotes, tidyBoard, sharePatch, mayShare, isOpen, breakAwayPatch, labelPatch, applyPatch, WEB_TEX, notePreview, pickNotePaper, NOTES_EDITION } from "../src/map/scrapboard/model.js";
import { BoardControls, mayMove, mayStroke } from "../src/map/scrapboard/controls.js";
import { playerPatchOf, mayHistory, ownCardsOf } from "../src/map/scrapboard/notes.js";

const size = (id) => (id === "tx/paper" ? { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 } : id === WEB_TEX ? { w: 100, h: 100 } : null);
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { papers: ["tx/paper"], notes: ["tx/paper"], pins: ["tx/pin"], tapes: [] }, library: { grip: { name: "Grip Station" } } });
const GM = { id: "gm", isGM: true };
const ANA = { id: "ana", isGM: false, owner: false };
const BO = { id: "bo", isGM: false, owner: false };
const board = () => ({
  scraps: {
    grip: { lib: "grip", x: 300, y: 300, open: true },
    mine: { type: "note", text: "mine", x: 800, y: 1200, author: "ana" },
    shared: { type: "note", text: "anyone's", x: 1400, y: 1200, author: "ana", open: true },
    hush: { type: "note", text: "hidden", x: 1800, y: 1200, open: true, state: "hidden" },
    gmNote: { type: "note", text: "the GM's", x: 2200, y: 1200 },
  },
  links: { anaString: { aPt: { x: 900, y: 1500 }, bPt: { x: 1100, y: 1500 }, kind: "path", color: 1, author: "ana", open: true } },
  pins: { loose: { tex: "tx/pin", x: 50, y: 50, author: "ana" } },
});
const host = (user, raw) => ({ view: () => boardView(look, normalizeBoard(raw), user.isGM ? "gm" : "player", size, measure), look: () => look, painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => raw });

describe("owned or public (Luke, 2026-10-24)", () => {
  it("a public note is anyone's to change; a hidden one or a place stays the GM's", () => {
    const b = normalizeBoard(board());
    expect(mayMove(b.scraps.shared, BO)).toBe(true);
    expect(mayMove(b.scraps.mine, BO)).toBe(false);
    expect(mayMove(b.scraps.hush, BO)).toBe(false);
    expect(isOpen(b.scraps.hush)).toBe(false);
    // (a place is never public, whatever its JSON says)
    expect(b.scraps.grip.open).toBe(false);
    expect(mayMove(b.scraps.grip, BO)).toBe(false);
  });

  it("only its maker and the GM switch it", () => {
    const b = board();
    expect(mayShare(b.scraps.mine, ANA)).toBe(true);
    expect(mayShare(b.scraps.mine, BO)).toBe(false);
    expect(mayShare(b.scraps.shared, BO)).toBe(false);
    expect(mayShare(b.scraps.gmNote, ANA)).toBe(false);
    expect(mayShare(b.scraps.gmNote, GM)).toBe(true);
    expect(mayShare(b.scraps.grip, GM)).toBe(false);
    expect(sharePatch(b, null, { scraps: ["mine", "shared", "gmNote"] }, true, ANA)).toEqual({ scraps: { mine: { open: true } } });
    expect(sharePatch(b, null, { scraps: ["mine"] }, true, BO)).toBeNull();
    expect(sharePatch(b, null, { scraps: ["shared"] }, false, ANA)).toEqual({ scraps: { shared: { open: false } } });
    expect(sharePatch(b, null, { scraps: ["gmNote", "grip"] }, true, GM)).toEqual({ scraps: { gmNote: { open: true } } });
  });

  it("a string goes public with its name tag and the thread it hangs by", () => {
    const raw = board();
    raw.links.anaString.open = false;
    applyPatch(raw, labelPatch(raw, "anaString", "the way down", look, size, measure, { author: "ana" }));
    const view = boardView(look, normalizeBoard(raw), "gm", size, measure);
    const named = view.links.find((l) => l.id === "anaString");
    expect(named.nameNote).toBeTruthy();
    const p = sharePatch(raw, view, { links: ["anaString"] }, true, ANA);
    expect(p.links.anaString).toEqual({ open: true });
    expect(p.links[named.threads[0]]).toEqual({ open: true });
    expect(p.scraps[named.nameNote]).toEqual({ open: true });
  });

  it("the controls let another player select, move, size, and turn a public note, never a private one", () => {
    const raw = board();
    const c = new BoardControls(host(BO, raw));
    expect(c.press("move", { x: 1400, y: 1200 })).toEqual({ do: "select" });
    expect([...c.selection]).toEqual(["shared"]);
    expect(c.wheel(1, { ctrl: true }).scraps.shared.r).toBeTypeOf("number");
    c.press("move", { x: 800, y: 1200 });
    expect(c.selection.size).toBe(0);
    expect(c.double("move", { x: 1400, y: 1200 })).toEqual({ do: "edit", key: "shared" });
    expect(c.double("move", { x: 800, y: 1200 })).toBeNull();
  });

  it("the Public switch takes the selection one way: public unless all of it is", () => {
    const raw = board();
    const c = new BoardControls(host(ANA, raw));
    c.selection.add("mine");
    c.selection.add("shared");
    expect(c.shareState()).toEqual({ on: true, n: 2 });
    expect(c.sharePatch()).toEqual({ scraps: { mine: { open: true } } });
    c.selection.delete("mine");
    expect(c.shareState().on).toBe(false);
    const b = new BoardControls(host(BO, raw));
    b.selection.add("shared");
    expect(b.shareState()).toBeNull();
  });

  it("the pointer says whose a note is once it rests there", async () => {
    const raw = board();
    const c = new BoardControls(host(BO, raw));
    c.hover({ x: 1400, y: 1200 }, "move");
    expect(c.marks().whose).toBeNull();
    c.over.since -= BoardControls.OWNER_MS + 1;
    expect(c.marks().whose).toEqual({ kind: "note", author: "ana", open: true });
  });

  it("strokes on a card a player may change are theirs to move or rub out", () => {
    const b = normalizeBoard(board());
    expect(mayStroke("gm", b.scraps.shared, BO)).toBe(true);
    expect(mayStroke("gm", b.scraps.mine, BO)).toBe(false);
    expect(mayStroke("bo", b.scraps.mine, BO)).toBe(true);
  });

  it("their undo reaches public things, not what has since become someone's own again", () => {
    const raw = board();
    const rec = { ops: [{ path: ["scraps", "shared", "x"], b: 1400, a: 1500 }] };
    expect(mayHistory(raw, rec, "before", BO)).toBe(true);
    raw.scraps.shared.open = false;
    expect(mayHistory(raw, rec, "before", BO)).toBe(false);
  });

  it("anyone may take a public note off, into the bin", () => {
    expect(ownCardsOf(board(), ["shared"], BO)).toEqual(["shared"]);
    expect(ownCardsOf(board(), ["mine"], BO)).toBeNull();
  });
});

describe("a player's edit, checked on the GM's side (playerPatchOf)", () => {
  const view = (raw) => boardView(look, normalizeBoard(raw), "gm", size, measure);
  const layoutOf = (raw) => (key) => view(raw).scraps.find((s) => s.key === key);

  it("moves, sizes, and turns a public note, and its writing's place and size", () => {
    const raw = board();
    const p = playerPatchOf(raw, { scraps: { shared: { x: 1500, y: 1250, s: 1.5, r: 12, parts: { text: { u: 0.1, v: 0.2, w: 0.7 } }, textSize: 0.5 } } }, BO, look);
    expect(p.scraps.shared).toEqual({ x: 1500, y: 1250, s: 1.5, r: 12, parts: { text: { u: 0.1, v: 0.2, w: 0.7 } }, textSize: 0.5 });
  });

  it("refuses the lot for anything not theirs, a place, a field they can't set, or past the largest size", () => {
    const raw = board();
    expect(playerPatchOf(raw, { scraps: { mine: { x: 1, y: 1 } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { grip: { x: 1, y: 1 } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { shared: { seed: 3 } } }, BO, look)).toBeNull();
    // (a lock, theirs or a public one's: Luke 2026-10-24)
    expect(playerPatchOf(raw, { scraps: { shared: { locked: true } } }, BO, look).scraps.shared).toEqual({ locked: true });
    expect(playerPatchOf(raw, { scraps: { shared: { open: false } } }, ANA, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { shared: { s: 9 } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { shared: { parts: { clip: { u: 0, v: 0 } } } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { shared: { text: "rewritten" } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { shared: { x: 1, y: 1 } }, marks: {} }, BO, look)).toBeNull();
  });

  it("a public string's loose end moved, through the strings' own check", () => {
    const raw = board();
    const p = playerPatchOf(raw, { link: ["anaString", { aPt: { x: 950, y: 1550 } }] }, BO, look);
    expect(p.links.anaString).toEqual({ aPt: { x: 950, y: 1550 } });
    raw.links.anaString.open = false;
    expect(playerPatchOf(raw, { link: ["anaString", { aPt: { x: 950, y: 1550 } }] }, BO, look)).toBeNull();
  });

  it("a note's writing dragged off: writing of its own, made again from the note, whatever was sent", () => {
    const raw = board();
    const c = new BoardControls(host(BO, raw));
    c.selection.add("shared");
    const vs = c.host.view().scraps.find((s) => s.key === "shared");
    const text = vs.layout.parts.find((p) => p.id === "text");
    expect(c.dragStart({ x: text.x, y: text.y })).toBe("part");
    const out = c.dragMove({ x: 2600, y: 2600 });
    const [k, w] = Object.entries(out.newScraps)[0];
    expect(w).toMatchObject({ type: "scrawl", text: "anyone's", author: "ana", open: true, x: 2600, y: 2600 });
    expect(out.scraps.shared).toMatchObject({ text: "", drop: ["text"] });
    // (the GM's side takes only where it was let go)
    const sent = { ...out, newScraps: { [k]: { ...w, text: "something else", author: "bo", open: false } } };
    const p = playerPatchOf(raw, sent, BO, look, { layoutOf: layoutOf(raw) });
    expect(p.newScraps[k]).toMatchObject({ type: "scrawl", text: "anyone's", author: "ana", open: true });
    expect(p.scraps.shared).toMatchObject({ text: "", drop: ["text"] });
    // (the note left blank draws no writing)
    applyPatch(raw, p);
    expect(view(raw).scraps.find((s) => s.key === "shared").layout.lines).toEqual([]);
    expect(view(raw).scraps.find((s) => s.key === k).layout.lines.length).toBeGreaterThan(0);
  });

  it("writing sent without its note's writing coming off is refused", () => {
    const raw = board();
    expect(playerPatchOf(raw, { newScraps: { w9: { type: "scrawl", text: "x", x: 1, y: 1 } } }, BO, look, { layoutOf: layoutOf(raw) })).toBeNull();
  });

  it("a note's own pin let off it: a pin of the board's, the note's maker's, public as it was", () => {
    const raw = board();
    const p = playerPatchOf(raw, { scraps: { shared: { pinOff: true } }, pins: { pin1: { tex: "tx/pin", x: 40, y: 40 } } }, BO, look);
    expect(p.pins.pin1).toEqual({ tex: "tx/pin", x: 40, y: 40, author: "ana", open: true });
    // (a pin with no card piece to come from is a string's, and theirs)
    const q = playerPatchOf(raw, { pins: { pin2: { tex: "tx/pin", x: 40, y: 40 } } }, BO, look);
    expect(q.pins.pin2.author).toBe("bo");
  });

  it("a web off a note: a loose piece, the note's maker's; never another texture", () => {
    const raw = board();
    const p = playerPatchOf(raw, { scraps: { shared: { drop: ["x0"] } }, bits: { bit1: { tex: WEB_TEX, x: 10, y: 10, w: 60 } } }, BO, look);
    expect(p.bits.bit1).toMatchObject({ tex: WEB_TEX, author: "ana", open: true });
    expect(playerPatchOf(raw, { scraps: { shared: { drop: ["x0"] } }, bits: { bit1: { tex: "tx/other", x: 10, y: 10 } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { bits: { bit1: { tex: WEB_TEX, x: 10, y: 10 } } }, BO, look)).toBeNull();
  });
});

describe("a note's writing fits its paper (Luke, 2026-10-24)", () => {
  const note = (text, extra = {}) => normalizeBoard({ scraps: { n: { type: "note", text, x: 500, y: 500, paper: "tx/paper", ...extra } } }).scraps.n;
  const lay = (s, opts) => scrapLayout(s, look, size, measure, null, opts);

  it("as large as fits, never past the paper's room", () => {
    for (const text of ["hi", "a few words on a note", "a great deal more writing than any note should carry, on and on, line after line"]) {
      const L = lay(note(text));
      const box = L.parts.find((p) => p.id === "text");
      const px = L.lines[0].size;
      for (const ln of L.lines) expect(ln.w).toBeLessThanOrEqual(box.w + 0.01);
      expect(L.lines.length * px * 0.95).toBeLessThanOrEqual(L.box.h);
    }
    expect(lay(note("hi")).lines[0].size).toBeGreaterThan(lay(note("a few words on a note")).lines[0].size);
  });

  it("its paper keeps its size whatever it says; Text size makes the writing smaller", () => {
    const short = lay(note("hi"));
    const long = lay(note("a great deal more writing than any note should carry, on and on, line after line, and more"));
    expect(long.box.w).toBeCloseTo(short.box.w, 6);
    const half = lay(note("a few words", { textSize: 0.5 }));
    expect(half.lines[0].size).toBe(Math.max(4, Math.round(lay(note("a few words")).lines[0].size * 0.5)));
  });

  it("fitText: the largest whose lines all fit", () => {
    const px = fitText("one two three four", measure, 100, 100);
    expect(px).toBeGreaterThan(4);
    // (one step larger no longer fits)
    expect(fitText("one two three four", (t, p) => (p > px ? 1e6 : measure(t, p)), 100, 100)).toBe(px);
    expect(fitText("one two three four", measure, 100, 100, "memo")).toBe(px);
  });

  it("an older board's grown notes keep their size, their strokes theirs; once (notesEd)", () => {
    const long = "a great deal more writing than any note should carry, on and on, line after line, and more besides";
    const raw = { scraps: { n: { type: "note", text: long, x: 500, y: 500, paper: "tx/paper", marks: { m1: { c: 0, w: 6, pts: [0, 0, 0.2, 0.1] } } } }, bin: { b: { at: 1, scrap: { type: "note", text: long, x: 1, y: 1, paper: "tx/paper" } } } };
    const before = lay(normalizeBoard(raw).scraps.n, { legacy: true });
    expect(before.grew).toBeGreaterThan(1);
    const { board: b, changed } = tidyBoard(raw, look, size, measure);
    expect(changed).toBe(true);
    expect(b.notesEd).toBe(NOTES_EDITION);
    const after = lay(normalizeBoard(b).scraps.n);
    expect(after.box.w).toBeCloseTo(before.box.w, 0);
    expect(b.scraps.n.s).toBeCloseTo(before.grew, 2);
    expect(b.scraps.n.marks.m1.pts[2]).toBeCloseTo(0.2 / b.scraps.n.s, 3);
    expect(b.bin.b.scrap.s).toBeGreaterThan(1);
    // (never twice)
    expect(tidyBoard(b, look, size, measure).board.scraps.n.s).toBe(b.scraps.n.s);
    expect(fitNotes({ scraps: { t: { type: "note", text: "hi", x: 1, y: 1, paper: "tx/paper" } } }, look, size, measure)).toBe(0);
  });
});

describe("turned writing sized by its corner (Luke, 2026-10-24)", () => {
  // (Luke, 2026-10-25: sized from the outline as shown, its top-left corner
  // staying put, the writing filling the box; let go, the outline fits the
  // writing again and the next sizing starts from it)
  for (const r of [0, 35, 90, -120]) {
    it(`turned ${r} degrees: its top-left corner stays put, the writing grows to fill, no jump the next time`, () => {
      const raw = { scraps: { n: { type: "note", text: "turned writing on a note", x: 800, y: 800, paper: "tx/paper", r: 10, parts: { text: { u: 0.05, v: 0.05, r } } } } };
      const c = new BoardControls(host(GM, raw));
      // (the outline round the writing, as shown and sized)
      const frame = () => {
        const s = c.host.view().scraps[0];
        const p = s.layout.parts.find((q) => q.id === "text");
        return { x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot, px: s.layout.lines[0].size };
      };
      const corner = (f) => { const cs = Math.cos(f.rot), sn = Math.sin(f.rot); return { x: f.x - (f.w / 2) * cs + (f.h / 2) * sn, y: f.y - (f.w / 2) * sn - (f.h / 2) * cs }; };
      c.part = { key: "n", id: "text" };
      const f0 = frame();
      const b = c.bounds();
      expect(c.dragStart(b.handle)).toBe("size");
      // (a pull of nothing: the writing set at the outline's top-left, within it)
      applyPatch(raw, c.dragMove(b.handle));
      const f1 = frame();
      expect(corner(f1).x).toBeCloseTo(corner(f0).x, 0);
      expect(corner(f1).y).toBeCloseTo(corner(f0).y, 0);
      expect(f1.w).toBeLessThanOrEqual(f0.w + 1);
      expect(f1.h).toBeLessThanOrEqual(f0.h + 1);
      // (a pull outward: the writing larger, the top-left corner where it was)
      applyPatch(raw, c.dragMove({ x: b.handle.x + 40 * Math.cos(f0.rot) - 30 * Math.sin(f0.rot), y: b.handle.y + 40 * Math.sin(f0.rot) + 30 * Math.cos(f0.rot) }));
      const f2 = frame();
      expect(corner(f2).x).toBeCloseTo(corner(f0).x, 0);
      expect(corner(f2).y).toBeCloseTo(corner(f0).y, 0);
      expect(f2.rot).toBeCloseTo(f0.rot, 6);
      expect(f2.px).toBeGreaterThan(f1.px);
      // (let go, then taken again by its corner: nothing moves or changes size)
      c.dragEnd();
      const b2 = c.bounds();
      expect(c.dragStart(b2.handle)).toBe("size");
      applyPatch(raw, c.dragMove(b2.handle));
      const f3 = frame();
      expect(f3.px).toBe(f2.px);
      expect(f3.w).toBeCloseTo(f2.w, 0);
      expect(f3.h).toBeCloseTo(f2.h, 0);
      expect(corner(f3).x).toBeCloseTo(corner(f2).x, 0);
      expect(corner(f3).y).toBeCloseTo(corner(f2).y, 0);
    });
  }
});

describe("the note window's preview (Luke, 2026-10-24)", () => {
  it("lays the note out as the board would, framed to the preview", () => {
    const P = notePreview({ key: "n1", type: "note", text: "below the Grip", x: 700, y: 900, paper: "tx/paper" }, look, size, measure, 480, 260);
    const L = scrapLayout(normalizeBoard({ scraps: { n1: { type: "note", text: "below the Grip", x: 700, y: 900, paper: "tx/paper" } } }).scraps.n1, look, size, measure);
    expect(P.scrap.layout.lines.map((l) => [l.text, l.size])).toEqual(L.lines.map((l) => [l.text, l.size]));
    expect(P.scrap.text).toBe("");
    const c = { x: L.box.cx * P.k + P.ox, y: L.box.cy * P.k + P.oy };
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(480);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(260);
  });

  it("a new note's paper is picked at once, another when asked", () => {
    const two = normalizeLook({ pools: { notes: ["tx/paper", "tx/paper2"] } });
    const sz = (id) => (id.startsWith("tx/paper") ? { w: 300, h: 400, cover: 1 } : null);
    expect(pickNotePaper(two, sz, null, () => 0)).toBe("tx/paper");
    expect(pickNotePaper(two, sz, "tx/paper", () => 0)).toBe("tx/paper2");
  });

  it("breakAwayPatch keeps the note's hand and paint, the size it was written", () => {
    const raw = { scraps: { n: { type: "note", text: "keep this", x: 500, y: 500, paper: "tx/paper", hand: "Caveat", paint: 3, bright: 2 } } };
    const vs = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0];
    const p = breakAwayPatch(raw, vs, { x: 10, y: 20 }, look);
    const w = Object.values(p.newScraps)[0];
    expect(w).toMatchObject({ type: "scrawl", hand: "Caveat", paint: 3, bright: 2, x: 10, y: 20 });
    const written = scrapLayout(normalizeBoard({ scraps: { w } }).scraps.w, look, size, measure);
    expect(Math.abs(written.lines[0].size - vs.layout.lines[0].size)).toBeLessThanOrEqual(1);
  });
});

describe("writing in a box shaped by hand (Luke, 2026-10-25)", () => {
  it("fills the box as far as it can, from its top-left corner, the outline hugging the writing", () => {
    const raw = { scraps: { n: { type: "note", text: "JOHNSON", x: 800, y: 800, paper: "tx/paper", r: 0, parts: { text: { u: 0, v: 0.1, w: 0.8, h: 1.6, fs: 0.01 } } } } };
    const s = boardView(look, normalizeBoard(raw), "gm", size, measure).scraps[0];
    const p = s.layout.parts.find((q) => q.id === "text");
    const B = s.layout.box;
    const bw = 0.8 * B.w;
    const bh = 1.6 * B.h;
    // (one word in a tall box: as wide as the box lets it, never wider; a
    // size kept from before, fs, set aside)
    expect(p.w).toBeLessThanOrEqual(bw + 0.5);
    expect(p.w).toBeGreaterThan(bw * 0.9);
    expect(p.h).toBeLessThan(bh * 0.5);
    // (its top-left corner the box's)
    expect(p.x - p.w / 2).toBeCloseTo(B.cx - bw / 2, 0);
    expect(p.y - p.h / 2).toBeCloseTo(B.cy + 0.1 * B.h - bh / 2, 0);
    expect(p.box).toEqual({ x: p.x, y: p.y, w: p.w, h: p.h });
  });
});

describe("a note stretched by its corner (Luke, 2026-10-24)", () => {
  const one = () => ({ scraps: { n: { type: "note", text: "stretch me", x: 800, y: 800, paper: "tx/paper", r: 0 } } });
  it("one note alone: its width and height apart, its top-left corner staying put", () => {
    const raw = one();
    const c = new BoardControls(host(GM, raw));
    c.selection.add("n");
    const B0 = c.host.view().scraps[0].layout.box;
    const b = c.bounds();
    expect(c.dragStart(b.handle)).toBe("size");
    applyPatch(raw, c.dragMove({ x: b.handle.x, y: b.handle.y + 120 }));
    const B1 = c.host.view().scraps[0].layout.box;
    expect(B1.w).toBeCloseTo(B0.w, 0);
    expect(B1.h).toBeCloseTo(B0.h + 120, 0);
    expect(B1.cx - B1.w / 2).toBeCloseTo(B0.cx - B0.w / 2, 0);
    expect(B1.cy - B1.h / 2).toBeCloseTo(B0.cy - B0.h / 2, 0);
    expect(raw.scraps.n.ar).toBeCloseTo(B1.w / B1.h, 2);
  });
  it("Shift keeps its shape; several cards size together as before", () => {
    const raw = one();
    const c = new BoardControls(host(GM, raw));
    c.selection.add("n");
    const b = c.bounds();
    c.dragStart(b.handle, { shift: true });
    expect(c.dragMove({ x: b.handle.x + 50, y: b.handle.y + 50 }).scraps.n.ar).toBeUndefined();
  });
  it("a player's stretch passes the GM's check; a place's shape never", () => {
    const raw = board();
    expect(playerPatchOf(raw, { scraps: { shared: { s: 1.2, ar: 0.5, x: 1, y: 1 } } }, BO, look).scraps.shared.ar).toBe(0.5);
    expect(playerPatchOf(raw, { scraps: { shared: { ar: 99 } } }, BO, look)).toBeNull();
    expect(playerPatchOf(raw, { scraps: { grip: { ar: 1 } } }, GM, look)).toBeNull();
  });
});

describe("the hover outline (Luke, 2026-10-24)", () => {
  it("on what a press would take, theirs or public; never another's own", () => {
    const raw = board();
    const c = new BoardControls(host(BO, raw));
    c.hover({ x: 1400, y: 1200 }, "move");
    expect(c.marks().hot).toMatchObject({ key: "c:shared", open: true });
    c.hover({ x: 800, y: 1200 }, "move");
    expect(c.marks().hot).toBeNull();
    const a = new BoardControls(host(ANA, raw));
    a.hover({ x: 800, y: 1200 }, "move");
    expect(a.marks().hot).toMatchObject({ key: "c:mine", open: false });
    // (not on what is already selected)
    a.selection.add("mine");
    a.hover({ x: 801, y: 1201 }, "move");
    expect(a.marks().hot).toBeNull();
  });
});

describe("the brush's Select restyles its strokes (Luke, 2026-10-24)", () => {
  it("paint, brightness, width, and opacity on every selected stroke this user may change", () => {
    const raw = { scraps: { n: { type: "note", text: "x", x: 500, y: 500, paper: "tx/paper", s: 2, marks: { m1: { by: "ana", c: 0, w: 3, pts: [0, 0, 0.1, 0.1] } } } }, marks: { ana: { m1: { c: 0, w: 6, pts: [10, 10, 40, 40] } }, bo: { m1: { c: 0, w: 6, pts: [60, 60, 90, 90] } } } };
    const c = new BoardControls(host(ANA, raw));
    c.markSel = new Set([JSON.stringify(["ana", "m1"]), JSON.stringify(["bo", "m1"]), JSON.stringify(["@n", "m1"])]);
    const p = c.restylePatch({ c: 5, b: 2, w: 10, o: 0.5 });
    expect(p.marks.ana.m1).toMatchObject({ c: 5, b: 2, w: 10, o: 0.5 });
    expect(p.marks.bo).toBeUndefined();
    expect(p.scraps.n.marks.m1).toMatchObject({ c: 5, w: 5 });
    c.markSel.clear();
    expect(c.restylePatch({ c: 1 })).toBeNull();
  });
});
