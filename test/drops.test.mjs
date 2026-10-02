/**
 * Drop guards (src/common/drops.js, 2026-10-02) and the adversary lore gate
 * (src/actors/adversary/migrate.js). Luke: refusing something a player needs
 * is far worse than an orphaned item, so the "still allowed" cases matter as
 * much as the refusals.
 */

import { describe, it, expect } from "vitest";
import { ITEM_CHILD_TYPES, canHoldChild, actorDropRefusal } from "../src/common/drops.js";
import { legacyLoreUpdates } from "../src/actors/adversary/migrate.js";

const ITEM_TYPES = ["ability", "ancestry", "beat", "bond", "calling", "class", "equipment", "fallout", "haunt", "item", "resource", "tag"];
const ACTOR_TYPES = ["character", "adversary", "landmark", "delve", "hireling", "party"];

describe("item sheets take exactly the children they show", () => {
  it.each([
    ["class", ["ability", "equipment", "resource"]],
    ["calling", ["ability", "beat"]],
    ["ability", ["ability"]],
    ["equipment", ["tag"]],
    ["resource", ["tag"]],
    ["bond", ["fallout"]],
  ])("%s holds %j", (parent, children) => {
    for (const child of ITEM_TYPES) expect(canHoldChild(parent, child)).toBe(children.includes(child));
  });

  it("every other item type holds nothing", () => {
    for (const parent of ITEM_TYPES.filter((t) => !(t in ITEM_CHILD_TYPES))) {
      for (const child of ITEM_TYPES) expect(canHoldChild(parent, child)).toBe(false);
    }
  });
});

describe("actor sheets refuse only clear mistakes", () => {
  it("a character takes everything but a tag or a haunt", () => {
    for (const type of ITEM_TYPES) {
      const expected = type === "tag" ? "tag" : type === "haunt" ? "haunt" : null;
      expect(actorDropRefusal("character", type)).toBe(expected);
    }
  });

  it("a class, calling, or ancestry only on a character", () => {
    for (const actor of ACTOR_TYPES.filter((a) => a !== "character")) {
      for (const type of ["class", "calling", "ancestry"]) expect(actorDropRefusal(actor, type)).toBe("character-only");
    }
  });

  it("a haunt only on a landmark", () => {
    expect(actorDropRefusal("landmark", "haunt")).toBeNull();
    for (const actor of ACTOR_TYPES.filter((a) => a !== "landmark")) expect(actorDropRefusal(actor, "haunt")).toBe("haunt");
  });

  it("gear, abilities, fallouts, and items still land everywhere", () => {
    for (const actor of ACTOR_TYPES) {
      for (const type of ["ability", "equipment", "resource", "fallout", "item", "beat", "bond"]) {
        expect(actorDropRefusal(actor, type)).toBeNull();
      }
    }
  });
});

describe("adversary lore migration (the GM Notes leak, 2026-10-02)", () => {
  const legacyNotes =
    "<p>It hunts by sound.</p><p><strong>Example names:</strong> Ash, Cinder</p><p><strong>Domains:</strong> Haven, Technology; near the rails</p>";

  it("moves a legacy content adversary's lore out of GM Notes", () => {
    const updates = legacyLoreUpdates({ description: "", notes: legacyNotes, difficulty: "Risky (3)" }, true);
    expect(updates).toEqual({
      "system.notes": "",
      "system.names": "Ash, Cinder",
      "system.domains": "Haven, Technology",
      "system.domainsNote": "near the rails",
      "system.level": "Risky",
      "system.description": "<p>It hunts by sound.</p>",
    });
  });

  it("never touches GM-written notes, even with the Description emptied", () => {
    const secret = "<p>The cult leader is the mayor's sister. Do not reveal.</p>";
    expect(legacyLoreUpdates({ description: "", notes: secret }, true)).toBeNull();
  });

  it("leaves adversaries not from the content module alone", () => {
    expect(legacyLoreUpdates({ description: "", notes: legacyNotes }, false)).toBeNull();
  });

  it("leaves any adversary that has a Description", () => {
    expect(legacyLoreUpdates({ description: "<p>Text</p>", notes: legacyNotes }, true)).toBeNull();
  });

  it("keeps fields the GM already filled", () => {
    const updates = legacyLoreUpdates({ description: "", notes: legacyNotes, names: "Mine", domains: "Wild", level: "Standard" }, true);
    expect(updates["system.names"]).toBeUndefined();
    expect(updates["system.domains"]).toBeUndefined();
    expect(updates["system.level"]).toBeUndefined();
    expect(updates["system.domainsNote"]).toBe("near the rails");
  });

  it("a domain line that is only a note", () => {
    const notes = "<p><strong>Domains:</strong> wherever it is fed</p>";
    const updates = legacyLoreUpdates({ description: "", notes }, true);
    expect(updates["system.domains"]).toBeUndefined();
    expect(updates["system.domainsNote"]).toBe("wherever it is fed");
  });
});
