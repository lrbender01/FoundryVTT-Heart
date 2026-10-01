// Heart roll results (HCB p.76-77): the pure tables and lookups, with no
// Foundry globals and no webpack-only imports, so the rules can be tested on
// their own (2026-09-30, Luke). roll.js imports them back unchanged.

// The kept die on the normal table: 1 critical failure, 2-5 failure, 6-7
// success at a cost, 8-9 success, 10 critical success
export const normal_results = {
    'critical_failure': [1, 1],
    'failure': [2, 5],
    'success_at_a_cost': [6, 7],
    'success': [8, 9],
    'critical_success': [10, 10]
};

// The Difficult table (one fresh die when the difficulty removes every die):
// 1-9 failure, 10 success at a cost, as the book prints it (HCB p.77; Luke
// 2026-09-30: follow the book, not the cheat sheet's 1 = critical failure)
export const difficult_results = {
    'failure': [1, 9],
    'success_at_a_cost': [10, 10],
}

// Results that offer a stress roll ('n_a' is a stress roll with no Heart roll
// behind it: upkeep, a restock payment, the character header's Stress button)
export const stress_results = [
    'n_a',
    'success_at_a_cost',
    'failure',
    'critical_failure'
];

// total: the kept die; result_set: 'normal', 'difficult', or 'impossible';
// an Impossible action always fails. Undefined for a total off the table.
export function heartResult(total, result_set, difficulty) {
    if (difficulty === 'impossible') {
        return 'failure';
    }

    let results = normal_results;
    if (result_set === 'difficult') {
        results = difficult_results;
    }

    return Object.keys(results).find(result => {
        const [minVal, maxVal] = results[result];
        return minVal <= total && total <= maxVal;
    });
}

// Which pool dice a card marks, from Foundry's evaluated pool results: the die
// actually kept (Foundry's own active flag, so ties can't mislead) and the
// ones the difficulty removed (the highest `cut` dice among the rest)
export function markPool(results, cut = 0) {
    const kept = results.findIndex(r => r.active);
    const removed = results.map((r, i) => ({ v: r.result, i }))
        .filter(o => o.i !== kept)
        .sort((a, b) => b.v - a.v)
        .slice(0, cut)
        .map(o => o.i);
    return { kept, removed };
}
