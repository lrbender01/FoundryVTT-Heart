/**
 * Who may move what on the scrapboard map (src/map/scrapboard/notes.js,
 * 2026-10-02, Luke): the GM anything; a player only their own notes and
 * writing (never another player's, the GM's, or a landmark). The GM's relay
 * checks the same rule before it writes a player's move.
 */

import { describe, it, expect } from "vitest";
import { mayMove, HANDS } from "../src/map/scrapboard/notes.js";

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
