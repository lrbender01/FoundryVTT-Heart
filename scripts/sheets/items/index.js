import { AbilitySheet } from "./ability.js";
import { BeatSheet } from "./beat.js";
import { ClassSheet } from "./class.js";
import { EquipmentSheet } from "./equipment.js";
import { FalloutSheet } from "./fallout.js";
import { HauntSheet } from "./haunt.js";
import { ResourceSheet } from "./resource.js";
import { TagSheet } from "./tag.js";

export function registerItemSheets() {
  const { Items } = foundry.documents.collections;
  Items.registerSheet("heart", AbilitySheet, {types: ["ability"]});
  Items.registerSheet("heart", BeatSheet, {types: ["beat"]});
  Items.registerSheet("heart", ClassSheet, {types: ["class"]});
  Items.registerSheet("heart", EquipmentSheet, {types: ["equipment"]});
  Items.registerSheet("heart", FalloutSheet, {types: ["fallout"]});
  Items.registerSheet("heart", HauntSheet, {types: ["haunt"]});
  Items.registerSheet("heart", ResourceSheet, {types: ["resource"]});
  Items.registerSheet("heart", TagSheet, {types: ["tag"]});
}
