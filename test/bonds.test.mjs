// Bonds (HCB p. 102) and hirelings / animals (W&M W66-W67): the pure rules in
// bonds/rules.js (2026-10-01, Luke). A bond is the relationship (a `bond`
// item on the character); a hireling is its own actor.

import { describe, it, expect } from "vitest";
import {
  BOND_KINDS,
  bondKindFor,
  MAX_BONDS,
  TRANSFER_DIE,
  HEAL_COST_DIE,
  BOND_STRESS_MAX,
  BOND_ACTION_DIE,
  isCompanion,
  bondKind,
  poolStress,
  trackStress,
  canAddBond,
  canLeanOn,
  transferAmount,
  pooledValue,
  bondFalloutResult,
  healOutcome,
  bondActionDice,
  bondActionResult,
} from "../src/bonds/rules.js";

describe("the book's numbers", () => {
  it("three bonds, D8 transfers, D8 to heal, a ten-box pool, D10 bond actions", () => {
    expect(MAX_BONDS).toBe(3);
    expect(TRANSFER_DIE).toBe("d8");
    expect(HEAL_COST_DIE).toBe("d8");
    expect(BOND_STRESS_MAX).toBe(10);
    expect(BOND_ACTION_DIE).toBe("d10");
  });

  it("two bond kinds; older hireling / animal bonds read as companions; anything else as a person", () => {
    expect(BOND_KINDS).toEqual(["person", "companion"]);
    expect(isCompanion("companion")).toBe(true);
    expect(isCompanion("hireling")).toBe(true);
    expect(isCompanion("animal")).toBe(true);
    expect(isCompanion("person")).toBe(false);
    expect(bondKind("animal")).toBe("companion");
    expect(bondKind(undefined)).toBe("person");
    expect(bondKind("dragon")).toBe("person");
  });

  it("a bond's kind follows its bonded actor; with none, what was stored", () => {
    expect(bondKindFor("hireling", "person")).toBe("companion");
    expect(bondKindFor("npc", "companion")).toBe("person");
    expect(bondKindFor("character")).toBe("person");
    expect(bondKindFor(undefined, "hireling")).toBe("companion");
    expect(bondKindFor(undefined, undefined)).toBe("person");
  });
});

describe("a bond's Stress", () => {
  it("a person bond's single pool", () => {
    expect(poolStress({ stress: { value: 4 } })).toBe(4);
    expect(poolStress({})).toBe(0);
  });

  it("a hireling's five tracks added up, text values as numbers", () => {
    const resistances = {
      blood: { value: 2 },
      mind: { value: "3" },
      echo: { value: 0 },
      fortune: { value: 1 },
      supplies: {},
    };
    expect(trackStress(resistances)).toBe(6);
    expect(trackStress(undefined)).toBe(0);
  });
});

describe("taking a bond", () => {
  it("at most three; a full list refuses (no replacing, 2026-10-02)", () => {
    expect(canAddBond(0)).toBe(true);
    expect(canAddBond(2)).toBe(true);
    expect(canAddBond(3)).toBe(false);
    expect(canAddBond(4)).toBe(false);
  });
});

describe("leaning on a bond", () => {
  it("only a person bond takes your Stress or heals your Fallout (W66)", () => {
    expect(canLeanOn("person")).toBe(true);
    expect(canLeanOn("hireling")).toBe(false);
    expect(canLeanOn("animal")).toBe(false);
  });

  it("moves the roll, never more than the character has marked", () => {
    expect(transferAmount(6, 10)).toBe(6);
    expect(transferAmount(6, 4)).toBe(4);
    expect(transferAmount(6, 0)).toBe(0);
    expect(transferAmount(-2, 5)).toBe(0);
  });

  it("the pool stops at its max", () => {
    expect(pooledValue(3, 4)).toBe(7);
    expect(pooledValue(8, 5)).toBe(10);
    expect(pooledValue(2, -3)).toBe(2);
    expect(pooledValue(1, 3, 4)).toBe(4);
  });

  it("heals Minor (removed) and Major (downgraded), never Critical", () => {
    expect(healOutcome("minor")).toBe("remove");
    expect(healOutcome("major")).toBe("downgrade");
    expect(healOutcome("critical")).toBe(null);
  });
});

describe("the GM's Fallout check on a bond", () => {
  it("reads like a delver's: above the total none; at or under, Minor 1-6, Major 7-12", () => {
    expect(bondFalloutResult(5, 4)).toBe("no-fallout");
    expect(bondFalloutResult(4, 4)).toBe("minor-fallout");
    expect(bondFalloutResult(6, 9)).toBe("minor-fallout");
    expect(bondFalloutResult(7, 9)).toBe("major-fallout");
    expect(bondFalloutResult(12, 12)).toBe("major-fallout");
  });

  it("never rolls Critical (only the GM combining two Majors makes one)", () => {
    for (let d = 1; d <= 12; d++) {
      for (let total = 0; total <= 30; total++) {
        expect(bondFalloutResult(d, total)).not.toBe("critical-fallout");
      }
    }
  });
});

describe("bond actions (optional rule; hirelings and animals at this table)", () => {
  it("one D10, plus one at home, plus one within their expertise", () => {
    expect(bondActionDice()).toBe(1);
    expect(bondActionDice({ home: true })).toBe(2);
    expect(bondActionDice({ home: true, expertise: true })).toBe(3);
  });

  it("the highest die reads as a delver's roll", () => {
    expect(bondActionResult([1])).toBe("critical_failure");
    expect(bondActionResult([3, 7])).toBe("success_at_a_cost");
    expect(bondActionResult([2, 9, 4])).toBe("success");
    expect(bondActionResult([10, 1])).toBe("critical_success");
    expect(bondActionResult([])).toBe(undefined);
  });
});
