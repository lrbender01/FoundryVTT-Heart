// A final confirmation before a character loses work (2026-10-01, Luke):
// removing a class with abilities learned beyond its core ones (the class
// takes them, and the skills and domains reset, index.js), a calling with
// beats pursued or finished, or an ancestry whose questions were written in
// (answers, or questions the player added). Asked for the trash icon and for
// replacing one with another (picker or drop); anything without such work
// keeps the ordinary delete prompt, or none when replaced.

import { heartDialogOptions } from '../common/dialog';

const children = (data) => Object.values(data?.system?.children ?? {});
const nameOf = (data) => {
    const name = String(data?.name ?? '');
    return globalThis.game?.i18n ? game.i18n.localize(name) : name;
};

// Abilities learned beyond the class's core ones, options under a major
// ability included: their names
export function learnedAbilities(cls) {
    const out = [];
    const walk = (data) => {
        for (const c of children(data)) {
            if (c?.type === 'ability' && c.system?.active && c.system?.type !== 'core') out.push(nameOf(c));
            walk(c);
        }
    };
    walk(cls);
    return out;
}

// Beats pursued or finished on a calling: their names
export function trackedBeats(calling) {
    return children(calling)
        .filter(c => c?.type === 'beat' && (c.system?.active || c.system?.complete))
        .map(nameOf);
}

// Ancestry questions written in: an answer, or wording the player added
export function writtenQuestions(ancestry) {
    const text = (html) => String(html ?? '').replace(/<[^>]*>/g, '').trim();
    return Object.values(ancestry?.system?.questions ?? {})
        .filter(q => text(q?.answer) || (q?.custom && text(q?.question))).length;
}

// What the confirmation lists for this item, or null when nothing would be lost
export function removalLoss(item) {
    if (!item?.actor || item.actor.type !== 'character') return null;
    if (item.type === 'class') {
        const names = learnedAbilities(item);
        return names.length ? { kind: 'class', names } : null;
    }
    if (item.type === 'calling') {
        const names = trackedBeats(item);
        return names.length ? { kind: 'calling', names } : null;
    }
    if (item.type === 'ancestry') {
        const count = writtenQuestions(item);
        return count ? { kind: 'ancestry', count } : null;
    }
    return null;
}

// The confirmation itself. Resolves true to go ahead: at once when nothing
// would be lost, else when the user confirms
export async function confirmRemoval(item) {
    const loss = removalLoss(item);
    if (!loss) return true;
    const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
    const f = (key, data) => game.i18n.format(`heart.removal.${key}`, data);
    const name = game.i18n.localize(item.name);
    const list = loss.names
        ? `<ul class="heart-removal-list">${loss.names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`
        : '';
    const lead = loss.kind === 'ancestry'
        ? f('ancestry-lead', { name, actor: item.actor.name, count: loss.count })
        : f(`${loss.kind}-lead`, { name, actor: item.actor.name, count: loss.names.length });
    return Dialog.confirm({
        title: f('title', { name }),
        content: `<p>${esc(lead)}</p>${list}<p>${esc(f(`${loss.kind}-body`, { name }))}</p>`,
        defaultYes: false,
        options: heartDialogOptions(),
    });
}
