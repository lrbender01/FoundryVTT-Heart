/**
 * What chat-card buttons write, run by the GM's client (src/rolls/
 * card-actions.js, 2026-10-02): each applies once however many clicks or
 * players, refuses the wrong user, writes single keys, and Provisions marks
 * made at the same moment all count (src/actors/party/party.js
 * applyProvisions through the relay queue).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CARD_ACTIONS, registerCardActions, mayRunStress } from "../src/rolls/card-actions.js";
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
  game.heart = { rolls: { StressRoll: FakeStressRoll } };
  globalThis.Roll = { fromData: (json) => fakeStressRoll(json) };
  registerCardActions();
});

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
  const roll = { options: { character: "vess" } };

  it("marks and attaches once, however many clicks", async () => {
    makeCharacter("vess", { owners: ["p1"] });
    const msg = makeMessage({ rolls: [roll] });
    const json = { class: "StressRoll", options: { character: "vess", resistance: "blood" } };
    const [a, b] = await Promise.all([
      relay("attach-stress", { messageId: "m1", roll: json }),
      relay("attach-stress", { messageId: "m1", roll: json }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already", "done"]);
    expect(msg.update).toHaveBeenCalledTimes(1);
    expect(msg.flags.heart["show-stress-roll-button"]).toBe(false);
    expect(msg.flags.heart["show-fallout-roll-button"]).toBe(true);
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
});

describe("fallout buttons", () => {
  it("each character's fallout is claimed once, and can be released", async () => {
    const msg = makeMessage();
    const [a, b] = await Promise.all([
      relay("claim-fallout", { messageId: "m1", character: "vess" }),
      relay("claim-fallout", { messageId: "m1", character: "vess" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already", "done"]);
    expect(msg.flags.heart["fallout-done"]).toEqual(["vess"]);
    // another character on the same card is separate
    expect((await relay("claim-fallout", { messageId: "m1", character: "kettle" })).status).toBe("done");
    await relay("release-fallout", { messageId: "m1", character: "vess" });
    expect(msg.flags.heart["fallout-done"]).toEqual(["kettle"]);
    expect((await relay("claim-fallout", { messageId: "m1", character: "vess" })).status).toBe("done");
  });

  it("the roller's fallout joins the card once", async () => {
    makeMessage();
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: { total: 7 } })).status).toBe("done");
    expect((await CARD_ACTIONS.attachFallout({ messageId: "m1", roll: { total: 2 } })).status).toBe("already");
  });

  it("any other one-use button (a restock's payer fallout)", async () => {
    const msg = makeMessage();
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" })).status).toBe("done");
    expect((await CARD_ACTIONS.claimCardButton({ messageId: "m1", key: "fallout-kettle" })).status).toBe("already");
    expect(msg.flags.heart.claimed).toEqual({ "fallout-kettle": true });
  });
});

describe("Clear on a fallout card (clear-stress)", () => {
  it("a Minor clears only its resistance, as one key, once", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    const msg = makeMessage();
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("done");
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.mind.value": 0 });
    expect(vess.system.resistances.blood.value).toBe(2);
    expect(msg.flags.heart["show-clear-stress-button"]).toBe(false);
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p1")).status).toBe("already");
    expect(vess.update).toHaveBeenCalledTimes(1);
  });

  it("a Major clears every resistance, each as its own key", async () => {
    const vess = makeCharacter("vess", { owners: ["p1"] });
    makeMessage();
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
    makeMessage();
    expect((await CARD_ACTIONS.clearStressOnCard({ messageId: "m1", actorId: "vess", scope: "mind" }, "p2")).status).toBe("not-allowed");
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("a Provisions fallout clears the party's track", async () => {
    const party = makeParty(14);
    makeMessage();
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
