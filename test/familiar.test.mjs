/**
 * The Witch is Dead's familiar (src/actors/familiar/rules.js; Luke,
 * 2026-10-24): the traits, the species and spell tables, and a roll's
 * outcome (success, a point of Danger, serious trouble).
 */
import { describe, it, expect } from "vitest";
import {
  TRAITS,
  SPECIES,
  SPELLS,
  TARGETS,
  DEFAULT_TARGET,
  clampTrait,
  clampDanger,
  dangerStep,
  traitsOf,
  dangerOf,
  hasTraits,
  speciesFor,
  spellFor,
  speciesUpdate,
  targetOf,
  familiarOutcome,
  clampFamiliarData,
  SPECIES_IDS,
  speciesIdOf,
  speciesArtPath,
  speciesLocked,
  spellLocked,
  portraitOpen,
  speciesPortraitUpdate,
} from "../src/actors/familiar/rules.js";

describe("the tables", () => {
  it("has the game's four traits in its order", () => {
    expect(TRAITS).toEqual(["clever", "fierce", "sly", "quick"]);
  });

  it("has the species table as printed (Clever, Fierce, Sly, Quick)", () => {
    const rows = SPECIES.map((s) => [s.id, ...TRAITS.map((t) => s.traits[t])]);
    expect(rows).toEqual([
      ["fox", 2, 2, 1, 1],
      ["cat", 0, 1, 3, 2],
      ["toad", 1, 0, 2, 1],
      ["spider", 2, 0, 3, 1],
      ["owl", 3, 1, 1, 2],
      ["hare", 0, 0, 2, 3],
      ["magpie", 2, 1, 1, 2],
      ["crow", 2, 1, 2, 1],
      ["dog", 1, 3, 0, 1],
      ["rat", 1, 0, 2, 2],
    ]);
  });

  it("maps every d10 face to a species and a spell, and nothing else", () => {
    for (let face = 1; face <= 10; face++) {
      expect(speciesFor(face)).toBe(SPECIES[face - 1]);
      expect(spellFor(face)).toBe(SPELLS[face - 1]);
    }
    for (const face of [0, 11, -1, "x", undefined]) {
      expect(speciesFor(face)).toBeNull();
      expect(spellFor(face)).toBeNull();
    }
    expect(spellFor(1)).toBe("unseen-hand");
    expect(spellFor(10)).toBe("book-read-aloud");
  });

  it("rates tasks 6 Simple to 10 Near-impossible, Basic by default", () => {
    expect(TARGETS.map((t) => [t.value, t.id])).toEqual([
      [6, "simple"],
      [7, "basic"],
      [8, "challenging"],
      [9, "difficult"],
      [10, "near-impossible"],
    ]);
    expect(DEFAULT_TARGET).toBe(7);
    expect(targetOf(9).id).toBe("difficult");
    expect(targetOf("8").id).toBe("challenging");
    expect(targetOf(12).value).toBe(7);
    expect(targetOf(undefined).value).toBe(7);
  });
});

describe("traits and Danger in range", () => {
  it("keeps a trait a whole number from 0 to 3", () => {
    expect([-2, 0, 1.7, 3, 4, "2", "", null, "x"].map(clampTrait)).toEqual([0, 0, 1, 3, 3, 2, 0, 0, 0]);
  });

  it("keeps Danger a whole number from 0 up", () => {
    expect([-1, 0, 5, 12, "3", undefined].map(clampDanger)).toEqual([0, 0, 5, 12, 3, 0]);
    expect(dangerStep(2, 1)).toBe(3);
    expect(dangerStep(0, -1)).toBe(0);
    expect(dangerStep(undefined, 1)).toBe(1);
  });

  it("reads a familiar's traits and Danger, filling gaps with 0", () => {
    expect(traitsOf({ traits: { clever: 2, sly: 9 } })).toEqual({ clever: 2, fierce: 0, sly: 3, quick: 0 });
    expect(traitsOf(undefined)).toEqual({ clever: 0, fierce: 0, sly: 0, quick: 0 });
    expect(dangerOf({ danger: 4 })).toBe(4);
  });

  it("clamps the sheet's typed numbers and leaves the rest alone", () => {
    expect(
      clampFamiliarData({ name: "Mabel", "system.traits.clever": 7, "system.traits.quick": -1, "system.danger": -3, "system.notes": "revenge" }),
    ).toEqual({ name: "Mabel", "system.traits.clever": 3, "system.traits.quick": 0, "system.danger": 0, "system.notes": "revenge" });
    expect(clampFamiliarData({ name: "Mabel" })).toEqual({ name: "Mabel" });
  });
});

