/**
 * The chat message class (src/chat-messages/index.js, 2026-10-02): which
 * rolls a card carries (its own, or chained in flags) and which buttons it
 * shows by default; the hardened content links; and a fallout card's Clear
 * button (FalloutRoll.clearStress), which confirms and then asks the GM's
 * client to clear.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initialise } from "../src/chat-messages/index.js";
import StressRoll from "../src/rolls/stress-roll/roll.js";
import FalloutRoll from "../src/rolls/fallout-roll/roll.js";
import HeartRoll from "../src/rolls/heart-roll/roll.js";
import { registerCardActions } from "../src/rolls/card-actions.js";
import characterProxies from "../src/actors/character/proxy.js";
import { resetWorld, fakeActor, fakeUser, fakeItem, setUsers, fakeMessage, queueDice } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];

let HeartChatMessage;
let HeartTextEditor;

beforeEach(() => {
  resetWorld();
  // "heart | Registering ChatMessage"
  vi.spyOn(console, "log").mockImplementation(() => {});
  game.heart = { resistances: RES, rolls: { StressRoll, FalloutRoll, HeartRoll } };
  CONFIG.Dice.rolls = [HeartRoll, StressRoll, FalloutRoll];
  initialise();
  HeartChatMessage = CONFIG.ChatMessage.documentClass;
  HeartTextEditor = globalThis.TextEditor;
});

function vess(values = {}) {
  return fakeActor({
    id: "vess",
    name: "Vess",
    owners: ["p1"],
    system: { resistances: Object.fromEntries(RES.map((r) => [r, { value: values[r] ?? 0, protection: 0 }])) },
    proxy: characterProxies.character,
  });
}

async function stressJSON() {
  const roll = StressRoll._build({ character: "vess", resistance: "blood", die_size: "d6" });
  queueDice(4);
  await roll.evaluate();
  return roll.toJSON();
}

async function falloutJSON(d12) {
  const roll = FalloutRoll._build({ character: "vess", resistance: "blood" });
  queueDice(d12);
  await roll.evaluate();
  return roll.toJSON();
}

describe("registering", () => {
  it("replaces the ChatMessage and TextEditor classes and binds the chat log", () => {
    expect(HeartChatMessage.name).toBe("HeartChatMessage");
    expect(HeartTextEditor.name).toBe("HeartTextEditor");
    expect(Hooks.on).toHaveBeenCalledWith("renderChatLog", expect.any(Function));
    expect(Hooks.on).toHaveBeenCalledWith("renderChatPopout", expect.any(Function));
  });
});

describe("the rolls a card carries", () => {
  it("its own stress roll, or one chained in the flags, or none", async () => {
    vess({ blood: 5 });
    const own = StressRoll._build({ character: "vess", resistance: "blood" });
    expect(new HeartChatMessage({ rolls: [own] }).stressRoll).toBe(own);
    const chained = new HeartChatMessage({ rolls: [{}], flags: { heart: { "stress-roll": await stressJSON() } } }).stressRoll;
    expect(chained).toBeInstanceOf(StressRoll);
    expect(chained.total).toBe(4);
    expect(chained.options).toMatchObject({ character: "vess", resistance: "blood", die_size: "d6" });
    expect(new HeartChatMessage({ rolls: [{}] }).stressRoll).toBeUndefined();
  });

  it("its fallout roll the same way", async () => {
    vess({ blood: 5 });
    const own = FalloutRoll._build({ character: "vess" });
    expect(new HeartChatMessage({ rolls: [own] }).falloutRoll).toBe(own);
    const chained = new HeartChatMessage({ rolls: [{}], flags: { heart: { "fallout-roll": await falloutJSON(2) } } }).falloutRoll;
    expect(chained).toBeInstanceOf(FalloutRoll);
    expect(chained.result).toBe("minor-fallout");
    expect(new HeartChatMessage({ rolls: [{}] }).falloutRoll).toBeUndefined();
  });

  it("a GM roll request is recognised by its flag", () => {
    expect(new HeartChatMessage({ flags: { heart: { "roll-request": {} } } }).isRollRequest).toBe(true);
    expect(new HeartChatMessage({}).isRollRequest).toBe(false);
  });
});

describe("the buttons a card shows by default", () => {
  beforeEach(() => vess({ blood: 5 }));
  const msg = (flags = {}) => new HeartChatMessage({ rolls: [{}], flags: { heart: flags } });

  it("Roll Stress: until a stress roll is attached, unless switched off", async () => {
    expect(msg().showStressRollButton).toBe(true);
    expect(msg({ "show-stress-roll-button": false }).showStressRollButton).toBe(false);
    expect(msg({ "stress-roll": await stressJSON() }).showStressRollButton).toBe(false);
    expect(msg({ "stress-roll": await stressJSON(), "show-stress-roll-button": true }).showStressRollButton).toBe(false);
  });

  it("Take Stress: only with a stress roll, until switched off", async () => {
    expect(msg().showTakeStressButton).toBe(false);
    expect(msg({ "show-take-stress-button": true }).showTakeStressButton).toBe(false);
    expect(msg({ "stress-roll": await stressJSON() }).showTakeStressButton).toBe(true);
    expect(msg({ "stress-roll": await stressJSON(), "show-take-stress-button": false }).showTakeStressButton).toBe(false);
  });

  it("Fallout: until a fallout roll is attached, unless the flag says", async () => {
    expect(msg().showFalloutRollButton).toBe(true);
    expect(msg({ "fallout-roll": await falloutJSON(9) }).showFalloutRollButton).toBe(false);
    expect(msg({ "show-fallout-roll-button": false }).showFalloutRollButton).toBe(false);
    expect(msg({ "show-fallout-roll-button": true, "fallout-roll": await falloutJSON(9) }).showFalloutRollButton).toBe(true);
  });

  it("Clear: only on a fallout that hit, until used", async () => {
    expect(msg().showClearStressButton).toBe(false);
    expect(msg({ "fallout-roll": await falloutJSON(9) }).showClearStressButton).toBe(false);
    expect(msg({ "fallout-roll": await falloutJSON(2) }).showClearStressButton).toBe(true);
    expect(msg({ "fallout-roll": await falloutJSON(2), "show-clear-stress-button": false }).showClearStressButton).toBe(false);
  });

  it("falloutDone: who already rolled", () => {
    expect(msg().falloutDone).toEqual([]);
    expect(msg({ "fallout-done": ["vess"] }).falloutDone).toEqual(["vess"]);
  });
});

describe("content links (hardened 2026-09-29)", () => {
  beforeEach(() => {
    globalThis.Handlebars.partials = {};
  });

  it("an unresolvable or failing link falls back to Foundry's own", async () => {
    const fallback = vi.spyOn(Object.getPrototypeOf(HeartTextEditor), "_createContentLink").mockResolvedValue("default-link");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await HeartTextEditor._createContentLink(["@UUID[Actor.gone]", "UUID", "Actor.gone"])).toBe("default-link");
    globalThis.fromUuid = async () => {
      throw new Error("bad uuid");
    };
    expect(await HeartTextEditor._createContentLink(["@UUID[x]", "UUID", "x"])).toBe("default-link");
    expect(warn).toHaveBeenCalled();
    fallback.mockRestore();
    warn.mockRestore();
  });

  it("an Item with no preview partial falls back too; every link type resolves", async () => {
    const fallback = vi.spyOn(Object.getPrototypeOf(HeartTextEditor), "_createContentLink").mockResolvedValue("default-link");
    const seen = [];
    globalThis.fromUuid = async (uuid) => {
      seen.push(uuid);
      return fakeItem({ id: "lamp", type: "equipment" });
    };
    await HeartTextEditor._createContentLink(["", "UUID", "Item.lamp"]);
    await HeartTextEditor._createContentLink(["", "Compendium", "pack.Item.lamp"]);
    await HeartTextEditor._createContentLink(["", "Item", "lamp"]);
    expect(seen).toEqual(["Item.lamp", "Compendium.pack.Item.lamp", "Item.lamp"]);
    expect(fallback).toHaveBeenCalledTimes(3);
    fallback.mockRestore();
  });
});

describe("a fallout card's Clear button (FalloutRoll.clearStress)", () => {
  const gm = fakeUser({ id: "gm", isGM: true });
  const p1 = fakeUser({ id: "p1" });
  const p2 = fakeUser({ id: "p2" });

  beforeEach(() => {
    setUsers([gm, p1, p2], { self: p1 });
    registerCardActions();
    Dialog.opened.length = 0;
  });

  // the confirmation's button, pressed once it is open
  async function press(promise, button) {
    await new Promise((r) => setTimeout(r, 0));
    Dialog.opened.at(-1).data.buttons[button].callback();
    return promise;
  }

  async function card(d12, resistances) {
    const actor = vess(resistances);
    const roll = FalloutRoll._build({ character: "vess", resistance: "mind" });
    queueDice(d12);
    await roll.evaluate();
    const msg = fakeMessage({ rolls: [roll] });
    return { actor, roll, msg };
  }

  it("a Minor clears the resistance that triggered it, after the confirmation", async () => {
    const { actor, roll, msg } = await card(2, { mind: 4, blood: 3 });
    await press(roll.clearStress(msg), "clear");
    expect(actor.system.resistances.mind.value).toBe(0);
    expect(actor.system.resistances.blood.value).toBe(3);
    expect(msg.flags.heart["show-clear-stress-button"]).toBe(false);
  });

  it("a Major clears every resistance", async () => {
    const { actor, roll, msg } = await card(8, { mind: 4, blood: 5 });
    await press(roll.clearStress(msg), "clear");
    expect(RES.map((r) => actor.system.resistances[r].value)).toEqual([0, 0, 0, 0, 0]);
  });

  it("Keep clears nothing", async () => {
    const { actor, roll, msg } = await card(2, { mind: 4 });
    await press(roll.clearStress(msg), "keep");
    expect(actor.update).not.toHaveBeenCalled();
    expect(msg.update).not.toHaveBeenCalled();
  });

  it("another player is refused before any confirmation", async () => {
    const { actor, roll, msg } = await card(2, { mind: 4 });
    setUsers([gm, p1, p2], { self: p2 });
    await roll.clearStress(msg);
    expect(Dialog.opened).toHaveLength(0);
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.party.not-owner{name=Vess}");
    expect(actor.update).not.toHaveBeenCalled();
  });
});
