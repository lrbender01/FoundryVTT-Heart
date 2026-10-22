/**
 * Small sheet fixes Luke approved on 2026-10-21 (sheets audit):
 *   - S14: the GM gets Delete on a class's or calling's rows on the
 *     character sheet (the template read user.isGM from the item)
 *   - S17: "New ..." names use the type's label, not its raw id
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { newItemName } from "../src/common/localize.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("S14: Delete on a class's rows for the GM", () => {
  it("the character sheet's row list reads the GM from the root", () => {
    const text = readFileSync(join(SRC, "actors", "character", "sheet.html"), "utf8");
    const inline = text
      .slice(text.indexOf('{{#*inline "characterTabItemList"}}'), text.indexOf("{{/inline}}"))
      .replace(/\{\{!--[\s\S]*?--\}\}/g, "");
    expect(inline).toContain("showDelete=(or (not item.isChild) @root.user.isGM)");
    expect(inline).not.toMatch(/[^.@]user\.isGM/);
  });
});

describe("S17: the name a new item gets", () => {
  const LABELS = { "heart.equipment.label-single": "Equipment", "heart.new-item": "New {type}" };
  const { localize, format } = game.i18n;
  afterEach(() => Object.assign(game.i18n, { localize, format }));
  beforeEach(() => {
    CONFIG.Item = { typeLabels: { equipment: "heart.equipment.label-single", resource: "heart.resource.label-single" } };
    game.i18n.localize = (k) => LABELS[k] ?? k;
    game.i18n.format = (k, d = {}) => (LABELS[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => d[n]);
  });

  it("uses the type's label", () => {
    expect(newItemName("equipment")).toBe("New Equipment");
  });

  it("falls back to the id when the label is missing or untranslated", () => {
    expect(newItemName("resource")).toBe("New resource");
    expect(newItemName("mystery")).toBe("New mystery");
  });
});
