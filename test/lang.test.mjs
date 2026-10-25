/**
 * The lang files (2026-10-21, sheets audit S39). The monorepo's lint:i18n
 * never read the fork's static/lang, and test/setup.mjs hands keys back as
 * themselves, so nothing saw a missing key, a placeholder a translation
 * dropped, or a dotted-key collision (which stops Foundry loading the whole
 * language: docs/foundry-gotchas.md). Reads the files as text, no Foundry.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const langDir = path.join(root, "static", "lang");
const LANGS = fs.readdirSync(langDir).filter((f) => f.endsWith(".json"));
const raw = Object.fromEntries(LANGS.map((f) => [f, fs.readFileSync(path.join(langDir, f), "utf8")]));
const lang = Object.fromEntries(LANGS.map((f) => [f, JSON.parse(raw[f])]));
const en = lang["en.json"];

// every src file a lang key could be named in
function sources(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|html)$/.test(name)) out.push(p);
  }
  return out;
}
const files = sources(path.join(root, "src")).map((p) => ({ p: path.relative(root, p), text: fs.readFileSync(p, "utf8") }));

// Names in the heart.* shape that are not lang keys: a setting, a flag scope
// path, or a pack id
const NOT_KEYS = new Set(["heart.showCharacterArt", "heart.boardHands", "heart.board.lastPin", "heart.board.paletteAt", "heart.items"]);

describe("lang files", () => {
  it.each(LANGS)("%s: no key is a dotted prefix of another", (file) => {
    const keys = Object.keys(lang[file]).sort();
    const clashes = [];
    for (let i = 0; i < keys.length - 1; i++) {
      if (keys[i + 1].startsWith(`${keys[i]}.`)) clashes.push(`${keys[i]} / ${keys[i + 1]}`);
    }
    expect(clashes).toEqual([]);
  });

  it.each(LANGS)("%s: no key written twice", (file) => {
    const seen = new Set();
    const twice = [];
    for (const m of raw[file].matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
      if (seen.has(m[1])) twice.push(m[1]);
      seen.add(m[1]);
    }
    expect(twice).toEqual([]);
  });

  // the startup changelog shows only changes and bug_fixes
  // (templates/startup.html); its never-shown notes went 2026-10-21
  it.each(LANGS)("%s: the changelog holds only what the startup window shows", (file) => {
    const unshown = Object.keys(lang[file]).filter((k) => /^heart\.versions\.[^.]+\.(?!version$|changes\.|bug_fixes\.)/.test(k));
    expect(unshown).toEqual([]);
  });

  it.each(LANGS.filter((f) => f !== "en.json"))("%s: every translation keeps English's {placeholders}", (file) => {
    const holes = (s) => [...String(s).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
    const off = Object.entries(lang[file])
      .filter(([key, text]) => key in en && holes(text).join() !== holes(en[key]).join())
      .map(([key]) => key);
    expect(off).toEqual([]);
  });
});

describe("keys the code names", () => {
  it("every literal heart.* key in src exists in en.json", () => {
    const missing = [];
    for (const { p, text } of files) {
      for (const m of text.matchAll(/(["'`])(heart\.[A-Za-z0-9_.:()-]+)\1/g)) {
        const key = m[2];
        if (key.endsWith(".") || NOT_KEYS.has(key) || key in en) continue;
        missing.push(`${p}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every localizeHeart call with only literal arguments names a key", () => {
    const missing = [];
    for (const { p, text } of files.filter((f) => f.p.endsWith(".html"))) {
      for (const m of text.matchAll(/\{\{\{?\s*localizeHeart((?:\s+(?:"[^"]*"|'[^']*'))+)\s*\}\}/g)) {
        const args = [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((a) => a[1] ?? a[2]);
        const key = `heart.${args.join(".")}`;
        if (!(key in en)) missing.push(`${p}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  // (the class sheet builds its tier headings and "+" labels from the tier,
  // which the literal checks above can't see; a refactor dropped them as
  // unused and the Abilities tab showed raw keys: Luke, 2026-10-23)
  it("the class sheet's built keys exist for every ability tier", () => {
    const missing = [];
    for (const tier of ["core", "minor", "major", "zenith"]) {
      for (const leaf of ["label-multiple", "add"]) {
        const key = `heart.class.${tier}-ability.${leaf}`;
        if (!(key in en)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });
});
