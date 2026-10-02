/**
 * The ready-time migrations with fake documents (2026-10-02): the Fallout
 * source line (items/fallout/migrate.js), leftover "bond" Actors
 * (bonds/migrate.js), and the adversary lore move (actors/adversary/
 * migrate.js; its pure half is in drops.test.mjs). Each runs only on the
 * active GM's client and touches only what it was written for.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrateFalloutSource } from "../src/items/fallout/migrate.js";
import { removeRetiredBondActors } from "../src/bonds/migrate.js";
import { migrateAdversaryLore } from "../src/actors/adversary/migrate.js";
import { resetWorld, fakeActor, fakeItem, fakeUser, setUsers } from "./helpers.mjs";

const gm = fakeUser({ id: "gm", isGM: true });
const gm2 = fakeUser({ id: "gm2", isGM: true });
const p1 = fakeUser({ id: "p1" });

// the active GM is this client, or another one
const asActiveGM = () => setUsers([gm, gm2, p1], { self: gm, activeGM: gm });
const asOtherGM = () => setUsers([gm, gm2, p1], { self: gm2, activeGM: gm });

beforeEach(() => {
  resetWorld();
  asActiveGM();
  // each migration logs what it moved
  vi.spyOn(console, "log").mockImplementation(() => {});
  globalThis.Actor = { updateDocuments: vi.fn(async () => []), create: vi.fn() };
  globalThis.Item = { updateDocuments: vi.fn(async () => []), create: vi.fn() };
});

describe("the Fallout source line", () => {
  // decode() reads entities through a textarea, as the browser does
  beforeEach(() => {
    const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
    globalThis.document = {
      createElement: () => {
        const t = { value: "" };
        Object.defineProperty(t, "innerHTML", {
          set(html) {
            t.value = html.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]);
          },
        });
        return t;
      },
    };
  });
  afterEach(() => {
    delete globalThis.document;
  });

  const fallout = (description, extra = {}) => ({ name: "Bleeding", type: "fallout", system: { description, ...extra } });

  it("moves the trailing Source paragraph into system.source", async () => {
    const vess = fakeActor({
      id: "vess",
      items: [
        { id: "f1", ...fallout("<p>You bleed.</p>\n<p><em>Source: Butcher &amp; Sons, p. 176</em></p>\n") },
        { id: "f2", ...fallout("<p>Kept.</p><p><em>Source: X</em></p>", { source: "Already set" }) },
        { id: "f3", ...fallout("<p>No source here.</p>") },
        { id: "f4", ...fallout("<p><em>Source: in the middle</em></p><p>then more</p>") },
        { id: "e1", name: "Lamp", type: "equipment", system: { description: "<p><em>Source: Y</em></p>" } },
      ],
    });
    await migrateFalloutSource();
    expect(vess.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(vess.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      { _id: "f1", "system.source": "Butcher & Sons, p. 176", "system.description": "<p>You bleed.</p>" },
    ]);
    expect(vess.items.get("f1").system.source).toBe("Butcher & Sons, p. 176");
  });

  it("world items too, through Item.updateDocuments", async () => {
    const loose = fakeItem({ id: "w1", ...fallout("<p>Hm.</p><p><em>Source: Witch</em></p>") });
    game.items.set(loose.id, loose);
    await migrateFalloutSource();
    expect(Item.updateDocuments).toHaveBeenCalledWith([{ _id: "w1", "system.source": "Witch", "system.description": "<p>Hm.</p>" }]);
  });

  it("nothing to move: no writes", async () => {
    const vess = fakeActor({ id: "vess", items: [fallout("<p>Plain.</p>")] });
    await migrateFalloutSource();
    expect(vess.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(Item.updateDocuments).not.toHaveBeenCalled();
  });

  it("only the active GM's client", async () => {
    asOtherGM();
    const vess = fakeActor({ id: "vess", items: [fallout("<p>A</p><p><em>Source: B</em></p>")] });
    await migrateFalloutSource();
    setUsers([gm, p1], { self: p1, activeGM: null });
    await migrateFalloutSource();
    expect(vess.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe("leftover bond Actors", () => {
  function invalid(entries) {
    const docs = Object.fromEntries(entries.map(([id, type]) => [id, { _source: { type }, delete: vi.fn(async () => true) }]));
    game.actors.invalidDocumentIds = new Set([...entries.map(([id]) => id), "throws"]);
    game.actors.getInvalid = (id) => {
      if (id === "throws") throw new Error("not invalid after all");
      return docs[id];
    };
    return docs;
  }

  it("deletes invalid Actors whose stored type is bond, and only those", async () => {
    const docs = invalid([
      ["b1", "bond"],
      ["b2", "bond"],
      ["x1", "spaceship"],
    ]);
    await removeRetiredBondActors();
    expect(docs.b1.delete).toHaveBeenCalled();
    expect(docs.b2.delete).toHaveBeenCalled();
    expect(docs.x1.delete).not.toHaveBeenCalled();
    expect(ui.notifications.info).toHaveBeenCalledWith("heart.bond.migrate.removed{count=2}");
  });

  it("only the active GM's client; nothing invalid, nothing said", async () => {
    const docs = invalid([["b1", "bond"]]);
    asOtherGM();
    await removeRetiredBondActors();
    expect(docs.b1.delete).not.toHaveBeenCalled();
    asActiveGM();
    game.actors.invalidDocumentIds = undefined;
    await removeRetiredBondActors();
    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});

describe("the adversary lore migration (once per world)", () => {
  const LEGACY = "<p>A drowned thing.</p><p><strong>Example names:</strong> Ilse, Vok</p><p><strong>Domains:</strong> Haven, Occult</p>";

  function adversary(id, { notes = LEGACY, description = "", fromContent = true, extra = {} } = {}) {
    return fakeActor({
      id,
      type: "adversary",
      flags: fromContent ? { "fvtt-heart-content": { book: "core" } } : {},
      system: { notes, description, difficulty: "Risky (Blood)", ...extra },
    });
  }

  it("moves a legacy content adversary's lore and records that it ran", async () => {
    adversary("drowned");
    await migrateAdversaryLore();
    expect(Actor.updateDocuments).toHaveBeenCalledWith(
      [
        {
          _id: "drowned",
          "system.notes": "",
          "system.names": "Ilse, Vok",
          "system.domains": "Haven, Occult",
          "system.level": "Risky",
          "system.description": "<p>A drowned thing.</p>",
        },
      ],
      { render: false },
    );
    expect(game.settings.set).toHaveBeenCalledWith("heart", "adversaryLoreMigrated", true);
  });

  it("leaves the GM's own notes alone (the leak of 2026-10-02)", async () => {
    // a content adversary whose Description the GM emptied, with secret notes
    adversary("secret", { notes: "<p>The mayor is the cult leader.</p>" });
    // not from the content module at all
    adversary("homebrew", { fromContent: false });
    // a Description already there
    adversary("written", { description: "<p>Mine.</p>" });
    fakeActor({ id: "vess", type: "character", system: { notes: LEGACY } });
    await migrateAdversaryLore();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();
    // ran, found nothing: still recorded, so it never runs again
    expect(game.settings.store.get("heart.adversaryLoreMigrated")).toBe(true);
  });

  it("runs once: the world setting stops it", async () => {
    adversary("drowned");
    game.settings.store.set("heart.adversaryLoreMigrated", true);
    await migrateAdversaryLore();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalled();
  });

  it("only the active GM's client", async () => {
    adversary("drowned");
    asOtherGM();
    await migrateAdversaryLore();
    setUsers([gm, p1], { self: p1, activeGM: gm });
    await migrateAdversaryLore();
    expect(Actor.updateDocuments).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalled();
  });

  it("a failed write leaves the setting unset, to try again next load", async () => {
    adversary("drowned");
    Actor.updateDocuments.mockRejectedValueOnce(new Error("server said no"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await migrateAdversaryLore();
    expect(game.settings.set).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
