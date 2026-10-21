// Trinkets and keepsakes (2026-09-30). A character rolls or picks twice on
// their ancestry's keepsake table and once on their calling's trinket table
// (Luke, 2026-10-21: it allowed one roll and no pick; trinket-rules.js); the
// drawn item goes straight into their inventory (the Items section).
//
// Tables are found by name so the system needs no particular module: a
// RollTable called "<Ancestry> Keepsakes" or "<Calling> Calling Trinkets"
// (any "<Calling> Calling ..." works, e.g. "Containment Calling Toolbox"),
// in the world or any RollTable compendium. fvtt-heart-content ships all 13
// (4 ancestries, 9 callings); neither book prints a table for classes.
//
// Each draw is recorded on the ancestry / calling item as
// flags.heart.trinkets = [{name, uuid}] (older single rolls:
// flags.heart.trinket): no rerolls (Luke, 2026-09-30).

import { showDice, diceRow, rollParts } from '../rolls/dice';
import { iconFor } from '../common/icons';
import { heartDialogOptions } from '../common/dialog';
import { trinketState, drawnTrinkets, pickChoices } from './trinket-rules';

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

// The picker for "roll or pick" (2026-10-21): the table's results as
// chips, the ones already drawn greyed. Resolves the TableResult, or null.
function pickResult(table, kind, drawn) {
    const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
    const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
    const choices = pickChoices([...table.results], drawn);
    const first = choices.find(c => !c.taken);
    const chips = choices.map(c => `<label class="chip-toggle${c.taken ? ' disabled' : ''}">`
        + `<input type="radio" name="pick" value="${esc(c.id)}"${c === first ? ' checked' : ''}${c.taken ? ' disabled' : ''} />`
        + `<span>${esc(c.text)}</span></label>`).join('');
    return new Promise(resolve => {
        new Dialog({
            title: loc(`heart.trinket.pick-title-${kind}`),
            content: `<form class="heart form bond-dialog" autocomplete="off"><p>${esc(loc('heart.trinket.pick-lead', { table: table.name }))}</p>`
                + `<div class="chip-set">${chips}</div></form>`,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-check"></i>',
                    label: esc(loc(`heart.trinket.pick-button-${kind}`)),
                    callback: html => resolve(table.results.get(html.find('input[name=pick]:checked').val()) ?? null),
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: esc(loc('heart.bond.dialog.cancel')), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
            render: html => html.find('form').on('submit', ev => ev.preventDefault()),
        }, heartDialogOptions({ width: 520 })).render(true);
    });
}

// Draw one keepsake / trinket: rolled on the table, or picked from it
export async function rollTrinket(item, { pick = false } = {}) {
    const actor = item?.actor;
    const kind = trinketKind(item);
    if (!actor || !kind) return;
    const itemName = game.i18n.localize(item.name);
    if (!actor.isOwner) return;
    const state = trinketState(kind, item.flags?.heart);
    if (state.done) {
        ui.notifications.info(game.i18n.format('heart.trinket.already', { name: itemName }));
        return;
    }
    const table = await findTrinketTable(item);
    if (!table) {
        ui.notifications.warn(game.i18n.format('heart.trinket.no-table', { name: itemName }));
        return;
    }
    let roll = null;
    let result;
    if (pick) {
        result = await pickResult(table, kind, state.drawn);
        if (!result) return;
    } else {
        // Roll the table and show the dice (Dice So Nice, or Foundry's dice
        // sound); the card below carries no roll, so nothing animates twice
        // (2026-09-30 review)
        const drawn = await table.roll();
        roll = drawn.roll;
        result = drawn.results?.[0];
        if (!result) return;
        await showDice(roll);
    }

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
    await item.setFlag('heart', 'trinkets', [...state.drawn, { name: created?.name ?? '', uuid: created?.uuid ?? '' }]);
    await postDrawCard(actor, table, created, roll);
}

