/**
 * Live previews (Luke, 2026-10-25): what each user is doing on the map, sent
 * to everyone else as it happens and never written (live.js). A peer's state
 * as its messages come, what is let go once the board changes or time
 * passes, and the sender's pace and its stroke parts.
 */

import { describe, it, expect } from "vitest";
import { livePeer, livePeerAfterUpdate, livePeerAt, liveShows, LiveSender, END_HOLD_MS, STALE_MS, landingOf, landedOn } from "../src/map/scrapboard/live.js";

const msg = (t, extra = {}, seq = 0) => ({ t, from: "ana", scene: "s1", seq, ...extra });

describe("a peer as its messages come", () => {
  it("a stroke grows by the parts sent; a part missed waits for the next whole", () => {
    let p = livePeer(null, msg("stroke", { base: 0, pts: [0, 0, 5, 5], brush: { c: 2, w: 8 } }, 0), 1000);
    expect(p.stroke.pts).toEqual([0, 0, 5, 5]);
    p = livePeer(p, msg("stroke", { base: 4, pts: [9, 9] }, 1), 1100);
    expect(p.stroke.pts).toEqual([0, 0, 5, 5, 9, 9]);
    const missed = livePeer(p, msg("stroke", { base: 10, pts: [1, 1] }, 2), 1200);
    expect(missed.stroke.pts).toHaveLength(6);
    // (a new stroke starts again from nothing)
    expect(livePeer(p, msg("stroke", { base: 0, pts: [3, 3, 4, 4] }, 3)).stroke.pts).toEqual([3, 3, 4, 4]);
  });

  it("an older message after a newer one is passed over", () => {
    const p = livePeer(null, msg("drag", { patch: { scraps: { n1: { x: 5 } } } }, 5));
    expect(livePeer(p, msg("drag", { patch: { scraps: { n1: { x: 1 } } } }, 4)).drag.scraps.n1.x).toBe(5);
  });

  it("a string half tied, cleaned; idle puts it down", () => {
    let p = livePeer(null, msg("string", { string: { from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, kind: "nope", color: 3 } }, 1));
    expect(p.string).toEqual({ from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, kind: "plain", color: 3, pin: null, plainPins: false });
    p = livePeer(p, msg("idle", {}, 2));
    expect(p.string).toBeNull();
  });

  it("another user's doodle in hand is never shown (Luke, 2026-10-25)", () => {
    const p = livePeer(null, msg("doodle", { doodle: { kind: "star", seed: "star:1", at: { x: 1, y: 2 }, size: 50, brush: { c: 1 } } }, 0));
    expect(p.doodle).toBeUndefined();
    expect(liveShows(p)).toBe(false);
  });

  it("another scene: a fresh peer", () => {
    const p = livePeer(null, msg("drag", { patch: { scraps: {} } }, 9));
    expect(livePeer(p, { ...msg("idle", {}, 0), scene: "s2" }).scene).toBe("s2");
  });

  it("let go: what it ended stays until the board changes, or END_HOLD_MS", () => {
    let p = livePeer(null, msg("drag", { patch: { scraps: { n1: { x: 5 } } } }, 0), 1000);
    p = livePeer(p, msg("end", {}, 1), 1100);
    expect(p.drag).toBeTruthy();
    expect(livePeerAfterUpdate(p).drag).toBeNull();
    expect(livePeerAt(p, 1100 + END_HOLD_MS - 1).drag).toBeTruthy();
    expect(livePeerAt(p, 1100 + END_HOLD_MS + 1).drag).toBeNull();
    expect(livePeerAt(p, 1100 + STALE_MS + 1)).toBeNull();
    expect(liveShows(livePeerAfterUpdate(p))).toBe(false);
  });
});

