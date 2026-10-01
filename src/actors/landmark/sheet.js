import sheetHTML from './sheet.html';
import './landmark.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';
import { iconFor } from '../../common/icons';

// Landmark sheet (redesigned 2026-09-29). Layout in sheet.html; shared
// tabs / editor / edit-toggle / die-roll behaviour in common/panel-sheet.js.
// Haunt rows keep their own controls (service rolls, upgrade track,
// upgrade / downgrade); services themselves are edited on the haunt's sheet.
export default class LandmarkSheet extends HeartActorSheet {
    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'main';
        this._editing = false;
    }

    async _onDropItemCreate(itemData) {
        if(this.actor.type === 'landmark') {

            itemData.system.active = true;
        }

        return super._onDropItemCreate(itemData);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return sheetHTML.path;
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
        data.inactiveItems = this.actor.items.filter(i => i.system.active !== undefined && !i.system.active);
        return data;
    }

    async _haunt(ev) {
        const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
        return fromUuid(uuid);
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);

        // Haunt upgrade track (lives on the haunt item, not the actor). Click a
        // marked box again to clear it (was item.data - undefined on v12).
        html.find('.item.preview.haunt .ordered-checkable-box').click(async ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const target = element.parentElement.dataset.target;
            const item = await this._haunt(ev);
            if (!item) return;
            const current = Number(foundry.utils.getProperty(item, target)) || 0;
            const marked = element.classList.contains('checked');
            item.update({ [target]: marked && index + 1 === current ? index : index + 1 });
        });

        const step = async (ev, delta) => {
            const item = await this._haunt(ev);
            if (!item) return;
            const dieSizes = game.heart.die_sizes;
            const updates = {};
            if (delta > 0) updates['system.upgradeTrack'] = 0;
            for (const [key, service] of Object.entries(item.system.resistances ?? {})) {
                const i = dieSizes.indexOf(service.die_size) + delta;
                if (i >= 0 && i < dieSizes.length) updates[`system.resistances.${key}.die_size`] = dieSizes[i];
            }
            item.update(updates);
        };
        html.find('.item.preview.haunt [data-action=upgrade]').click(ev => step(ev, 1));
        html.find('.item.preview.haunt [data-action=downgrade]').click(ev => step(ev, -1));

        html.find('.item.preview.haunt [data-action=service-roll]').click(async ev => {
            ev.preventDefault();
            const haunt = await this._haunt(ev);
            if (!haunt) return;
            const id = $(ev.currentTarget).closest('[data-id]').data('id');
            const service = haunt.system.resistances[id];
            // the haunt rides on the roll as its item (2026-09-30 review): the
            // card's outcome is its icon and name, the hint its service
            const roll = game.heart.rolls.ItemRoll.build({ item: {
                name: haunt.name, img: haunt.img, type: 'haunt',
                system: { die_size: service.die_size, service: service.resistance },
            } });
            await roll.evaluateSync();
            roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        });
    }
}
