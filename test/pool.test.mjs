// The Heart action-roll pool (src/rolls/heart-roll/pool.js; HCB p.76-77,
// Appendix A fallouts, table rulings): what dice a roll contains, the
// difficulty cut, the fresh die, helpers, and the fallout flags
// (2026-09-30, Luke).

import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_CUT,
  HELPER_LIMIT,
  activeFallouts,
  falloutFlags,
  difficultyHints,
  knackFor,
  helperEligibility,
  buildPool,
  poolFormula,
} from "../src/rolls/heart-roll/pool.js";
import { makeActor, makeFallout, addActors } from "./helpers.mjs";

const kinds = (pool) => pool.dice.map((d) => d.kind);

describe("difficulty cuts", () => {
  it("Standard removes none, Risky one, Dangerous two, Impossible all", () => {
    expect(DIFFICULTY_CUT).toEqual({ standard: 0, risky: 1, dangerous: 2, impossible: Infinity });
  });

  it("allows up to two helpers by default", () => {
    expect(HELPER_LIMIT).toBe(2);
  });
});

describe("buildPool: the dice", () => {
  const vess = () => makeActor({ skills: ["kill"], domains: ["occult"] });

  it("is one base die with no skill or domain", () => {
    const pool = buildPool(vess());
    expect(kinds(pool)).toEqual(["base"]);
    expect(pool.dice[0].label).toBe("heart.rolls.roll.base");
    expect(pool).toMatchObject({ cut: 0, impossible: false, fresh: false, count: 1, kept: 1, notes: [] });
  });

  it("adds a die for a skill and a domain the character has (domain first)", () => {
    const pool = buildPool(vess(), { skill: "kill", domain: "occult" });
    expect(kinds(pool)).toEqual(["base", "domain", "skill"]);
    expect(pool.dice[1]).toMatchObject({ label: "heart.domain.occult", slug: "occult" });
    expect(pool.dice[2]).toMatchObject({ label: "heart.skill.kill", slug: "kill" });
  });

  it("adds one mastery die", () => {
    const pool = buildPool(vess(), { skill: "kill", mastery: true });
    expect(kinds(pool)).toEqual(["base", "skill", "mastery"]);
    expect(pool.dice[2].label).toBe("heart.mastery.short");
  });

  it("adds no die for a skill or domain the character lacks, with a note naming it", () => {
    const pool = buildPool(vess(), { skill: "sneak", domain: "haven" });
    expect(kinds(pool)).toEqual(["base"]);
    expect(pool.notes).toEqual([
      "heart.roll-prompt.lacks{name=Vess,what=heart.domain.haven}",
      "heart.roll-prompt.lacks{name=Vess,what=heart.skill.sneak}",
    ]);
  });

  it("treats a skill with value false as lacking it", () => {
    const actor = makeActor({ skills: { kill: { value: false } } });
    expect(kinds(buildPool(actor, { skill: "kill" }))).toEqual(["base"]);
  });

  it("adds a die per helper, labelled with the helper's name", () => {
    const [, ash, kettle] = addActors(
      vess(),
      makeActor({ id: "ash", name: "Ash", skills: ["kill"] }),
      makeActor({ id: "kettle", name: "Kettle", domains: ["occult"] }),
    );
    const pool = buildPool(game.actors.get("vess"), { skill: "kill", helpers: [ash.id, kettle.id] });
    expect(kinds(pool)).toEqual(["base", "skill", "helper", "helper"]);
    expect(pool.dice.slice(2).map((d) => [d.label, d.id])).toEqual([
      ["Ash", "ash"],
      ["Kettle", "kettle"],
    ]);
  });

  it("skips a helper who is the roller or no longer exists", () => {
    addActors(vess());
    const pool = buildPool(game.actors.get("vess"), { skill: "kill", helpers: ["vess", "gone"] });
    expect(kinds(pool)).toEqual(["base", "skill"]);
  });
});

describe("buildPool: difficulty", () => {
  const full = () => makeActor({ skills: ["kill"], domains: ["occult"] });
  const opts = { skill: "kill", domain: "occult" };

  it.each([
    ["standard", 0, 3],
    ["risky", 1, 2],
    ["dangerous", 2, 1],
  ])("%s on three dice cuts %i and keeps the best of %i", (difficulty, cut, kept) => {
    const pool = buildPool(full(), { ...opts, difficulty });
    expect(pool).toMatchObject({ cut, kept, count: 3, fresh: false, impossible: false });
  });

  it("Impossible rolls nothing: cut 0, kept 0, not fresh", () => {
    const pool = buildPool(full(), { ...opts, difficulty: "impossible" });
    expect(pool).toMatchObject({ impossible: true, fresh: false, cut: 0, kept: 0, count: 3 });
    expect(poolFormula(pool)).toBe("0");
  });

  it("switches to one fresh die when Risky would remove the only die", () => {
    const pool = buildPool(full(), { difficulty: "risky" });
    expect(pool).toMatchObject({ fresh: true, kept: 0, count: 1 });
  });

  it("switches to one fresh die when Dangerous would remove both dice", () => {
    const pool = buildPool(full(), { skill: "kill", difficulty: "dangerous" });
    expect(pool).toMatchObject({ fresh: true, kept: 0, count: 2 });
  });

  it("does not switch when one die survives the cut", () => {
    expect(buildPool(full(), { skill: "kill", difficulty: "risky" })).toMatchObject({ fresh: false, kept: 1 });
  });

  it("treats an unknown difficulty as Standard", () => {
    expect(buildPool(full(), { ...opts, difficulty: "weird" })).toMatchObject({ cut: 0, kept: 3 });
  });
});

