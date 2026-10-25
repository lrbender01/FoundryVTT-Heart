/**
 * Strings and their pins (Luke, 2026-10-25): a string's pins take its colour
 * unless the string says not (`plainPins`, the String window's switch and the
 * string's own window); a string taken off takes its pins that no string left
 * holds, so a fragment between two pins leaves none behind. And the doodles
 * window's place by the brush window (controls.js dockAt, snapSide).
 */

import { describe, it, expect } from "vitest";
import { normalizeLook, normalizeBoard, pinTint, newStringPatch, removalOf, takeOffPatch } from "../src/map/scrapboard/model.js";
import { dockAt, snapSide, DOCK_GAP } from "../src/map/scrapboard/controls.js";

const look = normalizeLook({ pools: { papers: [], notes: [], pins: ["tx/pin"], tapes: [] } });

describe("a string's pins in its colour, or their own", () => {
  it("they take its colour unless it says plainPins", () => {
    expect(pinTint(look, { kind: "path", color: 2 }, "tx/pin")).toBe(look.ink.marker[2]);
    expect(pinTint(look, { kind: "path", color: 2, plainPins: true }, "tx/pin")).toBeNull();
  });

  it("a new string carries the switch, and the board keeps it", () => {
    const { id, patch } = newStringPatch({ pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 500, y: 0 } }, "path", look, { color: 2, plainPins: true });
    expect(patch.newLinks[id].plainPins).toBe(true);
    const b = normalizeBoard({ scraps: {}, pins: patch.pins, links: patch.newLinks });
    expect(b.links[id].plainPins).toBe(true);
    const plain = newStringPatch({ pins: {} }, { aPt: { x: 0, y: 0 }, bPt: { x: 500, y: 0 } }, "path", look, { color: 2 });
    expect("plainPins" in plain.patch.newLinks[plain.id]).toBe(false);
  });
});

describe("a string taken off takes its own pins (Luke, 2026-10-25)", () => {
  const raw = () => ({
    scraps: {},
    pins: { a: { tex: "tx/pin", x: 0, y: 0 }, b: { tex: "tx/pin", x: 100, y: 0 }, j: { tex: "tx/pin", x: 50, y: 30 }, c: { tex: "tx/pin", x: 200, y: 0 } },
    links: {
      l1: { kind: "path", aPin: "a", bPin: "b", joints: [{ pin: "j" }] },
      l2: { kind: "path", aPin: "b", bPin: "c" },
    },
  });

  it("a fragment between two pins leaves none behind; a pin another string holds stays", () => {
    const r = removalOf(raw(), { links: ["l1"] });
    expect(r.links).toEqual(["l1"]);
    expect(r.pins.sort()).toEqual(["a", "j"]);
  });

  it("both strings off: every pin goes", () => {
    expect(removalOf(raw(), { links: ["l1", "l2"] }).pins.sort()).toEqual(["a", "b", "c", "j"]);
  });

  it("the patch takes them off", () => {
    const p = takeOffPatch(raw(), { links: ["l2"] });
    expect(p.links.l2).toBeNull();
    expect(p.pins).toEqual({ c: null });
  });
});

describe("the doodles window by the brush window (Luke, 2026-10-25)", () => {
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const room = { w: 1600, h: 1000 };

  it("on its right: its top bar level with the brush window's, as tall", () => {
    const D = dockAt(box(400, 500, 520, 300), box(0, 0, 220, 430), "auto", room);
    expect(D).toEqual({ side: "right", x: 920 + DOCK_GAP, y: 500, h: 300 });
  });

  it("no room on the right: its left; then above, as wide", () => {
    expect(dockAt(box(1300, 500, 280, 300), box(0, 0, 220, 430), "auto", room)).toMatchObject({ side: "left", x: 1300 - DOCK_GAP - 220, y: 500, h: 300 });
    expect(dockAt(box(100, 500, 1400, 300), box(0, 0, 220, 430), "auto", room)).toMatchObject({ side: "top", x: 100, y: 500 - DOCK_GAP - 430, w: 1400 });
    expect(dockAt(box(100, 500, 600, 300), box(0, 0, 220, 200), "bottom", room)).toEqual({ side: "bottom", x: 100, y: 800 + DOCK_GAP, w: 600 });
  });

  it("a folded brush window: the doodles keep their own height", () => {
    expect(dockAt(box(400, 500, 520, 40), box(0, 0, 220, 430), "right", room).h).toBeUndefined();
  });

  it("let go near an edge, it snaps to that side; far off, nowhere", () => {
    const p = box(400, 500, 520, 300);
    expect(snapSide(p, box(935, 520, 220, 300))).toBe("right");
    expect(snapSide(p, box(170, 520, 220, 300))).toBe("left");
    expect(snapSide(p, box(450, 60, 220, 430))).toBe("top");
    expect(snapSide(p, box(1300, 100, 220, 300))).toBeNull();
  });
});
