// Fakes and utilities shared by the rules tests (2026-09-30, Luke). Actors and
// items are plain objects in the shape the rules read; nothing here needs
// Foundry. The document fakes at the end of the file (2026-10-02) stand in
// for Foundry's documents, collections, rolls, and chat messages.

import { vi } from "vitest";

/**
 * A character (or other actor) with the skills, domains, and fallouts given.
 * skills / domains: a list of slugs the character has, or an object of
 * { slug: { value, knack } }.
 */
export function makeActor({
  id = "vess",
  name = "Vess",
  type = "character",
  skills = [],
  domains = [],
  fallouts = [],
  items = [],
} = {}) {
  const traits = (t) =>
    Array.isArray(t) ? Object.fromEntries(t.map((s) => [s, { value: true }])) : t;
  return {
    id,
    name,
    type,
    system: { skills: traits(skills), domains: traits(domains) },
    items: [...fallouts.map((f) => makeFallout(f)), ...items],
  };
}

/** A fallout item: a name, or { name, complete } */
export function makeFallout(f) {
  const { name, complete = false } = typeof f === "string" ? { name: f } : f;
  return { type: "fallout", name, system: { complete } };
}

/** Register actors in game.actors (the setup clears it before each test) */
export function addActors(...actors) {
  for (const a of actors) game.actors.set(a.id, a);
  return actors;
}

/** The highlighted texts in emphasizeTerms output, in order (a phrase's
 * per-word tooltip spans removed) */
export function highlights(html) {
  return [...String(html).matchAll(/<strong class="heart-term[^"]*"[^>]*>(.*?)<\/strong>/g)].map(
    (m) => m[1].replace(/<[^>]+>/g, ""),
  );
}

/** Each highlight's tooltips: [text, key] for a phrase with one tooltip,
 * [text, [[word, key], ...]] for one whose words carry their own, [text, null]
 * for none */
export function termTooltips(html) {
  return [...String(html).matchAll(/<strong class="heart-term[^"]*"( data-tooltip="([^"]+)")?>(.*?)<\/strong>/g)].map(
    (m) => {
      const text = m[3].replace(/<[^>]+>/g, "");
      if (m[2]) return [text, m[2]];
      const parts = [...m[3].matchAll(/<span class="heart-term-part" data-tooltip="([^"]+)">(.*?)<\/span>/g)];
      return [text, parts.length ? parts.map((p) => [p[2], p[1]]) : null];
    },
  );
}

/** The ability references (heart-ability-ref) in emphasizeTerms output */
export function abilityRefs(html) {
  return [
    ...String(html).matchAll(/<strong class="[^"]*\bheart-ability-ref\b[^"]*"[^>]*>(.*?)<\/strong>/g),
  ].map((m) => m[1]);
}

/** The text with every tag removed (highlighting must never change it) */
export function plainText(html) {
  return String(html).replace(/<[^>]+>/g, "");
}

/** A small seeded PRNG (mulberry32), so the randomized checks are repeatable */
export function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** an integer in [min, max] */
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  /** one element of a list */
  next.pick = (list) => list[Math.floor(next() * list.length)];
  return next;
}

/**
 * Foundry v12's DiceTerm._keepOrDrop, as PoolTerm's dh / kh modifiers run it
 * on a pool's results: sorts the ACTIVE results, discards those past the cut
 * value, then discards ties in index order until the count is reached.
 */
function keepOrDrop(results, number, { keep = true, highest = true } = {}) {
  const ascending = keep === highest;
  const values = results
    .filter((r) => r.active)
    .map((r) => r.result)
    .sort((a, b) => (ascending ? a - b : b - a));
  number = Math.min(Math.max(keep ? values.length - number : number, 0), values.length);
  const cut = values[number];
  let discarded = 0;
  const ties = [];
  for (const r of results) {
    if (!r.active) continue;
    const discard = ascending ? r.result < cut : r.result > cut;
    if (discard) {
      r.active = false;
      r.discarded = true;
      discarded++;
    } else if (r.result === cut) ties.push(r);
  }
  for (const r of ties) {
    if (discarded < number) {
      r.active = false;
      r.discarded = true;
      discarded++;
    }
  }
  return discarded;
}

