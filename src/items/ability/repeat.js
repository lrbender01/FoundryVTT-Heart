// Abilities a character can learn more than once (2026-09-30, Luke). The
// books mark them in the text: "You can take this advance more than once."
// (every class's gain-a-Skill, gain-a-Domain, and +1 Protection advances,
// and Snail Pilgrim's Friend! Blessed Friend! and Refuge: 40 across the 13
// classes). Read from the description, so homebrew abilities with the same
// sentence work too. system.times counts the learns (1 when absent).
const REPEATABLE_RE = /more than once/i;

export function isRepeatable(ability) {
    const text = String(ability?.system?.description ?? '');
    return ability?.type === 'ability' && REPEATABLE_RE.test(text);
}

// how many times it has been learned: 0 while not learned
export function learnedTimes(ability) {
    if (!ability?.system?.active) return 0;
    return Math.max(1, Math.floor(Number(ability.system.times) || 1));
}
