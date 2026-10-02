// Item rules: repeatable abilities (items/ability/repeat.js), class
// equipment choices (items/class/equipment.js), and the two-beat limit
// (items/beat/actions.js) (2026-09-30, Luke).

import { describe, it, expect, vi } from "vitest";
import { isRepeatable, learnedTimes } from "../src/items/ability/repeat.js";
import { equipmentChoices, needsEquipmentPick } from "../src/items/class/equipment.js";
import { grantedItemsOf } from "../src/items/trinkets.js";
import { clearedTraits, coreTraitsOf } from "../src/actors/character/traits.js";
import { learnedAbilities, trackedBeats, writtenQuestions, removalLoss } from "../src/items/removal.js";
import {
  ACTIVE_BEAT_LIMIT,
  activeBeatCount,
  activateBeat,
  completeBeat,
  uncompleteBeat,
  allBeatsOf,
  beatLevel,
} from "../src/items/beat/actions.js";

describe("isRepeatable", () => {
  const ability = (description, type = "ability") => ({ type, system: { description } });

  it("is an ability whose text says it can be taken more than once", () => {
    expect(isRepeatable(ability("<p>You can take this advance more than once.</p>"))).toBe(true);
    expect(isRepeatable(ability("You may take it MORE THAN ONCE."))).toBe(true);
  });

  it("is not for other abilities, other item types, or missing text", () => {
    expect(isRepeatable(ability("Once per session, reroll."))).toBe(false);
    expect(isRepeatable(ability("more than once", "beat"))).toBe(false);
    expect(isRepeatable({ type: "ability", system: {} })).toBe(false);
    expect(isRepeatable(null)).toBe(false);
  });
});

describe("learnedTimes", () => {
  const learned = (system) => learnedTimes({ system });

  it("is 0 while not learned", () => {
    expect(learned({ active: false, times: 3 })).toBe(0);
    expect(learnedTimes(null)).toBe(0);
  });

  it("is 1 when learned with no count", () => {
    expect(learned({ active: true })).toBe(1);
    expect(learned({ active: true, times: 0 })).toBe(1);
  });

  it("counts whole learns, at least one", () => {
    expect(learned({ active: true, times: 3 })).toBe(3);
    expect(learned({ active: true, times: "4" })).toBe(4);
    expect(learned({ active: true, times: 2.7 })).toBe(2);
    expect(learned({ active: true, times: -2 })).toBe(1);
  });
});

describe("equipmentChoices", () => {
  const cls = (groups, active = [], extra = {}) => ({
    system: { equipment_groups: groups, active_equipment_groups: active, ...extra },
  });

  it("ignores core and clusters group_1..3 into one pick-one choice", () => {
    expect(equipmentChoices(cls(["core", "group_1", "group_2", "group_3"], ["group_2"]))).toEqual([
      {
        key: "group",
        picked: true,
        options: [
          { id: "group_1", active: false },
          { id: "group_2", active: true },
          { id: "group_3", active: false },
        ],
      },
    ]);
  });

  it("makes two choices of Blightborn's weapon_* and kit_*", () => {
    const choices = equipmentChoices(cls(["core", "weapon_1", "weapon_2", "kit_1", "kit_2"], ["kit_1"]));
    expect(choices.map((c) => [c.key, c.options.length, c.picked])).toEqual([
      ["weapon", 2, false],
      ["kit", 2, true],
    ]);
  });

  it("reads the legacy single active_equipment_group", () => {
    const choices = equipmentChoices(cls(["group_1", "group_2"], [], { active_equipment_group: "group_1" }));
    expect(choices[0].picked).toBe(true);
  });

  it("is empty for a class with only core, or none", () => {
    expect(equipmentChoices(cls(["core"]))).toEqual([]);
    expect(equipmentChoices(null)).toEqual([]);
  });
});

describe("needsEquipmentPick", () => {
  const onActor = (groups, active) => ({
    actor: { id: "vess" },
    system: { equipment_groups: groups, active_equipment_groups: active },
  });

  it("only for a class on a character", () => {
    expect(needsEquipmentPick({ system: { equipment_groups: ["group_1", "group_2"] } })).toBe(false);
  });

  it("while any pick-one choice is unmade", () => {
    expect(needsEquipmentPick(onActor(["core", "weapon_1", "weapon_2", "kit_1", "kit_2"], ["kit_2"]))).toBe(true);
    expect(needsEquipmentPick(onActor(["core", "weapon_1", "weapon_2", "kit_1", "kit_2"], ["kit_2", "weapon_1"]))).toBe(
      false,
    );
    expect(needsEquipmentPick(onActor(["core"], []))).toBe(false);
  });
});

