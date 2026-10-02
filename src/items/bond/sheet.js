// Bond item sheet (2026-10-01; pared down the same day, Luke's calls). The
// relationship between a character and someone or something in the Heart
// (HCB p. 102), or a companion (W&M W66). Kind and Stress sit at the bottom
// left of the title bar with no red; the Bonded Actor; for a person bond,
// the Stress pool (the GM clicks its marks to set or clear it; filled and
// empty one size), the GM's Fallout Check and Clear Stress, and its own
// Fallout (the "+" opens the Fallout picker; resolved ones stay as
// history); Notes. A Critical removes the bond (HCB p. 102), so there is no
// "broken" state. A companion bond points to the companion's own sheet.
import sheetHTML from './sheet.html';
import templateJSON from './template.json';
import HeartItemSheet from '../base/sheet';
import { bondState, BOND_IMG } from '../../bonds/bonds';
import { poolMarks } from '../../bonds/view';
import { BOND_STRESS_MAX } from '../../bonds/rules';

import './sheet.sass';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: BOND_IMG,
    template: sheetHTML.path,
});

const loc = (key, values) => (values ? game.i18n.format(key, values) : game.i18n.localize(key));

export default class extends HeartItemSheet {
    static get type() { return data.type; }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, { width: 760 });
    }

    get template() {
        return data.template;
    }

    get img() {
        return data.img;
    }

    getData() {
        const sheetData = super.getData();
        const bond = this.item;
        const sys = bond.system;
        const state = bondState(bond);
        const max = Number(sys.stress?.max) || BOND_STRESS_MAX;
        const value = Number(sys.stress?.value) || 0;
        sheetData.user = game.user;
        sheetData.kindLabel = loc(`heart.bond.kind.${state.kind}`);
        sheetData.kindTip = loc(`heart.bond.ui.${state.kind}-tip`);
        sheetData.companion = state.companion;
        sheetData.missing = state.missing;
        sheetData.target = state.target ? { uuid: state.target.uuid, name: state.target.name } : null;
        sheetData.marks = poolMarks(value, max);
        sheetData.pool = { value, max };
        sheetData.poolTip = loc('heart.bond.ui.pool-tip', { name: bond.name, value, max });
        // the bond's own Fallout: open first, then the resolved ones kept as
        // history (Luke's pick)
        const fallouts = [...(bond.children ?? [])].filter(c => c.type === 'fallout');
        sheetData.fallouts = fallouts.filter(f => !f.system?.complete);
        sheetData.resolved = fallouts.filter(f => f.system?.complete);
        sheetData.canAct = Boolean(bond.actor) && game.user.isGM;
        return sheetData;
    }

    // what the GM's buttons pass to game.heart.bonds
    _ids() {
        return { characterId: this.item.actor?.id, bondId: this.item.id };
    }

    activateListeners(html) {
        super.activateListeners(html);
        // a companion bond's "Open their sheet"
        html.find('[data-action=open-bonded]').on('click', ev => {
            ev.preventDefault();
            bondState(this.item).target?.sheet.render(true);
        });
        if (!game.user.isGM) return;
        const api = () => game.heart.bonds;
        const on = (selector, fn) => html.find(selector).on('click', async ev => {
            ev.preventDefault();
            await fn(ev.currentTarget);
        });
        on('[data-action=unlink]', () => this.item.update({ 'system.target': '' }));
        on('[data-action=bond-check]', () => api().rollBondFallout(this._ids()));
        on('[data-action=bond-clear]', () => api().clearBondStress(this._ids()));
        on('[data-action=pick-bond-fallout]', () => game.heart.fallout.pick({ target: this.item, severity: 'minor', resistance: 'bond' }));
        // the pool's marks: click to mark up to a box, the last marked again
        // to clear it, as on every Heart track
        on('[data-bond-pool] .ordered-checkable-box', (el) => {
            const index = Number(el.dataset.index) || 0;
            const value = Number(this.item.system.stress?.value) || 0;
            const next = el.classList.contains('checked') && index + 1 === value ? index : index + 1;
            return this.item.update({ 'system.stress.value': next });
        });
    }

    // Drop an actor on the sheet to bond it (GM): its kind follows the actor
    async _onDrop(event) {
        let dropData;
        try { dropData = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (e) { dropData = null; }
        if (dropData?.type !== 'Actor') return super._onDrop(event);
        if (!game.user.isGM) {
            ui.notifications.warn(loc('heart.bond.gm-only-add'));
            return false;
        }
        const actor = await Actor.implementation.fromDropData(dropData);
        if (!actor || actor.id === this.item.actor?.id) return false;
        return this.item.update({
            'system.target': actor.uuid,
            'system.kind': actor.type === 'hireling' ? 'companion' : 'person',
            name: actor.name,
            img: actor.img,
        });
    }
}
