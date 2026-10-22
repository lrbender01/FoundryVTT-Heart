// Companions as helpers (Luke, 2026-10-21: the companion assist ruling,
// option A). Pure: no Foundry globals and no webpack-only imports, so the
// rules tests load it; pool.js localizes what it answers.
//
// W&M W66 defines "assistance" as the core helper die: "you add an extra dice
// to your pool, as described in Heart" (HCB p. 76: one D10 per helper, who
// takes stress the same way you would; the GM sets a cap). A companion (a
// `hireling` actor: hirelings and animals) has no skills or domains, so it
// may help ONLY when its own assistance ability applies (Fetching Accessory,
// Gleeman, Oddity, Tapper, Watchhog, and any companion whose ability or quirk
// says it gives assistance). When it helps it adds one D10 like a character,
// takes the same stress, and counts toward the helper cap.
//
// Not over-automated (Luke): whether the trigger applies to this roll is for
// the table to judge, so the prompt shows the trigger text and a person ticks
// the box. Furious companions can't help (as characters). A Despondent one
// must pass a Compel check first and a Gleeman helping several at once takes
// stress once, from the worst result: notes only, nothing rolled or tracked.

import { takenFallouts } from '../../bonds/view.js';

export const COMPANION_TYPE = 'hireling';

// "gain assistance", "gives assistance", "giving assistance on ..."
const ASSISTANCE = /\bassistance\b/i;
// context a trigger needs (Watchhog: once per session, one of three)
const LIMIT = /\bonce per (?:session|situation|scene|day)\b/i;
// a trigger that helps several characters at once (Gleeman: "All other
// characters gain assistance")
const MANY = /\b(?:all (?:other )?(?:characters|allies|delvers)|everyone)\b/i;

export function isCompanion(actor) {
    return actor?.type === COMPANION_TYPE;
}

// HTML to sentences: block ends and list items break, then sentence ends
export function sentences(html) {
    const text = String(html ?? '')
        .replace(/<\s*(?:\/p|\/li|br\s*\/?|\/ul|\/ol|\/div)\s*>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
    return text
        .split('\n')
        .flatMap(line => line.split(/(?<=[.!?])\s+/))
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

// The sentences of a text that give assistance, with any limit on how often
// in front of them; '' when it gives none
export function assistanceTrigger(html) {
    const all = sentences(html);
    if (!all.some(s => ASSISTANCE.test(s))) return '';
    return all.filter(s => ASSISTANCE.test(s) || LIMIT.test(s)).join(' ');
}

// Where a companion's assistance comes from: its abilities (items of type
// `ability` that are not switched off), then its notes, where a GM writes
// the quirk of the example they picked. The book's examples are NOT read:
// every example of a role is listed on each companion of it, so one
// example's quirk would wrongly reach them all.
// Answers { name, trigger } or null.
export function assistanceAbility(companion) {
    if (!isCompanion(companion)) return null;
    for (const item of [...(companion.items ?? [])]) {
        if (item?.type !== 'ability' || item.system?.active === false) continue;
        const trigger = assistanceTrigger(item.system?.description);
        if (trigger) return { name: String(item.name ?? ''), trigger };
    }
    const fromNotes = assistanceTrigger(companion.system?.notes);
    if (fromNotes) return { name: '', trigger: fromNotes };
    return null;
}

// The Fallouts a companion has taken that bear on helping, by name
function hasTaken(companion, word) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    return takenFallouts([...(companion?.items ?? [])]).some(f => re.test(String(f.name ?? '')));
}

/**
 * May this companion help? Never asks whether the trigger applies (people
 * decide). Answers { ok, why, ability, trigger, notes }:
 *   why    '' | 'furious' | 'no-assistance'
 *   notes  'despondent' (a Compel check first), 'overambitious' (an ignored
 *          demand loses the ability), 'many' (helps several at once: stress
 *          once, from the worst result)
 */
export function companionHelp(companion) {
    const found = assistanceAbility(companion);
    const notes = [];
    if (hasTaken(companion, 'despondent')) notes.push('despondent');
    if (hasTaken(companion, 'overambitious')) notes.push('overambitious');
    if (found && MANY.test(found.trigger)) notes.push('many');
    const base = { ability: found?.name ?? '', trigger: found?.trigger ?? '', notes };
    if (hasTaken(companion, 'furious')) return { ok: false, why: 'furious', ...base };
    if (!found) return { ok: false, why: 'no-assistance', ...base };
    return { ok: true, why: '', ...base };
}

/**
 * The companions the roll prompt offers, once each, the roller's own first:
 *   - companions the roller has a companion bond with
 *   - companions bonded to the rest of the party (Gleeman: "all other
 *     characters gain assistance", so a party member's companion can help
 *     someone it isn't bonded to)
 * No one else (Luke, 2026-10-22: the party and all their companions, no
 * friend of a friend), so a companion no party member is bonded to is never
 * offered, even one the roller's player owns.
 * roller: the rolling character; party: the party's characters (the
 * helper pool); targetOf(bond): a bond's bonded actor or null.
 */
export function companionCandidates({ roller, party = [], targetOf = () => null } = {}) {
    if (!roller) return [];
    const out = new Map();
    const add = (actor) => {
        if (isCompanion(actor) && actor.id && !out.has(actor.id)) out.set(actor.id, actor);
    };
    const bondedTo = (character) => [...(character?.items ?? [])]
        .filter(i => i?.type === 'bond')
        .map(bond => targetOf(bond))
        .filter(isCompanion);
    bondedTo(roller).forEach(add);
    const rest = [];
    for (const member of party) {
        if (member?.id !== roller.id) rest.push(...bondedTo(member));
    }
    rest.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(add);
    return [...out.values()];
}
