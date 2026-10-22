/**
 * The sheets' small pure helpers (2026-10-21, from the sheets audit): the
 * Choose window's book order, the one track click rule, the actors' active
 * item lists, the pack icon adoption, a companion's printed page, dropped
 * items landing switched on, rich-text enrichment, and the reorder and chip
 * helpers. Each of the bug fixes has a case that failed before it.
 */

import { describe, it, expect, vi } from "vitest";
import { sourceOrder, bySourceOrder } from "../src/applications/character-options/order.js";
import { nextMark, bindTrack } from "../src/common/tracks.js";
import { activeOf } from "../src/actors/proxy-lists.js";
import { learnPackIcons, packIconUpdates } from "../src/common/icons.js";
import { companionPage } from "../src/actors/hireling/page.js";
import { activeData } from "../src/actors/drop-active.js";
import { enrichFields, richFieldsOf } from "../src/common/rich-text.js";
import { orderByFlag, orderKeys } from "../src/actors/character/reorder.js";
import { toChips } from "../src/common/panel-sheet.js";
import { choiceKey, equipmentChoices } from "../src/items/class/equipment.js";

const flags = (book, page) => ({ flags: { "fvtt-heart-content": { book, page } } });

describe("the Choose window's book order (S4 / C10)", () => {
  it("reads a Ways and Means page's digits", () => {
    expect(sourceOrder(flags("wm", "W12"))).toEqual([1, 12, 0]);
    expect(sourceOrder(flags("core", "35"))).toEqual([0, 35, 0]);
  });

  it("sorts core, then Ways and Means by page, then anything else", () => {
    const list = [
      { name: "Zeta", ...flags("wm", "W40") },
      { name: "Other", sort: 5 },
      { name: "Alpha", ...flags("wm", "W12") },
      { name: "Core", ...flags("core", "90") },
    ].map((e) => ({ ...e, order: sourceOrder(e) }));
    expect(list.sort(bySourceOrder).map((e) => e.name)).toEqual(["Core", "Alpha", "Zeta", "Other"]);
  });
});

describe("one track click rule (S32)", () => {
  it.each([
    [0, 2, false, 3],
    [3, 2, true, 2],
    [5, 2, true, 3],
    [2, 4, false, 5],
    ["3", 2, true, 2],
  ])("value %s, box %s (marked %s) -> %s", (current, index, checked, next) => {
    expect(nextMark(current, index, checked)).toBe(next);
  });

  // a jQuery stand-in: find() hands back the boxes; on() keeps the handler
  const boxesOf = (boxes) => {
    let handler = null;
    return {
      html: { find: () => ({ on: (ev, fn) => { handler = fn; } }) },
      click: (box) => handler?.({ currentTarget: box, preventDefault: vi.fn() }),
      bound: () => Boolean(handler),
    };
  };
  const box = (index, checked) => ({ dataset: { index: String(index) }, classList: { contains: () => checked } });

  it("writes the next value; a sheet that cannot be edited binds nothing (S9)", async () => {
    const write = vi.fn();
    const t = boxesOf();
    bindTrack(t.html, ".box", { editable: true, read: () => 3, write });
    await t.click(box(2, true));
    expect(write).toHaveBeenCalledWith(expect.anything(), 2);
    const locked = boxesOf();
    bindTrack(locked.html, ".box", { editable: false, read: () => 3, write });
    expect(locked.bound()).toBe(false);
  });

  it("a box the reader does not own is left alone", async () => {
    const write = vi.fn();
    const t = boxesOf();
    bindTrack(t.html, ".box", { read: () => null, write });
    await t.click(box(0, false));
    expect(write).not.toHaveBeenCalled();
  });
});

describe("activeOf (S28)", () => {
  const item = (type, system = {}) => ({ type, system });
  it("the items of a type in use: on (or no switch), not finished; a class's first", () => {
    const actor = { items: [item("resource"), item("resource", { active: false }), item("resource", { complete: true }), item("equipment")] };
    const cls = { children: [item("resource", { active: true }), item("resource", { active: false })] };
    expect(activeOf(actor, "resource")).toHaveLength(1);
    expect(activeOf(actor, "resource", { from: cls })).toEqual([cls.children[0], actor.items[0]]);
    expect(activeOf(actor, "haunt")).toEqual([]);
  });
});

