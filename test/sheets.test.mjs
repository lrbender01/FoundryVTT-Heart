/**
 * Sheet logic with fake documents (2026-10-02): the data the character,
 * party, and item sheets hand their templates (warnings, inactive items,
 * bonds rows, Provisions, members, quartermaster options, payers,
 * companions) and their drop rules (refusals with the warning, the owner
 * check, the same-parent skip, generic items stacking, the party actor and
 * other actors dropped on a character). Rendering and listeners are not
 * tested: they need Foundry's DOM.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import CharacterSheet from "../src/actors/character/sheet.js";
import PartySheet from "../src/actors/party/sheet.js";
import HeartActorSheet from "../src/actors/base/sheet.js";
import HeartItemSheet from "../src/items/base/sheet.js";
import characterProxies from "../src/actors/character/proxy.js";
import partyProxies from "../src/actors/party/proxy.js";
import { resetWorld, fakeActor, fakeItem, fakeUser, setUsers, FakeChatMessage } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];
const ITEM_TYPES = ["ability", "ancestry", "beat", "bond", "calling", "class", "equipment", "fallout", "haunt", "item", "resource", "tag"];
const tracks = (values = {}) => Object.fromEntries(RES.map((r) => [r, { value: values[r] ?? 0, protection: 0 }]));

const gm = fakeUser({ id: "gm", isGM: true });
const p1 = fakeUser({ id: "p1" });
const p2 = fakeUser({ id: "p2" });
const asGM = () => setUsers([gm, p1, p2], { self: gm });
const asPlayer = (u = p1) => setUsers([gm, p1, p2], { self: u });
const warned = () => ui.notifications.warn.mock.calls.map((c) => c[0]);

function character(id, { owners = [], system = {}, flags = {} } = {}) {
  return fakeActor({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    owners,
    flags,
    system: { resistances: tracks(), skills: {}, domains: {}, ...system },
    proxy: characterProxies.character,
  });
}

function party({ members = [], quartermaster = "", value = 0 } = {}) {
  const p = fakeActor({
    id: "party",
    name: "The Party",
    type: "party",
    owners: ["p1", "p2"],
    system: { provisions: { value, max: 20 }, quartermaster, members },
    proxy: partyProxies.party,
  });
  game.heart.party = p;
  return p;
}

beforeEach(() => {
  resetWorld();
  asPlayer(p1);
  globalThis.window = { innerHeight: 900 };
  globalThis.localizeHeart = (s) => s;
  CONFIG.Item = { typeLabels: Object.fromEntries(ITEM_TYPES.map((t) => [t, `TYPES.Item.${t}`])) };
  game.settings.store.set("heart.showCharacterArt", false);
  game.settings.store.set("heart.showTotalStress", true);
  game.heart = {
    resistances: RES,
    fallout_resistances: [...RES, "provisions", "bond"],
    die_sizes: ["d4", "d6"],
    skills: ["kill", "hunt"],
    domains: ["occult"],
    equipment_types: ["weapon"],
    beat_levels: ["minor"],
    fallout_levels: ["minor", "major"],
  };
});

describe("the character sheet's data", () => {
  // Vess: a Cleaver with an equipment choice not made yet, a Heartsong with
  // one beat pursued, some switched-off gear, a generic item, and a fallout
  function vess() {
    const v = character("vess", {
      owners: ["p1"],
      flags: { heart: { skillOrder: ["hunt"] } },
      system: {
        pronouns: "she/her",
        skills: { kill: { value: true, knack: "Knives" }, hunt: { value: true }, sneak: { value: false } },
        domains: { occult: { value: true } },
      },
    });
    fakeItem({
      id: "cls",
      name: "Cleaver",
      type: "class",
      parent: v,
      system: { active: true, equipment_groups: ["core", "group_1", "group_2"], active_equipment_groups: ["core"] },
      children: [
        { id: "eq-core", name: "Cleaver", type: "equipment", system: { active: false, group: "core" } },
        { id: "eq-opt", name: "Spear", type: "equipment", system: { active: false, group: "group_1" } },
        { id: "res", name: "Blood", type: "resource", system: { active: false } },
        { id: "ab", name: "Feast", type: "ability", system: { active: true } },
      ],
    });
    fakeItem({
      id: "call",
      name: "Heartsong",
      type: "calling",
      parent: v,
      children: [
        { id: "beat1", name: "Sing", type: "beat", system: { active: true, complete: false } },
        { id: "beat2", name: "Hum", type: "beat", system: { active: false } },
      ],
    });
    fakeItem({ id: "loose", name: "Old knife", type: "equipment", parent: v, system: { active: false } });
    fakeItem({ id: "coin", name: "Coin", type: "item", parent: v, system: { quantity: 2 } });
    fakeItem({ id: "f1", name: "Bleeding", type: "fallout", parent: v, system: { complete: false } });
    return v;
  }

  it("warns about each missing piece, in its own place", () => {
    const data = new CharacterSheet(vess()).getData();
    expect(data.warnings).toEqual({
      ancestry: "heart.warn.no-ancestry{}",
      class: "heart.warn.equipment{}",
      calling: "",
      equipment: "heart.warn.equipment{}",
      beats: "heart.warn.beats{count=1}",
    });
    expect(data.classNeedsEquipment).toBe(true);
  });

  it("lists switched-off gear, including the class's own, but not unpicked choices", () => {
    const data = new CharacterSheet(vess()).getData();
    expect(data.inactiveItems.map((i) => i.id)).toEqual(["loose", "eq-core", "res"]);
    expect(data.orderedItems.map((i) => i.id)).toEqual(["coin"]);
    expect(data.orderedFallouts.map((i) => i.id)).toEqual(["f1"]);
    expect(data.orderedBeats.map((i) => i.id)).toEqual(["beat1"]);
  });

  it("skills and domains in the player's order, with their knacks", () => {
    const data = new CharacterSheet(vess()).getData();
    expect(data.skillList).toEqual([
      { name: "hunt", knack: "" },
      { name: "kill", knack: "Knives" },
    ]);
    expect([data.skillCount, data.domainCount]).toEqual([2, 1]);
    expect(data.pronouns).toBe("she/her");
    expect(data.showTotalStress).toBe(true);
    expect(data.artBand).toBeUndefined();
  });

  it("no party: no Provisions and no Party section", () => {
    const data = new CharacterSheet(vess()).getData();
    expect(data.provisions).toBeNull();
    expect(data.partyName).toBeUndefined();
    expect(data.warnings.party).toBeUndefined();
  });

  it("in a party with no quartermaster: Provisions, the other members, and the volunteer offer", () => {
    const v = vess();
    character("kettle", { owners: ["p2"] });
    party({ members: ["vess", "kettle"], value: 3 });
    const data = new CharacterSheet(v).getData();
    expect(data.provisions).toMatchObject({ value: 3, max: 20 });
    expect(data.partyName).toBe("The Party");
    expect(data.inParty).toBe(true);
    expect(data.partyMembers.map((m) => m.id)).toEqual(["kettle"]);
    expect(data.partyQm).toBe("heart.party-sheet.qm-none-line{}");
    expect(data.canVolunteer).toBe(true);
    expect(data.canResign).toBe(false);
    expect(data.warnings.party).toBe("heart.warn.no-quartermaster");
    // the GM picks from the party sheet instead
    asGM();
    expect(new CharacterSheet(v).getData().canVolunteer).toBe(false);
  });

  it("outside the party, and as quartermaster", () => {
    const v = vess();
    const p = party({ members: [], quartermaster: "vess" });
    let data = new CharacterSheet(v).getData();
    expect(data.inParty).toBe(false);
    expect(data.warnings.party).toBe("heart.warn.party");
    p.system.members = ["vess"];
    data = new CharacterSheet(v).getData();
    expect(data.isQuartermaster).toBe(true);
    expect(data.canResign).toBe(true);
    expect(data.partyQm).toBe("heart.party-sheet.qm-line{name=Vess}");
    expect(data.warnings.party).toBe("");
  });

  it("one row per bond, reading the bonded actor live", () => {
    const v = vess();
    const rex = fakeActor({ id: "rex", name: "Rex", type: "hireling", owners: ["p1"], system: { resistances: tracks({ mind: 2 }) } });
    fakeItem({ id: "b1", name: "Old name", type: "bond", parent: v, system: { kind: "companion", target: rex.uuid, stress: { value: 0 } } });
    fakeItem({ id: "b2", name: "Mara", type: "bond", parent: v, system: { kind: "person", target: "", stress: { value: 4, max: 10 } } });
    const data = new CharacterSheet(v).getData();
    expect(data.bonds.map((b) => [b.id, b.name])).toEqual([
      ["b1", "Rex"],
      ["b2", "Mara"],
    ]);
  });
});

describe("drops on a character sheet", () => {
  let vess;
  let sheet;
  beforeEach(() => {
    vess = character("vess", { owners: ["p1"] });
    fakeItem({ id: "coin", name: "Coin", type: "item", parent: vess, system: { quantity: 2 } });
    fakeItem({ id: "rope", name: "Rope", type: "equipment", parent: vess, system: { active: true } });
    sheet = new CharacterSheet(vess);
  });

  it("a second generic item stacks; any other duplicate is skipped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sheet._onDropItemCreate({ name: "Coin", type: "item", system: { quantity: 3 } })).toBe(vess.items.get("coin"));
    expect(vess.items.get("coin").system.quantity).toBe(5);
    expect(await sheet._onDropItemCreate({ name: "Rope", type: "equipment", system: {} })).toBeUndefined();
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a new item lands active (a generic item has no such flag)", async () => {
    await sheet._onDropItemCreate({ name: "Lamp", type: "equipment", system: {} });
    await sheet._onDropItemCreate({ name: "Bead", type: "item", system: {} });
    const created = vess.createEmbeddedDocuments.mock.calls.map((c) => c[1][0]);
    expect(created[0].system.active).toBe(true);
    expect(created[1].system.active).toBeUndefined();
  });

  it("skips malformed data and a class's or calling's own pieces", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sheet._onDropItemCreate({ name: "No system", type: "equipment" })).toBeUndefined();
    expect(await sheet._onDropItemCreate({ name: "class.cleaver.feast", type: "ability", system: {} })).toBeUndefined();
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it("a new class replaces the old one", async () => {
    const old = fakeItem({ id: "old", name: "Witch", type: "class", parent: vess, system: { active: true } });
    await sheet._onDropItemCreate({ name: "Cleaver", type: "class", system: {} });
    expect(old.delete).toHaveBeenCalled();
    expect(vess.createEmbeddedDocuments.mock.calls[0][1][0]).toMatchObject({ name: "Cleaver", system: { active: true } });
  });

  describe("an actor dropped on it", () => {
    beforeEach(() => {
      globalThis.Actor = { implementation: { fromDropData: async (data) => game.actors.get(data.id) } };
    });

    it("the party: the GM adds the member; a player is refused", async () => {
      const p = party({ members: ["kettle"] });
      expect(await sheet._onDropActor({}, { id: "party" })).toBe(false);
      expect(warned()).toEqual(["heart.party.gm-only-settings"]);
      asGM();
      await sheet._onDropActor({}, { id: "party" });
      expect(p.system.members).toEqual(["kettle", "vess"]);
      await sheet._onDropActor({}, { id: "party" });
      expect(p.update).toHaveBeenCalledTimes(1);
    });

    it("another actor: the GM's drop makes a bond, a player's asks the GM", async () => {
      const ash = character("ash");
      const card = await sheet._onDropActor({}, { id: "ash" });
      expect(card.flags.heart.bondRequest).toEqual({ characterId: "vess", actorUuid: ash.uuid });
      expect(card.whisper.sort()).toEqual(["gm", "p1"]);
      expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
      asGM();
      const bond = await sheet._onDropActor({}, { id: "ash" });
      expect(bond).toMatchObject({ type: "bond", name: "Ash", system: { target: ash.uuid } });
      // the character itself is never its own bond
      expect(await sheet._onDropActor({}, { id: "vess" })).toBe(false);
      expect(FakeChatMessage.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe("the base actor sheet refuses only clear mistakes", () => {
  it("a class on an adversary is refused with a warning; the rest lands", async () => {
    const rat = fakeActor({ id: "rat", name: "Rat", type: "adversary" });
    const sheet = new HeartActorSheet(rat);
    await sheet._onDropItemCreate([
      { name: "Witch", type: "class" },
      { name: "Rope", type: "equipment" },
    ]);
    expect(warned()).toEqual(["heart.drop.refused-actor.character-only{item=Witch,actor=Rat}"]);
    expect(rat.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Rope", type: "equipment" }]);
  });

  it("everything refused: nothing created", async () => {
    const rat = fakeActor({ id: "rat", name: "Rat", type: "adversary" });
    expect(await new HeartActorSheet(rat)._onDropItemCreate({ name: "Sharp", type: "tag" })).toEqual([]);
    expect(rat.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(warned()).toEqual(["heart.drop.refused-actor.tag{item=Sharp,actor=Rat}"]);
  });

  it("groups the actor's items by type for the template", () => {
    const rat = fakeActor({ id: "rat", type: "adversary", items: [{ name: "Bite", type: "ability", system: {} }] });
    const data = new HeartActorSheet(rat).getData();
    expect(data.heart.ability.map((i) => i.name)).toEqual(["Bite"]);
    expect(data.heart.tag).toEqual([]);
  });
});

describe("the party sheet's data", () => {
  function world({ quartermaster = "" } = {}) {
    const vess = character("vess", { owners: ["p1"] });
    character("kettle", { owners: ["p2"] });
    character("ash", { owners: ["p2"] });
    const rex = fakeActor({ id: "rex", name: "Rex", type: "hireling", flags: { heart: { role: "Hound" } }, system: { resistances: tracks() } });
    fakeItem({ id: "b1", name: "Rex", type: "bond", parent: vess, system: { kind: "companion", target: rex.uuid } });
    const p = party({ members: ["vess", "kettle", "gone"], quartermaster });
    fakeItem({ id: "f1", name: "Empty", type: "fallout", parent: p, system: {} });
    fakeItem({ id: "tent", name: "Tent", type: "item", parent: p, system: {} });
    fakeItem({ id: "lamp", name: "Lamp", type: "equipment", parent: p, system: {} });
    return p;
  }

  // (getData is async since 2026-10-02: it reads the party art first)
  it("members in name order: who may remove, volunteer, or resign", async () => {
    const data = await new PartySheet(world()).getData();
    expect(data.members.map((m) => [m.id, m.removable, m.volunteer, m.resign])).toEqual([
      ["kettle", false, false, false],
      ["vess", true, true, false],
    ]);
    expect(data.qmWarning).toBe("heart.warn.no-quartermaster");
  });

  it("the quartermaster picker keeps a quartermaster who left the party", async () => {
    const data = await new PartySheet(world({ quartermaster: "ash" })).getData();
    expect(data.qmOptions).toEqual([
      { id: "ash", name: "Ash", selected: true },
      { id: "kettle", name: "Kettle", selected: false },
      { id: "vess", name: "Vess", selected: false },
    ]);
    expect(data.qmWarning).toBe("");
  });

  it("restock payers: the members this user owns; every member for the GM", async () => {
    const p = world();
    expect((await new PartySheet(p).getData()).payerOptions.map((o) => o.id)).toEqual(["vess"]);
    asGM();
    expect((await new PartySheet(p).getData()).payerOptions.map((o) => o.id)).toEqual(["kettle", "vess"]);
  });

  it("companions, fallouts, and the shared gear", async () => {
    const data = await new PartySheet(world()).getData();
    expect(data.companions.map((c) => c.name)).toEqual(["Rex"]);
    expect(data.fallouts.map((f) => f.id)).toEqual(["f1"]);
    expect(data.partyItems.map((i) => i.id)).toEqual(["lamp", "tent"]);
    expect(data.provisions.max).toBe(20);
  });

  it("drops: Fallouts and gear only", async () => {
    const p = world();
    const sheet = new PartySheet(p);
    expect(await sheet._onDropItemCreate({ name: "Feast", type: "ability" })).toEqual([]);
    expect(warned()).toEqual(["heart.party-sheet.only-fallout"]);
    await sheet._onDropItemCreate([
      { name: "Starving", type: "fallout" },
      { name: "Sharp", type: "tag" },
    ]);
    expect(p.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Starving", type: "fallout" }]);
  });

  it("only the GM adds members, and only characters", async () => {
    const p = world();
    const sheet = new PartySheet(p);
    await sheet._addMembers([game.actors.get("ash")]);
    asGM();
    await sheet._addMembers([game.actors.get("rex")]);
    expect(warned()).toEqual(["heart.party.gm-only-settings", "heart.party-sheet.only-characters"]);
    await sheet._addMembers([game.actors.get("ash"), game.actors.get("vess")]);
    // the stale id is dropped, nobody is listed twice
    expect(p.system.members).toEqual(["vess", "kettle", "ash"]);
  });
});

describe("drops on an item sheet", () => {
  let vess;
  let cls;
  let sheet;
  beforeEach(() => {
    vess = character("vess", { owners: ["p1"] });
    cls = fakeItem({ id: "cls", name: "Cleaver", type: "class", parent: vess, system: {} });
    cls.addChildren = vi.fn(async (list) => list);
    sheet = new HeartItemSheet(cls);
    globalThis.Item = { implementation: { fromDropData: vi.fn(async (data) => fromUuid(data.uuid)) }, updateDocuments: vi.fn() };
  });

  it("takes the child types it shows, copied in", async () => {
    const kettle = character("kettle", { owners: ["p1"] });
    const feast = fakeItem({ id: "feast", name: "Feast", type: "ability", parent: kettle, system: { active: true } });
    await sheet._onDropItem({}, { type: "Item", uuid: feast.uuid });
    expect(cls.addChildren).toHaveBeenCalledWith([{ ...feast.toObject(), documentName: "Item" }]);
    expect(sheet._canDragDropItem(feast)).toBe(true);
  });

  it("refuses any other type, with the warning", async () => {
    const sharp = fakeItem({ id: "sharp", name: "Sharp", type: "tag", parent: vess, system: {} });
    expect(await sheet._onDropItem({}, { type: "Item", uuid: sharp.uuid })).toBe(false);
    expect(warned()).toEqual(["heart.drop.refused-child{child=TYPES.Item.tag,parent=TYPES.Item.class}"]);
    expect(cls.addChildren).not.toHaveBeenCalled();
  });

  it("only its owner may drop onto it", async () => {
    asPlayer(p2);
    const feast = fakeItem({ id: "feast", type: "ability", system: {} });
    expect(await sheet._onDropItem({}, { type: "Item", uuid: feast.uuid })).toBe(false);
    expect(Item.implementation.fromDropData).not.toHaveBeenCalled();
  });

  it("skips itself, a world or compendium item, and a child dragged back onto its own parent", async () => {
    expect(await sheet._onDropItem({}, { type: "Item", uuid: cls.uuid })).toBe(false);
    const loose = fakeItem({ id: "loose", name: "Loose", type: "ability", system: {} });
    expect(await sheet._onDropItem({}, { type: "Item", uuid: loose.uuid })).toBeUndefined();
    const own = fakeItem({ id: "own", name: "Own", type: "ability", parent: vess, system: {} });
    expect(await sheet._onDropItem({}, { type: "Item", uuid: own.uuid, parentItemId: "cls" })).toBeUndefined();
    expect(cls.addChildren).not.toHaveBeenCalled();
  });

  it("_onDrop: bad data, a hook's veto, or not an item drops nothing", async () => {
    const drop = (text) => sheet._onDrop({ dataTransfer: { getData: () => text } });
    expect(await drop("not json")).toBe(false);
    Hooks.on("dropItemSheetData", () => false);
    expect(await drop(JSON.stringify({ type: "Item", uuid: "x" }))).toBeUndefined();
    Hooks.registry.clear();
    expect(await drop(JSON.stringify({ type: "Actor", uuid: "Actor.vess" }))).toBeUndefined();
    expect(Item.implementation.fromDropData).not.toHaveBeenCalled();
  });

  it("getData: the parent's name, the option maps, no art without the content module", () => {
    const lamp = fakeItem({ id: "lamp", name: "Lamp", type: "equipment", parent: vess, system: {} });
    const data = new HeartItemSheet(lamp).getData();
    expect(data.parentName).toBe("Vess");
    expect(Object.keys(data.fallout_resistances)).toEqual([...RES, "provisions", "bond"]);
    expect(data.die_sizes).toEqual({ d4: "heart.die_size.d(N){N=4}", d6: "heart.die_size.d(N){N=6}" });
    expect(data.art).toBeNull();
    expect(data.editable).toBe(true);
    asPlayer(p2);
    expect(new HeartItemSheet(lamp).getData().editable).toBe(false);
  });
});
