// Companions as helpers (Luke, 2026-10-21: the companion assist ruling,
// option A; src/rolls/heart-roll/companions.js and pool.js). A companion has
// no skills or domains, so it helps only through an ability that gives
// assistance; it then adds one D10, counts toward the cap, and takes the same
// stress (StressRoll.takeStress) with its own fallout check (FalloutRoll).
// The ability texts below are written for the tests, in the shapes the book
// uses, never the book's own words.

import { describe, it, expect, beforeEach } from "vitest";
import {
  sentences,
  assistanceTrigger,
  assistanceAbility,
  companionHelp,
  companionCandidates,
  isCompanion,
} from "../src/rolls/heart-roll/companions.js";
import { helperEligibility, buildPool, HELPER_LIMIT } from "../src/rolls/heart-roll/pool.js";
import StressRoll from "../src/rolls/stress-roll/roll.js";
import FalloutRoll from "../src/rolls/fallout-roll/roll.js";
import hirelingProxies from "../src/actors/hireling/proxy.js";
import characterProxies from "../src/actors/character/proxy.js";
import { makeActor, addActors, resetWorld, fakeActor, fakeUser, setUsers, queueDice } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];
const tracks = (values = {}) =>
  Object.fromEntries(RES.map((r) => [r, { value: 0, protection: 0, max: 10, ...(values[r] ?? {}) }]));

const ability = (name, description, extra = {}) => ({
  type: "ability",
  name,
  system: { description, active: true, ...extra },
});
const taken = (name) => ({ type: "fallout", name, system: { active: true, complete: false } });
const menu = (name) => ({ type: "fallout", name, system: { active: false, complete: false } });

// plain companions (no Foundry fakes) for the pure rules
function companion({ id = "hog", name = "Hog", items = [], notes = "" } = {}) {
  return { id, name, type: "hireling", system: { notes, resistances: tracks() }, items };
}

const SCOUT = "<p>Sniffs out the way ahead and gives assistance on any roll to scout a route.</p>";
const PICK =
  "<p><em>A loyal beast.</em> Once per session, pick one:</p><ul><li>When you roll Hunt, gain assistance on the roll.</li><li>Gain +1 Blood Protection.</li></ul>";
const RALLY =
  "<p>In the first round, it makes a racket. All other characters gain assistance for their first action, but enemies go for it.</p>";
const CARRY = "<p>Carries the party's gear without complaint.</p>";

describe("the trigger text", () => {
  it("splits HTML into sentences at block ends, list items, and full stops", () => {
    expect(sentences(PICK)).toEqual([
      "A loyal beast.",
      "Once per session, pick one:",
      "When you roll Hunt, gain assistance on the roll.",
      "Gain +1 Blood Protection.",
    ]);
  });

  it("keeps the sentences that give assistance", () => {
    expect(assistanceTrigger(SCOUT)).toBe("Sniffs out the way ahead and gives assistance on any roll to scout a route.");
    expect(assistanceTrigger(CARRY)).toBe("");
    expect(assistanceTrigger("")).toBe("");
  });

  it("keeps a once-per-session limit in front of the trigger", () => {
    expect(assistanceTrigger(PICK)).toBe("Once per session, pick one: When you roll Hunt, gain assistance on the roll.");
  });

  it("reads 'assistants' as no assistance", () => {
    expect(assistanceTrigger("<p>Brings assistants along.</p>")).toBe("");
  });
});

describe("assistanceAbility: where a companion's assistance comes from", () => {
  it("an ability item that gives assistance", () => {
    const c = companion({ items: [ability("Nose", SCOUT)] });
    expect(assistanceAbility(c)).toEqual({ name: "Nose", trigger: expect.stringContaining("gives assistance") });
  });

  it("skips an ability switched off, and abilities without assistance", () => {
    expect(assistanceAbility(companion({ items: [ability("Nose", SCOUT, { active: false })] }))).toBeNull();
    expect(assistanceAbility(companion({ items: [ability("Pack", CARRY)] }))).toBeNull();
  });

  it("the GM's notes, where an example's quirk is written", () => {
    const c = companion({ items: [ability("Pack", CARRY)], notes: "<p>(Gain assistance on Compel checks when he charms a crowd.)</p>" });
    expect(assistanceAbility(c)).toEqual({ name: "", trigger: "(Gain assistance on Compel checks when he charms a crowd.)" });
  });

  it("only for companions", () => {
    expect(assistanceAbility({ type: "character", items: [ability("Nose", SCOUT)] })).toBeNull();
    expect(isCompanion({ type: "hireling" })).toBe(true);
    expect(isCompanion(null)).toBe(false);
  });
});

