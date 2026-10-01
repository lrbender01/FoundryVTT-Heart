// A character's fallout check (HCB p.78): the pure thresholds, with no
// Foundry globals and no webpack-only imports, so the rules can be tested on
// their own (2026-09-30, Luke). roll.js imports them back unchanged. The
// party's Provisions check has its own thresholds (actors/party/rules.js).
//
// Roll a d12 against the character's total stress: above it, no fallout; at
// or under it, Minor on 1-6 and Major on 7-12.

export const fallout_results = {
    'no-fallout': (total, totalStress) => total > totalStress,
    'minor-fallout': (total, totalStress) => total <= totalStress && total <= 6,
    'major-fallout': (total, totalStress) => total <= totalStress && total > 6
};

// total: the d12; totalStress: the stress across the five personal tracks
export function characterFalloutResult(total, totalStress) {
    return Object.keys(fallout_results).find(result => fallout_results[result](total, totalStress));
}
