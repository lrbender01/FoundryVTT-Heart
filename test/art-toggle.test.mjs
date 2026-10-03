/**
 * The one per-user art switch (src/common/art-toggle.js, 2026-10-02): off in
 * any window, off everywhere; the title bar's Art button flips it; a user who
 * had switched the old character art setting off keeps it off.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { artShown, toggleArt, artToggleButton, carryOldArtSetting, ART_SETTING } from "../src/common/art-toggle.js";
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

  it("leaves a choice already made alone", () => {
    localStorage.setItem("heart.showCharacterArt", "false");
    localStorage.setItem(key, "true");
    game.settings.store.set(key, true);
    carryOldArtSetting();
    expect(artShown()).toBe(true);
  });
});
