// What the Witch is Dead NPC sheet (npc-sheet.js) draws, pure so vitest loads
// it. A box with nothing in it is left off the sheet of someone who can't edit
// it, and left in for someone who can, so a writer's gap reads as a gap and a
// player never sees an empty box.

const filled = (value) => Boolean(String(value ?? '').replace(/<[^>]*>/g, '').trim());

// Which boxes to draw: { descriptors, wants, voice, look, knows }, each true
// or false. `editable`: whether this viewer may change the actor.
export function npcBoxes(system, editable = false) {
    const show = (value) => Boolean(editable) || filled(value);
    return {
        descriptors: show(system?.descriptors),
        wants: show(system?.motivation),
        voice: show(system?.voice),
        look: show(system?.description),
        knows: show(system?.knows),
    };
}
