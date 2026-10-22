// GM Notes are the GM's alone (Luke, 2026-10-21: "GM notes on adversaries,
// landmarks, etc. should ONLY be accessible to the GM"). Until then every
// viewer of an adversary, landmark, or delve saw them: the panels were
// drawn for anyone who could open the sheet, Limited viewers got the full
// sheet, and secret blocks in the notes went to the sheet's owners.
//
// The one rule, used by every Heart sheet (common/sheet.js) and tested in
// test/gm-notes.test.mjs:
//   - GM_NOTE_FIELDS names the GM-facing rich-text fields by document and
//     type. Only the GM is given them: for anyone else they are never
//     enriched, so the sheet's data holds no text for them, and the
//     templates draw their panels only when data.showGmNotes is set.
//   - A Limited viewer of those types gets the cut-down sheet
//     (actors/base/limited.html): name, picture, and the public
//     description, as Foundry's own limited sheet would.
// A player who owns one (a GM may hand a delve over) still never sees its
// GM Notes. Player-facing notes (a character's, a companion's, a bond's,
// the party board) are not GM Notes and are untouched.
//
// Foundry v12 sends every actor's data to every client, so this closes
// every place Heart shows the notes; it cannot hide them from a player who
// reads the actor's data in the browser console.

export const GM_NOTE_FIELDS = Object.freeze({
    Actor: Object.freeze({
        adversary: Object.freeze(['system.notes']),
        landmark: Object.freeze(['system.notes']),
        delve: Object.freeze(['system.notes']),
    }),
});

// The GM-facing fields of a document ([] for everything else)
export function gmNoteFields(doc) {
    return GM_NOTE_FIELDS[doc?.documentName]?.[doc?.type] ?? [];
}

export function mayReadGmNotes(user) {
    return Boolean(user?.isGM);
}

// A sheet's rich fields ([{ key, html, doc }], common/rich-text.js) as this
// user may have them: a GM-facing field is dropped for anyone but the GM,
// and for the GM keeps its secret blocks
export function gmSafeFields(fields = [], user) {
    const gm = mayReadGmNotes(user);
    const out = [];
    for (const field of fields) {
        if (!gmNoteFields(field?.doc).includes(field?.key)) {
            out.push(field);
            continue;
        }
        if (gm) out.push({ ...field, secrets: true });
    }
    return out;
}

// Whether this user sees the cut-down sheet: a type with GM Notes, a user
// who is not the GM, and less than Observer on the document
export function showsLimitedSheet(doc, user) {
    if (!gmNoteFields(doc).length || mayReadGmNotes(user)) return false;
    return !doc.testUserPermission?.(user, 'OBSERVER');
}
