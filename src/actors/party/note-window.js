// One note on the party's board, in its own small window (2026-10-02, Luke:
// "in a small window"; board.js has the data). A title field and Heart's
// editor, open at once: the editor's Save (or Ctrl+S, or Enter in the title)
// writes the note and closes the window; Cancel closes it unsaved. Anyone in
// the party may write any note. A new note is only pinned once it is saved
// with a title or some text.
import noteHTML from './note.html';
import { heartProseMirrorPlugins } from '../../common/editor';
import { boardNotes, nextSort, noteUpdate, isBlankText } from './board';

const loc = (key) => game.i18n.localize(key);

export class PartyNoteWindow extends FormApplication {
    // party: the party actor; noteId: the note to open, or null for a new one
    constructor(party, noteId = null, options = {}) {
        const note = boardNotes(party.system.board).find(n => n.id === noteId);
        super({ title: note?.title ?? '', text: note?.text ?? '' }, options);
        this.party = party;
        this.noteId = note ? noteId : null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['heart', 'heart-window', 'heart-note-window'],
            template: noteHTML.path,
            width: 560,
            height: 520,
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: false,
            submitOnChange: false,
        });
    }

    // one window per note (a second click brings it forward)
    get id() {
        return `heart-party-note-${this.party.id}-${this.noteId ?? 'new'}`;
    }

    get title() {
        return this.object.title || loc(this.noteId ? 'heart.party-sheet.note-untitled' : 'heart.party-sheet.note-new');
    }

    getData() {
        return { title: this.object.title, text: this.object.text };
    }

    // Heart's editor bar (Cancel / Save); Cancel closes the window
    _configureProseMirrorPlugins(name, options) {
        return heartProseMirrorPlugins(this, name, { ...options, onCancel: () => this.close() });
    }

    async _updateObject(event, formData) {
        const title = String(formData.title ?? '');
        const text = String(formData.text ?? this.object.text ?? '');
        const board = this.party.system.board;
        const exists = this.noteId && boardNotes(board).some(n => n.id === this.noteId);
        if (!exists && !title.trim() && isBlankText(text)) return;
        // a note someone else took off the board meanwhile comes back last
        const id = this.noteId ?? foundry.utils.randomID();
        await this.party.update(noteUpdate(id, { title, text }, exists ? null : nextSort(board)));
        this.noteId = id;
    }
}

// Open a note (or a new one) for this party
export function openPartyNote(party, noteId = null) {
    if (!party?.isOwner) return null;
    return new PartyNoteWindow(party, noteId).render(true);
}
