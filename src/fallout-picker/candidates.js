// The Fallout picker's pure half (2026-10-01, Luke: one picker for every
// place Fallout goes: a character, the party, a companion, a bond). Fallout
// is the GM's pick within its severity (HCB p. 78; table ruling 12: the GM
// picks, players lobby). Candidates come from the Fallout packs, world
// items, a companion's own book menu, and a person bond's two book lines;
// these functions filter them and shape what gets added. No Foundry here.

export const SEVERITIES = ['minor', 'major', 'critical'];

const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// One candidate: { key, name, img, severity, resistance, description,
// source, origin: 'own' | 'book' | 'world' | 'builtin', uuid?, id? }
export function candidate(entry, origin) {
    const sys = entry?.system ?? {};
    return {
        key: `${origin}:${entry.uuid ?? entry.id ?? entry.name}`,
        name: entry.name ?? '',
        img: entry.img ?? '',
        severity: sys.type ?? 'minor',
        resistance: sys.resistance ?? '',
        description: sys.description ?? '',
        text: plain(sys.description),
        source: sys.source ?? '',
        origin,
        uuid: entry.uuid ?? null,
        id: entry.id ?? entry._id ?? null,
    };
}

// A class's or calling's own Fallout (Luke, 2026-10-21: never mixed in
// with the rest) is offered only to a character who has that class or
// calling: the content module marks them flags['fvtt-heart-content'].restrictedTo
// = { type: 'class' | 'calling', name }. owned is the target's items
// as { type, name } (none for the party or a companion).
export function restrictionAllows(restrictedTo, owned = []) {
    if (!restrictedTo?.type || !restrictedTo?.name) return true;
    const want = String(restrictedTo.name).toLowerCase();
    return owned.some((i) => i?.type === restrictedTo.type && String(i.name ?? '').toLowerCase() === want);
}

// The characters whose class and calling decide which restricted Fallouts a
// target is offered: a character itself, a person bond's holder, and a
// companion's employers (Luke, 2026-10-21, C13: a Demagogue's follower may
// be a companion, so their Bond Fallouts, "Shaken Faith", "Ignoble
// Sacrifice", and "Ideological Death", are offered for it too); none for
// the party
export function restrictionHolders(target) {
    if (target?.documentName === 'Item' && target.type === 'bond') return target.parent ? [target.parent] : [];
    if (target?.documentName !== 'Actor') return [];
    if (target.type === 'character') return [target];
    if (target.type === 'hireling') return [...(target.proxy?.employers ?? [])];
    return [];
}

// What those holders have, as { type, name }, for restrictionAllows
export function holderItems(target) {
    return restrictionHolders(target).flatMap((h) => [...(h?.items ?? [])].map((i) => ({ type: i.type, name: i.name })));
}

// Are two candidates one Fallout seen from two places? Same name, severity,
// and resistance; two pack entries are one only when they are the same
// entry (Luke, 2026-10-21, C12: the core "Blinded" and Ways and Means'
// Illicit Magic "Blinded" are both Major Blood, and one of them never
// showed); an own or world copy is the pack entry it was copied from,
// unless both name a source and the sources differ.
function sameFallout(a, b) {
    if (a.name.toLowerCase() !== b.name.toLowerCase() || a.severity !== b.severity || a.resistance !== b.resistance) return false;
    if (a.origin === 'book' && b.origin === 'book') return (a.uuid ?? a.key) === (b.uuid ?? b.key);
    return !(a.source && b.source && a.source !== b.source);
}

// The same Fallout from two places (a pack and a world copy) shows once;
// the target's own entries win, then the packs
export function dedupe(list) {
    const rank = { own: 0, builtin: 1, book: 2, world: 3 };
    const kept = new Map();
    const out = [];
    for (const c of [...list].sort((a, b) => rank[a.origin] - rank[b.origin])) {
        const key = `${c.name.toLowerCase()}|${c.severity}|${c.resistance}`;
        const same = kept.get(key) ?? [];
        if (same.some(k => sameFallout(k, c))) continue;
        same.push(c);
        kept.set(key, same);
        out.push(c);
    }
    return out;
}

// Does a candidate show under the picker's filters? resistance '' is all;
// search matches the name or text, any case
export function matches(c, { severity = '', resistance = '', search = '' } = {}) {
    if (severity && c.severity !== severity) return false;
    if (resistance && c.resistance !== resistance) return false;
    const q = String(search ?? '').trim().toLowerCase();
    if (q && !`${c.name} ${c.text}`.toLowerCase().includes(q)) return false;
    return true;
}

// The order the list shows: the target's own first, then by name
export function sortCandidates(list) {
    const rank = { own: 0, builtin: 1, book: 2, world: 2 };
    return [...list].sort((a, b) => (rank[a.origin] - rank[b.origin]) || a.name.localeCompare(b.name));
}

// The Fallout item data a pick adds: taken (active), not resolved. Stress is
// never cleared here; the GM clears it by hand (Luke, 2026-10-01).
export function falloutData({ name, img = '', severity = 'minor', resistance = '', description = '', source = '' }) {
    return {
        name,
        type: 'fallout',
        img: img || 'systems/heart/assets/fallout-shelter.svg',
        system: { description, source, type: severity, resistance, active: true, complete: false },
    };
}
