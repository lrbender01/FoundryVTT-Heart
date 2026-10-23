import { trackLengthUpdate } from '../rolls/stress-roll/rules.js';
import { STRESS_TRACKS } from './character/total-stress.js';

// Twelve-box tracks (Luke, 2026-10-23: "tracks grow until fallout and
// mathematically fallout is guaranteed at a certain point. I would think it
// would be 12"). New actors take max 12 from template.json; this brings the
// rest along: a delver's or companion's resistance track still at the
// book's ten grows to twelve. Only a max of exactly 10 moves (rules.js
// trackLengthUpdate), never down, so both halves are safe to run again.
// A character's stored total follows in the same write (total-stress-sync.js
// preUpdateActor adds it), so its max becomes 60.

const TYPES = ['character', 'hireling'];

// A new actor made from older data (a compendium companion whose tracks
// say 10, a character from an export) is created with twelve
export function registerTrackLength() {
    Hooks.on('preCreateActor', (actor) => {
        if (!TYPES.includes(actor.type)) return;
        const update = trackLengthUpdate(actor._source?.system?.resistances, STRESS_TRACKS);
        if (update) actor.updateSource(update);
    });
}

// At ready, every load: the active GM's client lengthens the world's
// existing tracks, in one batched write. Nothing to do once all are twelve.
export async function migrateTrackLength() {
    if (!game.users.activeGM?.isSelf) return;
    const updates = [];
    for (const actor of game.actors) {
        if (!TYPES.includes(actor.type)) continue;
        const update = trackLengthUpdate(actor.system?.resistances, STRESS_TRACKS);
        if (update) updates.push({ _id: actor.id, ...update });
    }
    if (!updates.length) return;
    try {
        await Actor.updateDocuments(updates);
        console.log(`heart | lengthened the stress tracks of ${updates.length} actor(s) to twelve boxes`);
    } catch (err) {
        // tried again on the next load
        console.error('heart | twelve-box track migration failed', err);
    }
}
