// Bond dialogs (2026-10-01, Luke approved the Heart Bonds Mock's designs):
// Heart dialog chrome (common/dialog.js) with chip choices
// (applications/application.sass) and a filled action button that says what
// it does. Each resolves with what was picked, or null when closed. They
// only ask; bonds/flow.js and the sheets call game.heart.bonds with the
// answer.

import { heartDialogOptions } from '../common/dialog';
import { glyphFor } from '../common/icons';
import { RESISTANCES, poolStress } from './rules';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

// A Dialog v1 with one action button and Cancel. read(html) turns the form
// into the answer; an answer of null keeps the dialog's promise at null.
function ask({ title, body, button, icon = 'fa-check', read, width = 460 }) {
    return new Promise(resolve => {
        new Dialog({
            title,
            content: `<form class="heart form bond-dialog" autocomplete="off">${body}</form>`,
            buttons: {
                ok: { icon: `<i class="fas ${icon}"></i>`, label: esc(button), callback: html => resolve(read(html)) },
                cancel: { icon: '<i class="fas fa-times"></i>', label: esc(loc('heart.bond.dialog.cancel')), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
            // Enter in a text field must not submit a form element
            render: html => html.find('form').on('submit', ev => ev.preventDefault()),
        }, heartDialogOptions({ width })).render(true);
    });
}

const radio = (html, name) => html.find(`input[name="${name}"]:checked`).val() ?? null;
const poolLine = (bond) => `${poolStress(bond.system)} / ${Number(bond.system?.stress?.max) || 10}`;

// Visit a person bond: which Resistance hands over Stress. Empty tracks are
// greyed; the fullest one starts picked.
export function visitDialog(character, bond) {
    const tracks = RESISTANCES.map(key => ({ key, value: Number(character.system?.resistances?.[key]?.value) || 0 }));
    const fullest = [...tracks].sort((a, b) => b.value - a.value)[0];
    if (!fullest?.value) {
        ui.notifications.info(loc('heart.bond.dialog.visit-none', { name: character.name }));
        return Promise.resolve(null);
    }
    const chips = tracks.map(({ key, value }) => {
        const label = loc(`heart.resistance.${key}`);
        const tip = value
            ? loc('heart.bond.dialog.visit-chip-tip', { value, resistance: label })
            : loc('heart.bond.dialog.visit-chip-empty', { name: character.name, resistance: label });
        return `<label class="chip-toggle${value ? '' : ' disabled'}" data-tooltip="${esc(tip)}">`
            + `<input type="radio" name="resistance" value="${key}"${key === fullest.key ? ' checked' : ''}${value ? '' : ' disabled'} />`
            + `<span>${glyphFor('resistance', key)}${esc(label)}<b class="chip-count">${value}</b></span></label>`;
    }).join('');
    return ask({
        title: loc('heart.bond.dialog.visit-title', { bond: bond.name }),
        body: `<p>${esc(loc('heart.bond.dialog.visit-lead', { name: character.name, bond: bond.name }))}</p>`
            + `<div class="requirement-title">${esc(loc('heart.resistance.label-single'))}</div><div class="chip-set">${chips}</div>`
            + `<p class="bond-dialog-note">${esc(loc('heart.bond.dialog.visit-note', { bond: bond.name }))} <b>${poolLine(bond)}</b></p>`,
        button: loc('heart.bond.dialog.visit-button', { bond: bond.name }),
        icon: 'fa-handshake',
        read: html => radio(html, 'resistance'),
    });
}

// Heal a Fallout at a person bond: the character's own Minor and Major
// Fallouts, each saying what happens to it
export function healDialog(character, bond) {
    const fallouts = character.items.filter(i => i.type === 'fallout' && !i.system?.complete
        && ['minor', 'major'].includes(i.system?.type));
    if (!fallouts.length) {
        ui.notifications.info(loc('heart.bond.dialog.heal-none', { name: character.name }));
        return Promise.resolve(null);
    }
    const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const chips = fallouts.map((f, i) => {
        const outcome = loc(f.system.type === 'minor' ? 'heart.bond.dialog.heal-removed' : 'heart.bond.dialog.heal-downgraded');
        return `<label class="chip-toggle" data-tooltip="${esc(plain(f.system.description))}">`
            + `<input type="radio" name="fallout" value="${f.id}"${i === 0 ? ' checked' : ''} />`
            + `<span>${glyphFor('severity', f.system.type)}${glyphFor('resistance', f.system.resistance)}${esc(game.i18n.localize(f.name))}<em class="chip-outcome">${esc(outcome)}</em></span></label>`;
    }).join('');
    return ask({
        title: loc('heart.bond.dialog.heal-title', { bond: bond.name }),
        body: `<p>${esc(loc('heart.bond.dialog.heal-lead', { name: character.name, bond: bond.name }))}</p>`
            + `<div class="requirement-title">${esc(loc('heart.bond.sheet.fallouts'))}</div><div class="chip-set chip-col">${chips}</div>`
            + `<p class="bond-dialog-note">${esc(loc('heart.bond.dialog.heal-note', { bond: bond.name }))} <b>${poolLine(bond)}</b></p>`,
        button: loc('heart.bond.ui.heal'),
        icon: 'fa-heart',
        read: html => radio(html, 'fallout'),
    });
}

// The GM hires a hireling or animal: who runs them, and an optional name
export function hireDialog(character, hireling) {
    const kind = loc('heart.bond.kind.companion');
    return ask({
        title: loc('heart.bond.dialog.hire-title', { name: hireling.name }),
        body: `<p>${esc(loc('heart.bond.dialog.hire-lead', { name: hireling.name, character: character.name }))}</p>`
            + `<div class="requirement-title">${esc(loc('heart.bond.dialog.run-by'))}</div>`
            + `<div class="chip-set segmented">`
            + `<label class="chip-toggle" data-tooltip="${esc(loc('heart.bond.dialog.run-player-tip', { character: character.name }))}"><input type="radio" name="runBy" value="player" checked /><span>${esc(loc('heart.bond.dialog.run-player'))}</span></label>`
            + `<label class="chip-toggle" data-tooltip="${esc(loc('heart.bond.dialog.run-gm-tip'))}"><input type="radio" name="runBy" value="gm" /><span>${esc(loc('heart.bond.dialog.run-gm'))}</span></label></div>`
            + `<div class="bond-field"><div class="requirement-title">${esc(loc('heart.bond.dialog.name-optional'))}</div>`
            + `<input type="text" name="name" value="" placeholder="${esc(hireling.name)}" /></div>`
            + `<p class="bond-dialog-note">${esc(loc('heart.bond.dialog.name-note', { name: hireling.name, kind }))}</p>`,
        button: loc('heart.bond.dialog.hire-button', { character: character.name }),
        icon: 'fa-handshake',
        read: html => ({ runBy: radio(html, 'runBy') ?? 'player', name: String(html.find('[name=name]').val() ?? '').trim() }),
    });
}

// A companion's bond action: what it is asked to do, at home, in its expertise
export function bondActionDialog(bond) {
    const check = (name, key) => `<label class="chip-toggle" data-tooltip="${esc(loc(`heart.bond.dialog.${key}-tip`))}"><input type="checkbox" name="${name}" /><span>${esc(loc(`heart.bond.dialog.${key}`))}</span></label>`;
    return ask({
        title: loc('heart.bond.dialog.action-title', { bond: bond.name }),
        body: `<p>${esc(loc('heart.bond.dialog.action-lead', { bond: bond.name }))}</p>`
            + `<div class="bond-field"><div class="requirement-title">${esc(loc('heart.bond.dialog.action-what'))}</div><input type="text" name="what" value="" /></div>`
            + `<div class="bond-checks">${check('home', 'home')}${check('expertise', 'expertise')}</div>`
            + `<p class="bond-dialog-note">${esc(loc('heart.bond.ui.action-tip'))}</p>`,
        button: loc('heart.bond.dialog.action-button', { bond: bond.name }),
        icon: 'fa-dice-d10',
        read: html => ({
            what: String(html.find('[name=what]').val() ?? '').trim(),
            home: html.find('[name=home]').is(':checked'),
            expertise: html.find('[name=expertise]').is(':checked'),
        }),
    });
}
