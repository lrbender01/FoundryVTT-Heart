// Provisions house rule (reference/heart-rules/provisions.md, 2026-09-30):
// the pure arithmetic, with no Foundry globals so it can be reasoned about
// (and tested) on its own. The document side lives in party.js.
//
// One party-wide track of twenty boxes. The fallout check is the book's d12
// against the total, with two additions for a track deeper than twelve:
//   - with CRITICAL_FROM (13) or more stress every check is fallout (a d12
//     cannot beat 13) and a Major result is Critical instead
//   - at the track's max there is no check: the fallout is Critical

export const PROVISIONS_MAX = 20;
export const CRITICAL_FROM = 13;

// Minor clears the track; so does Major, and so does Critical (the rule clears
// Provisions whatever the severity; the GM narrates the rest)
export const PARTY_FALLOUT_RESULTS = ['no-fallout', 'minor-fallout', 'major-fallout', 'critical-fallout'];

export function isPastRolling(total, max = PROVISIONS_MAX) {
    return Number(total) >= Number(max);
}

// roll: the d12 result; total: stress on Provisions; max: the track size
export function partyFalloutResult(roll, total, max = PROVISIONS_MAX) {
    const t = Number(total) || 0;
    if (isPastRolling(t, max)) return 'critical-fallout';
    if (Number(roll) > t) return 'no-fallout';
    if (Number(roll) <= 6) return 'minor-fallout';
    return t >= CRITICAL_FROM ? 'critical-fallout' : 'major-fallout';
}

// Restock: pay D4 / D6 / D8 from your own Supplies, remove one size larger
export const RESTOCK_RELIEF = { d4: 'd6', d6: 'd8', d8: 'd10' };

export function restockRelief(payDie) {
    const relief = RESTOCK_RELIEF[String(payDie ?? '').toLowerCase()];
    if (!relief) throw new Error(`restock is paid with d4, d6 or d8, not "${payDie}"`);
    return relief;
}

// Scavenging relieves D4
export const SCAVENGE_RELIEF = 'd4';

// Upkeep: at the end of every delve, or every night outside a haven
export const UPKEEP_DIE = 'd4';

// Protection on Provisions is the quartermaster's Supplies protection, unless
// the party suffers the Empty fallout ("Provisions cannot be protected")
export function provisionsProtection(quartermasterSuppliesProtection, falloutNames = []) {
    const empty = falloutNames.some(n => /\bempty\b/i.test(String(n ?? '')));
    if (empty) return 0;
    return Math.max(0, Number(quartermasterSuppliesProtection) || 0);
}

// Marking and relieving keep the value on the track
export function markedValue(value, amount, max = PROVISIONS_MAX) {
    return Math.min(Number(max) || PROVISIONS_MAX, Math.max(0, (Number(value) || 0) + Math.max(0, Number(amount) || 0)));
}

export function relievedValue(value, amount) {
    return Math.max(0, (Number(value) || 0) - Math.max(0, Number(amount) || 0));
}