describe("rolling a species", () => {
  it("asks first only when a species or a trait is set", () => {
    expect(hasTraits({ species: "", traits: { clever: 0, fierce: 0, sly: 0, quick: 0 } })).toBe(false);
    expect(hasTraits({})).toBe(false);
    expect(hasTraits({ species: "  " })).toBe(false);
    expect(hasTraits({ species: "Owl" })).toBe(true);
    expect(hasTraits({ traits: { quick: 1 } })).toBe(true);
  });

  it("sets the species and all four traits", () => {
    expect(speciesUpdate(speciesFor(5), "Owl")).toEqual({
      "system.species": "Owl",
      "system.speciesLocked": true,
      "system.traits.clever": 3,
      "system.traits.fierce": 1,
      "system.traits.sly": 1,
      "system.traits.quick": 2,
    });
  });
});

describe("a roll's outcome", () => {
  it("adds the trait to the die and succeeds on equal or beat", () => {
    const hit = familiarOutcome({ die: 5, trait: 2, target: 7, danger: 0 });
    expect(hit).toMatchObject({ die: 5, trait: 2, total: 7, target: 7, success: true, gainDanger: false, trouble: false });
    expect(familiarOutcome({ die: 4, trait: 2, target: 7 }).success).toBe(false);
  });

  it("gains a point of Danger only on a dangerous failure", () => {
    expect(familiarOutcome({ die: 2, trait: 1, target: 8, danger: 1, dangerous: true })).toMatchObject({
      success: false,
      gainDanger: true,
      dangerBefore: 1,
      dangerAfter: 2,
    });
    expect(familiarOutcome({ die: 2, trait: 1, target: 8, danger: 1 })).toMatchObject({ gainDanger: false, dangerAfter: 1 });
    expect(familiarOutcome({ die: 9, trait: 1, target: 8, danger: 1, dangerous: true })).toMatchObject({ gainDanger: false, dangerAfter: 1 });
  });

  it("makes magic always dangerous", () => {
    const out = familiarOutcome({ die: 3, trait: 0, target: 7, danger: 0, magic: true });
    expect(out).toMatchObject({ dangerous: true, magic: true, gainDanger: true, dangerAfter: 1 });
  });

  it("is serious trouble when the die alone is at or under the Danger held before", () => {
    expect(familiarOutcome({ die: 3, trait: 3, target: 6, danger: 3 })).toMatchObject({ success: true, trouble: true });
    expect(familiarOutcome({ die: 4, trait: 0, target: 6, danger: 3 }).trouble).toBe(false);
    // the point gained on this roll does not count against it
    expect(familiarOutcome({ die: 3, trait: 0, target: 9, danger: 2, dangerous: true })).toMatchObject({ trouble: false, dangerAfter: 3 });
    // with no Danger a d10 can never be at or under it
    expect(familiarOutcome({ die: 1, trait: 0, target: 6, danger: 0 }).trouble).toBe(false);
  });

  it("holds every die, trait, target, and Danger to the rules", () => {
    for (let die = 1; die <= 10; die++) {
      for (let trait = 0; trait <= 3; trait++) {
        for (const { value: target } of TARGETS) {
          for (let danger = 0; danger <= 10; danger++) {
            for (const dangerous of [false, true]) {
              const out = familiarOutcome({ die, trait, target, danger, dangerous });
              expect(out.total).toBe(die + trait);
              expect(out.success).toBe(die + trait >= target);
              expect(out.gainDanger).toBe(dangerous && die + trait < target);
              expect(out.trouble).toBe(die <= danger);
            }
          }
        }
      }
    }
  });

  it("reads a trait out of range as the rules allow it", () => {
    expect(familiarOutcome({ die: 4, trait: 9, target: 7 })).toMatchObject({ trait: 3, total: 7, success: true });
  });
});