describe("poolFormula", () => {
  const actor = () => makeActor({ skills: ["kill"] });

  it("Standard keeps the highest", () => {
    expect(poolFormula(buildPool(actor(), { skill: "kill" }))).toBe(
      "{1d10[heart.rolls.roll.base], 1d10[heart.skill.kill]}kh",
    );
  });

  it("Risky drops the highest, then keeps the highest", () => {
    expect(poolFormula(buildPool(actor(), { skill: "kill", difficulty: "risky" }))).toBe(
      "{1d10[heart.rolls.roll.base], 1d10[heart.skill.kill]}dh1kh",
    );
  });

  it("a fresh die is one d10", () => {
    expect(poolFormula(buildPool(actor(), { difficulty: "risky" }))).toBe(
      "1d10[heart.rolls.roll.fresh-flavor]",
    );
  });

  it("strips formula-breaking characters from labels", () => {
    addActors(actor(), makeActor({ id: "odd", name: "Ash [the] @Elder", skills: ["kill"] }));
    const pool = buildPool(game.actors.get("vess"), { skill: "kill", helpers: ["odd"] });
    expect(poolFormula(pool)).toContain("1d10[Ash the Elder]");
  });
});

describe("fallout flags: Tired, Clouded, Furious", () => {
  it("Tired: skills add no die, with a note", () => {
    const actor = makeActor({ skills: ["kill"], domains: ["occult"], fallouts: ["Tired"] });
    const pool = buildPool(actor, { skill: "kill", domain: "occult" });
    expect(kinds(pool)).toEqual(["base", "domain"]);
    expect(pool.notes).toEqual(["heart.roll-prompt.tired{what=heart.skill.kill}"]);
  });

  it("Clouded: domains add no die, with a note", () => {
    const actor = makeActor({ skills: ["kill"], domains: ["occult"], fallouts: ["Clouded"] });
    const pool = buildPool(actor, { skill: "kill", domain: "occult" });
    expect(kinds(pool)).toEqual(["base", "skill"]);
    expect(pool.notes).toEqual(["heart.roll-prompt.clouded{what=heart.domain.occult}"]);
  });

  it("recognises system lang-key names as well as plain ones", () => {
    const actor = makeActor({ fallouts: ["fallout.minor.mind.tired.name", "Clouded"] });
    expect(falloutFlags(actor)).toEqual({ tired: true, clouded: true, furious: false });
  });

  it("matches whole words only", () => {
    expect(falloutFlags(makeActor({ fallouts: ["Retired Soldier"] })).tired).toBe(false);
  });

  it("ignores a completed fallout", () => {
    const actor = makeActor({ skills: ["kill"], fallouts: [{ name: "Tired", complete: true }] });
    expect(kinds(buildPool(actor, { skill: "kill" }))).toEqual(["base", "skill"]);
  });

  it("a party-wide fallout befalls every character, but not other actors", () => {
    game.heart.party = { items: [makeFallout("Tired"), makeFallout({ name: "Empty", complete: true })] };
    const character = makeActor({ fallouts: ["Limping"] });
    expect(activeFallouts(character).map((f) => f.name)).toEqual(["Limping", "Tired"]);
    expect(activeFallouts(makeActor({ type: "adversary" }))).toEqual([]);
  });
});

describe("helperEligibility", () => {
  const helper = (more = {}) => makeActor({ id: "ash", name: "Ash", skills: ["kill"], domains: ["occult"], ...more });

  it("needs a helper", () => {
    expect(helperEligibility(null, "kill", null)).toEqual({ ok: false, reason: "" });
  });

  it("a Furious character cannot help", () => {
    expect(helperEligibility(helper({ fallouts: ["Furious"] }), "kill", null)).toEqual({
      ok: false,
      reason: "heart.roll-prompt.helper-furious",
    });
  });

  it("needs a skill or domain chosen first", () => {
    expect(helperEligibility(helper(), null, null).reason).toBe("heart.roll-prompt.helper-pick-first");
  });

  it("must have the chosen skill or domain", () => {
    expect(helperEligibility(helper(), "sneak", "haven")).toEqual({
      ok: false,
      reason: "heart.roll-prompt.helper-lacks",
    });
  });

  it("is eligible with either one, and says which", () => {
    expect(helperEligibility(helper(), "sneak", "occult")).toEqual({
      ok: true,
      reason: "heart.roll-prompt.helper-has{what=heart.domain.occult}",
    });
    expect(helperEligibility(helper(), "kill", "occult").reason).toBe(
      "heart.roll-prompt.helper-has{what=heart.skill.kill + heart.domain.occult}",
    );
  });
});

describe("knackFor and difficultyHints", () => {
  it("lists the knacks of the chosen skill and domain the character has", () => {
    const actor = makeActor({
      skills: { kill: { value: true, knack: "Knives" } },
      domains: { occult: { value: false, knack: "Rites" } },
    });
    expect(knackFor(actor, "kill", "occult")).toEqual([{ label: "heart.skill.kill", knack: "Knives" }]);
    expect(knackFor(actor, null, null)).toEqual([]);
  });

  it("hints at harder actions from fallouts, by name", () => {
    const actor = makeActor({ fallouts: ["Limping", "fallout.major.provisions.no_rations.name", "Tired"] });
    expect(difficultyHints(actor)).toEqual([
      "heart.roll-prompt.fallout-hint.limping",
      "heart.roll-prompt.fallout-hint.no-rations",
    ]);
  });
});
