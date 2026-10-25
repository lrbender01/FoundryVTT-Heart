/**
 * New actors' token defaults (Luke, 2026-10-21): a delver's, the party's,
 * and a companion's token is the actor itself; a delver's first bar shows
 * its total Stress; adversaries stay unlinked.
 */
import { describe, it, expect } from "vitest";
import { tokenDefaults, pcTokenFix } from "../src/actors/token-defaults.js";

describe("a player's delver's token (Luke, 2026-10-25)", () => {
  const modes = { friendly: 1, hover: 30 };
  it("takes the sheet's portrait, friendly, its name shown on hover", () => {
    const t = { texture: { src: "icons/svg/mystery-man.svg" }, disposition: -1, displayName: 0 };
    expect(pcTokenFix(t, "worlds/x/ana.webp", modes)).toEqual({ "texture.src": "worlds/x/ana.webp", disposition: 1, displayName: 30 });
  });
  it("nothing to change once it is so; no portrait, the token's own picture kept", () => {
    expect(pcTokenFix({ texture: { src: "a.webp" }, disposition: 1, displayName: 30 }, "a.webp", modes)).toEqual({});
    expect(pcTokenFix({ texture: { src: "a.webp" }, disposition: 1, displayName: 30 }, "", modes)).toEqual({});
  });
});

describe("token defaults", () => {
  it("links delvers, the party, and companions; bars a delver's total Stress", () => {
    expect(tokenDefaults("character")).toEqual({ actorLink: true, bar1: { attribute: "totalStress" } });
    expect(tokenDefaults("party")).toEqual({ actorLink: true });
    expect(tokenDefaults("hireling")).toEqual({ actorLink: true });
  });
  it("links a familiar (The Witch is Dead, 2026-10-24), with no Heart bar", () => {
    expect(tokenDefaults("familiar")).toEqual({ actorLink: true });
  });
  it("leaves adversaries, landmarks, and delves as Foundry makes them", () => {
    for (const t of ["adversary", "landmark", "delve"]) expect(tokenDefaults(t)).toBeNull();
  });
});
