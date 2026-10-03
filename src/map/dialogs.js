// The Heart map's dialogs (2026-10-02): Heart dialog chrome (common/dialog.js)
// with chip choices (applications/application.sass). They only ask; the
// layer calls the API with the answer, or nothing when closed.
import { heartDialogOptions } from '../common/dialog';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

const chips = (name, options, checked) => `<div class="chip-set">${options.map(o => (
    `<label class="chip-toggle"><input type="radio" name="${name}" value="${esc(o.value)}"${o.value === checked ? ' checked' : ''} />`
    + `<span>${esc(o.label)}</span></label>`
)).join('')}</div>`;

// A link between two landmarks, new or (with `current`) to change: its
// kind, how much the delvers know of it, and (for a delve) the Delve actor
// whose resistance it shows. Resolves { kind, state, delve } or null.
export function linkDialog(a, b, current = null) {
    const now = { kind: 'delve', state: 'known', delve: '', ...(current ?? {}) };
    const delves = (game.actors?.filter(x => x.type === 'delve') ?? []).sort((x, y) => x.name.localeCompare(y.name));
    const body = `<p>${esc(loc('heart.map.link-lead', { a: a.name, b: b.name }))}</p>`
        + `<div class="requirement-title">${esc(loc('heart.map.link-kind'))}</div>`
        + chips('kind', [
            { value: 'delve', label: loc('heart.map.kind.delve') },
            { value: 'rail', label: loc('heart.map.kind.rail') },
            { value: 'path', label: loc('heart.map.kind.path') },
        ], now.kind)
        + `<div class="requirement-title">${esc(loc('heart.map.link-state'))}</div>`
        + chips('state', [
            { value: 'rumoured', label: loc('heart.map.state.rumoured') },
            { value: 'known', label: loc('heart.map.state.known') },
            { value: 'hidden', label: loc('heart.map.state.hidden') },
        ], now.state)
        + (delves.length
            ? `<div class="requirement-title">${esc(loc('heart.map.link-delve'))}</div>`
                + chips('delve', [{ value: '', label: loc('heart.map.no-delve') }, ...delves.map(d => ({ value: d.uuid, label: d.name }))], now.delve ?? '')
            : `<p class="map-dialog-note">${esc(loc('heart.map.no-delves'))}</p>`);
    return new Promise(resolve => {
        new Dialog({
            title: loc(current ? 'heart.map.link-edit-title' : 'heart.map.link-title'),
            content: `<form class="heart form map-dialog" autocomplete="off">${body}</form>`,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-route"></i>',
                    label: esc(loc(current ? 'heart.map.link-save' : 'heart.map.link-button')),
                    callback: html => {
                        const val = (n) => html.find(`input[name="${n}"]:checked`).val() ?? '';
                        resolve({ kind: val('kind') || 'delve', state: val('state') || 'known', delve: val('delve') || null });
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: esc(loc('heart.map.cancel')), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
            render: html => html.find('form').on('submit', ev => ev.preventDefault()),
        }, heartDialogOptions({ width: 480 })).render(true);
    });
}

// Remove one of the GM's own landmarks or links. Resolves true / false.
export function confirmRemove(name) {
    return Dialog.confirm({
        title: loc('heart.map.remove-title'),
        content: `<p>${esc(loc('heart.map.remove-lead', { name }))}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false,
        options: heartDialogOptions({ width: 400 }),
    });
}
