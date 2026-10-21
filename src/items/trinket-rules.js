// How many keepsakes and trinkets a character draws, and which are drawn
// (Luke, 2026-10-21: one roll and no pick was allowed). The books: an
// ancestry says "roll or pick twice on the <Ancestry> Keepsakes table" (HCB
// pp. 21-24, the content module's ancestries); a W&M calling's table says
// "Roll 1D10 or pick one" (W9). Pure, no Foundry: tested in
// test/trinkets.test.mjs; items/trinkets.js draws.
//
// The draws are recorded on the ancestry / calling item as
// flags.heart.trinkets = [{ name, uuid }]; rolls made before 2026-10-21
// recorded one as flags.heart.trinket = { name, uuid }, read as a list of one.

export const TRINKET_DRAWS = { keepsake: 2, trinket: 1 };

// The recorded draws, from an item's heart flags
export function drawnTrinkets(heartFlags) {
    const h = heartFlags ?? {};
    const valid = (d) => Boolean(d && (d.uuid || d.name));
    if (Array.isArray(h.trinkets)) return h.trinkets.filter(valid);
    return valid(h.trinket) ? [h.trinket] : [];
}

// kind: 'keepsake' | 'trinket'. Answers { drawn, total, left, done }.
export function trinketState(kind, heartFlags) {
    const drawn = drawnTrinkets(heartFlags);
    const total = TRINKET_DRAWS[kind] ?? 0;
    const left = Math.max(0, total - drawn.length);
    return { drawn, total, left, done: left === 0 };
}

// The pick list: a table's results as { id, text }, in table order, with
// the ones already drawn (by name) marked taken
export function pickChoices(results, drawn = []) {
    const taken = new Set(drawn.map(d => String(d.name ?? '').trim().toLowerCase()).filter(Boolean));
    return (results ?? [])
        .filter(r => r && String(r.text ?? '').trim())
        .map(r => ({ id: r.id ?? r._id, text: String(r.text).trim(), taken: taken.has(String(r.text).trim().toLowerCase()) }));
}
