// Stress roll rules (HCB p.77-78; gm-companion rulings 13, 16): the pure
// arithmetic, with no Foundry globals and no webpack-only imports, so the
// rules can be tested on their own (2026-09-30, Luke). roll.js imports them
// back unchanged.

export const DIE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd12'];

// The dice ladder (HCB p. 7: D4, D6, D8, D10, D12; nothing below D4 or
// above D12). One die size smaller; a D4 (or anything off the ladder) stays
// as it is
export function stepDown(die) {
    const i = DIE_ORDER.indexOf(String(die).toLowerCase());
    return i > 0 ? DIE_ORDER[i - 1] : die;
}

// One die size larger; a D12 (or anything off the ladder) stays as it is
// (2026-10-21: the item roll's own copy stepped an unknown die to D4)
export function stepUp(die) {
    const i = DIE_ORDER.indexOf(String(die).toLowerCase());
    return i >= 0 && i < DIE_ORDER.length - 1 ? DIE_ORDER[i + 1] : die;
}

// An item roll's die (Shift+click steps it up, Alt+click down; R4,
// 2026-10-21): { die, stepped: 'up' | 'down' | '' }, stepped only when the
// die really moved, so the card never says "stepped down" for a D4
export function itemRollDie(die, { stepIncrease = false, stepDecrease = false } = {}) {
    const from = String(die ?? '').toLowerCase();
    const to = stepIncrease ? stepUp(from) : stepDecrease ? stepDown(from) : from;
    const stepped = to === from ? '' : stepIncrease ? 'up' : 'down';
    return { die: to, stepped };
}

// The die a stress roll uses: the GM's pick (D4 by default), one size smaller
// for a passive action that succeeded at a cost
export function stressDie(die_size, result, passive) {
    let die = String(die_size ?? 'd4').toLowerCase();
    const stepped = Boolean(passive) && result === 'success_at_a_cost';
    if (stepped) die = stepDown(die);
    return { die, stepped };
}

// A critical failure doubles the stress roll (Protection then applies once)
export function stressFormula(die, result) {
    return result === 'critical_failure' ? `2 * {${die}}` : die;
}

// Stress after Protection, per character: Protection in the resistance is
// subtracted, never below zero, unless the roll ignores Protection
export function afterProtection(total, protection, ignoreProtection = false) {
    const p = ignoreProtection ? 0 : (Number(protection) || 0);
    return { protection: p, amount: Math.max(0, total - p) };
}

// A resistance track's size (Luke, 2026-10-21, R17): its own max, else the
// book's ten boxes (player-reference: a 10-box track)
export const TRACK_MAX = 10;
export function trackMax(res) {
    const max = Number(res?.max);
    return max > 0 ? max : TRACK_MAX;
}

// A track after taking stress: capped at its last box (R17: a character's
// track ran past ten while a companion's stopped; one rule for both). A
// track already past its max (from before the cap) is never lowered.
export function markedValue(value, amount, max) {
    const now = Number(value) || 0;
    return Math.max(now, Math.min(Number(max) || TRACK_MAX, now + Math.max(0, Number(amount) || 0)));
}

// Where a stress roll stands (Luke, 2026-10-21: "there must be separate roll
// and mark steps"): 'pending' once rolled with a resistance and nothing
// marked yet, 'taken' once Take Stress has marked it, '' with no resistance
export function stressStatus(options = {}) {
    if (Array.isArray(options.applied)) return 'taken';
    return options.resistance ? 'pending' : '';
}

// What each target would take if Take Stress were pressed now, from their
// Protection as it stands (targets: { id, name, protection, shared }).
// Nothing is marked; the card shows it so the table can change anything
// first (an ability that adds Protection, a guard, a redirect), by hand.
export function stressPreview(total, targets = [], ignoreProtection = false) {
    return targets.map(t => ({ ...t, ...afterProtection(Number(total) || 0, t.protection, ignoreProtection) }));
}

// The stakes a GM may set on a roll request (Luke, 2026-10-21): the
// resistance at risk, the stress die, and passive, each optional (missing
// means the roller chooses, as before). Anything off the lists is dropped.
// passive may arrive as a boolean or as the form's 'true' / 'false'.
export function normalizeStakes(raw = {}, resistances = []) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const resistance = String(raw.resistance ?? '').trim();
    if (resistance && resistances.includes(resistance)) out.resistance = resistance;
    const die = String(raw.die_size ?? '').trim().toLowerCase();
    if (DIE_ORDER.includes(die)) out.die_size = die;
    const passive = raw.passive;
    if (passive === true || passive === 'true') out.passive = true;
    else if (passive === false || passive === 'false') out.passive = false;
    return out;
}

// True when the stakes name anything at all
export function hasStakes(stakes) {
    return Boolean(stakes) && ['resistance', 'die_size', 'passive'].some(k => stakes[k] !== undefined);
}

// The stakes as one plain line for a card: "D6 to Blood, passive", "Blood",
// "D8, not passive"; '' when none are set. loc(key, data) localizes (the
// keys: heart.card.stress-what, heart.resistance.<id>, heart.card.stakes-
// passive / -active). Plain text: the caller escapes it.
export function stakesText(stakes, loc) {
    if (!hasStakes(stakes)) return '';
    const die = stakes.die_size ? String(stakes.die_size).toUpperCase() : '';
    const resistance = stakes.resistance ? loc(`heart.resistance.${stakes.resistance}`) : '';
    const parts = [];
    if (die && resistance) parts.push(loc('heart.card.stress-what', { die, resistance }));
    else if (die || resistance) parts.push(die || resistance);
    if (stakes.passive === true) parts.push(loc('heart.card.stakes-passive'));
    if (stakes.passive === false) parts.push(loc('heart.card.stakes-active'));
    return parts.join(', ');
}
