/**
 * Who may move what on the scrapboard map (src/map/scrapboard/notes.js,
 * 2026-10-02, Luke): the GM anything; a player only their own notes and
 * writing (never another player's, the GM's, or a landmark). The GM's relay
 * checks the same rule before it writes a player's move.
 */

import { describe, it, expect } from "vitest";
import { mayMove, HANDS, paintOrder, paintName, pinName } from "../src/map/scrapboard/notes.js";
import { PAINT_ORDER } from "../src/map/scrapboard/model.js";

describe("the paints' and pins' names (2026-10-21)", () => {
  it("orders the paints as the palette does, any more the look has after", () => {
    expect(paintOrder(80)).toEqual(PAINT_ORDER);
    expect(paintOrder(82).slice(-2)).toEqual([80, 81]);
    expect(paintOrder(3)).toEqual([0, 1, 2]);
  });

  it("names a paint in this language, else in English, else Paint n", () => {
    expect(paintName(0)).toBe("Bone");
    expect(paintName(80)).toBe("heart.board.paint-n{n=81}");
    game.i18n.has = (k) => k === "heart.board.paint.blood";
    try {
      expect(paintName(1)).toBe("heart.board.paint.blood");
      expect(paintName(2)).toBe("Rust");
    } finally {
      delete game.i18n.has;
    }
  });

  it("names a pin by its key, else by its file's name", () => {
    expect(pinName("tx/fixtures__fixture_iron_t_pin")).toBe("iron t pin");
    game.i18n.has = () => true;
    try {
      expect(pinName("tx/fixtures__fixture_iron_t_pin")).toBe("heart.board.pin.iron_t_pin");
    } finally {
      delete game.i18n.has;
    }
  });
});

const gm = { id: "gm", isGM: true };
const ana = { id: "ana", isGM: false };

describe("who may move what", () => {
  it("lets the GM move anything", () => {
    expect(mayMove({ type: "landmark", lib: "grip" }, gm)).toBe(true);
    expect(mayMove({ type: "note", author: "ana" }, gm)).toBe(true);
  });

  it("lets a player move only their own notes and writing", () => {
    expect(mayMove({ type: "note", author: "ana" }, ana)).toBe(true);
    expect(mayMove({ type: "scrawl", author: "ana" }, ana)).toBe(true);
    expect(mayMove({ type: "note", author: "bo" }, ana)).toBe(false);
    expect(mayMove({ type: "note" }, ana)).toBe(false);
    expect(mayMove({ type: "landmark", author: "ana" }, ana)).toBe(false);
    expect(mayMove(null, ana)).toBe(false);
  });

  it("offers every handwriting face the map can write in", () => {
    expect(HANDS).toContain("Reenie Beanie");
    expect(HANDS.length).toBe(13);
  });
});
