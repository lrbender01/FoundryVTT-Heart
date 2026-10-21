import { resistanceBarChange, staleResistanceBar } from './resistance.js';

// Keeps an adversary's system.resistanceBar (what is left, for a token bar)
// in step with its marks (Luke, 2026-10-21; the rules are in resistance.js).
// The same pattern as a character's total Stress (character/total-stress-
// sync.js): the bar rides along in the same write as the marks, so nothing
// can loop, and a write that changes nothing is dropped by Foundry's diff.
// Every check reads the stored data (_source): HeartActor derives the bar in
// memory too, so the prepared data always looks in step.
const stored = (actor) => actor._source?.system ?? actor.system;

export function registerResistanceBarSync() {
    Hooks.on('preCreateActor', (actor) => {
        if (actor.type !== 'adversary') return;
        const bar = staleResistanceBar(stored(actor));
        if (bar) actor.updateSource({ 'system.resistanceBar': bar });
    });

    Hooks.on('preUpdateActor', (actor, changes) => {
        if (actor.type !== 'adversary' || !changes?.system) return;
        const more = resistanceBarChange(stored(actor), changes.system);
        if (more) Object.assign(changes.system, more);
    });
}

// At ready, once per load: adversaries made before the field existed get the
// right bar. Only the active GM's client writes, and only the ones out of
// step.
export async function correctResistanceBars() {
    if (!game.users.activeGM?.isSelf) return;
    const updates = [];
    for (const actor of game.actors) {
        if (actor.type !== 'adversary') continue;
        const bar = staleResistanceBar(stored(actor));
        if (bar) updates.push({ _id: actor.id, 'system.resistanceBar': bar });
    }
    if (updates.length) await Actor.updateDocuments(updates);
}
