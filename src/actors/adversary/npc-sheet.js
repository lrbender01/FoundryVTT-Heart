import sheetHTML from './npc-sheet.html';
import '../familiar/familiar.sass';
import './npc-sheet.sass';
import HeartActorSheet, { LIMITED_SHEET } from '../base/sheet';
import { richFieldsOf } from '../../common/rich-text';
import { DEFAULT_IMGS } from '../../common/icons';
import { npcBoxes } from './npc-sheet-rules';

// The Witch is Dead NPC sheet (Luke, 2026-10-27): an adversary actor shown
// in the familiar sheet's own look (ink on paper, familiar/familiar.sass), so
// the players' sheets and the story's people read as one set. Portrait, name,
// descriptors, wants (the actor's motivation), voice, what they know, a look,
// and the GM's notes, which only the GM is given (common/gm-notes.js).
//
// A second sheet for the adversary type: it is not named sheet.js, so the
// glob in actors/index.js does not make it the default; index.js registers it
// by hand with makeDefault false. The Board Tools' NPC sheets set it on the
// actors they make (flags.core.sheetClass). A crowd's adversary keeps the
// plain one.
export default class NpcSheet extends HeartActorSheet {
    static get type() { return 'adversary'; }

    static get defaultOptions() {
        const options = super.defaultOptions;
        const classes = [...(options.classes ?? []).filter(c => c !== 'heart-window'), 'heart-familiar-sheet', 'heart-npc-sheet'];
        return foundry.utils.mergeObject(options, { classes, width: 560, height: 720, resizable: true });
    }

    get template() {
        return this.limitedView ? LIMITED_SHEET : sheetHTML.path;
    }

    // (no Glass button: the paper sheet never turns to glass)
    _getHeaderButtons() {
        return super._getHeaderButtons().filter(b => b.class !== 'heart-glass-toggle');
    }

    // rich text the sheet draws (common/rich-text.js); a Limited viewer's
    // sheet draws the description alone, and GM notes go to the GM only
    _richFields() {
        if (this.limitedView) return richFieldsOf(this.actor, ['system.description']);
        return richFieldsOf(this.actor, ['system.description', 'system.knows', 'system.notes']);
    }

    getData() {
        const data = super.getData();
        data.editable = this.isEditable;
        data.owner = this.actor.isOwner;
        data.user = game.user;
        data.blankPortrait = !this.actor.img || DEFAULT_IMGS.has(this.actor.img) || this.actor.img === CONST.DEFAULT_TOKEN;
        data.shown = npcBoxes(this.actor.system, data.editable);
        return data;
    }
}
