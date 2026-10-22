// Version labels compared by number (2026-10-03): the startup window's
// changelog lists versions newest first, and as text "v0.10.5" sorted below
// "v0.8.7". "v0.10.5-pr94" reads as 0.10.5 (the fork suffix is ignored).
export function versionParts(label) {
    return String(label ?? '').replace(/^v/i, '').split('-')[0].split('.').map(n => Number.parseInt(n, 10) || 0);
}

// < 0 when a is older than b, > 0 when newer, 0 when the same
export function compareVersions(a, b) {
    const pa = versionParts(a), pb = versionParts(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d;
    }
    return 0;
}

// The startup changelog (Luke, 2026-10-21): the heart.versions entries,
// newest first. English only, so read from English: Foundry's fallback
// (game.i18n._fallback) when another language is active, else the active
// translations. Reading the active language alone threw for es and it
// (no versions there) and showed pt's older list. Never throws.
export function startupVersions(translations, fallback) {
    const of = (t) => t?.heart?.versions;
    const found = [of(fallback), of(translations)].find(v => v && typeof v === 'object' && Object.keys(v).length);
    return Object.values(found ?? {})
        .filter(v => v && typeof v === 'object')
        .sort((a, b) => compareVersions(b.version, a.version));
}
