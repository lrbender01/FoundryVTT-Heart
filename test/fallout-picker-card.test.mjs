/**
 * A chat card's Pick Fallout button (src/fallout-picker/index.js and
 * button.js, 2026-10-21, audit R1). Foundry 12.343 fires renderChatMessage
 * inside ChatMessage#getHTML, and HeartChatMessage.getHTML redraws the roll
 * after it, so the button is wired by delegation on the chat log (here) and
 * stripped for players at the end of getHTML (chat.test.mjs).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/fallout-picker/picker", () => ({ openFalloutPicker: vi.fn(async () => null) }));

const { activateListeners, onPickFallout, initialise } = await import("../src/fallout-picker/index.js");
const { openFalloutPicker } = await import("../src/fallout-picker/picker");
const { stripGmOnly } = await import("../src/fallout-picker/button.js");
const { resetWorld, fakeActor, fakeUser, setUsers, fakeMessage } = await import("./helpers.mjs");

const gm = fakeUser({ id: "gm", isGM: true });
const p1 = fakeUser({ id: "p1" });

// the button's element, inside a card (closest answers by selector)
function pickButton({ onFalloutCard = true } = {}) {
  return {
    dataset: { target: "Actor.vess", severity: "minor", resistance: "blood" },
    closest: (sel) => {
      if (sel === "[data-message-id]") return { dataset: { messageId: "m1" } };
      if (sel === ".fallout-roll") return onFalloutCard ? {} : null;
      return null;
    },
  };
}

beforeEach(() => {
  resetWorld();
  fakeActor({ id: "vess", name: "Vess" });
  openFalloutPicker.mockClear();
});

describe("Pick Fallout, delegated on the chat log", () => {
  it("binds one click handler for every card, now and later", () => {
    const html = { on: vi.fn() };
    activateListeners(html);
    expect(html.on).toHaveBeenCalledWith("click", "[data-action=pick-fallout]", onPickFallout);
  });

  it("the chat log and every popout get it", () => {
    game.heart = {};
    initialise();
    expect(Hooks.on).toHaveBeenCalledWith("renderChatLog", expect.any(Function));
    expect(Hooks.on).toHaveBeenCalledWith("renderChatPopout", expect.any(Function));
    expect(game.heart.fallout.pick).toBe(openFalloutPicker);
  });

  it("the GM's click opens the picker, recording the pick on a fallout card", async () => {
    setUsers([gm, p1], { self: gm });
    fakeMessage({ id: "m1" });
    await onPickFallout({ preventDefault() {}, currentTarget: pickButton() });
    expect(openFalloutPicker).toHaveBeenCalledTimes(1);
    const args = openFalloutPicker.mock.calls[0][0];
    expect(args).toMatchObject({ severity: "minor", resistance: "blood" });
    expect(args.target.id).toBe("vess");
    expect(typeof args.onPicked).toBe("function");
  });

  it("off a fallout card nothing is recorded", async () => {
    setUsers([gm, p1], { self: gm });
    await onPickFallout({ preventDefault() {}, currentTarget: pickButton({ onFalloutCard: false }) });
    expect(openFalloutPicker.mock.calls[0][0].onPicked).toBeUndefined();
  });

  it("a player's click does nothing", async () => {
    setUsers([gm, p1], { self: p1 });
    await onPickFallout({ preventDefault() {}, currentTarget: pickButton() });
    expect(openFalloutPicker).not.toHaveBeenCalled();
  });
});

describe("stripGmOnly", () => {
  function card(log) {
    return {
      find: (sel) => ({
        remove: () => log.push(sel),
        filter: () => ({ remove: () => log.push(`${sel} (empty)`) }),
      }),
    };
  }

  it("takes GM-only controls and the emptied button row out of a player's card", () => {
    const log = [];
    stripGmOnly(card(log), p1);
    expect(log).toEqual(["[data-gm-only]", ".ledger-acts (empty)"]);
  });

  it("leaves the GM's card alone", () => {
    const log = [];
    stripGmOnly(card(log), gm);
    expect(log).toEqual([]);
  });
});