describe("companionHelp: may it help", () => {
  it("yes, with its trigger, when an ability gives assistance", () => {
    expect(companionHelp(companion({ items: [ability("Nose", SCOUT)] }))).toMatchObject({
      ok: true,
      why: "",
      ability: "Nose",
      notes: [],
    });
  });

  it("no, without such an ability", () => {
    expect(companionHelp(companion({ items: [ability("Pack", CARRY)] }))).toMatchObject({ ok: false, why: "no-assistance" });
  });

  it("no while Furious (taken), but a Furious left in its book menu doesn't count", () => {
    const furious = companion({ items: [ability("Nose", SCOUT), taken("Furious")] });
    expect(companionHelp(furious)).toMatchObject({ ok: false, why: "furious" });
    const menuOnly = companion({ items: [ability("Nose", SCOUT), menu("Furious")] });
    expect(companionHelp(menuOnly).ok).toBe(true);
  });

  it("notes a Despondent or Overambitious companion, still allowed", () => {
    const c = companion({ items: [ability("Nose", SCOUT), taken("Despondent"), taken("Overambitious")] });
    expect(companionHelp(c)).toMatchObject({ ok: true, notes: ["despondent", "overambitious"] });
  });

  it("notes one that helps several at once", () => {
    expect(companionHelp(companion({ items: [ability("Racket", RALLY)] })).notes).toEqual(["many"]);
  });
});

describe("helperEligibility for a companion", () => {
  it("never depends on the skill or domain picked", () => {
    const c = companion({ items: [ability("Nose", SCOUT)] });
    for (const [skill, domain] of [[null, null], ["kill", null], [null, "haven"]]) {
      const e = helperEligibility(c, skill, domain);
      expect(e.ok).toBe(true);
      expect(e.reason).toContain("heart.roll-prompt.companion-assists{ability=Nose");
      expect(e.trigger).toContain("gives assistance");
    }
  });

  it("says why not, and carries its notes", () => {
    expect(helperEligibility(companion({ items: [ability("Pack", CARRY)] }), "kill").reason).toBe(
      "heart.roll-prompt.companion-no-assistance",
    );
    const e = helperEligibility(companion({ items: [ability("Nose", SCOUT), taken("Furious"), taken("Despondent")] }));
    expect(e).toMatchObject({ ok: false, reason: "heart.roll-prompt.helper-furious" });
    expect(e.notes).toEqual(["heart.roll-prompt.companion-despondent{name=Hog}"]);
  });

  it("characters are unchanged", () => {
    expect(helperEligibility(makeActor({ id: "ash", skills: ["kill"] }), "kill").ok).toBe(true);
    expect(helperEligibility(makeActor({ id: "ash" }), "kill").ok).toBe(false);
  });
});

describe("buildPool with a companion helper", () => {
  it("adds one D10 labelled with its name, and its notes", () => {
    const [vess] = addActors(
      makeActor({ skills: ["hunt"] }),
      companion({ id: "glee", name: "Glee", items: [ability("Racket", RALLY), taken("Despondent")] }),
    );
    const pool = buildPool(vess, { skill: "hunt", helpers: ["glee"] });
    expect(pool.dice.map((d) => d.kind)).toEqual(["base", "skill", "helper"]);
    expect(pool.dice[2]).toMatchObject({ label: "Glee", id: "glee" });
    expect(pool.notes).toEqual([
      "heart.roll-prompt.companion-despondent{name=Glee}",
      "heart.roll-prompt.companion-many{name=Glee}",
    ]);
  });

  it("a companion and a character fill the two helper places", () => {
    expect(HELPER_LIMIT).toBe(2);
    const [vess] = addActors(
      makeActor({ skills: ["hunt"] }),
      makeActor({ id: "ash", name: "Ash", skills: ["hunt"] }),
      companion({ id: "hog", items: [ability("Nose", SCOUT)] }),
    );
    const pool = buildPool(vess, { skill: "hunt", helpers: ["ash", "hog"] });
    expect(pool.dice.filter((d) => d.kind === "helper").map((d) => d.id)).toEqual(["ash", "hog"]);
  });
});

