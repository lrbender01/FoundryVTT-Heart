import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { rollHauntService } from './service';

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

    getData() {
        const data = super.getData();        
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.ordered-checkable-box:not(.checked)').click(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const parent = element.parentElement;
            const target = parent.dataset.target;

            const data = {};
            data[target] = index + 1;
            this.item.update(data);
        });

        html.find('.ordered-checkable-box.checked').click(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const parent = element.parentElement;
            const target = parent.dataset.target;

            const data = {};
            // (was this.item.data - undefined on v12, so a second click never cleared)
            if (index + 1 === Number(foundry.utils.getProperty(this.item, target))) {
                data[target] = index;
            } else {
                data[target] = index + 1;
            }
            this.item.update(data);
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

        html.find('[data-action=upgrade]').click(async ev => {
            const dieSizes = game.heart.die_sizes;
            const services = this.item.system.resistances;
            
            const updates = {};
            updates['system.upgradeTrack'] = 0;
            Object.keys(services).forEach(key => {
                var service = services[key];
                var indexOf = dieSizes.indexOf(service.die_size);
                
                if(indexOf < (dieSizes.length - 1)) {
                    var largerSize = dieSizes[indexOf+1];
                    updates[`system.resistances.${key}.die_size`] = largerSize;
                }
            });

            this.item.update(updates);
        });

        html.find('[data-action=downgrade]').click(async ev => {
            const dieSizes = game.heart.die_sizes;
            const services = this.item.system.resistances;

            const updates = {};

            Object.keys(services).forEach(key => {
                var service = services[key];
                var indexOf = dieSizes.indexOf(service.die_size);
                
                if(indexOf > 0) {
                    var smallerSize = dieSizes[indexOf-1];
                    updates[`system.resistances.${key}.die_size`] = smallerSize;
                }
            });

            this.item.update(updates);
        });

        html.find('[data-action=add-service]').click(ev => {
            const id = foundry.utils.randomID();
            this.item.update({[`system.resistances.${id}`]: {
                die_size: 'd4',
                resistance: 'blood'
            }});
        });

        html.find('[data-action=delete-service]').click(ev => {
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