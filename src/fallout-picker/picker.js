// The Fallout picker (2026-10-01, Luke: one window for every place Fallout
// goes). Fallout is the GM's pick within its severity (HCB p. 78; table
// ruling 12: the GM picks, players lobby). Open it for:
//   - a character, the party, or a companion (an Actor): the pick is added
//     to it as a Fallout item (a companion's own book Fallout is switched
//     on instead)
//   - a person bond (a `bond` Item): the pick is added to the bond
// It lists the Fallout packs, world Fallouts, a companion's own book menu,
// and a person bond's two book lines (HCB p. 102), filtered by severity,
// resistance, and a search, plus "Write your own". It only adds the
// Fallout: Stress is always cleared by hand.

import { heartDialogOptions } from '../common/dialog';
import { glyphFor } from '../common/icons';
import { candidate, dedupe, matches, sortCandidates, falloutData, SEVERITIES } from './candidates';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
const resistanceList = () => game.heart?.fallout_resistances
    ?? [...(game.heart?.resistances ?? ['blood', 'mind', 'echo', 'fortune', 'supplies']), 'provisions', 'bond'];

const isBondItem = (target) => target?.documentName === 'Item' && target.type === 'bond';
const isCompanion = (target) => target?.documentName === 'Actor' && target.type === 'hireling';

