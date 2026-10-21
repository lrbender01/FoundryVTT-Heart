/**
 * What a fallout card's Clear button clears (src/rolls/fallout-roll/
 * results.js clearScope; Luke, 2026-10-21). HCB p. 81: taking a Minor
 * fallout removes all stress in the resistance associated with the fallout;
 * a Major or Critical removes all stress from all resistances. The GM's
 * pick decides, since it may differ from the triggering resistance (HCB
 * p. 78) and two Minors may be combined into a Major (table ruling 2).
 */

import { describe, it, expect } from "vitest";
import { clearScope } from "../src/rolls/fallout-roll/results.js";

const resistances = ["blood", "mind", "echo", "fortune", "supplies"];

describe("clearScope", () => {
  it("a Major or Critical clears everything, whatever was picked", () => {
    expect(clearScope({ result: "major-fallout", triggering: "mind", resistances })).toBe("all");
    expect(clearScope({ result: "critical-fallout", pick: { severity: "minor", resistance: "mind" }, resistances })).toBe("all");
  });

  it("a Minor clears the picked Fallout's resistance, not the triggering one", () => {
    expect(clearScope({ result: "minor-fallout", pick: { severity: "minor", resistance: "blood" }, triggering: "mind", resistances })).toBe("blood");
  });

  it("before a pick, a Minor clears the triggering resistance", () => {
    expect(clearScope({ result: "minor-fallout", triggering: "mind", resistances })).toBe("mind");
  });

  it("a pick with no personal resistance falls back to the triggering one", () => {
    expect(clearScope({ result: "minor-fallout", pick: { severity: "minor", resistance: "" }, triggering: "echo", resistances })).toBe("echo");
    expect(clearScope({ result: "minor-fallout", pick: { severity: "minor", resistance: "bond" }, triggering: "echo", resistances })).toBe("echo");
  });

  it("two Minors combined into a picked Major clear everything", () => {
    expect(clearScope({ result: "minor-fallout", pick: { severity: "major", resistance: "blood" }, triggering: "mind", resistances })).toBe("all");
  });

  it("nothing known asks; no fallout clears nothing", () => {
    expect(clearScope({ result: "minor-fallout", resistances })).toBe("");
    expect(clearScope({ result: "no-fallout", triggering: "mind", resistances })).toBe("");
    expect(clearScope()).toBe("");
  });
});