describe("pack icon adoption, the pure half (S42)", () => {
  const entries = [
    { type: "class", name: "Cleaver", img: "icons/cleaver.svg", system: { children: { a: { type: "ability", name: "Feast", img: "icons/feast.svg" } } } },
    { type: "class", name: "Witch", img: "icons/witch.svg" },
    { type: "class", name: "Witch", img: "icons/witch-2.svg" },
    // a child learned even under a parent with a generic image
    { type: "calling", name: "Heartsong", img: "systems/heart/assets/drum.svg", system: { children: { b: { type: "beat", name: "Sing", img: "icons/sing.svg" } } } },
  ];

  it("learns each type and name's icon; two that disagree are left alone", () => {
    const known = learnPackIcons(entries);
    expect(known.get("class|cleaver")).toBe("icons/cleaver.svg");
    expect(known.get("ability|feast")).toBe("icons/feast.svg");
    expect(known.get("beat|sing")).toBe("icons/sing.svg");
    expect(known.get("class|witch")).toBeNull();
    expect(known.has("calling|heartsong")).toBe(false);
  });

  it("updates only copies still showing a generic image, nested children included", () => {
    const known = learnPackIcons(entries);
    const sources = [
      { _id: "1", type: "class", name: "Cleaver", img: "icons/svg/item-bag.svg", system: { children: { x: { type: "ability", name: "Feast", img: "icons/svg/item-bag.svg" } } } },
      { _id: "2", type: "class", name: "Cleaver", img: "my/own.png" },
      { _id: "3", type: "class", name: "Witch", img: "icons/svg/item-bag.svg" },
    ];
    expect(packIconUpdates(sources, known)).toEqual([
      { _id: "1", img: "icons/cleaver.svg", "system.children.x.img": "icons/feast.svg" },
    ]);
  });
});

describe("a companion's book page (C11)", () => {
  it("the printed page, not the PDF page", () => {
    expect(companionPage({ book: "wm", page: "W72" })).toBe("W68");
    expect(companionPage({ book: "wm", page: "W104" })).toBe("M2");
    expect(companionPage({ book: "core", page: "40" })).toBe("35");
  });

  it("the content module's own printedPage first; nothing without a page", () => {
    expect(companionPage({ book: "wm", page: "W72", printedPage: "W68" })).toBe("W68");
    expect(companionPage({})).toBe("");
    expect(companionPage(undefined)).toBe("");
  });
});

describe("dropped items land switched on (S8)", () => {
  it("one item or a folder's list", () => {
    expect(activeData({ system: {} }).system.active).toBe(true);
    const list = activeData([{ system: {} }, { system: { active: false } }, { name: "no system" }]);
    expect(list.map((d) => d.system?.active)).toEqual([true, true, undefined]);
  });

  it("only items that have the switch, for a delve", () => {
    const list = activeData([{ system: { active: false } }, { system: {} }], { onlyIfPresent: true });
    expect(list.map((d) => d.system.active)).toEqual([true, undefined]);
  });
});

describe("rich text enriched before it is drawn (S16)", () => {
  it("each field by its key, secrets only for owners, relative to its document", async () => {
    const spy = vi.spyOn(TextEditor, "enrichHTML").mockImplementation(async (html) => `<p>${html}</p>`);
    const owned = { isOwner: true, system: { notes: "@UUID[Actor.x]" } };
    const seen = { isOwner: false };
    const out = await enrichFields([...richFieldsOf(owned, ["system.notes", "system.missing"]), { key: "calling.q1", html: "yes", doc: seen }]);
    expect(out).toEqual({ "system.notes": "<p>@UUID[Actor.x]</p>", "system.missing": "<p></p>", "calling.q1": "<p>yes</p>" });
    expect(spy.mock.calls[0][1]).toMatchObject({ secrets: true, relativeTo: owned });
    expect(spy.mock.calls[2][1]).toMatchObject({ secrets: false, relativeTo: seen });
    spy.mockRestore();
  });
});

describe("reorder and chip helpers (S42)", () => {
  const actor = (order) => ({ getFlag: () => order });
  it("the saved order first; unknown keys keep their place after", () => {
    const list = [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }, { uuid: "d" }];
    expect(orderByFlag(actor(["c", "a"]), list, "x").map((i) => i.uuid)).toEqual(["c", "a", "b", "d"]);
    expect(orderKeys(actor(["kill"]), ["hunt", "kill", "mend"], "x")).toEqual(["kill", "hunt", "mend"]);
    expect(orderKeys(actor(undefined), ["hunt", "kill"], "x")).toEqual(["hunt", "kill"]);
  });

  it("chips from text or a list, blanks dropped", () => {
    expect(toChips("Haven, Wild ,, ")).toEqual(["Haven", "Wild"]);
    expect(toChips(["Occult", " ", "Warren"])).toEqual(["Occult", "Warren"]);
    expect(toChips(undefined)).toEqual([]);
  });
});

describe("class equipment choices, one key rule (S31)", () => {
  it("clusters options by name less the trailing number", () => {
    expect(choiceKey("group_2")).toBe("group");
    expect(choiceKey("weapon-1")).toBe("weapon");
    expect(choiceKey("42")).toBe("42");
    const cls = { system: { equipment_groups: ["core", "weapon_1", "weapon_2", "kit_1"], active_equipment_groups: ["weapon_2"] } };
    expect(equipmentChoices(cls).map((c) => [c.key, c.picked])).toEqual([["weapon", true], ["kit", false]]);
  });
});
