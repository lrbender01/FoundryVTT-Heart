import { totalStressChange, staleTotalStress } from './total-stress.js';

// Keeps a character's stored system.totalStress in step with its five tracks
// (2026-10-21, Phase 2 item 5; the rules are in total-stress.js).
//
// The total rides along in the same write as the tracks: preUpdateActor runs
// on the client that is updating (so a GM or an owner, whoever may write the
// tracks may write the total), and adding to its changes costs no second
// update, so nothing can loop. A write that changes nothing is dropped by
// Foundry's diff.
export function registerTotalStressSync() {
    Hooks.on('preCreateActor', (actor) => {
        if (actor.type !== 'character') return;
        const total = staleTotalStress(actor.system);
        if (total) actor.updateSource({ 'system.totalStress': total });
    });

    Hooks.on('preUpdateActor', (actor, changes) => {
        if (actor.type !== 'character' || !changes?.system) return;
        const total = totalStressChange(actor.system, changes.system);
        if (total) changes.system.totalStress = total;
    });
}

// At ready, once per load: characters made before the field existed, or whose
// tracks changed without it, get the right total. Only the active GM's client
// writes, and only the characters that are out of step.
export async function correctTotalStress() {
    if (!game.users.activeGM?.isSelf) return;
    const updates = [];
    for (const actor of game.actors) {
        if (actor.type !== 'character') continue;
        const total = staleTotalStress(actor.system);
        if (total) updates.push({ _id: actor.id, 'system.totalStress': total });
    }
    if (updates.length) await Actor.updateDocuments(updates);
}
