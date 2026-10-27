// Pull views to mine (Session scripting): the slide's length, and who may pull.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pullDuration, PULL_MIN_MS, PULL_MAX_MS } from "../src/common/pull-view.js";
import { onRelayMessage, onView, sendView, RELAY_CHANNEL } from "../src/common/relay.js";

const screen = { w: 1600, h: 900 };
const at = (x, y, scale = 1) => ({ x, y, scale });

describe("pullDuration", () => {
  it("is about a second for a short hop", () => {
    expect(pullDuration(at(0, 0), at(50, 20), screen)).toBeLessThan(1200);
    expect(pullDuration(at(0, 0), at(0, 0), screen)).toBe(PULL_MIN_MS);
  });

  it("grows with the distance in screens", () => {
    const near = pullDuration(at(0, 0), at(1000, 0), screen);
    const far = pullDuration(at(0, 0), at(3000, 0), screen);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(PULL_MIN_MS);
  });

  it("counts the way as the player sees it, so a zoomed-out view is quicker", () => {
    const close = pullDuration(at(0, 0, 2), at(2000, 0, 2), screen);
    const wide = pullDuration(at(0, 0, 0.25), at(2000, 0, 0.25), screen);
    expect(wide).toBeLessThan(close);
  });

  it("adds a little for a change of zoom", () => {
    expect(pullDuration(at(0, 0, 1), at(0, 0, 4), screen)).toBeGreaterThan(PULL_MIN_MS);
  });

  it("never passes the cap, however far", () => {
    expect(pullDuration(at(0, 0), at(1e7, 1e7, 3), screen)).toBe(PULL_MAX_MS);
  });

  it("never fails on odd input", () => {
    expect(pullDuration(undefined, undefined, undefined)).toBe(PULL_MIN_MS);
    expect(pullDuration(at(0, 0, 0), at(NaN, 5), screen)).toBeGreaterThanOrEqual(PULL_MIN_MS);
  });
});

describe("the view message", () => {
  beforeEach(() => {
    game.user = { id: "player", isGM: false };
    game.users = new Map([["gm", { id: "gm", isGM: true }], ["player", { id: "player", isGM: false }], ["p2", { id: "p2", isGM: false }]]);
    game.socket = { emit: vi.fn(), on: vi.fn() };
  });
  afterEach(() => {
    onView(null);
    delete game.socket;
    delete game.users;
  });

  it("is sent as a view broadcast from this user", () => {
    game.user = { id: "gm", isGM: true };
    sendView({ what: "pull", sceneId: "s1", x: 1, y: 2, scale: 3 });
    expect(game.socket.emit).toHaveBeenCalledWith(RELAY_CHANNEL, { what: "pull", sceneId: "s1", x: 1, y: 2, scale: 3, kind: "view", from: "gm" });
  });

  it("reaches the handler when a GM sent it", async () => {
    const seen = vi.fn();
    onView(seen);
    await onRelayMessage({ kind: "view", what: "pull", from: "gm" }, "gm");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("is ignored from a player, from an unknown sender, or in a GM's name", async () => {
    const seen = vi.fn();
    onView(seen);
    await onRelayMessage({ kind: "view", from: "p2" }, "p2");
    await onRelayMessage({ kind: "view", from: "gm" }, undefined);
    await onRelayMessage({ kind: "view", from: "gm" }, "p2");
    expect(seen).not.toHaveBeenCalled();
  });

  it("is not followed by the GM who sent it", async () => {
    game.user = { id: "gm", isGM: true };
    const seen = vi.fn();
    onView(seen);
    await onRelayMessage({ kind: "view", from: "gm" }, "gm");
    expect(seen).not.toHaveBeenCalled();
  });
});
