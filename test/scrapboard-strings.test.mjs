/**
 * Strings (Luke, 2026-10-06): a string run on from another (Ctrl+drag, the
 * Ctrl chain) is shown or hidden as that one is; Reveal takes the whole run
 * of strings joined end to end, up to where it branches or ends (name tags'
 * threads aren't breaks, and come along); a Ctrl chain's line follows the
 * pointer; the players' strings can be seen alone.
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, boardView, newStringPatch, applyPatch } from "../src/map/scrapboard/model.js";
import { BoardControls } from "../src/map/scrapboard/controls.js";

const size = () => null;
const measure = (text, px) => String(text).length * px * 0.5;
const look = normalizeLook({ pools: { pins: ["tx/pin"], ends: { delve: ["tx/pin"], rail: [], path: [] } } });
const pin = (x, y) => ({ tex: "tx/pin", x, y });
const GM = { id: "gm", isGM: true };
const live = (raw, user = GM) => {
  const box = { raw: structuredClone(raw) };
  const c = new BoardControls({ view: () => boardView(look, normalizeBoard(box.raw), user.isGM ? "gm" : "player", size, measure), painter: () => ({ tagOf: () => null, onTag: () => false }), size, user: () => user, px: () => 1, raw: () => box.raw });
  return { c, box };
};
// (a point on a string clear of its pins: three quarters along)
const midOf = (c, id) => { const l = c.host.view().links.find((x) => x.id === id); const i = 2 * Math.floor((l.points.length / 2) * 0.75); return { x: l.points[i], y: l.points[i + 1] }; };

// a run a-b-c-d (three strings end to end), a branch at c (to e), and a
// name tag hung from a joint pin of the first
const RUN = {
  scraps: { t1: { type: "note", tag: true, text: "The Rails", x: 600, y: 900 } },
  pins: { a: pin(200, 500), b: pin(800, 500), c: pin(1400, 500), d: pin(2000, 500), e: pin(1400, 1200), j: pin(500, 520), tp: { tex: "tx/pin", on: "t1", at: { u: 0, v: -0.4 } } },
  links: {
    s1: { kind: "rail", aPin: "a", bPin: "b", joints: [{ pin: "j" }] }, s2: { kind: "rail", aPin: "b", bPin: "c" }, s3: { kind: "rail", aPin: "c", bPin: "d" },
    br: { kind: "path", aPin: "c", bPin: "e" }, th: { kind: "rail", aPin: "j", bPin: "tp" },
  },
};

describe("Reveal takes the whole run (Luke, 2026-10-06)", () => {
  it("up to where it branches; a name tag's thread is no break, and comes along", () => {
    const { c } = live(RUN);
    const a = c.press("reveal", midOf(c, "s1"));
    expect(a).toMatchObject({ do: "reveal", to: "hidden" });
    // (s1 and s2 meet end to end at b; at c three strings meet: the run stops)
    expect(a.also.links.sort()).toEqual(["s2", "th"]);
    expect(a.also.scraps).toEqual(["t1"]);
  });

  it("a string with nothing joined end to end is a run of one", () => {
    const { c } = live(RUN);
    const a = c.press("reveal", midOf(c, "br"));
    expect(a.also.links).toEqual([]);
  });
});

describe("a string run on from another is shown or hidden as it is", () => {
  it("Ctrl+drag from a hidden string's pin: the new one is hidden", () => {
    const raw = structuredClone(RUN);
    raw.links.s3.state = "hidden";
    const { c } = live(raw);
    expect(c.dragStart({ x: 2000, y: 500 }, { ctrl: true })).toBe("string");
    c.dragMove({ x: 2400, y: 900 });
    const a = c.dragEnd();
    expect(a).toMatchObject({ do: "string", quick: true, state: "hidden" });
    const { patch, id } = newStringPatch(raw, a, a.kind ?? "rail", look, { state: a.state });
    applyPatch(raw, patch);
    expect(raw.links[id].state).toBe("hidden");
    // (and the chain on from it, Ctrl still held)
    c.chainFrom(raw.links[id].bPin, { x: 2400, y: 900 });
    expect(c.press("move", { x: 2600, y: 1300 }, { ctrl: true })).toMatchObject({ do: "string", state: "hidden" });
  });

  it("a Ctrl chain's next line follows the pointer", () => {
    const { c } = live(RUN);
    c.chaining = true;
    c.chainFrom("d", { x: 2000, y: 500 });
    expect(c.marks({ pointer: { x: 2300, y: 800 } }).line).toEqual([{ x: 2000, y: 500 }, { x: 2300, y: 800 }]);
  });
});
