// The bond surfaces' display data (bonds/view.js, 2026-10-01, Luke's picks
// from the Heart Bonds Mock, pared down the same day): the compact rows on
// the character sheet and the party sheet's Companions. game.i18n returns
// keys (test/setup.mjs), so the assertions read which string was asked for.

import { describe, it, expect } from "vitest";
import {
  poolMarks,
  trackSummary,
  takenFallouts,
  bondActions,
  bondRowView,
  companionCards,
} from "../src/bonds/view.js";

const fallout = (id, type, { active = true, complete = false, description = "<p>They need you.</p>" } = {}) => ({
  id,
  uuid: `Actor.vess.Item.bond1.Item.${id}`,
  type: "fallout",
  name: `Fallout ${id}`,
  system: { type, active, complete, description, resistance: "bond" },
});
const track = (value) => ({ value, max: 10, protection: 0 });
// a companion actor (type hireling: hirelings and animals alike)
const companion = (o = {}) => ({
  uuid: "Actor.cook",
  type: "hireling",
  name: "Sweetest-Onion-Of-Summer",
  img: "cook.webp",
  flags: { heart: { role: "Cook" } },
  system: { resistances: { blood: track(2), mind: track(1), echo: track(0), fortune: track(0), supplies: track(0) } },
  items: [],
  ...o,
});
const bond = (o = {}) => ({
  id: "bond1",
  uuid: "Actor.vess.Item.bond1",
  type: "bond",
  name: "Auntie Moss",
  img: "moss.webp",
  ...o,
  system: { kind: "person", target: "", stress: { value: 4, max: 10 }, ...(o.system ?? {}) },
});
const actions = (list) => list.map((a) => a.action);

describe("poolMarks", () => {
  it("ten marks, filled up to the value", () => {
    expect(poolMarks(4)).toEqual([true, true, true, true, false, false, false, false, false, false]);
  });
  it("tolerates nothing and nonsense", () => {
    expect(poolMarks(undefined)).toHaveLength(10);
    expect(poolMarks(undefined).some(Boolean)).toBe(false);
    expect(poolMarks(3, 5)).toEqual([true, true, true, false, false]);
  });
});

describe("trackSummary", () => {
  it("only the tracks that carry Stress, in the book's order", () => {
    expect(trackSummary({ mind: track(1), blood: track(2), echo: track(0) })).toEqual([
      { key: "blood", value: 2 },
      { key: "mind", value: 1 },
    ]);
  });
  it("nothing when no track is marked", () => {
    expect(trackSummary({})).toEqual([]);
  });
});

describe("takenFallouts", () => {
  it("the Fallout a companion has taken: switched on and not resolved", () => {
    const items = [fallout("a", "minor"), fallout("b", "major", { active: false }), fallout("c", "minor", { complete: true }), { type: "equipment", system: { active: true } }];
    expect(takenFallouts(items).map((f) => f.id)).toEqual(["a"]);
  });
});

// Luke's "lean set" (2026-10-01): no greyed buttons, no Broken
describe("bondActions", () => {
  it("a person: Visit and Heal a Fallout; the GM's Fallout Check", () => {
    const { actions: player, gmActions } = bondActions({ kind: "person", name: "Auntie Moss" });
    expect(actions(player)).toEqual(["bond-visit", "bond-heal"]);
    expect(actions(gmActions)).toEqual(["bond-check"]);
    expect(player[1].tip).toBe("heart.bond.ui.heal-tip{name=Auntie Moss}");
  });
  it("a companion: Open and Bond Action; Stress and Fallout for whoever runs it", () => {
    expect(actions(bondActions({ kind: "companion", name: "Cook" }).actions)).toEqual(["open-companion", "bond-action"]);
    const { actions: runner, gmActions } = bondActions({ kind: "companion", name: "Cook", canRun: true });
    expect(actions(runner)).toEqual(["open-companion", "bond-action", "companion-stress", "companion-fallout"]);
    expect(gmActions).toEqual([]);
  });
  it("an older hireling or animal bond reads as a companion", () => {
    expect(actions(bondActions({ kind: "animal" }).actions)).toEqual(["open-companion", "bond-action"]);
  });
  it("a missing companion: Remove only", () => {
    const { actions: player, gmActions } = bondActions({ kind: "companion", missing: true });
    expect(actions(player)).toEqual(["remove-bond"]);
    expect(gmActions).toEqual([]);
  });
  it("no button is ever greyed", () => {
    for (const kind of ["person", "companion"]) {
      for (const a of [...bondActions({ kind, canRun: true }).actions, ...bondActions({ kind }).gmActions]) expect(a.action).toBeTruthy();
    }
  });
});

