/**
 * Bonds with fake documents (src/bonds/bonds.js and flow.js, 2026-10-02):
 * who may add one, the three-bond limit (refused, never replaced), the kind
 * following the bonded actor, hiring a companion (the pack copy, its book
 * Fallouts switched off, the legacy ability, ownership), the drop path
 * (grantBond), transfers and the GM's Fallout check, setting and clearing a
 * bond's Stress, and the preCreateItem rules.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/bonds/dialogs.js", () => ({
  hireDialog: vi.fn(),
  visitDialog: vi.fn(),
  healDialog: vi.fn(),
  bondActionDialog: vi.fn(),
}));

import {
  addBond,
  hire,
  removeBond,
  transferStress,
  setBondStress,
  clearBondStress,
  rollBondFallout,
  bondState,
  abilityItemFrom,
  registerBondHooks,
  BOND_IMG,
} from "../src/bonds/bonds.js";
import { grantBond } from "../src/bonds/flow.js";
import { hireDialog } from "../src/bonds/dialogs.js";
import { bondFalloutResult, trackStress } from "../src/bonds/rules.js";
import { resetWorld, fakeActor, fakeItem, fakeUser, setUsers, queueDice, seeded, FakeChatMessage, unescaped } from "./helpers.mjs";

const RES = ["blood", "mind", "echo", "fortune", "supplies"];
const tracks = (values = {}) => Object.fromEntries(RES.map((r) => [r, { value: values[r] ?? 0, protection: 0, max: 10 }]));

const gm = fakeUser({ id: "gm", isGM: true });
const p1 = fakeUser({ id: "p1" });
const p2 = fakeUser({ id: "p2" });

const asGM = () => setUsers([gm, p1, p2], { self: gm });
const asPlayer = (u = p1) => setUsers([gm, p1, p2], { self: u });

function character(id = "vess", { owners = ["p1"], resistances = {} } = {}) {
  return fakeActor({ id, name: id[0].toUpperCase() + id.slice(1), owners, system: { resistances: tracks(resistances) } });
}

function hireling(id = "rex", { owners = [], resistances = {}, pack = null, items = [], system = {} } = {}) {
  return fakeActor({ id, name: id[0].toUpperCase() + id.slice(1), type: "hireling", owners, pack, items, system: { resistances: tracks(resistances), ...system } });
}

function bond(parent, { id, name = "Mara", target = "", kind = "person", stress = 0, max = 10 } = {}) {
  return fakeItem({ id, name, type: "bond", parent, system: { kind, target, stress: { value: stress, max }, notes: "" } });
}

const warned = () => ui.notifications.warn.mock.calls.map((c) => c[0]);

beforeEach(() => {
  resetWorld();
  asGM();
  game.heart = { resistances: RES };
  globalThis.Actor = { create: vi.fn(async (data) => fakeActor({ ...data, id: "copy" })), updateDocuments: vi.fn() };
});

describe("addBond", () => {
  it("is the GM's call", async () => {
    const vess = character();
    asPlayer();
    expect(await addBond({ characterId: "vess", name: "Mara" })).toBeNull();
    expect(warned()).toEqual(["heart.bond.gm-only-add"]);
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("only for a character, and only to an actor that exists", async () => {
    hireling("rex");
    expect(await addBond({ characterId: "rex" })).toBeNull();
    character();
    expect(await addBond({ characterId: "vess", targetUuid: "Actor.gone" })).toBeNull();
    expect(warned()).toEqual(["heart.bond.not-a-character", "heart.bond.no-target"]);
  });

  it("a person bond with no actor: the default name and portrait", async () => {
    const vess = character();
    const b = await addBond({ characterId: "vess" });
    expect(b).toMatchObject({ name: "heart.bond.default-name", type: "bond", img: BOND_IMG });
    expect(b.system).toEqual({ kind: "person", target: "", notes: "" });
    expect(vess.items.get(b.id)).toBe(b);
  });

  it("the kind follows the bonded actor, and takes its name and portrait", async () => {
    character();
    const ash = character("ash", { owners: [] });
    const rex = hireling("rex");
    const person = await addBond({ characterId: "vess", targetUuid: ash.uuid });
    const companion = await addBond({ characterId: "vess", targetUuid: rex.uuid, notes: "good dog" });
    expect(person).toMatchObject({ name: "Ash", img: ash.img, system: { kind: "person", target: "Actor.ash" } });
    expect(companion).toMatchObject({ name: "Rex", system: { kind: "companion", target: "Actor.rex", notes: "good dog" } });
    expect(bondState(companion)).toMatchObject({ kind: "companion", companion: true, missing: false, max: 50 });
  });

  it("refuses the same actor twice", async () => {
    const vess = character();
    const ash = character("ash", { owners: [] });
    bond(vess, { name: "Ash", target: ash.uuid });
    expect(await addBond({ characterId: "vess", targetUuid: ash.uuid })).toBeNull();
    expect(warned()).toEqual(["heart.bond.refused.already{name=Vess,bond=Ash}"]);
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("refuses a fourth bond (no replacing)", async () => {
    const vess = character();
    for (const name of ["A", "B", "C"]) bond(vess, { name });
    expect(await addBond({ characterId: "vess", name: "D" })).toBeNull();
    expect(warned()).toEqual(["heart.bond.refused.full{name=Vess,bond=D}"]);
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(vess.items.filter((i) => i.type === "bond").map((b) => b.name)).toEqual(["A", "B", "C"]);
  });
});

describe("hire", () => {
  function packHireling() {
    return hireling("cook", {
      pack: "fvtt-heart-content.companions",
      system: { ability: { name: "Hearty Stew", description: "<p>Heals</p>" } },
      items: [
        { name: "Burnt", type: "fallout", system: { active: true, type: "minor" } },
        { name: "Knife", type: "equipment", system: {} },
      ],
    });
  }

  it("is the GM's call, and needs a companion actor", async () => {
    character();
    const ash = character("ash");
    asPlayer();
    expect(await hire({ characterId: "vess", hirelingUuid: "Actor.rex" })).toBeNull();
    asGM();
    expect(await hire({ characterId: "vess", hirelingUuid: ash.uuid })).toBeNull();
    expect(warned()).toEqual(["heart.bond.gm-only-add", "heart.bond.needs-hireling"]);
  });

  it("a full list is refused before anything is copied", async () => {
    const vess = character();
    for (const name of ["A", "B", "C"]) bond(vess, { name });
    const cook = packHireling();
    expect(await hire({ characterId: "vess", hirelingUuid: cook.uuid })).toBeNull();
    expect(Actor.create).not.toHaveBeenCalled();
    expect(warned()).toEqual(["heart.bond.refused.full{name=Vess,bond=Cook}"]);
  });

  it("a pack companion becomes a fresh world copy: role kept, Fallouts off, the ability an item", async () => {
    character();
    const cook = packHireling();
    const result = await hire({ characterId: "vess", hirelingUuid: cook.uuid, runBy: "gm", name: "Bertha" });
    const data = Actor.create.mock.calls[0][0];
    expect(data._id).toBeUndefined();
    expect(data.folder).toBeUndefined();
    expect(data.name).toBe("Bertha");
    expect(data.flags.heart.role).toBe("Cook");
    expect(data.items.map((i) => [i.type, i.name])).toEqual([
      ["ability", "Hearty Stew"],
      ["fallout", "Burnt"],
      ["equipment", "Knife"],
    ]);
    expect(data.items.find((i) => i.type === "fallout").system.active).toBe(false);
    expect(data.items[0].system).toMatchObject({ description: "<p>Heals</p>", active: true, type: "core" });
    // the bond links the copy, never the pack entry
    expect(result.hireling.id).toBe("copy");
    expect(result.bond.system).toMatchObject({ kind: "companion", target: "Actor.copy" });
    // run by the GM: nobody else is made an owner
    expect(result.hireling.update).not.toHaveBeenCalled();
  });

  it("an ability item already there wins over the legacy field", () => {
    expect(abilityItemFrom(undefined)).toBeNull();
    expect(abilityItemFrom({ description: "no name" })).toBeNull();
    expect(abilityItemFrom({ name: "Sniff" })).toMatchObject({ name: "Sniff", type: "ability", system: { description: "" } });
  });

  it("when the bond still fails, the copy is deleted again", async () => {
    const vess = character();
    // a preCreateItem refusal: Foundry creates nothing and answers []
    vess.createEmbeddedDocuments.mockResolvedValueOnce([]);
    const cook = packHireling();
    expect(await hire({ characterId: "vess", hirelingUuid: cook.uuid })).toBeNull();
    const copy = await Actor.create.mock.results[0].value;
    expect(copy.delete).toHaveBeenCalledTimes(1);
  });

  it("a world companion is linked, not copied, and kept if the bond fails", async () => {
    const vess = character();
    const rex = hireling("rex");
    vess.createEmbeddedDocuments.mockResolvedValueOnce([]);
    expect(await hire({ characterId: "vess", hirelingUuid: rex.uuid })).toBeNull();
    expect(Actor.create).not.toHaveBeenCalled();
    expect(rex.delete).not.toHaveBeenCalled();
  });

  it("run by the player: the character's players own the companion", async () => {
    character("vess", { owners: ["p1"] });
    const rex = hireling("rex");
    const result = await hire({ characterId: "vess", hirelingUuid: rex.uuid });
    expect(result.bond.system.target).toBe("Actor.rex");
    expect(rex.update).toHaveBeenCalledWith({ ownership: { p1: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
  });
});

describe("grantBond: a GM's drop", () => {
  it("only the GM; never a character with itself", async () => {
    const vess = character();
    const ash = character("ash");
    asPlayer();
    expect(await grantBond(vess, ash)).toBeNull();
    expect(warned()).toEqual(["heart.bond.gm-only-add"]);
    asGM();
    expect(await grantBond(vess, vess)).toBeNull();
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("refused when already bonded, or full, before any dialog", async () => {
    const vess = character();
    const rex = hireling("rex");
    bond(vess, { name: "Rex", target: rex.uuid, kind: "companion" });
    expect(await grantBond(vess, rex)).toBeNull();
    bond(vess, { name: "B" });
    bond(vess, { name: "C" });
    const wolf = hireling("wolf");
    expect(await grantBond(vess, wolf)).toBeNull();
    expect(hireDialog).not.toHaveBeenCalled();
    expect(warned()).toEqual(["heart.bond.refused.already{name=Vess,bond=Rex}", "heart.bond.refused.full{name=Vess,bond=Wolf}"]);
  });

  it("a companion goes through the hire dialog; closing it adds nothing", async () => {
    const vess = character();
    const rex = hireling("rex");
    hireDialog.mockResolvedValueOnce(null);
    expect(await grantBond(vess, rex)).toBeNull();
    expect(vess.createEmbeddedDocuments).not.toHaveBeenCalled();
    hireDialog.mockResolvedValueOnce({ runBy: "gm", name: "" });
    const b = await grantBond(vess, rex);
    expect(hireDialog).toHaveBeenCalledWith(vess, rex);
    expect(b.system).toMatchObject({ kind: "companion", target: rex.uuid });
    // run by the GM: no ownership handed out
    expect(rex.update).not.toHaveBeenCalled();
  });

  it("any other actor becomes a person bond, with no dialog", async () => {
    const vess = character();
    const ash = character("ash", { owners: [] });
    const b = await grantBond(vess, ash);
    expect(hireDialog).not.toHaveBeenCalled();
    expect(b).toMatchObject({ name: "Ash", system: { kind: "person", target: ash.uuid } });
  });
});

describe("removeBond", () => {
  it("the character's player may end a bond; another player may not", async () => {
    const vess = character();
    const b = bond(vess);
    asPlayer(p2);
    expect(await removeBond({ characterId: "vess", bondId: b.id })).toBeNull();
    expect(warned()).toEqual(["heart.bond.not-owner{name=Vess}"]);
    asPlayer(p1);
    expect(await removeBond({ characterId: "vess", bondId: b.id })).toBe(true);
    expect(b.delete).toHaveBeenCalled();
    expect(vess.items.has(b.id)).toBe(false);
  });

  it("refuses an item that is not a bond", async () => {
    const vess = character();
    const sword = fakeItem({ name: "Sword", type: "equipment", parent: vess });
    expect(await removeBond({ characterId: "vess", bondId: sword.id })).toBeNull();
    expect(warned()).toEqual(["heart.bond.not-a-bond"]);
    expect(sword.delete).not.toHaveBeenCalled();
  });
});

describe("transferStress: leaning on a person bond", () => {
  it("moves the roll, capped at what is marked, then the GM's check", async () => {
    const vess = character("vess", { resistances: { mind: 4 } });
    const b = bond(vess, { stress: 2 });
    queueDice(7, 3); // the d8 transfer, then the d12 check
    const result = await transferStress({ characterId: "vess", bondId: b.id, resistance: "mind" });
    expect(result.moved).toBe(4);
    expect(vess.system.resistances.mind.value).toBe(0);
    expect(b.system.stress.value).toBe(6);
    // d12 3 against the pool's 6: Minor, and the picker targets the bond
    expect(result.check).toMatchObject({ result: "minor-fallout", severity: "minor", total: 6, companion: false, pickTarget: b.uuid });
    const msg = FakeChatMessage.create.mock.calls[0][0];
    expect(unescaped(msg.content)).toContain("heart.bond.card.capped{rolled=7,available=4}");
    expect(unescaped(msg.content)).toContain("heart.bond.card.pool{from=2,to=6,max=10}");
    expect(msg.content).toContain('data-action="pick-fallout"');
    expect(msg.rolls).toHaveLength(2);
  });

  it("a fixed amount replaces the roll; no fallout, no picker", async () => {
    const vess = character("vess", { resistances: { blood: 5 } });
    const b = bond(vess);
    queueDice(12);
    const result = await transferStress({ characterId: "vess", bondId: b.id, resistance: "blood", amount: "2" });
    expect(result.moved).toBe(2);
    expect(vess.system.resistances.blood.value).toBe(3);
    expect(result.check.result).toBe("no-fallout");
    const msg = FakeChatMessage.create.mock.calls[0][0];
    expect(msg.content).not.toContain("pick-fallout");
    expect(msg.content).not.toContain("capped");
    expect(msg.rolls).toHaveLength(1);
  });

  it("the pool stops at its max", async () => {
    const vess = character("vess", { resistances: { echo: 8 } });
    const b = bond(vess, { stress: 7 });
    queueDice(12);
    await transferStress({ characterId: "vess", bondId: b.id, resistance: "echo", amount: 8 });
    expect(b.system.stress.value).toBe(10);
    expect(vess.system.resistances.echo.value).toBe(0);
  });

  it("a companion takes none of your Stress; nor does a made-up resistance", async () => {
    const vess = character("vess", { resistances: { mind: 4 } });
    const rex = hireling("rex");
    const companion = bond(vess, { name: "Rex", target: rex.uuid, kind: "companion" });
    const person = bond(vess);
    expect(await transferStress({ characterId: "vess", bondId: companion.id })).toBeNull();
    expect(await transferStress({ characterId: "vess", bondId: person.id, resistance: "heart" })).toBeNull();
    expect(warned()).toEqual(["heart.bond.companion-no-transfer{name=Rex}", "heart.bond.bad-resistance"]);
    expect(vess.update).not.toHaveBeenCalled();
  });

  it("another player cannot lean on your bond", async () => {
    const vess = character("vess", { resistances: { mind: 4 } });
    const b = bond(vess);
    asPlayer(p2);
    expect(await transferStress({ characterId: "vess", bondId: b.id })).toBeNull();
    expect(vess.update).not.toHaveBeenCalled();
  });
});

describe("the GM's Fallout check (seeded rolls)", () => {
  it("reads the bond's total like a delver's, and targets the bond or the companion", async () => {
    const rng = seeded(1002);
    const vess = character();
    const rex = hireling("rex");
    const person = bond(vess);
    const companion = bond(vess, { name: "Rex", target: rex.uuid, kind: "companion" });
    for (let i = 0; i < 200; i++) {
      const d12 = rng.int(1, 12);
      if (i % 2) {
        person.system.stress.value = rng.int(0, 10);
        queueDice(d12);
        const check = await rollBondFallout({ characterId: "vess", bondId: person.id });
        expect(check.result).toBe(bondFalloutResult(d12, person.system.stress.value));
        expect(check.pickTarget).toBe(person.uuid);
      } else {
        for (const r of RES) rex.system.resistances[r].value = rng.int(0, 3);
        queueDice(d12);
        const check = await rollBondFallout({ characterId: "vess", bondId: companion.id });
        expect(check.total).toBe(trackStress(rex.system.resistances));
        expect(check.result).toBe(bondFalloutResult(d12, check.total));
        expect(check.pickTarget).toBe(rex.uuid);
        // never Critical
        expect(check.result).not.toBe("critical-fallout");
      }
    }
  });

  it("the card offers the picker only on a Minor or Major", async () => {
    const vess = character();
    const b = bond(vess, { stress: 9 });
    queueDice(8);
    expect((await rollBondFallout({ characterId: "vess", bondId: b.id })).severity).toBe("major");
    queueDice(10);
    expect((await rollBondFallout({ characterId: "vess", bondId: b.id })).severity).toBe("");
    const [major, none] = FakeChatMessage.create.mock.calls.map((c) => c[0].content);
    expect(major).toContain('data-severity="major"');
    expect(none).not.toContain("pick-fallout");
  });
});

describe("setBondStress and clearBondStress", () => {
  it("sets a pool within 0 and its max", async () => {
    const vess = character();
    const b = bond(vess, { max: 8 });
    await setBondStress({ characterId: "vess", bondId: b.id, value: 5.7 });
    expect(b.system.stress.value).toBe(5);
    await setBondStress({ characterId: "vess", bondId: b.id, value: 99 });
    expect(b.system.stress.value).toBe(8);
    await setBondStress({ characterId: "vess", bondId: b.id, value: -3 });
    expect(b.system.stress.value).toBe(0);
  });

  it("clears a person's pool, or a companion's tracks (one, or all five)", async () => {
    const vess = character();
    const rex = hireling("rex", { resistances: { blood: 2, mind: 3, echo: 1 } });
    const person = bond(vess, { stress: 6 });
    const companion = bond(vess, { name: "Rex", target: rex.uuid, kind: "companion" });
    await clearBondStress({ characterId: "vess", bondId: person.id });
    expect(person.system.stress.value).toBe(0);
    await clearBondStress({ characterId: "vess", bondId: companion.id, resistance: "mind" });
    expect(rex.update).toHaveBeenLastCalledWith({ "system.resistances.mind.value": 0 });
    expect(rex.system.resistances.blood.value).toBe(2);
    await clearBondStress({ characterId: "vess", bondId: companion.id });
    expect(trackStress(rex.system.resistances)).toBe(0);
  });

  it("a player clears a companion's tracks only if they own the companion", async () => {
    const vess = character();
    const rex = hireling("rex", { resistances: { blood: 2 } });
    const companion = bond(vess, { name: "Rex", target: rex.uuid, kind: "companion" });
    asPlayer(p1);
    expect(await clearBondStress({ characterId: "vess", bondId: companion.id })).toBeNull();
    expect(warned()).toEqual(["heart.bond.not-owner{name=Rex}"]);
    rex.owners.push("p1");
    expect(await clearBondStress({ characterId: "vess", bondId: companion.id })).toBe(companion);
  });

  it("a companion whose actor is gone: nothing to clear", async () => {
    const vess = character();
    const companion = bond(vess, { name: "Rex", target: "Actor.gone", kind: "companion" });
    expect(bondState(companion).missing).toBe(true);
    expect(await clearBondStress({ characterId: "vess", bondId: companion.id })).toBeNull();
  });
});

describe("the preCreateItem rules", () => {
  let hooks;
  beforeEach(() => {
    hooks = globalThis.Hooks;
    registerBondHooks();
  });
  const create = (item, userId = game.user.id) => hooks.call("preCreateItem", item, {}, {}, userId);

  it("three bonds at most on a character", () => {
    const vess = character();
    bond(vess, { name: "A" });
    bond(vess, { name: "B" });
    expect(create({ type: "bond", name: "C", parent: vess })).toBe(true);
    bond(vess, { name: "C" });
    expect(create({ type: "bond", name: "D", parent: vess })).toBe(false);
    expect(warned()).toEqual(["heart.bond.refused.full{name=Vess,bond=D}"]);
  });

  it("characters only; a world bond item is fine; other items pass", () => {
    const rex = hireling("rex");
    expect(create({ type: "bond", name: "B", parent: rex })).toBe(false);
    expect(warned()).toEqual(["heart.bond.characters-only"]);
    expect(create({ type: "bond", name: "B", parent: null })).toBe(true);
    const vess = character();
    for (const n of ["A", "B", "C"]) bond(vess, { name: n });
    expect(create({ type: "equipment", name: "Rope", parent: vess })).toBe(true);
  });

  it("another user's refused create warns only on their own client", () => {
    const vess = character();
    for (const n of ["A", "B", "C"]) bond(vess, { name: n });
    expect(create({ type: "bond", name: "D", parent: vess }, "someone-else")).toBe(false);
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });
});
