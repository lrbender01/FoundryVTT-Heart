// Stress and a character's fallout (HCB p.77-78; gm-companion rulings 13,
// 16): die steps, the critical-failure doubling, Protection, and the d12
// fallout thresholds (2026-09-30, Luke).

import { describe, it, expect } from "vitest";
import {
  DIE_ORDER,
  stepDown,
  stressDie,
  stressFormula,
  afterProtection,
} from "../src/rolls/stress-roll/rules.js";
import { fallout_results, characterFalloutResult } from "../src/rolls/fallout-roll/results.js";
import characterProxies from "../src/actors/character/proxy.js";

describe("the total a character's fallout check reads", () => {
  const proxyOf = (resistances, id = "vess") => characterProxies.character({ id, system: { resistances }, items: [] });

  it("is the stress across the five personal tracks", () => {
    const proxy = proxyOf({
      blood: { value: 3, protection: 1 },
      mind: { value: 2, protection: 0 },
      echo: { value: 0, protection: 0 },
      fortune: { value: 1, protection: 0 },
      supplies: { value: 4, protection: 2 },
    });
    expect(proxy.totalStress).toBe(10);
  });

  it("ignores the party's Provisions (personal checks ignore Provisions)", () => {
    game.heart.party = { system: { provisions: { value: 15 }, quartermaster: "vess" } };
    const proxy = proxyOf({ blood: { value: 2 }, mind: { value: 0 } });
    expect(proxy.totalStress).toBe(2);
    expect(proxy.isQuartermaster).toBe(true);
    expect(proxyOf({}, "ash").isQuartermaster).toBe(false);
  });
});

describe("stepDown: one die size smaller", () => {
  it("runs D4, D6, D8, D10, D12", () => {
    expect(DIE_ORDER).toEqual(["d4", "d6", "d8", "d10", "d12"]);
  });

  it.each([
    ["d6", "d4"],
    ["d8", "d6"],
    ["d10", "d8"],
    ["d12", "d10"],
    ["D8", "d6"],
  ])("%s steps down to %s", (die, smaller) => {
    expect(stepDown(die)).toBe(smaller);
  });

  it("a D4 has nowhere to go, and a die off the ladder is left alone", () => {
    expect(stepDown("d4")).toBe("d4");
    expect(stepDown("d20")).toBe("d20");
  });
});

describe("stressDie: the die a stress roll uses", () => {
  it("defaults to D4 and lowercases the GM's pick", () => {
    expect(stressDie(undefined, "failure", false)).toEqual({ die: "d4", stepped: false });
    expect(stressDie("D8", "failure", false)).toEqual({ die: "d8", stepped: false });
  });

  it("a passive action that succeeds at a cost takes one size smaller", () => {
    expect(stressDie("d6", "success_at_a_cost", true)).toEqual({ die: "d4", stepped: true });
    expect(stressDie("d10", "success_at_a_cost", true)).toEqual({ die: "d8", stepped: true });
  });

  it("passive changes nothing on a failure or critical failure", () => {
    expect(stressDie("d6", "failure", true)).toEqual({ die: "d6", stepped: false });
    expect(stressDie("d6", "critical_failure", true)).toEqual({ die: "d6", stepped: false });
  });

  it("an active success at a cost keeps the die", () => {
    expect(stressDie("d6", "success_at_a_cost", false)).toEqual({ die: "d6", stepped: false });
  });
});

describe("stressFormula: critical failure doubles the roll", () => {
  it("doubles on a critical failure", () => {
    expect(stressFormula("d6", "critical_failure")).toBe("2 * {d6}");
  });

  it.each(["failure", "success_at_a_cost", "n_a", undefined])("rolls the die once on %s", (result) => {
    expect(stressFormula("d6", result)).toBe("d6");
  });
});

describe("afterProtection: per character", () => {
  it("subtracts the character's Protection", () => {
    expect(afterProtection(5, 2)).toEqual({ protection: 2, amount: 3 });
  });

  it("never goes below zero: Protection can stop all of it", () => {
    expect(afterProtection(2, 5)).toEqual({ protection: 5, amount: 0 });
    expect(afterProtection(3, 3).amount).toBe(0);
  });

  it("is applied once to a doubled total, not to each die", () => {
    // a critical failure rolled 4 on a d6: 8 stress, less Protection 2 once
    expect(afterProtection(2 * 4, 2).amount).toBe(6);
  });

  it("ignoreProtection takes the full total", () => {
    expect(afterProtection(5, 2, true)).toEqual({ protection: 0, amount: 5 });
  });

  it("reads missing or text Protection as a number", () => {
    expect(afterProtection(4, undefined)).toEqual({ protection: 0, amount: 4 });
    expect(afterProtection(4, "1")).toEqual({ protection: 1, amount: 3 });
  });
});

describe("characterFalloutResult: d12 against total stress", () => {
  it.each([
    // [d12, total stress, result]
    [10, 9, "no-fallout"],
    [12, 11, "no-fallout"],
    [1, 0, "no-fallout"],
    [9, 9, "major-fallout"],
    [7, 9, "major-fallout"],
    [12, 12, "major-fallout"],
    [6, 9, "minor-fallout"],
    [1, 9, "minor-fallout"],
    [3, 3, "minor-fallout"],
    [6, 6, "minor-fallout"],
    [7, 6, "no-fallout"],
  ])("a %i against %i stress is %s", (roll, stress, result) => {
    expect(characterFalloutResult(roll, stress)).toBe(result);
  });

  it("every d12 against every total gives exactly one result", () => {
    for (let stress = 0; stress <= 50; stress++) {
      for (let roll = 1; roll <= 12; roll++) {
        const matches = Object.keys(fallout_results).filter((r) => fallout_results[r](roll, stress));
        expect(matches).toHaveLength(1);
      }
    }
  });

  it("never rolls Critical for a character's own check", () => {
    for (let stress = 0; stress <= 50; stress++) {
      for (let roll = 1; roll <= 12; roll++) {
        expect(characterFalloutResult(roll, stress)).not.toBe("critical-fallout");
      }
    }
  });
});
