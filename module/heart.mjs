// Import document classes.
import { HeartActor } from "./documents/actor.mjs";
import { HeartItem } from "./documents/item.mjs";
// Import sheet classes.
import { HeartActorSheet } from "./sheets/actor-sheet.mjs";
import { HeartItemSheet } from "./sheets/item-sheet.mjs";
// Import application classes.
import { HeartAddItemApplication } from "./applications/application-add-item.mjs";
import { HeartRollHelperApplication } from "./applications/application-roll-helper.mjs";
import { HeartStressRollHelperApplication } from "./applications/application-stress-roll-helper.mjs";
import { HeartFalloutRollHelperApplication } from "./applications/application-fallout-roll-helper.mjs";
// Import hooks
import { getSceneControlButtons } from "./hooks/extra-scene-controls.mjs";
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from "./helpers/templates.mjs";
import { HEART } from "./helpers/config.mjs";
import { HeartChatMessage } from "./helpers/chat-message.mjs";
// Import DataModel classes
import * as models from "./data/_module.mjs";
// Import Roll classes
import {
  HeartRoll,
  HeartStressRoll,
  HeartFalloutRoll,
  HeartRollParser,
  HeartStressRollParser,
  HeartFalloutRollParser,
} from "./rolls/_module.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once("init", function () {
  game.heart = {
    HeartActor,
    HeartItem,
    HeartRoll,
    HeartStressRoll,
    HeartFalloutRoll,
    HeartChatMessage,
    HeartRollParser,
    HeartRollHelperApplication,
    HeartStressRollHelperApplication,
    HeartFalloutRollHelperApplication,
    rollItemMacro,
    addItemMacro,
  };

  // Add custom constants for configuration.
  CONFIG.HEART = HEART;
  CONFIG.HEART.heart_roll_parser = HeartRollParser;
  CONFIG.HEART.heart_fallout_roll_parser = HeartFalloutRollParser;
  CONFIG.HEART.heart_stress_roll_parser = HeartStressRollParser;

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = HeartActor;
  CONFIG.Actor.dataModels = {
    adversary: models.HeartAdversary,
    character: models.HeartCharacter,
    delve: models.HeartDelve,
    landmark: models.HeartLandmark,
  };

  CONFIG.Item.documentClass = HeartItem;
  CONFIG.Item.dataModels = {
    ability: models.HeartAbility,
    beat: models.HeartBeat,
    calling: models.HeartCalling,
    class: models.HeartClass,
    equipment: models.HeartEquipment,
    fallout: models.HeartFallout,
    haunt: models.HeartHaunt,
    resource: models.HeartResource,
    tag: models.HeartTag,
  };

  CONFIG.Item.typeLabels = {
    ability: "TYPES.Item.ability",
    beat: "TYPES.Item.beat",
    calling: "TYPES.Item.calling",
    class: "TYPES.Item.class",
    equipment: "TYPES.Item.equipment",
    fallout: "TYPES.Item.fallout",
    haunt: "TYPES.Item.haunt",
    resource: "TYPES.Item.resource",
    tag: "TYPES.Item.tag",
  };

  CONFIG.Item.typeIcons = {
    ability: "fa-hand-fist",
    beat: "fa-music-note",
    calling: "fa-megaphone",
    class: "fa-paw-claws",
    equipment: "fa-backpack",
    fallout: "fa-radiation",
    haunt: "fa-ghost",
    resource: "fa-drumstick-bite",
    tag: "fa-tag",
  };

  CONFIG.Actor.typeIcons = {
    adversary: "TYPES.Actor.adversary",
    character: "TYPES.Actor.character",
    delve: "TYPES.Actor.delve",
    landmark: "TYPES.Actor.landmark",
  };

  CONFIG.Actor.typeIcons = {
    adversary: "fa-sword",
    character: "fa-person",
    delve: "fa-road",
    landmark: "fa-map-location-dot",
  };

  // This is the hackiest thing I have had to do yet,
  // it's a shame I can't replace the Roll class entirely.
  Roll.create = (function (create) {
    return function (formula, data, options) {
      try {
        return new HeartRoll(...arguments);
      } catch (err) {}

      try {
        return new HeartStressRoll(...arguments);
      } catch (err) {}

      try {
        return new HeartFalloutRoll(...arguments);
      } catch (err) {}

      return create(...arguments);
    };
  })(Roll.create);

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  CONFIG.Dice.rolls.push(HeartRoll, HeartStressRoll, HeartFalloutRoll);
  // CONFIG.ChatMessage.documentClass = HeartChatMessage;

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("heart", HeartActorSheet, {
    makeDefault: true,
    label: "HEART.SheetLabels.Actor",
  });
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("heart", HeartItemSheet, {
    makeDefault: true,
    label: "HEART.SheetLabels.Item",
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper("toLowerCase", function (str) {
  return str.toLowerCase();
});

Handlebars.registerHelper("formGroupDocument", function (field, options = {}) {
  const value = foundry.utils.getProperty(
    options.hash.document,
    field.fieldPath
  );
  options.hash.value = value;
  return HandlebarsHelpers.formGroup(field, options);
});

Handlebars.registerHelper("itemIcon", function (type) {
  return CONFIG.Item.typeIcons[type];
});

Hooks.on("getSceneControlButtons", getSceneControlButtons);

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== "Item") return;
  if (!data.uuid.includes("Actor.") && !data.uuid.includes("Token.")) {
    return ui.notifications.warn(
      "You can only create macro buttons for owned Items"
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.heart.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "heart.itemMacro": true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: "Item",
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

function addItemMacro(parent, types, hints) {
  const app = new HeartAddItemApplication(parent, { types, hints });
  app.render(true);
}

/* ------------------------------------------ */
/*  Babele Hook                               */
/* ------------------------------------------ */

Hooks.once("babele.init", (babele) => {
  babele.setSystemTranslationsDir("lang");
  babele.registerConverters({
    convertSystem: (system, translation, data) => {
      // The built-in flattenObject|expandObject handle
      // arrays in a way we don't want, so we roll our own
      // versions here.
      function flattenObject(ob) {
        var toReturn = {};

        for (var i in ob) {
          if (!ob.hasOwnProperty(i)) continue;

          if (typeof ob[i] == "object" && ob[i] !== null) {
            var flatObject = flattenObject(ob[i]);
            for (var x in flatObject) {
              if (!flatObject.hasOwnProperty(x)) continue;

              toReturn[i + "." + x] = flatObject[x];
            }
          } else {
            toReturn[i] = ob[i];
          }
        }
        return toReturn;
      }

      function expandObject(data) {
        var result = {};
        for (var i in data) {
          var keys = i.split(".");
          keys.reduce(function (r, e, j) {
            return (
              r[e] ||
              (r[e] = isNaN(Number(keys[j + 1]))
                ? keys.length - 1 == j
                  ? data[i]
                  : {}
                : [])
            );
          }, result);
        }
        return result;
      }

      const flat_system = flattenObject(system);
      const flat_translation = flattenObject(translation);
      foundry.utils.mergeObject(flat_system, flat_translation);
      const new_system = expandObject(flat_system);
      return new_system;
    },
  });
});
