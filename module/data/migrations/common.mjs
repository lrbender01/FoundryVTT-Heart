import HeartTag from "../item-tag.mjs";
import HeartAbility from "../item-ability.mjs";
import HeartBeat from "../item-beat.mjs";
import HeartCalling from "../item-calling.mjs";
import HeartClass from "../item-class.mjs";
import HeartEquipment from "../item-equipment.mjs";
import HeartFallout from "../item-fallout.mjs";
import HeartHaunt from "../item-haunt.mjs";
import HeartResource from "../item-resource.mjs";
import HeartAdversary from "../actor-adversary.mjs";
import HeartCharacter from "../actor-character.mjs";
import HeartDelve from "../actor-delve.mjs";
import HeartLandmark from "../actor-landmark.mjs";
import { localize } from "./legacy_lang.mjs";

const name_regexes = [
  [
    /(?<type>class|calling|tag)\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.${type}.${name}.${field}",
  ],
  [
    /calling\.[^.]+\.core_ability\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.ability.${name}.${field}",
  ],
  [
    /calling\.(?<calling>[^.]*)\.beats\.(?<type>minor|major|zenith)\.(?<name>[0-9]+)/,
    "HEART.Item.beat.${calling}_${type}_${name}.name",
  ],
  [
    /calling\.(?<calling>[^.]+)\.questions\.(?<name>[0-9]+)/,
    "HEART.Item.calling.${calling}.questions.${name}",
  ],
  [
    /class\.[^.]*\.abilities\.[^.]*\.[^.]*\.nested_abilities\.(?<name>[^.]*)\.(?<field>name|description)/,
    "HEART.Item.ability.${name}.${field}",
  ],
  [
    /class\.[^.]+\.traits\.resource\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.resource.${name}.${field}",
  ],
  [
    /class\.[^.]+\.abilities\.(core|minor|major|zenith)\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.ability.${name}.${field}",
  ],
  [
    /class\.[^.]+\.abilities\.(?:core|minor|major|zenith)\.[^.]+\.nested_abilities\.legendary\.description/,
    "HEART.Item.ability.legendary.description_stare_down",
  ],
  [
    /class\.[^.]+\.abilities\.(?:core|minor|major|zenith)\.[^.]+\.nested_abilities\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.ability.${name}.${field}",
  ],
  [
    /class\.[^.]+\.traits\.equipment\.[^.]+\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.equipment.${name}.${field}",
  ],
  [
    /fallout\.supplies\.[^.]+\.lost_supplies\.description/,
    "HEART.Item.fallout.lost_property.description_supplies",
  ],
  [
    /fallout\.[^.]+\.[^.]+\.(?<name>[^.]+)\.(?<field>name|description)/,
    "HEART.Item.fallout.${name}.${field}",
  ],
];

export const migrated_translations = {};
export function maybeMigrateTranslation(value) {
  for (let [regexp, template] of name_regexes) {
    const match = regexp.exec(value);
    if (match) {
      let output = applyTemplate(template, match.groups);
      migrated_translations[value] = output;
      if (game !== undefined && game.i18n.has(output)) {
        return output;
      }
    }
  }

  return localize(value);
}

function applyTemplate(template, variables = {}) {
  return Object.entries(variables).reduce((out, [key, value]) => {
    return out.replaceAll(`$\{${key}\}`, value);
  }, template);
}

export function migrateLegacyItem(item) {
  const dataModels = {
    ability: HeartAbility,
    beat: HeartBeat,
    calling: HeartCalling,
    class: HeartClass,
    equipment: HeartEquipment,
    fallout: HeartFallout,
    haunt: HeartHaunt,
    resource: HeartResource,
    tag: HeartTag,
  };

  const model = dataModels[item.type];
  if (model === undefined) {
    throw `Unexpected type "${item.type}" while migrating item`;
  }

  item.flags ??= {};
  item.flags.heart ??= {};
  item.flags.heart.active ??= item.system.type !== undefined && item.system.type == "core";

  if(item.type === "resource") item.flags.heart.active = true;

  item.system = model.migrateData(item.system);
  if (!item.ownership) {
    item.ownership = {};
  }
  if (!item.ownership.default) {
    item.ownership.default = 1;
  }

  if (item.name === undefined || !item.name.matchAll(/[a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+/g)) {
    return item;
  }

  item.name = maybeMigrateTranslation(item.name);

  if (item._stats === undefined) {
    item._stats = {
      systemVersion: game.system.version,
      systemId: game.system.id,
    };
  }

  switch(item.type) {
    case "class":
      if (item.effects.find(x => x.name === "ClassDomain") === undefined) {
        let effect = {
          changes: [{
            key: `system.domains.${item.system.domain}.value`,
            value: 1,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          }],
          description: `+1 ${item.system.domain} from ${item.name}`,
          name: "ClassDomain",
          _id: foundry.utils.randomID(),
        };
        item.effects.push(effect);
      }

      if (item.effects.find(x => x.name === "ClassSkill") === undefined) {
        let effect = {
          changes: [{
            key: `system.skills.${item.system.skill}.value`,
            value: 1,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          }],
          description: `+1 ${item.system.skill} from ${item.name}`,
          name: "ClassSkill",
          _id: foundry.utils.randomID(),
        };
        item.effects.push(effect);
      }

      break
  }

  return item;
}

export function migrateLegacyActor(actor) {
  const dataModels = {
    adversary: HeartAdversary,
    character: HeartCharacter,
    delve: HeartDelve,
    landmark: HeartLandmark,
  };

  const model = dataModels[actor.type];
  if (model === undefined) {
    throw `Unexpected type "${actor.type}" while migrating actor`;
  }

  actor.system = model.migrateData(actor.system ?? {});
  actor.ownership ??= {};
  actor.ownership.default ??= 1;

  if (!actor.name.matchAll(/[a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+/g)) {
    return actor;
  }

  actor.name = maybeMigrateTranslation(actor.name);
  actor.items = actor.items.map((item) => migrateLegacyItem(item));
}
