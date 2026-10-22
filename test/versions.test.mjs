/**
 * The startup window's changelog order (src/common/versions.js, 2026-10-03):
 * newest first by number, so v0.10 comes before v0.8.
 */

import { describe, it, expect } from "vitest";
import { compareVersions, versionParts, startupVersions } from "../src/common/versions.js";

describe("version order", () => {
  it("reads a label as numbers, the fork suffix aside", () => {
    expect(versionParts("v0.10.5-pr94")).toEqual([0, 10, 5]);
    expect(versionParts("0.8.7")).toEqual([0, 8, 7]);
  });

  it("puts v0.10 after v0.8, and sorts newest first", () => {
    expect(compareVersions("v0.10.5-pr94", "v0.8.7")).toBeGreaterThan(0);
    expect(compareVersions("v0.8.7", "v0.8.7")).toBe(0);
    const sorted = ["v0.5.0", "v0.10.5-pr94", "v0.8.7", "v0.8.10", "v0.6.0"].sort((a, b) => compareVersions(b, a));
    expect(sorted).toEqual(["v0.10.5-pr94", "v0.8.10", "v0.8.7", "v0.6.0", "v0.5.0"]);
  });
});

// The startup changelog (Luke, 2026-10-21): English, the fallback every
// language has, so es and it (no versions) no longer throw and pt (older
// versions only) shows the current one
describe("startupVersions", () => {
  const en = { heart: { versions: { a: { version: "v0.8.7" }, b: { version: "v0.10.5-pr94" } } } };
  it("reads English when another language is active, newest first", () => {
    const es = { heart: { dialog: { skip: "Saltar" } } };
    expect(startupVersions(es, en).map((v) => v.version)).toEqual(["v0.10.5-pr94", "v0.8.7"]);
    const pt = { heart: { versions: { old: { version: "v0.5.0" } } } };
    expect(startupVersions(pt, en).map((v) => v.version)).toEqual(["v0.10.5-pr94", "v0.8.7"]);
  });

  it("reads the active translations in English (no fallback), and never throws", () => {
    expect(startupVersions(en, {}).map((v) => v.version)).toEqual(["v0.10.5-pr94", "v0.8.7"]);
    expect(startupVersions(undefined, undefined)).toEqual([]);
    expect(startupVersions({ heart: {} }, null)).toEqual([]);
  });
});