describe("bondRowView", () => {
  it("a person bond: its pool, open Fallout, and the bond sheet behind the name", () => {
    const row = bondRowView(bond(), { target: { uuid: "Actor.moss", type: "npc", name: "Auntie Moss", img: "moss-npc.webp" }, fallouts: [fallout("f1", "minor")] });
    expect(row).toMatchObject({
      kind: "person",
      kindLabel: "heart.bond.kind.person",
      kindTip: "heart.bond.ui.person-tip",
      companion: false,
      missing: false,
      openAction: "view-bond",
      targetUuid: "Actor.moss",
      pool: { value: 4, max: 10 },
    });
    expect(row.pool.marks.filter(Boolean)).toHaveLength(4);
    expect(row.fallouts).toEqual([{ id: "f1", uuid: "Actor.vess.Item.bond1.Item.f1", name: "Fallout f1", type: "minor", tip: "They need you." }]);
    expect(row.targetTip).toBe("heart.bond.ui.open-target{name=Auntie Moss}");
  });

  it("the bonded actor's name and portrait, read live", () => {
    const row = bondRowView(bond({ name: "Old name", img: "old.webp" }), { target: { uuid: "x", type: "npc", name: "Renamed", img: "new.webp" } });
    expect(row).toMatchObject({ name: "Renamed", img: "new.webp" });
    expect(bondRowView(bond({ img: "" }), { target: null })).toMatchObject({ name: "Auntie Moss", img: "" });
  });

  it("a bond's kind follows its actor: a companion actor makes it a companion bond", () => {
    const cook = companion({ items: [fallout("t", "major"), fallout("menu", "minor", { active: false })] });
    const row = bondRowView(bond({ system: { kind: "person", target: "Actor.cook" } }), { target: cook, companionItems: cook.items, canRun: true });
    expect(row).toMatchObject({ kind: "companion", companion: true, missing: false, openAction: "open-companion", total: 3, targetTip: "", name: "Sweetest-Onion-Of-Summer" });
    expect(row.summary.map((s) => [s.key, s.value])).toEqual([["blood", 2], ["mind", 1]]);
    expect(row.companionFallouts.map((f) => [f.id, f.type])).toEqual([["t", "major"]]);
    expect(row.fallouts).toEqual([]);
    expect(actions(row.actions)).toContain("companion-stress");
  });

  it("a companion whose actor was deleted is missing", () => {
    const row = bondRowView(bond({ system: { kind: "companion", target: "Actor.gone" } }), { target: null });
    expect(row.missing).toBe(true);
    expect(row.missingLine).toBe("heart.bond.ui.missing{name=Auntie Moss}");
    expect(actions(row.actions)).toEqual(["remove-bond"]);
  });

  it("a person with no actor is not missing, just a name", () => {
    expect(bondRowView(bond(), { target: null }).missing).toBe(false);
  });
});

describe("companionCards", () => {
  const member = (name, bonds) => ({ name, items: bonds });
  const cookBond = bond({ name: "Cook bond", system: { kind: "companion", target: "Actor.cook" } });
  const oxBond = bond({ name: "Ox bond", system: { kind: "companion", target: "Actor.ox" } });
  const ox = companion({ uuid: "Actor.ox", name: "Crimson Ox", img: "ox.webp", flags: { heart: { role: "Crimson Ox" } } });
  const targets = { "Actor.cook": companion(), "Actor.ox": ox, "Actor.npc": { uuid: "Actor.npc", type: "npc", name: "Madb" } };
  const targetOf = (b) => targets[b.system.target] ?? null;

  it("every companion once, alphabetical, with what the book calls them and Bond of", () => {
    const cards = companionCards([member("Vess", [cookBond, oxBond, bond()]), member("Kettle", [cookBond])], targetOf);
    expect(cards.map((c) => c.name)).toEqual(["Crimson Ox", "Sweetest-Onion-Of-Summer"]);
    // the ox goes by its book name: no title, just "Bond of"
    expect(cards[0]).toMatchObject({ kindLabel: "heart.bond.kind.companion", role: "", traits: "heart.bond.ui.bond-of{name=Vess}" });
    expect(cards[1]).toMatchObject({ role: "Cook", traits: "heart.bond.ui.companion-of{role=Cook,name=Vess, Kettle}" });
  });

  it("skips person bonds (even with an actor) and companions that are gone", () => {
    const personWithActor = bond({ system: { kind: "person", target: "Actor.npc" } });
    expect(companionCards([member("Vess", [bond(), personWithActor, bond({ system: { kind: "companion", target: "Actor.gone" } })])], targetOf)).toEqual([]);
  });
});
