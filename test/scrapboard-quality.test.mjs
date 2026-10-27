/**
 * Ultra quality (2026-10-26): the canvas's resolution under Ultra
 * (quality.js ultraResolution), and Ultra's place among the board's details
 * (render.js DETAIL).
 */

import { describe, it, expect } from "vitest";
import { ultraResolution, ULTRA } from "../src/map/scrapboard/quality.js";
import { DETAIL } from "../src/map/scrapboard/render.js";

describe("ultraResolution", () => {
  it("draws finer than the screen: its pixel ratio supersampled", () => {
    expect(ultraResolution(1, 1920)).toBe(1.5);
    expect(ultraResolution(1.25, 1920)).toBe(1.88);
  });

  it("never past the cap", () => {
    expect(ultraResolution(2.5, 1920)).toBe(ULTRA.maxResolution);
  });

  it("never past the widest texture for the window", () => {
    // (16384 / 7680 = 2.13: a very wide window at 1.5 x 2 = 3 is held to 2.13)
    expect(ultraResolution(2, 7680)).toBe(2.13);
  });

  it("never softer than the screen itself", () => {
    expect(ultraResolution(3, 12000)).toBe(3);
  });

  it("reads a missing ratio or width as an ordinary screen", () => {
    expect(ultraResolution(undefined, undefined)).toBe(1.5);
    expect(ultraResolution(0, 0)).toBe(1.5);
  });
});

describe("DETAIL.ultra", () => {
  it("is past High in every measure", () => {
    const U = DETAIL.ultra;
    const H = DETAIL.high;
    expect(U.scale).toBeGreaterThan(H.scale);
    expect(U.cap).toBeGreaterThan(H.cap);
    expect(U.bakedMB).toBeGreaterThan(H.bakedMB);
    expect(U.live).toBe(true);
    expect(U.bakedNeed).toBeGreaterThan(1);
  });
});
