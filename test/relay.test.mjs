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
  HANDLER_LIMIT_MS,
  LIVE_MAX,
  runLocal,
  onLive,
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

  // 2026-10-21 (R16): one stuck handler stalled every later request
  it("a handler that never answers times out, and the queue moves on", async () => {
    vi.useFakeTimers();
    registerRelayHandler("stuck", () => new Promise(() => {}));
    registerRelayHandler("after", async () => "next");
    const stuck = runQueued("stuck");
    const next = runQueued("after");
    const stuckDone = expect(stuck).rejects.toBeInstanceOf(RelayTimeout);
    await vi.advanceTimersByTimeAsync(HANDLER_LIMIT_MS + 1);
    await stuckDone;
    await expect(next).resolves.toBe("next");
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
      sent: expect.any(Number),
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

  // 2026-10-21 (R5): Foundry's server passes the real sender's id
  it("runs a request as the user Foundry says sent it", async () => {
    game.user = { id: "gm", isGM: true };
    registerRelayHandler("who", async (data, userId) => ({ status: "done", userId }));
    await onRelayMessage({ kind: "request", id: "r3", op: "who", data: {}, from: "player", to: "gm" }, "player");
    expect(game.socket.emit.mock.calls[0][1]).toMatchObject({ to: "player", result: { status: "done", userId: "player" } });
  });

  it("refuses a request whose `from` is not its sender", async () => {
    game.user = { id: "gm", isGM: true };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn(async () => ({ status: "done" }));
    registerRelayHandler("spoofed", fn);
    await onRelayMessage({ kind: "request", id: "r4", op: "spoofed", data: {}, from: "gm", to: "gm" }, "player");
    expect(fn).not.toHaveBeenCalled();
    expect(game.socket.emit).toHaveBeenCalledWith(RELAY_CHANNEL, {
      kind: "response",
      id: "r4",
      to: "player",
      result: { status: "not-allowed" },
      error: null,
    });
  });

  it("takes an answer only from a GM's client", async () => {
    game.users = Object.assign(new Map([["gm", { id: "gm", isGM: true }], ["p2", { id: "p2", isGM: false }]]), {
      activeGM: { id: "gm", isSelf: false },
    });
    const asked = relay("remote");
    await onRelayMessage({ kind: "response", id: "req-1", to: "player", result: { status: "done", forged: true }, error: null }, "p2");
    await onRelayMessage({ kind: "response", id: "req-1", to: "player", result: { status: "done" }, error: null }, "gm");
    await expect(asked).resolves.toEqual({ status: "done" });
  });

  // 2026-10-25 (the health audit, A10): a request's time counts from when it
  // was sent, and one asked again under its id is never done twice
  it("lets a request go unrun once its asker has stopped waiting", async () => {
    game.user = { id: "gm", isGM: true };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn(async () => ({ status: "done" }));
    registerRelayHandler("late", fn);
    await onRelayMessage({ kind: "request", id: "r5", op: "late", data: {}, from: "player", to: "gm", sent: Date.now() - HANDLER_LIMIT_MS - 1 }, "player");
    expect(fn).not.toHaveBeenCalled();
    expect(game.socket.emit.mock.calls[0][1]).toMatchObject({ kind: "response", id: "r5", result: null, error: expect.any(String) });
  });

  it("lets a request queued behind a slow one go once its time is up", async () => {
    vi.useFakeTimers();
    game.user = { id: "gm", isGM: true };
    vi.spyOn(console, "error").mockImplementation(() => {});
    registerRelayHandler("hog", () => new Promise(() => {}));
    const fn = vi.fn(async () => ({ status: "done" }));
    registerRelayHandler("behind", fn);
    const hog = expect(runQueued("hog")).rejects.toBeInstanceOf(RelayTimeout);
    const asked = onRelayMessage({ kind: "request", id: "r6", op: "behind", data: {}, from: "player", to: "gm", sent: Date.now() }, "player");
    await vi.advanceTimersByTimeAsync(HANDLER_LIMIT_MS + 1);
    await hog;
    await asked;
    expect(fn).not.toHaveBeenCalled();
  });

  it("answers a request asked again under the same id without running it twice", async () => {
    game.user = { id: "gm", isGM: true };
    const fn = vi.fn(async () => ({ status: "done", n: fn.mock.calls.length }));
    registerRelayHandler("once", fn);
    const msg = { kind: "request", id: "r7", op: "once", data: {}, from: "player", to: "gm", sent: Date.now() };
    await onRelayMessage(msg, "player");
    await onRelayMessage({ ...msg }, "player");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(game.socket.emit).toHaveBeenCalledTimes(2);
    expect(game.socket.emit.mock.calls[1][1]).toMatchObject({ id: "r7", result: { status: "done", n: 1 } });
  });

  it("runs this client's own work in the handlers' queue (runLocal)", async () => {
    const log = [];
    let finish;
    registerRelayHandler("first", () => new Promise((r) => { finish = r; }).then(() => log.push("handler")));
    const first = runQueued("first");
    const mine = runLocal("mine", () => log.push("mine"));
    await tick();
    expect(log).toEqual([]);
    finish();
    await Promise.all([first, mine]);
    expect(log).toEqual(["handler", "mine"]);
  });

  it("drops a live message past LIVE_MAX unread", () => {
    const seen = vi.fn();
    onLive(seen);
    onRelayMessage({ kind: "live", from: "p2", what: "drag", pad: "x".repeat(LIVE_MAX) }, "p2");
    expect(seen).not.toHaveBeenCalled();
    onRelayMessage({ kind: "live", from: "p2", what: "drag" }, "p2");
    expect(seen).toHaveBeenCalledTimes(1);
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

  // 2026-10-25 (the health audit, B6): a request that wrote part of what it
  // asked hands back its undo even when it failed
  it("hands every answer to `seen`, done or not", async () => {
    registerRelayHandler("part", async () => ({ status: "failed", undo: { ops: [1] } }));
    const seen = vi.fn();
    await expect(askGM("part", {}, { seen })).resolves.toBeNull();
    expect(seen).toHaveBeenCalledWith({ status: "failed", undo: { ops: [1] } });
    expect(ui.notifications.warn).toHaveBeenCalledWith("heart.relay.failed");
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
