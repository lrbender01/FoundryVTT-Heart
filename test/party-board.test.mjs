/**
 * The party's note board (src/actors/party/board.js, 2026-10-02): notes as
 * an object keyed by id (so concurrent writers touch different keys), board
 * order, the updates that add, edit, and remove a note, and the one-time move
 * of the old single Notes text onto the board.
 */

import { describe, it, expect } from "vitest";
import {
  boardNotes,
  nextSort,
  noteUpdate,
  noteRemoval,
  isBlankText,
  legacyNotesUpdate,
  boardClear,
} from "../src/actors/party/board.js";

const board = {
  b: { title: "Second", text: "<p>two</p>", sort: 1 },
  a: { title: "First", text: "<p>one</p>", sort: 0 },
  c: { title: "Third", text: "", sort: 1 },
};

describe("board order", () => {
  it("by sort, then id; every field filled", () => {
    expect(boardNotes(board).map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(boardNotes({ x: { title: 7 } })[0]).toEqual({ id: "x", title: "7", text: "", sort: 0 });
  });

  it("an empty or broken board is no notes", () => {
    expect(boardNotes(undefined)).toEqual([]);
    expect(boardNotes({ x: null, y: "junk" })).toEqual([]);
  });

  it("a new note goes last", () => {
    expect(nextSort(board)).toBe(2);
    expect(nextSort({})).toBe(0);
  });
});

describe("updates", () => {
  it("a new note writes its place; an edit keeps it", () => {
    expect(noteUpdate("n1", { title: "  Rumours ", text: "<p>x</p>" }, 3)).toEqual({ "system.board.n1": { title: "Rumours", text: "<p>x</p>", sort: 3 } });
    expect(noteUpdate("n1", { title: "R", text: "" })).toEqual({ "system.board.n1": { title: "R", text: "" } });
  });

  it("each note is its own key, so two writers don't collide", () => {
    const one = noteUpdate("p", { title: "P" }, 0);
    const two = noteUpdate("q", { title: "Q" }, 0);
    expect(Object.keys({ ...one, ...two })).toEqual(["system.board.p", "system.board.q"]);
  });

  it("removing deletes the key", () => {
    expect(noteRemoval("a")).toEqual({ "system.board.-=a": null });
    expect(boardClear(board)).toEqual({ "system.board.-=b": null, "system.board.-=a": null, "system.board.-=c": null });
    expect(boardClear(undefined)).toEqual({});
  });
});

describe("the old Notes text", () => {
  it("blank text: nothing, only tags, or spaces", () => {
    expect(isBlankText("")).toBe(true);
    expect(isBlankText("<p></p><p>&nbsp;</p>")).toBe(true);
    expect(isBlankText("<p>Hi</p>")).toBe(false);
  });

  it("becomes the first note, once, and the old field empties", () => {
    expect(legacyNotesUpdate({ notes: "<p>Owe the Red Market 3 favours</p>", board: {} }, "z", "Notes")).toEqual({
      "system.board.z": { title: "Notes", text: "<p>Owe the Red Market 3 favours</p>", sort: 0 },
      "system.notes": "",
    });
  });

  it("nothing to move, or a board already in use: no update", () => {
    expect(legacyNotesUpdate({ notes: "<p></p>", board: {} }, "z", "Notes")).toBeNull();
    expect(legacyNotesUpdate({ notes: "<p>x</p>", board }, "z", "Notes")).toBeNull();
    expect(legacyNotesUpdate(undefined, "z", "Notes")).toBeNull();
  });
});
