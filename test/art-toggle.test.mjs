/**
 * The one per-user art switch (src/common/art-toggle.js, 2026-10-02): off in
 * any window, off everywhere; the title bar's Art button flips it; a user who
 * had switched the old character art setting off keeps it off.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { artShown, toggleArt, artToggleButton, carryOldArtSetting, redrawArtWindows, ART_SETTING } from "../src/common/art-toggle.js";
import { resetWorld } from "./helpers.mjs";

const key = `heart.${ART_SETTING}`;

beforeEach(() => {
  resetWorld();
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
});

describe("the art switch", () => {
  it("is on unless switched off", () => {
    expect(artShown()).toBe(true);
    game.settings.store.set(key, false);
    expect(artShown()).toBe(false);
  });

  it("the Art button flips it for every window", async () => {
    await toggleArt();
    expect(artShown()).toBe(false);
    await artToggleButton().onclick();
    expect(artShown()).toBe(true);
    expect(artToggleButton()).toMatchObject({ class: "heart-art-toggle", icon: "fas fa-image" });
  });

  it("carries the old character art setting over once", () => {
    localStorage.setItem("heart.showCharacterArt", "false");
    carryOldArtSetting();
    expect(artShown()).toBe(false);
  });

  // the class sits on the form of most sheets, not on the window
  it("every open Heart window redraws at once", () => {
    const el = (own, inner) => ({ length: 1, hasClass: () => own, find: () => ({ length: inner ? 1 : 0 }) });
    const win = (element, rendered = true) => ({ element, rendered, render: vi.fn() });
    const sheet = win(el(false, true)), choose = win(el(true, false)), other = win(el(false, false)), closed = win(el(false, true), false);
    globalThis.ui = { windows: { 1: sheet, 2: choose, 3: other, 4: closed } };
    globalThis.document = { body: { classList: { toggle: vi.fn() } } };
    redrawArtWindows();
    expect(sheet.render).toHaveBeenCalledWith(false);
    expect(choose.render).toHaveBeenCalledWith(false);
    expect(other.render).not.toHaveBeenCalled();
    expect(closed.render).not.toHaveBeenCalled();
  });

  it("leaves a choice already made alone", () => {
    localStorage.setItem("heart.showCharacterArt", "false");
    localStorage.setItem(key, "true");
    game.settings.store.set(key, true);
    carryOldArtSetting();
    expect(artShown()).toBe(true);
  });
});
