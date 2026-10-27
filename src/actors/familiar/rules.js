// The Witch is Dead (Grant Howitt's free one-page game), played inside the
// Heart system (Luke, 2026-10-24: a one-shot where the players are the
// familiars of a murdered witch, a pilgrim village in 1691). The familiar's
// rules, pure (no Foundry globals) so vitest loads them; tested in
// test/familiar.test.mjs. The sheet (sheet.js) and the rolls and chat cards
// (roll.js) read everything from here.
//
//   - four traits, each 0 to 3: Clever, Fierce, Sly, and Quick
//   - a roll is a d10 plus the most relevant trait, against a number the GM
//     names (6 Simple to 10 Near-impossible); equal or beat it to succeed
//   - failing something dangerous gains a point of Danger; magic is always
//     dangerous
//   - a die (the die alone) equal to or under the Danger held before the
//     roll is serious trouble: dead, trapped, lost, or captured
//   - Danger comes down by hand (solving, or running from, a problem)

export const TRAITS = Object.freeze(['clever', 'fierce', 'sly', 'quick']);
export const TRAIT_MIN = 0;
export const TRAIT_MAX = 3;

// The species table, a d10, in the game's order (Clever, Fierce, Sly, Quick)
export const SPECIES = Object.freeze([
    { id: 'fox', traits: { clever: 2, fierce: 2, sly: 1, quick: 1 } },
    { id: 'cat', traits: { clever: 0, fierce: 1, sly: 3, quick: 2 } },
    { id: 'toad', traits: { clever: 1, fierce: 0, sly: 2, quick: 1 } },
    { id: 'spider', traits: { clever: 2, fierce: 0, sly: 3, quick: 1 } },
    { id: 'owl', traits: { clever: 3, fierce: 1, sly: 1, quick: 2 } },
    { id: 'hare', traits: { clever: 0, fierce: 0, sly: 2, quick: 3 } },
    { id: 'magpie', traits: { clever: 2, fierce: 1, sly: 1, quick: 2 } },
    { id: 'crow', traits: { clever: 2, fierce: 1, sly: 2, quick: 1 } },
    { id: 'dog', traits: { clever: 1, fierce: 3, sly: 0, quick: 1 } },
    { id: 'rat', traits: { clever: 1, fierce: 0, sly: 2, quick: 2 } },
].map(Object.freeze));

// The spell the witch taught you, a d10: little bits of hedge magic
export const SPELLS = Object.freeze([
    'unseen-hand',
    'conjure-light',
    'speak-human',
    'lock-unlock',
    'conjure-dinner',
    'make-flame',
    'tidy-clean-mend',
    'plant-growth',
    'distract-confuse',
    'book-read-aloud',
]);

// Task ratings: the number to equal or beat
export const TARGETS = Object.freeze([
    { value: 6, id: 'simple' },
    { value: 7, id: 'basic' },
    { value: 8, id: 'challenging' },
    { value: 9, id: 'difficult' },
    { value: 10, id: 'near-impossible' },
].map(Object.freeze));
export const DEFAULT_TARGET = 7;

const whole = (value) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? n : 0;
};

// A trait as the rules allow it: a whole number, 0 to 3
export function clampTrait(value) {
    return Math.min(TRAIT_MAX, Math.max(TRAIT_MIN, whole(value)));
}

// Danger: a whole number, 0 up (no top: the dice decide when it is too much)
export function clampDanger(value) {
    return Math.max(0, whole(value));
}

// Danger moved by a step (the sheet's + and -), never below 0
export function dangerStep(value, delta) {
    return clampDanger(clampDanger(value) + whole(delta));
}

// The four traits of a familiar's system data, each clamped
export function traitsOf(system) {
    return Object.fromEntries(TRAITS.map(key => [key, clampTrait(system?.traits?.[key])]));
}

export function dangerOf(system) {
    return clampDanger(system?.danger);
}

// Whether rolling a species would overwrite something: a species written in,
// or any trait above 0
export function hasTraits(system) {
    if (String(system?.species ?? '').trim()) return true;
    const traits = traitsOf(system);
    return TRAITS.some(key => traits[key] > 0);
}

// The table entry for a d10 face (1 to 10), or null
export function speciesFor(face) {
    const n = whole(face);
    return n >= 1 && n <= SPECIES.length ? SPECIES[n - 1] : null;
}

// The spell a familiar's written spell names (the sheet keeps the spell's
// name as typed or rolled, in the table's language): its id when the text is
// one of the ten (its label as `labelOf` gives it, or its id), else null.
// For its sigil (Luke, 2026-10-26).
export function spellIdOf(text, labelOf = (id) => id) {
    const key = String(text ?? '').trim().toLowerCase();
    if (!key) return null;
    return SPELLS.find(id => id === key || String(labelOf(id) ?? '').trim().toLowerCase() === key) ?? null;
}

export function spellFor(face) {
    const n = whole(face);
    return n >= 1 && n <= SPELLS.length ? SPELLS[n - 1] : null;
}

// The actor update a rolled species makes: its name and all four traits
export function speciesUpdate(entry, name) {
    const update = { 'system.species': String(name ?? '') };
    for (const key of TRAITS) update[`system.traits.${key}`] = clampTrait(entry?.traits?.[key]);
    return update;
}

// The rating a target number names; anything off the table is Basic
export function targetOf(value) {
    const n = whole(value);
    return TARGETS.find(t => t.value === n) ?? TARGETS.find(t => t.value === DEFAULT_TARGET);
}

// One roll's outcome. die: the d10's face; trait: the trait's value;
// target: the number to equal or beat; danger: the Danger held before the
// roll. Magic makes it dangerous whatever was ticked.
export function familiarOutcome({ die, trait, target, danger, dangerous = false, magic = false } = {}) {
    const face = whole(die);
    const bonus = clampTrait(trait);
    const goal = targetOf(target).value;
    const before = clampDanger(danger);
    const risky = Boolean(dangerous || magic);
    const total = face + bonus;
    const success = total >= goal;
    const gainDanger = risky && !success;
    return {
        die: face,
        trait: bonus,
        total,
        target: goal,
        success,
        dangerous: risky,
        magic: Boolean(magic),
        dangerBefore: before,
        gainDanger,
        dangerAfter: before + (gainDanger ? 1 : 0),
        // the die alone, against the Danger before this roll (a Danger of 0
        // never triggers it: a d10 shows 1 at least)
        trouble: before > 0 && face <= before,
    };
}

// A sheet's form data with the traits and Danger kept in range (the inputs
// say min and max, but a typed number gets through)
export function clampFamiliarData(formData) {
    const out = { ...(formData ?? {}) };
    for (const key of TRAITS) {
        const path = `system.traits.${key}`;
        if (path in out) out[path] = clampTrait(out[path]);
    }
    if ('system.danger' in out) out['system.danger'] = clampDanger(out['system.danger']);
    return out;
}
