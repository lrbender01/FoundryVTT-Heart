/**
 * An item's roll (src/rolls/item-roll/roll.js) on the one dice ladder
 * (src/rolls/stress-roll/rules.js), 2026-10-21 (audit R4, R21, R25):
 * Shift+click steps the die up, Alt+click down, never past D4 or D12, and
 * the card says "stepped" only when the die moved. The roll keeps only what
 * the card reads of the item.
 */

import { describe, it, expect, beforeEach } from "vitest";
import ItemRoll, { itemSummary } from "../src/rolls/item-roll/roll.js";
import { stepUp, stepDown, itemRollDie, DIE_ORDER } from "../src/rolls/stress-roll/rules.js";
import { resetWorld, rendered, queueDice } from "./helpers.mjs";

beforeEach(() => {
  resetWorld();
  game.heart = { skills: ["delve"] };
});

describe("the dice ladder", () => {
  it("steps one place, and nothing goes below D4 or above D12 (HCB p. 7)", () => {
    expect(DIE_ORDER).toEqual(["d4", "d6", "d8", "d10", "d12"]);
    expect(stepDown("d6")).toBe("d4");
    expect(stepDown("d4")).toBe("d4");
    expect(stepUp("d10")).toBe("d12");
    expect(stepUp("d12")).toBe("d12");
    // off the ladder: left alone (the old item roll stepped it to D4)
    expect(stepUp("d20")).toBe("d20");
  });

  it("an item roll's die says it stepped only when it moved", () => {
    expect(itemRollDie("d6", { stepDecrease: true })).toEqual({ die: "d4", stepped: "down" });
    expect(itemRollDie("d4", { stepDecrease: true })).toEqual({ die: "d4", stepped: "" });
    expect(itemRollDie("d8", { stepIncrease: true })).toEqual({ die: "d10", stepped: "up" });
    expect(itemRollDie("d12", { stepIncrease: true })).toEqual({ die: "d12", stepped: "" });
    expect(itemRollDie("D8")).toEqual({ die: "d8", stepped: "" });
  });
});

describe("ItemRoll", () => {
  const lamp = {
    name: "Lamp",
    img: "lamp.svg",
    type: "equipment",
    flags: { big: true },
    system: { die_size: "d6", type: "delve", description: "<p>a long text</p>", children: { a: {} } },
  };

  // the bug: a D6 never stepped down to a D4
  it("Alt+click steps a D6 down to a D4", () => {
    const roll = ItemRoll.build({ item: lamp }, {}, { stepIncrease: false, stepDecrease: true });
    expect(roll.formula).toBe("d4");
    expect(roll.options.stepped).toBe("down");
  });

  it("the card says stepped down only when the die moved", async () => {
    const d4 = { ...lamp, system: { ...lamp.system, die_size: "d4" } };
    const roll = ItemRoll.build({ item: d4 }, {}, { stepDecrease: true });
    queueDice(2);
    await roll.evaluate();
    expect(rendered(await roll.render()).data.det).toBe("");
    const moved = ItemRoll.build({ item: lamp }, {}, { stepDecrease: true });
    queueDice(2);
    await moved.evaluate();
    expect(rendered(await moved.render()).data.det).toBe("heart.card.stepped-down");
  });

  it("keeps only what the card reads of the item", () => {
    const roll = ItemRoll.build({ item: lamp });
    expect(roll.options.item).toEqual({
      name: "Lamp",
      img: "lamp.svg",
      system: { die_size: "d6", domain: undefined, type: "delve", service: undefined },
    });
    expect(itemSummary(undefined).name).toBe("");
  });
});
