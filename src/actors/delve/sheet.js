import sheetHTML from './sheet.html';
import './delve.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';

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

    async _onDropItemCreate(itemData) {
        if (this.actor.type === 'delve' && itemData.system && itemData.system.active !== undefined) {
            itemData.system.active = true;
        }
        return super._onDropItemCreate(itemData);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return sheetHTML.path;
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
        data.inactiveItems = this.actor.items.filter(i => i.system.active !== undefined && !i.system.active);
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
    }
}