// Every Fallout the picker can offer this target
async function gather(target) {
    const list = [];
    // a companion's own book Fallouts not yet taken
    if (isCompanion(target)) {
        for (const item of target.items) {
            if (item.type === 'fallout' && !item.system?.active) list.push(candidate(item, 'own'));
        }
    }
    // a person bond's two book lines (HCB p. 102)
    if (isBondItem(target)) {
        for (const severity of ['minor', 'major']) {
            list.push(candidate({
                id: `builtin-${severity}`,
                name: loc(`heart.bond.trouble.${severity}`),
                system: { type: severity, resistance: 'bond', description: `<p>${esc(loc(`heart.bond.trouble-desc.${severity}`))}</p>`, source: 'HCB p. 102' },
            }, 'builtin'));
        }
    }
    for (const pack of game.packs.filter(p => p.documentName === 'Item' && p.visible)) {
        const index = await pack.getIndex({ fields: ['img', 'system.type', 'system.resistance', 'system.description', 'system.source'] });
        for (const entry of index) {
            if (entry.type !== 'fallout') continue;
            list.push(candidate({ ...entry, uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}` }, 'book'));
        }
    }
    for (const item of game.items.filter(i => i.type === 'fallout')) list.push(candidate(item, 'world'));
    return sortCandidates(dedupe(list));
}

function rowHtml(c) {
    const origin = c.origin === 'own' ? loc('heart.fallout-picker.own') : c.source;
    return `<label class="picker-row" data-key="${esc(c.key)}" data-tooltip="${esc(c.text)}">`
        + `<input type="radio" name="pick" value="${esc(c.key)}" />`
        + `<span class="picker-row-body">`
        + `<span class="picker-row-head">${glyphFor('severity', c.severity)}${c.resistance ? glyphFor('resistance', c.resistance) : ''}<b>${esc(c.name)}</b>${origin ? `<small>${esc(origin)}</small>` : ''}</span>`
        + `<span class="picker-text">${esc(c.text)}</span>`
        + `</span></label>`;
}

function chips(name, values, chosen, label, glyph) {
    return values.map(v => `<label class="chip-toggle"><input type="radio" name="${name}" value="${v}"${v === chosen ? ' checked' : ''} />`
        + `<span>${glyph && v ? glyphFor(glyph, v) : ''}${esc(label(v))}</span></label>`).join('');
}

// Apply a pick to the target; resolves the added (or switched on) Fallout
async function apply(target, pick) {
    if (isBondItem(target)) {
        await target.addChildren([falloutData(pick)]);
        return pick.name;
    }
    if (pick.origin === 'own' && pick.id) {
        await target.items.get(pick.id)?.update({ 'system.active': true, 'system.complete': false });
        return pick.name;
    }
    if (pick.uuid) {
        const doc = await fromUuid(pick.uuid);
        if (doc) {
            const data = doc.toObject();
            delete data._id;
            foundry.utils.mergeObject(data, { system: { active: true, complete: false } });
            await target.createEmbeddedDocuments('Item', [data]);
            return pick.name;
        }
    }
    await target.createEmbeddedDocuments('Item', [falloutData(pick)]);
    return pick.name;
}

// Open the picker. target: an Actor (character, party, companion) or a
// `bond` Item; severity / resistance: the filters it opens with (a check's
// result; '' is every resistance). Resolves the added Fallout's name, or
// null when closed.
export async function openFalloutPicker({ target, severity = 'minor', resistance } = {}) {
    if (!target) return null;
    if (!target.isOwner) {
        ui.notifications.warn(loc('heart.bond.not-owner', { name: target.name }));
        return null;
    }
    const list = await gather(target);
    const byKey = new Map(list.map(c => [c.key, c]));
    const startResistance = resistance ?? (isBondItem(target) || isCompanion(target) ? 'bond' : '');
    const startSeverity = SEVERITIES.includes(severity) ? severity : 'minor';
    const content = `<form class="heart form bond-dialog fallout-picker" autocomplete="off">`
        + `<p>${esc(loc('heart.fallout-picker.lead', { name: target.name }))}</p>`
        + `<div class="picker-filters">`
        + `<div class="chip-set segmented">${chips('severity', SEVERITIES, startSeverity, v => loc(`heart.fallout.level.${v}`), 'severity')}</div>`
        + `<div class="chip-set">${chips('resistance', ['', ...resistanceList()], startResistance, v => (v ? loc(`heart.resistance.${v}`) : loc('heart.fallout-picker.any')), 'resistance')}</div>`
        + `<input type="search" name="search" placeholder="${esc(loc('heart.fallout-picker.search'))}" />`
        + `</div>`
        + `<div class="picker-list">${list.map(rowHtml).join('')}<div class="picker-empty bond-quiet">${esc(loc('heart.fallout-picker.none'))}</div></div>`
        + `<label class="picker-row picker-custom"><input type="radio" name="pick" value="custom" />`
        + `<span class="picker-row-body"><span class="picker-row-head"><b>${esc(loc('heart.fallout-picker.custom'))}</b></span>`
        + `<input type="text" name="customName" placeholder="${esc(loc('heart.fallout-picker.custom-name'))}" />`
        + `<textarea name="customText" rows="3" placeholder="${esc(loc('heart.fallout-picker.custom-text'))}"></textarea></span></label>`
        + `<p class="bond-dialog-note">${esc(loc('heart.fallout-picker.note'))}</p>`
        + `</form>`;

    return new Promise(resolve => {
        let settled = false;
        // Dialog v1 closes without waiting for an async callback, so the
        // close must not answer while the pick is being added (2026-10-02:
        // the promise always resolved null and an error went unseen)
        let applying = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        const filtersOf = (html) => ({
            severity: html.find('input[name=severity]:checked').val() ?? '',
            resistance: html.find('input[name=resistance]:checked').val() ?? '',
            search: html.find('input[name=search]').val() ?? '',
        });
        new Dialog({
            title: loc('heart.fallout-picker.title', { name: target.name }),
            content,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-check"></i>',
                    label: esc(loc('heart.fallout-picker.add', { name: target.name })),
                    callback: async html => {
                        const key = html.find('input[name=pick]:checked').val();
                        const filters = filtersOf(html);
                        let pick = byKey.get(key);
                        if (key === 'custom') {
                            const name = String(html.find('[name=customName]').val() ?? '').trim();
                            if (!name) {
                                ui.notifications.warn(loc('heart.fallout-picker.custom-needs-name'));
                                return finish(null);
                            }
                            const text = String(html.find('[name=customText]').val() ?? '').trim();
                            pick = {
                                name,
                                severity: filters.severity || 'minor',
                                resistance: filters.resistance,
                                description: text ? `<p>${esc(text)}</p>` : '',
                                origin: 'custom',
                            };
                        }
                        if (!pick) return finish(null);
                        applying = true;
                        try {
                            const added = await apply(target, pick);
                            ui.notifications.info(loc('heart.fallout-picker.added', { fallout: added, name: target.name }));
                            finish(added);
                        } catch (err) {
                            console.error('heart | adding the picked Fallout failed', err);
                            ui.notifications.error(loc('heart.relay.failed'));
                            finish(null);
                        }
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: esc(loc('heart.bond.dialog.cancel')), callback: () => finish(null) },
            },
            default: 'ok',
            close: () => { if (!applying) finish(null); },
            render: html => {
                const form = html.find('form');
                form.on('submit', ev => ev.preventDefault());
                const refresh = () => {
                    const filters = filtersOf(html);
                    let shown = 0;
                    html.find('.picker-list .picker-row').each((i, row) => {
                        const c = byKey.get(row.dataset.key);
                        const on = Boolean(c && matches(c, filters));
                        row.hidden = !on;
                        if (on) shown++;
                        // a hidden row can't stay picked
                        if (!on) row.querySelector('input').checked = false;
                    });
                    html.find('.picker-empty').prop('hidden', shown > 0);
                };
                form.on('change', 'input[name=severity], input[name=resistance]', refresh);
                form.on('input', 'input[name=search]', refresh);
                // picking "Write your own" opens its fields and puts you in the name
                form.on('change', 'input[name=pick][value=custom]', () => form.find('[name=customName]').trigger('focus'));
                // typing your own picks "Write your own"
                form.on('input', '[name=customName], [name=customText]', () => form.find('input[value=custom]').prop('checked', true));
                refresh();
            },
        }, heartDialogOptions({ width: 640, height: 780, resizable: true, classes: ['heart-fallout-picker'] })).render(true);
    });
}
