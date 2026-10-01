// The game-term highlighter (src/common/terms.js emphasizeTerms), as a table
// of input -> highlighted phrases (2026-09-30, Luke). The assertions read the
// highlighted TEXT and the heart-term class, never the exact tag, so
// attributes on the <strong> (a tooltip, say) can change freely.

import { describe, it, expect } from "vitest";
import { emphasizeTerms } from "../src/common/terms.js";
import { highlights, abilityRefs, plainText } from "./helpers.mjs";

const check = (input, expected, options) => {
  const out = emphasizeTerms(input, options);
  expect(highlights(out)).toEqual(expected);
  // highlighting only ever wraps text; it never changes it
  expect(plainText(out)).toBe(plainText(input));
};

describe("skills, domains, and their combinations", () => {
  it.each([
    ["Roll Kill to attack.", ["Kill"]],
    ["Roll Endure+Occult to resist.", ["Endure+Occult"]],
    ["Roll Endure + Occult to resist.", ["Endure + Occult"]],
    ["Roll Delve+Domain when you scavenge.", ["Delve+Domain"]],
    ["Roll Discern+[Domain] to know.", ["Discern+[Domain]"]],
    ["Roll Skill+Domain as usual.", ["Skill+Domain"]],
    ["You gain the Kill Skill.", ["Kill Skill"]],
    ["You gain the Occult Domain.", ["Occult Domain"]],
    ["You have the Technology Knack.", ["Technology Knack"]],
    ["You are at home in the Haven and the Warren.", ["Haven", "Warren"]],
  ])("%s", (input, expected) => check(input, expected));
});

describe("resistances and Protection", () => {
  it.each([
    ["It marks your Blood Resistance.", ["Blood Resistance"]],
    ["Gain +2 Echo Protection.", ["+2 Echo Protection"]],
    ["Gain +1 Blood and Mind Protection.", ["+1 Blood and Mind Protection"]],
    ["Gain +1 Protection.", ["+1 Protection"]],
    ["You have Blood Protection +2 here.", ["Blood Protection +2"]],
    ["It has Protection 5.", ["Protection 5"]],
    ["Your Protections stack.", ["Protections"]],
    ["Mark it to Fortune or Supplies.", ["Fortune", "Supplies"]],
  ])("%s", (input, expected) => check(input, expected));
});

describe("Stress units", () => {
  it.each([
    ["Take D6 Stress to Mind.", ["D6 Stress to Mind"]],
    ["Take +2 Stress to Blood.", ["+2 Stress to Blood"]],
    ["Mark D4, D6, or D8 Supplies Stress.", ["D4, D6, or D8 Supplies Stress"]],
    ["Mark D4, D6 or D10 Stress to Supplies.", ["D4, D6 or D10 Stress to Supplies"]],
    ["Remove all Mind Stress.", ["all Mind Stress"]],
    ["If you have 4 or more Stress, flee.", ["4 or more Stress"]],
    ["Reduce your Mind Stress to 0.", ["Mind Stress to 0"]],
    ["Mark it as Provisions Stress.", ["Provisions Stress"]],
    ["Roll the Stress dice again.", ["Stress dice"]],
    ["You have 4 total Stress.", ["4 total Stress"]],
    ["Stress is how the city wears you down.", ["Stress"]],
  ])("%s", (input, expected) => check(input, expected));

  it("lowercase stress is ordinary English", () => check("Take stress to your mind.", []));
});

describe("Fallout", () => {
  it.each([
    ["Take Major or Minor Blood, Mind, or Supplies Fallout.", ["Major or Minor Blood, Mind, or Supplies Fallout"]],
    ["Take Major or Minor Blood, Mind or Supplies Fallout.", ["Major or Minor Blood, Mind or Supplies Fallout"]],
    ["Take Minor Blood fallout.", ["Minor Blood fallout"]],
    ["It is a Critical Fallout.", ["Critical Fallout"]],
    ["Clear your Fallouts.", ["Fallouts"]],
  ])("%s", (input, expected) => check(input, expected));
});

describe("dice", () => {
  it.each([
    ["Roll 2D10 and keep both.", ["2D10"]],
    ["Roll a d6 here.", ["d6"]],
    ["Roll your D8s.", ["D8s"]],
    ["Add +D4 to that.", ["+D4"]],
    ["On a 2-5, it fails.", []],
    ["Results of 6-7 cost.", []],
  ])("%s", (input, expected) => check(input, expected));
});

