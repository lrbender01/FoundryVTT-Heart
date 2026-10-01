// Stress roll rules (HCB p.77-78; gm-companion rulings 13, 16): the pure
// arithmetic, with no Foundry globals and no webpack-only imports, so the
// rules can be tested on their own (2026-09-30, Luke). roll.js imports them
// back unchanged.

export const DIE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd12'];

// One die size smaller; a D4 (or anything off the ladder) stays as it is
export function stepDown(die) {
    const i = DIE_ORDER.indexOf(String(die).toLowerCase());
    return i > 0 ? DIE_ORDER[i - 1] : die;
}

// The die a stress roll uses: the GM's pick (D4 by default), one size smaller
// for a passive action that succeeded at a cost
export function stressDie(die_size, result, passive) {
    let die = String(die_size ?? 'd4').toLowerCase();
    const stepped = Boolean(passive) && result === 'success_at_a_cost';
    if (stepped) die = stepDown(die);
    return { die, stepped };
}

// A critical failure doubles the stress roll (Protection then applies once)
export function stressFormula(die, result) {
    return result === 'critical_failure' ? `2 * {${die}}` : die;
}

// Stress after Protection, per character: Protection in the resistance is
// subtracted, never below zero, unless the roll ignores Protection
export function afterProtection(total, protection, ignoreProtection = false) {
    const p = ignoreProtection ? 0 : (Number(protection) || 0);
    return { protection: p, amount: Math.max(0, total - p) };
}
