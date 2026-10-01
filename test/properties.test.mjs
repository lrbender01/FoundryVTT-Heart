// Randomized rule checks (2026-09-30, Luke). Seeded, so every run draws the
// same thousands of cases and a failure is reproducible. The pool dice are
// evaluated with a copy of Foundry v12's keep / drop logic (test/helpers.mjs
// evaluatePool), then read back the way the Heart roll card reads them.

import { describe, it, expect } from "vitest";
import { buildPool, DIFFICULTY_CUT } from "../src/rolls/heart-roll/pool.js";
import { heartResult, markPool, normal_results, difficult_results } from "../src/rolls/heart-roll/results.js";
import { characterFalloutResult } from "../src/rolls/fallout-roll/results.js";
import {
  PARTY_FALLOUT_RESULTS,
  PROVISIONS_MAX,
  partyFalloutResult,
  markedValue,
  relievedValue,
} from "../src/actors/party/rules.js";
import { makeActor, addActors, seeded, evaluatePool } from "./helpers.mjs";

const RUNS = 5000;
const DIFFICULTIES = ["standard", "risky", "dangerous"];
const RESULTS = new Set([...Object.keys(normal_results), ...Object.keys(difficult_results)]);

// a random action: a character with some skills / domains, a random choice of
// skill, domain, mastery, helpers, and difficulty
function randomAction(rand) {
  const skills = ["kill", "sneak", "delve"].filter(() => rand() < 0.5);
  const domains = ["occult", "haven"].filter(() => rand() < 0.5);
  const actor = makeActor({ skills, domains, fallouts: rand() < 0.1 ? ["Tired"] : [] });
  const helpers = [];
  const helperCount = rand.int(0, 3);
  for (let h = 0; h < helperCount; h++) {
    const helper = makeActor({ id: `h${h}`, name: `Helper ${h}` });
    addActors(helper);
    helpers.push(helper.id);
  }
  return {
    actor,
    options: {
      skill: rand() < 0.8 ? rand.pick(["kill", "sneak", "delve"]) : null,
      domain: rand() < 0.6 ? rand.pick(["occult", "haven"]) : null,
      mastery: rand() < 0.2,
      helpers,
      difficulty: rand.pick(DIFFICULTIES),
    },
  };
}

describe("random pools", () => {
  it("the kept die is never a removed die, and every removed die is at least as high", () => {
    const rand = seeded(1);
    for (let run = 0; run < RUNS; run++) {
      game.actors.clear();
      const { actor, options } = randomAction(rand);
      const pool = buildPool(actor, options);
      if (pool.fresh) continue;
      const values = pool.dice.map(() => rand.int(1, 10));
      const results = evaluatePool(values, pool.cut);
      const { kept, removed } = markPool(results, pool.cut);

      expect(kept).toBeGreaterThanOrEqual(0);
      expect(removed).not.toContain(kept);
      expect(removed).toHaveLength(pool.cut);
      for (const i of removed) expect(values[i]).toBeGreaterThanOrEqual(values[kept]);
      // the kept die is the best of what the difficulty left
      expect(values[kept]).toBe([...values].sort((a, b) => b - a)[pool.cut]);
    }
  });

  it("a Risky pool never keeps the pool's highest die when another die exists", () => {
    const rand = seeded(2);
    for (let run = 0; run < RUNS; run++) {
      const n = rand.int(2, 6);
      const values = Array.from({ length: n }, () => rand.int(1, 10));
      const results = evaluatePool(values, DIFFICULTY_CUT.risky);
      const { kept, removed } = markPool(results, DIFFICULTY_CUT.risky);
      const highest = Math.max(...values);
      // the removed die is a highest die, and the kept die is not that one
      expect(values[removed[0]]).toBe(highest);
      expect(kept).not.toBe(removed[0]);
      // only a tie lets the kept die show the highest value
      if (values.filter((v) => v === highest).length === 1) expect(values[kept]).toBeLessThan(highest);
    }
  });

  it("every roll lands on a defined result, and a fresh die never succeeds outright", () => {
    const rand = seeded(3);
    for (let run = 0; run < RUNS; run++) {
      game.actors.clear();
      const { actor, options } = randomAction(rand);
      const pool = buildPool(actor, options);
      const resultSet = pool.fresh ? "difficult" : "normal";
      const values = pool.fresh ? [rand.int(1, 10)] : pool.dice.map(() => rand.int(1, 10));
      const results = pool.fresh ? values.map((r) => ({ result: r, active: true })) : evaluatePool(values, pool.cut);
      const total = results[markPool(results, pool.fresh ? 0 : pool.cut).kept].result;
      const result = heartResult(total, resultSet, options.difficulty);

      expect(RESULTS.has(result)).toBe(true);
      if (pool.fresh) expect(["success", "critical_success"]).not.toContain(result);
      expect(pool.count).toBe(pool.dice.length);
      expect(pool.kept).toBe(Math.max(0, pool.dice.length - pool.cut));
    }
  });

  it("fallout checks always land on a defined severity", () => {
    const rand = seeded(4);
    for (let run = 0; run < RUNS; run++) {
      const roll = rand.int(1, 12);
      expect(["no-fallout", "minor-fallout", "major-fallout"]).toContain(characterFalloutResult(roll, rand.int(0, 50)));
      expect(PARTY_FALLOUT_RESULTS).toContain(partyFalloutResult(roll, rand.int(0, PROVISIONS_MAX)));
    }
  });
});

describe("random Provisions marks and relief", () => {
  it("stay within 0 and the max", () => {
    const rand = seeded(5);
    let value = 0;
    for (let run = 0; run < RUNS; run++) {
      const amount = rand.int(-3, 12);
      const before = value;
      if (rand() < 0.6) {
        value = markedValue(value, amount);
        expect(value).toBeGreaterThanOrEqual(before);
      } else {
        value = relievedValue(value, amount);
        expect(value).toBeLessThanOrEqual(before);
      }
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(PROVISIONS_MAX);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