describe("difficulties, tags, Mastery, and the generic names", () => {
  it.each([
    ["The action is Risky.", ["Risky"]],
    ["The action is Standard, not Impossible.", ["Standard", "Impossible"]],
    ["The fight is Dangerous.", ["Dangerous"]],
    ["A Brutal, Point-Blank weapon.", ["Brutal", "Point-Blank"]],
    ["A Double-Barrelled gun with Extreme Range.", ["Double-Barrelled", "Extreme Range"]],
    ["You gain Mastery.", ["Mastery"]],
    ["Mastery lets you roll another die.", ["Mastery"]],
    ["Pick a Skill of your choice.", ["Skill"]],
    ["Pick two Domains and a Knack.", ["Domains", "Knack"]],
    ["Each Resistance has its own track.", ["Resistance"]],
  ])("%s", (input, expected) => check(input, expected));
});

describe("the sentence-start rule", () => {
  it.each([
    ["Wild animals are scared of you.", []],
    ["<p>Wild animals are scared of you.</p>", []],
    ["It hurts. Wild animals flee.", []],
    ["Smoke rises from the vents.", []],
    ["Skills you have stay.", []],
    ["Standard procedure applies.", []],
    // a capitalised term mid-sentence is a term
    ["You know the Wild well.", ["Wild"]],
    // a lowercase game word after it marks a real term
    ["Kill skill is yours.", ["Kill"]],
    ["Occult domain rolls.", ["Occult"]],
    ["Risky actions cost more.", ["Risky"]],
    ["Delve equipment you create.", ["Delve"]],
    // combinations are always terms
    ["Endure+Occult is the roll.", ["Endure+Occult"]],
  ])("%s", (input, expected) => check(input, expected));
});

describe("markup", () => {
  it("leaves text inside <strong> and <b> alone", () => {
    const input = "<p><strong>Kill</strong> with <b>Blood</b>, then Kill again.</p>";
    const out = emphasizeTerms(input);
    expect(highlights(out)).toEqual(["Kill"]);
    expect(out).toContain("<strong>Kill</strong>");
    expect(out).toContain("<b>Blood</b>");
  });

  it("never touches tag attributes", () => {
    const input = '<a title="Kill Blood D6">Roll Kill</a>';
    const out = emphasizeTerms(input);
    expect(out).toContain('<a title="Kill Blood D6">');
    expect(highlights(out)).toEqual(["Kill"]);
  });

  it("marks highlights with the heart-term class", () => {
    expect(emphasizeTerms("Roll Kill.")).toMatch(/<strong class="heart-term[^"]*"[^>]*>Kill<\/strong>/);
  });

  it("returns empty and non-string input unchanged", () => {
    expect(emphasizeTerms("")).toBe("");
    expect(emphasizeTerms(null)).toBe("");
    expect(emphasizeTerms(undefined)).toBe("");
  });
});

describe("ability references ({ abilityRefs: true })", () => {
  it.each([
    ["Works as per HEARTSBLOOD.", ["HEARTSBLOOD"]],
    ["Swear the OATH OF FURY now.", ["OATH OF FURY"]],
    ["Call in DEBTOR'S REDS.", ["DEBTOR'S REDS"]],
    ["Gone AWOL again.", ["AWOL"]],
    ["Use your BLOODBOUND BEAST, Kill with it.", ["BLOODBOUND BEAST"]],
  ])("%s", (input, expected) => {
    const out = emphasizeTerms(input, { abilityRefs: true });
    expect(abilityRefs(out)).toEqual(expected);
    expect(plainText(out)).toBe(input);
  });

  it("still highlights game terms around a reference", () => {
    const out = emphasizeTerms("Roll Kill as per HEARTSBLOOD, then take D6 Stress to Blood.", { abilityRefs: true });
    expect(highlights(out)).toEqual(["Kill", "HEARTSBLOOD", "D6 Stress to Blood"]);
    expect(abilityRefs(out)).toEqual(["HEARTSBLOOD"]);
  });

  it("skips short capitals (OF, D6, a lone I)", () => {
    const out = emphasizeTerms("I roll D6 OF it.", { abilityRefs: true });
    expect(abilityRefs(out)).toEqual([]);
  });

  it("marks nothing when abilityRefs is off", () => {
    for (const input of ["as per HEARTSBLOOD", "OATH OF FURY", "DEBTOR'S REDS", "Gone AWOL again."]) {
      const out = emphasizeTerms(input);
      expect(abilityRefs(out)).toEqual([]);
      expect(highlights(out)).toEqual([]);
    }
  });
});
