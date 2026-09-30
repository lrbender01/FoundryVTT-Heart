// Ancestry item sheet. Since 2026-09-29 ancestries carry structured
// questions (system.questions: { <id>: { question, answer } }) exactly like
// callings, so the character sheet's Biography tab can offer answer editors.
// Question add/delete mirrors the calling sheet.
import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { trinketItemOf } from '../trinkets';

import './sheet.sass';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'systems/heart/assets/monument.svg',
    template: sheetHTML.path,
});

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    // A fixed starting size, not 'auto': Foundry ignores vertical resizing on
    // an auto-height window, and this one should resize freely (2026-09-30)
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, { width: 960, height: 820, resizable: true });
    }

    get template() {
        return data.template;
    }

    get img() {
        return data.img;
    }

    // Same id scheme the factory sheets use, so an ancestry opened from a
    // character sheet gets a stable window id.
    get id() {
        return `${this.constructor.name}-${this.document.uuid.replace(/[\.@]/g, "-")}`;
    }

    getData() {
        const data = super.getData();
        // the rolled keepsake, shown as an item row in the Keepsake section
        data.trinketItem = trinketItemOf(this.item);
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action=add-question]').click(ev => {
            const id = foundry.utils.randomID();
            this.item.update({[`system.questions.${id}`]: {
                question: '',
                answer: ''
            }});
        });

        html.find('[data-action=delete-question]').click(ev => {
            const target = $(ev.currentTarget);
            const id = target.closest('[data-id]').data('id');
            this.item.update({[`system.questions.-=${id}`]: null});
        });
    }
}

export {
    data
}
