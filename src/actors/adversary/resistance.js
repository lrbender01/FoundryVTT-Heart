// An adversary's Resistance counts down (Luke, 2026-10-21): the sheet reads
// what is left ("3 / 5 left"), like a delve's. The stored data is unchanged:
// system.resistance is the Stress marked (the boxes; stored as text or a
// number), system.resistanceMax the track's length (text, default "5").
// system.resistanceBar = { value: left, max } is a numeric copy for a token
// bar (Foundry draws a bar only for an attribute with value and max), kept
// in step by resistance-sync.js. Pure, no Foundry globals, so it is tested on
// its own (test/adversary-resistance.test.mjs).

// the template's default length
export const DEFAULT_RESISTANCE_MAX = 5;

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// { marked, max, left } from an adversary's system data. A blank max is the
// default five; marked stays within 0 to max; whole numbers only.
export function resistanceOf(system = {}) {
    const max = blank(system?.resistanceMax) ? DEFAULT_RESISTANCE_MAX : Math.max(0, Math.floor(num(system.resistanceMax)));
    const marked = Math.min(max, Math.max(0, Math.floor(num(system?.resistance))));
    return { marked, max, left: max - marked };
}

// The token bar's value: what is left, of the max
export function resistanceBarOf(system = {}) {
    const { left, max } = resistanceOf(system);
    return { value: left, max };
}

const same = (a, b) => num(a?.value) === num(b?.value) && num(a?.max) === num(b?.max);
const has = (obj, key) => Boolean(obj) && typeof obj === 'object' && key in obj;

// What an update to an adversary should also write, as more of its `system`
// changes ({ resistanceBar } and, from a bar edit, { resistance }), or null
// when nothing needs writing. system: the actor's data now; changes: the
// update's `system` part, expanded (as preUpdateActor hands it over).
//   - a change to the marks or the max: the bar follows
//   - an edit of the bar's value alone (a token bar, a macro): the marks
//     follow it, so the bar and the boxes always agree
export function resistanceBarChange(system = {}, changes = {}) {
    if (!changes || typeof changes !== 'object') return null;
    const touchesTrack = has(changes, 'resistance') || has(changes, 'resistanceMax');
    const touchesBar = has(changes, 'resistanceBar');
    if (!touchesTrack && !touchesBar) return null;
    const merged = {
        resistance: has(changes, 'resistance') ? changes.resistance : system.resistance,
        resistanceMax: has(changes, 'resistanceMax') ? changes.resistanceMax : system.resistanceMax,
    };
    const out = {};
    const barValue = touchesBar ? changes.resistanceBar?.value : undefined;
    if (!touchesTrack && barValue !== undefined && barValue !== null && barValue !== '') {
        const { max } = resistanceOf(merged);
        const left = Math.min(max, Math.max(0, Math.floor(num(barValue))));
        merged.resistance = max - left;
        out.resistance = max - left;
    }
    const bar = resistanceBarOf(merged);
    if (touchesBar || !same(bar, system.resistanceBar)) out.resistanceBar = bar;
    return Object.keys(out).length ? out : null;
}

// An adversary whose stored bar is out of step with its marks (an older
// adversary, or one changed before the field existed): the correct value,
// or null when it already agrees
export function staleResistanceBar(system = {}) {
    const bar = resistanceBarOf(system);
    return same(bar, system?.resistanceBar) ? null : bar;
}

// The marks that leave `left` of the track (a token bar's edit, by value or
// by delta, handled in HeartActor.modifyTokenAttribute)
export function marksForLeft(system = {}, left) {
    const { max } = resistanceOf(system);
    return max - Math.min(max, Math.max(0, Math.floor(num(left))));
}
