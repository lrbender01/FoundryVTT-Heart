/**
 * Glass sheets (src/common/glass.js, 2026-10-02): one switch per user, off
 * unless chosen; the title bar's Glass button flips it; the look hangs on a
 * body class; the ground is the content module's texture when it is active.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { glassOn, toggleGlass, glassToggleButton, applyGlassClass, glassGround, glassPass, glassLayers, GLASS_SETTING, GLASS_GROUND } from "../src/common/glass.js";
import { resetWorld } from "./helpers.mjs";

const key = `heart.${GLASS_SETTING}`;

beforeEach(() => {
  resetWorld();
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
    // more layers are never lighter, and the tint is held to 60%
    const l = glassLayers(35);
    expect(l.section).toBeLessThan(l.head);
    expect(l.head).toBeLessThan(l.strip);
    expect(l.strip).toBeLessThan(l.pill);
    expect(glassLayers(95).section).toBe(0.6);
  });

  it("grounds the glass in the content module's texture, or nothing without it", () => {
    expect(glassGround(false)).toBe("none");
    expect(glassGround(true)).toBe(`url("${GLASS_GROUND}")`);
    expect(glassGround(true, (p) => `/prefix/${p}`)).toBe(`url("/prefix/${GLASS_GROUND}")`);
  });
});
