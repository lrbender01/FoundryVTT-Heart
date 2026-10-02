// The Fallout picker's pure half (fallout-picker/candidates.js, 2026-10-01,
// Luke: one picker wherever Fallout goes). Fallout is the GM's pick within
// its severity (HCB p. 78; table ruling 12).

import { describe, it, expect } from "vitest";
import { candidate, dedupe, matches, sortCandidates, falloutData, SEVERITIES } from "../src/fallout-picker/candidates.js";

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
