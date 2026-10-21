/**
 * New actors' token defaults (Luke, 2026-10-21): a delver's, the party's,
 * and a companion's token is the actor itself; a delver's first bar shows
 * its total Stress; adversaries stay unlinked.
 */
import { describe, it, expect } from "vitest";
import { tokenDefaults } from "../src/actors/token-defaults.js";

describe("token defaults", () => {
  it("links delvers, the party, and companions; bars a delver's total Stress", () => {
    expect(tokenDefaults("character")).toEqual({ actorLink: true, bar1: { attribute: "totalStress" } });
    expect(tokenDefaults("party")).toEqual({ actorLink: true });
    expect(tokenDefaults("hireling")).toEqual({ actorLink: true });
  });
  it("leaves adversaries, landmarks, and delves as Foundry makes them", () => {
    for (const t of ["adversary", "landmark", "delve"]) expect(tokenDefaults(t)).toBeNull();
  });
});
