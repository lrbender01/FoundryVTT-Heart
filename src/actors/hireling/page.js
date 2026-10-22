// The book page a companion's tooltip names (Luke, 2026-10-21): the PRINTED
// page, as every citation a reader sees. fvtt-heart-content records the PDF
// page (flags.fvtt-heart-content.page, its authoring.md "Page refs"), so the
// Cook showed W72 for the printed W68. Its own `printedPage` wins when the
// module writes one; otherwise the module's rule (tools/expand-content.mjs
// printedPage): core is PDF - 5; Ways and Means is PDF - 4 (PDF W72 prints
// W68), and from PDF 103 the Arcane Artefacts restart as M (PDF - 102).
// Anything else shows as recorded.
export function companionPage(flags) {
    if (flags?.printedPage) return String(flags.printedPage);
    const raw = String(flags?.page ?? '').trim();
    if (!raw) return '';
    const wm = /^W(\d+)$/.exec(raw);
    if (wm) {
        const n = Number(wm[1]);
        if (n < 5) return raw;
        return n >= 103 ? `M${n - 102}` : `W${n - 4}`;
    }
    if (/^\d+$/.test(raw) && flags?.book === 'core' && Number(raw) >= 6) return String(Number(raw) - 5);
    return raw;
}