// A compact draw card (2026-09-30 review; replaces Foundry's table card and
// its long table description): who drew from which table, then the item's
// icon large beside its name, which opens (and drags) the item
async function postDrawCard(actor, table, created, roll = null) {
    const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
    const name = created?.name ?? '';
    const link = created
        ? `<a class="content-link ledger-name" draggable="true" data-link data-uuid="${esc(created.uuid)}" data-type="Item">${esc(name)}</a>`
        : `<span class="ledger-name">${esc(name)}</span>`;
    // ledger style (2026-09-30, round-2 mock B): the table as the hint line,
    // the item's icon leading its name, then the table's die
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="heart heart-draw-card"><div class="ledger">`
            + `<div class="ledger-what">${esc(game.i18n.format(roll ? 'heart.trinket.draw-flavor' : 'heart.trinket.pick-flavor', { table: table.name }))}</div>`
            + `<div class="ledger-out">${iconFor(created?.img)}${link}</div>`
            + (roll ? diceRow(rollParts(roll)) : '')
            + `</div></div>`,
    });
}

// The drawn keepsakes / trinkets for a sheet: each { name, uuid, doc },
// doc the actor's item (null once deleted), name its current name (it may
// have been renamed) or the one recorded when drawn
export function trinketEntries(item) {
    return drawnTrinkets(item?.flags?.heart).map(d => {
        let doc = null;
        if (d.uuid) {
            try { doc = fromUuidSync(d.uuid) ?? null; } catch (e) { doc = null; }
        }
        return { name: doc?.name ?? d.name ?? '', uuid: d.uuid ?? '', doc };
    });
}

// What the sheets show (2026-10-21): the draws, and the Roll / Pick buttons
// while draws are left and the user owns the item
export function trinketView(item) {
    const kind = trinketKind(item);
    if (!kind) return null;
    const state = trinketState(kind, item.flags?.heart);
    return {
        kind,
        entries: trinketEntries(item),
        missing: !state.done,
        canDraw: Boolean(item.isOwner) && !state.done,
        rollLabel: game.i18n.localize(`heart.trinket.roll-${kind}`),
        pickLabel: game.i18n.localize(`heart.trinket.pick-${kind}`),
    };
}

// What an ancestry / calling / class put on the character as items of its
// own (2026-10-01, Luke): the rolled keepsake or trinket (flags.heart.
// trinketOf on the item, or the source's flags.heart.trinket on older
// rolls). Its abilities, equipment, and beats live inside it and go with it.
export function grantedItemsOf(item, actor = item?.actor) {
    if (!actor || !item) return [];
    const recorded = drawnTrinkets(item.flags?.heart).map(d => d.uuid).filter(Boolean);
    return actor.items.filter(i => i.id !== item.id
        && (i.flags?.heart?.trinketOf === item.uuid || recorded.includes(i.uuid)));
}

// Removing an ancestry, calling, or class (the trash icon, or picking
// another) deletes what it granted
export function registerGrantCleanup() {
    Hooks.on('deleteItem', async (item, options, userId) => {
        if (game.user.id !== userId) return;
        if (!['ancestry', 'calling', 'class'].includes(item.type)) return;
        const actor = item.actor;
        const ids = grantedItemsOf(item, actor).map(i => i.id);
        if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
    });
}

// Buttons: [data-action=roll-trinket] / [data-action=pick-trinket] inside
// an element carrying the ancestry / calling's data-item-id;
// [data-action=view-trinket][data-uuid] opens the drawn item
export function activateTrinketListeners(html) {
    const itemFor = (el) => fromUuid(el.closest('[data-trinket-of]')?.dataset.trinketOf ?? el.closest('[data-item-id]')?.dataset.itemId);
    html.find('[data-action=roll-trinket], [data-action=pick-trinket]').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const el = ev.currentTarget;
        if (el.dataset.busy) return;
        el.dataset.busy = '1';
        const pick = el.dataset.action === 'pick-trinket';
        try { await rollTrinket(await itemFor(el), { pick }); } finally { delete el.dataset.busy; }
    });
    html.find('[data-action=view-trinket]').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const doc = await fromUuid(ev.currentTarget.dataset.uuid);
        doc?.sheet.render(true);
    });
}
