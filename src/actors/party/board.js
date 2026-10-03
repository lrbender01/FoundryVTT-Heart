// The party's note board (2026-10-02, Luke): any number of notes, each a
// title and rich text, pinned three across in the party sheet's Notes
// section, written and edited in a small window (note-window.js), by anyone
// in the party.
//
// Stored as system.board, an object keyed by note id ({ title, text, sort }),
// not a list: two players adding or editing notes at once write different
// keys, which Foundry merges, instead of each overwriting the whole list.
// The party's old single Notes text becomes the board's first note, once
// (legacyNotesUpdate, run by the GM on ready).
//
// Pure, so it is tested (test/party-board.test.mjs).

// the notes in board order (oldest first; sort, then id to keep it stable)
export function boardNotes(board) {
    return Object.entries(board ?? {})
        .filter(([, note]) => note && typeof note === 'object')
        .map(([id, note]) => ({
            id,
            title: String(note.title ?? ''),
            text: String(note.text ?? ''),
            sort: Number.isFinite(Number(note.sort)) ? Number(note.sort) : 0,
        }))
        .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

// where a new note goes: after the last one
export function nextSort(board) {
    const notes = boardNotes(board);
    return notes.length ? notes[notes.length - 1].sort + 1 : 0;
}

// The update that writes one note (a new one gets `sort`; an edit keeps its
// place, so only the title and text are written)
export function noteUpdate(id, { title = '', text = '' } = {}, sort = null) {
    const note = { title: String(title).trim(), text: String(text) };
    if (sort !== null) note.sort = sort;
    return { [`system.board.${id}`]: note };
}

// The update that takes one note off the board
export function noteRemoval(id) {
    return { [`system.board.-=${id}`]: null };
}

// Text that shows nothing (empty, or only empty paragraphs)
export function isBlankText(html) {
    return !String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// The party's old single Notes text as the board's first note, once: null
// when there is nothing to move (no text, or the board already has notes)
export function legacyNotesUpdate(system, id, title) {
    if (isBlankText(system?.notes) || boardNotes(system?.board).length) return null;
    return { ...noteUpdate(id, { title, text: system.notes }, 0), 'system.notes': '' };
}

// Every note off the board (the GM's party reset)
export function boardClear(board) {
    return Object.assign({}, ...Object.keys(board ?? {}).map(noteRemoval));
}
