// Source order for the Choose window (2026-09-30): the book an option comes
// from (core, then Ways and Means, then anything else) and its page, as
// fvtt-heart-content records them (flags.fvtt-heart-content.book / .page);
// then the pack's own sort, then the name for anything without book data.
// Pure, tested (test/character-options.test.mjs; moved here 2026-10-21).
export const CONTENT = 'fvtt-heart-content';
const BOOK_RANK = { core: 0, wm: 1 };

export function sourceOrder(entry) {
    const f = entry?.flags?.[CONTENT] ?? {};
    const book = BOOK_RANK[f.book] ?? 9;
    // pages are "35" (core) or "W12" (Ways and Means): the digits sort within
    // a book (\D, not D, since 2026-10-21: every Ways and Means page read as
    // no page, so those options sorted by pack order)
    const page = Number.parseInt(String(f.page ?? "").replace(/\D+/g, ""), 10);
    return [book, Number.isFinite(page) ? page : 99999, Number(entry?.sort) || 0];
}

export function bySourceOrder(a, b) {
    const x = a.order ?? [9, 99999, 0], y = b.order ?? [9, 99999, 0];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return String(a.name ?? a.label ?? "").localeCompare(String(b.name ?? b.label ?? ""));
}
