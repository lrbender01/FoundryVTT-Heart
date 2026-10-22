// The Heart action-roll pool (2026-09-30 rebuild, from the rules audit and
// the "Heart Roll Prompt" mock). ONE place decides what a roll contains, used
// by both the roll prompt's live preview and the roll itself, so they can
// never disagree.
//
// Rules (HCB p.76-77, player-reference.md section 3, gm-companion rulings):
//   pool       1 base d10, +1 skill if the character has it, +1 domain if
//              they have it, +1 mastery (once, whatever the source), +1 per
//              helper who has the chosen skill or domain
//   Tired      skills add no dice; Clouded: domains add no dice (App. A)
//   Furious    cannot help another character (App. A)
//   helpers    up to two (table ruling 10). buildPool adds a die for every
//              helper it is given: the prompt (and a roll request's Roll as,
//              requestHelpers below) decide who may help, and the GM may
//              override there
//   companions help only through an ability that gives assistance, adding
//              one D10 like a character and counting toward the cap
//              (Luke, 2026-10-21: W&M W66 assistance is the helper die;
//              companions.js)
//   difficulty Standard keeps the highest; Risky removes the highest die;
//              Dangerous removes the two highest; Impossible does not roll
//              (the action fails and stress is taken)
//   fresh die  if difficulty would remove every die, roll ONE fresh d10 on
//              the Difficult table (10 success at a cost, 1-9 failure;
//              ruling 3 as changed 2026-09-30, results.js)

import { companionHelp, isCompanion } from './companions.js';

export const DIFFICULTY_CUT ={ standard: 0, risky: 1, dangerous: 2, impossible: Infinity };
export const HELPER_LIMIT = 2;

// Fallouts are recognised by name: system-pack fallouts carry lang keys like
// "fallout.minor.blood.tired.name"; hand-made ones plain names ("Tired").
function falloutWords(item) {
    const raw = String(item.name ?? '').toLowerCase();
    const localized = String(game.i18n.localize(item.name ?? '')).toLowerCase();
    return `${raw.split('.').join(' ')} ${localized}`;
}

// A character's own fallouts plus the party's (Provisions house rule,
// 2026-09-30: a party-wide fallout befalls every delver)
export function activeFallouts(actor) {
    const own = (actor?.items ?? []).filter(i => i.type === 'fallout' && !(i.system?.complete));
    if (actor?.type !== 'character') return own;
    const party = game.heart?.party;
    const shared = (party?.items ?? []).filter(i => i.type === 'fallout' && !(i.system?.complete));
    return [...own, ...shared];
}

function hasFallout(actor, word) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    return activeFallouts(actor).some(f => re.test(falloutWords(f)));
}

export function falloutFlags(actor) {
    return {
        tired: hasFallout(actor, 'tired'),
        clouded: hasFallout(actor, 'clouded'),
        furious: hasFallout(actor, 'furious'),
    };
}

// Fallouts that make some actions harder. Hints only: the GM still picks the
// difficulty, since most apply to certain actions (Limping: fast movement).
const DIFFICULTY_HINTS = [
    ['darkness', 'darkness'], ['limping', 'limping'], ['battered', 'battered'],
    ['blinded', 'blinded'], ['ringing head', 'ringing-head'], ['spitting teeth', 'spitting-teeth'],
    ['hex-eye', 'hex-eye'], ['siren song', 'siren-song'], ['broken arm', 'broken-arm'],
    ['broken leg', 'broken-leg'], ['no rations', 'no-rations'],
];

export function difficultyHints(actor) {
    const words = activeFallouts(actor).map(falloutWords).join(' | ');
    return DIFFICULTY_HINTS
        .filter(([word]) => words.includes(word) || words.includes(word.replace(/[ -]/g, '_')))
        .map(([, key]) => game.i18n.localize(`heart.roll-prompt.fallout-hint.${key}`));
}

export function knackFor(actor, skill, domain) {
    const out = [];
    const sk = skill && actor?.system?.skills?.[skill];
    const dm = domain && actor?.system?.domains?.[domain];
    if (sk?.value && sk.knack) out.push({ label: game.i18n.localize(`heart.skill.${skill}`), knack: sk.knack });
    if (dm?.value && dm.knack) out.push({ label: game.i18n.localize(`heart.domain.${domain}`), knack: dm.knack });
    return out;
}

// A companion helper's notes, as text: a Compel check first (Despondent), an
// ignored demand (Overambitious), several helped at once (Gleeman)
export function companionNotes(companion, help = companionHelp(companion)) {
    return help.notes.map(note => game.i18n.format(`heart.roll-prompt.companion-${note}`, { name: companion?.name ?? '' }));
}

