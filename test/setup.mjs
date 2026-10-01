/**
 * Vitest setup: Foundry globals for the Heart fork's rules tests
 * (2026-09-30, Luke).
 *
 * Stubs ONLY what the tested modules touch, in the shape the toolkit's
 * test/setup.mjs uses: game.i18n (keys come back as themselves, so tests can
 * assert which string was asked for), game.actors (a Map the helpers fill),
 * game.heart (the party, if a test sets one), Handlebars.escapeExpression,
 * foundry.utils, and ui.notifications. Add a stub here when a newly tested
 * module needs one; never import a module that pulls in .html or .sass.
 */

import { beforeEach, vi } from "vitest";

// game.actors: Foundry's WorldCollection, as far as the rules read it
class MockActors extends Map {
  /** @param {(a: any) => boolean} fn */
  find(fn) {
    return [...this.values()].find(fn);
  }
  /** @param {(a: any) => boolean} fn */
  filter(fn) {
    return [...this.values()].filter(fn);
  }
}

/** @type {any} */
globalThis.game = {
  user: { id: "mock-user", name: "Test", isGM: false },
  i18n: {
    lang: "en",
    /** @type {(k: string) => string} */
    localize: (k) => k,
    // "key{a=1,b=2}" so a test can see both the key and the data
    /** @type {(k: string, d?: Record<string, any>) => string} */
    format: (k, d = {}) =>
      `${k}{${Object.entries(d)
        .map(([a, b]) => `${a}=${b}`)
        .join(",")}}`,
  },
  actors: new MockActors(),
  heart: {},
};

// Handlebars.escapeExpression, as Handlebars itself escapes
const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;",
  "=": "&#x3D;",
};
/** @type {any} */
globalThis.Handlebars = {
  /** @param {any} s */
  escapeExpression: (s) => String(s ?? "").replace(/[&<>"'`=]/g, (c) => ESCAPES[c]),
};

/** @type {any} */
globalThis.foundry = {
  utils: {
    mergeObject: (a, b) => Object.assign(a, b),
    getProperty: (obj, path) => {
      if (!obj || !path) return undefined;
      return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
    },
  },
};

/** @type {any} */
globalThis.ui = {
  notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
};

// every test starts with no actors, no party, and clean notification spies
beforeEach(() => {
  game.actors.clear();
  game.heart = {};
  vi.clearAllMocks();
});
