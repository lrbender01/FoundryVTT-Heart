// A character's total Stress as a stored field (2026-10-21, Phase 2 item 5):
// system.totalStress = { value, max }, the five personal tracks added
// together, so a token bar can show it (Foundry draws a bar only for an
// attribute with value and max). The tracks stay the truth: actor.proxy.
// totalStress sums them live, and total-stress-sync.js keeps this copy in
// step. Pure, no
// Foundry globals, so it is tested on its own (test/total-stress.test.mjs).

import { TRACK_MAX } from '../../rolls/stress-roll/rules.js';

// The five a fallout check reads; the party's Provisions is never one
export const STRESS_TRACKS = ['blood', 'mind', 'echo', 'fortune', 'supplies'];
// (a track's length when its data has none is the rules' TRACK_MAX: twelve
// since 2026-10-23, Luke, so the total's max is 60; the value is the plain
// sum, never capped)

const num = (v) => Number(v) || 0;

// Stress across the five tracks, as numbers (a value stored as text adds)
export function sumStress(resistances = {}) {
    return STRESS_TRACKS.reduce((sum, r) => sum + num(resistances?.[r]?.value), 0);
}

// The stored field's value for these tracks: { value, max }
export function totalStressOf(resistances = {}) {
    return {
        value: sumStress(resistances),
        max: STRESS_TRACKS.reduce((sum, r) => sum + num(resistances?.[r]?.max ?? TRACK_MAX), 0),
    };
}

const same = (a, b) => num(a?.value) === num(b?.value) && num(a?.max) === num(b?.max);

// What an update to a character should also write to system.totalStress, or
// null when nothing needs writing. system: the actor's data now; changes: the
// update's `system` part, expanded (as preUpdateActor hands it over). An
// update that touches no track and not the field itself writes nothing; one
// that edits the field directly (a token bar) is put back to the tracks' sum.
export function totalStressChange(system = {}, changes = {}) {
    if (!changes || typeof changes !== 'object') return null;
    const touchesTracks = changes.resistances && typeof changes.resistances === 'object';
    const touchesField = 'totalStress' in changes;
    if (!touchesTracks && !touchesField) return null;
    const merged = {};
    for (const r of STRESS_TRACKS) {
        const now = system.resistances?.[r] ?? {};
        const next = touchesTracks ? changes.resistances[r] ?? {} : {};
        merged[r] = { value: next.value ?? now.value, max: next.max ?? now.max };
    }
    const total = totalStressOf(merged);
    if (!touchesField && same(total, system.totalStress)) return null;
    return total;
}

// A character whose stored total is out of step with its tracks (an older
// character, or one changed before this field existed): the correct value,
// or null when it already agrees
export function staleTotalStress(system = {}) {
    const total = totalStressOf(system.resistances);
    return same(total, system.totalStress) ? null : total;
}
