// A character's stored total Stress (2026-10-21, Phase 2 item 5):
// system.totalStress = { value, max } follows the five tracks, for token
// bars. The pure rules (actors/character/total-stress.js), the hooks that
// carry it in each write, the ready-time correction, and the proxy agreeing.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  STRESS_TRACKS,
  sumStress,
  totalStressOf,
  totalStressChange,
  staleTotalStress,
} from "../src/actors/character/total-stress.js";
import { registerTotalStressSync, correctTotalStress } from "../src/actors/character/total-stress-sync.js";
import characterProxies from "../src/actors/character/proxy.js";
import { resetWorld, fakeActor, fakeUser, setUsers } from "./helpers.mjs";

const tracks = (values, max = 10) =>
  Object.fromEntries(STRESS_TRACKS.map((r, i) => [r, { value: values[i] ?? 0, max, protection: 0 }]));

describe("sumStress and totalStressOf", () => {
  it("adds the five tracks, and their lengths for the max", () => {
    expect(sumStress(tracks([3, 2, 0, 1, 4]))).toBe(10);
    expect(totalStressOf(tracks([3, 2, 0, 1, 4]))).toEqual({ value: 10, max: 50 });
  });

  it("reads values stored as text as numbers", () => {
    expect(sumStress({ blood: { value: "3" }, mind: { value: "2" } })).toBe(5);
  });

  it("ignores anything but the five, Provisions included", () => {
    expect(sumStress({ ...tracks([1, 1, 1, 1, 1]), provisions: { value: 9 } })).toBe(5);
  });

  it("treats missing tracks as empty, twelve long (Luke, 2026-10-23)", () => {
    expect(totalStressOf({})).toEqual({ value: 0, max: 60 });
    expect(totalStressOf(undefined)).toEqual({ value: 0, max: 60 });
    expect(totalStressOf({ blood: { value: 2, max: 10 } })).toEqual({ value: 2, max: 58 });
  });

  it("twelve-box tracks: max 60, and the value is the plain sum, never capped", () => {
    expect(totalStressOf(tracks([15, 12, 0, 3, 0], 12))).toEqual({ value: 30, max: 60 });
  });
});

describe("totalStressChange: what an update also writes", () => {
  const system = { resistances: tracks([3, 0, 0, 0, 0]), totalStress: { value: 3, max: 50 } };

  it("writes the new total when a track's stress changes", () => {
    expect(totalStressChange(system, { resistances: { mind: { value: 4 } } })).toEqual({ value: 7, max: 50 });
  });

  it("follows a track's length too", () => {
    expect(totalStressChange(system, { resistances: { echo: { max: 12 } } })).toEqual({ value: 3, max: 52 });
  });

  it("writes nothing when the update leaves the tracks alone", () => {
    expect(totalStressChange(system, { notes: "x" })).toBeNull();
    expect(totalStressChange(system, undefined)).toBeNull();
  });

  it("writes nothing when the total already agrees", () => {
    expect(totalStressChange(system, { resistances: { blood: { value: 3 } } })).toBeNull();
    expect(totalStressChange(system, { resistances: { blood: { protection: 2 } } })).toBeNull();
  });

  it("puts a direct edit of the field (a token bar) back to the tracks' sum", () => {
    expect(totalStressChange(system, { totalStress: { value: 9 } })).toEqual({ value: 3, max: 50 });
  });
});

describe("staleTotalStress: the ready-time check", () => {
  it("is null when the stored total agrees", () => {
    expect(staleTotalStress({ resistances: tracks([1, 2]), totalStress: { value: 3, max: 50 } })).toBeNull();
  });

  it("corrects a missing, older, or wrong total", () => {
    expect(staleTotalStress({ resistances: tracks([1, 2]) })).toEqual({ value: 3, max: 50 });
    expect(staleTotalStress({ resistances: tracks([1, 2]), totalStress: 0 })).toEqual({ value: 3, max: 50 });
    expect(staleTotalStress({ resistances: tracks([1, 2]), totalStress: { value: 0, max: 50 } })).toEqual({ value: 3, max: 50 });
  });
});