describe("the sender", () => {
  const harness = (on = true) => {
    const sent = [];
    let fire = null;
    const timers = { setTimeout: (fn) => { fire = fn; return 1; }, clearTimeout: () => { fire = null; } };
    const s = new LiveSender({ emit: (m) => sent.push(m), scene: () => "s1", on: () => on, timers });
    return { s, sent, tick: () => fire?.() };
  };

  it("gathers a stroke's new points and sends them at its own pace", () => {
    const { s, sent, tick } = harness();
    s.stroke([0, 0, 1, 1], { c: 1 });
    s.stroke([0, 0, 1, 1, 2, 2], { c: 1 });
    expect(sent).toHaveLength(0);
    tick();
    expect(sent).toEqual([{ t: "stroke", base: 0, pts: [0, 0, 1, 1, 2, 2], brush: { c: 1 }, on: null, scene: "s1", seq: 0 }]);
    s.stroke([0, 0, 1, 1, 2, 2, 3, 3], { c: 1 });
    tick();
    expect(sent[1]).toMatchObject({ base: 6, pts: [3, 3] });
  });

  it("let go: what is queued goes first, then the end; the next stroke starts afresh", () => {
    const { s, sent } = harness();
    s.drag({ scraps: { n1: { x: 3 } } });
    s.end();
    expect(sent.map((m) => m.t)).toEqual(["drag", "end"]);
    s.stroke([5, 5, 6, 6], { c: 0 });
    s.flush();
    expect(sent.at(-1)).toMatchObject({ t: "stroke", base: 0 });
  });

  it("idle only once something was shown; nothing at all when switched off", () => {
    const { s, sent } = harness();
    s.idle();
    expect(sent).toHaveLength(0);
    s.string({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
    s.idle();
    expect(sent.map((m) => m.t)).toEqual(["idle"]);
    const off = harness(false);
    off.s.drag({});
    off.s.end();
    off.tick();
    expect(off.sent).toHaveLength(0);
  });

  it("has no doodle to send (Luke, 2026-10-25)", () => {
    expect(harness().s.doodle).toBeUndefined();
  });
});

describe("what this user just laid, held until the board shows it (Luke, 2026-10-25)", () => {
  const sheet = { marks: { ana: { m1: { c: 0, w: 8, pts: [0, 0, 10, 10] } } } };
  const card = { scraps: { n1: { marks: { m1: { c: 0, w: 2, by: "ana", pts: [0.1, 0.2, 0.3, 0.4] } } } } };

  it("a patch's new strokes: their places and points", () => {
    expect(landingOf(sheet)).toEqual([{ where: "ana", pts: [0, 0, 10, 10] }]);
    expect(landingOf(card)).toEqual([{ where: "@n1", pts: [0.1, 0.2, 0.3, 0.4] }]);
    // (strokes taken away land nothing)
    expect(landingOf({ marks: { ana: { m1: null } } })).toEqual([]);
    expect(landingOf(null)).toEqual([]);
  });

  it("shown once the board holds each, by its points, whatever its id", () => {
    const want = landingOf(sheet);
    expect(landedOn({ marks: {} }, want)).toBe(false);
    // (the GM gave it another id, in the player's layer)
    expect(landedOn({ marks: { ana: { m7: { c: 0, w: 8, pts: [0, 0, 10, 10] } } } }, want)).toBe(true);
    expect(landedOn({ marks: { ana: { m7: { c: 0, w: 8, pts: [0, 0, 10, 11] } } } }, want)).toBe(false);
    // (a card's, on that card only)
    const onCard = landingOf(card);
    expect(landedOn({ scraps: { n1: { marks: { k2: { pts: [0.1, 0.2, 0.3, 0.4] } } } } }, onCard)).toBe(true);
    expect(landedOn({ scraps: { n2: { marks: { k2: { pts: [0.1, 0.2, 0.3, 0.4] } } } } }, onCard)).toBe(false);
    // (a doodle: every one of its strokes)
    const doodle = landingOf({ marks: { ana: { a: { pts: [1, 1, 2, 2] }, b: { pts: [3, 3, 4, 4] } } } });
    expect(landedOn({ marks: { ana: { x: { pts: [1, 1, 2, 2] } } } }, doodle)).toBe(false);
    expect(landedOn({ marks: { ana: { x: { pts: [1, 1, 2, 2] }, y: { pts: [3, 3, 4, 4] } } } }, doodle)).toBe(true);
  });
});
