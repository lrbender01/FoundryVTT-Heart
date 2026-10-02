// Provisions house rule (reference/heart-rules/provisions.md): the party
// track's arithmetic (actors/party/rules.js), the party's derived data
// (provisionsOf), and the track display (provisionsView) (2026-09-30, Luke).

import { describe, it, expect } from "vitest";
import {
  PROVISIONS_MAX,
  CRITICAL_FROM,
  PARTY_FALLOUT_RESULTS,
  RESTOCK_RELIEF,
  SCAVENGE_RELIEF,
  UPKEEP_DIE,
  isPastRolling,
  partyFalloutResult,
  restockRelief,
  provisionsProtection,
  markedValue,
  relievedValue,
} from "../src/actors/party/rules.js";
import { provisionsOf, canVolunteer, canResign } from "../src/actors/party/party.js";
import { provisionsView, partyMembers } from "../src/actors/party/view.js";
import { makeActor, makeFallout, addActors } from "./helpers.mjs";

describe("the track", () => {
  it("has twenty boxes, the Critical line at 13, D4 upkeep, and D4 scavenging", () => {
    expect(PROVISIONS_MAX).toBe(20);
    expect(CRITICAL_FROM).toBe(13);
    expect(UPKEEP_DIE).toBe("d4");
    expect(SCAVENGE_RELIEF).toBe("d4");
  });

  it("isPastRolling: no check at the max (or over it)", () => {
    expect(isPastRolling(19)).toBe(false);
    expect(isPastRolling(20)).toBe(true);
    expect(isPastRolling(21)).toBe(true);
    expect(isPastRolling(10, 10)).toBe(true);
  });
});

describe("partyFalloutResult: d12 against Provisions", () => {
  it.each([
    // [d12, Provisions, result]
    [10, 9, "no-fallout"],
    [9, 9, "major-fallout"], // the rule's own example: a 9 against 9 is Major
    [7, 12, "major-fallout"],
    [12, 12, "major-fallout"],
    [6, 9, "minor-fallout"],
    [1, 1, "minor-fallout"],
    [2, 1, "no-fallout"],
    [1, 0, "no-fallout"],
  ])("a %i against %i is %s", (roll, total, result) => {
    expect(partyFalloutResult(roll, total)).toBe(result);
  });

  it("from 13, every check is fallout and Major becomes Critical", () => {
    for (let roll = 1; roll <= 12; roll++) {
      expect(partyFalloutResult(roll, 13)).toBe(roll <= 6 ? "minor-fallout" : "critical-fallout");
      expect(partyFalloutResult(roll, 19)).not.toBe("no-fallout");
    }
  });

  it("at 12 a 7+ is still only Major", () => {
    expect(partyFalloutResult(12, 12)).toBe("major-fallout");
  });

  it("at the max there is no check: always Critical", () => {
    for (let roll = 1; roll <= 12; roll++) {
      expect(partyFalloutResult(roll, 20)).toBe("critical-fallout");
    }
    expect(partyFalloutResult(1, 8, 8)).toBe("critical-fallout");
  });

  it("lists the four severities", () => {
    expect(PARTY_FALLOUT_RESULTS).toEqual(["no-fallout", "minor-fallout", "major-fallout", "critical-fallout"]);
  });
});

describe("restockRelief: pay one size, remove one size larger", () => {
  it.each([
    ["d4", "d6"],
    ["d6", "d8"],
    ["d8", "d10"],
    ["D6", "d8"],
  ])("paying %s removes %s", (pay, relief) => {
    expect(restockRelief(pay)).toBe(relief);
  });

  it.each(["d10", "d12", "d20", "", undefined, null])("refuses to be paid with %s", (pay) => {
    expect(() => restockRelief(pay)).toThrow(/d4, d6 or d8/);
  });

  it("has exactly three exchange rates", () => {
    expect(RESTOCK_RELIEF).toEqual({ d4: "d6", d6: "d8", d8: "d10" });
  });
});

