/**
 * GM Notes are the GM's alone (S3, Luke, 2026-10-21): the rule in
 * common/gm-notes.js, and the adversary, landmark, and delve sheets handing
 * their templates no GM Notes text for anyone but the GM (Observer, Limited,
 * or even an owner), with a cut-down sheet for Limited viewers. The
 * templates are checked too: every GM Notes panel sits inside
 * {{#if showGmNotes}}.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gmNoteFields, gmSafeFields, mayReadGmNotes, showsLimitedSheet } from "../src/common/gm-notes.js";
import { enrichFields } from "../src/common/rich-text.js";
import AdversarySheet from "../src/actors/adversary/sheet.js";
import LandmarkSheet from "../src/actors/landmark/sheet.js";
import DelveSheet from "../src/actors/delve/sheet.js";
import { LIMITED_SHEET } from "../src/actors/base/sheet.js";
import { resetWorld, fakeActor, fakeUser, setUsers } from "./helpers.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const SECRET = "The cult meets under the bridge";
const LEVELS = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };

const gm = fakeUser({ id: "gm", isGM: true });
const player = fakeUser({ id: "p1" });

// an actor this player holds at `level` (the GM always passes)
function placeFor(type, level) {
  const actor = fakeActor({
    id: `${type}-${level}`,
    type,
    system: { description: "<p>Public</p>", notes: `<p>${SECRET}</p>`, specialRules: "", potentialPlots: "", connection: "", descriptors: "", special: "", motivation: "", domains: "", resistance: 0, resistanceMax: 5 },
  });
  actor.testUserPermission = (user, need) => Boolean(user?.isGM) || LEVELS[level] >= LEVELS[need];
  Object.defineProperty(actor, "isOwner", { get: () => actor.testUserPermission(game.user, "OWNER") });
  return actor;
}

const SHEETS = [
  ["adversary", AdversarySheet],
  ["landmark", LandmarkSheet],
  ["delve", DelveSheet],
];

beforeEach(() => {
  resetWorld();
  globalThis.window = { innerHeight: 900 };
  globalThis.localizeHeart = (s) => s;
  CONFIG.Item = { typeLabels: { equipment: "TYPES.Item.equipment", resource: "TYPES.Item.resource", haunt: "TYPES.Item.haunt" } };
  game.settings.store.set("heart.showArt", false);
  game.heart = { die_sizes: ["d4", "d6", "d8"] };
});

describe("the rule (common/gm-notes.js)", () => {
  it("names the GM-facing fields of adversaries, landmarks, and delves only", () => {
    for (const type of ["adversary", "landmark", "delve"]) {
      expect(gmNoteFields({ documentName: "Actor", type })).toEqual(["system.notes"]);
    }
    // player-facing notes: a character's, a companion's, the party's, a bond's
    for (const type of ["character", "hireling", "party"]) {
      expect(gmNoteFields({ documentName: "Actor", type })).toEqual([]);
    }
    expect(gmNoteFields({ documentName: "Item", type: "bond" })).toEqual([]);
    expect(gmNoteFields(undefined)).toEqual([]);
  });

  it("only a GM may read them", () => {
    expect(mayReadGmNotes(gm)).toBe(true);
    expect(mayReadGmNotes(player)).toBe(false);
    expect(mayReadGmNotes(undefined)).toBe(false);
  });

  it("drops a GM-facing field for a player, keeps it with its secrets for the GM", () => {
    const doc = { documentName: "Actor", type: "adversary" };
    const fields = [
      { key: "system.description", html: "a", doc },
      { key: "system.notes", html: "b", doc },
    ];
    expect(gmSafeFields(fields, player).map((f) => f.key)).toEqual(["system.description"]);
    const forGM = gmSafeFields(fields, gm);
    expect(forGM.map((f) => f.key)).toEqual(["system.description", "system.notes"]);
    expect(forGM[1].secrets).toBe(true);
    expect(forGM[0].secrets).toBeUndefined();
  });

  it("leaves a character's own notes alone", () => {
    const doc = { documentName: "Actor", type: "character" };
    expect(gmSafeFields([{ key: "system.notes", html: "mine", doc }], player)).toHaveLength(1);
  });

  it("the cut-down sheet: a player below Observer, on a type with GM Notes", () => {
    expect(showsLimitedSheet(placeFor("adversary", "LIMITED"), player)).toBe(true);
    expect(showsLimitedSheet(placeFor("landmark", "NONE"), player)).toBe(true);
    expect(showsLimitedSheet(placeFor("delve", "OBSERVER"), player)).toBe(false);
    expect(showsLimitedSheet(placeFor("adversary", "LIMITED"), gm)).toBe(false);
    expect(showsLimitedSheet(placeFor("character", "LIMITED"), player)).toBe(false);
  });

  it("enrichment honours a field's own secrets", async () => {
    const spy = vi.spyOn(TextEditor, "enrichHTML").mockImplementation(async (html) => html);
    await enrichFields([{ key: "k", html: "x", doc: { isOwner: true }, secrets: false }]);
    expect(spy.mock.calls[0][1].secrets).toBe(false);
    spy.mockRestore();
  });
});

describe.each(SHEETS)("the %s sheet", (type, Sheet) => {
  // everything the template is drawn with, as text
  async function drawnFor(user, level) {
    setUsers([gm, player], { self: user });
    const sheet = new Sheet(placeFor(type, level));
    const data = await sheet._renderInner(sheet.getData());
    return { sheet, data, text: JSON.stringify(data.enriched) };
  }

  it.each(["OBSERVER", "OWNER"])("a player at %s gets the full sheet with no GM Notes", async (level) => {
    const { sheet, data, text } = await drawnFor(player, level);
    expect(sheet.template).not.toBe(LIMITED_SHEET);
    expect(data.showGmNotes).toBe(false);
    expect(data.enriched).not.toHaveProperty("system.notes");
    expect(text).not.toContain(SECRET);
    expect(text).toContain("Public");
  });

  it("a player at Limited gets the cut-down sheet: the description alone", async () => {
    const { sheet, data, text } = await drawnFor(player, "LIMITED");
    expect(sheet.template).toBe(LIMITED_SHEET);
    expect(Object.keys(data.enriched)).toEqual(["system.description"]);
    expect(data.showGmNotes).toBe(false);
    expect(text).not.toContain(SECRET);
  });

  it("the GM gets the GM Notes, secrets and all", async () => {
    const spy = vi.spyOn(TextEditor, "enrichHTML");
    const { sheet, data } = await drawnFor(gm, "NONE");
    expect(sheet.template).not.toBe(LIMITED_SHEET);
    expect(data.showGmNotes).toBe(true);
    expect(data.enriched["system.notes"]).toContain(SECRET);
    const notesCall = spy.mock.calls.find((c) => c[0].includes(SECRET));
    expect(notesCall[1].secrets).toBe(true);
    spy.mockRestore();
  });
});

describe("the templates", () => {
  const htmlFiles = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return htmlFiles(path);
      return name.endsWith(".html") ? [path] : [];
    });

  it("draw every GM Notes panel inside {{#if showGmNotes}}", () => {
    const panels = [];
    for (const file of htmlFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/gm-notes-container|"gm-notes"/g)) {
        const before = text.slice(0, m.index);
        const opened = (before.match(/\{\{#if showGmNotes\}\}/g) ?? []).length;
        const closed = (before.slice(before.lastIndexOf("{{#if showGmNotes}}")).match(/\{\{\/if\}\}/g) ?? []).length;
        panels.push({ file, gated: opened > 0 && closed === 0 });
      }
    }
    expect(panels.length).toBeGreaterThanOrEqual(3);
    expect(panels.filter((p) => !p.gated)).toEqual([]);
  });

  it("the cut-down sheet names no field but the description", () => {
    const text = readFileSync(join(SRC, "actors", "base", "limited.html"), "utf8").replace(/\{\{!--[\s\S]*?--\}\}/g, "");
    expect(text.match(/system\.\w+/g)).toEqual(["system.description", "system.description"]);
  });
});
