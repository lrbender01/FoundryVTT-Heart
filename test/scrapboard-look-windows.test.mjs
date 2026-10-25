/**
 * Two of the board's health fixes (Luke, 2026-10-25; monorepo
 * docs/history/board-health-audit.md, batch C): a board look that failed to
 * load is asked for again, never kept for the session (look.js); a tool
 * window's contents are written only when they change, and never while the
 * pointer is held down in it (windows.js writeWindow).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

let loadBoardLook;
let reloadBoardLook;
let writeWindow;

beforeAll(async () => {
  const ctx = { font: "", measureText: () => ({ width: 0 }) };
  globalThis.document = { createElement: () => ({ getContext: () => ctx }), getElementById: () => null, body: { append() {} } };
  globalThis.window = { addEventListener: vi.fn(), removeEventListener() {}, devicePixelRatio: 1 };
  foundry.utils.getRoute = (p) => `/${p}`;
  ({ loadBoardLook, reloadBoardLook } = await import("../src/map/scrapboard/look.js"));
  ({ writeWindow } = await import("../src/map/scrapboard/windows.js"));
});

describe("a board look that failed to load", () => {
  beforeEach(() => {
    game.modules = new Map([["fvtt-heart-content", { active: true }]]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("is asked for again on the next draw; one that came is kept", async () => {
    let up = false;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("styles.json")) return { status: 404, ok: false };
      if (String(url).includes("_previews")) return { ok: false, status: 404 };
      return up ? { ok: true, status: 200, json: async () => ({ look: {}, library: {}, pools: {} }) } : { ok: false, status: 503, statusText: "down" };
    });
    reloadBoardLook("heart");
    expect((await loadBoardLook("heart")).ok).toBe(false);
    up = true;
    const second = await loadBoardLook("heart");
    expect(second.ok).toBe(true);
    // (kept now: the same answer without asking)
    const asked = fetch.mock.calls.length;
    expect(await loadBoardLook("heart")).toBe(second);
    expect(fetch.mock.calls.length).toBe(asked);
  });
});

describe("a tool window's contents", () => {
  const el = (active = false) => ({ innerHTML: "", isConnected: true, matches: (q) => q === ":active" && active });

  it("written when they change, left alone when they don't", () => {
    const w = el();
    expect(writeWindow(w, "<b>a</b>", () => {})).toBe(true);
    w.innerHTML = "<b>a</b><canvas></canvas>";
    expect(writeWindow(w, "<b>a</b>", () => {})).toBe(false);
    expect(w.innerHTML).toBe("<b>a</b><canvas></canvas>");
  });

  it("never while the pointer is held down in it: once it is let go", () => {
    const w = el(true);
    const again = vi.fn();
    expect(writeWindow(w, "<b>new</b>", again)).toBe(false);
    expect(w.innerHTML).toBe("");
    const [type, up] = window.addEventListener.mock.calls.at(-1);
    expect(type).toBe("pointerup");
    up();
    expect(again).toHaveBeenCalledOnce();
  });
});
