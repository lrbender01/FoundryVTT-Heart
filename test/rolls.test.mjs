/**
 * The roll classes with fake documents (2026-10-02): what StressRoll,
 * FalloutRoll, and HeartRoll build from their stakes, whom StressRoll's
 * takeStress marks (the roller and helpers less their own Protection, or the
 * party's Provisions once), and what each card shows to whom (render data,
 * read from a renderTemplate stub that answers its data as JSON).
 */

import { describe, it, expect, beforeEach } from "vitest";
import StressRoll from "../src/rolls/stress-roll/roll.js";
import FalloutRoll from "../src/rolls/fallout-roll/roll.js";
import HeartRoll from "../src/rolls/heart-roll/roll.js";
import { stress_results, heartResult } from "../src/rolls/heart-roll/results.js";
import characterProxies from "../src/actors/character/proxy.js";
import partyProxies from "../src/actors/party/proxy.js";
import { registerCardActions } from "../src/rolls/card-actions.js";
import { resetWorld, fakeActor, fakeUser, setUsers, queueDice, rendered } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];

function tracks(values = {}) {
  return Object.fromEntries(RES.map((r) => [r, { value: 0, protection: 0, ...(values[r] ?? {}) }]));
}

function character(id, { owners = [], resistances = {}, skills = {}, domains = {} } = {}) {
  return fakeActor({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    owners,
    system: { resistances: tracks(resistances), skills, domains },
    proxy: characterProxies.character,
  });
}

function party({ value = 0, max = 20, quartermaster = "", owners = [] } = {}) {
  const p = fakeActor({
    id: "party",
    name: "The Party",
    type: "party",
    owners,
    system: { provisions: { value, max }, quartermaster, members: [] },
    proxy: partyProxies.party,
  });
  game.heart.party = p;
  return p;
}

const p1 = fakeUser({ id: "p1" });
const p2 = fakeUser({ id: "p2" });
const gm = fakeUser({ id: "gm", isGM: true });

beforeEach(() => {
  resetWorld();
  setUsers([p1, p2, gm], { self: gm });
  game.heart = {
    stress_results,
    resistances: RES,
    party_resistances: ["provisions"],
    rolls: { StressRoll, FalloutRoll, HeartRoll },
  };
  CONFIG.Dice.rolls = [HeartRoll, StressRoll, FalloutRoll];
  registerCardActions();
});

describe("StressRoll._build: the stakes", () => {
  it("records the stakes in the options", () => {
    const roll = StressRoll._build({
      result: "failure",
      die_size: "D6",
      character: "vess",
      resistance: "blood",
      ignoreProtection: 1,
      helpers: ["kettle", "", null, "vess", "ash"],
    });
    expect(roll).toBeInstanceOf(StressRoll);
    expect(roll.formula).toBe("d6");
    expect(roll.options).toMatchObject({
      result: "failure",
      die_size: "d6",
      stepped: false,
      character: "vess",
      resistance: "blood",
      ignoreProtection: true,
    });
    // empty ids and the roller themself are not helpers
    expect(roll.options.helpers).toEqual(["kettle", "ash"]);
  });

  it("a D4 by default, one size smaller for a passive success at a cost", () => {
    expect(StressRoll._build({ result: "failure" }).options.die_size).toBe("d4");
    const passive = StressRoll._build({ result: "success_at_a_cost", die_size: "d8", passive: true });
    expect(passive.options).toMatchObject({ die_size: "d6", stepped: true });
    // passive only changes a success at a cost
    expect(StressRoll._build({ result: "failure", die_size: "d8", passive: true }).options.die_size).toBe("d8");
    expect(StressRoll._build({ helpers: null }).options.helpers).toEqual([]);
  });

  it("a critical failure doubles the roll", async () => {
    const roll = StressRoll._build({ result: "critical_failure", die_size: "d6" });
    expect(roll.formula).toBe("2 * {d6}");
    queueDice(5);
    await roll.evaluate();
    expect(roll.total).toBe(10);
  });
});

