// The Fallout picker's pure half (fallout-picker/candidates.js, 2026-10-01,
// Luke: one picker wherever Fallout goes). Fallout is the GM's pick within
// its severity (HCB p. 78; table ruling 12).

import { describe, it, expect } from "vitest";
import { candidate, dedupe, matches, sortCandidates, falloutData, SEVERITIES, restrictionAllows, restrictionHolders, holderItems } from "../src/fallout-picker/candidates.js";

const entry = (name, type, resistance, o = {}) => ({
  name,
  uuid: o.uuid ?? `Compendium.x.Item.${name}`,
  img: "f.svg",
  system: { type, resistance, description: o.description ?? `<p>${name} hurts.</p>`, source: o.source ?? "HCB p. 84" },
});

describe("candidate", () => {
  it("reads a Fallout's severity, resistance, and plain text", () => {
    expect(candidate(entry("Limping", "minor", "blood"), "book")).toMatchObject({
      name: "Limping",
      severity: "minor",
      resistance: "blood",
      text: "Limping hurts.",
      source: "HCB p. 84",
      origin: "book",
    });
  });
});

describe("matches", () => {
  const limping = candidate(entry("Limping", "minor", "blood"), "book");
  it("filters by severity, resistance ('' is any), and a search of name or text", () => {
    expect(matches(limping, { severity: "minor" })).toBe(true);
    expect(matches(limping, { severity: "major" })).toBe(false);
    expect(matches(limping, { severity: "minor", resistance: "blood" })).toBe(true);
    expect(matches(limping, { severity: "minor", resistance: "mind" })).toBe(false);
    expect(matches(limping, { search: "HURTS" })).toBe(true);
    expect(matches(limping, { search: "despair" })).toBe(false);
  });
});

describe("dedupe and sortCandidates", () => {
  it("a Fallout found twice shows once; the target's own entry wins", () => {
    const list = [
      candidate(entry("Lost", "minor", "bond"), "book"),
      candidate(entry("Lost", "minor", "bond", { uuid: "Actor.cook.Item.l" }), "own"),
      candidate(entry("Dead", "minor", "bond"), "world"),
    ];
    const out = sortCandidates(dedupe(list));
    expect(out.map((c) => [c.name, c.origin])).toEqual([["Lost", "own"], ["Dead", "world"]]);
  });
  // 2026-10-21 (C12): the core "Blinded" and Ways and Means' Illicit Magic
  // "Blinded" are both Major Blood; one of them never showed
  it("two different pack entries with one name are two Fallouts", () => {
    const core = candidate(entry("Blinded", "major", "blood", { uuid: "Compendium.core.Item.b", source: "HCB p. 84" }), "book");
    const illicit = candidate(entry("Blinded", "major", "blood", { uuid: "Compendium.wm.Item.b", source: "W&M p. W42" }), "book");
    expect(dedupe([core, illicit])).toHaveLength(2);
    // the same entry found twice is still one
    expect(dedupe([core, { ...core }])).toHaveLength(1);
    // a world copy of one of them is that one, not the other
    const copy = candidate(entry("Blinded", "major", "blood", { uuid: "Item.w", source: "W&M p. W42" }), "world");
    expect(dedupe([core, illicit, copy]).map((c) => c.uuid)).toEqual(["Compendium.core.Item.b", "Compendium.wm.Item.b"]);
  });

  it("the target's own first, then alphabetical", () => {
    const list = ["Zeal", "Anger"].map((n) => candidate(entry(n, "minor", "mind"), "book"));
    list.push(candidate(entry("Theirs", "minor", "bond"), "own"));
    expect(sortCandidates(list).map((c) => c.name)).toEqual(["Theirs", "Anger", "Zeal"]);
  });
});

describe("falloutData", () => {
  it("a pick is added taken and unresolved; it never touches Stress", () => {
    expect(falloutData({ name: "Needs Your Help", severity: "minor", resistance: "bond", description: "<p>x</p>" })).toEqual({
      name: "Needs Your Help",
      type: "fallout",
      img: "systems/heart/assets/fallout-shelter.svg",
      system: { description: "<p>x</p>", source: "", type: "minor", resistance: "bond", active: true, complete: false },
    });
  });
  it("three severities", () => {
    expect(SEVERITIES).toEqual(["minor", "major", "critical"]);
  });
});

describe("class and calling Fallouts stay with their owners (Luke, 2026-10-21)", () => {
  it("offers a restricted Fallout only to a character with that class or calling", async () => {
    const { restrictionAllows } = await import("../src/fallout-picker/candidates.js");
    const r = { type: "class", name: "Witness" };
    expect(restrictionAllows(undefined, [])).toBe(true);
    expect(restrictionAllows(r, [])).toBe(false);
    expect(restrictionAllows(r, [{ type: "calling", name: "Witness" }])).toBe(false);
    expect(restrictionAllows(r, [{ type: "class", name: "witness" }])).toBe(true);
  });
});

// Luke, 2026-10-21 (C13): a companion's employers hold restricted Fallouts,
// so a Demagogue's follower who is a companion is offered the Demagogue's
// Bond Fallouts
describe("who holds a target's restricted Fallouts", () => {
  const items = (...list) => list.map(([type, name]) => ({ type, name }));
  const demagogue = { documentName: "Actor", type: "character", items: items(["calling", "Demagogue"], ["class", "Cleaver"]) };
  const witch = { documentName: "Actor", type: "character", items: items(["calling", "Adventure"]) };
  const SHAKEN = { type: "calling", name: "Demagogue" };

  it("a character itself; a person bond's holder", () => {
    expect(restrictionHolders(demagogue)).toEqual([demagogue]);
    expect(restrictionHolders({ documentName: "Item", type: "bond", parent: witch })).toEqual([witch]);
  });

  it("a companion: its employers", () => {
    const follower = { documentName: "Actor", type: "hireling", items: [], proxy: { employers: [witch, demagogue] } };
    expect(restrictionHolders(follower)).toEqual([witch, demagogue]);
    expect(restrictionAllows(SHAKEN, holderItems(follower))).toBe(true);
    const loner = { documentName: "Actor", type: "hireling", items: [], proxy: { employers: [witch] } };
    expect(restrictionAllows(SHAKEN, holderItems(loner))).toBe(false);
    expect(holderItems({ documentName: "Actor", type: "hireling", items: [] })).toEqual([]);
  });

  it("nobody for the party or anything else", () => {
    expect(restrictionHolders({ documentName: "Actor", type: "party", items: items(["calling", "Demagogue"]) })).toEqual([]);
    expect(restrictionHolders(undefined)).toEqual([]);
    expect(restrictionAllows(SHAKEN, holderItems({ documentName: "Actor", type: "party" }))).toBe(false);
    // an unrestricted Fallout is offered to everyone
    expect(restrictionAllows(undefined, [])).toBe(true);
  });
});
