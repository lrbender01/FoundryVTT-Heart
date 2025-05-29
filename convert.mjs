import { readFileSync, writeFileSync, globSync, mkdirSync, rmSync } from "fs";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

import "./fake_foundry.mjs";

import {
  migrateLegacyItem,
  migrateLegacyActor,
  migrated_translations,
} from "./module/data/migrations/common.mjs";

global.CONFIG.Item.documentClass.migrateDataSafe = (source) => {
  const newSource = migrateLegacyItem(source);
  Object.assign(source, newSource);
}

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

function unflattenObject(data) {
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

function isTranslationKey(value) {

  return(
    typeof value === "string" &&
    !value.startsWith("system.") && 
    !value.startsWith("Compendium.") && 
    value.match(/^[a-z0-9A-Z_()]+\.[a-z0-9A-Z_.()]+$/) &&
    value.includes(".")
  );
}

function sanityCheck(document) {
  const flat = flattenObject(document);
  Object.entries(flat).forEach(([key, value]) => {
    if (key === '_stats.coreVersion') return;
    if (key.includes('.answer')) return;

    if (value === undefined) {
      throw `Key "${key}" from ${document.name} is unexpectedly undefined`;
    }
    if (key.includes(".children.")) {
      throw `Translated document contains unexpected reference to "children" ${key} (${document.name})`;
    }
    if (isTranslationKey(value))
      if (!value.startsWith("HEART.")) {
        throw `Document "${document.name}" key appears to be untranslated: ${key} = ${value}`;
      } else if (flat_new_translations["en"][value] === undefined) {
        throw `Translation key ${value} is not included in the new translations`;
      }
  });
}

const old_system_dir = "/home/cian/code/foundryvtt/heart/dist";

const old_pack_paths = [
  old_system_dir + "/packs/callings",
  old_system_dir + "/packs/classes",
  old_system_dir + "/packs/fallouts",
  old_system_dir + "/packs/tags",
];

const folders = {
  fallout: {
    name: "HEART.Item.fallout.label-plural",
    sorting: "a",
    folder: null,
    type: "Item",
    _id: "HICGVPy1oOIhaNsF",
    _key: "!folders!HICGVPy1oOIhaNsF",
  },
  class: {
    name: "HEART.Item.class.label-plural",
    sorting: "a",
    folder: null,
    type: "Item",
    _id: "PuDcAMGqYcI8YivV",
    _key: "!folders!PuDcAMGqYcI8YivV",
  },
  calling: {
    name: "HEART.Item.calling.label-plural",
    sorting: "a",
    folder: null,
    type: "Item",
    _id: "dxatdOCQXcKJ7Fla",
    _key: "!folders!dxatdOCQXcKJ7Fla",
  },
  tag: {
    name: "HEART.Item.tag.label-plural",
    sorting: "a",
    folder: null,
    type: "Item",
    _id: "PTk4NMDzwQq2Ydrp",
    _key: "!folders!PTk4NMDzwQq2Ydrp",
  },
};

const unpacked_pack_paths = old_pack_paths.map((path) => path + "/_source");

/*
await Promise.all(
  old_pack_paths.map(async (path, index) => {
    await extractPack(path, unpacked_pack_paths[index]);
  })
);
*/

const unmigrated_documents = unpacked_pack_paths.reduce((documents, path) => {
  const new_documents = globSync(path + "/*.json").map((file) => {
    const raw_json = readFileSync(file);
    return JSON.parse(raw_json);
  });
  documents.push(...new_documents);
  return documents;
}, []);

const flat_old_translations = globSync(old_system_dir + "/lang/*.json").reduce(
  (translations, path) => {
    const path_match = /\/([^./]*).json$/.exec(path);
    const lang = path_match[1];
    const raw_json = readFileSync(path);
    translations[lang] = flattenObject(JSON.parse(raw_json));
    return translations;
  },
  {}
);

const flat_new_translations = {};

const migrated_documents = unmigrated_documents.map((legacy_document) => {
  const migrated_document = migrateLegacyItem(legacy_document);
  migrated_document.folder = folders[migrated_document.type]._id;
  migrated_document._stats = {
    "coreVersion": "12.325",
  };
  return migrated_document;
});

Object.entries(flat_old_translations).forEach(([lang, legacy_translation]) => {
  const modern_translation = {};
  Object.entries(migrated_translations).forEach(([legacy, modern]) => {
    modern_translation[modern] ??= legacy_translation[`heart.${legacy}`];
  });
  flat_new_translations[lang] = modern_translation;
});

migrated_documents.forEach((document) => {
  sanityCheck(document);
});

Object.entries(flat_new_translations).forEach(([lang, flat_translation]) => {
  const path = `lang/${lang}`;
  mkdirSync(path, { recursive: true });

  let entries = {};
  Object.values(migrated_documents).forEach((document) => {
    const flat_document = flattenObject(document);
    const flat_translatable_document = {};
    Object.entries(flat_document)
      .filter(([_, value]) => {
        return isTranslationKey(value);
      })
      .forEach(([key, value]) => {
        flat_translatable_document[key] = flat_translation[value];
      });

    const translatable_document = unflattenObject(flat_translatable_document);
    entries[flat_document.name] = translatable_document;
  });

  const output = {
    label: "Items",
    folders: {
      "HEART.Item.calling.label-plural": "Callings",
      "HEART.Item.class.label-plural": "Classes",
      "HEART.Item.fallout.label-plural": "Fallouts",
      "HEART.Item.tag.label-plural": "Tags",
    },
    mapping: {
      system: {
        path: "system",
        converter: "convertSystem",
      },
      description: "system.description",
    },
    entries,
  };

  writeFileSync(`${path}/heart.items.json`, JSON.stringify(output, null, 4));
});

const path = `packs/items/_source`;
rmSync(path, { recursive: true, force: true });

Object.values(migrated_documents)
  .concat(Object.values(folders))
  .forEach((document) => {
    mkdirSync(path, { recursive: true });
    const safe_name = document.name.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    const filename = `${safe_name}_${document._id}`;
    writeFileSync(
      `${path}/${filename}.json`,
      JSON.stringify(document, null, 4)
    );
  });

compilePack(path, `packs/items`);



const legacy_actors =[
  {
      "name": "Example Adversary",
      "type": "adversary",
      "_id": "yHJN0EJxRPJdGZsC",
      "img": "systems/heart/assets/high-punch.svg",
      "system": {
          "names": "",
          "descriptors": "<p>descriptors!</p>",
          "motivation": "<p>motivation!</p>",
          "difficulty": "Dangerous",
          "resistance": "",
          "resistanceMax": "5",
          "protection": "",
          "resources": [],
          "equipment": [],
          "special": "<p>special!</p>",
          "notes": "<p>notes!</p>"
      },
      "prototypeToken": {
          "name": "Example Adversary",
          "displayName": 0,
          "actorLink": false,
          "appendNumber": false,
          "prependAdjective": false,
          "width": 1,
          "height": 1,
          "texture": {
              "src": "systems/heart/assets/high-punch.svg",
              "anchorX": 0.5,
              "anchorY": 0.5,
              "offsetX": 0,
              "offsetY": 0,
              "fit": "contain",
              "scaleX": 1,
              "scaleY": 1,
              "rotation": 0,
              "tint": "#ffffff",
              "alphaThreshold": 0.75
          },
          "hexagonalShape": 0,
          "lockRotation": false,
          "rotation": 0,
          "alpha": 1,
          "disposition": -1,
          "displayBars": 0,
          "bar1": {
              "attribute": null
          },
          "bar2": {
              "attribute": null
          },
          "light": {
              "negative": false,
              "priority": 0,
              "alpha": 0.5,
              "angle": 360,
              "bright": 0,
              "color": null,
              "coloration": 1,
              "dim": 0,
              "attenuation": 0.5,
              "luminosity": 0.5,
              "saturation": 0,
              "contrast": 0,
              "shadows": 0,
              "animation": {
                  "type": null,
                  "speed": 5,
                  "intensity": 5,
                  "reverse": false
              },
              "darkness": {
                  "min": 0,
                  "max": 1
              }
          },
          "sight": {
              "enabled": false,
              "range": 0,
              "angle": 360,
              "visionMode": "basic",
              "color": null,
              "attenuation": 0.1,
              "brightness": 0,
              "saturation": 0,
              "contrast": 0
          },
          "detectionModes": [],
          "occludable": {
              "radius": 0
          },
          "ring": {
              "enabled": false,
              "colors": {
                  "ring": null,
                  "background": null
              },
              "effects": 1,
              "subject": {
                  "scale": 1,
                  "texture": null
              }
          },
          "flags": {},
          "randomImg": false
      },
      "items": [
          {
              "type": "equipment",
              "name": "New equipment",
              "system": {
                  "die_size": "d4",
                  "description": "",
                  "active": true,
                  "children": {},
                  "resistances": [],
                  "type": "miscellaneous",
                  "group": "core"
              },
              "_id": "anVxwx5QvF24SoD2",
              "img": "icons/svg/item-bag.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745435076492,
                  "modifiedTime": 1745435076492,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          },
          {
              "type": "resource",
              "name": "New resource",
              "system": {
                  "die_size": "d4",
                  "description": "",
                  "children": {},
                  "active": true,
                  "complete": false,
                  "domain": "cursed"
              },
              "_id": "Y6M6T2Itd27eX1Y2",
              "img": "icons/svg/item-bag.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745435078772,
                  "modifiedTime": 1745435078772,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          }
      ],
      "effects": [],
      "folder": null,
      "sort": 0,
      "ownership": {
          "default": 0,
          "eiLQkDvSTMaHbeeE": 3
      },
      "flags": {},
      "_stats": {
          "compendiumSource": null,
          "duplicateSource": null,
          "coreVersion": "12.331",
          "systemId": "heart",
          "systemVersion": "0.9.4",
          "createdTime": 1745435011593,
          "modifiedTime": 1745435084383,
          "lastModifiedBy": "eiLQkDvSTMaHbeeE"
      }
  },
  {
      "name": "Example Character",
      "type": "character",
      "_id": "XHOaYDlstM1sSNXO",
      "img": "systems/heart/assets/high-punch.svg",
      "system": {
          "resistances": {
              "blood": {
                  "value": 5,
                  "max": 10,
                  "protection": 0
              },
              "mind": {
                  "value": 0,
                  "max": 10,
                  "protection": 0
              },
              "echo": {
                  "value": 0,
                  "max": 10,
                  "protection": 0
              },
              "fortune": {
                  "value": 0,
                  "max": 10,
                  "protection": 0
              },
              "supplies": {
                  "value": 0,
                  "max": 10,
                  "protection": 0
              }
          },
          "skills": {
              "compel": {
                  "value": true,
                  "knack": "knack 1"
              },
              "delve": {
                  "value": false,
                  "knack": ""
              },
              "discern": {
                  "value": false,
                  "knack": ""
              },
              "endure": {
                  "value": false,
                  "knack": ""
              },
              "evade": {
                  "value": false,
                  "knack": ""
              },
              "hunt": {
                  "value": false,
                  "knack": ""
              },
              "kill": {
                  "value": false,
                  "knack": ""
              },
              "mend": {
                  "value": false,
                  "knack": ""
              },
              "sneak": {
                  "value": false,
                  "knack": ""
              }
          },
          "domains": {
              "cursed": {
                  "value": false,
                  "knack": ""
              },
              "desolate": {
                  "value": false,
                  "knack": ""
              },
              "haven": {
                  "value": false,
                  "knack": ""
              },
              "occult": {
                  "value": false,
                  "knack": ""
              },
              "religion": {
                  "value": true,
                  "knack": "knack 2"
              },
              "technology": {
                  "value": false,
                  "knack": ""
              },
              "warren": {
                  "value": false,
                  "knack": ""
              },
              "wild": {
                  "value": false,
                  "knack": ""
              }
          },
          "class": "",
          "calling": "",
          "active_beats": [],
          "equipment": [],
          "resources": [],
          "abilities": [],
          "fallout": [],
          "notes": "<p>Some notes</p>"
      },
      "prototypeToken": {
          "name": "New Actor",
          "displayName": 0,
          "actorLink": false,
          "appendNumber": false,
          "prependAdjective": false,
          "texture": {
              "src": "systems/heart/assets/high-punch.svg",
              "scaleX": 1,
              "scaleY": 1,
              "offsetX": 0,
              "offsetY": 0,
              "rotation": 0,
              "anchorX": 0.5,
              "anchorY": 0.5,
              "fit": "contain",
              "tint": "#ffffff",
              "alphaThreshold": 0.75
          },
          "width": 1,
          "height": 1,
          "lockRotation": false,
          "rotation": 0,
          "alpha": 1,
          "disposition": -1,
          "displayBars": 0,
          "bar1": {
              "attribute": null
          },
          "bar2": {
              "attribute": null
          },
          "light": {
              "alpha": 0.5,
              "angle": 360,
              "bright": 0,
              "coloration": 1,
              "dim": 0,
              "attenuation": 0.5,
              "luminosity": 0.5,
              "saturation": 0,
              "contrast": 0,
              "shadows": 0,
              "animation": {
                  "type": null,
                  "speed": 5,
                  "intensity": 5,
                  "reverse": false
              },
              "darkness": {
                  "min": 0,
                  "max": 1
              },
              "negative": false,
              "priority": 0,
              "color": null
          },
          "sight": {
              "enabled": false,
              "range": 0,
              "angle": 360,
              "visionMode": "basic",
              "attenuation": 0.1,
              "brightness": 0,
              "saturation": 0,
              "contrast": 0,
              "color": null
          },
          "detectionModes": [],
          "flags": {},
          "randomImg": false,
          "hexagonalShape": 0,
          "occludable": {
              "radius": 0
          },
          "ring": {
              "enabled": false,
              "colors": {
                  "ring": null,
                  "background": null
              },
              "effects": 1,
              "subject": {
                  "scale": 1,
                  "texture": null
              }
          }
      },
      "items": [
          {
              "_id": "c6UDAEMnfZdNoQbD",
              "name": "Deadwalker",
              "type": "class",
              "system": {
                  "description": "class.deadwalker.description",
                  "children": {
                      "6n0esdft35wnhc8b": {
                          "_id": "6n0esdft35wnhc8b",
                          "type": "resource",
                          "name": "class.deadwalker.traits.resource.bag_of_interesting_teeth.name",
                          "system": {
                              "active": true,
                              "die_size": "d6",
                              "domain": "desolate",
                              "children": {}
                          }
                      },
                      "u7fuctbfc1em6ale": {
                          "_id": "u7fuctbfc1em6ale",
                          "name": "class.deadwalker.abilities.core.death_follows_close.name",
                          "type": "ability",
                          "system": {
                              "active": true,
                              "description": "class.deadwalker.abilities.core.death_follows_close.description",
                              "type": "core",
                              "children": {}
                          }
                      },
                      "aqqrif8f9u8mgmci": {
                          "_id": "aqqrif8f9u8mgmci",
                          "name": "class.deadwalker.abilities.core.enter_the_grey.name",
                          "type": "ability",
                          "system": {
                              "active": true,
                              "description": "class.deadwalker.abilities.core.enter_the_grey.description",
                              "type": "core",
                              "children": {}
                          }
                      },
                      "6auu02dkjom0j9gw": {
                          "_id": "6auu02dkjom0j9gw",
                          "name": "class.deadwalker.abilities.minor.adept.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.adept.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "ab76o844h1bakg1p": {
                          "_id": "ab76o844h1bakg1p",
                          "name": "class.deadwalker.abilities.minor.deathless.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.deathless.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "1k7kdda8o19j75rn": {
                          "_id": "1k7kdda8o19j75rn",
                          "name": "class.deadwalker.abilities.minor.dirt_under_the_fingernails.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.dirt_under_the_fingernails.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "4stt5jmm7ktwjr11": {
                          "_id": "4stt5jmm7ktwjr11",
                          "name": "class.deadwalker.abilities.minor.explorer.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.explorer.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "j1lf06urzonrg8jn": {
                          "_id": "j1lf06urzonrg8jn",
                          "name": "class.deadwalker.abilities.minor.grail_armour.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.grail_armour.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "d0xko6fmdhrt3qn6": {
                          "_id": "d0xko6fmdhrt3qn6",
                          "name": "class.deadwalker.abilities.minor.grim_reaper.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.grim_reaper.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "kxyx3rjqvamej1t0": {
                          "_id": "kxyx3rjqvamej1t0",
                          "name": "class.deadwalker.abilities.minor.the_harvest.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.the_harvest.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "vwdaf0y3halewp3h": {
                          "_id": "vwdaf0y3halewp3h",
                          "name": "class.deadwalker.abilities.minor.last_rites.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.last_rites.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "ui93t5wzj3b47fsp": {
                          "_id": "ui93t5wzj3b47fsp",
                          "name": "class.deadwalker.abilities.minor.marked_for_death.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.marked_for_death.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "yu0uvqujh0kh8mca": {
                          "_id": "yu0uvqujh0kh8mca",
                          "name": "class.deadwalker.abilities.minor.shadow.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.shadow.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "qnaa1wakw3rbmcg0": {
                          "_id": "qnaa1wakw3rbmcg0",
                          "name": "class.deadwalker.abilities.minor.survivor.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.survivor.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "9c9p9qeu7ex8w1bp": {
                          "_id": "9c9p9qeu7ex8w1bp",
                          "name": "class.deadwalker.abilities.minor.tattered_soul.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.tattered_soul.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "2h977tdid4so1h3c": {
                          "_id": "2h977tdid4so1h3c",
                          "name": "class.deadwalker.abilities.minor.walking_reliquary.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.minor.walking_reliquary.description",
                              "type": "minor",
                              "children": {}
                          }
                      },
                      "dgob1iugicc5jtwv": {
                          "_id": "dgob1iugicc5jtwv",
                          "name": "class.deadwalker.abilities.major.descent.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.major.descent.description",
                              "type": "major",
                              "children": {
                                  "8fc31oqsztlnfcui": {
                                      "_id": "8fc31oqsztlnfcui",
                                      "name": "class.deadwalker.abilities.major.descent.nested_abilities.esoteric_cartographer.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.descent.nested_abilities.esoteric_cartographer.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "c6p8mcxuc68rr3cn": {
                                      "_id": "c6p8mcxuc68rr3cn",
                                      "name": "class.deadwalker.abilities.major.descent.nested_abilities.step_between.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.descent.nested_abilities.step_between.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "ppzrs35ow1kaii6v": {
                                      "_id": "ppzrs35ow1kaii6v",
                                      "name": "class.deadwalker.abilities.major.descent.nested_abilities.all_doors_as_one.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.descent.nested_abilities.all_doors_as_one.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  }
                              }
                          }
                      },
                      "zbep85uyilbs5tmv": {
                          "_id": "zbep85uyilbs5tmv",
                          "name": "class.deadwalker.abilities.major.echoes.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.major.echoes.description",
                              "type": "major",
                              "children": {
                                  "drdzdysaqpodju8n": {
                                      "_id": "drdzdysaqpodju8n",
                                      "name": "class.deadwalker.abilities.major.echoes.nested_abilities.hidden_passageway.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.echoes.nested_abilities.hidden_passageway.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "bdoahvwy73sjg5b6": {
                                      "_id": "bdoahvwy73sjg5b6",
                                      "name": "class.deadwalker.abilities.major.echoes.nested_abilities.fragmentary_recollection.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.echoes.nested_abilities.fragmentary_recollection.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "9ljx11rm3jg5rdj3": {
                                      "_id": "9ljx11rm3jg5rdj3",
                                      "name": "class.deadwalker.abilities.major.echoes.nested_abilities.absorb_memories.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.echoes.nested_abilities.absorb_memories.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  }
                              }
                          }
                      },
                      "fy8ksxlxm9de5vnj": {
                          "_id": "fy8ksxlxm9de5vnj",
                          "name": "class.deadwalker.abilities.major.invidious_spectre.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.major.invidious_spectre.description",
                              "type": "major",
                              "children": {
                                  "aoikxjjvhxbdirib": {
                                      "_id": "aoikxjjvhxbdirib",
                                      "name": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.soothe.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.soothe.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "ucv413r0wpca9a9c": {
                                      "_id": "ucv413r0wpca9a9c",
                                      "name": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.ghoulish_grasp.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.ghoulish_grasp.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "sq6wrtoj79adzisz": {
                                      "_id": "sq6wrtoj79adzisz",
                                      "name": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.ethereal_touch.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.invidious_spectre.nested_abilities.ethereal_touch.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  }
                              }
                          }
                      },
                      "ra28e79bt6nawiph": {
                          "_id": "ra28e79bt6nawiph",
                          "name": "class.deadwalker.abilities.major.reapers_strike.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.major.reapers_strike.description",
                              "type": "major",
                              "children": {
                                  "d8aivwyfbd8h8uyt": {
                                      "_id": "d8aivwyfbd8h8uyt",
                                      "name": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.inexorable.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.inexorable.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "c1krnrd5qd707512": {
                                      "_id": "c1krnrd5qd707512",
                                      "name": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.bloodied_but_unbroken.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.bloodied_but_unbroken.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "68hlu3t90u1zqhoo": {
                                      "_id": "68hlu3t90u1zqhoo",
                                      "name": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.scything_blow.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.reapers_strike.nested_abilities.scything_blow.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  }
                              }
                          }
                      },
                      "3ysgdata9xht49dg": {
                          "_id": "3ysgdata9xht49dg",
                          "name": "class.deadwalker.abilities.major.sudden_death.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.major.sudden_death.description",
                              "type": "major",
                              "children": {
                                  "izm74lc64az4pplv": {
                                      "_id": "izm74lc64az4pplv",
                                      "name": "class.deadwalker.abilities.major.sudden_death.nested_abilities.liminal.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.sudden_death.nested_abilities.liminal.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "c4euqyakhmsooc4i": {
                                      "_id": "c4euqyakhmsooc4i",
                                      "name": "class.deadwalker.abilities.major.sudden_death.nested_abilities.entropy.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.sudden_death.nested_abilities.entropy.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  },
                                  "f3cq5dm5sso4ekr6": {
                                      "_id": "f3cq5dm5sso4ekr6",
                                      "name": "class.deadwalker.abilities.major.sudden_death.nested_abilities.blood_sacrifice.name",
                                      "type": "ability",
                                      "system": {
                                          "active": false,
                                          "description": "class.deadwalker.abilities.major.sudden_death.nested_abilities.blood_sacrifice.description",
                                          "type": "minor",
                                          "children": {}
                                      }
                                  }
                              }
                          }
                      },
                      "coc0venwu2zq767x": {
                          "_id": "coc0venwu2zq767x",
                          "name": "class.deadwalker.abilities.zenith.extinguish.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.zenith.extinguish.description",
                              "type": "zenith",
                              "children": {}
                          }
                      },
                      "l4tdquukern6wnbq": {
                          "_id": "l4tdquukern6wnbq",
                          "name": "class.deadwalker.abilities.zenith.infernal_claws.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.zenith.infernal_claws.description",
                              "type": "zenith",
                              "children": {}
                          }
                      },
                      "r71j69pvapiqovwn": {
                          "_id": "r71j69pvapiqovwn",
                          "name": "class.deadwalker.abilities.zenith.sunder_the_veil.name",
                          "type": "ability",
                          "system": {
                              "active": false,
                              "description": "class.deadwalker.abilities.zenith.sunder_the_veil.description",
                              "type": "zenith",
                              "children": {}
                          }
                      },
                      "mrsx3xp2gwh0y61d": {
                          "_id": "mrsx3xp2gwh0y61d",
                          "name": "class.deadwalker.traits.equipment.group_1.hunting_rifle.name",
                          "type": "equipment",
                          "system": {
                              "type": "kill",
                              "die_size": "d6",
                              "group": "group_1",
                              "children": {
                                  "p88mtd76cbdhhesd": {
                                      "_id": "p88mtd76cbdhhesd",
                                      "name": "tag.extreme_range.name",
                                      "type": "tag",
                                      "system": {
                                          "description": "tag.extreme_range.description"
                                      }
                                  },
                                  "80q91ap65z446onx": {
                                      "_id": "80q91ap65z446onx",
                                      "name": "tag.reload.name",
                                      "type": "tag",
                                      "system": {
                                          "description": "tag.reload.description"
                                      }
                                  }
                              }
                          }
                      },
                      "tl7mn5kixd722717": {
                          "_id": "tl7mn5kixd722717",
                          "name": "class.deadwalker.traits.equipment.group_2.greatsword.name",
                          "type": "equipment",
                          "system": {
                              "type": "kill",
                              "die_size": "d10",
                              "group": "group_2",
                              "children": {
                                  "5uhno6ebfy6fk1hb": {
                                      "_id": "5uhno6ebfy6fk1hb",
                                      "name": "tag.tiring.name",
                                      "type": "tag",
                                      "system": {
                                          "description": "tag.tiring.description"
                                      }
                                  }
                              }
                          }
                      },
                      "mfkprzqqxs99fz3q": {
                          "_id": "mfkprzqqxs99fz3q",
                          "name": "class.deadwalker.traits.equipment.group_3.bootleg_ambrosia.name",
                          "type": "equipment",
                          "system": {
                              "type": "mend",
                              "die_size": "d6",
                              "group": "group_3",
                              "resistances": [
                                  "mind"
                              ],
                              "children": {
                                  "nhaevn1x9yguvg5v": {
                                      "_id": "nhaevn1x9yguvg5v",
                                      "name": "tag.potent.name",
                                      "type": "tag",
                                      "system": {
                                          "description": "tag.potent.description"
                                      }
                                  },
                                  "6yfgpwc9wowa5fd2": {
                                      "_id": "6yfgpwc9wowa5fd2",
                                      "name": "tag.expensive.name",
                                      "type": "tag",
                                      "system": {
                                          "description": "tag.expensive.description"
                                      }
                                  }
                              }
                          }
                      },
                      "cu47bd9wlzd0ho2h": {
                          "_id": "cu47bd9wlzd0ho2h",
                          "name": "class.deadwalker.traits.equipment.group_3.ritual_blade.name",
                          "type": "equipment",
                          "system": {
                              "type": "kill",
                              "die_size": "d6",
                              "group": "group_3",
                              "children": {}
                          }
                      }
                  },
                  "type": "core",
                  "core_skill": "delve",
                  "core_domain": "desolate",
                  "equipment_groups": [
                      "group_1",
                      "group_2",
                      "group_3"
                  ],
                  "active_equipment_group": "",
                  "active_equipment_groups": [
                      "core"
                  ],
                  "active": true
              },
              "effects": [],
              "img": "icons/svg/item-bag.svg",
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {
                  "core": {
                      "sourceId": "Compendium.heart.classes.Item.0oneuu297ie8hyez"
                  }
              },
              "_stats": {
                  "systemId": "heart",
                  "systemVersion": "0.8.5",
                  "coreVersion": "12.328",
                  "createdTime": 1694257297796,
                  "modifiedTime": 1694257297796,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE",
                  "compendiumSource": "Compendium.heart.classes.Item.0oneuu297ie8hyez",
                  "duplicateSource": null
              }
          },
          {
              "_id": "jgFPAgDexuWh10pI",
              "name": "Adventure",
              "type": "calling",
              "system": {
                  "description": "calling.adventure.description",
                  "children": {
                      "g91yg9rj7icux5gf": {
                          "_id": "g91yg9rj7icux5gf",
                          "name": "calling.adventure.core_ability.legendary.name",
                          "type": "ability",
                          "system": {
                              "active": true,
                              "description": "calling.adventure.core_ability.legendary.description",
                              "type": "core",
                              "children": {}
                          }
                      },
                      "c3e60xjmjeofkrbs": {
                          "_id": "c3e60xjmjeofkrbs",
                          "name": "calling.adventure.beats.minor.0",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.0",
                              "type": "minor",
                              "active": true
                          }
                      },
                      "af972664ktmcj6ts": {
                          "_id": "af972664ktmcj6ts",
                          "name": "calling.adventure.beats.minor.1",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.1",
                              "type": "minor"
                          }
                      },
                      "86gjqq9ah8fkt9nm": {
                          "_id": "86gjqq9ah8fkt9nm",
                          "name": "calling.adventure.beats.minor.2",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.2",
                              "type": "minor"
                          }
                      },
                      "co0udfp12nwjwl6i": {
                          "_id": "co0udfp12nwjwl6i",
                          "name": "calling.adventure.beats.minor.3",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.3",
                              "type": "minor"
                          }
                      },
                      "p3iqdppqjlrb1prf": {
                          "_id": "p3iqdppqjlrb1prf",
                          "name": "calling.adventure.beats.minor.4",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.4",
                              "type": "minor"
                          }
                      },
                      "7q4aw5fora9crju5": {
                          "_id": "7q4aw5fora9crju5",
                          "name": "calling.adventure.beats.minor.5",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.5",
                              "type": "minor",
                              "active": true
                          }
                      },
                      "03lac1ccea8wmhqm": {
                          "_id": "03lac1ccea8wmhqm",
                          "name": "calling.adventure.beats.minor.6",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.6",
                              "type": "minor"
                          }
                      },
                      "pll6jl93iadacgi7": {
                          "_id": "pll6jl93iadacgi7",
                          "name": "calling.adventure.beats.minor.7",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.7",
                              "type": "minor"
                          }
                      },
                      "hagr6u1h9vifmvzi": {
                          "_id": "hagr6u1h9vifmvzi",
                          "name": "calling.adventure.beats.minor.8",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.8",
                              "type": "minor"
                          }
                      },
                      "uw3om9dzenb3a6g0": {
                          "_id": "uw3om9dzenb3a6g0",
                          "name": "calling.adventure.beats.minor.9",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.9",
                              "type": "minor"
                          }
                      },
                      "jltfki4cqjafyo1z": {
                          "_id": "jltfki4cqjafyo1z",
                          "name": "calling.adventure.beats.minor.10",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.10",
                              "type": "minor"
                          }
                      },
                      "p9w7vk2eygbt9xey": {
                          "_id": "p9w7vk2eygbt9xey",
                          "name": "calling.adventure.beats.minor.11",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.11",
                              "type": "minor"
                          }
                      },
                      "ptf74mezklpedopp": {
                          "_id": "ptf74mezklpedopp",
                          "name": "calling.adventure.beats.minor.12",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.12",
                              "type": "minor"
                          }
                      },
                      "2t4n6akg50d954uq": {
                          "_id": "2t4n6akg50d954uq",
                          "name": "calling.adventure.beats.minor.13",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.13",
                              "type": "minor"
                          }
                      },
                      "f0n4460slf7vnvcq": {
                          "_id": "f0n4460slf7vnvcq",
                          "name": "calling.adventure.beats.minor.14",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.14",
                              "type": "minor"
                          }
                      },
                      "940tn081sein3ewi": {
                          "_id": "940tn081sein3ewi",
                          "name": "calling.adventure.beats.minor.15",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.15",
                              "type": "minor"
                          }
                      },
                      "wx8e3mb4tckkqh4j": {
                          "_id": "wx8e3mb4tckkqh4j",
                          "name": "calling.adventure.beats.minor.16",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.16",
                              "type": "minor"
                          }
                      },
                      "7mg4fgoqko2qeeqg": {
                          "_id": "7mg4fgoqko2qeeqg",
                          "name": "calling.adventure.beats.minor.17",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.17",
                              "type": "minor"
                          }
                      },
                      "ya5hal0zmwkq0u96": {
                          "_id": "ya5hal0zmwkq0u96",
                          "name": "calling.adventure.beats.minor.18",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.18",
                              "type": "minor"
                          }
                      },
                      "rjgikk06x9fz9ixm": {
                          "_id": "rjgikk06x9fz9ixm",
                          "name": "calling.adventure.beats.minor.19",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.19",
                              "type": "minor"
                          }
                      },
                      "7vws78kkaku6dwyg": {
                          "_id": "7vws78kkaku6dwyg",
                          "name": "calling.adventure.beats.minor.20",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.minor.20",
                              "type": "minor"
                          }
                      },
                      "c3bg60lh7c80tj5n": {
                          "_id": "c3bg60lh7c80tj5n",
                          "name": "calling.adventure.beats.major.0",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.0",
                              "type": "major"
                          }
                      },
                      "q7qa9d5tw9b60q23": {
                          "_id": "q7qa9d5tw9b60q23",
                          "name": "calling.adventure.beats.major.1",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.1",
                              "type": "major",
                              "active": true
                          }
                      },
                      "hf8wg5tcu5rumef4": {
                          "_id": "hf8wg5tcu5rumef4",
                          "name": "calling.adventure.beats.major.2",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.2",
                              "type": "major"
                          }
                      },
                      "djwabopr1uqv1qvi": {
                          "_id": "djwabopr1uqv1qvi",
                          "name": "calling.adventure.beats.major.3",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.3",
                              "type": "major"
                          }
                      },
                      "nsoxgveeu0jmrq5z": {
                          "_id": "nsoxgveeu0jmrq5z",
                          "name": "calling.adventure.beats.major.4",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.4",
                              "type": "major"
                          }
                      },
                      "8xllqguwzc924fvk": {
                          "_id": "8xllqguwzc924fvk",
                          "name": "calling.adventure.beats.major.5",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.5",
                              "type": "major"
                          }
                      },
                      "ds6v4aq6wqrlls7n": {
                          "_id": "ds6v4aq6wqrlls7n",
                          "name": "calling.adventure.beats.major.6",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.6",
                              "type": "major"
                          }
                      },
                      "4madftom30d426i0": {
                          "_id": "4madftom30d426i0",
                          "name": "calling.adventure.beats.major.7",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.7",
                              "type": "major"
                          }
                      },
                      "6yq6pf3e4xoy63a1": {
                          "_id": "6yq6pf3e4xoy63a1",
                          "name": "calling.adventure.beats.major.8",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.8",
                              "type": "major"
                          }
                      },
                      "q47hfa4smjnxyjq5": {
                          "_id": "q47hfa4smjnxyjq5",
                          "name": "calling.adventure.beats.major.9",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.major.9",
                              "type": "major"
                          }
                      },
                      "9nvhyt53a2lbgvkg": {
                          "_id": "9nvhyt53a2lbgvkg",
                          "name": "calling.adventure.beats.zenith.0",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.zenith.0",
                              "type": "zenith"
                          }
                      },
                      "5a9gjth1a7mp8k17": {
                          "_id": "5a9gjth1a7mp8k17",
                          "name": "calling.adventure.beats.zenith.1",
                          "type": "beat",
                          "system": {
                              "description": "calling.adventure.beats.zenith.1",
                              "type": "zenith"
                          }
                      }
                  },
                  "questions": {
                      "fpn936ttdguyox13": {
                          "question": "calling.adventure.questions.0"
                      },
                      "39uy6ubwnbptit1d": {
                          "question": "calling.adventure.questions.1"
                      },
                      "gtanbe5470hszl14": {
                          "question": "calling.adventure.questions.2"
                      },
                      "116uplxjz93e878i": {
                          "question": "calling.adventure.questions.3"
                      }
                  },
                  "mark": null,
                  "active": true
              },
              "effects": [],
              "_stats": {
                  "compendiumSource": "Compendium.heart.callings.Item.7s6bw6f1nih1zgiu",
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745434685843,
                  "modifiedTime": 1745434718574,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              },
              "img": "icons/svg/item-bag.svg",
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {}
          }
      ],
      "effects": [],
      "folder": null,
      "sort": 0,
      "ownership": {
          "default": 2,
          "eiLQkDvSTMaHbeeE": 3,
          "DcJ8xS92zUW1d5UG": 3
      },
      "flags": {},
      "_stats": {
          "systemId": "heart",
          "systemVersion": "0.9.4",
          "coreVersion": "12.331",
          "createdTime": 1694257229575,
          "modifiedTime": 1745434819011,
          "lastModifiedBy": "eiLQkDvSTMaHbeeE",
          "compendiumSource": null,
          "duplicateSource": null
      }
  },
  {
      "name": "Example Delve",
      "type": "delve",
      "_id": "Dq7VUIFHaw3dt4rg",
      "img": "systems/heart/assets/dungeon-light.svg",
      "system": {
          "domains": "Wild",
          "tier": "4",
          "stress": "",
          "resistance": "10",
          "resistanceMax": "10",
          "resources": "",
          "equipment": "",
          "events": [],
          "connection": "<p>connection!</p>",
          "description": "<p>description!</p>",
          "notes": "<p>notes!</p>"
      },
      "prototypeToken": {
          "name": "Example Delve",
          "displayName": 0,
          "actorLink": false,
          "appendNumber": false,
          "prependAdjective": false,
          "width": 1,
          "height": 1,
          "texture": {
              "src": "systems/heart/assets/dungeon-light.svg",
              "anchorX": 0.5,
              "anchorY": 0.5,
              "offsetX": 0,
              "offsetY": 0,
              "fit": "contain",
              "scaleX": 1,
              "scaleY": 1,
              "rotation": 0,
              "tint": "#ffffff",
              "alphaThreshold": 0.75
          },
          "hexagonalShape": 0,
          "lockRotation": false,
          "rotation": 0,
          "alpha": 1,
          "disposition": -1,
          "displayBars": 0,
          "bar1": {
              "attribute": null
          },
          "bar2": {
              "attribute": null
          },
          "light": {
              "negative": false,
              "priority": 0,
              "alpha": 0.5,
              "angle": 360,
              "bright": 0,
              "color": null,
              "coloration": 1,
              "dim": 0,
              "attenuation": 0.5,
              "luminosity": 0.5,
              "saturation": 0,
              "contrast": 0,
              "shadows": 0,
              "animation": {
                  "type": null,
                  "speed": 5,
                  "intensity": 5,
                  "reverse": false
              },
              "darkness": {
                  "min": 0,
                  "max": 1
              }
          },
          "sight": {
              "enabled": false,
              "range": 0,
              "angle": 360,
              "visionMode": "basic",
              "color": null,
              "attenuation": 0.1,
              "brightness": 0,
              "saturation": 0,
              "contrast": 0
          },
          "detectionModes": [],
          "occludable": {
              "radius": 0
          },
          "ring": {
              "enabled": false,
              "colors": {
                  "ring": null,
                  "background": null
              },
              "effects": 1,
              "subject": {
                  "scale": 1,
                  "texture": null
              }
          },
          "flags": {},
          "randomImg": false
      },
      "items": [
          {
              "type": "equipment",
              "name": "New equipment",
              "system": {
                  "die_size": "d4",
                  "description": "",
                  "active": true,
                  "children": {},
                  "resistances": [],
                  "type": "miscellaneous",
                  "group": "core"
              },
              "_id": "PG9U8p1dJHpc96hu",
              "img": "icons/svg/item-bag.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745434955126,
                  "modifiedTime": 1745434955126,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          },
          {
              "type": "resource",
              "name": "New resource",
              "system": {
                  "die_size": "d4",
                  "description": "",
                  "children": {},
                  "active": true,
                  "complete": false,
                  "domain": "cursed"
              },
              "_id": "n32Soy7ubOGp0NUf",
              "img": "icons/svg/item-bag.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745434958555,
                  "modifiedTime": 1745434958555,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          }
      ],
      "effects": [],
      "folder": null,
      "sort": 0,
      "ownership": {
          "default": 0,
          "eiLQkDvSTMaHbeeE": 3
      },
      "flags": {},
      "_stats": {
          "compendiumSource": null,
          "duplicateSource": null,
          "coreVersion": "12.331",
          "systemId": "heart",
          "systemVersion": "0.9.4",
          "createdTime": 1745434935538,
          "modifiedTime": 1745434989389,
          "lastModifiedBy": "eiLQkDvSTMaHbeeE"
      }
  },
  {
      "name": "Example Landmark",
      "type": "landmark",
      "_id": "rAYg19Fhs4GJPF9s",
      "img": "systems/heart/assets/monument.svg",
      "system": {
          "domains": "Cursed",
          "description": "<p>description!</p>",
          "haunts": [],
          "potentialPlots": "<p>potential plot!</p>",
          "resources": [],
          "specialRules": "<p>special rules!</p>",
          "stress": "d4",
          "tier": "2"
      },
      "prototypeToken": {
          "name": "Example Landmark",
          "displayName": 0,
          "actorLink": false,
          "appendNumber": false,
          "prependAdjective": false,
          "width": 1,
          "height": 1,
          "texture": {
              "src": "systems/heart/assets/monument.svg",
              "anchorX": 0.5,
              "anchorY": 0.5,
              "offsetX": 0,
              "offsetY": 0,
              "fit": "contain",
              "scaleX": 1,
              "scaleY": 1,
              "rotation": 0,
              "tint": "#ffffff",
              "alphaThreshold": 0.75
          },
          "hexagonalShape": 0,
          "lockRotation": false,
          "rotation": 0,
          "alpha": 1,
          "disposition": -1,
          "displayBars": 0,
          "bar1": {
              "attribute": null
          },
          "bar2": {
              "attribute": null
          },
          "light": {
              "negative": false,
              "priority": 0,
              "alpha": 0.5,
              "angle": 360,
              "bright": 0,
              "color": null,
              "coloration": 1,
              "dim": 0,
              "attenuation": 0.5,
              "luminosity": 0.5,
              "saturation": 0,
              "contrast": 0,
              "shadows": 0,
              "animation": {
                  "type": null,
                  "speed": 5,
                  "intensity": 5,
                  "reverse": false
              },
              "darkness": {
                  "min": 0,
                  "max": 1
              }
          },
          "sight": {
              "enabled": false,
              "range": 0,
              "angle": 360,
              "visionMode": "basic",
              "color": null,
              "attenuation": 0.1,
              "brightness": 0,
              "saturation": 0,
              "contrast": 0
          },
          "detectionModes": [],
          "occludable": {
              "radius": 0
          },
          "ring": {
              "enabled": false,
              "colors": {
                  "ring": null,
                  "background": null
              },
              "effects": 1,
              "subject": {
                  "scale": 1,
                  "texture": null
              }
          },
          "flags": {},
          "randomImg": false
      },
      "items": [
          {
              "type": "haunt",
              "name": "New haunt",
              "system": {
                  "description": "",
                  "active": true,
                  "resistances": {
                      "QFkXOjQZpM2NeoAQ": {
                          "die_size": "d4",
                          "resistance": "blood"
                      }
                  },
                  "upgradeTrack": 3
              },
              "_id": "UFzL0G1Bn12AKHB2",
              "img": "systems/heart/assets/prayer.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745434855348,
                  "modifiedTime": 1745434870517,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          },
          {
              "type": "resource",
              "name": "New resource",
              "system": {
                  "die_size": "d8",
                  "description": "",
                  "children": {},
                  "active": true,
                  "complete": false,
                  "domain": "cursed"
              },
              "_id": "x3N4qRAwcj2m7f6n",
              "img": "systems/heart/assets/ore.svg",
              "effects": [],
              "folder": null,
              "sort": 0,
              "ownership": {
                  "default": 0,
                  "eiLQkDvSTMaHbeeE": 3
              },
              "flags": {},
              "_stats": {
                  "compendiumSource": null,
                  "duplicateSource": null,
                  "coreVersion": "12.331",
                  "systemId": "heart",
                  "systemVersion": "0.9.4",
                  "createdTime": 1745434884590,
                  "modifiedTime": 1745434890244,
                  "lastModifiedBy": "eiLQkDvSTMaHbeeE"
              }
          }
      ],
      "effects": [],
      "folder": null,
      "sort": 0,
      "ownership": {
          "default": 0,
          "eiLQkDvSTMaHbeeE": 3
      },
      "flags": {},
      "_stats": {
          "compendiumSource": null,
          "duplicateSource": null,
          "coreVersion": "12.331",
          "systemId": "heart",
          "systemVersion": "0.9.4",
          "createdTime": 1745434824042,
          "modifiedTime": 1745434926780,
          "lastModifiedBy": "eiLQkDvSTMaHbeeE"
      }
  }
];

legacy_actors.map(actor => {
  const migrated_actor = migrateLegacyActor(actor);
  sanityCheck(migrated_actor);
});