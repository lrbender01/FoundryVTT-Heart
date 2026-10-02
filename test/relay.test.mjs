/**
 * The GM relay (src/common/relay.js, 2026-10-02): one queue, local when no
 * other GM is connected, request / response over the socket otherwise, and
 * askGM's reporting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerRelayHandler,
  runQueued,
  relay,
  askGM,
  onRelayMessage,
  RelayTimeout,
  RELAY_CHANNEL,
} from "../src/common/relay.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function users({ gm = null } = {}) {
  return Object.assign(new Map(), { activeGM: gm });
}

beforeEach(() => {
  game.user = { id: "player", isGM: false };
  game.users = users();
  game.socket = { emit: vi.fn(), on: vi.fn() };
  foundry.utils.randomID = () => "req-1";
});

afterEach(() => {
  vi.useRealTimers();
  delete game.socket;
  delete game.users;
});

describe("the queue", () => {
  it("runs one handler at a time, in order", async () => {
    const log = [];
    registerRelayHandler("slow", async ({ n }) => {
      log.push(`start ${n}`);
      await tick(10);
      log.push(`end ${n}`);
      return n;
    });
    const results = await Promise.all([runQueued("slow", { n: 1 }), runQueued("slow", { n: 2 })]);
    expect(results).toEqual([1, 2]);
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("a failure is the caller's and never blocks the next", async () => {
    registerRelayHandler("boom", async () => {
      throw new Error("no");
    });
    registerRelayHandler("fine", async () => "ok");
    await expect(runQueued("boom")).rejects.toThrow("no");
    await expect(runQueued("fine")).resolves.toBe("ok");
  });

  it("an unknown operation rejects", async () => {
    await expect(runQueued("nope")).rejects.toThrow(/no relay handler/);
  });
});

describe("relay()", () => {
  it("runs here when no GM is connected", async () => {
    const fn = vi.fn(async (data, userId) => ({ data, userId }));
    registerRelayHandler("here", fn);
    await expect(relay("here", { a: 1 })).resolves.toEqual({ data: { a: 1 }, userId: "player" });
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("runs here when this client is the active GM", async () => {
    game.user = { id: "gm", isGM: true };
    game.users = users({ gm: { id: "gm", isSelf: true } });
    registerRelayHandler("gm-here", async () => "done");
    await expect(relay("gm-here")).resolves.toBe("done");
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("asks the active GM's client and resolves with its answer", async () => {
    game.users = users({ gm: { id: "gm", isSelf: false } });
    const asked = relay("remote", { x: 1 });
    expect(game.socket.emit).toHaveBeenCalledWith(RELAY_CHANNEL, {
      kind: "request",
      id: "req-1",
      op: "remote",
      data: { x: 1 },
      from: "player",
      to: "gm",
    });
    await onRelayMessage({ kind: "response", id: "req-1", to: "player", result: { status: "done" }, error: null });
    await expect(asked).resolves.toEqual({ status: "done" });
  });

  it("rejects with the GM's error", async () => {
    game.users = users({ gm: { id: "gm", isSelf: false } });
    const asked = relay("remote");
    await onRelayMessage({ kind: "response", id: "req-1", to: "player", result: null, error: "bad" });
    await expect(asked).rejects.toThrow("bad");
  });

  it("times out when the GM's client never answers", async () => {
    vi.useFakeTimers();
    game.users = users({ gm: { id: "gm", isSelf: false } });
    const asked = relay("remote");
    vi.advanceTimersByTime(16000);
    await expect(asked).rejects.toBeInstanceOf(RelayTimeout);
  });
});

describe("the GM's side", () => {
  it("answers a request addressed to it, through the queue", async () => {
    game.user = { id: "gm", isGM: true };
    registerRelayHandler("serve", async (data, userId) => ({ status: "done", data, userId }));
    await onRelayMessage({ kind: "request", id: "r9", op: "serve", data: { y: 2 }, from: "player", to: "gm" });
    expect(game.socket.emit).toHaveBeenCalledWith(RELAY_CHANNEL, {
      kind: "response",
      id: "r9",
      to: "player",
      result: { status: "done", data: { y: 2 }, userId: "player" },
      error: null,
    });
  });

  it("ignores a request for another GM", async () => {
    game.user = { id: "gm2", isGM: true };
    const fn = vi.fn();
    registerRelayHandler("not-mine", fn);
    await onRelayMessage({ kind: "request", id: "r1", op: "not-mine", data: {}, from: "player", to: "gm" });
    expect(fn).not.toHaveBeenCalled();
    expect(game.socket.emit).not.toHaveBeenCalled();
  });

  it("reports a failing handler as an error answer", async () => {
    game.user = { id: "gm", isGM: true };
    vi.spyOn(console, "error").mockImplementation(() => {});
    registerRelayHandler("fails", async () => {
      throw new Error("broke");
    });
    await onRelayMessage({ kind: "request", id: "r2", op: "fails", data: {}, from: "player", to: "gm" });
    expect(game.socket.emit.mock.calls[0][1]).toMatchObject({ kind: "response", id: "r2", error: "broke" });
  });
});

describe("askGM()", () => {
  it("returns a done answer", async () => {
    registerRelayHandler("ok", async () => ({ status: "done", value: 3 }));
    await expect(askGM("ok")).resolves.toEqual({ status: "done", value: 3 });
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["already", "heart.relay.already"],
    ["not-allowed", "heart.relay.not-allowed"],
    ["missing", "heart.relay.missing"],
    ["needs-gm", "heart.relay.needs-gm"],
    ["no-party", "heart.party.no-party"],
    ["something-else", "heart.relay.failed"],
  ])("tells the user why on '%s' and returns null", async (status, key) => {
    registerRelayHandler(`status-${status}`, async () => ({ status }));
    await expect(askGM(`status-${status}`)).resolves.toBeNull();
    expect(ui.notifications.warn).toHaveBeenCalledWith(key);
  });

  it("says the GM didn't answer on a timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    game.users = users({ gm: { id: "gm", isSelf: false } });
    const asked = askGM("remote");
    vi.advanceTimersByTime(16000);
    await expect(asked).resolves.toBeNull();
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.relay.no-answer");
  });
});
