/**
 * Glass sheets (src/common/glass.js, 2026-10-02): one switch per user, off
 * unless chosen; the title bar's Glass button flips it; the look hangs on a
 * body class; the ground is the content module's texture when it is active.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { glassOn, toggleGlass, glassToggleButton, applyGlassClass, glassGround, glassPass, glassLayers, needsGlassReset, followGlassReset, GLASS_SETTING, GLASS_GROUND } from "../src/common/glass.js";
import { resetWorld } from "./helpers.mjs";

const key = `heart.${GLASS_SETTING}`;

beforeEach(() => {
  resetWorld();
});

describe("the GM's reset of everyone's sliders (2026-10-23)", () => {
  const defaults = () => {
    game.settings.settings = new Map([
      ["heart.glassSeeThrough", { default: 25 }],
      ["heart.glassBlur", { default: 6 }],
      ["heart.glassTint", { default: 80 }],
    ]);
  };

  it("follows a stamp once, never the default 0", () => {
    expect(needsGlassReset(0, 0)).toBe(false);
    expect(needsGlassReset(5, 0)).toBe(true);
    expect(needsGlassReset(5, 5)).toBe(false);
  });

  it("puts this client's sliders back to their defaults and leaves the switch alone", async () => {
    defaults();
    for (const [k, v] of [["glassSeeThrough", 60], ["glassBlur", 12], ["glassTint", 25], ["glassSheets", true], ["glassReset", 7], ["glassResetSeen", 0]]) game.settings.store.set(`heart.${k}`, v);
    expect(await followGlassReset()).toBe(true);
    expect(["glassSeeThrough", "glassBlur", "glassTint", "glassSheets", "glassResetSeen"].map((k) => game.settings.store.get(`heart.${k}`))).toEqual([25, 6, 80, true, 7]);
    // (once per stamp: a slider moved since stays where it was put)
    game.settings.store.set("heart.glassBlur", 3);
    expect(await followGlassReset()).toBe(false);
    expect(game.settings.store.get("heart.glassBlur")).toBe(3);
  });

  it("says so only where a slider moved (Luke, 2026-10-25)", async () => {
    defaults();
    const said = () => ui.notifications.info.mock.calls.filter(([m]) => m === "heart.glass.reset-done").length;
    // (a new player: every slider already at its default)
    for (const [k, v] of [["glassSeeThrough", 25], ["glassBlur", 6], ["glassTint", 80], ["glassReset", 9], ["glassResetSeen", 0]]) game.settings.store.set(`heart.${k}`, v);
    const before = said();
    expect(await followGlassReset()).toBe(true);
    expect(said()).toBe(before);
    expect(game.settings.store.get("heart.glassResetSeen")).toBe(9);
    // (one slider moved: put back, and said)
    game.settings.store.set("heart.glassBlur", 3);
    game.settings.store.set("heart.glassReset", 10);
    expect(await followGlassReset()).toBe(true);
    expect(game.settings.store.get("heart.glassBlur")).toBe(6);
    expect(said()).toBe(before + 1);
  });
});

describe("the glass switch", () => {
  it("is off unless switched on", () => {
    expect(glassOn()).toBe(false);
    game.settings.store.set(key, true);
    expect(glassOn()).toBe(true);
  });

  it("the Glass button flips it", async () => {
    await toggleGlass();
    expect(glassOn()).toBe(true);
    await glassToggleButton().onclick();
    expect(glassOn()).toBe(false);
    expect(glassToggleButton()).toMatchObject({ class: "heart-glass-toggle", icon: "fas fa-gem" });
  });

  it("sets the page's class from the switch", () => {
    const toggle = vi.fn();
    globalThis.document = { body: { classList: { toggle } } };
    applyGlassClass();
    expect(toggle).toHaveBeenLastCalledWith("heart-glass", false);
    game.settings.store.set(key, true);
    applyGlassClass();
    expect(toggle).toHaveBeenLastCalledWith("heart-glass", true);
  });

  it("lets the scene through by the see-through share, blurred, and costs no blur when solid", () => {
    expect(glassPass(40, 12)).toEqual({ clear: 0.4, pass: "blur(12px)" });
    expect(glassPass(0, 12)).toEqual({ clear: 0, pass: "none" });
    expect(glassPass(40, 0)).toEqual({ clear: 0.4, pass: "none" });
    expect(glassPass(150, 5)).toEqual({ clear: 0.9, pass: "blur(5px)" });
    expect(glassPass(undefined, undefined)).toEqual({ clear: 0, pass: "none" });
  });

  it("makes every piece the same glass, darker only by its layers", () => {
    expect(glassLayers(20)).toEqual({ section: 0.2, head: 0.488, strip: 0.738, pill: 0.79 });
    expect(glassLayers(0)).toEqual({ section: 0, head: 0, strip: 0, pill: 0 });
    // more layers are never lighter, and the tint is held to 90%
    const l = glassLayers(35);
    expect(l.section).toBeLessThan(l.head);
    expect(l.head).toBeLessThan(l.strip);
    expect(l.strip).toBeLessThan(l.pill);
    expect(glassLayers(80).section).toBe(0.8);
    expect(glassLayers(95).section).toBe(0.9);
  });

  it("grounds the glass in the content module's texture, or nothing without it", () => {
    expect(glassGround(false)).toBe("none");
    expect(glassGround(true)).toBe(`url("${GLASS_GROUND}")`);
    expect(glassGround(true, (p) => `/prefix/${p}`)).toBe(`url("/prefix/${GLASS_GROUND}")`);
  });
});
