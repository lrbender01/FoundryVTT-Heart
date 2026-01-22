import { Level } from "level";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { open, mkdir } from "node:fs/promises";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "crypto";
import { get } from "https";
import { parse } from "yaml";
import yauzl from 'yauzl';
import { Mutex } from 'async-mutex';

let en_lang = {};

await new Promise((resolve, reject) => {
  const mutex = new Mutex();
  get("https://github.com/hitcherland/FoundryVtt-Heart/releases/download/0.9.4/heart.zip", (res) => {
    res.on("data", (d) => console.log("d", d));
    res.on("end", () => {
      get(res.headers.location, (res2) => {
        let b = new Uint8Array();
        res2.on('data', async (d) => {
          const release = await mutex.acquire();
          b = Buffer.concat([b, d])
          if (res2.complete) {
            yauzl.fromBuffer(b, {}, function(err, zipfile) {
              if (err) reject(err);
              const output = {};
              zipfile.on('entry', async function(entry) {
                if (entry.fileName === "lang/en.json") {
                  zipfile.openReadStream(entry, async function (err, readStream) {
                    const buff = [];
                    readStream.on("data", (d) => {
                      buff.push(d);
                    });
                    readStream.on("end", () => {
                      en_lang = JSON.parse(Buffer.concat(buff));
                      writeFileSync("/tmp/heart/en.json", Buffer.concat(buff));
                    });
                  })
                }
                if (!entry.fileName.match(/^packs\//)) return;
                if (entry.fileName.match(/\/$/)) {
                  await mkdir("/tmp/heart/" + entry.fileName, {recursive: true});
                  return;
                }
                zipfile.openReadStream(entry, async function(err, readStream) {
                  if (err) reject(err);
                  const fh = await open("/tmp/heart/" + entry.fileName, "w");
                  readStream.pipe(fh.createWriteStream());
                });
              });
              zipfile.once('end', function() {
                resolve();
              });
            })
          }
          release();
        });
        res2.on("error", reject);
      });
    });
    res.on("error", reject);
  });
});

async function getDB(type) {
  const dbPath = `/tmp/heart/packs/${type}`;
  return new Level(dbPath);
}

function getUUID(data) {
  return `Compendium.heart.heart.${data._id}`;
}

const folders = {
  'ability': {
    name: "Abilities",
    type: "Item",
    _id: "5P3mjIvR29OhyR6l",
    _key: "!folders!5P3mjIvR29OhyR6l"
  },
  'beat': {
    name: "Beats",
    type: "Item",
    _id: "Df2JpffsuYJROfXg",
    _key: "!folders!Df2JpffsuYJROfXg"
  },
  'calling': {
    name: "Callings",
    type: "Item",
    _id: "CN0la67ziHUrLPD2",
    _key: "!folders!CN0la67ziHUrLPD2"
  },
  'class': {
    name: "Classes",
    type: "Item",
    _id: "yIJ6SF31RMT5vNhz",
    _key: "!folders!yIJ6SF31RMT5vNhz"
  },
  'equipment': {
    name: "Equipment",
    type: "Item",
    _id: "35vReQEOJAJ1v9PN",
    _key: "!folders!35vReQEOJAJ1v9PN"
  },
  'fallout': {
    name: "Fallouts",
    type: "Item",
    _id: "l7pxZoNF1qlTw2gA",
    _key: "!folders!l7pxZoNF1qlTw2gA"
  },
  'resource': {
    name: "Resources",
    type: "Item",
    _id: "bDiHYHlOFLzWySfV",
    _key: "!folders!bDiHYHlOFLzWySfV"
  },
  'tag': {
    name: "Tags",
    type: "Item",
    _id: "y9uqxYDCoKXQtyQI",
    _key: "!folders!y9uqxYDCoKXQtyQI"
  }
};

function translate(key) {
  let value;
  if (key.match(/thrice_warded\.description/)) {
    value = en_lang[`heart.${key.replace("minor.thrice", "minorthrice")}`];

  } else {
    value = en_lang[`heart.${key}`];
  }
  if (value === undefined) {
    console.warn(`Unexpectedly couldn't translate ${key}`);
  }
  return value ?? key;
}

function saveToFile(data) {
  const flat_name = data.name
    .replaceAll(/[^a-zA-Z_]/g, "_")
    .replaceAll(/_+/g, "_")
    .replace(/_$/, "")
    .toLowerCase();
  const filename = `${flat_name}_${data._id}.json`;
  const path = `packs/heart/_source/${filename}`;
  const contents = JSON.stringify(data, undefined, 4);
  writeFileSync(path, contents);
}

const tags = {};
async function generateTags() {
  const db = await getDB("tags");
  for await (let [key, value_str] of db.iterator()) {
    const value = JSON.parse(value_str);
    value.name = translate(value.name);
    value.system.description = translate(value.system.description);
    value._key = key;
    value.folder = folders.tag._id;
    tags[value.name] = value;
    value.img = 'systems/heart/assets/tag.png';
    saveToFile(value);
  }
}

async function generateFallouts() {
  const db = await getDB("fallouts");
  for await (let [key, value_str] of db.iterator()) {
    const value = JSON.parse(value_str);
    value.name = translate(value.name);
    value.img = 'systems/heart/assets/fallout.png';
    value.system.description = translate(value.system.description);
    value._key = key;
    value.folder = folders.fallout._id;
    saveToFile(value);
  }
}

function convertAbility(value) {
  value.name = translate(value.name);
  value.system.description = translate(value.system.description);
  value._key = `!items!${value._id}`;
  value.img = 'systems/heart/assets/ability.png';
  value.folder = folders.ability._id;

  const minorAbilityUUIDs = [];
  for (let child of Object.values(value.system.children ?? {})) {
    if (child.type !== "ability") {
      throw "Unexpectedly found a non-ability child of an ability";
    }

    const newChild = convertAbility(child);
    minorAbilityUUIDs.push(getUUID(newChild));
  }
  value.system.minorAbilities = minorAbilityUUIDs;

  delete value.system.active;
  delete value.system.children;

  saveToFile(value);
  return value;
}

async function convertBeat(value) {
  value.name = translate(value.name);
  value.system.description = translate(value.system.description);
  if( value._id === 'c3bg60lh7c80tj5n') {
    value._id = 'c3bg60lh7c80tj5m';
  }
  value._key = `!items!${value._id}`;
  value.img = 'systems/heart/assets/beat.png';
  value.folder = folders.beat._id;
  saveToFile(value);
  return value;
}

async function convertResource(value) {
  value.name = translate(value.name);
  // value.system.description = translate(value.system.description);
  value._key = `!items!${value._id}`;
  value.img = 'systems/heart/assets/resource.png';
  value.folder = folders.resource._id;

  value.system.dieSize = value.system.die_size;
  delete value.system.die_size;

  const tagUUIDs = [];
  for (let child of Object.values(value.system.children)) {
    if (child.type !== "tag") {
      throw `Unexpected non-tag child in equipment ${value.name}`;
    }

    const name = translate(child.name);
    tagUUIDs.push(getUUID(tags[name]));
  }

  delete value.system.children;
  value.system.tags = tagUUIDs;

  saveToFile(value);
  return value;
}

async function convertEquipment(value) {
  value.name = translate(value.name);
  value._key = `!items!${value._id}`;
  value.img = "systems/heart/assets/equipment.png";
  value.folder = folders.equipment._id;

  value.system.dieSize = value.system.die_size;
  delete value.system.die_size;

  const tagUUIDs = [];
  for (let child of Object.values(value.system.children)) {
    if (child.type !== "tag") {
      throw `Unexpected non-tag child in equipment ${value.name}`;
    }

    const name = translate(child.name);
    tagUUIDs.push(getUUID(tags[name]));
  }
  value.system.tags = tagUUIDs;
  delete value.system.children;
  delete value.system.group;

  saveToFile(value);
  return value;
}

const conversions = {
  ability: convertAbility,
  beat: convertBeat,
  resource: convertResource,
  equipment: convertEquipment,
};

async function generateCallings() {
  const db = await getDB("callings");
  for await (let [key, value_str] of db.iterator()) {
    const value = JSON.parse(value_str)
    value.name = translate(value.name);
    value.img = 'systems/heart/assets/calling.png';
    value.folder = folders.calling._id;
    value.system.description = translate(value.system.description);

    const questions = [];
    for (let question of Object.values(value.system.questions)) {
      questions.push({
        question: translate(question.question),
      });
    }
    value.system.questions = questions;

    const beats = [];
    for (let child of Object.values(value.system.children)) {
      const converter = conversions[child.type];
      if (converter === undefined) {
        console.warn(child);
        throw `Unable to convert type ${child.type}`;
      }

      const newChild = await converter(child);
      if (newChild.type === "ability") {
        if (newChild.system.type === "core") {
          value.system.ability = getUUID(newChild);
        } else {
          throw "We have no core abilityies in callings?";
        }
      } else if (newChild.type === "beat") {
        beats.push(getUUID(newChild));
      }
    }
    delete value.system.children;
    value.system.beats = beats;

    value._key = key;
    saveToFile(value);
  }
}

async function generateClasses() {
  const db = await getDB("classes");
  for await (let [key, value_str] of db.iterator()) {
    const value = JSON.parse(value_str)
    value.name = translate(value.name);
    value.img = 'systems/heart/assets/class.png';
    value.folder = folders.class._id;
    value.system.description = translate(value.system.description);

    let skillID = createHash("md5")
      .update(`${value.name}.${value.system.core_skill}`)
      .digest("hex")
      .substring(0, 16);
    let domainID = createHash("md5")
      .update(`${value.name}.${value.system.core_domain}`)
      .digest("hex")
      .substring(0, 16);
    value.effects = [
      {
        _key: `!items.effects!${value._id}.${skillID}`,
        _id: skillID,
        name: `The ${value.system.core_skill.toUpperCase()} skill`,
        description: `The ${value.name} class provides a +1 to the ${value.system.core_skill.toUpperCase()} skill as part of the core traits.`,
        changes: [
          {
            key: `system.skills.${value.system.core_skill}.value`,
            value: 1,
            mode: 2,
          },
        ],
      },
      {
        _key: `!items.effects!${value._id}.${domainID}`,
        _id: domainID,
        name: `The ${value.system.core_domain.toUpperCase()} domain`,
        description: `The ${value.name} class provides a +1 to the ${value.system.core_domain.toUpperCase()} domain as part of the core traits.`,
        changes: [
          {
            key: `system.domains.${value.system.core_domain}.value`,
            value: 1,
            mode: 2,
          },
        ],
      },
    ];

    const equipmentGroups = {};
    const abilities = [];
    const futureAbilities = [];
    const resources = [];
    const equipment = [];
    for (let child of Object.values(value.system.children)) {
      const converter = conversions[child.type];
      if (converter === undefined) {
        console.warn(child);
        throw `Unable to convert type "${child.type}"`;
      }
      const group = child.system.group;

      const newChild = await converter(child);

      if (newChild.type === "equipment") {
        if (child.system.group === "core") {
          equipment.push(getUUID(newChild));
        } else {
          equipmentGroups[group] ??= [];
          equipmentGroups[group].push(getUUID(newChild));
        }
      } else if (newChild.type === "ability") {
        if (newChild.system.type === "core") {
          abilities.push(getUUID(newChild));
        } else {
          futureAbilities.push(getUUID(newChild));
        }
      } else if (newChild.type === "resource") {
        resources.push(getUUID(newChild));
      } else {
        console.warn("not sure how I deal with", newChild);
      }
    }
    value.system.abilities = abilities;
    value.system.futureAbilities = futureAbilities;
    value.system.resources = resources;
    value.system.equipment = equipment;
    delete equipmentGroups.core;
    value.system.equipmentGroups = Object.values(equipmentGroups);

    delete value.system.core_domain;
    delete value.system.core_skill;
    delete value.system.children;
    delete value.system.equipment_groups;

    value._key = key;
    saveToFile(value);
  }
}

await saveToFile(folders.ability);
await saveToFile(folders.beat);
await saveToFile(folders.calling);
await saveToFile(folders.class);
await saveToFile(folders.equipment);
await saveToFile(folders.fallout);
await saveToFile(folders.resource);
await saveToFile(folders.tag);

await generateTags();
await generateFallouts();
await generateCallings();
await generateClasses();

await compilePack("packs/heart/_source", "packs/heart");
