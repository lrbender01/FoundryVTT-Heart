import sheetHTML from './sheet.html';
import './landmark.sass';
import HeartActorSheet, { LIMITED_SHEET } from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';
import { BannerSheet } from '../../common/banner';
import { rollHauntService } from '../../items/haunt/service';
import { hauntStep } from '../../items/haunt/rules';
import { bindTrack } from '../../common/tracks';
import { richFieldsOf } from '../../common/rich-text';
import { activeData } from '../drop-active';
import { bySort } from '../proxy-lists';

// Landmark sheet (redesigned 2026-09-29). Layout in sheet.html; shared
// tabs / editor / edit-toggle / die-roll behaviour in common/panel-sheet.js.
// Haunt rows keep their own controls (service rolls, upgrade track,
// upgrade / downgrade); services themselves are edited on the haunt's sheet.
// The art banner, its Art and Show players buttons: common/banner.js.
export default class LandmarkSheet extends BannerSheet(HeartActorSheet) {
    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'main';
        this._editing = false;
    }

    // dropped items land switched on (a folder arrives as a list:
    // actors/drop-active.js)
    async _onDropItemCreate(itemData) {
        return super._onDropItemCreate(this.actor.type === 'landmark' ? activeData(itemData) : itemData);
    }

    // rich text the sheet draws (common/rich-text.js); a Limited viewer's
    // sheet draws the description alone, and GM Notes go to the GM only
    // (common/gm-notes.js, 2026-10-21)
    _richFields() {
        if (this.limitedView) return richFieldsOf(this.actor, ['system.description']);
        return richFieldsOf(this.actor, ['system.specialRules', 'system.potentialPlots', 'system.description', 'system.notes']);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return this.limitedView ? LIMITED_SHEET : sheetHTML.path;
    }

    get img() {
        return 'systems/heart/assets/monument.svg';
    }

    getData() {
        const data = super.getData();
        data.user = game.user;
        data.editable = this.isEditable;
        data.owner = this.actor.isOwner;
        data.editing = this._editing;
        data.die_sizes = game.heart.die_sizes.reduce((map, die) => {
            map[die] = game.i18n.format('heart.die_size.d(N)', { N: die.replace(/^d/, '') })
            return map;
        }, {});
        data.domainChips = toChips(this.actor.system.domains);
        data.inactiveItems = bySort(this.actor.items.filter(i => i.system.active !== undefined && !i.system.active));
        return data;
    }

    async _haunt(ev) {
        const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
        return fromUuid(uuid);
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);

        // Haunt upgrade track (lives on the haunt item, not the actor;
        // common/tracks.js), for those who may edit the landmark
        const hauntOf = (box) => fromUuid($(box).closest('[data-item-id]').data('itemId'));
        bindTrack(html, '.item.preview.haunt .ordered-checkable-box', {
            editable: this.isEditable,
            read: async (box) => {
                const item = await hauntOf(box);
                return item ? Number(foundry.utils.getProperty(item, box.parentElement.dataset.target)) || 0 : null;
            },
            write: async (box, value) => (await hauntOf(box))?.update({ [box.parentElement.dataset.target]: value }),
        });

        // Upgrade / Downgrade every service (items/haunt/rules.js)
        const step = async (ev, delta) => {
            if (!this.isEditable) return;
            const item = await this._haunt(ev);
            if (!item) return;
            const updates = hauntStep(item.system.resistances, delta, game.heart.die_sizes);
            if (updates) item.update(updates);
            else if (delta > 0) ui.notifications.info(game.i18n.format('heart.haunt.upgrade-at-top', { haunt: item.name }));
        };
        html.find('.item.preview.haunt [data-action=upgrade]').click(ev => step(ev, 1));
        html.find('.item.preview.haunt [data-action=downgrade]').click(ev => step(ev, -1));

        html.find('.item.preview.haunt [data-action=service-roll]').click(async ev => {
            ev.preventDefault();
            const haunt = await this._haunt(ev);
            if (!haunt) return;
            const id = $(ev.currentTarget).closest('[data-id]').data('id');
            // a resource pays, rolling its die capped at the haunt's (HCB
            // pp. 81 and 140; Luke, 2026-10-21: it rolled the haunt's die)
            await rollHauntService({
                haunt, service: haunt.system.resistances[id], speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            });
        });
    }
}
