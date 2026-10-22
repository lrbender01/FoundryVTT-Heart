/**
 * What chat-card buttons write, run by the GM's client (src/rolls/
 * card-actions.js, 2026-10-02): each applies once however many clicks or
 * players, refuses the wrong user, writes single keys, and Provisions marks
 * made at the same moment all count (src/actors/party/party.js
 * applyProvisions through the relay queue).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CARD_ACTIONS, registerCardActions, mayRunStress, falloutKeyCharacter } from "../src/rolls/card-actions.js";
import { relay } from "../src/common/relay.js";
import { provisionsChange } from "../src/actors/party/rules.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function setPath(obj, path, value) {
  const keys = path.split(".");
  let at = obj;
  for (const k of keys.slice(0, -1)) at = at[k] ??= {};
  at[keys.at(-1)] = value;
}

// a ChatMessage as the handlers read it: heart flags, rolls, an owner flag,
// and an update that lands (after a beat, like the server round trip)
function makeMessage({ id = "m1", flags = {}, rolls = [], isOwner = true, stressRoll } = {}) {
  const msg = {
    id,
    isOwner,
    rolls,
    flags: { heart: structuredClone(flags) },
    getFlag(scope, key) {
      return foundry.utils.getProperty(this.flags[scope] ?? {}, key);
    },
    update: vi.fn(async function (changes) {
      await tick(2);
      for (const [k, v] of Object.entries(changes)) {
        if (k.startsWith("flags.")) setPath(msg.flags, k.slice(6), v);
        else msg[k] = v;
      }
      return msg;
    }),
    get stressRoll() {
      return stressRoll ?? (this.flags.heart["stress-roll"] ? fakeStressRoll(this.flags.heart["stress-roll"]) : undefined);
    },
  };
  game.messages.set(id, msg);
  return msg;
}

class FakeStressRoll {
  constructor(options) {
    this.options = options;
    this.takeStress = vi.fn(async () => {
      this.options.applied = [{ id: options.character, amount: 3 }];
      return this.options.applied;
    });
  }
  toJSON() {
    return { class: "StressRoll", options: this.options };
  }
}
const fakeStressRoll = (json) => new FakeStressRoll({ ...json.options });

function makeCharacter(id, { owners = [], resistances } = {}) {
  const actor = {
    id,
    type: "character",
    name: id,
    system: {
      resistances: resistances ?? {
        blood: { value: 2 },
        mind: { value: 4 },
        echo: { value: 0 },
        fortune: { value: 1 },
        supplies: { value: 3 },
      },
    },
    testUserPermission: (user) => Boolean(user?.isGM || owners.includes(user?.id)),
    update: vi.fn(async (changes) => {
      await tick(2);
      for (const [k, v] of Object.entries(changes)) setPath(actor, k, v);
    }),
  };
  game.actors.set(id, actor);
  return actor;
}

function makeParty(value = 0) {
  const party = {
    id: "party",
    type: "party",
    name: "The Party",
    items: [],
    system: { provisions: { value, max: 20 }, quartermaster: "", members: [] },
    testUserPermission: () => true,
    update: vi.fn(async (changes) => {
      await tick(3);
      for (const [k, v] of Object.entries(changes)) setPath(party, k, v);
    }),
  };
  game.actors.set("party", party);
  return party;
}

const player = { id: "p1", isGM: false };
const other = { id: "p2", isGM: false };
const gm = { id: "gm", isGM: true };

beforeEach(() => {
  game.user = player;
  game.users = Object.assign(new Map([player, other, gm].map((u) => [u.id, u])), { activeGM: null });
  game.messages = new Map();
  game.heart = {
    rolls: { StressRoll: FakeStressRoll },
    stress_targets: ["blood", "mind", "echo", "fortune", "supplies", "provisions"],
    stress_results: ["n_a", "success_at_a_cost", "failure", "critical_failure"],
  };
  globalThis.Roll = { fromData: (json) => fakeStressRoll(json) };
  registerCardActions();
});

// a stress card whose Take Stress marked these characters ([id, amount])
function takenCard(marks, extra = {}) {
  const stressRoll = new FakeStressRoll({
    character: marks[0]?.[0] ?? "vess",
    resistance: "blood",
    applied: marks.map(([id, amount]) => ({ id, amount })),
  });
  return makeMessage({ rolls: [stressRoll], stressRoll, ...extra });
}

// a fallout roll's JSON, as FalloutRoll.toJSON() writes it
const falloutJSON = (character) => ({ class: "FalloutRoll", formula: "1d12", options: { character, resistance: "blood" }, total: 3, evaluated: true });

describe("who may run a card's stress", () => {
  it("the GM, or the rolling character's own player", () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    expect(mayRunStress(gm, vess)).toBe(true);
    expect(mayRunStress(player, vess)).toBe(true);
    expect(mayRunStress(other, vess)).toBe(false);
    expect(mayRunStress(undefined, vess)).toBe(false);
  });
});

describe("Roll Stress on a Heart roll (attach-stress)", () => {
  const roll = { options: { character: "vess", helpers: [] }, result: "failure" };

  // 2026-10-21 (R7): who rolled, who helped, and the result are the card's
  it("keeps the card's roller, helpers, and result, whatever the roll JSON says", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const heart = { options: { character: "vess", helpers: ["kettle"] }, result: "success_at_a_cost" };
    const msg = makeMessage({ rolls: [heart] });
    const json = { class: "StressRoll", options: { character: "ash", helpers: ["rex"], result: "critical_failure", resistance: "mind", die_size: "d6" } };
    expect((await CARD_ACTIONS.attachStress({ messageId: "m1", roll: json }, "p1")).status).toBe("done");
    expect(msg.flags.heart["stress-roll"].options).toMatchObject({
      character: "vess",
      helpers: ["kettle"],
      result: "success_at_a_cost",
      resistance: "mind",
      die_size: "d6",
    });
  });

  it("refuses a result that costs no stress, and a roll that is not a StressRoll", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    makeMessage({ rolls: [{ options: { character: "vess" }, result: "success" }] });
    const json = { class: "StressRoll", options: { resistance: "blood" } };
    expect((await CARD_ACTIONS.attachStress({ messageId: "m1", roll: json }, "p1")).status).toBe("missing");
    makeMessage({ id: "m2", rolls: [roll] });
    expect((await CARD_ACTIONS.attachStress({ messageId: "m2", roll: { class: "FalloutRoll", options: {} } }, "p1")).status).toBe("missing");
  });

  // Luke, 2026-10-21: "there must be separate roll and mark steps"
  it("attaches once, however many clicks, and marks nothing", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    const msg = makeMessage({ rolls: [roll] });
    const json = { class: "StressRoll", options: { character: "vess", resistance: "blood" } };
    const [a, b] = await Promise.all([
      relay("attach-stress", { messageId: "m1", roll: json }),
      relay("attach-stress", { messageId: "m1", roll: json }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already", "done"]);
    expect(msg.update).toHaveBeenCalledTimes(1);
    expect(msg.flags.heart["show-stress-roll-button"]).toBe(false);
    // Take Stress waits on the card; no fallout before anything is marked
    expect(msg.flags.heart["show-take-stress-button"]).toBe(true);
    expect(msg.flags.heart["show-fallout-roll-button"]).toBe(false);
    expect(msg.flags.heart["stress-roll"].options.applied).toBeUndefined();
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("a roll that arrives already marked is attached unmarked", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const msg = makeMessage({ rolls: [roll] });
    const json = { class: "StressRoll", options: { character: "vess", resistance: "blood", applied: [{ id: "vess", amount: 9 }] } };
    await CARD_ACTIONS.attachStress({ messageId: "m1", roll: json }, "p1");
    expect(msg.flags.heart["stress-roll"].options.applied).toBeUndefined();
  });

  it("then its Take Stress marks it once, on the chained roll", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const msg = makeMessage({ rolls: [roll] });
    const json = { class: "StressRoll", options: { character: "vess", resistance: "blood" } };
    await CARD_ACTIONS.attachStress({ messageId: "m1", roll: json }, "p1");
    const [a, b] = await Promise.all([
      relay("take-stress", { messageId: "m1" }),
      relay("take-stress", { messageId: "m1" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already", "done"]);
    expect(msg.flags.heart["stress-roll"].options.applied).toEqual([{ id: "vess", amount: 3 }]);
    expect(msg.flags.heart["show-take-stress-button"]).toBe(false);
    expect(msg.flags.heart["show-fallout-roll-button"]).toBe(true);
    // the Heart roll itself is left alone
    expect(msg.rolls).toEqual([roll]);
    // another player can't take it
    makeMessage({ id: "m2", rolls: [roll] });
    await CARD_ACTIONS.attachStress({ messageId: "m2", roll: json }, "p1");
    expect((await CARD_ACTIONS.takeStressOnCard({ messageId: "m2" }, "p2")).status).toBe("not-allowed");
  });

  it("refuses another player", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    makeMessage({ rolls: [roll] });
    const answer = await CARD_ACTIONS.attachStress({ messageId: "m1", roll: {} }, "p2");
    expect(answer.status).toBe("not-allowed");
  });

  it("needs the GM when this client can't settle the card", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    makeMessage({ rolls: [roll], isOwner: false });
    const answer = await CARD_ACTIONS.attachStress({ messageId: "m1", roll: {} }, "p1");
    expect(answer.status).toBe("needs-gm");
  });

  it("a missing card", async () => {
    expect((await CARD_ACTIONS.attachStress({ messageId: "gone", roll: {} }, "p1")).status).toBe("missing");
  });
});

describe("Take Stress on a stress card (take-stress)", () => {
  it("applies once; a second click is told it was done", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const stressRoll = new FakeStressRoll({ character: "vess", resistance: "mind" });
    const msg = makeMessage({ rolls: [stressRoll], stressRoll });
    const first = await CARD_ACTIONS.takeStressOnCard({ messageId: "m1" }, "p1");
    const second = await CARD_ACTIONS.takeStressOnCard({ messageId: "m1" }, "p1");
    expect(first.status).toBe("done");
    expect(second.status).toBe("already");
    expect(stressRoll.takeStress).toHaveBeenCalledTimes(1);
    // the standalone card's roll itself is rewritten
    expect(msg.update.mock.calls[0][0].rolls).toHaveLength(1);
  });

  it("refuses another player, and a card with no resistance", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const stressRoll = new FakeStressRoll({ character: "vess", resistance: "mind" });
    makeMessage({ rolls: [stressRoll], stressRoll });
    expect((await CARD_ACTIONS.takeStressOnCard({ messageId: "m1" }, "p2")).status).toBe("not-allowed");
    const bare = new FakeStressRoll({ character: "vess", resistance: "" });
    makeMessage({ id: "m2", rolls: [bare], stressRoll: bare });
    expect((await CARD_ACTIONS.takeStressOnCard({ messageId: "m2" }, "p1")).status).toBe("missing");
  });

  // 2026-10-21 (R9): nothing could be marked, so the card is not settled
  it("Provisions with no party: 'no-party', and the card keeps its Take Stress", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const stressRoll = new FakeStressRoll({ character: "vess", resistance: "provisions" });
    const msg = makeMessage({ rolls: [stressRoll], stressRoll });
    expect((await CARD_ACTIONS.takeStressOnCard({ messageId: "m1" }, "p1")).status).toBe("no-party");
    expect(stressRoll.takeStress).not.toHaveBeenCalled();
    expect(msg.update).not.toHaveBeenCalled();
  });
});

// 2026-10-21 (R6): a fixed Provisions mark and a restock's payment
describe("a rolled stress marked at once (apply-stress)", () => {
  const json = (options) => ({ class: "StressRoll", options });

  it("marks the roll, and whatever arrived marked is not trusted", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const answer = await CARD_ACTIONS.applyStress({ roll: json({ character: "vess", resistance: "supplies", applied: [{ id: "vess", amount: 9 }] }) }, "p1");
    expect(answer).toEqual({ status: "done", applied: [{ id: "vess", amount: 3 }] });
  });

  it("refuses a player marking another player's character", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const answer = await CARD_ACTIONS.applyStress({ roll: json({ character: "vess", resistance: "blood" }) }, "p2");
    expect(answer.status).toBe("not-allowed");
  });

  it("drops helpers the asker may not run", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    makeCharacter("kettle", { owners: ["p2"] });
    const roll = fakeStressRoll(json({ character: "vess", resistance: "blood", helpers: ["kettle"] }));
    globalThis.Roll = { fromData: () => roll };
    await CARD_ACTIONS.applyStress({ roll: json({}) }, "p1");
    expect(roll.options.helpers).toEqual([]);
    expect(roll.takeStress).toHaveBeenCalledTimes(1);
  });

  it("refuses what is not a stress roll, or a track a stress roll never marks", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    expect((await CARD_ACTIONS.applyStress({ roll: { class: "FalloutRoll", options: { character: "vess", resistance: "blood" } } }, "p1")).status).toBe("missing");
    expect((await CARD_ACTIONS.applyStress({ roll: json({ character: "vess", resistance: "bond" }) }, "p1")).status).toBe("missing");
    expect((await CARD_ACTIONS.applyStress({ roll: undefined }, "p1")).status).toBe("missing");
  });

  it("Provisions: the party's owners only, and never with no party", async () => {
    expect((await CARD_ACTIONS.applyStress({ roll: json({ character: "party", resistance: "provisions" }) }, "p1")).status).toBe("no-party");
    const party = makeParty(0);
    party.testUserPermission = (user) => Boolean(user?.isGM);
    expect((await CARD_ACTIONS.applyStress({ roll: json({ character: "party", resistance: "provisions" }) }, "p1")).status).toBe("not-allowed");
    expect((await CARD_ACTIONS.applyStress({ roll: json({ character: "party", resistance: "provisions" }) }, "gm")).status).toBe("done");
  });
});

describe("fallout buttons", () => {
  it("each character's fallout is claimed once, and can be released", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    makeCharacter("kettle", { owners: ["p1"] });
    const msg = takenCard([["vess", 3], ["kettle", 2]]);
    const [a, b] = await Promise.all([
      relay("claim-fallout", { messageId: "m1", character: "vess" }),
      relay("claim-fallout", { messageId: "m1", character: "vess" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already", "done"]);
    expect(msg.flags.heart["fallout-done"]).toEqual(["vess"]);
    // the claimant is kept (2026-10-21, R8)
    expect(msg.flags.heart["fallout-claims"]).toEqual({ vess: "p1" });
    // another character on the same card is separate
    expect((await relay("claim-fallout", { messageId: "m1", character: "kettle" })).status).toBe("done");
    await relay("release-fallout", { messageId: "m1", character: "vess" });
    expect(msg.flags.heart["fallout-done"]).toEqual(["kettle"]);
    expect((await relay("claim-fallout", { messageId: "m1", character: "vess" })).status).toBe("done");
  });

  // 2026-10-21 (R8)
  it("only a character the card marked can be claimed", async () => {
    takenCard([["vess", 3], ["kettle", 0]]);
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "kettle" }, "p1")).status).toBe("missing");
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "ash" }, "p1")).status).toBe("missing");
    makeMessage({ id: "m2" });
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m2", character: "vess" }, "p1")).status).toBe("missing");
  });

  it("only the claimant or a GM can release a claimed button", async () => {
    makeCharacter("vess", { owners: ["p1", "p2"] });
    const msg = takenCard([["vess", 3]]);
    await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "vess" }, "p1");
    expect((await CARD_ACTIONS.releaseFallout({ messageId: "m1", character: "vess" }, "p2")).status).toBe("not-allowed");
    expect(msg.flags.heart["fallout-done"]).toEqual(["vess"]);
    expect((await CARD_ACTIONS.releaseFallout({ messageId: "m1", character: "vess" }, "gm")).status).toBe("done");
    expect(msg.flags.heart["fallout-done"]).toEqual([]);
  });

  it("the roller's fallout joins the card once", async () => {
    const msg = takenCard([["vess", 3]], { flags: { "fallout-done": ["vess"] } });
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: falloutJSON("vess") })).status).toBe("done");
    expect(msg.flags.heart["fallout-roll"].class).toBe("FalloutRoll");
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: falloutJSON("vess") })).status).toBe("already");
  });

  // 2026-10-21 (R8): any JSON was stored, and a bad one broke the card
  it("attaches only a FalloutRoll, for the card's roller, once claimed", async () => {
    const msg = takenCard([["vess", 3], ["kettle", 3]], { flags: { "fallout-done": ["vess", "kettle"] } });
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: { total: 7 } })).status).toBe("missing");
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: { ...falloutJSON("vess"), class: "Nope" } })).status).toBe("missing");
    // a helper's fallout posts its own card
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: falloutJSON("kettle") })).status).toBe("missing");
    expect(msg.update).not.toHaveBeenCalled();
    takenCard([["vess", 3]]);
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: falloutJSON("vess") })).status).toBe("missing");
  });

  it("any other one-use button (a restock's payer fallout)", async () => {
    makeCharacter("kettle", { owners: ["p1"] });
    const msg = makeMessage();
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "p1")).status).toBe("done");
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "p1")).status).toBe("already");
    expect(msg.flags.heart.claimed).toEqual({ "fallout-kettle": "p1" });
  });

  // 2026-10-21 (R13): released when no fallout card was posted
  it("a claimed one-use button is released by its claimant or a GM only", async () => {
    makeCharacter("kettle", { owners: ["p1", "p2"] });
    const msg = makeMessage();
    await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "p1");
    expect((await CARD_ACTIONS.releaseCardButton({ messageId: "m1", key: "fallout-kettle" }, "p2")).status).toBe("not-allowed");
    expect((await CARD_ACTIONS.releaseCardButton({ messageId: "m1", key: "fallout-kettle" }, "p1")).status).toBe("done");
    expect(msg.flags.heart.claimed["fallout-kettle"]).toBe(false);
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "p2")).status).toBe("done");
  });
});

// Luke, 2026-10-21 (R8): "Fallout can be rolled by GM and character's owners
// but GM always PICKS the resulting fallout if it happens"
describe("who may roll a fallout", () => {
  it("a stress card's fallout: the GM or the character's player", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const msg = takenCard([["vess", 3]]);
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "vess" }, "p2")).status).toBe("not-allowed");
    expect(msg.update).not.toHaveBeenCalled();
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "vess" }, "gm")).status).toBe("done");
  });

  it("the party's fallout: its owners", async () => {
    const party = makeParty(5);
    party.testUserPermission = (user) => Boolean(user?.isGM || user?.id === "p1");
    takenCard([["party", 2]]);
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "party" }, "p2")).status).toBe("not-allowed");
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "party" }, "p1")).status).toBe("done");
  });

  it("a restock's payer fallout: the GM or the payer's player; other buttons as before", async () => {
    makeCharacter("kettle", { owners: ["p1"] });
    makeMessage();
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "p2")).status).toBe("not-allowed");
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" }, "gm")).status).toBe("done");
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "something-else" }, "p2")).status).toBe("done");
  });

  it("a gone character's fallout is not anyone's but the GM's", async () => {
    takenCard([["ghost", 3]]);
    expect((await CARD_ACTIONS.claimFallout({ messageId: "m1", character: "ghost" }, "p1")).status).toBe("not-allowed");
  });

  it("the key names its character", () => {
    expect(falloutKeyCharacter("fallout-kettle")).toBe("kettle");
    expect(falloutKeyCharacter("claim-x")).toBeNull();
    expect(falloutKeyCharacter(undefined)).toBeNull();
  });
});

describe("Clear on a fallout card (clear-stress)", () => {
  // the card's own fallout roll says who and what (2026-10-21, R10)
  function falloutCard(result, options = {}, extra = {}) {
    const msg = makeMessage(extra);
    msg.falloutRoll = { result, options: { character: "vess", ...options } };
    return msg;
  }

  it("a Minor clears only its resistance, as one key, once", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    const msg = falloutCard("minor-fallout", { resistance: "mind" });
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("done");
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.mind.value": 0 });
    expect(vess.system.resistances.blood.value).toBe(2);
    expect(msg.flags.heart["show-clear-stress-button"]).toBe(false);
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("already");
    expect(vess.update).toHaveBeenCalledTimes(1);
  });

  it("a Minor whose card names no resistance takes the click's pick", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    falloutCard("minor-fallout");
    await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", scope: "echo" }, "p1");
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.echo.value": 0 });
  });

  it("ignores who and what the click claims: the card's roll decides", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    const ash = makeCharacter("ash", { owners: ["p1"] });
    const party = makeParty(9);
    falloutCard("minor-fallout", { resistance: "mind" });
    await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "ash", party: true, scope: "all" }, "p1");
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.mind.value": 0 });
    expect(ash.update).not.toHaveBeenCalled();
    expect(party.update).not.toHaveBeenCalled();
  });

  it("refuses a card with no fallout roll, or one that missed", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    makeMessage();
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("missing");
    falloutCard("no-fallout", { resistance: "mind" });
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("missing");
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("a Major clears every resistance, each as its own key", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    falloutCard("major-fallout", { resistance: "mind" });
    await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "all" }, "p1");
    expect(vess.update).toHaveBeenCalledWith({
      "system.resistances.blood.value": 0,
      "system.resistances.mind.value": 0,
      "system.resistances.echo.value": 0,
      "system.resistances.fortune.value": 0,
      "system.resistances.supplies.value": 0,
    });
  });

  it("refuses a player who doesn't own the character", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    falloutCard("minor-fallout", { resistance: "mind" });
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p2")).status).toBe("not-allowed");
    expect(vess.update).not.toHaveBeenCalled();
  });

  // Luke, 2026-10-21: a Minor clears the picked Fallout's resistance (HCB
  // p. 81), not the one that triggered the check
  it("the GM's pick is recorded on the card, GM only", async () => {
    const msg = makeMessage();
    const pick = { name: "Limping", severity: "minor", resistance: "blood" };
    expect((await CARD_ACTIONS.recordFalloutPick({ messageId: "m1", pick }, "p1")).status).toBe("not-allowed");
    expect((await CARD_ACTIONS.recordFalloutPick({ messageId: "m1", pick }, "gm")).status).toBe("done");
    expect(msg.flags.heart["fallout-pick"]).toEqual(pick);
  });

  it("a Minor clears the picked Fallout's resistance, whatever the click asked", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    falloutCard("minor-fallout", { resistance: "mind" }, { flags: { "fallout-pick": { name: "Limping", severity: "minor", resistance: "blood" } } });
    await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1");
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.blood.value": 0 });
  });

  it("a Minor combined into a picked Major clears every resistance", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    falloutCard("minor-fallout", { resistance: "mind" }, { flags: { "fallout-pick": { name: "Broken Arm", severity: "major", resistance: "blood" } } });
    await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1");
    expect(Object.keys(vess.update.mock.calls[0][0])).toHaveLength(5);
  });

  it("a Provisions fallout clears the party's track", async () => {
    const party = makeParty(14);
    falloutCard("minor-fallout", { character: "party", party: true, resistance: "provisions" });
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", party: true }, "p1")).status).toBe("done");
    expect(party.system.provisions.value).toBe(0);
  });
});

describe("Provisions changes", () => {
  it("provisionsChange keeps the track on 0 to max", () => {
    expect(provisionsChange(5, 20, { mode: "add", amount: 3 })).toBe(8);
    expect(provisionsChange(18, 20, { mode: "add", amount: 6 })).toBe(20);
    expect(provisionsChange(5, 20, { mode: "relieve", amount: 8 })).toBe(0);
    expect(provisionsChange(9, 20, { mode: "set", amount: 0 })).toBe(0);
    expect(provisionsChange(9, 20, { mode: "set", amount: 99 })).toBe(20);
    expect(provisionsChange(5, 20, { mode: "add", amount: -4 })).toBe(5);
    expect(() => provisionsChange(5, 20, { mode: "double" })).toThrow();
  });

  it("marks made at the same moment all count", async () => {
    const party = makeParty(0);
    const answers = await Promise.all([
      relay("provisions", { mode: "add", amount: 3 }),
      relay("provisions", { mode: "add", amount: 2 }),
      relay("provisions", { mode: "relieve", amount: 1 }),
    ]);
    expect(party.system.provisions.value).toBe(4);
    expect(answers.map((a) => [a.from, a.to])).toEqual([
      [0, 3],
      [3, 5],
      [5, 4],
    ]);
  });

  it("no party", async () => {
    expect((await relay("provisions", { mode: "add", amount: 1 })).status).toBe("no-party");
  });
});
