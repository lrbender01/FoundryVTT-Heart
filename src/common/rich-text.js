// Rich text on a sheet is enriched before it is drawn (Luke, 2026-10-21):
// since v10 Foundry's {{editor}} shows its content as given, so @UUID links
// in notes and answers showed as raw text, inline rolls never rendered, and
// a <section class="secret"> was shown to everyone who could open the sheet.
//
// A sheet lists what it draws as rich text (HeartSheetMixin._richFields):
// [{ key, html, doc }]. Each comes back enriched under its key in
// data.enriched, with secrets only for the document's owners and links
// relative to the document. Templates read it with
// (lookup @root.enriched "<key>"); the editor itself still opens on the
// stored text (Foundry reads the document, not this). Only the shown text
// changes. A field may say whose its secrets are (`secrets`): GM Notes keep
// them for the GM only (common/gm-notes.js, which also drops those fields
// for everyone else before they get here).
export async function enrichFields(fields = []) {
    const out = {};
    for (const { key, html, doc, secrets } of fields) {
        if (!key) continue;
        out[key] = await TextEditor.enrichHTML(String(html ?? ''), {
            async: true,
            secrets: secrets ?? Boolean(doc?.isOwner),
            relativeTo: doc,
        });
    }
    return out;
}

// The stored rich-text fields of a document, by path: [{ key, html, doc }]
export function richFieldsOf(doc, paths) {
    return paths.map(path => ({ key: path, html: foundry.utils.getProperty(doc, path) ?? '', doc }));
}
