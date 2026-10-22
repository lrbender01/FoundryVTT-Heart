/**
 * A player's bond request card (src/bonds/flow.js), answered by the GM:
 * one answer per card at a time (2026-10-21, audit R12: both clicks of a
 * double-click passed the "already bonded" check, so a person bond could be
 * added twice), then the buttons are replaced by the outcome line.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/bonds/bonds", () => ({
  HIRELING_TYPE: "hireling",
  bondsOf: () => [],
  hire: vi.fn(),
  addBond: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 5));
    return { name: "Old Tam" };
  }),
}));
vi.mock("../src/bonds/dialogs", () => ({ hireDialog: vi.fn() }));

const { answerBondRequest } = await import("../src/bonds/flow.js");
const { addBond } = await import("../src/bonds/bonds");
const { resetWorld, fakeActor, fakeMessage, unescaped } = await import("./helpers.mjs");

const card = () =>
  fakeMessage({
    content: '<div class="ledger"><div class="ledger-acts"><button data-action="bond-request-add"></button></div></div>',
    flags: { heart: { bondRequest: { characterId: "vess", actorUuid: "Actor.tam" } } },
  });
const button = (action) => ({ dataset: { action }, classList: { add() {}, remove() {} }, disabled: false });

beforeEach(() => {
  resetWorld();
  fakeActor({ id: "vess", name: "Vess" });
  fakeActor({ id: "tam", name: "Old Tam", type: "npc" });
  addBond.mockClear();
});

describe("answering a bond request", () => {
  it("a double-click on Add bond adds one bond", async () => {
    const msg = card();
    const request = msg.getFlag("heart", "bondRequest");
    await Promise.all([
      answerBondRequest(msg, request, button("bond-request-add")),
      answerBondRequest(msg, request, button("bond-request-add")),
    ]);
    expect(addBond).toHaveBeenCalledTimes(1);
    expect(msg.flags.heart.bondRequest.settled).toBe(true);
    expect(unescaped(msg.content)).toContain("heart.bond.request.added{bond=Old Tam,name=Vess}");
    expect(msg.content).not.toContain("ledger-acts");
  });

  it("a settled card is left alone", async () => {
    const msg = card();
    const request = msg.getFlag("heart", "bondRequest");
    await answerBondRequest(msg, request, button("bond-request-decline"));
    expect(unescaped(msg.content)).toContain("heart.bond.request.declined{name=Vess}");
    await answerBondRequest(msg, request, button("bond-request-add"));
    expect(addBond).not.toHaveBeenCalled();
  });
});
