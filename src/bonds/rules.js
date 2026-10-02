// Bonds (HCB p. 102) and hirelings / animals (W&M W66-W67): the pure rules,
// with no Foundry globals and no webpack-only imports, so they can be tested
// on their own (2026-10-01, Luke). The document side lives in bonds.js.
//
// The model (decided with Luke 2026-10-01): a bond is the RELATIONSHIP, not
// the being. It is a `bond` Item on the character (at most three) that names
// who it is with and may link that being's actor:
//   person   - the book's bond. Stress transferred onto it goes into the
//              bond's own pool (one pool, Luke); its Fallout ("they need your
//              help", "serious trouble") is recorded as child entries of the
//              bond item.
//   hireling / animal - a W&M companion: the bond links a `hireling` Actor,
//              which has five Resistance tracks with Protection and its own
//              Fallouts and takes Stress "just like player characters". It
//              counts as one of the three bonds but can NOT take your Stress
//              or heal your Fallout (W66).
// Every transfer onto a bond triggers the GM's Fallout check: a d12 against
// the bond's total Stress (the pool, or the hireling's five tracks), read
// like a delver's (Minor 1-6, Major 7-12). Critical is never rolled; when
// the GM combines two Majors into a Critical, the bond is removed (HCB p. 102).

import { characterFalloutResult } from '../rolls/fallout-roll/results.js';
import { heartResult } from '../rolls/heart-roll/results.js';

// Two kinds (2026-10-01, Luke): a person bond (HCB p. 102) and a companion
// (W&M W66: hirelings and animals, which the book gives the same rules; only
// the wording of their Cost differs). Bonds made before this stored
// "hireling" or "animal"; both read as a companion.
export const BOND_KINDS = ['person', 'companion'];
const COMPANION_KINDS = ['companion', 'hireling', 'animal'];
export const MAX_BONDS = 3;
// "You can directly transfer up to D8 stress onto a bond each time you visit"
export const TRANSFER_DIE = 'd8';
// "remove Minor fallout ... or downgrade Major fallout to Minor at a cost of
// D8 stress to the bond"
export const HEAL_COST_DIE = 'd8';
// a person bond's pool; same size as a delver's track
export const BOND_STRESS_MAX = 10;
// optional bond actions roll D10s (HCB p. 102)
export const BOND_ACTION_DIE = 'd10';
export const RESISTANCES = ['blood', 'mind', 'echo', 'fortune', 'supplies'];

export function isCompanion(kind) {
    return COMPANION_KINDS.includes(kind);
}

export function bondKind(kind) {
    return isCompanion(kind) ? 'companion' : 'person';
}

// A bond's kind follows its bonded actor (2026-10-01): a companion actor
// (type `hireling`) makes it a companion bond, any other actor a person
// bond. With no actor it is what was stored: a person, or a companion whose
// actor is gone.
export function bondKindFor(targetType, storedKind) {
    if (targetType) return targetType === 'hireling' ? 'companion' : 'person';
    return bondKind(storedKind);
}

// A person bond's pool
export function poolStress(bondSystem = {}) {
    return Number(bondSystem.stress?.value) || 0;
}

// A hireling's five tracks added together (like a delver's total)
export function trackStress(resistances = {}) {
    return RESISTANCES.reduce((sum, r) => sum + (Number(resistances?.[r]?.value) || 0), 0);
}

// May a character take another bond? count: bonds it has now. No replacing
// (2026-10-02, Luke): a full list refuses until a bond is removed.
export function canAddBond(count) {
    return (Number(count) || 0) < MAX_BONDS;
}

// Transfers and healing go only to a person bond (W66)
export function canLeanOn(kind) {
    return !isCompanion(kind);
}

// How much Stress actually moves: the roll, but never more than the
// character has marked in that Resistance
export function transferAmount(rolled, available) {
    return Math.max(0, Math.min(Number(rolled) || 0, Number(available) || 0));
}

// A pool after taking `amount` (it stops at the max)
export function pooledValue(value, amount, max = BOND_STRESS_MAX) {
    return Math.min(Number(max) || BOND_STRESS_MAX, Math.max(0, (Number(value) || 0) + Math.max(0, Number(amount) || 0)));
}

// The GM's check on the bond: 'no-fallout' | 'minor-fallout' | 'major-fallout'
export function bondFalloutResult(d12, totalStress) {
    return characterFalloutResult(Number(d12), Number(totalStress) || 0);
}

// What visiting a bond does to one of the character's Fallouts:
// Minor -> removed, Major -> downgraded to Minor, Critical -> nothing
export function healOutcome(severity) {
    if (severity === 'minor') return 'remove';
    if (severity === 'major') return 'downgrade';
    return null;
}

// Optional bond actions (HCB p. 102; table ruling 7 keeps them for hirelings
// and animals): one D10, +1 in the bond's home area, +1 in their expertise
export function bondActionDice({ home = false, expertise = false } = {}) {
    return 1 + (home ? 1 : 0) + (expertise ? 1 : 0);
}

// "compare the highest roll to the results chart ... as though the bond were
// a player character"
export function bondActionResult(values = []) {
    if (!values.length) return undefined;
    return heartResult(Math.max(...values.map(Number)), 'normal');
}
