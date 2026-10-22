/**
 * One click at a time (src/common/busy.js, 2026-10-02; tests added
 * 2026-10-21, audit R28): the same key is refused while its work runs, the
 * button is switched off and back on, and a failure is reported once.
 */

import { describe, it, expect, vi } from "vitest";
import { oneAtATime } from "../src/common/busy.js";

// a button element as busy.js touches it: disabled and classList
const el = () => {
  const classes = new Set();
  return {
    disabled: false,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
  };
};

describe("oneAtATime", () => {
  it("refuses the same key while it runs, and runs it again once done", async () => {
    let release;
    const work = vi.fn(() => new Promise((r) => (release = r)));
    const first = oneAtATime("m1:take-stress", null, work);
    expect(await oneAtATime("m1:take-stress", null, work)).toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);
    release("done");
    expect(await first).toBe("done");
    expect(await oneAtATime("m1:take-stress", null, async () => "again")).toBe("again");
  });

  it("other keys run meanwhile", async () => {
    let release;
    const first = oneAtATime("m1:a", null, () => new Promise((r) => (release = r)));
    expect(await oneAtATime("m1:b", null, async () => "b")).toBe("b");
    release();
    await first;
  });

  it("switches the button off while it runs, and back on after", async () => {
    const b = el();
    let seen;
    await oneAtATime("k", b, async () => {
      seen = { disabled: b.disabled, busy: b.classList.has("heart-busy") };
    });
    expect(seen).toEqual({ disabled: true, busy: true });
    expect(b.disabled).toBe(false);
    expect(b.classList.has("heart-busy")).toBe(false);
  });

  it("takes a jQuery button too", async () => {
    const b = el();
    const jq = { jquery: "3", 0: b };
    await oneAtATime("k", jq, async () => expect(b.disabled).toBe(true));
    expect(b.disabled).toBe(false);
  });

  it("a failure is logged and reported once, the button comes back, and the key frees", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = el();
    const answer = await oneAtATime("k", b, async () => {
      throw new Error("broke");
    });
    expect(answer).toBeUndefined();
    expect(ui.notifications.error).toHaveBeenCalledTimes(1);
    expect(ui.notifications.error).toHaveBeenCalledWith("heart.relay.failed");
    expect(error).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(false);
    expect(await oneAtATime("k", b, async () => "ok")).toBe("ok");
    error.mockRestore();
  });
});