describe("beats: at most two pursued at a time", () => {
  // a character with a calling holding `calling` beats, plus `loose` beats on
  // the actor; each beat is [active, complete]
  const setup = ({ calling = [], loose = [] } = {}) => {
    const beat = ([active, complete], parentItem) => ({
      type: "beat",
      system: { active, complete, type: "minor" },
      parentItem,
      update: vi.fn(async function (changes) {
        if ("system.active" in changes) this.system.active = changes["system.active"];
        if ("system.complete" in changes) this.system.complete = changes["system.complete"];
      }),
    });
    const actor = { type: "character", items: [] };
    const callingItem = { type: "calling", actor, children: [] };
    callingItem.children = calling.map((b) => beat(b, callingItem));
    actor.items = [callingItem, ...loose.map((b) => beat(b, undefined))];
    actor.items.slice(1).forEach((b) => (b.actor = actor));
    return { actor, calling: callingItem, beats: [...callingItem.children, ...actor.items.slice(1)] };
  };

  it("the limit is two", () => {
    expect(ACTIVE_BEAT_LIMIT).toBe(2);
  });

  it("counts the calling's active beats and the actor's loose ones, not completed ones", () => {
    const { beats } = setup({ calling: [[true, false], [false, false], [true, true]], loose: [[true, false]] });
    expect(activeBeatCount(beats[0])).toBe(2);
  });

  it("activates a beat when there is room", async () => {
    const { beats } = setup({ calling: [[true, false], [false, false]] });
    await activateBeat(beats[1]);
    expect(beats[1].system.active).toBe(true);
  });

  it("refuses a third, with a warning", async () => {
    const { beats } = setup({ calling: [[true, false], [true, false], [false, false]] });
    await activateBeat(beats[2]);
    expect(beats[2].update).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.item-sheet.two-beats");
  });

  it("only an active beat can be completed, and completing frees its slot", async () => {
    const { beats } = setup({ calling: [[false, false], [true, false]] });
    await completeBeat(beats[0]);
    expect(beats[0].update).not.toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith("heart.beat.activate-first");
    await completeBeat(beats[1]);
    expect(beats[1].system).toMatchObject({ complete: true, active: false });
  });

  it("undoing a completion re-activates the beat when there is room, else leaves it inactive", async () => {
    const roomy = setup({ calling: [[false, true], [true, false]] });
    await uncompleteBeat(roomy.beats[0]);
    expect(roomy.beats[0].system).toMatchObject({ complete: false, active: true });

    const full = setup({ calling: [[false, true], [true, false], [true, false]] });
    await uncompleteBeat(full.beats[0]);
    expect(full.beats[0].system).toMatchObject({ complete: false, active: false });
    expect(ui.notifications.info).toHaveBeenCalledWith("heart.beat.undo-no-room");
  });

  it("allBeatsOf lists the calling's beats then the loose ones; beatLevel defaults to minor", () => {
    const { calling, beats } = setup({ calling: [[false, false]], loose: [[false, false]] });
    expect(allBeatsOf(calling)).toEqual(beats);
    expect(beatLevel({ system: {} })).toBe("minor");
    expect(beatLevel({ system: { type: "zenith" } })).toBe("zenith");
  });
});

// Removing an ancestry, calling, or class takes its rolled keepsake or
// trinket with it (2026-10-01, Luke)
describe("grantedItemsOf: what a source put on the character", () => {
  const ancestry = { id: "anc", type: "ancestry", uuid: "Actor.vess.Item.anc", flags: { heart: { trinket: { uuid: "Actor.vess.Item.old" } } } };
  const actor = {
    items: [
      ancestry,
      { id: "keep", uuid: "Actor.vess.Item.keep", flags: { heart: { trinketOf: "Actor.vess.Item.anc" } } },
      { id: "old", uuid: "Actor.vess.Item.old", flags: {} },
      { id: "trinket", uuid: "Actor.vess.Item.trinket", flags: { heart: { trinketOf: "Actor.vess.Item.call" } } },
      { id: "sword", uuid: "Actor.vess.Item.sword", flags: {} },
    ],
  };

  it("finds the items marked as granted by it, and the one it recorded rolling", () => {
    expect(grantedItemsOf(ancestry, actor).map((i) => i.id)).toEqual(["keep", "old"]);
  });

  it("leaves other sources' items and ordinary items alone", () => {
    const calling = { id: "call", type: "calling", uuid: "Actor.vess.Item.call", flags: {} };
    expect(grantedItemsOf(calling, actor).map((i) => i.id)).toEqual(["trinket"]);
  });

  it("finds nothing without an actor", () => {
    expect(grantedItemsOf(ancestry, null)).toEqual([]);
  });
});

