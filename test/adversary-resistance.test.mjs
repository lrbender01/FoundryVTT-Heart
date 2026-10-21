// An adversary's Resistance counts down (Luke, 2026-10-21): the pure rules
// (actors/adversary/resistance.js), the hooks that carry the token bar
// (system.resistanceBar = { value: left, max }) in each write, a bar edit
// moving the marks, and the ready-time correction.

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_RESISTANCE_MAX,
  resistanceOf,
  resistanceBarOf,
  resistanceBarChange,
  staleResistanceBar,
  marksForLeft,
} from "../src/actors/adversary/resistance.js";
import { registerResistanceBarSync, correctResistanceBars } from "../src/actors/adversary/resistance-sync.js";
import { resetWorld, fakeActor, fakeUser, setUsers } from "./helpers.mjs";

describe("resistanceOf: what is left", () => {
  it("max minus the Stress marked, from text or numbers", () => {
    expect(resistanceOf({ resistance: "2", resistanceMax: "5" })).toEqual({ marked: 2, max: 5, left: 3 });
    expect(resistanceOf({ resistance: 4, resistanceMax: 8 })).toEqual({ marked: 4, max: 8, left: 4 });
  });

  it("a new adversary (blank marks, the default max) has it all", () => {
    expect(resistanceOf({ resistance: "", resistanceMax: "5" })).toEqual({ marked: 0, max: 5, left: 5 });
    expect(resistanceOf({})).toEqual({ marked: 0, max: DEFAULT_RESISTANCE_MAX, left: DEFAULT_RESISTANCE_MAX });
    expect(resistanceOf({ resistanceMax: "" }).max).toBe(DEFAULT_RESISTANCE_MAX);
  });

  it("never below zero left, nor more marked than the track holds", () => {
    expect(resistanceOf({ resistance: "9", resistanceMax: "5" })).toEqual({ marked: 5, max: 5, left: 0 });
    expect(resistanceOf({ resistance: "-2", resistanceMax: "5" }).left).toBe(5);
    expect(resistanceOf({ resistance: "junk", resistanceMax: "x" })).toEqual({ marked: 0, max: 0, left: 0 });
  });

  it("the bar is what is left, of the max", () => {
    expect(resistanceBarOf({ resistance: "1", resistanceMax: "6" })).toEqual({ value: 5, max: 6 });
  });
});

describe("resistanceBarChange: what an update also writes", () => {
  const system = { resistance: "1", resistanceMax: "5", resistanceBar: { value: 4, max: 5 } };

  it("the bar follows a new mark or a new max", () => {
    expect(resistanceBarChange(system, { resistance: 3 })).toEqual({ resistanceBar: { value: 2, max: 5 } });
    expect(resistanceBarChange(system, { resistanceMax: 8 })).toEqual({ resistanceBar: { value: 7, max: 8 } });
  });

  it("nothing when the update leaves the track alone, or the bar already agrees", () => {
    expect(resistanceBarChange(system, { notes: "x" })).toBeNull();
    expect(resistanceBarChange(system, undefined)).toBeNull();
    expect(resistanceBarChange(system, { resistance: "1" })).toBeNull();
  });

  it("an edit of the bar's value moves the marks, within the track", () => {
    expect(resistanceBarChange(system, { resistanceBar: { value: 2 } })).toEqual({ resistance: 3, resistanceBar: { value: 2, max: 5 } });
    expect(resistanceBarChange(system, { resistanceBar: { value: 99 } })).toEqual({ resistance: 0, resistanceBar: { value: 5, max: 5 } });
    expect(resistanceBarChange(system, { resistanceBar: { value: -1 } })).toEqual({ resistance: 5, resistanceBar: { value: 0, max: 5 } });
  });

  it("an edit of the bar's max alone is put back to the track's", () => {
    expect(resistanceBarChange(system, { resistanceBar: { max: 9 } })).toEqual({ resistanceBar: { value: 4, max: 5 } });
  });

  it("marks and bar in one write: the marks win", () => {
    expect(resistanceBarChange(system, { resistance: 2, resistanceBar: { value: 5 } })).toEqual({ resistanceBar: { value: 3, max: 5 } });
  });
});

