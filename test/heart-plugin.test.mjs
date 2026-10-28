// Heart's plug-in for the board (src/map/index.js, 2026-10-28): the board
// lives in the fvtt-dream-board module, and the system hands it Heart's look,
// makes game.heart.board an alias of the module's api, and imports none of
// the old board code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeHooks } from "./helpers.mjs";

const SOURCE = fileURLToPath(new URL("../src/map/index.js", import.meta.url));

let hooks;
let plugin;

// a fake Dream Board module, its api recording what is registered
function fakeModule() {
  const api = { registerPlugin: vi.fn((p) => p), isBoardScene: () => false, followRename: vi.fn() };
  return { id: "fvtt-dream-board", active: true, api };
}

beforeAll(async () => {
  hooks = fakeHooks();
  globalThis.Hooks = hooks;
  plugin = await import("../src/map/index.js");
});

let mod;
beforeEach(() => {
  mod = fakeModule();
  game.modules = new Map([["fvtt-dream-board", mod]]);
});

describe("Heart's board plug-in", () => {
  it("registers the Heart plug-in with its look when the module calls dreamBoardReady", () => {
    const handlers = hooks.callbacks("dreamBoardReady");
    // (registered as the file loads; the call records are cleared before
    // each test, so the registry is what tells)
    expect(handlers).toHaveLength(1);
    handlers[0](mod.api);
    expect(mod.api.registerPlugin).toHaveBeenCalledTimes(1);
    expect(mod.api.registerPlugin).toHaveBeenCalledWith({
      id: "heart",
      look: {
        module: "fvtt-heart-content",
        file: "assets/art/map/heart-board.json",
        styles: "assets/art/map/styles.json",
        previews: "assets/art/_previews/index.json",
      },
    });
  });

  it("makes game.heart.board a getter for the module's api, never a plain object", () => {
    plugin.initialise();
    const d = Object.getOwnPropertyDescriptor(game.heart, "board");
    expect(typeof d.get).toBe("function");
    expect("value" in d).toBe(false);
    expect(game.heart.board).toBe(mod.api);
    // (read each time: the module sets its api after the system's init)
    const later = fakeModule();
    game.modules.set("fvtt-dream-board", later);
    expect(game.heart.board).toBe(later.api);
    game.modules.delete("fvtt-dream-board");
    expect(game.heart.board).toBeUndefined();
  });

  it("follows a landmark's rename onto its cards through the api, on the active GM's client", () => {
    game.user = { id: "gm", isGM: true };
    game.users = { activeGM: { id: "gm" } };
    const actor = { type: "landmark", name: "The Vermissian" };
    for (const fn of hooks.callbacks("updateActor")) fn(actor, { name: actor.name });
    expect(mod.api.followRename).toHaveBeenCalledWith(actor);
    mod.api.followRename.mockClear();
    for (const fn of hooks.callbacks("updateActor")) fn({ type: "character" }, { name: "x" });
    expect(mod.api.followRename).not.toHaveBeenCalled();
  });

  it("warns the GM at ready when the module is missing", () => {
    game.user = { id: "gm", isGM: true };
    game.modules = new Map();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const fn of hooks.callbacks("ready")) fn();
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.board.module-missing", { permanent: true });
    warn.mockRestore();
  });

  it("says nothing at ready when the module is there and on", () => {
    game.user = { id: "gm", isGM: true };
    for (const fn of hooks.callbacks("ready")) fn();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  it("imports nothing from the old board code", () => {
    const src = readFileSync(SOURCE, "utf8");
    const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
    expect(imports.filter((p) => p.includes("scrapboard/"))).toEqual([]);
    expect(src).not.toMatch(/from\s+['"]\.\/scrapboard\//);
    expect(src).not.toMatch(/import\s*\(\s*['"]\.\/scrapboard\//);
    expect(src).not.toMatch(/map\.sass/);
    expect(src).not.toMatch(/session-tools/);
  });
});
