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
