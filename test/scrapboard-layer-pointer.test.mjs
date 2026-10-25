/**
 * The Heart map's layer hears the pointer (Luke, 2026-10-25: the doodle's
 * ghost, the eraser's ring, and the reticle went for good after a scene
 * change). Foundry draws a scene by activating the layer last in hand, then
 * clearing every listener on canvas.stage (Canvas #addListeners); a listener
 * the layer had put on the stage was lost, and the layer, still active, never
 * put it back. The layer now listens on itself ('globalpointermove', which
 * PIXI sends every interactive object, and Foundry makes the layer
 * interactive while it is active).
 *
 * Built over stand-ins for PIXI's event emitter, Foundry's InteractionLayer,
 * and a bare document: only what constructing the layer and its pointer
 * handler reach.
 */

import { describe, it, expect, beforeAll } from "vitest";

class Emitter {
  constructor() {
    this.handlers = {};
  }
  on(type, fn) {
    (this.handlers[type] ??= []).push(fn);
    return this;
  }
  off(type, fn) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((f) => f !== fn);
    return this;
  }
  removeAllListeners() {
    this.handlers = {};
    return this;
  }
  emit(type, ...args) {
    for (const fn of this.handlers[type] ?? []) fn(...args);
  }
}

let ScrapboardLayer;
let stage;

beforeAll(async () => {
  const ctx = { font: "", measureText: () => ({ width: 0 }) };
  globalThis.document = { createElement: () => ({ getContext: () => ctx }), getElementById: () => null, body: { append() {} } };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.InteractionLayer = class extends Emitter {
    static get layerOptions() {
      return {};
    }
    get active() {
      return Boolean(this._active);
    }
  };
  foundry.utils.debounce = (fn) => fn;
  stage = new Emitter();
  globalThis.canvas = { stage, app: { view: { addEventListener() {}, removeEventListener() {} } } };
  ({ ScrapboardLayer } = await import("../src/map/scrapboard/layer.js"));
});

describe("the layer hears the pointer on itself", () => {
  it("never on canvas.stage, so Foundry clearing the stage as a scene is drawn leaves it hearing", () => {
    const layer = new ScrapboardLayer();
    expect(layer.handlers.globalpointermove).toHaveLength(1);
    layer._activate();
    expect(Object.values(stage.handlers).flat()).toHaveLength(0);
    // (Foundry's order: the layer activated, then the stage's listeners cleared)
    stage.removeAllListeners();
    expect(layer.handlers.globalpointermove).toHaveLength(1);
    layer._deactivate();
    expect(layer.handlers.globalpointermove).toHaveLength(1);
  });

  it("a move Foundry makes up (no button down) leaves a drag going; a real one with no button ends it", () => {
    const layer = new ScrapboardLayer();
    const hover = layer.handlers.globalpointermove[0];
    layer.controls.drag = { kind: "mark", pts: [0, 0] };
    hover({ buttons: 0, nativeEvent: { isTrusted: false } });
    expect(layer.controls.drag).not.toBeNull();
    hover({ buttons: 1, nativeEvent: { isTrusted: true } });
    expect(layer.controls.drag).not.toBeNull();
    hover({ buttons: 0, nativeEvent: { isTrusted: true } });
    expect(layer.controls.drag).toBeNull();
  });
});