describe("StressRoll.takeStress: the roller and helpers", () => {
  async function rolled(total, options) {
    const roll = StressRoll._build({ die_size: "d8", ...options });
    queueDice(total);
    await roll.evaluate();
    return roll;
  }

  it("marks each character, less their own Protection", async () => {
    const vess = character("vess", { resistances: { blood: { value: 2, protection: 1 } } });
    const kettle = character("kettle", { resistances: { blood: { value: 0, protection: 0 } } });
    const roll = await rolled(4, { character: "vess", resistance: "blood", helpers: ["kettle"] });
    const applied = await roll.takeStress();
    expect(applied).toEqual([
      { id: "vess", name: "Vess", amount: 3, protection: 1, marked: true },
      { id: "kettle", name: "Kettle", amount: 4, protection: 0, marked: true },
    ]);
    expect(vess.update).toHaveBeenCalledWith({ "system.resistances.blood.value": 5 });
    expect(kettle.system.resistances.blood.value).toBe(4);
    // the card keeps who took what
    expect(roll.options.applied).toBe(applied);
  });

  it("ignoreProtection: the full roll for everyone", async () => {
    const vess = character("vess", { resistances: { mind: { value: 1, protection: 3 } } });
    const roll = await rolled(4, { character: "vess", resistance: "mind", ignoreProtection: true });
    const [a] = await roll.takeStress();
    expect(a).toMatchObject({ amount: 4, protection: 0 });
    expect(vess.system.resistances.mind.value).toBe(5);
  });

  it("Protection that stops all of it marks nothing", async () => {
    const vess = character("vess", { resistances: { echo: { value: 3, protection: 5 } } });
    const roll = await rolled(4, { character: "vess", resistance: "echo" });
    const [a] = await roll.takeStress();
    expect(a).toMatchObject({ amount: 0, protection: 5, marked: false });
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("skips a missing helper and an actor without that track", async () => {
    character("vess");
    fakeActor({ id: "rat", type: "adversary", system: {} });
    const roll = await rolled(2, { character: "vess", resistance: "fortune", helpers: ["gone", "rat"] });
    const applied = await roll.takeStress();
    expect(applied.map((a) => a.id)).toEqual(["vess"]);
  });

  it("no resistance: nothing to take", async () => {
    character("vess");
    const roll = await rolled(3, { character: "vess" });
    expect(await roll.takeStress()).toEqual([]);
  });

  it("without the GM, a player's client marks only the characters it owns", async () => {
    setUsers([p1, p2, gm], { self: p1 });
    const vess = character("vess", { owners: ["p1"] });
    const kettle = character("kettle", { owners: ["p2"] });
    const roll = await rolled(3, { character: "vess", resistance: "supplies", helpers: ["kettle"] });
    const applied = await roll.takeStress();
    expect(vess.system.resistances.supplies.value).toBe(3);
    expect(kettle.update).not.toHaveBeenCalled();
    // still listed, as not marked, so the card says so
    expect(applied[1]).toMatchObject({ id: "kettle", amount: 3, marked: false });
  });
});

describe("StressRoll.takeStress: Provisions", () => {
  it("lands once on the party, less the quartermaster's Supplies Protection", async () => {
    const qm = character("qm", { resistances: { supplies: { value: 0, protection: 2 } } });
    character("vess");
    character("kettle");
    const p = party({ value: 5, quartermaster: qm.id });
    const roll = StressRoll._build({ die_size: "d6", character: "vess", resistance: "provisions", helpers: ["kettle", "qm"] });
    queueDice(6);
    await roll.evaluate();
    const applied = await roll.takeStress();
    expect(applied).toEqual([{ id: "party", name: "The Party", amount: 4, protection: 2, marked: true, shared: true }]);
    expect(p.system.provisions.value).toBe(9);
    expect(p.update).toHaveBeenCalledTimes(1);
    // nobody's own Supplies moved
    expect(qm.update).not.toHaveBeenCalled();
  });

  it("ignoreProtection skips the quartermaster's Protection", async () => {
    const qm = character("qm", { resistances: { supplies: { protection: 2 } } });
    const p = party({ value: 0, quartermaster: qm.id });
    const roll = StressRoll._build({ die_size: "d6", character: "qm", resistance: "provisions", ignoreProtection: true });
    queueDice(3);
    await roll.evaluate();
    await roll.takeStress();
    expect(p.system.provisions.value).toBe(3);
  });

  it("no party: a warning and nothing applied", async () => {
    character("vess");
    const roll = StressRoll._build({ character: "vess", resistance: "provisions" });
    await roll.evaluate();
    expect(await roll.takeStress()).toEqual([]);
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.party.no-party");
  });

  it("a client that does not own the party marks nothing", async () => {
    setUsers([p1, gm], { self: p1 });
    const p = party({ value: 2 });
    const roll = StressRoll._build({ character: "party", resistance: "provisions" });
    queueDice(4);
    await roll.evaluate();
    const [a] = await roll.takeStress();
    expect(a).toMatchObject({ amount: 4, marked: false });
    expect(p.update).not.toHaveBeenCalled();
  });
});

describe("StressRoll.render: what the card shows to whom", () => {
  async function card(options = {}, chatOptions = {}) {
    const roll = StressRoll._build({ character: "vess", resistance: "blood", die_size: "d6", ...options });
    queueDice(4);
    await roll.evaluate();
    if (options.applied) roll.options.applied = options.applied;
    return rendered(await roll.render(chatOptions)).data;
  }

  beforeEach(() => {
    character("vess", { owners: ["p1"], resistances: { blood: { value: 6 } } });
    character("kettle", { owners: ["p2"], resistances: { blood: { value: 3 } } });
  });

  it("Take Stress: only the GM and the roller's owner see it, and only before it is taken", async () => {
    setUsers([p1, p2, gm], { self: gm });
    expect((await card({}, { showTakeStressButton: true })).showTakeStressButton).toBe(true);
    setUsers([p1, p2, gm], { self: p1 });
    expect((await card({}, { showTakeStressButton: true })).showTakeStressButton).toBe(true);
    setUsers([p1, p2, gm], { self: p2 });
    expect((await card({}, { showTakeStressButton: true })).showTakeStressButton).toBe(false);
    setUsers([p1, p2, gm], { self: p1 });
    expect((await card({}, {})).showTakeStressButton).toBe(false);
    const applied = [{ id: "vess", name: "Vess", amount: 4, protection: 0 }];
    expect((await card({ applied }, { showTakeStressButton: true })).showTakeStressButton).toBe(false);
  });

  it("a private card hides the values", async () => {
    const applied = [{ id: "vess", name: "Vess", amount: 4, protection: 0 }];
    const data = await card({ applied }, { isPrivate: true, showTakeStressButton: true, showFalloutRollButton: true });
    expect(data).toMatchObject({
      what: "???",
      out: "?",
      formula: "???",
      dice: "",
      applied: [],
      falloutFor: [],
      showTakeStressButton: false,
      total: "?",
      result: "?",
      resistance: "",
    });
  });

  it("one line per character: the amount, Protection, and the track", async () => {
    const applied = [
      { id: "vess", name: "Vess", amount: 3, protection: 1 },
      { id: "kettle", name: "Kettle", amount: 0, protection: 5 },
    ];
    const data = await card({ applied });
    expect(data.applied[0].value).toBe("+3 (heart.card.protection{protection=1}) · heart.card.track{value=6,max=10}");
    expect(data.applied[1].value).toBe("heart.card.stopped{protection=5}");
    expect(data.total).toBe(4);
  });

  it("falloutFor: each character who took stress and has not rolled yet", async () => {
    const applied = [
      { id: "vess", name: "Vess", amount: 3, protection: 0 },
      { id: "kettle", name: "Kettle", amount: 2, protection: 0 },
      { id: "ash", name: "Ash", amount: 0, protection: 4 },
    ];
    const both = await card({ applied }, { showFalloutRollButton: true });
    expect(both.falloutFor.map((a) => [a.id, a.button])).toEqual([
      ["vess", "heart.card.fallout-for{name=Vess}"],
      ["kettle", "heart.card.fallout-for{name=Kettle}"],
    ]);
    const one = await card({ applied }, { showFalloutRollButton: true, falloutDone: ["vess"] });
    expect(one.falloutFor.map((a) => [a.id, a.button, a.tip])).toEqual([
      ["kettle", "heart.rolls.fallout-roll.action", "heart.term.fallout"],
    ]);
    expect((await card({ applied }, { showFalloutRollButton: false })).falloutFor).toEqual([]);
  });

  it("the party's line and fallout button, and the dire note past twelve", async () => {
    party({ value: 14 });
    const applied = [{ id: "party", name: "The Party", amount: 3, protection: 1, shared: true }];
    const data = await card({ resistance: "provisions", applied }, { showFalloutRollButton: true });
    expect(data.applied[0].value).toBe("+3 (heart.card.qm-protection{protection=1}) · heart.card.track{value=14,max=20}");
    expect(data.falloutFor[0]).toMatchObject({ button: "heart.card.party-fallout", tip: "heart.tip.card.party-fallout" });
    expect(data.det).toBe("heart.party-sheet.status-dire{past=12}");
  });
});

describe("FalloutRoll._build: a character or the party", () => {
  it("a character: d12 against their total stress", () => {
    character("vess", { resistances: { blood: { value: 3 }, mind: { value: "2" } } });
    const roll = FalloutRoll._build({ character: "vess", resistance: "mind" });
    expect(roll.formula).toBe("1d12");
    expect(roll.options).toMatchObject({ character: "vess", resistance: "mind", totalStress: 5 });
    expect(roll.options.party).toBeUndefined();
  });

  it("Provisions: against the party's track, whoever triggered it", () => {
    character("vess");
    party({ value: 9 });
    const roll = FalloutRoll._build({ character: "vess", resistance: "provisions" });
    expect(roll.options).toMatchObject({ party: true, character: "party", resistance: "provisions", totalStress: 9, max: 20 });
  });

  it("the party actor itself", () => {
    const p = party({ value: 4, max: 12 });
    game.heart.party = undefined;
    const roll = FalloutRoll._build({ character: p.id });
    expect(roll.options).toMatchObject({ party: true, character: "party", totalStress: 4, max: 12 });
  });

  it("result reads the right thresholds", async () => {
    character("vess", { resistances: { blood: { value: 8 } } });
    const roll = FalloutRoll._build({ character: "vess" });
    queueDice(7);
    await roll.evaluate();
    expect(roll.result).toBe("major-fallout");

    party({ value: 14 });
    const partyRoll = FalloutRoll._build({ resistance: "provisions" });
    queueDice(7);
    await partyRoll.evaluate();
    // 13+ on Provisions: a Major is Critical
    expect(partyRoll.result).toBe("critical-fallout");
  });

  it("notRolled: only a full Provisions track", () => {
    character("vess", { resistances: { blood: { value: 10 }, mind: { value: 10 } } });
    expect(FalloutRoll._build({ character: "vess" }).notRolled).toBe(false);
    party({ value: 20 });
    expect(FalloutRoll._build({ resistance: "provisions" }).notRolled).toBe(true);
    game.heart.party.system.provisions.value = 19;
    expect(FalloutRoll._build({ resistance: "provisions" }).notRolled).toBe(false);
  });
});

describe("FalloutRoll.render", () => {
  it("a Minor offers the GM's Fallout picker and says what Clear clears", async () => {
    character("vess", { resistances: { blood: { value: 5 } } });
    const roll = FalloutRoll._build({ character: "vess", resistance: "blood" });
    queueDice(2);
    const data = rendered(await roll.render({ showClearStressButton: true })).data;
    expect(data).toMatchObject({
      result: "minor-fallout",
      severity: "minor",
      bad: true,
      crit: false,
      showClearStressButton: true,
      clearLabel: "heart.rolls.fallout-roll.confirm-clear-one{resistance=heart.resistance.blood}",
      clearTip: "heart.term.minor-fallout",
      party: false,
      notRolled: false,
    });
    expect(data.pickButton).toContain('data-target="Actor.vess"');
    expect(data.pickButton).toContain('data-severity="minor"');
  });

  it("no fallout: no picker", async () => {
    character("vess", { resistances: { blood: { value: 2 } } });
    const roll = FalloutRoll._build({ character: "vess", resistance: "blood" });
    queueDice(9);
    const data = rendered(await roll.render()).data;
    expect(data).toMatchObject({ result: "no-fallout", pickButton: "", bad: false, showClearStressButton: false });
  });

  it("a full Provisions track: no die, Critical, the party's Clear", async () => {
    party({ value: 20 });
    const roll = FalloutRoll._build({ resistance: "provisions" });
    const data = rendered(await roll.render()).data;
    expect(data).toMatchObject({
      notRolled: true,
      dice: "",
      result: "critical-fallout",
      crit: true,
      party: true,
      clearLabel: "heart.party.clear",
      clearTip: "heart.tip.card.clear-provisions",
    });
    expect(data.what).toBe("heart.card.fallout-full{value=20,max=20}");
  });

  it("a private card hides the outcome and the picker", async () => {
    character("vess", { resistances: { blood: { value: 9 } } });
    const roll = FalloutRoll._build({ character: "vess" });
    queueDice(8);
    const data = rendered(await roll.render({ isPrivate: true, showClearStressButton: true })).data;
    expect(data).toMatchObject({ what: "???", result: "?", total: "?", pickButton: "", bad: false, showClearStressButton: false, severity: "" });
  });
});

describe("HeartRoll._build: the pool", () => {
  beforeEach(() => {
    character("vess", { skills: { kill: { value: true } }, domains: { occult: { value: true } } });
    character("kettle", { skills: { kill: { value: true } } });
  });

  it("dice, helpers, and the cut go in the options", () => {
    const roll = HeartRoll._build({ character: "vess", difficulty: "risky", skill: "kill", domain: "occult", mastery: 1, helpers: ["kettle", "gone"] });
    expect(roll.options).toMatchObject({
      character: "vess",
      difficulty: "risky",
      skill: "kill",
      domain: "occult",
      mastery: true,
      helpers: ["kettle"],
      cut: 1,
      result_set: "normal",
      notes: [],
    });
    expect(roll.options.pool).toEqual(["heart.rolls.roll.base", "heart.domain.occult", "heart.skill.kill", "heart.mastery.short", "Kettle"]);
    expect(roll.formula).toBe(
      "{1d10[heart.rolls.roll.base], 1d10[heart.domain.occult], 1d10[heart.skill.kill], 1d10[heart.mastery.short], 1d10[Kettle]}dh1kh",
    );
  });

  it("a missing skill is a note, not a die; defaults are Standard and no helpers", () => {
    const roll = HeartRoll._build({ character: "kettle", skill: "kill", domain: "occult", helpers: null });
    expect(roll.options.difficulty).toBe("standard");
    expect(roll.options.cut).toBe(0);
    expect(roll.options.pool).toHaveLength(2);
    expect(roll.options.notes).toEqual(["heart.roll-prompt.lacks{name=Kettle,what=heart.domain.occult}"]);
    expect(roll.options.helpers).toEqual([]);
  });

  it("every die removed: one fresh die on the Difficult table; Impossible does not roll", () => {
    const fresh = HeartRoll._build({ character: "vess", difficulty: "dangerous", skill: "kill" });
    expect(fresh.options.result_set).toBe("difficult");
    expect(fresh.formula).toBe("1d10[heart.rolls.roll.fresh-flavor]");
    const impossible = HeartRoll._build({ character: "vess", difficulty: "impossible", skill: "kill" });
    expect(impossible.options.result_set).toBe("impossible");
    expect(impossible.formula).toBe("0");
  });

  it("result: the kept die on the right table", async () => {
    const roll = HeartRoll._build({ character: "vess", difficulty: "risky", skill: "kill" });
    queueDice(9, 6);
    await roll.evaluate();
    expect(roll.total).toBe(6);
    expect(roll.result).toBe("success_at_a_cost");
    expect(roll.result).toBe(heartResult(6, "normal", "risky"));
    const impossible = HeartRoll._build({ character: "vess", difficulty: "impossible" });
    await impossible.evaluate();
    expect(impossible.result).toBe("failure");
  });
});

describe("HeartRoll.render", () => {
  beforeEach(() => {
    character("vess", { owners: ["p1"], skills: { kill: { value: true } } });
    character("kettle", { owners: ["p2"], skills: { kill: { value: true } } });
  });

  async function card(dice, chatOptions = { showStressRollButton: true }) {
    const roll = HeartRoll._build({ character: "vess", skill: "kill", helpers: ["kettle"], difficulty: "risky" });
    queueDice(...dice);
    await roll.evaluate();
    return { roll, data: rendered(await roll.render(chatOptions)).data };
  }

  it("Roll Stress: only on a result that costs stress, and only for the GM or the roller's owner", async () => {
    setUsers([p1, p2, gm], { self: p1 });
    expect((await card([2, 4, 3])).data.showStressRollButton).toBe(true);
    setUsers([p1, p2, gm], { self: gm });
    expect((await card([2, 4, 3])).data.showStressRollButton).toBe(true);
    // the helper's player does not see it
    setUsers([p1, p2, gm], { self: p2 });
    expect((await card([2, 4, 3])).data.showStressRollButton).toBe(false);
    // a success offers no stress
    setUsers([p1, p2, gm], { self: p1 });
    expect((await card([10, 9, 8])).data.showStressRollButton).toBe(false);
    expect((await card([2, 4, 3], {})).data.showStressRollButton).toBe(false);
  });

  it("names the helpers and marks the kept and removed dice", async () => {
    const { roll, data } = await card([9, 6, 3]);
    expect(data.result).toBe("success_at_a_cost");
    expect(data.outcomeClass).toBe("bad");
    expect(data.det).toContain("heart.card.helped-one");
    expect(data.det).toContain("Kettle");
    const faces = roll.faces();
    expect(faces.map((f) => [f.result, f.kept, f.removed])).toEqual([
      [9, false, true],
      [6, true, false],
      [3, false, false],
    ]);
  });

  it("a private card hides everything", async () => {
    const { data } = await card([2, 4, 3], { isPrivate: true, showStressRollButton: true });
    expect(data).toMatchObject({ what: "???", det: "", dice: "", total: "?", result: "?", showStressRollButton: false, outcomeClass: "", glyph: "" });
  });
});
