// The Heart board's pure surface: the one entry point other code imports
// (2026-10-27, ecosystem audit). Map Dreamer, the content tools, and the
// Plenty checks write `import { model, paint } from ".../scrapboard/index.js"`
// (or `heart-system/scrapboard` through the package's exports map) instead of
// reaching for deep file paths.
//
// What "pure" means here: importing the file needs no Foundry, PIXI, or DOM
// global. Nothing at the top of the file touches `game`, `canvas`, `ui`,
// `foundry`, `Hooks`, `CONFIG`, `PIXI`, `window`, `document`, or
// `localStorage`; a DOM is reached only inside functions that are handed one
// (a `doc` argument) or that are called where a browser exists (the painter
// makes canvases inside `createPainter`).
//
// THE RULE: a file listed here must stay that way. Two things hold the line:
// the root eslint.config.mjs restricts those globals in exactly these files,
// and test/scrapboard-pure.test.mjs imports every one of them in plain Node
// with the globals absent. A file that needs Foundry (layer.js, render.js,
// api.js, look.js, the windows, and the rest) does not belong in this list.
export * as model from "./model.js";
export * as hits from "./hits.js";
export * as controls from "./controls.js";
export * as paint from "./paint.js";
export * as richtext from "./richtext.js";
export * as changes from "./changes.js";
export * as baked from "./baked.js";
export * as boardfile from "./boardfile.js";
export * as roofRule from "./roof-rule.js";
export * as actorTools from "./actor-tools.js";
export * as railGroups from "./rail-groups.js";
export * as live from "./live.js";

// The files above, by file name, for the lint rule and the load test.
export const PURE_FILES = Object.freeze([
  "model.js",
  "hits.js",
  "controls.js",
  "paint.js",
  "richtext.js",
  "changes.js",
  "baked.js",
  "boardfile.js",
  "roof-rule.js",
  "actor-tools.js",
  "rail-groups.js",
  "live.js",
]);
