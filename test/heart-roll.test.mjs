// Heart roll results (HCB p.76-77): the kept die on the normal and Difficult
// tables, Impossible actions, which results cost stress, and which pool dice
// the card marks kept / removed (2026-09-30, Luke).

import { describe, it, expect } from "vitest";
import {
  normal_results,
  difficult_results,
  stress_results,
  heartResult,
  markPool,
} from "../src/rolls/heart-roll/results.js";
import { evaluatePool } from "./helpers.mjs";

describe("heartResult: the normal table", () => {
  it.each([
    [1, "critical_failure"],
    [2, "failure"],
    [3, "failure"],
    [4, "failure"],
    [5, "failure"],
    [6, "success_at_a_cost"],
    [7, "success_at_a_cost"],
    [8, "success"],
    [9, "success"],
    [10, "critical_success"],
  ])("a kept %i is %s", (total, result) => {
    expect(heartResult(total, "normal", "standard")).toBe(result);
  });

  it("is the table for Risky and Dangerous pools too (the difficulty only cuts dice)", () => {
    expect(heartResult(8, "normal", "risky")).toBe("success");
    expect(heartResult(6, "normal", "dangerous")).toBe("success_at_a_cost");
  });

  it("has no result for a total off the d10", () => {
    expect(heartResult(0, "normal", "standard")).toBeUndefined();
    expect(heartResult(11, "normal", "standard")).toBeUndefined();
  });
});

describe("heartResult: the Difficult table (one fresh die)", () => {
  it.each([
    // HCB p.77: 1-9 is a plain failure on this table (Luke, 2026-09-30)
    [1, "failure"],
    [2, "failure"],
    [5, "failure"],
    [8, "failure"],
    [9, "failure"],
    [10, "success_at_a_cost"],
  ])("a fresh %i is %s", (total, result) => {
    expect(heartResult(total, "difficult", "risky")).toBe(result);
  });

  it("never succeeds outright", () => {
    for (let t = 1; t <= 10; t++) {
      expect(["success", "critical_success"]).not.toContain(heartResult(t, "difficult", "dangerous"));
    }
  });
});

describe("heartResult: Impossible", () => {
  it("always fails, whatever the total and table", () => {
    for (const total of [0, 1, 6, 10]) {
      expect(heartResult(total, "impossible", "impossible")).toBe("failure");
      expect(heartResult(total, "normal", "impossible")).toBe("failure");
    }
  });
});

describe("the result tables", () => {
  it("cover 1-10 with no gaps or overlaps", () => {
    for (const table of [normal_results, difficult_results]) {
      const covered = [];
      for (const [min, max] of Object.values(table)) {
        for (let t = min; t <= max; t++) covered.push(t);
      }
      expect(covered.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }
  });

  it("offer a stress roll on success at a cost, failure, and critical failure (and n_a)", () => {
    expect(stress_results).toEqual(["n_a", "success_at_a_cost", "failure", "critical_failure"]);
    expect(stress_results).not.toContain("success");
    expect(stress_results).not.toContain("critical_success");
  });
});

describe("markPool: kept and removed dice", () => {
  it("Standard: keeps the highest and removes none", () => {
    const results = evaluatePool([3, 9, 5], 0);
    expect(markPool(results, 0)).toEqual({ kept: 1, removed: [] });
  });

  it("Risky: removes the highest and keeps the best of the rest", () => {
    const results = evaluatePool([3, 9, 5], 1);
    expect(markPool(results, 1)).toEqual({ kept: 2, removed: [1] });
  });

  it("Dangerous: removes the two highest", () => {
    const results = evaluatePool([7, 2, 10, 4], 2);
    expect(markPool(results, 2)).toEqual({ kept: 3, removed: [2, 0] });
  });

  it("ties: the kept die is the one Foundry kept, and a tied die is the one removed", () => {
    const results = evaluatePool([8, 8, 5], 1);
    const { kept, removed } = markPool(results, 1);
    expect(results[kept].result).toBe(8);
    expect(removed).toHaveLength(1);
    expect(removed).not.toContain(kept);
    expect(results[removed[0]].result).toBe(8);
  });

  it("all dice equal: one kept, cut others removed, the rest neither", () => {
    const results = evaluatePool([6, 6, 6, 6], 2);
    const { kept, removed } = markPool(results, 2);
    expect(kept).toBeGreaterThanOrEqual(0);
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain(kept);
  });
});
