/**
 * Paying a haunt (src/items/haunt/rules.js; Luke, 2026-10-21: the service
 * button rolled the haunt's own die). HCB p. 140: a resource buys "an
 * equivalent dice worth of refresh up to the dice size listed next to the
 * haunt"; HCB p. 81: roll the resource's die, and the haunt's die is the
 * most it removes, even for a more valuable resource.
 */

import { describe, it, expect } from "vitest";
import { serviceDie, resourcePayments, otherPaymentDice } from "../src/items/haunt/rules.js";

describe("serviceDie", () => {
  it("rolls the resource's die when the haunt's is as large or larger", () => {
    expect(serviceDie("d4", "d8")).toBe("d4");
    expect(serviceDie("d8", "d8")).toBe("d8");
  });

  it("caps a more valuable resource at the haunt's die", () => {
    expect(serviceDie("d10", "d8")).toBe("d8");
    expect(serviceDie("d12", "d4")).toBe("d4");
  });

  it("an unknown payment rolls nothing; an unknown haunt die caps nothing", () => {
    expect(serviceDie("", "d8")).toBeNull();
    expect(serviceDie("d10", undefined)).toBe("d10");
  });
});

describe("resourcePayments", () => {
  const vess = {
    id: "vess",
    name: "Vess",
    items: [
      { id: "r1", name: "Sack of Shrooms", type: "resource", system: { die_size: "d10", active: true } },
      { id: "r2", name: "Silver Ring", type: "resource", system: { die_size: "d4", active: true } },
      { id: "r3", name: "Put aside", type: "resource", system: { die_size: "d6", active: false } },
      { id: "e1", name: "Knife", type: "equipment", system: { die_size: "d6", active: true } },
    ],
  };

  it("lists each held resource with the die it rolls here", () => {
    const list = resourcePayments([vess], "d8");
    expect(list.map((p) => [p.name, p.die, p.rolls, p.capped])).toEqual([
      ["Sack of Shrooms", "d10", "d8", true],
      ["Silver Ring", "d4", "d4", false],
    ]);
    expect(list[0]).toMatchObject({ key: "vess.r1", actorId: "vess", itemId: "r1", owner: "Vess" });
  });

  it("no characters, no payments", () => {
    expect(resourcePayments([], "d8")).toEqual([]);
    expect(resourcePayments(undefined, "d8")).toEqual([]);
  });
});

describe("otherPaymentDice", () => {
  it("offers the dice up to the haunt's", () => {
    expect(otherPaymentDice("d6")).toEqual(["d4", "d6"]);
    expect(otherPaymentDice("d12")).toEqual(["d4", "d6", "d8", "d10", "d12"]);
  });
});
