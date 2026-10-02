/**
 * The party's API with fake documents (src/actors/party/party.js,
 * 2026-10-02): every Provisions action through the relay (no GM connected,
 * so it runs locally), the cards they post, the refusals, the quartermaster
 * post, reset, the singleton guards (preUpdateActor, preCreateActor,
 * preDeleteActor), and the restock card's claimed fallout buttons.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markProvisions,
  upkeep,
  relieveProvisions,
  restock,
  clearProvisions,
  reset,
  setQuartermaster,
  volunteerQuartermaster,
  resignQuartermaster,
  registerPartyHooks,
  ensureParty,
  PARTY_IMG,
} from "../src/actors/party/party.js";
import partyProxies from "../src/actors/party/proxy.js";
import StressRoll from "../src/rolls/stress-roll/roll.js";
import FalloutRoll from "../src/rolls/fallout-roll/roll.js";
import { registerCardActions } from "../src/rolls/card-actions.js";
import characterProxies from "../src/actors/character/proxy.js";
import { resetWorld, fakeActor, fakeItem, fakeUser, setUsers, fakeMessage, queueDice, FakeChatMessage, unescaped } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];
const tracks = (values = {}) => Object.fromEntries(RES.map((r) => [r, { value: 0, protection: 0, ...(values[r] ?? {}) }]));

const gm = fakeUser({ id: "gm", isGM: true });
const p1 = fakeUser({ id: "p1" });
const p2 = fakeUser({ id: "p2" });
const asGM = () => setUsers([gm, p1, p2], { self: gm });
const asPlayer = (u = p1) => setUsers([gm, p1, p2], { self: u });

function character(id, { owners = [], resistances = {} } = {}) {
  return fakeActor({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    owners,
    system: { resistances: tracks(resistances) },
    proxy: characterProxies.character,
  });
}

function party({ value = 0, quartermaster = "", members = [], owners = ["p1", "p2"], items = [] } = {}) {
  const p = fakeActor({
    id: "party",
    name: "The Party",
    type: "party",
    owners,
    items,
    system: { provisions: { value, max: 20 }, quartermaster, members, notes: "old notes" },
    proxy: partyProxies.party,
  });
  game.heart.party = p;
  return p;
}

const warned = () => ui.notifications.warn.mock.calls.map((c) => c[0]);
// what was posted, each card's content with Handlebars' escapes undone
const posted = () => FakeChatMessage.create.mock.calls.map((c) => ({ ...c[0], content: unescaped(c[0].content ?? "") }));

beforeEach(() => {
  resetWorld();
  asPlayer(p1);
  game.heart = { resistances: RES, party_resistances: ["provisions"], rolls: { StressRoll, FalloutRoll } };
  CONFIG.Dice.rolls = [StressRoll, FalloutRoll];
  registerCardActions();
});

describe("markProvisions and upkeep", () => {
  it("rolls the die, less the quartermaster's Protection, and posts the stress card", async () => {
    const qm = character("qm", { owners: ["p2"], resistances: { supplies: { protection: 1 } } });
    const vess = character("vess", { owners: ["p1"] });
    const p = party({ value: 5, quartermaster: qm.id });
    queueDice(4);
    const roll = await markProvisions({ die: "D6", byActorId: vess.id });
    expect(p.system.provisions.value).toBe(8);
    expect(roll.options).toMatchObject({ resistance: "provisions", die_size: "d6", character: "vess", result: "n_a" });
    expect(roll.options.applied).toEqual([{ id: "party", name: "The Party", amount: 3, protection: 1, marked: true, shared: true }]);
    const [msg] = posted();
    expect(msg.flags.heart).toEqual({ "show-take-stress-button": false, "show-fallout-roll-button": true });
    expect(msg.speaker).toEqual({ actor: "vess", alias: "Vess" });
    expect(msg.flavor).toBeUndefined();
    expect(msg.rolls[0]).toBe(roll);
  });

  it("a fixed amount, ignoring Protection; fully stopped offers no fallout", async () => {
    const qm = character("qm", { resistances: { supplies: { protection: 3 } } });
    const p = party({ value: 0, quartermaster: qm.id });
    await markProvisions({ amount: "2.9", ignoreProtection: true });
    expect(p.system.provisions.value).toBe(2);
    await markProvisions({ amount: 2 });
    expect(p.system.provisions.value).toBe(2);
    expect(posted()[1].flags.heart["show-fallout-roll-button"]).toBe(false);
    // nobody's character: the party speaks
    expect(posted()[0].speaker.actor).toBe("party");
  });

  it("upkeep is a D4 with its source as the flavour", async () => {
    const p = party({ value: 1 });
    queueDice(2);
    const roll = await upkeep();
    expect(roll.formula).toBe("d4");
    expect(p.system.provisions.value).toBe(3);
    expect(posted()[0].flavor).toBe("heart.party.source.upkeep");
  });

  it("the track stops at its max", async () => {
    const p = party({ value: 19 });
    await markProvisions({ amount: 6 });
    expect(p.system.provisions.value).toBe(20);
  });

  it("refused with no party, or for a user who does not own it", async () => {
    expect(await markProvisions({ amount: 1 })).toBeNull();
    party({ owners: ["p2"] });
    expect(await markProvisions({ amount: 1 })).toBeNull();
    expect(warned()).toEqual(["heart.party.no-party", "heart.party.not-owner{name=The Party}"]);
    expect(FakeChatMessage.create).not.toHaveBeenCalled();
  });
});

describe("relieveProvisions", () => {
  it("rolls the relief and posts a ledger card", async () => {
    const p = party({ value: 5 });
    queueDice(3);
    const result = await relieveProvisions({ source: "scavenge" });
    expect(result).toEqual({ amount: 3, from: 5, to: 2 });
    expect(p.system.provisions.value).toBe(2);
    const [msg] = posted();
    expect(msg.content).toContain("heart.card.provisions-change{from=5,to=2,max=20}");
    expect(msg.content).toContain("heart.card.provisions-out{amount=-3}");
    expect(msg.content).toContain("heart.party.source.scavenge");
    expect(msg.rolls).toHaveLength(1);
  });

  it("a fixed amount rolls nothing and never goes below zero", async () => {
    const p = party({ value: 2 });
    expect(await relieveProvisions({ amount: 5 })).toEqual({ amount: 5, from: 2, to: 0 });
    expect(p.system.provisions.value).toBe(0);
    expect(posted()[0].rolls).toEqual([]);
    expect(posted()[0].content).toContain("heart.card.relief");
  });

  it("refused for a user who does not own the party", async () => {
    const p = party({ value: 4, owners: [] });
    expect(await relieveProvisions({ amount: 1 })).toBeNull();
    expect(p.update).not.toHaveBeenCalled();
  });
});

describe("restock", () => {
  it("the payer marks their Supplies, Provisions loses one size larger, one card", async () => {
    const vess = character("vess", { owners: ["p1"], resistances: { supplies: { value: 1, protection: 1 } } });
    const p = party({ value: 10 });
    queueDice(4, 5); // the d6 payment, then the d8 relief
    const result = await restock({ payerId: vess.id, die: "D6" });
    expect(result).toMatchObject({ amount: 5, from: 10, to: 5 });
    expect(vess.system.resistances.supplies.value).toBe(4);
    expect(p.system.provisions.value).toBe(5);
    const [msg] = posted();
    expect(msg.rolls).toHaveLength(2);
    expect(msg.content).toContain("heart.card.pays{name=Vess,die=D6}");
    expect(msg.content).toContain("heart.card.restock-det{die=D8}");
    expect(msg.content).toContain('data-claim="fallout-vess"');
  });

  it("Protection that stops the payment leaves no fallout button", async () => {
    const vess = character("vess", { owners: ["p1"], resistances: { supplies: { protection: 4 } } });
    party({ value: 10 });
    queueDice(3, 2);
    await restock({ payerId: vess.id, die: "d4" });
    expect(vess.update).not.toHaveBeenCalled();
    expect(posted()[0].content).not.toContain("ledger-fallout");
  });

  it("refusals: a die off the ladder, a payer who is not a character, or not yours", async () => {
    const vess = character("vess", { owners: ["p2"] });
    const rex = fakeActor({ id: "rex", type: "hireling", owners: ["p1"] });
    const p = party({ value: 10 });
    expect(await restock({ payerId: vess.id, die: "d12" })).toBeNull();
    expect(await restock({ payerId: rex.id })).toBeNull();
    expect(await restock({ payerId: vess.id })).toBeNull();
    expect(warned()).toEqual(["heart.party.restock-die", "heart.party.restock-payer", "heart.party.not-owner{name=Vess}"]);
    expect(p.update).not.toHaveBeenCalled();
  });
});

describe("clearProvisions and reset", () => {
  it("clearProvisions empties the track, no card", async () => {
    const p = party({ value: 13 });
    expect(await clearProvisions()).toEqual({ from: 13, to: 0 });
    expect(p.system.provisions.value).toBe(0);
    expect(FakeChatMessage.create).not.toHaveBeenCalled();
  });

  it("reset is the GM's: everything back to a fresh party", async () => {
    const p = party({
      value: 7,
      quartermaster: "vess",
      members: ["vess"],
      items: [
        { name: "Empty", type: "fallout", system: {} },
        { name: "Tent", type: "item", system: {} },
      ],
    });
    p.name = "The Drowned";
    expect(await reset()).toBeNull();
    expect(warned()).toEqual(["heart.party.gm-only"]);
    asGM();
    expect(await reset()).toBe(p);
    expect(p).toMatchObject({ name: "heart.party.default-name", img: PARTY_IMG });
    expect(p.system).toMatchObject({ provisions: { value: 0 }, quartermaster: "", members: [], notes: "" });
    expect(p.items.size).toBe(0);
  });
});

describe("the quartermaster post", () => {
  it("setQuartermaster: the GM picks a character, or clears it", async () => {
    const vess = character("vess", { owners: ["p1"] });
    fakeActor({ id: "rex", type: "hireling" });
    const p = party();
    expect(await setQuartermaster("vess")).toBeNull();
    asGM();
    expect(await setQuartermaster("rex")).toBeNull();
    expect(await setQuartermaster("gone")).toBeNull();
    expect(warned()).toEqual([
      "heart.party.gm-only-settings",
      "heart.party.quartermaster-character",
      "heart.party.quartermaster-character",
    ]);
    expect(await setQuartermaster("vess")).toBe(vess);
    expect(p.system.quartermaster).toBe("vess");
    expect(await setQuartermaster("")).toBeNull();
    expect(p.system.quartermaster).toBe("");
  });

  it("volunteer: a member you own, while the post is empty", async () => {
    character("vess", { owners: ["p1"] });
    character("kettle", { owners: ["p2"] });
    character("ash", { owners: ["p1"] });
    const p = party({ members: ["vess", "kettle"] });
    expect(await volunteerQuartermaster("kettle")).toBeNull();
    expect(await volunteerQuartermaster("ash")).toBeNull();
    expect((await volunteerQuartermaster("vess")).id).toBe("vess");
    expect(p.system.quartermaster).toBe("vess");
    asPlayer(p2);
    expect(await volunteerQuartermaster("kettle")).toBeNull();
    expect(warned()).toEqual(Array(3).fill("heart.party.volunteer-refused"));
  });

  it("resign: only the quartermaster's own player", async () => {
    character("vess", { owners: ["p1"] });
    const p = party({ members: ["vess"], quartermaster: "vess" });
    asPlayer(p2);
    expect(await resignQuartermaster("vess")).toBeNull();
    expect(warned()).toEqual(["heart.party.resign-refused"]);
    asPlayer(p1);
    expect((await resignQuartermaster("vess")).id).toBe("vess");
    expect(p.system.quartermaster).toBe("");
  });
});

describe("the party's guards", () => {
  let hooks;
  beforeEach(() => {
    hooks = globalThis.Hooks;
    registerPartyHooks();
  });
  const preUpdate = (actor, changes, userId = game.user.id) => hooks.callbacks("preUpdateActor")[0](actor, changes, {}, userId);

  it("a player may not rename the party, add members, or pick someone else as quartermaster", () => {
    character("vess", { owners: ["p1"] });
    character("kettle", { owners: ["p2"] });
    const p = party({ members: ["vess", "kettle"] });
    expect(preUpdate(p, { name: "Mine" })).toBe(false);
    expect(preUpdate(p, { system: { members: ["vess", "kettle", "ash"] } })).toBe(false);
    expect(preUpdate(p, { system: { quartermaster: "kettle" } })).toBe(false);
    expect(warned()).toEqual(Array(3).fill("heart.party.gm-only-settings"));
  });

  it("a player may mark Provisions, leave, volunteer, and resign", () => {
    character("vess", { owners: ["p1"] });
    const p = party({ members: ["vess", "kettle"] });
    expect(preUpdate(p, { system: { provisions: { value: 4 } } })).toBeUndefined();
    expect(preUpdate(p, { name: "The Party" })).toBeUndefined();
    expect(preUpdate(p, { system: { members: ["kettle"] } })).toBeUndefined();
    expect(preUpdate(p, { system: { quartermaster: "vess" } })).toBeUndefined();
    p.system.quartermaster = "vess";
    expect(preUpdate(p, { system: { quartermaster: "" } })).toBeUndefined();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  it("the GM may change anything; other actors are not guarded", () => {
    const p = party();
    expect(preUpdate(p, { name: "The Drowned" }, "gm")).toBeUndefined();
    const vess = character("vess", { owners: ["p1"] });
    expect(preUpdate(vess, { name: "Vessa" })).toBeUndefined();
  });

  it("another user's refused update warns only on their own client", () => {
    const p = party();
    expect(preUpdate(p, { name: "Theirs" }, "p2")).toBe(false);
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  // Found by this test and fixed 2026-10-02: the guard only blocked ADDED
  // ids, so any player could drop another player's character; players add
  // and remove only their own characters, the GM anyone
  it("a player may not take someone else's character out of the party", () => {
    character("vess", { owners: ["p1"] });
    character("kettle", { owners: ["p2"] });
    const p = party({ members: ["vess", "kettle"] });
    expect(preUpdate(p, { system: { members: ["vess"] } })).toBe(false);
  });

  it("one party per world, owned by everyone", () => {
    const preCreate = hooks.callbacks("preCreateActor")[0];
    const doc = { type: "party", updateSource: vi.fn() };
    expect(preCreate(doc, {}, {}, game.user.id)).toBeUndefined();
    expect(doc.updateSource).toHaveBeenCalledWith({ "ownership.default": 3, "flags.heart.singleton": true });
    party();
    expect(preCreate({ type: "party", updateSource: vi.fn() }, {}, {}, game.user.id)).toBe(false);
    expect(warned()).toEqual(["heart.party.singleton"]);
    expect(preCreate({ type: "party", updateSource: vi.fn() }, {}, { heartAllowSecondParty: true }, game.user.id)).toBeUndefined();
    expect(preCreate({ type: "character" }, {}, {}, game.user.id)).toBeUndefined();
  });

  it("the party is never deleted, unless forced", () => {
    const preDelete = hooks.callbacks("preDeleteActor")[0];
    const p = party();
    expect(preDelete(p, {}, game.user.id)).toBe(false);
    expect(warned()).toEqual(["heart.party.no-delete"]);
    expect(preDelete(p, { heartForce: true }, game.user.id)).toBeUndefined();
    expect(preDelete({ type: "character" }, {}, game.user.id)).toBeUndefined();
  });

  it("ensureParty runs once at ready, and only on the active GM's client", async () => {
    expect(hooks.once).toHaveBeenCalledWith("ready", ensureParty);
    globalThis.Actor = { create: vi.fn() };
    await ensureParty();
    expect(Actor.create).not.toHaveBeenCalled();
    setUsers([gm, p1], { self: gm, activeGM: gm });
    await ensureParty();
    expect(Actor.create).toHaveBeenCalledWith(expect.objectContaining({ type: "party", img: PARTY_IMG, flags: { heart: { singleton: true } } }));
    const p = party();
    p.img = "systems/heart/assets/icons/resistances/supplies.svg";
    await ensureParty();
    expect(Actor.create).toHaveBeenCalledTimes(1);
    expect(p.img).toBe(PARTY_IMG);
  });
});

describe("the restock card's payer fallout button", () => {
  let hooks;
  beforeEach(() => {
    hooks = globalThis.Hooks;
    registerPartyHooks();
  });

  // the card as the hook reads it: [data-action=ledger-fallout] buttons
  // inside one .ledger-acts box
  function card(buttons) {
    const acts = {
      kids: [],
      removed: false,
      querySelector() {
        return this.kids[0] ?? null;
      },
      remove() {
        acts.removed = true;
      },
    };
    const els = buttons.map((dataset) => {
      const el = {
        dataset,
        removed: false,
        classList: { add() {}, remove() {} },
        remove() {
          el.removed = true;
          acts.kids.splice(acts.kids.indexOf(el), 1);
        },
      };
      acts.kids.push(el);
      return el;
    });
    const handlers = [];
    const html = {
      find(selector) {
        const list = selector === ".ledger-acts" ? [acts] : els.filter((e) => !e.removed);
        return {
          each(fn) {
            list.forEach((el, i) => fn(i, el));
          },
          on(_event, fn) {
            handlers.push(fn);
          },
        };
      },
    };
    return { html, acts, els, click: (el) => handlers[0]({ preventDefault() {}, currentTarget: el }) };
  }
  const render = (message, html) => hooks.callbacks("renderChatMessage")[0](message, html);

  it("a claimed button is left out; the box goes when it is empty", () => {
    const msg = fakeMessage({ flags: { heart: { claimed: { "fallout-vess": true } } } });
    const one = card([{ claim: "fallout-vess", character: "vess" }, { character: "kettle" }]);
    render(msg, one.html);
    expect(one.els.map((e) => e.removed)).toEqual([true, false]);
    expect(one.acts.removed).toBe(false);
    const all = card([{ claim: "fallout-vess", character: "vess" }]);
    render(msg, all.html);
    expect(all.acts.removed).toBe(true);
  });

  it("rolls the payer's fallout once, however many clicks", async () => {
    const vess = character("vess", { owners: ["p1"], resistances: { supplies: { value: 6 } } });
    const msg = fakeMessage();
    const c = card([{ claim: "fallout-vess", character: "vess", resistance: "supplies" }]);
    render(msg, c.html);
    queueDice(3);
    await c.click(c.els[0]);
    expect(msg.flags.heart.claimed).toEqual({ "fallout-vess": true });
    const [falloutCard] = posted();
    expect(falloutCard.rolls[0]).toBeInstanceOf(FalloutRoll);
    expect(falloutCard.rolls[0].options).toMatchObject({ character: "vess", resistance: "supplies", totalStress: 6 });
    await c.click(c.els[0]);
    expect(posted()).toHaveLength(1);
    expect(warned()).toEqual(["heart.relay.already"]);
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("only the payer's own player (or the GM) may roll it", async () => {
    character("vess", { owners: ["p2"] });
    const msg = fakeMessage();
    const c = card([{ claim: "fallout-vess", character: "vess", resistance: "supplies" }]);
    render(msg, c.html);
    await c.click(c.els[0]);
    expect(warned()).toEqual(["heart.party.not-owner{name=Vess}"]);
    expect(msg.update).not.toHaveBeenCalled();
    expect(FakeChatMessage.create).not.toHaveBeenCalled();
  });
});

describe("a party fallout item", () => {
  it("the Empty fallout cancels the quartermaster's Protection on marks", async () => {
    const qm = character("qm", { resistances: { supplies: { protection: 3 } } });
    const p = party({ value: 0, quartermaster: qm.id });
    fakeItem({ name: "Empty", type: "fallout", system: { complete: false }, parent: p });
    await markProvisions({ amount: 4 });
    expect(p.system.provisions.value).toBe(4);
  });
});
