// Display data for the Provisions track (2026-09-30), shared by the party
// sheet and every character sheet's Resistances section. Read-only: marks
// and relief go through the party API (party.js), never the sheet.

import { orderByFlag } from '../character/reorder';

const PROTECTION_SHIELDS = 5;
const ROW = 10;

const loc = (key, data) => (data ? game.i18n.format(`heart.party-sheet.${key}`, data) : game.i18n.localize(`heart.party-sheet.${key}`));

// p: provisionsOf(party) = { value, max, protection, quartermaster,
// quartermasterName, criticalFrom, pastRolling }
export function provisionsView(p) {
    if (!p) return null;
    const boxes = Array.from({ length: p.max }, (_, i) => ({
        checked: i < p.value,
        // from the Critical line on (box 13): every check is fallout
        critical: i + 1 >= p.criticalFrom,
        criticalStart: i + 1 === p.criticalFrom,
    }));
    const rows = [];
    for (let i = 0; i < boxes.length; i += ROW) rows.push(boxes.slice(i, i + ROW));

    let status = '';
    if (p.value >= p.max) status = loc('status-full');
    else if (p.value >= p.criticalFrom) status = loc('status-dire', { past: p.criticalFrom - 1 });

    return {
        ...p,
        rows,
        shields: Array.from({ length: PROTECTION_SHIELDS }, (_, i) => ({ checked: i < p.protection })),
        status,
        trackTip: loc('track-tip', { value: p.value, max: p.max, critical: p.criticalFrom }),
        protectionTip: p.quartermaster
            ? loc('protection-tip', { name: p.quartermasterName, count: p.protection })
            : loc('protection-none'),
    };
}

// A party member for the chips on the character and party sheets
// (2026-09-30 review): their class icon (not the token art), and
// "Name: Ancestry Class Calling"
export function memberView(actor, party) {
    const name = (type) => {
        const item = actor.items.find(i => i.type === type);
        return item ? game.i18n.localize(item.name) : '';
    };
    const cls = actor.items.find(i => i.type === 'class');
    const ancestry = name('ancestry') || actor.system?.ancestry || '';
    const traits = [ancestry, name('class'), name('calling')].filter(Boolean).join(' ');
    return {
        id: actor.id,
        name: actor.name,
        icon: cls?.img ?? '',
        traits,
        label: traits ? `${actor.name}: ${traits}` : actor.name,
        quartermaster: party?.system?.quartermaster === actor.id,
    };
}

// A member's pursued beats for the party sheet's Beats section (2026-09-30,
// Luke): read-only, in the order the member keeps them on their own sheet,
// with the full text
export function memberBeats(actor) {
    const beats = orderByFlag(actor, actor.proxy?.beats ?? [], 'beatOrder');
    return beats.map(b => ({ type: b.system?.type ?? '', text: b.system?.description ?? '' }));
}

// The party's members as characters (ids that no longer point at one drop
// out), always in alphabetical order wherever they are shown (2026-09-30
// review: no manual ordering)
export function partyMembers(party) {
    return (party?.system?.members ?? [])
        .map(id => game.actors.get(id))
        .filter(a => a?.type === 'character')
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}
