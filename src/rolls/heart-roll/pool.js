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
//   helpers    up to two (table ruling 10); the GM may override
//   difficulty Standard keeps the highest; Risky removes the highest die;
//              Dangerous removes the two highest; Impossible does not roll
//              (the action fails and stress is taken)
//   fresh die  if difficulty would remove every die, roll ONE fresh d10 on
//              the Difficult table (10 success at a cost, 2-9 failure,
//              1 critical failure per ruling 3)

export const DIFFICULTY_CUT = { standard: 0, risky: 1, dangerous: 2, impossible: Infinity };
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

// Can this character help with the chosen skill / domain?
export function helperEligibility(helper, skill, domain) {
    if (!helper) return { ok: false, reason: '' };
    if (falloutFlags(helper).furious) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-furious') };
    if (!skill && !domain) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-pick-first') };
    const has = [];
    if (skill && helper.system?.skills?.[skill]?.value) has.push(game.i18n.localize(`heart.skill.${skill}`));
    if (domain && helper.system?.domains?.[domain]?.value) has.push(game.i18n.localize(`heart.domain.${domain}`));
    if (!has.length) return { ok: false, reason: game.i18n.localize('heart.roll-prompt.helper-lacks') };
    return { ok: true, reason: game.i18n.format('heart.roll-prompt.helper-has', { what: has.join(' + ') }) };
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
        if (helper && id !== actor?.id) dice.push({ kind: 'helper', label: helper.name, id });
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