describe("staleResistanceBar and marksForLeft", () => {
  it("null when the stored bar agrees; the right bar otherwise", () => {
    expect(staleResistanceBar({ resistance: "1", resistanceMax: "5", resistanceBar: { value: 4, max: 5 } })).toBeNull();
    expect(staleResistanceBar({ resistance: "1", resistanceMax: "5" })).toEqual({ value: 4, max: 5 });
    expect(staleResistanceBar({ resistance: "1", resistanceMax: "5", resistanceBar: { value: 5, max: 5 } })).toEqual({ value: 4, max: 5 });
  });

  it("the marks that leave so much", () => {
    expect(marksForLeft({ resistanceMax: "5" }, 2)).toBe(3);
    expect(marksForLeft({ resistanceMax: "5" }, 7)).toBe(0);
    expect(marksForLeft({ resistanceMax: "5" }, -3)).toBe(5);
  });
});

describe("the hooks", () => {
  let hooks;
  beforeEach(() => {
    ({ hooks } = resetWorld());
    registerResistanceBarSync();
  });

  it("adds the bar to an adversary's update that marks Stress", () => {
    const actor = fakeActor({ id: "rat", type: "adversary", system: { resistance: "", resistanceMax: "5", resistanceBar: { value: 5, max: 5 } } });
    const changes = { system: { resistance: 2 } };
    hooks.call("preUpdateActor", actor, changes, {}, "gm");
    expect(changes.system).toEqual({ resistance: 2, resistanceBar: { value: 3, max: 5 } });
  });

  it("reads the stored data, not the prepared copy", () => {
    const actor = fakeActor({ id: "rat", type: "adversary", system: { resistance: 1, resistanceMax: 5, resistanceBar: { value: 4, max: 5 } } });
    // the stored bar is stale; the prepared one (HeartActor) already agrees
    actor._source = { system: { resistance: 1, resistanceMax: 5 } };
    const changes = { system: { resistance: 1 } };
    hooks.call("preUpdateActor", actor, changes, {}, "gm");
    expect(changes.system.resistanceBar).toEqual({ value: 4, max: 5 });
  });

  it("leaves characters and other updates alone", () => {
    const vess = fakeActor({ id: "vess", system: { resistance: 2 } });
    const changes = { system: { resistance: 3 } };
    hooks.call("preUpdateActor", vess, changes, {}, "gm");
    expect(changes.system.resistanceBar).toBeUndefined();
    const rat = fakeActor({ id: "rat", type: "adversary", system: { resistance: "1", resistanceMax: "5" } });
    const rename = { name: "Rat" };
    hooks.call("preUpdateActor", rat, rename, {}, "gm");
    expect(rename).toEqual({ name: "Rat" });
  });

  it("sets a new adversary's bar from the track it is made with", () => {
    const actor = { type: "adversary", system: { resistance: "2", resistanceMax: "6", resistanceBar: { value: 5, max: 5 } }, updateSource: vi.fn() };
    hooks.call("preCreateActor", actor, {}, {}, "gm");
    expect(actor.updateSource).toHaveBeenCalledWith({ "system.resistanceBar": { value: 4, max: 6 } });
    const fresh = { type: "adversary", system: { resistance: "", resistanceMax: "5", resistanceBar: { value: 5, max: 5 } }, updateSource: vi.fn() };
    hooks.call("preCreateActor", fresh, {}, {}, "gm");
    expect(fresh.updateSource).not.toHaveBeenCalled();
  });
});

describe("correctResistanceBars at ready", () => {
  const gm = fakeUser({ id: "gm", isGM: true });
  const p1 = fakeUser({ id: "p1" });

  beforeEach(() => {
    resetWorld();
    globalThis.Actor = { updateDocuments: vi.fn(async () => []) };
  });

  it("writes only the adversaries out of step, on the active GM's client", async () => {
    setUsers([gm, p1], { self: gm, activeGM: gm });
    fakeActor({ id: "rat", type: "adversary", system: { resistance: "2", resistanceMax: "5" } });
    fakeActor({ id: "ok", type: "adversary", system: { resistance: "", resistanceMax: "5", resistanceBar: { value: 5, max: 5 } } });
    fakeActor({ id: "vess", system: { resistance: "3" } });
    await correctResistanceBars();
    expect(Actor.updateDocuments).toHaveBeenCalledWith([{ _id: "rat", "system.resistanceBar": { value: 3, max: 5 } }]);
  });

  it("does nothing on a player's client", async () => {
    setUsers([gm, p1], { self: p1, activeGM: gm });
    fakeActor({ id: "rat", type: "adversary", system: { resistance: "2", resistanceMax: "5" } });
    await correctResistanceBars();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();
  });
});
