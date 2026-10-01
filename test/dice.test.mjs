// The ledger cards' dice row (src/rolls/dice.js rollParts / diceRow)
// (2026-09-30, Luke).

import { describe, it, expect } from "vitest";
import { rollParts, diceRow } from "../src/rolls/dice.js";

const roll = {
  dice: [
    { flavor: "Base", faces: 10, results: [{ result: 7, active: true }] },
    { flavor: "", faces: 10, results: [{ result: 9, active: false, discarded: true }] },
    { flavor: "Kill", faces: 10, results: [{ result: 3, active: true }, { result: 1, discarded: true }] },
  ],
};

describe("rollParts", () => {
  it("is one part per die result, with its die's flavor", () => {
    expect(rollParts(roll)).toEqual([
      { label: "Base", faces: 10, value: 7, kept: true, removed: false },
      { label: "", faces: 10, value: 9, kept: false, removed: true },
      { label: "Kill", faces: 10, value: 3, kept: true, removed: false },
      { label: "Kill", faces: 10, value: 1, kept: false, removed: true },
    ]);
  });

  it("labels an unflavored die with the label given", () => {
    expect(rollParts(roll, "Provisions")[1].label).toBe("Provisions");
    expect(rollParts(roll, "Provisions")[0].label).toBe("Base");
  });

  it("is empty for no roll or a roll with no dice", () => {
    expect(rollParts(undefined)).toEqual([]);
    expect(rollParts({ dice: [] })).toEqual([]);
  });
});

describe("diceRow", () => {
  it("is empty with no parts", () => {
    expect(diceRow([])).toBe("");
    expect(diceRow(undefined)).toBe("");
  });

  it("draws each die with its value, shape, and kept / removed class", () => {
    const html = diceRow([
      { label: "Base", faces: 10, value: 7, kept: true },
      { label: "Kill", faces: 10, value: 9, removed: true },
      { label: "Ash", faces: 10, value: 2 },
    ]);
    expect(html.startsWith('<div class="ledger-dice">')).toBe(true);
    const dice = [...html.matchAll(/<span class="(ledger-die[^"]*)"/g)].map((m) => m[1]);
    expect(dice).toEqual(["ledger-die kept", "ledger-die removed", "ledger-die"]);
    expect([...html.matchAll(/<b>(\d+)<\/b>/g)].map((m) => m[1])).toEqual(["7", "9", "2"]);
    expect(html).toContain("icons/svg/d10-grey.svg");
  });

  it("shows a label only when one is given", () => {
    expect(diceRow([{ label: "Base", faces: 10, value: 1 }])).toContain('<span class="die-label">Base</span>');
    expect(diceRow([{ label: "", faces: 6, value: 1 }])).not.toContain("die-label");
  });

  it("uses the die's own shape, and a d6 for odd sizes", () => {
    expect(diceRow([{ faces: 12, value: 1 }])).toContain("d12-grey.svg");
    expect(diceRow([{ faces: 3, value: 1 }])).toContain("d6-grey.svg");
  });

  it("escapes labels and values", () => {
    const html = diceRow([{ label: '<img src=x onerror="bad">', faces: 10, value: "<i>" }]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src&#x3D;x onerror&#x3D;&quot;bad&quot;&gt;");
    expect(html).toContain("<b>&lt;i&gt;</b>");
  });
});