describe("a familiar's spell, for its sigil", () => {
  it("names one of the ten by its label or id, any case; else null", async () => {
    const { spellIdOf } = await import("../src/actors/familiar/rules.js");
    const label = (id) => ({ "make-flame": "Make Flame", "lock-unlock": "Lock/Unlock, Open/Close" })[id] ?? id;
    expect(spellIdOf("Make Flame", label)).toBe("make-flame");
    expect(spellIdOf("  make flame ", label)).toBe("make-flame");
    expect(spellIdOf("lock/unlock, open/close", label)).toBe("lock-unlock");
    expect(spellIdOf("speak-human")).toBe("speak-human");
    expect(spellIdOf("Fireball", label)).toBeNull();
    expect(spellIdOf("", label)).toBeNull();
  });
});

describe("the species pictures", () => {
  it("names the ten species ids, in the table's order, kebab-case", () => {
    expect(SPECIES_IDS).toEqual(["fox", "cat", "toad", "spider", "owl", "hare", "magpie", "crow", "dog", "rat"]);
    for (const id of SPECIES_IDS) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("puts each picture in the content module's species folder", () => {
    expect(speciesArtPath("owl")).toBe("modules/fvtt-heart-content/assets/art/familiar/species/owl.webp");
    expect(speciesArtPath("dragon")).toBeNull();
  });

  it("finds a species from its written name, by label or id", () => {
    const label = (id) => ({ fox: "Zorro" })[id] ?? id;
    expect(speciesIdOf("Zorro", label)).toBe("fox");
    expect(speciesIdOf("  OWL ", label)).toBe("owl");
    expect(speciesIdOf("a small dragon", label)).toBeNull();
    expect(speciesIdOf("")).toBeNull();
  });
});

describe("roll once: the lock", () => {
  it("locks on the flag, unlocks when the GM clears it", () => {
    expect(speciesLocked({ speciesLocked: true, species: "" })).toBe(true);
    expect(speciesLocked({ speciesLocked: false, species: "Owl" })).toBe(false);
    expect(spellLocked({ spellLocked: true })).toBe(true);
    expect(spellLocked({ spellLocked: false, spell: "Make Flame" })).toBe(false);
  });

  it("counts a species or spell already written in as locked, when no flag is set", () => {
    expect(speciesLocked({ species: "Owl" })).toBe(true);
    expect(speciesLocked({ species: "  " })).toBe(false);
    expect(speciesLocked({})).toBe(false);
    expect(spellLocked({ spell: "Make Flame" })).toBe(true);
    expect(spellLocked(undefined)).toBe(false);
  });
});

describe("the portrait follows the species", () => {
  const stand = (src) => src === "icons/svg/mystery-man.svg";
  it("is open when none was chosen, or when it is a species picture", () => {
    expect(portraitOpen("", stand)).toBe(true);
    expect(portraitOpen("icons/svg/mystery-man.svg", stand)).toBe(true);
    expect(portraitOpen(speciesArtPath("fox"), stand)).toBe(true);
  });

  it("is never replaced when the player chose it", () => {
    expect(portraitOpen("worlds/mine/my-cat.webp", stand)).toBe(false);
    expect(speciesPortraitUpdate("owl", "worlds/mine/my-cat.webp", stand)).toEqual({});
  });

  it("sets the portrait and the prototype token's art", () => {
    const art = speciesArtPath("owl");
    expect(speciesPortraitUpdate("owl", "icons/svg/mystery-man.svg", stand)).toEqual({ img: art, "prototypeToken.texture.src": art });
    expect(speciesPortraitUpdate("nope", "", stand)).toEqual({});
  });
});
