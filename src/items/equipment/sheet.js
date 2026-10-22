import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';

import './sheet.sass';

const types = ['miscellaneous', 'delve', 'kill', 'mend'];
const beat_levels = ['minor', 'major', 'zenith']

function initialise() {
    game.heart.equipment_types = types;
    game.heart.beat_levels = beat_levels;
}

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'systems/heart/assets/battle-gear.svg',
    template: sheetHTML.path,
});

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    get template() {
        return data.template || sheetHTML.path;
    }

    get img() {
        return data.img;
    }

    // (get id() is HeartItemSheet's since 2026-10-21; the unused
    // resistanceTypes getter and empty getData went)

    activateListeners(html) {
        super.activateListeners(html);

        // Resistance chips (2026-09-29): click toggles that resistance in or
        // out of system.resistances
        html.find('[data-action=toggle-resistance][data-value]').click(ev => {
          ev.preventDefault();
          const value = ev.currentTarget.dataset.value;
          const current = Array.isArray(this.item.system.resistances) ? [...this.item.system.resistances] : [];
          const next = current.includes(value) ? current.filter(r => r !== value) : [...current, value];
          this.item.update({ 'system.resistances': next });
        });
        // (the upstream .ordered-checkable-box handlers went 2026-10-21: no
        // equipment template has boxes)

    }

}

export {
  data,
  initialise
}