/**
 * Keepsakes and trinkets (src/items/trinket-rules.js; Luke, 2026-10-21: one
 * roll and no pick was allowed). The ancestries say "roll or pick twice on
 * the Keepsakes table"; a calling's table says "roll or pick one".
 */

import { describe, it, expect } from "vitest";
import { TRINKET_DRAWS, drawnTrinkets, trinketState, pickChoices } from "../src/items/trinket-rules.js";

describe("trinketState", () => {
  it("two keepsakes, one trinket", () => {
    expect(TRINKET_DRAWS).toEqual({ keepsake: 2, trinket: 1 });
    expect(trinketState("keepsake", {})).toMatchObject({ total: 2, left: 2, done: false });
    expect(trinketState("trinket", undefined)).toMatchObject({ total: 1, left: 1, done: false });
  });

  it("an older single roll counts as one draw: one keepsake left", () => {
    const flags = { trinket: { name: "Battered leather mask", uuid: "Actor.a.Item.k1" } };
    expect(drawnTrinkets(flags)).toEqual([flags.trinket]);
    expect(trinketState("keepsake", flags)).toMatchObject({ left: 1, done: false });
    expect(trinketState("trinket", flags)).toMatchObject({ left: 0, done: true });
  });

  it("the list wins over the older flag; two keepsakes are done", () => {
    const flags = {
      trinket: { name: "Old", uuid: "x" },
      trinkets: [
        { name: "Yeast mother", uuid: "Actor.a.Item.k1" },
        { name: "Love-letters", uuid: "Actor.a.Item.k2" },
      ],
    };
    expect(drawnTrinkets(flags).map((d) => d.name)).toEqual(["Yeast mother", "Love-letters"]);
    expect(trinketState("keepsake", flags)).toMatchObject({ left: 0, done: true });
  });

  it("ignores empty records", () => {
    expect(drawnTrinkets({ trinkets: [null, {}, { name: "Scarf" }] })).toEqual([{ name: "Scarf" }]);
    expect(drawnTrinkets({ trinket: {} })).toEqual([]);
  });
});

describe("pickChoices", () => {
  it("lists the table's results in order, the drawn ones taken", () => {
    const results = [
      { id: "r1", text: "Deck of fortune cards" },
      { id: "r2", text: " Yeast mother (name her) " },
      { id: "r3", text: "" },
    ];
    expect(pickChoices(results, [{ name: "yeast mother (name her)" }])).toEqual([
      { id: "r1", text: "Deck of fortune cards", taken: false },
      { id: "r2", text: "Yeast mother (name her)", taken: true },
    ]);
  });
});
