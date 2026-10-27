import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The incremental build's pure parts (dev-utils/build-fast.cjs, CommonJS).
const { decideSteps, hashParts } = createRequire(import.meta.url)("../dev-utils/build-fast.cjs");

describe("build-fast: which support steps run", () => {
  const now = { manifest: "m1", template: "t1", static: "s1" };

  it("runs nothing when every fingerprint matches and every output exists", () => {
    expect(decideSteps({ ...now }, now, {})).toEqual([]);
  });

  it("runs every step on a first build (nothing recorded)", () => {
    expect(decideSteps({}, now, {})).toEqual(["manifest", "template", "static"]);
  });

  it("runs only the step whose inputs changed", () => {
    expect(decideSteps({ ...now, template: "old" }, now, {})).toEqual(["template"]);
  });

  it("runs a step whose output is missing even when its inputs are unchanged", () => {
    expect(decideSteps({ ...now }, now, { static: true })).toEqual(["static"]);
  });
});

describe("build-fast: fingerprints", () => {
  it("hash the same parts the same way in any order, and notice any change", () => {
    const a = [{ name: "a", data: "1" }, { name: "b", data: "2" }];
    expect(hashParts(a)).toBe(hashParts([a[1], a[0]]));
    expect(hashParts(a)).not.toBe(hashParts([{ name: "a", data: "1" }, { name: "b", data: "3" }]));
  });
});
