// What may be dropped where (2026-10-02). Luke: "blocking something
// important for player functionality is far far worse than keeping an
// orphaned item", so the rules are narrow on purpose:
//
//   - an item sheet takes exactly the child types it shows; anything else
//     would vanish inside the parent with no way to see or remove it
//   - an actor sheet refuses only clear mistakes: a class, calling, or
//     ancestry on anything but a character; a tag on any actor (tags live
//     inside equipment); a haunt on anything but a landmark. Everything else
//     lands as before (Inactive Items shows what has no section of its own).
//
// Pure; tested in test/drops.test.mjs.

export const ITEM_CHILD_TYPES = {
    class: ['ability', 'equipment', 'resource'],
    calling: ['ability', 'beat'],
    // an ability's upgrades
    ability: ['ability'],
    equipment: ['tag'],
    resource: ['tag'],
    bond: ['fallout'],
};

export function canHoldChild(parentType, childType) {
    return (ITEM_CHILD_TYPES[parentType] ?? []).includes(childType);
}

const CHARACTER_ONLY = ['class', 'calling', 'ancestry'];

// Why an item of `itemType` may not land on an actor of `actorType`, as a
// reason id ('character-only', 'tag', 'haunt'), or null when it may
export function actorDropRefusal(actorType, itemType) {
    if (CHARACTER_ONLY.includes(itemType) && actorType !== 'character') return 'character-only';
    if (itemType === 'tag') return 'tag';
    if (itemType === 'haunt' && actorType !== 'landmark') return 'haunt';
    return null;
}
