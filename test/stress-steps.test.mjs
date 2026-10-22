/**
 * Rolling and taking stress are separate steps, and a GM's roll request
 * carries the stakes (Luke, 2026-10-21): the pure rules (stress-roll/
 * rules.js: stressStatus, stressPreview, normalizeStakes, stakesText), what a
 * stress card shows before and after Take Stress, the stakes preselecting
 * Roll Stress's picker (still editable), and the Heart roll keeping and
 * showing them.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import StressRoll from "../src/rolls/stress-roll/roll.js";
import HeartRoll from "../src/rolls/heart-roll/roll.js";
import { stress_results } from "../src/rolls/heart-roll/results.js";
import {
  stressStatus,
  stressPreview,
  normalizeStakes,
  hasStakes,
  stakesText,
  trackMax,
  markedValue,
} from "../src/rolls/stress-roll/rules.js";
import characterProxies from "../src/actors/character/proxy.js";
import partyProxies from "../src/actors/party/proxy.js";
import { resetWorld, fakeActor, fakeUser, setUsers, queueDice, rendered, unescaped } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];
const TARGETS = [...RES, "provisions"];
const tracks = (values = {}) => Object.fromEntries(RES.map((r) => [r, { value: 0, protection: 0, ...(values[r] ?? {}) }]));
const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

function character(id, { owners = [], resistances = {}, skills = {} } = {}) {
  return fakeActor({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    owners,
    system: { resistances: tracks(resistances), skills, domains: {} },
    proxy: characterProxies.character,
  });
}

const p1 = fakeUser({ id: "p1" });
const gm = fakeUser({ id: "gm", isGM: true });

beforeEach(() => {
  resetWorld();
  setUsers([p1, gm], { self: gm });
  game.heart = {
    stress_results,
    resistances: RES,
    stress_targets: TARGETS,
    stress_dice: ["d4", "d6", "d8", "d10", "d12"],
    party_resistances: ["provisions"],
    rolls: { StressRoll, HeartRoll },
  };
});

describe("stressStatus", () => {
  it("pending once rolled with a resistance, taken once marked, nothing without one", () => {
    expect(stressStatus({ resistance: "blood" })).toBe("pending");
    expect(stressStatus({ resistance: "blood", applied: [] })).toBe("taken");
    expect(stressStatus({ resistance: "blood", applied: [{ id: "vess", amount: 2 }] })).toBe("taken");
    expect(stressStatus({ resistance: "" })).toBe("");
    expect(stressStatus()).toBe("");
  });
});

describe("stressPreview", () => {
  it("what each would take now, less their Protection, never below zero", () => {
    const out = stressPreview(4, [
      { id: "vess", name: "Vess", protection: 1 },
      { id: "kettle", name: "Kettle", protection: "6" },
    ]);
    expect(out).toEqual([
      { id: "vess", name: "Vess", protection: 1, amount: 3 },
      { id: "kettle", name: "Kettle", protection: 6, amount: 0 },
    ]);
  });

  it("ignoring Protection, the full roll", () => {
    expect(stressPreview(4, [{ id: "vess", protection: 3 }], true)[0]).toMatchObject({ amount: 4, protection: 0 });
  });
});

describe("normalizeStakes and hasStakes", () => {
  it("keeps only what is on the lists; blank means the roller chooses", () => {
    expect(normalizeStakes({ resistance: "blood", die_size: "D6", passive: "true" }, TARGETS)).toEqual({
      resistance: "blood",
      die_size: "d6",
      passive: true,
    });
    expect(normalizeStakes({ resistance: "", die_size: "", passive: "" }, TARGETS)).toEqual({});
    expect(normalizeStakes({ resistance: "luck", die_size: "d20", passive: "maybe" }, TARGETS)).toEqual({});
    expect(normalizeStakes({ passive: false }, TARGETS)).toEqual({ passive: false });
    expect(normalizeStakes({ passive: "false" }, TARGETS)).toEqual({ passive: false });
    expect(normalizeStakes(null, TARGETS)).toEqual({});
    expect(normalizeStakes({ resistance: "provisions" }, TARGETS)).toEqual({ resistance: "provisions" });
  });

  it("hasStakes: anything set, passive false included", () => {
    expect(hasStakes({})).toBe(false);
    expect(hasStakes(undefined)).toBe(false);
    expect(hasStakes({ passive: false })).toBe(true);
    expect(hasStakes({ die_size: "d8" })).toBe(true);
  });
});

describe("stakesText", () => {
  it("one plain line from whatever is set", () => {
    expect(stakesText({ resistance: "blood", die_size: "d6", passive: true }, loc)).toBe(
      "heart.card.stress-what{die=D6,resistance=heart.resistance.blood}, heart.card.stakes-passive",
    );
    expect(stakesText({ resistance: "mind" }, loc)).toBe("heart.resistance.mind");
    expect(stakesText({ die_size: "d8", passive: false }, loc)).toBe("D8, heart.card.stakes-active");
    expect(stakesText({}, loc)).toBe("");
  });
});

describe("a stress card before and after Take Stress", () => {
  async function card(options = {}, chatOptions = {}) {
    const roll = StressRoll._build({ character: "vess", resistance: "blood", die_size: "d6", helpers: ["kettle"], ...options });
    queueDice(4);
    await roll.evaluate();
    if (options.applied) roll.options.applied = options.applied;
    return rendered(await roll.render(chatOptions)).data;
  }

  beforeEach(() => {
    character("vess", { owners: ["p1"], resistances: { blood: { value: 6, protection: 1 } } });
    character("kettle", { resistances: { blood: { value: 3, protection: 5 } } });
  });

  it("rolled: says not taken yet, shows what each would take, marks nothing", async () => {
    const data = await card({}, { showTakeStressButton: true, showFalloutRollButton: true });
    expect(data.status).toBe("pending");
    expect(data.statusText).toBe("heart.card.stress-pending");
    expect(data.statusTip).toBe("heart.tip.card.stress-pending");
    expect(data.pending.map((a) => [a.id, a.amount, a.value])).toEqual([
      ["vess", 3, "heart.card.pending-amount{amount=3} (heart.card.protection{protection=1})"],
      ["kettle", 0, "heart.card.stopped{protection=5}"],
    ]);
    expect(data.applied).toEqual([]);
    // no fallout until it is taken
    expect(data.falloutFor).toEqual([]);
    expect(data.showTakeStressButton).toBe(true);
    expect(game.actors.get("vess").update).not.toHaveBeenCalled();
  });

  it("taken: says so, the lines are what was marked, no preview", async () => {
    const applied = [{ id: "vess", name: "Vess", amount: 3, protection: 1 }];
    const data = await card({ applied }, { showTakeStressButton: true, showFalloutRollButton: true });
    expect(data.status).toBe("taken");
    expect(data.statusText).toBe("heart.card.stress-taken");
    expect(data.pending).toEqual([]);
    expect(data.applied).toHaveLength(1);
    expect(data.showTakeStressButton).toBe(false);
    expect(data.falloutFor.map((a) => a.id)).toEqual(["vess"]);
  });

  it("a private card shows no step", async () => {
    const data = await card({}, { isPrivate: true });
    expect(data.status).toBe("");
    expect(data.pending).toEqual([]);
  });

  it("Provisions: one line for the party, less the quartermaster's Protection", async () => {
    const qm = character("qm", { resistances: { supplies: { protection: 2 } } });
    const p = fakeActor({
      id: "party",
      name: "The Party",
      type: "party",
      system: { provisions: { value: 5, max: 20 }, quartermaster: qm.id, members: [] },
      proxy: partyProxies.party,
    });
    game.heart.party = p;
    const data = await card({ resistance: "provisions", helpers: [] });
    expect(data.pending.map((a) => [a.id, a.amount, a.shared])).toEqual([["party", 2, true]]);
  });
});

describe("Roll Stress's picker starts from the GM's stakes", () => {
  let seen;
  beforeEach(() => {
    character("vess", { owners: ["p1"] });
    seen = null;
    game.heart.applications = {
      RequirementApplication: {
        build: vi.fn((args) => {
          seen = args;
          const r = args.requirements;
          args.callback({ resistance: r.resistance?.default, die_size: r.die_size?.default, passive: r.passive?.default ?? false, ignoreProtection: false });
        }),
      },
    };
  });

  it("the stakes are preselected, and still asked, so they can be changed", async () => {
    const roll = await StressRoll.build({
      character: "vess",
      result: "success_at_a_cost",
      helpers: [],
      stakes: { resistance: "echo", die_size: "d8", passive: true },
    });
    expect(seen.requirements.resistance.default).toBe("echo");
    expect(seen.requirements.die_size.default).toBe("d8");
    expect(seen.requirements.passive.default).toBe(true);
    // passive on a success at a cost: one size smaller
    expect(roll.options).toMatchObject({ resistance: "echo", die_size: "d6", stepped: true });
  });

  it("without stakes: the user's last resistance and D4, as before", async () => {
    game.user.flags = { heart: { lastStakes: { resistance: "mind" } } };
    await StressRoll.build({ character: "vess", result: "failure", helpers: [] });
    expect(seen.requirements.resistance.default).toBe("mind");
    expect(seen.requirements.die_size.default).toBe("d4");
    expect(seen.requirements.passive).toBeUndefined();
  });

  it("stakes off the lists are ignored", async () => {
    game.user.flags = { heart: { lastStakes: { resistance: "mind" } } };
    await StressRoll.build({ character: "vess", result: "failure", helpers: [], stakes: { resistance: "luck", die_size: "d20" } });
    expect(seen.requirements.resistance.default).toBe("mind");
    expect(seen.requirements.die_size.default).toBe("d4");
  });
});

describe("a Heart roll from a request keeps and shows the stakes", () => {
  beforeEach(() => character("vess", { owners: ["p1"], skills: { kill: { value: true } } }));

  it("kept in the options when set, and named on the card", async () => {
    const roll = HeartRoll._build({ character: "vess", skill: "kill", stakes: { resistance: "blood", die_size: "D6", passive: "" } });
    expect(roll.options.stakes).toEqual({ resistance: "blood", die_size: "d6" });
    queueDice(3, 4);
    await roll.evaluate();
    const data = rendered(await roll.render({ showStressRollButton: true })).data;
    // (the die is highlighted like every game term; the tags stripped here)
    const det = unescaped(data.det).replace(/<[^>]+>/g, "");
    expect(det).toContain("heart.card.stakes{stakes=heart.card.stress-what{die=D6,resistance=heart.resistance.blood}}");
  });

  it("nothing set: no stakes in the options", () => {
    expect(HeartRoll._build({ character: "vess", skill: "kill", stakes: {} }).options.stakes).toBeUndefined();
    expect(HeartRoll._build({ character: "vess", skill: "kill" }).options.stakes).toBeUndefined();
  });
});

// Luke, 2026-10-21 (R17): one cap rule for characters and companions
describe("trackMax and markedValue", () => {
  it("a track's own max, else the book's ten boxes", () => {
    expect(trackMax({ max: 12 })).toBe(12);
    expect(trackMax({ max: 0 })).toBe(10);
    expect(trackMax({})).toBe(10);
    expect(trackMax(undefined)).toBe(10);
  });

  it("marks up to the last box, never lowers a track already past it", () => {
    expect(markedValue(8, 5, 10)).toBe(10);
    expect(markedValue(2, 3, 10)).toBe(5);
    expect(markedValue("4", "2", 10)).toBe(6);
    expect(markedValue(12, 3, 10)).toBe(12);
    expect(markedValue(3, -2, 10)).toBe(3);
  });
});
