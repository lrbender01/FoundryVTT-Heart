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

// The same Fallout from two places (a pack and a world copy) shows once;
// the target's own entries win, then the packs
export function dedupe(list) {
    const rank = { own: 0, builtin: 1, book: 2, world: 3 };
    const seen = new Map();
    for (const c of [...list].sort((a, b) => rank[a.origin] - rank[b.origin])) {
        const key = `${c.name.toLowerCase()}|${c.severity}|${c.resistance}`;
        if (!seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
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
