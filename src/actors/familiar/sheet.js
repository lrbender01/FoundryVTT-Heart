import sheetHTML from './sheet.html';
import './familiar.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { TRAITS, TRAIT_MAX, traitsOf, dangerOf, dangerStep, clampFamiliarData, speciesLocked, spellLocked } from './rules';
import { rollTrait, rollSpecies, rollSpell, unlockRoll, traitLabel, familiarSpellId, sigilSrc, showSpell, familiarSpeciesId, speciesSrc } from './roll';
import { DEFAULT_IMGS } from '../../common/icons';
import { oneAtATime } from '../../common/busy';

// The familiar sheet (Luke, 2026-10-24): a player character from The Witch
// is Dead (Grant Howitt's one-page game) for a one-shot run in the Heart
// system. It looks like the game's own sheet, not like Heart: ink on
// off-white paper, hand-lettered headings, bold red accents, in both colour
// schemes. So the window drops the heart-window class (Heart's dark theme,
// the glass, and the dark ground are all scoped to it) and the Glass button.
// The rules are rules.js; the rolls and their cards are roll.js.
export default class FamiliarSheet extends HeartActorSheet {
    static get type() { return Object.keys(template.Actor)[0]; }

    static get defaultOptions() {
        const options = super.defaultOptions;
        const classes = [...(options.classes ?? []).filter(c => c !== 'heart-window'), 'heart-familiar-sheet'];
        return foundry.utils.mergeObject(options, { classes, width: 560, height: 720, resizable: true });
    }

    get template() {
        return sheetHTML.path;
    }

    // (no Glass button: the paper sheet never turns to glass)
    _getHeaderButtons() {
        return super._getHeaderButtons().filter(b => b.class !== 'heart-glass-toggle');
    }

    getData() {
        const data = super.getData();
        const system = this.actor.system;
        data.editable = this.isEditable;
        const traits = traitsOf(system);
        data.traitMax = TRAIT_MAX;
        data.traits = TRAITS.map(key => {
            const label = traitLabel(key);
            return {
                key,
                label,
                value: traits[key],
                hint: game.i18n.localize(`heart.familiar.trait-hint.${key}`),
                tip: game.i18n.format('heart.familiar.roll-tip', { trait: label }),
            };
        });
        data.danger = dangerOf(system);
        // Foundry's mystery man (or a fork default) is no portrait: drawn
        // faint, with the box's label over it
        data.blankPortrait = !this.actor.img || DEFAULT_IMGS.has(this.actor.img);
        // the spell's sigil (Luke, 2026-10-26), when the spell is one of the
        // ten and the content module gives the art
        data.spellSigil = sigilSrc(familiarSpellId(this.actor));
        // the species' picture (Luke, 2026-10-27); a placeholder stands in
        // until the file is painted (activateListeners)
        data.speciesPic = speciesSrc(familiarSpeciesId(this.actor));
        // roll once: a rolled species or spell is locked; the GM unlocks
        data.speciesLocked = speciesLocked(system);
        data.spellLocked = spellLocked(system);
        data.isGM = game.user.isGM;
        return data;
    }

    // typed numbers kept in range (rules.js clampFamiliarData)
    async _updateObject(event, formData) {
        return super._updateObject(event, clampFamiliarData(formData));
    }

    activateListeners(html) {
        super.activateListeners(html);

        // a trait's heading rolls it, for anyone who can see the sheet; the
        // card says when the roller can't mark Danger (roll.js)
        html.find('[data-action=familiar-roll]').on('click', ev => {
            ev.preventDefault();
            rollTrait(this.actor, ev.currentTarget.dataset.trait);
        });

        // the spell's sigil sends the spell to chat (anyone who can see the
        // sheet: it writes nothing)
        html.find('[data-action=familiar-show-spell]').on('click', ev => {
            ev.preventDefault();
            oneAtATime(`familiar-show-spell-${this.actor.id}`, ev.currentTarget, () => showSpell(this.actor));
        });

        // a species picture not painted yet shows the placeholder, never a
        // broken image
        html.find('.familiar-species-pic img').each((_i, img) => {
            const miss = () => img.closest('.familiar-species-pic')?.classList.add('missing');
            img.addEventListener('error', miss, { once: true });
            if (img.complete && img.naturalWidth === 0) miss();
        });

        if (!this.isEditable) return;

        // the GM lets a rolled species or spell be rolled again
        html.find('[data-action=familiar-unlock]').on('click', ev => {
            ev.preventDefault();
            oneAtATime(`familiar-unlock-${this.actor.id}`, ev.currentTarget, () => unlockRoll(this.actor, ev.currentTarget.dataset.which));
        });

        // Danger by hand: up, or down for a problem solved or run from
        html.find('[data-action=familiar-danger]').on('click', ev => {
            ev.preventDefault();
            const delta = Number(ev.currentTarget.dataset.delta) || 0;
            const next = dangerStep(this.actor.system?.danger, delta);
            if (next !== dangerOf(this.actor.system)) this.actor.update({ 'system.danger': next });
        });

        html.find('[data-action=familiar-roll-species]').on('click', ev => {
            ev.preventDefault();
            oneAtATime(`familiar-species-${this.actor.id}`, ev.currentTarget, () => rollSpecies(this.actor));
        });
        html.find('[data-action=familiar-roll-spell]').on('click', ev => {
            ev.preventDefault();
            oneAtATime(`familiar-spell-${this.actor.id}`, ev.currentTarget, () => rollSpell(this.actor));
        });
    }
}