/**
 * Evaluate a pool formula's modifiers the way Foundry does for
 * `{1d10, ...}dh<cut>kh`: drop the `cut` highest, keep the highest left.
 * values: the dice as rolled. Returns the pool's results with active flags.
 */
export function evaluatePool(values, cut) {
  const results = values.map((result) => ({ result, active: true }));
  if (cut) keepOrDrop(results, cut, { keep: false, highest: true });
  keepOrDrop(results, 1, { keep: true, highest: true });
  return results;
}

// ================================================================ Foundry fakes
// (2026-10-02) Documents, collections, users, chat messages, and rolls in the
// shape the document-touching modules read them. Class stand-ins that a
// module extends when it loads (Roll, ChatMessage, the sheets) are installed
// by test/setup.mjs (installFoundryClasses); the per-test world (actors,
// users, messages, settings, hooks, uuids) is rebuilt by resetWorld().

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Set a dotted path on an object, creating objects on the way */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  let at = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isPlain(at[k])) at[k] = {};
    at = at[k];
  }
  at[keys.at(-1)] = value;
}

function mergeInto(target, value) {
  for (const [k, v] of Object.entries(value)) {
    if (isPlain(v) && isPlain(target[k])) mergeInto(target[k], v);
    else target[k] = clone(v);
  }
}

/** A document update as Foundry applies it: dotted keys, objects merged */
export function applyChanges(doc, changes = {}) {
  for (const [k, v] of Object.entries(changes)) {
    if (k.includes(".")) {
      const parent = k.split(".").slice(0, -1).join(".");
      const last = k.split(".").at(-1);
      const existing = foundry.utils.getProperty(doc, parent);
      if (isPlain(existing) && isPlain(v) && isPlain(existing[last])) mergeInto(existing[last], v);
      else setPath(doc, k, clone(v));
    } else if (isPlain(v) && isPlain(doc[k])) mergeInto(doc[k], v);
    else doc[k] = clone(v);
  }
  return doc;
}

