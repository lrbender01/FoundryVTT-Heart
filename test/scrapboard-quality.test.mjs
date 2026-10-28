/**
 * Ultra quality (2026-10-26): the canvas's resolution under Ultra
 * (quality.js ultraResolution), and Ultra's place among the board's details
 * (render.js DETAIL).
 */

import { describe, it, expect } from "vitest";
import { ultraResolution, ULTRA, IDLE, idleFps, createIdleGovernor } from "../src/map/scrapboard/quality.js";
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

describe("idleFps (the idle throttle, 2026-10-28)", () => {
  const quiet = { board: true, base: 30, idleMs: 5000 };

  it("drops Auto and Light to the idle rate once quiet", () => {
    expect(idleFps({ ...quiet, picked: "auto" })).toBe(IDLE.fps);
    expect(idleFps({ ...quiet, picked: "light" })).toBe(IDLE.fps);
  });

  it("holds the normal cap before the quiet time is up", () => {
    expect(idleFps({ ...quiet, picked: "auto", idleMs: IDLE.afterMs - 1 })).toBe(30);
  });

  it("holds the normal cap while something animates", () => {
    expect(idleFps({ ...quiet, picked: "auto", busy: true })).toBe(30);
  });

  it("holds a gentler floor under animated lights", () => {
    expect(idleFps({ ...quiet, picked: "auto", lights: true })).toBe(IDLE.lightFps);
  });

  it("never raises a rate Foundry already holds lower", () => {
    expect(idleFps({ ...quiet, picked: "auto", base: 5 })).toBe(5);
  });

  it("never touches Ultra, High, Standard, or a scene that is not a board", () => {
    for (const picked of ["ultra", "high", "standard"]) {
      expect(idleFps({ ...quiet, picked, base: 60 })).toBe(60);
    }
    expect(idleFps({ ...quiet, picked: "auto", board: false, base: 60 })).toBe(60);
    expect(idleFps({ ...quiet, picked: "ultra", base: 0 })).toBe(0);
  });
});

describe("createIdleGovernor", () => {
  function rig(over = {}) {
    let t = 0;
    const applied = [];
    const state = { board: true, picked: "auto", foundryFps: 60, busy: false, lights: false, ...over };
    const g = createIdleGovernor({ read: () => state, apply: (f) => applied.push(f), now: () => t });
    return { g, state, applied, at: (ms) => (t = ms) };
  }

  it("runs at the cap, slows after a quiet second, wakes on a ping", () => {
    const { g, applied, at } = rig();
    at(500);
    expect(g.tick()).toBe(30);
    at(1200);
    expect(g.tick()).toBe(IDLE.fps);
    expect(g.slowed).toBe(true);
    at(1300);
    g.ping();
    expect(applied.at(-1)).toBe(30);
    expect(g.slowed).toBe(false);
    at(2000);
    expect(g.tick()).toBe(30);
    at(2400);
    expect(g.tick()).toBe(IDLE.fps);
  });

  it("only applies on a change", () => {
    const { g, applied, at } = rig();
    at(2000);
    g.tick();
    g.tick();
    at(3000);
    g.tick();
    expect(applied).toEqual([IDLE.fps]);
  });

  it("an animation keeps full rate, then the quiet clock starts over when it ends", () => {
    const { g, state, at } = rig({ busy: true });
    at(5000);
    expect(g.tick()).toBe(30);
    state.busy = false;
    at(5500);
    expect(g.tick()).toBe(30);
    at(6100);
    expect(g.tick()).toBe(IDLE.fps);
  });

  it("animated lights hold the gentler floor, and lose it when put out", () => {
    const { g, state, at } = rig({ lights: true });
    at(2000);
    expect(g.tick()).toBe(IDLE.lightFps);
    state.lights = false;
    at(2300);
    expect(g.tick()).toBe(IDLE.fps);
  });

  it("never slows Ultra, and a quality change takes effect after a reset", () => {
    const { g, state, applied, at } = rig({ picked: "ultra", foundryFps: 0 });
    at(9000);
    expect(g.tick()).toBe(0);
    state.picked = "auto";
    g.reset();
    expect(g.tick()).toBe(30);
    at(11000);
    expect(g.tick()).toBe(IDLE.fps);
    state.picked = "ultra";
    g.reset();
    expect(g.tick()).toBe(0);
    expect(applied.at(-1)).toBe(0);
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
