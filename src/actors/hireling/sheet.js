import sheetHTML from './sheet.html';
import './hireling.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults } from '../../common/panel-sheet';
import { RESISTANCES } from '../../bonds/rules';
import { abilityItemFrom } from '../../bonds/bonds';
import { BannerSheet } from '../../common/banner';

// Companion sheet (2026-10-01; pared down the same day, Luke's calls): one
// actor for hirelings and animals, which the book gives the same rules (W&M
// W66; only the wording of Cost differs), so there is no kind. Panel-sheet
// chrome (common/panel-sheet.js: tabs, clickable tracks, editors, the edit
// toggle), with the character sheet's header Stress / Fallout buttons and
// Resistances rows. Abilities are ability items (none by default, "+" adds
// one, each opens its own sheet). Its book Fallouts are a menu, switched
// off; the Fallout picker switches one on (taken). The art banner, its Art
// and Show players buttons (2026-10-02): common/banner.js.
export default class HirelingSheet extends BannerSheet(HeartActorSheet) {
    static get type() { return Object.keys(template.Actor)[0]; }

    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'main';
        this._editing = false;
    }

    get template() {
        return sheetHTML.path;
    }

    // A companion from before 2026-10-01 kept its ability as a field: on the
    // owner's first open it becomes an ability item
    async _render(force, options) {
        const legacy = this.actor.isOwner && abilityItemFrom(this.actor.system?.ability);
        if (legacy && !this.actor.itemTypes.ability?.length) {
            await this.actor.createEmbeddedDocuments('Item', [legacy], { render: false });
            await this.actor.update({ 'system.-=ability': null, 'system.-=kind': null, 'system.-=protectionNote': null }, { render: false });
        }
        return super._render(force, options);
    }

    getData() {
        const data = super.getData();
        const actor = this.actor;
        const system = actor.system;
        const loc = (key, values) => (values ? game.i18n.format(key, values) : game.i18n.localize(key));
        data.user = game.user;
        data.editable = this.isEditable;
        data.owner = actor.isOwner;
        data.editing = this._editing;
        // what the book calls them, when they go by another name ("Cook");
        // the book page on its tooltip
        const role = actor.getFlag('heart', 'role');
        data.role = role && role !== actor.name ? role : '';
        const page = actor.flags?.['fvtt-heart-content']?.page;
        data.companionTip = [loc('heart.bond.ui.companion-tip'), page ? loc('heart.bond.ui.page-tip', { page }) : ''].filter(Boolean).join('\n');
        data.employers = (actor.proxy?.employers ?? []).map(c => ({
            id: c.id, name: c.name, tip: loc('heart.bond.ui.open-target', { name: c.name }),
        }));
        // (the cost is shown only in Profile since 2026-10-02)
        data.tracks = RESISTANCES.map(key => ({
            key,
            value: Number(system.resistances?.[key]?.value) || 0,
            protection: Number(system.resistances?.[key]?.protection) || 0,
            tip: loc(`heart.tip.resistance.${key}`),
        }));
        data.total = data.tracks.reduce((sum, t) => sum + t.value, 0);
        data.abilities = actor.itemTypes.ability ?? [];
        data.equipment = actor.itemTypes.equipment ?? [];
        data.resources = actor.itemTypes.resource ?? [];
        // Fallout taken (switched on, not resolved) first; the book's menu
        // (switched off) under it
        const fallouts = actor.itemTypes.fallout ?? [];
        data.taken = fallouts.filter(f => f.system?.active);
        data.menu = fallouts.filter(f => !f.system?.active);
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
        // "Bond of" chips open that character
        html.find('[data-action=open-employer]').on('click', ev => {
            ev.preventDefault();
            game.actors.get(ev.currentTarget.dataset.actorId)?.sheet.render(true);
        });
        // the Fallout check against its five tracks; the card's Pick Fallout
        // opens the picker for them
        html.find('[data-action=fallout-roll]').on('click', async ev => {
            ev.preventDefault();
            const roll = await game.heart.rolls.FalloutRoll.build({ character: this.actor.id });
            if (!roll) return;
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        });
    }

    // Dropped gear and abilities are in use at once; a dropped Fallout joins
    // the menu switched off
    async _onDropItemCreate(itemData) {
        const list = Array.isArray(itemData) ? itemData : [itemData];
        for (const data of list) {
            if (!data?.system) continue;
            data.system.active = data.type !== 'fallout';
        }
        return super._onDropItemCreate(list);
    }
}
