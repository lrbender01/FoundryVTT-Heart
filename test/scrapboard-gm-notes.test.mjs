/**
 * GM notes on the board (Plenty finish item 2, 2026-10-26): a GM note is
 * `state: 'hidden'` plus `gm: true`. Players never see it, the GM sees it in
 * full (look 'gm', not a ghost), Reveal leaves it alone, and the GM's "GM
 * notes" switch drops it from the GM's own view only.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, revealPatch, withoutGmNotes, gmNoteFields } from "../src/map/scrapboard/model.js";

const SIZES = {
  "tx/paper__portrait__a": { w: 300, h: 400, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/paper__landscape__n": { w: 400, h: 300, safe: [0.1, 0.1, 0.9, 0.9], cover: 0.64 },
  "tx/fixtures__fixture_grey_tack_small": { w: 40, h: 50 },
  "tx/fixtures__fixture_red_pushpin_long": { w: 40, h: 70 },
  "tx/fixtures__tape": { w: 100, h: 30 },
};
const size = (id) => SIZES[id] ?? null;
const measure = (text, px) => String(text).length * px * 0.5;
const L = normalizeLook({
  pools: {
    papers: ["tx/paper__portrait__a"],
    notes: ["tx/paper__landscape__n"],
    pins: ["tx/fixtures__fixture_grey_tack_small"],
    tapes: ["tx/fixtures__tape"],
    ends: { delve: ["tx/fixtures__fixture_red_pushpin_long"] },
  },
  library: { grip: { name: "Grip Station", tier: 1 } },
});

const raw = {
  scraps: {
    grip: { lib: "grip", x: 300, y: 300 },
    secret: { type: "note", text: "Bramble's body is in the barn", x: 900, y: 300, state: "hidden", gm: true },
    later: { type: "note", text: "a clue", x: 1200, y: 900, state: "hidden" },
  },
  links: {
    toGm: { a: "grip", b: "secret", kind: "delve" },
    toLater: { a: "grip", b: "later", kind: "delve" },
  },
  pins: {
    gmPin: { tex: "tx/fixtures__fixture_grey_tack_small", x: 1500, y: 1500, state: "hidden", gm: true },
    onGm: { tex: "tx/fixtures__fixture_grey_tack_small", on: "secret", at: { u: 0.5, v: 0.5 } },
  },
};

describe("GM notes", () => {
  it("keeps gm through normalize for cards, strings, and pins", () => {
    const B = normalizeBoard({ ...raw, links: { ...raw.links, g: { a: "grip", b: "later", gm: true, state: "hidden" } } });
    expect(B.scraps.secret.gm).toBe(true);
    expect(B.scraps.secret.state).toBe("hidden");
    expect(B.scraps.later.gm).toBe(false);
    expect(B.links.g.gm).toBe(true);
    expect(B.pins.gmPin.gm).toBe(true);
  });

  it("never shows a GM note, its pins, or its strings to players", () => {
    const P = boardView(L, normalizeBoard(raw), "player", size, measure);
    expect(P.scraps.map((s) => s.key)).toEqual(["grip"]);
    expect(P.pins).toEqual([]);
    expect(P.links).toEqual([]);
  });

  it("draws a GM note in full for the GM, and a plain hidden note as a ghost", () => {
    const G = boardView(L, normalizeBoard(raw), "gm", size, measure);
    const by = (k) => G.scraps.find((s) => s.key === k);
    expect(by("secret").look).toBe("gm");
    expect(by("later").look).toBe("ghost");
    expect(G.pins.find((p) => p.id === "gmPin").look).toBe("gm");
    expect(G.pins.find((p) => p.id === "onGm").look).toBe("gm");
    expect(G.links.find((l) => l.id === "toGm").look).toBe("gm");
    expect(G.links.find((l) => l.id === "toLater").look).toBe("ghost");
  });

  it("reads as a hidden ghost to anything that ignores gm (an older client)", () => {
    const { gm, ...old } = raw.scraps.secret;
    void gm;
    const G = boardView(L, normalizeBoard({ scraps: { secret: old } }), "gm", size, measure);
    expect(G.scraps[0].look).toBe("ghost");
    const P = boardView(L, normalizeBoard({ scraps: { secret: old } }), "player", size, measure);
    expect(P.scraps).toEqual([]);
  });

  it("is never revealed", () => {
    const B = normalizeBoard(raw);
    expect(revealPatch({ scrap: B.scraps.secret, to: "known" })).toBeNull();
    expect(revealPatch({ pin: B.pins.gmPin, to: "known" })).toBeNull();
    expect(revealPatch({ link: { id: "x", gm: true }, to: "known" })).toBeNull();
    expect(revealPatch({ scrap: B.scraps.later, to: "known" })).toEqual({ scraps: { later: { state: "known" } } });
  });

  it("is dropped from the GM's own view by the switch, with what hangs from it", () => {
    const G = withoutGmNotes(boardView(L, normalizeBoard(raw), "gm", size, measure));
    expect(G.scraps.map((s) => s.key).sort()).toEqual(["grip", "later"]);
    expect(G.pins).toEqual([]);
    expect(G.links.map((l) => l.id)).toEqual(["toLater"]);
  });

  it("gives the note window's switch its fields", () => {
    expect(gmNoteFields(true)).toEqual({ gm: true, state: "hidden" });
    expect(gmNoteFields(false, { gm: true })).toEqual({ gm: false });
    expect(gmNoteFields(false, { gm: false })).toEqual({});
    expect(gmNoteFields(false)).toEqual({});
  });
});
