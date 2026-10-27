/**
 * The Witch is Dead NPC sheet's boxes (src/actors/adversary/npc-sheet-rules.js,
 * Luke, 2026-10-27): an empty box is left off for a viewer who can't edit it.
 */
import { describe, it, expect } from "vitest";
import { npcBoxes } from "../src/actors/adversary/npc-sheet-rules.js";

describe("npcBoxes", () => {
  const system = { descriptors: "Jolly", motivation: "", voice: "<p> </p>", knows: "<ul><li>The killing</li></ul>", description: "<p>Round</p>" };

  it("leaves out an empty box for someone who can't edit", () => {
    expect(npcBoxes(system, false)).toEqual({ descriptors: true, wants: false, voice: false, look: true, knows: true });
  });

  it("keeps every box for someone who can, so a gap reads as a gap", () => {
    expect(Object.values(npcBoxes(system, true))).toEqual([true, true, true, true, true]);
  });

  it("copes with an actor that has no fields", () => {
    expect(Object.values(npcBoxes(undefined, false))).toEqual([false, false, false, false, false]);
  });
});