describe("provisionsProtection: the quartermaster's Supplies Protection", () => {
  it("is the quartermaster's Supplies Protection", () => {
    expect(provisionsProtection(3)).toBe(3);
    expect(provisionsProtection("2", [])).toBe(2);
  });

  it("is 0 with no quartermaster, or never negative", () => {
    expect(provisionsProtection(undefined)).toBe(0);
    expect(provisionsProtection(-2)).toBe(0);
  });

  it("the Empty fallout removes it (Provisions cannot be protected)", () => {
    expect(provisionsProtection(3, ["Half Rations", "Empty"])).toBe(0);
    expect(provisionsProtection(3, ["fallout.minor.provisions.empty.name"])).toBe(0);
  });

  it("other fallouts, and words merely containing 'empty', leave it", () => {
    expect(provisionsProtection(3, ["Darkness", "Emptyhanded"])).toBe(3);
  });
});

describe("markedValue and relievedValue stay on the track", () => {
  it("marks add, capped at the max", () => {
    expect(markedValue(5, 3)).toBe(8);
    expect(markedValue(18, 5)).toBe(20);
    expect(markedValue(8, 5, 10)).toBe(10);
  });

  it("a negative mark marks nothing", () => {
    expect(markedValue(5, -3)).toBe(5);
  });

  it("relief removes, never below zero", () => {
    expect(relievedValue(9, 4)).toBe(5);
    expect(relievedValue(3, 10)).toBe(0);
    expect(relievedValue(5, -2)).toBe(5);
  });

  it("reads missing values as 0", () => {
    expect(markedValue(undefined, 2)).toBe(2);
    expect(relievedValue(undefined, 2)).toBe(0);
  });
});

describe("provisionsOf: the party's Provisions", () => {
  const party = ({ value = 5, quartermaster = "", fallouts = [] } = {}) => ({
    id: "party",
    type: "party",
    system: { provisions: { value, max: 20 }, quartermaster },
    items: fallouts.map((f) => makeFallout(f)),
  });
  const qm = () => {
    const a = makeActor({ id: "kettle", name: "Kettle" });
    a.system.resistances = { supplies: { value: 2, protection: 2 } };
    return a;
  };

  it("reads value, max, and the Critical line", () => {
    expect(provisionsOf(party({ value: 7 }))).toMatchObject({
      value: 7,
      max: 20,
      criticalFrom: 13,
      pastRolling: false,
      protection: 0,
      quartermaster: "",
    });
    expect(provisionsOf(party({ value: 20 })).pastRolling).toBe(true);
  });

  it("takes Protection from the quartermaster's Supplies", () => {
    addActors(qm());
    expect(provisionsOf(party({ quartermaster: "kettle" }))).toMatchObject({
      protection: 2,
      quartermaster: "kettle",
      quartermasterName: "Kettle",
    });
  });

  it("the party's Empty fallout removes it; a completed one does not", () => {
    addActors(qm());
    expect(provisionsOf(party({ quartermaster: "kettle", fallouts: ["Empty"] })).protection).toBe(0);
    expect(
      provisionsOf(party({ quartermaster: "kettle", fallouts: [{ name: "Empty", complete: true }] })).protection,
    ).toBe(2);
  });

  it("an empty party falls back to a fresh track", () => {
    expect(provisionsOf({ system: {} })).toMatchObject({ value: 0, max: 20 });
  });
});

