// The board's pure surface stays pure (2026-10-27, ecosystem audit).
// src/map/scrapboard/index.js lists the files other code may import with no
// Foundry, PIXI, or DOM global. This test holds that promise: a fresh Node
// process (no vitest setup file, so none of test/setup.mjs's Foundry
// stand-ins) imports the index and each listed file, and every one must load.
// The child process is the point: this suite's own setup installs `game`,
// `foundry`, and the rest, which would hide a file that needs them.
//
// (Map Dreamer's apps/map-dreamer/test/fork-loads.test.mjs checks the same
// from the other side, through the index.)
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "src", "map", "scrapboard");
const INDEX = join(DIR, "index.js");

// index.js namespace names, by file (the names consumers import)
const NAMES = {
  "model.js": "model",
  "hits.js": "hits",
  "controls.js": "controls",
  "paint.js": "paint",
  "richtext.js": "richtext",
  "changes.js": "changes",
  "baked.js": "baked",
  "boardfile.js": "boardfile",
  "roof-rule.js": "roofRule",
  "actor-tools.js": "actorTools",
  "rail-groups.js": "railGroups",
  "live.js": "live",
};

// run in the child: every forbidden global must be absent, then import
const CHILD = `
const absent = ["game", "canvas", "ui", "foundry", "Hooks", "CONFIG", "PIXI", "window", "document"];
const present = absent.filter((g) => typeof globalThis[g] !== "undefined");
if (present.length) throw new Error("globals present in the plain process: " + present.join(", "));
const files = JSON.parse(process.argv[1]);
const out = {};
for (const [file, name] of Object.entries(files)) {
  const ns = await import(process.argv[2] + file);
  out[file] = Object.keys(ns).length;
  if (!out[file]) throw new Error(file + " exports nothing");
}
const index = await import(process.argv[3]);
out.index = Object.keys(index).filter((k) => k !== "PURE_FILES").sort();
out.listed = [...index.PURE_FILES];
console.log(JSON.stringify(out));
`;

describe("the board's pure surface (scrapboard/index.js)", () => {
  it("lists exactly the files this test knows, each a file on disk", () => {
    const text = readFileSync(INDEX, "utf8");
    const exported = [...text.matchAll(/^export \* as (\w+) from "\.\/([\w-]+\.js)";$/gm)].map((m) => [m[2], m[1]]);
    expect(Object.fromEntries(exported)).toEqual(NAMES);
    for (const f of Object.keys(NAMES)) expect(existsSync(join(DIR, f)), f).toBe(true);
  });

  it("loads the index and every listed file in a plain Node process, with no Foundry, PIXI, or DOM global", () => {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD, JSON.stringify(NAMES), pathToFileURL(DIR).href + "/", pathToFileURL(INDEX).href], {
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 60000,
    });
    const out = JSON.parse(stdout.trim().split("\n").pop());
    expect(out.index).toEqual(Object.values(NAMES).sort());
    expect(out.listed.slice().sort()).toEqual(Object.keys(NAMES).sort());
    for (const f of Object.keys(NAMES)) expect(out[f], f).toBeGreaterThan(0);
  });
});
