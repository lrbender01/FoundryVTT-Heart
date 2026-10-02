import sheetHTML from './sheet.html';
import './adversary.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';
import { BannerSheet } from '../../common/banner';

// Difficulty levels for the header chip. The book's full difficulty text
// (often a condition, e.g. Ghost) stays in system.difficulty and shows as a
// note under the tabs whenever it says more than the bare level.
const LEVELS = ['Standard', 'Risky', 'Dangerous', 'Legendary'];

// Adversary sheet (redesigned 2026-09-29). Layout in sheet.html; shared
// tabs / tracks / editor / edit-toggle behaviour in common/panel-sheet.js.
// The art banner, its Art and Show players buttons (2026-10-02):
// common/banner.js.
export default class AdversarySheet extends BannerSheet(HeartActorSheet) {
    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'stat';
        this._editing = false;
    }

    async _onDropItemCreate(itemData) {
        if(this.actor.type === 'adversary') {

            itemData.system.active = true;
        }

        return super._onDropItemCreate(itemData);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return sheetHTML.path;
    }

    get img() {
        return 'systems/heart/assets/high-punch.svg';
    }

    getData() {
        const data = super.getData();
        const system = this.actor.system;
        data.user = game.user;
        data.editable = this.isEditable;
        data.owner = this.actor.isOwner;
        data.editing = this._editing;
        data.levels = Object.fromEntries(LEVELS.map(l => [l, l]));
        data.resistanceValue = Number(system.resistance) || 0;

        const difficulty = String(system.difficulty ?? '').trim();
        const level = String(system.level ?? '').trim();
        data.difficultyNote = difficulty && difficulty.toLowerCase() !== level.toLowerCase() ? difficulty : '';

        data.domainChips = toChips(system.domains);
        data.inactiveItems = this.actor.items.filter(i => i.system.active !== undefined && !i.system.active);
        return data;
    }

    // (The legacy lore move ran here on every open until 2026-10-02 and could
    // move secret GM Notes into the Description; it is a one-time GM
    // migration now: actors/adversary/migrate.js.)

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
    }
}