// Can this character help with the chosen skill / domain? A companion has
// neither, so it may help only through its assistance ability (Luke,
// 2026-10-21); whether that applies to this roll is for people to judge,
// so it never depends on the skill or domain picked. A companion's answer
// also carries `trigger` (its ability text) and `notes`.
export function helperEligibility(helper, skill, domain) {
    if (!helper) return { ok: false, reason: '' };
    if (isCompanion(helper)) {
        const help = companionHelp(helper);
        const notes = companionNotes(helper, help);
        if (help.why === 'furious') return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-furious'), trigger: help.trigger, notes };
        if (help.why) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.companion-no-assistance'), trigger: '', notes };
        const reason = help.ability
            ? game.i18n.format('heart.roll-prompt.companion-assists', { ability: help.ability, trigger: help.trigger })
            : game.i18n.format('heart.roll-prompt.companion-assists-notes', { trigger: help.trigger });
        return { ok: true, reason, trigger: help.trigger, ability: help.ability, notes };
    }
    if (falloutFlags(helper).furious) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-furious') };
    if (!skill && !domain) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-pick-first') };
    const has = [];
    if (skill && helper.system?.skills?.[skill]?.value) has.push(game.i18n.localize(`heart.skill.${skill}`));
    if (domain && helper.system?.domains?.[domain]?.value) has.push(game.i18n.localize(`heart.domain.${domain}`));
    if (!has.length) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-lacks') };
    return { ok: true, reason: game.i18n.format('heart.roll-prompt.helper-has', { what: has.join(' + ') }) };
}

// The helpers a roll request's "Roll as" adds (Luke, 2026-10-21, R2: the
// request card skipped every helper rule): the prompt's eligibility and
// cap. A GM overrides, as in the prompt; for anyone else an ineligible or
// extra helper is left out, with a note for the card saying why. The roller
// and unknown actors are dropped silently, as buildPool drops them.
export function requestHelpers(ids = [], { roller = null, skill = null, domain = null, isGM = false } = {}) {
    const helpers = [];
    const notes = [];
    for (const id of new Set(ids ?? [])) {
        if (!id || id === roller) continue;
        const helper = game.actors.get(id);
        if (!helper) continue;
        if (isGM) {
            helpers.push(id);
            continue;
        }
        const e = helperEligibility(helper, skill, domain);
        const reason = !e.ok ? e.reason
            : helpers.length >= HELPER_LIMIT ? game.i18n.localize('heart.roll-prompt.helper-full') : '';
        // the prompt's reason, inside the card's sentence
        if (reason) notes.push(game.i18n.format('heart.card.helper-dropped', { name: helper.name, reason: String(reason).replace(/\.\s*$/, '') }));
        else helpers.push(id);
    }
    return { helpers, notes };
}

// A flavor must not break Foundry's formula grammar ("[", "]") or trip
// @-data replacement
function flavorSafe(text) {
    return String(text).replace(/[[\]@]/g, '').trim() || '?';
}

/**
 * The dice a roll will contain.
 * @returns {{dice: {kind: string, label: string}[], notes: string[], cut: number,
 *            impossible: boolean, fresh: boolean, count: number, kept: number}}
 */
export function buildPool(actor, { skill = null, domain = null, mastery = false, helpers = [], difficulty = 'standard' } = {}) {
    const flags = falloutFlags(actor);
    const dice = [{ kind: 'base', label: game.i18n.localize('heart.rolls.roll.base') }];
    const notes = [];

    if (domain) {
        const label = game.i18n.localize(`heart.domain.${domain}`);
        if (!actor?.system?.domains?.[domain]?.value) notes.push(game.i18n.format('heart.roll-prompt.lacks', { name: actor?.name ?? '', what: label }));
        else if (flags.clouded) notes.push(game.i18n.format('heart.roll-prompt.clouded', { what: label }));
        else dice.push({ kind: 'domain', label, slug: domain });
    }
    if (skill) {
        const label = game.i18n.localize(`heart.skill.${skill}`);
        if (!actor?.system?.skills?.[skill]?.value) notes.push(game.i18n.format('heart.roll-prompt.lacks', { name: actor?.name ?? '', what: label }));
        else if (flags.tired) notes.push(game.i18n.format('heart.roll-prompt.tired', { what: label }));
        else dice.push({ kind: 'skill', label, slug: skill });
    }
    if (mastery) dice.push({ kind: 'mastery', label: game.i18n.localize('heart.mastery.short') });
    for (const id of helpers ?? []) {
        const helper = game.actors.get(id);
        if (!helper || id === actor?.id) continue;
        dice.push({ kind: 'helper', label: helper.name, id });
        // a companion's notes ride on the card for the GM (Luke, 2026-10-21)
        if (isCompanion(helper)) notes.push(...companionNotes(helper));
    }

    const cut = DIFFICULTY_CUT[difficulty] ?? 0;
    const impossible = difficulty === 'impossible';
    const fresh = !impossible && dice.length - cut <= 0;
    return { dice, notes, cut: impossible ? 0 : cut, impossible, fresh, count: dice.length, kept: Math.max(0, dice.length - cut) };
}

// The roll formula for a pool
export function poolFormula(pool) {
    if (pool.impossible) return '0';
    if (pool.fresh) return `1d10[${flavorSafe(game.i18n.localize('heart.rolls.roll.fresh-flavor'))}]`;
    const terms = pool.dice.map(d => `1d10[${flavorSafe(d.label)}]`).join(', ');
    return `{${terms}}${pool.cut ? `dh${pool.cut}` : ''}kh`;
}
