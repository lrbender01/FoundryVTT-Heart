// Trinkets and keepsakes (2026-09-30). A character rolls once on their
// ancestry's keepsake table and once on their calling's trinket table; the
// drawn item goes straight into their inventory (the Items section).
//
// Tables are found by name so the system needs no particular module: a
// RollTable called "<Ancestry> Keepsakes" or "<Calling> Calling Trinkets"
// (any "<Calling> Calling ..." works, e.g. "Containment Calling Toolbox"),
// in the world or any RollTable compendium. fvtt-heart-content ships all 13
// (4 ancestries, 9 callings); neither book prints a table for classes.
//
// The roll is recorded on the ancestry / calling item as
// flags.heart.trinket = {name, uuid}: it happens once, with no reroll
// (Luke, 2026-09-30).

import { showDice } from '../rolls/dice';

const KIND = { ancestry: 'keepsake', calling: 'trinket' };

export function trinketKind(item) {
    return KIND[item?.type] ?? null;
}

function matchesTable(tableName, item) {
    const name = game.i18n.localize(item.name).trim().toLowerCase();
    const t = String(tableName ?? '').trim().toLowerCase();
    if (!name || !t.startsWith(`${name} `)) return false;
    return item.type === 'ancestry' ? t.includes('keepsake') : t.includes('calling');
}

export async function findTrinketTable(item) {
    const world = game.tables.find(t => matchesTable(t.name, item));
    if (world) return world;
    for (const pack of game.packs.filter(p => p.documentName === 'RollTable')) {
        const index = await pack.getIndex();
        const entry = index.find(e => matchesTable(e.name, item));
        if (entry) return pack.getDocument(entry._id);
    }
    return null;
}

async function resultDocument(result) {
    const T = CONST.TABLE_RESULT_TYPES;
    if (result.type === T.COMPENDIUM) return game.packs.get(result.documentCollection)?.getDocument(result.documentId);
    if (result.type === T.DOCUMENT) return game.collections.get(result.documentCollection)?.get(result.documentId);
    return null;
}

export async function rollTrinket(item) {
    const actor = item?.actor;
    const kind = trinketKind(item);
    if (!actor || !kind) return;
    const itemName = game.i18n.localize(item.name);
    if (!actor.isOwner) return;
    if (item.getFlag('heart', 'trinket')) {
        ui.notifications.info(game.i18n.format('heart.trinket.already', { name: itemName }));
        return;
    }
    const table = await findTrinketTable(item);
    if (!table) {
        ui.notifications.warn(game.i18n.format('heart.trinket.no-table', { name: itemName }));
        return;
    }
    // Roll the table, show the dice (Dice So Nice, or Foundry's dice sound),
    // then post the usual draw card without the roll attached, so Dice So
    // Nice doesn't animate it a second time (2026-09-30 review)
    const { roll, results } = await table.roll();
    const result = results?.[0];
    if (!result) return;
    await showDice(roll);
    await table.toMessage(results, { roll: null, messageData: { speaker: ChatMessage.getSpeaker({ actor }) } });

    const source = await resultDocument(result);
    let created;
    if (source?.documentName === 'Item') {
        const data = source.toObject();
        delete data._id;
        foundry.utils.setProperty(data, 'flags.heart.trinketOf', item.uuid);
        [created] = await actor.createEmbeddedDocuments('Item', [data]);
    } else {
        // a plain text result: make a simple item from it
        [created] = await actor.createEmbeddedDocuments('Item', [{
            name: result.text || game.i18n.localize(`heart.trinket.${kind}`),
            type: 'item',
            system: { description: result.text ? `<p>${result.text}</p>` : '' },
            flags: { heart: { trinketOf: item.uuid } },
        }]);
    }
    // (no "added to items" banner: the sheet shows the item, 2026-09-30)
    await item.setFlag('heart', 'trinket', { name: created?.name ?? '', uuid: created?.uuid ?? '' });
}

// The rolled keepsake / trinket as the actor's item (for the sheet's row),
// or null once it has been deleted
export function trinketItemOf(item) {
    const uuid = item?.flags?.heart?.trinket?.uuid;
    if (!uuid) return null;
    try { return fromUuidSync(uuid) ?? null; } catch (e) { return null; }
}

// Buttons: [data-action=roll-trinket] inside
// an element carrying the ancestry / calling's data-item-id;
// [data-action=view-trinket][data-uuid] opens the rolled item
export function activateTrinketListeners(html) {
    const itemFor = (el) => fromUuid(el.closest('[data-trinket-of]')?.dataset.trinketOf ?? el.closest('[data-item-id]')?.dataset.itemId);
    html.find('[data-action=roll-trinket]').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const el = ev.currentTarget;
        if (el.dataset.busy) return;
        el.dataset.busy = '1';
        try { await rollTrinket(await itemFor(el)); } finally { delete el.dataset.busy; }
    });
    html.find('[data-action=view-trinket]').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const doc = await fromUuid(ev.currentTarget.dataset.uuid);
        doc?.sheet.render(true);
    });
}
