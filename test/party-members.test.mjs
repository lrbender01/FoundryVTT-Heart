/**
 * The party sheet's member cards in balanced rows (src/actors/party/view.js
 * memberRows, 2026-10-02, Luke): three across at most, as even as they go,
 * the fuller rows first (the sheet centres each row).
 */

import { describe, it, expect } from "vitest";
import { memberRows } from "../src/actors/party/view.js";

const sizes = (n) => memberRows(Array.from({ length: n }, (_, i) => i)).map((r) => r.length);

describe("memberRows", () => {
  it("balances the rows Luke named", () => {
    expect(sizes(4)).toEqual([2, 2]);
    expect(sizes(5)).toEqual([3, 2]);
  });

  it("fills one row up to three", () => {
    expect(sizes(0)).toEqual([]);
    expect(sizes(1)).toEqual([1]);
    expect(sizes(2)).toEqual([2]);
    expect(sizes(3)).toEqual([3]);
  });

  it("spreads larger parties evenly, fuller rows first", () => {
    expect(sizes(6)).toEqual([3, 3]);
    expect(sizes(7)).toEqual([3, 2, 2]);
    expect(sizes(8)).toEqual([3, 3, 2]);
    expect(sizes(10)).toEqual([3, 3, 2, 2]);
  });

  it("keeps the members in order", () => {
    expect(memberRows(["a", "b", "c", "d", "e"])).toEqual([["a", "b", "c"], ["d", "e"]]);
  });
});
