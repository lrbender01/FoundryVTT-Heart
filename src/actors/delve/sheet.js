import sheetHTML from './sheet.html';
import './delve.sass';
import HeartActorSheet, { LIMITED_SHEET } from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';
import { richFieldsOf } from '../../common/rich-text';
import { activeData } from '../drop-active';
import { bySort } from '../proxy-lists';

// Delve sheet (redesigned 2026-09-29). Layout in sheet.html; shared tabs /
// tracks / editor / edit-toggle behaviour in common/panel-sheet.js.
// The data model stores domains and tier as arrays, but the old sheet wrote
// plain text into them, so both shapes are accepted here.
export default class DelveSheet extends HeartActorSheet {
    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'main';
        this._editing = false;
    }

    // dropped items that can be switched on land on (a folder arrives as
    // a list: actors/drop-active.js)
    async _onDropItemCreate(itemData) {
        return super._onDropItemCreate(this.actor.type === 'delve' ? activeData(itemData, { onlyIfPresent: true }) : itemData);
    }

    // rich text the sheet draws (common/rich-text.js); a Limited viewer's
    // sheet draws the description alone, and GM Notes go to the GM only
    // (common/gm-notes.js, 2026-10-21)
    _richFields() {
        if (this.limitedView) return richFieldsOf(this.actor, ['system.description']);
        return richFieldsOf(this.actor, ['system.connection', 'system.description', 'system.notes']);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return this.limitedView ? LIMITED_SHEET : sheetHTML.path;
    }

    get img() {
        return 'systems/heart/assets/dungeon-light.svg';
    }

    getData() {
        const data = super.getData();
        const system = this.actor.system;
        data.user = game.user;
        data.editable = this.isEditable;
        data.owner = this.actor.isOwner;
        data.editing = this._editing;
        data.resistanceValue = Number(system.resistance) || 0;
        data.domainChips = toChips(system.domains);
        data.domainsText = data.domainChips.join(', ');
        data.tierText = toChips(system.tier).join(', ');
        data.inactiveItems = bySort(this.actor.items.filter(i => i.system.active !== undefined && !i.system.active));
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
    }
}
