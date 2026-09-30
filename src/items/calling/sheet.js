import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { activeBeatsOf, allBeatsOf, beatLevel, createCustomBeat } from '../beat/actions';
import { trinketItemOf } from '../trinkets';

import './sheet.sass';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'systems/heart/assets/drum.svg',
    template: sheetHTML.path,
});

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, { width: 960, height: 820 });
    }

    get template() {
        return data.template;
    }

    get img() {
        return data.img;
    }

    getData() {
        const data = super.getData();
        // every beat: the calling's own, custom ones added to it, and loose
        // custom beats on the character (items/beat/actions.js)
        const beats = allBeatsOf(this.item);
        const of = (level) => beats.filter(b => beatLevel(b) === level);
        data.minorBeats = of('minor');
        data.majorBeats = of('major');
        data.zenithBeats = of('zenith');
        const done = (list) => list.filter(b => b.system.complete).length;
        data.minorDone = done(data.minorBeats);
        data.majorDone = done(data.majorBeats);
        data.zenithDone = done(data.zenithBeats);
        data.completedBeats = done(beats);
        // the rolled trinket, shown as an item row in the Trinket section
        data.trinketItem = trinketItemOf(this.item);
        data.activeBeats = this._activeBeats();
        data.beatSlots = game.i18n.format('heart.beat.slots', { count: data.activeBeats.length });
        // same warning as the character sheet's Pursued Beats
        data.beatsWarning = this.item.isOwned && data.activeBeats.length < 2
            ? game.i18n.format('heart.warn.beats', { count: data.activeBeats.length })
            : '';
        return data;
    }

    // Beats the character is currently chasing (active, not complete) - the
    // same list the character sheet counts (loose actor beats included)
    _activeBeats() {
        return activeBeatsOf(this.item);
    }

    activateListeners(html) {
        super.activateListeners(html);

        // (beat Activate / Complete buttons are wired by the base item sheet;
        // the two-at-a-time rule lives in items/beat/actions.js)
        html.find('[data-action=show-beats-tab]').click(ev => {
            ev.preventDefault();
            this._activeTab = 'beats';
            this.render();
        });

        // "+" on a Beats section (GM): a custom beat, that section's severity
        // preselected
        html.find('[data-action=create-beat]').click(ev => {
            ev.preventDefault();
            createCustomBeat({ calling: this.item, level: ev.currentTarget.dataset.level || 'minor' });
        });

        html.find('[data-action=add-question]').click(ev => {
            const id = foundry.utils.randomID();
            this.item.update({[`system.questions.${id}`]: {
                question: '',
                answer: ''
            }});
        });

        html.find('[data-action=delete-question]').click(ev => {
            const target = $(ev.currentTarget);
            const id = target.closest ('[data-id]').data('id');
            this.item.update({[`system.questions.-=${id}`]: null});
        });
    }

    async _canDragDropItem(item) {
        if(item.type === 'ability' && item.type === undefined) {
            await item.update({'system.type': 'core'});
        }
        
        if(item.type === 'beat' && item.type === undefined) {
            await item.update({'system.type': 'minor'});
        }
        return ['ability', 'beat'].includes(item.type);
    }

    async _onDropItem(event, data) {

        return super._onDropItem(event, data);
    }
}

// Loose custom beats live on the actor, not the calling: when one changes,
// refresh the character's open calling sheet too (it lists and counts them)
for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
    Hooks.on(hook, (item) => {
        if (item.type !== 'beat' || item.parent?.type !== 'character') return;
        const calling = item.parent.items.find(i => i.type === 'calling');
        if (calling?.sheet?.rendered) calling.sheet.render(false);
    });
}

export {
    data
}