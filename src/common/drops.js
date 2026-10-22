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

// Dragging a row (Luke, 2026-10-21, S5): an actor sheet's rows carry their
// item's uuid in data-item-id. What a row's drag hands over: the item's uuid
// for one of the actor's own items, null for a row with no item (a tab
// link) or a class's or calling's child ("@" in its uuid), which only its
// parent's sheet moves.
export function draggableRowUuid(uuid) {
    const value = String(uuid ?? '');
    return value && !value.includes('@') ? value : null;
}

// The embedded item id in a row's uuid ("Actor.a.Item.b" -> "b"; a bare id
// stays itself), or null for a child or anything else, so a sort among the
// rows finds the actor's own items (Foundry's sort reads ids, not uuids)
export function rowItemId(uuid) {
    const value = draggableRowUuid(uuid);
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length === 1) return value;
    return parts[parts.length - 2] === 'Item' ? parts[parts.length - 1] : null;
}
