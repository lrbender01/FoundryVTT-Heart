// Item rules: repeatable abilities (items/ability/repeat.js), class
// equipment choices (items/class/equipment.js), and the two-beat limit
// (items/beat/actions.js) (2026-09-30, Luke).

import { describe, it, expect, vi } from "vitest";
import { isRepeatable, learnedTimes } from "../src/items/ability/repeat.js";
import { equipmentChoices, needsEquipmentPick } from "../src/items/class/equipment.js";
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
