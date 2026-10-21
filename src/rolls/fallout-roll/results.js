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

// What a fallout card's Clear button clears (Luke, 2026-10-21: it cleared
// the track that triggered the check, not the picked Fallout's). Taking a
// Minor fallout clears the stress in the resistance associated with that
// fallout; a Major or Critical clears every resistance (HCB pp. 79-81). The
// GM may pick a Fallout of another resistance than the one that triggered
// the check (HCB p. 78: "usually" the one with most stress), and two Minors
// may be combined into a Major (HCB p. 78, table ruling 2), so the picked
// Fallout decides once there is one.
//   result: the check's result; pick: the Fallout the GM picked from the
//   card ({ severity, resistance }) or nothing yet; triggering: the
//   resistance that triggered the check; resistances: the actor's tracks.
// Answers 'all', one resistance, or '' (unknown: ask).
export function clearScope({ result, pick, triggering, resistances = [] } = {}) {
    if (result === 'major-fallout' || result === 'critical-fallout') return 'all';
    if (result !== 'minor-fallout') return '';
    if (pick && (pick.severity === 'major' || pick.severity === 'critical')) return 'all';
    if (pick?.resistance && resistances.includes(pick.resistance)) return pick.resistance;
    if (triggering && resistances.includes(triggering)) return triggering;
    return '';
}