// Removing a class resets the skills and domains (2026-10-01, Luke)
describe("clearedTraits: a class removed, the character starts over", () => {
  const system = {
    skills: { kill: { value: true, knack: "Knives" }, hunt: { value: true, knack: "" }, sneak: { value: false, knack: "" } },
    domains: { haven: { value: true, knack: "" }, wild: { value: false, knack: "Rivers" }, custom: { value: true, knack: "" } },
  };

  it("clears every marked skill and domain, custom ones too, and every knack", () => {
    expect(clearedTraits(system)).toEqual({
      "system.skills.kill.value": false,
      "system.skills.kill.knack": "",
      "system.skills.hunt.value": false,
      "system.domains.haven.value": false,
      "system.domains.wild.knack": "",
      "system.domains.custom.value": false,
    });
  });

  it("keeps the core skill and domain of a class the character still has", () => {
    const keep = coreTraitsOf([{ system: { core_skill: "hunt", core_domain: "haven" } }]);
    const out = clearedTraits(system, keep);
    expect(out).not.toHaveProperty("system.skills.hunt.value");
    expect(out).not.toHaveProperty("system.domains.haven.value");
    expect(out["system.skills.kill.value"]).toBe(false);
  });

  it("asks for nothing when nothing is marked", () => {
    expect(clearedTraits({ skills: { kill: { value: false, knack: "" } }, domains: {} })).toEqual({});
    expect(clearedTraits(undefined)).toEqual({});
  });
});

// The final confirmation before losing work (2026-10-01, Luke)
describe("removal guards: what a class, calling, or ancestry would take", () => {
  const ability = (name, type, active, children = {}) => ({ type: "ability", name, system: { type, active, children } });
  const cls = {
    type: "class",
    system: {
      children: {
        a: ability("Core One", "core", true),
        b: ability("Minor Learned", "minor", true),
        c: ability("Minor Not Yet", "minor", false),
        d: ability("Major Learned", "major", true, { e: ability("Option Learned", "minor", true) }),
        f: { type: "equipment", name: "Knife", system: { active: true } },
      },
    },
  };

  it("learnedAbilities: every learned ability but the core ones, options included", () => {
    expect(learnedAbilities(cls)).toEqual(["Minor Learned", "Major Learned", "Option Learned"]);
  });

  it("learnedAbilities: a fresh class has none", () => {
    expect(learnedAbilities({ system: { children: { a: ability("Core One", "core", true) } } })).toEqual([]);
  });

  it("trackedBeats: beats pursued or finished", () => {
    const beat = (name, active, complete) => ({ type: "beat", name, system: { active, complete } });
    const calling = { system: { children: { a: beat("Pursued", true, false), b: beat("Done", false, true), c: beat("Untouched", false, false) } } };
    expect(trackedBeats(calling)).toEqual(["Pursued", "Done"]);
  });

  it("writtenQuestions: answers, and wording the player added", () => {
    const ancestry = {
      system: {
        questions: {
          a: { question: "Book question?", answer: "<p>My answer</p>" },
          b: { question: "Book question two?", answer: "" },
          c: { question: "My own question?", answer: "", custom: true },
          d: { question: "", answer: "<p></p>", custom: true },
        },
      },
    };
    expect(writtenQuestions(ancestry)).toBe(2);
    expect(writtenQuestions({ system: { questions: { b: { question: "Book?", answer: "" } } } })).toBe(0);
  });

  it("removalLoss: only on a character, only when something would be lost", () => {
    const actor = { type: "character", name: "Vess" };
    expect(removalLoss({ ...cls, actor })).toEqual({ kind: "class", names: ["Minor Learned", "Major Learned", "Option Learned"] });
    expect(removalLoss({ ...cls, actor: { type: "adversary" } })).toBeNull();
    expect(removalLoss({ type: "calling", actor, system: { children: {} } })).toBeNull();
    expect(removalLoss({ type: "equipment", actor, system: {} })).toBeNull();
  });
});
