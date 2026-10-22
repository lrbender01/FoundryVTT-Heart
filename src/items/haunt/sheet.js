import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { rollHauntService } from './service';
import { hauntStep } from './rules';
import { bindTrack } from '../../common/tracks';

import './sheet.sass';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'systems/heart/assets/icons/items/haunt.svg',
    template: sheetHTML.path,
});

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    get template() {
        return data.template;
    }

    get img() {
        return data.img;
    }

    activateListeners(html) {
        super.activateListeners(html);
        // only those who may edit the haunt change it (Luke, 2026-10-21: a
        // viewer's click reached update() and Foundry's permission error)
        const editable = this.isEditable;

        // the upgrade track (common/tracks.js)
        bindTrack(html, '.ordered-checkable-box', {
            editable,
            read: (box) => Number(foundry.utils.getProperty(this.item, box.parentElement.dataset.target)) || 0,
            write: (box, value) => this.item.update({ [box.parentElement.dataset.target]: value }),
        });

        html.find('[data-action=service-roll]').click(async ev => {
            const target = $(ev.currentTarget);
            const id = target.closest ('[data-id]').data('id');
            // a resource pays, rolling its die capped at the haunt's (HCB
            // pp. 81 and 140; Luke, 2026-10-21: it rolled the haunt's die)
            await rollHauntService({
                haunt: this.item, service: this.item.system.resistances[id], speaker: ChatMessage.getSpeaker({ actor: this.item.actor }),
            });
        });

        // Upgrade / Downgrade every service (items/haunt/rules.js, shared
        // with the landmark's haunt rows); an Upgrade that steps a service
        // clears the track, one with every die at the top says so
        const step = (delta) => {
            if (!editable) return;
            const updates = hauntStep(this.item.system.resistances, delta, game.heart.die_sizes);
            if (updates) this.item.update(updates);
            else if (delta > 0) ui.notifications.info(game.i18n.format('heart.haunt.upgrade-at-top', { haunt: this.item.name }));
        };
        html.find('[data-action=upgrade]').click(() => step(1));
        html.find('[data-action=downgrade]').click(() => step(-1));

        html.find('[data-action=add-service]').click(() => {
            if (!editable) return;
            const id = foundry.utils.randomID();
            this.item.update({[`system.resistances.${id}`]: {
                die_size: 'd4',
                resistance: 'blood'
            }});
        });

        html.find('[data-action=delete-service]').click(ev => {
            if (!editable) return;
            const target = $(ev.currentTarget);
            const id = target.closest ('[data-id]').data('id');
            this.item.update({[`system.resistances.-=${id}`]: null});
        });
    }

    // (a haunt holds no child items: its services are rows in its own data;
    // common/drops.js)
}

export {
    data
}