describe("provisionsView: the track display", () => {
  const view = (value, protection = 0) =>
    provisionsView({
      value,
      max: 20,
      protection,
      quartermaster: protection ? "kettle" : "",
      quartermasterName: "Kettle",
      criticalFrom: 13,
      pastRolling: value >= 20,
    });

  it("is null without Provisions", () => {
    expect(provisionsView(null)).toBeNull();
  });

  it("draws twenty boxes in rows of ten, the marked ones checked", () => {
    const v = view(12);
    expect(v.rows).toHaveLength(2);
    expect(v.rows.map((r) => r.length)).toEqual([10, 10]);
    const boxes = v.rows.flat();
    expect(boxes.filter((b) => b.checked)).toHaveLength(12);
    expect(boxes[11].checked).toBe(true);
    expect(boxes[12].checked).toBe(false);
  });

  it("flags box 13 onwards as critical, and box 13 as where it starts", () => {
    const boxes = view(0).rows.flat();
    expect(boxes.map((b, i) => (b.critical ? i + 1 : null)).filter(Boolean)).toEqual([
      13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(boxes.filter((b) => b.criticalStart)).toHaveLength(1);
    expect(boxes[12].criticalStart).toBe(true);
  });

  it("says nothing below 13, warns from 13, and says full at 20", () => {
    expect(view(12).status).toBe("");
    expect(view(13).status).toBe("heart.party-sheet.status-dire{past=12}");
    expect(view(19).status).toBe("heart.party-sheet.status-dire{past=12}");
    expect(view(20).status).toBe("heart.party-sheet.status-full");
  });

  it("draws five Protection shields, as many checked as the Protection", () => {
    const v = view(0, 2);
    expect(v.shields).toHaveLength(5);
    expect(v.shields.map((s) => s.checked)).toEqual([true, true, false, false, false]);
    expect(v.protectionTip).toBe("heart.party-sheet.protection-tip{name=Kettle,count=2}");
    expect(view(0, 0).protectionTip).toBe("heart.party-sheet.protection-none");
  });
});

describe("partyMembers", () => {
  it("lists the members who are still characters, alphabetically", () => {
    addActors(
      makeActor({ id: "z", name: "Zell" }),
      makeActor({ id: "a", name: "Ash" }),
      makeActor({ id: "m", name: "Mox", type: "adversary" }),
    );
    const members = partyMembers({ system: { members: ["z", "gone", "m", "a"] } });
    expect(members.map((m) => m.name)).toEqual(["Ash", "Zell"]);
  });
});

// Volunteering (2026-10-01, Luke): a player's own member, only while the
// post is empty
describe("canVolunteer: taking the empty quartermaster post", () => {
  const player = { id: "p1", isGM: false };
  const member = (id, owners = ["p1"]) => {
    const a = makeActor({ id, name: id });
    a.testUserPermission = (user) => owners.includes(user.id);
    return a;
  };
  const party = ({ members = ["vess", "kettle"], quartermaster = "" } = {}) => ({
    id: "party",
    type: "party",
    system: { provisions: { value: 0, max: 20 }, quartermaster, members },
    items: [],
  });

  it("lets a player volunteer their own member when nobody is quartermaster", () => {
    const [vess] = addActors(member("vess"));
    expect(canVolunteer(party(), vess, player)).toBe(true);
  });

  it("refuses someone else's character", () => {
    const [kettle] = addActors(member("kettle", ["p2"]));
    expect(canVolunteer(party(), kettle, player)).toBe(false);
  });

  it("refuses a character who is not a member", () => {
    const [ash] = addActors(member("ash"));
    expect(canVolunteer(party(), ash, player)).toBe(false);
  });

  it("refuses while someone holds the post", () => {
    const [vess, kettle] = addActors(member("vess"), member("kettle", ["p2"]));
    expect(canVolunteer(party({ quartermaster: "kettle" }), vess, player)).toBe(false);
    expect(kettle).toBeTruthy();
  });

  it("counts a quartermaster who no longer exists as an empty post", () => {
    const [vess] = addActors(member("vess"));
    expect(canVolunteer(party({ quartermaster: "deleted" }), vess, player)).toBe(true);
  });

  it("refuses non-characters and a missing party", () => {
    const [vess] = addActors(member("vess"));
    expect(canVolunteer(null, vess, player)).toBe(false);
    expect(canVolunteer(party(), { ...vess, type: "adversary" }, player)).toBe(false);
  });
});

// Resigning (2026-10-01, Luke): only the quartermaster's own player
describe("canResign: giving up the quartermaster post", () => {
  const player = { id: "p1", isGM: false };
  const character = (id, owners = ["p1"]) => {
    const a = makeActor({ id, name: id });
    a.testUserPermission = (user) => owners.includes(user.id);
    return a;
  };
  const party = (quartermaster) => ({
    id: "party",
    type: "party",
    system: { provisions: { value: 0, max: 20 }, quartermaster, members: ["vess", "kettle"] },
    items: [],
  });

  it("lets the quartermaster's own player resign", () => {
    const [vess] = addActors(character("vess"));
    expect(canResign(party("vess"), vess, player)).toBe(true);
  });

  it("refuses for someone else's quartermaster", () => {
    const [kettle] = addActors(character("kettle", ["p2"]));
    expect(canResign(party("kettle"), kettle, player)).toBe(false);
  });

  it("refuses a character who is not the quartermaster, or an empty post", () => {
    const [vess] = addActors(character("vess"));
    expect(canResign(party("kettle"), vess, player)).toBe(false);
    expect(canResign(party(""), vess, player)).toBe(false);
  });
});