/** Foundry's Collection: a Map that iterates its values, with array helpers */
export class FakeCollection extends Map {
  constructor(docs = []) {
    super();
    for (const d of docs) this.set(d.id, d);
  }
  [Symbol.iterator]() {
    return this.values();
  }
  get contents() {
    return [...this.values()];
  }
  find(fn) {
    return this.contents.find(fn);
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  map(fn) {
    return this.contents.map(fn);
  }
  some(fn) {
    return this.contents.some(fn);
  }
  every(fn) {
    return this.contents.every(fn);
  }
  reduce(fn, init) {
    return this.contents.reduce(fn, init);
  }
}

// every fake document by uuid, for fromUuid / fromUuidSync
const DOCS = new Map();
let nextId = 0;
const newId = (prefix) => `${prefix}${++nextId}`;

/** The user objects game.users holds */
export function fakeUser({ id, isGM = false, name, character } = {}) {
  const user = {
    id,
    name: name ?? id,
    isGM,
    isSelf: false,
    character,
    flags: {},
    getFlag(scope, key) {
      return foundry.utils.getProperty(user.flags[scope] ?? {}, key);
    },
    setFlag: vi.fn(async (scope, key, value) => {
      setPath(user.flags, `${scope}.${key}`, clone(value));
      return user;
    }),
  };
  return user;
}

/** game.users = these users; game.user = self; activeGM: a GM user or null */
export function setUsers(users, { self = users[0], activeGM = null } = {}) {
  for (const u of users) u.isSelf = u === self;
  game.users = new FakeCollection(users);
  game.users.activeGM = activeGM;
  game.user = self;
  return users;
}

/**
 * An actor: dotted-path update, an items collection, itemTypes, embedded
 * create / delete / update, testUserPermission from `owners` (user ids; a GM
 * always passes), isOwner for the current game.user, and a uuid. Registered
 * in game.actors unless it lives in a pack.
 */
export function fakeActor({
  id,
  name,
  type = "character",
  system = {},
  items = [],
  owners = [],
  img,
  flags = {},
  pack = null,
  proxy,
} = {}) {
  id ??= newId("actor");
  const actor = {
    id,
    _id: id,
    name: name ?? id,
    type,
    img: img ?? `icons/${type}.svg`,
    documentName: "Actor",
    pack,
    uuid: pack ? `Compendium.${pack}.Actor.${id}` : `Actor.${id}`,
    flags: clone(flags),
    system: clone(system),
    ownership: { default: 0 },
    owners: [...owners],
    items: new FakeCollection(),
    sheet: { rendered: false, render: vi.fn() },
    testUserPermission(user) {
      return Boolean(user?.isGM || actor.owners.includes(user?.id));
    },
    get isOwner() {
      return actor.testUserPermission(game.user);
    },
    get itemTypes() {
      const out = {};
      for (const i of actor.items) (out[i.type] ??= []).push(i);
      return out;
    },
    getFlag(scope, key) {
      return foundry.utils.getProperty(actor.flags[scope] ?? {}, key);
    },
    update: vi.fn(async (changes) => applyChanges(actor, changes)),
    delete: vi.fn(async () => {
      game.actors?.delete(id);
      DOCS.delete(actor.uuid);
      return actor;
    }),
    createEmbeddedDocuments: vi.fn(async (_type, data) => data.map((d) => fakeItem({ ...d, parent: actor }))),
    deleteEmbeddedDocuments: vi.fn(async (_type, ids) =>
      ids.map((i) => {
        const item = actor.items.get(i);
        actor.items.delete(i);
        return item;
      }),
    ),
    updateEmbeddedDocuments: vi.fn(async (_type, updates) =>
      updates.map(({ _id, ...rest }) => applyChanges(actor.items.get(_id), rest)),
    ),
    toObject() {
      return clone({
        _id: id,
        name: actor.name,
        type,
        img: actor.img,
        folder: "folder1",
        flags: actor.flags,
        system: actor.system,
        items: actor.items.map((i) => i.toObject()),
      });
    },
  };
  for (const i of items) fakeItem({ ...i, parent: actor });
  if (proxy) actor.proxy = proxy(actor);
  if (!pack) game.actors?.set(id, actor);
  DOCS.set(actor.uuid, actor);
  return actor;
}

/**
 * An item, embedded in `parent` when given (added to its items), with
 * dotted-path update, delete, nested `children` (a bond's Fallout entries, a
 * class's abilities), and a uuid.
 */
export function fakeItem({ id, _id, name = "Item", type = "item", system = {}, parent = null, img, flags = {}, children = [] } = {}) {
  id ??= _id ?? newId("item");
  const item = {
    id,
    _id: id,
    name,
    type,
    img: img ?? `icons/${type}.svg`,
    documentName: "Item",
    parent,
    uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`,
    flags: clone(flags),
    system: clone(system),
    children: new FakeCollection(),
    sheet: { rendered: false, render: vi.fn() },
    get isOwner() {
      return item.parent ? item.parent.isOwner : Boolean(game.user?.isGM);
    },
    // the actor it is on, through any parent items (Foundry's Item#actor)
    get actor() {
      const p = item.parent;
      return p?.documentName === "Actor" ? p : (p?.actor ?? null);
    },
    getFlag(scope, key) {
      return foundry.utils.getProperty(item.flags[scope] ?? {}, key);
    },
    update: vi.fn(async (changes) => applyChanges(item, changes)),
    delete: vi.fn(async () => {
      parent?.items?.delete(id);
      DOCS.delete(item.uuid);
      return item;
    }),
    toObject() {
      return clone({ _id: id, name: item.name, type, img: item.img, flags: item.flags, system: item.system });
    },
  };
  for (const c of children) {
    const child = fakeItem({ ...c });
    child.parent = item;
    item.children.set(child.id, child);
  }
  if (parent?.items) parent.items.set(id, item);
  DOCS.set(item.uuid, item);
  return item;
}

/** A chat message with heart flags, rolls, getFlag / setFlag, and update */
export class FakeChatMessage {
  constructor(data = {}) {
    this.id = data.id ?? data._id ?? newId("msg");
    this.flags = clone(data.flags ?? {});
    this.rolls = data.rolls ?? [];
    this.content = data.content ?? "";
    this.speaker = data.speaker ?? {};
    this.whisper = data.whisper ?? [];
    this.isOwner = data.isOwner ?? true;
    this.update = vi.fn(async (changes) => {
      for (const [k, v] of Object.entries(changes)) {
        if (k === "rolls") this.rolls = v;
        else setPath(this, k, clone(v));
      }
      return this;
    });
  }
  getFlag(scope, key) {
    return foundry.utils.getProperty(this.flags[scope] ?? {}, key);
  }
  async setFlag(scope, key, value) {
    setPath(this.flags, `${scope}.${key}`, clone(value));
    return this;
  }
  static create = vi.fn(async (data) => {
    const msg = new FakeChatMessage(data);
    game.messages?.set(msg.id, msg);
    return msg;
  });
  static getSpeaker({ actor } = {}) {
    return { actor: actor?.id ?? null, alias: actor?.name ?? "Gamemaster" };
  }
}

/** A chat message registered in game.messages */
export function fakeMessage(data = {}) {
  const msg = new FakeChatMessage(data);
  game.messages.set(msg.id, msg);
  return msg;
}

/**
 * Foundry's Roll, as far as the system reads it: a formula, options,
 * evaluate() (dice from FakeRoll.queue in order, else the die's middle
 * face), total, dice (faces, results, flavor), terms[0].results for a
 * `{...}dh<n>kh` pool, toJSON / fromData (the class found by name in
 * CONFIG.Dice.rolls), and toMessage (through ChatMessage.create).
 */
export class FakeRoll {
  static queue = [];

  constructor(formula = "0", data = {}, options = {}) {
    this._formula = String(formula);
    this.data = data;
    this.options = options;
    this._evaluated = false;
    this._total = undefined;
    this.terms = [];
    this.dice = [];
  }

  get formula() {
    return this._formula;
  }

  get total() {
    return this._total;
  }

  get result() {
    return this._evaluated ? String(this._total) : undefined;
  }

  static draw(faces) {
    return FakeRoll.queue.length ? FakeRoll.queue.shift() : Math.ceil(faces / 2);
  }

  async evaluate() {
    if (this._evaluated) return this;
    const formula = this._formula.trim();
    const pool = formula.match(/^\{(.*)\}(?:dh(\d+))?kh$/);
    if (pool) {
      const dice = pool[1].split(",").map((part) => {
        const m = part.trim().match(/^(\d*)d(\d+)(?:\[([^\]]*)\])?$/);
        return { faces: Number(m[2]), flavor: m[3] ?? "" };
      });
      const values = dice.map((d) => FakeRoll.draw(d.faces));
      const results = evaluatePool(values, Number(pool[2]) || 0);
      this.dice = dice.map((d, i) => ({ ...d, results: [results[i]], total: values[i] }));
      this.terms = [{ results }];
      this._total = Math.max(0, ...results.filter((r) => r.active).map((r) => r.result));
    } else {
      const expr = formula.replace(/(\d*)d(\d+)(?:\[([^\]]*)\])?/g, (_, n, faces, flavor) => {
        const results = [];
        for (let i = 0; i < (Number(n) || 1); i++) results.push({ result: FakeRoll.draw(Number(faces)), active: true });
        const sum = results.reduce((s, r) => s + r.result, 0);
        this.dice.push({ faces: Number(faces), flavor: flavor ?? "", results, total: sum });
        return String(sum);
      });
      // what is left is arithmetic: digits, operators, and pool braces
      this._total = Function(`"use strict"; return (${expr.replace(/[{}]/g, "")});`)();
    }
    this._evaluated = true;
    return this;
  }

  toJSON() {
    return {
      class: this.constructor.name,
      formula: this._formula,
      options: clone(this.options),
      total: this._total,
      evaluated: this._evaluated,
      dice: clone(this.dice),
      terms: clone(this.terms),
    };
  }

  static fromData(json) {
    const cls = globalThis.CONFIG?.Dice?.rolls?.find((c) => c.name === json.class) ?? this;
    const roll = new cls(json.formula, {}, clone(json.options ?? {}));
    roll._total = json.total;
    roll._evaluated = Boolean(json.evaluated);
    roll.dice = clone(json.dice ?? []);
    roll.terms = clone(json.terms ?? []);
    return roll;
  }

  async toMessage(messageData = {}) {
    if (!this._evaluated) await this.evaluate();
    return ChatMessage.create({ ...messageData, rolls: [this] });
  }

  async render() {
    return "";
  }
}

/** The dice the next evaluate() calls roll, in order */
export function queueDice(...values) {
  FakeRoll.queue.push(...values);
}

/** Hooks that record their callbacks, so a test can run them */
export function fakeHooks() {
  const registry = new Map();
  const add = (name, fn) => {
    if (!registry.has(name)) registry.set(name, []);
    registry.get(name).push(fn);
    return registry.get(name).length;
  };
  return {
    registry,
    on: vi.fn(add),
    once: vi.fn(add),
    off: vi.fn(),
    /** every callback registered for `name` */
    callbacks: (name) => registry.get(name) ?? [],
    /** Foundry's Hooks.call: stops at, and returns false for, a callback answering false */
    call(name, ...args) {
      for (const fn of registry.get(name) ?? []) if (fn(...args) === false) return false;
      return true;
    },
    callAll(name, ...args) {
      for (const fn of registry.get(name) ?? []) fn(...args);
      return true;
    },
  };
}

/** game.settings with a backing store ("scope.key" -> value) */
export function fakeSettings(values = {}) {
  const store = new Map(Object.entries(values));
  return {
    store,
    get: vi.fn((scope, key) => store.get(`${scope}.${key}`)),
    set: vi.fn(async (scope, key, value) => {
      store.set(`${scope}.${key}`, value);
      return value;
    }),
    register: vi.fn(),
  };
}

/** A minimal Foundry Application / DocumentSheet for sheets to extend */
class FakeDocumentSheet {
  constructor(object = {}, options = {}) {
    this.object = object;
    this.document = object;
    this.options = { ...this.constructor.defaultOptions, ...options };
    this.rendered = false;
    this.render = vi.fn(() => this);
  }
  static get defaultOptions() {
    return { classes: [], scrollY: [], tabs: [], dragDrop: [] };
  }
  get actor() {
    return this.object?.documentName === "Actor" ? this.object : this.object?.parent;
  }
  get item() {
    return this.object?.documentName === "Item" ? this.object : undefined;
  }
  get isEditable() {
    return Boolean(this.object?.isOwner);
  }
  get title() {
    return this.object?.name ?? "";
  }
  getData() {
    const doc = this.object;
    const data = {
      cssClass: this.isEditable ? "editable" : "locked",
      editable: this.isEditable,
      owner: doc?.isOwner,
      limited: false,
      options: this.options,
      document: doc,
      data: doc,
      system: doc?.system,
    };
    data[doc?.documentName === "Item" ? "item" : "actor"] = doc;
    data.items = (doc?.items ?? []).map?.((i) => i) ?? [];
    return data;
  }
  async _onDropItemCreate(itemData) {
    const list = Array.isArray(itemData) ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments("Item", list);
  }
  async _onDropItem() {
    return false;
  }
  async _onDropActor() {
    return false;
  }
  _restoreScrollPositions() {}
  _configureProseMirrorPlugins() {
    return {};
  }
  activateListeners() {}
}

/**
 * The Foundry classes and constants a module touches when it LOADS (it
 * extends Roll, ChatMessage, a sheet, or TextEditor, or builds a DragDrop):
 * set once by test/setup.mjs, before any test file imports src/. Only what
 * is missing is set, so a test file's own stand-ins win.
 */
export function installFoundryClasses() {
  const g = globalThis;
  g.Roll ??= FakeRoll;
  g.ChatMessage ??= FakeChatMessage;
  g.ActorSheet ??= class ActorSheet extends FakeDocumentSheet {};
  g.ItemSheet ??= class ItemSheet extends FakeDocumentSheet {};
  // the party note window (actors/party/note-window.js, 2026-10-02)
  g.FormApplication ??= class FormApplication extends FakeDocumentSheet {};
  g.Dialog ??= class Dialog {
    static opened = [];
    constructor(data = {}, options = {}) {
      this.data = data;
      this.options = options;
    }
    render() {
      Dialog.opened.push(this);
      return this;
    }
  };
  g.Application ??= class Application {
    constructor(options = {}) {
      this.options = options;
    }
    static get defaultOptions() {
      return { classes: [] };
    }
    render() {
      return this;
    }
  };
  g.DragDrop ??= class DragDrop {
    constructor(options = {}) {
      this.options = options;
    }
    bind() {}
  };
  g.TextEditor ??= class TextEditor {
    static async _createContentLink() {
      return null;
    }
    static async enrichHTML(html) {
      return html;
    }
  };
  // some modules register hooks as they load (the party sheet's redraws)
  g.Hooks ??= fakeHooks();
  g.Actor ??= { create: vi.fn(), updateDocuments: vi.fn() };
  g.Item ??= { create: vi.fn(), updateDocuments: vi.fn() };
  g.CONST ??= {
    DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
    DEFAULT_TOKEN: "icons/svg/mystery-man.svg",
  };
  g.CONFIG ??= { Dice: { rolls: [] }, ChatMessage: {}, sounds: {} };
  Object.assign(foundry.utils, {
    setProperty: foundry.utils.setProperty ?? ((obj, path, value) => setPath(obj, path, value)),
    hasProperty:
      foundry.utils.hasProperty ??
      ((obj, path) => {
        const keys = path.split(".");
        let at = obj;
        for (const k of keys) {
          if (at == null || typeof at !== "object" || !(k in at)) return false;
          at = at[k];
        }
        return true;
      }),
    randomID: foundry.utils.randomID ?? (() => Math.random().toString(36).slice(2, 18)),
    deepClone: foundry.utils.deepClone ?? clone,
    duplicate: foundry.utils.duplicate ?? clone,
  });
}

/**
 * A fresh world for one document test: collections for actors, items, and
 * messages; no users connected (so the relay runs locally); settings; hooks
 * that record; CONFIG; renderTemplate answering its data as JSON; fromUuid
 * over the fakes; an empty dice queue; and Roll / ChatMessage back to the
 * fakes (with ChatMessage.create's calls cleared).
 */
export function resetWorld() {
  DOCS.clear();
  nextId = 0;
  FakeRoll.queue.length = 0;
  game.actors = new FakeCollection();
  game.items = new FakeCollection();
  game.messages = new FakeCollection();
  game.settings = fakeSettings();
  game.users = new FakeCollection();
  game.users.activeGM = null;
  delete game.socket;
  game.user = fakeUser({ id: "gm", isGM: true });
  game.heart = {};
  const hooks = fakeHooks();
  globalThis.Hooks = hooks;
  globalThis.CONFIG = { Dice: { rolls: [] }, ChatMessage: {}, sounds: {} };
  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = FakeChatMessage;
  FakeChatMessage.create.mockClear();
  globalThis.renderTemplate = vi.fn(async (template, data) => JSON.stringify({ template, data }));
  globalThis.fromUuidSync = (uuid) => DOCS.get(uuid) ?? null;
  globalThis.fromUuid = async (uuid) => DOCS.get(uuid) ?? null;
  return { hooks };
}

/** What renderTemplate was given, from its JSON answer */
export const rendered = (json) => JSON.parse(json);

/** Card HTML with Handlebars' escapes undone, so a test can look for
 * "key{a=1}" in text the card escaped */
const UNESCAPES = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#x60": "`", "#x3D": "=" };
export const unescaped = (html) => String(html).replace(/&(amp|lt|gt|quot|#x27|#x60|#x3D);/g, (_, e) => UNESCAPES[e]);
