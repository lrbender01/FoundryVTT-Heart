/**
 * Dragging a row on an actor sheet (S5, Luke, 2026-10-21): the drag carries
 * the item's own drag data (its uuid), so Foundry's drop sees the item is
 * already on the actor and sorts it instead of making a copy; the sort finds
 * the rows' items by the ids in their uuids; the panel sheets list their
 * items in sort order so a moved row stays put. The duplicate itself happened
 * inside Foundry's ActorSheet._onDropItem, which needs Foundry: check it
 * there too.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import HeartActorSheet from "../src/actors/base/sheet.js";
import { draggableRowUuid, rowItemId } from "../src/common/drops.js";
import { activeOf, bySort } from "../src/actors/proxy-lists.js";
import { resetWorld, fakeActor, fakeItem } from "./helpers.mjs";

beforeEach(() => {
  resetWorld();
});

describe("what a row's drag hands over", () => {
  it("an own item's uuid; nothing for a tab link or a class's child", () => {
    expect(draggableRowUuid("Actor.a.Item.b")).toBe("Actor.a.Item.b");
    expect(draggableRowUuid("Actor.a.Item.c@Item.d")).toBeNull();
    expect(draggableRowUuid(undefined)).toBeNull();
    expect(draggableRowUuid("")).toBeNull();
  });

  it("the row's item id, for the sort", () => {
    expect(rowItemId("Actor.a.Item.b")).toBe("b");
    expect(rowItemId("Scene.s.Token.t.Actor.a.Item.b")).toBe("b");
    expect(rowItemId("Compendium.heart-content.adversaries.Actor.a.Item.b")).toBe("b");
    expect(rowItemId("b")).toBe("b");
    expect(rowItemId("Actor.a.Item.c@Item.d")).toBeNull();
    expect(rowItemId("Actor.a")).toBeNull();
    expect(rowItemId(undefined)).toBeNull();
  });
});

describe("the actor sheet's row drag", () => {
  function sheetWithRows() {
    const actor = fakeActor({ id: "adv", type: "adversary", owners: ["gm"] });
    const claw = fakeItem({ id: "claw", name: "Claw", type: "equipment", parent: actor });
    const bite = fakeItem({ id: "bite", name: "Bite", type: "equipment", parent: actor });
    for (const item of [claw, bite]) item.toDragData = () => ({ type: "Item", uuid: item.uuid });
    return { actor, claw, bite, sheet: new HeartActorSheet(actor) };
  }

  const dragEvent = (itemId, { link = false } = {}) => ({
    currentTarget: { dataset: { itemId } },
    target: { classList: { contains: (c) => link && c === "content-link" } },
    dataTransfer: { setData: vi.fn() },
  });

  it("carries the item's uuid, not a copy of its data (the duplicate)", async () => {
    const { sheet, claw } = sheetWithRows();
    const ev = dragEvent(claw.uuid);
    await sheet._onDragStart(ev);
    const sent = JSON.parse(ev.dataTransfer.setData.mock.calls[0][1]);
    expect(sent).toEqual({ type: "Item", uuid: claw.uuid });
    expect(sent).not.toHaveProperty("data");
  });

  it("drags nothing for a tab link, a child row, a content link, or a gone item", async () => {
    const { sheet, claw } = sheetWithRows();
    for (const ev of [dragEvent(undefined), dragEvent(`${claw.uuid}@Item.x`), dragEvent(claw.uuid, { link: true }), dragEvent("Actor.adv.Item.gone")]) {
      await sheet._onDragStart(ev);
      expect(ev.dataTransfer.setData).not.toHaveBeenCalled();
    }
  });

  it("a drop on its own sheet sorts among the rows, by their item ids", async () => {
    const { sheet, actor, claw, bite } = sheetWithRows();
    const perform = vi.fn((source, { target }) => [{ target: source, update: { sort: (target.sort ?? 0) + 1 } }]);
    globalThis.SortingHelpers = { performIntegerSort: perform };
    const rows = [{ dataset: { itemId: claw.uuid } }, { dataset: { itemId: bite.uuid } }, { dataset: {} }];
    const parentElement = { children: rows };
    rows.forEach((r) => (r.parentElement = parentElement));
    const event = { target: { closest: () => rows[1] } };
    await sheet._onSortItem(event, claw.toObject());
    expect(perform).toHaveBeenCalledWith(claw, { target: bite, siblings: [bite] });
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ sort: 1, _id: "claw" }]);
  });

  it("a drop on itself, or off any row, does nothing", async () => {
    const { sheet, actor, claw } = sheetWithRows();
    globalThis.SortingHelpers = { performIntegerSort: vi.fn(() => []) };
    const self = { dataset: { itemId: claw.uuid }, parentElement: { children: [] } };
    await sheet._onSortItem({ target: { closest: () => self } }, claw.toObject());
    await sheet._onSortItem({ target: { closest: () => null } }, claw.toObject());
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe("panel lists in sort order", () => {
  it("bySort: by sort, ties in the order they came", () => {
    const list = [{ n: "a", sort: 0 }, { n: "b", sort: 300 }, { n: "c" }, { n: "d", sort: 100 }];
    expect(bySort(list).map((x) => x.n)).toEqual(["a", "c", "d", "b"]);
    expect(bySort(undefined)).toEqual([]);
  });

  it("activeOf sorts the actor's own items only when asked", () => {
    const actor = { items: [{ type: "resource", sort: 200, n: "late" }, { type: "resource", sort: 100, n: "early" }] };
    expect(activeOf(actor, "resource").map((i) => i.n)).toEqual(["late", "early"]);
    expect(activeOf(actor, "resource", { sorted: true }).map((i) => i.n)).toEqual(["early", "late"]);
  });
});