describe("companionCandidates: whom the prompt offers", () => {
  const bond = (target) => ({ type: "bond", system: { target } });
  const owned = (c, ids) => ({ ...c, testUserPermission: (u) => ids.includes(u.id) });

  it("the roller's companions first, then the party's, once each, alphabetical", () => {
    const hog = owned(companion({ id: "hog", name: "Hog" }), []);
    const glee = owned(companion({ id: "glee", name: "Glee" }), []);
    const imp = owned(companion({ id: "imp", name: "Imp" }), []);
    const byUuid = { hog, glee, imp };
    const vess = { id: "vess", type: "character", items: [bond("hog"), { type: "item" }] };
    const ash = { id: "ash", type: "character", items: [bond("imp"), bond("glee"), bond("hog"), bond("gone")] };
    const out = companionCandidates({ roller: vess, party: [vess, ash], targetOf: (b) => byUuid[b.system.target] ?? null });
    expect(out.map((c) => c.id)).toEqual(["hog", "glee", "imp"]);
  });

  it("no one outside the party: a companion bonded to no party member is never offered, even one the roller's player owns (Luke, 2026-10-22)", () => {
    const hog = owned(companion({ id: "hog", name: "Hog" }), []);
    const cat = owned(companion({ id: "cat", name: "Cat" }), ["p1"]);
    const ox = owned(companion({ id: "ox", name: "Ox" }), []);
    const byUuid = { hog, cat, ox };
    const vess = { id: "vess", type: "character", items: [bond("hog")] };
    const ash = { id: "ash", type: "character", items: [] };
    // (an outsider's companion: bonded to a character not in the party)
    const out = companionCandidates({ roller: vess, party: [vess, ash], targetOf: (b) => byUuid[b.system.target] ?? null });
    expect(out.map((c) => c.id)).toEqual(["hog"]);
  });

  it("nothing without a roller; never a character", () => {
    expect(companionCandidates({})).toEqual([]);
    const ash = { id: "ash", type: "character" };
    const vess = { id: "vess", type: "character", items: [{ type: "bond", system: { target: "ash" } }] };
    expect(companionCandidates({ roller: vess, targetOf: () => ash })).toEqual([]);
  });
});

describe("a companion helper's stress and fallout", () => {
  const gm = fakeUser({ id: "gm", isGM: true });

  beforeEach(() => {
    resetWorld();
    setUsers([gm], { self: gm });
    game.heart = { resistances: RES };
  });

  it("Take Stress marks the companion's own track, less its Protection", async () => {
    const vess = fakeActor({ id: "vess", name: "Vess", system: { resistances: tracks() }, proxy: characterProxies.character });
    const hog = fakeActor({
      id: "hog",
      name: "Hog",
      type: "hireling",
      system: { resistances: tracks({ blood: { value: 1, protection: 1 } }) },
      proxy: hirelingProxies.hireling,
    });
    const roll = StressRoll._build({ die_size: "d6", character: "vess", resistance: "blood", helpers: ["hog"] });
    queueDice(4);
    await roll.evaluate();
    const applied = await roll.takeStress();
    expect(applied).toEqual([
      { id: "vess", name: "Vess", amount: 4, protection: 0, marked: true },
      { id: "hog", name: "Hog", amount: 3, protection: 1, marked: true },
    ]);
    expect(vess.system.resistances.blood.value).toBe(4);
    expect(hog.system.resistances.blood.value).toBe(4);
    expect(roll.stressTargets().map((t) => t.id)).toEqual(["vess", "hog"]);
  });

  it("its fallout check reads its own total stress", async () => {
    fakeActor({
      id: "hog",
      type: "hireling",
      system: { resistances: tracks({ blood: { value: 4 }, mind: { value: 3 } }) },
      proxy: hirelingProxies.hireling,
    });
    const roll = FalloutRoll._build({ character: "hog", resistance: "blood" });
    expect(roll.options).toMatchObject({ character: "hog", resistance: "blood", totalStress: 7 });
    queueDice(5);
    await roll.evaluate();
    expect(roll.result).toBe("minor-fallout");
  });
});