describe("the hooks", () => {
  let hooks;
  beforeEach(() => {
    ({ hooks } = resetWorld());
    registerTotalStressSync();
  });

  it("adds the total to a character's update that marks stress", () => {
    const actor = fakeActor({ id: "vess", system: { resistances: tracks([2]), totalStress: { value: 2, max: 50 } } });
    const changes = { system: { resistances: { blood: { value: 5 } } } };
    expect(hooks.call("preUpdateActor", actor, changes, {}, "gm")).toBe(true);
    expect(changes.system.totalStress).toEqual({ value: 5, max: 50 });
  });

  it("the twelve-box migration's write carries the new total (max 60)", () => {
    const actor = fakeActor({ id: "vess", system: { resistances: tracks([2]), totalStress: { value: 2, max: 50 } } });
    const changes = { system: { resistances: Object.fromEntries(STRESS_TRACKS.map((r) => [r, { max: 12 }])) } };
    hooks.call("preUpdateActor", actor, changes, {}, "gm");
    expect(changes.system.totalStress).toEqual({ value: 2, max: 60 });
  });

  it("leaves other updates, and other actor types, alone", () => {
    const actor = fakeActor({ id: "vess", system: { resistances: tracks([2]), totalStress: { value: 2, max: 50 } } });
    const rename = { name: "Vess" };
    hooks.call("preUpdateActor", actor, rename, {}, "gm");
    expect(rename).toEqual({ name: "Vess" });

    const hireling = fakeActor({ id: "dog", type: "hireling", system: { resistances: tracks([0]) } });
    const changes = { system: { resistances: { blood: { value: 3 } } } };
    hooks.call("preUpdateActor", hireling, changes, {}, "gm");
    expect(changes.system.totalStress).toBeUndefined();
  });

  it("sets a new character's total from the tracks it is made with", () => {
    const actor = { type: "character", system: { resistances: tracks([1, 1]), totalStress: { value: 0, max: 50 } }, updateSource: vi.fn() };
    hooks.call("preCreateActor", actor, {}, {}, "gm");
    expect(actor.updateSource).toHaveBeenCalledWith({ "system.totalStress": { value: 2, max: 50 } });

    const fresh = { type: "character", system: { resistances: tracks([]), totalStress: { value: 0, max: 50 } }, updateSource: vi.fn() };
    hooks.call("preCreateActor", fresh, {}, {}, "gm");
    expect(fresh.updateSource).not.toHaveBeenCalled();
  });
});

describe("correctTotalStress at ready", () => {
  const gm = fakeUser({ id: "gm", isGM: true });
  const p1 = fakeUser({ id: "p1" });

  beforeEach(() => {
    resetWorld();
    globalThis.Actor = { updateDocuments: vi.fn(async () => []) };
  });

  it("writes only the characters out of step, on the active GM's client", async () => {
    setUsers([gm, p1], { self: gm, activeGM: gm });
    fakeActor({ id: "vess", system: { resistances: tracks([2, 3]), totalStress: { value: 0, max: 50 } } });
    fakeActor({ id: "ash", system: { resistances: tracks([1]), totalStress: { value: 1, max: 50 } } });
    fakeActor({ id: "drowned", type: "adversary", system: { resistance: 4 } });
    await correctTotalStress();
    expect(Actor.updateDocuments).toHaveBeenCalledWith([{ _id: "vess", "system.totalStress": { value: 5, max: 50 } }]);
  });

  it("does nothing on a player's client, or when every total agrees", async () => {
    fakeActor({ id: "vess", system: { resistances: tracks([2]) } });
    setUsers([gm, p1], { self: p1, activeGM: gm });
    await correctTotalStress();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();

    resetWorld();
    globalThis.Actor = { updateDocuments: vi.fn(async () => []) };
    setUsers([gm, p1], { self: gm, activeGM: gm });
    fakeActor({ id: "ash", system: { resistances: tracks([1]), totalStress: { value: 1, max: 50 } } });
    await correctTotalStress();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();
  });
});

describe("the proxy reads the same sum", () => {
  it("agrees with the stored copy's value", () => {
    const resistances = tracks([3, 2, 0, 1, 4]);
    const proxy = characterProxies.character({ id: "vess", system: { resistances }, items: [] });
    expect(proxy.totalStress).toBe(totalStressOf(resistances).value);
  });
});
