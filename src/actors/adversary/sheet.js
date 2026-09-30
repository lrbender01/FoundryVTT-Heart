import sheetHTML from './sheet.html';
import './adversary.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults, toChips } from '../../common/panel-sheet';

// Difficulty levels for the header chip. The book's full difficulty text
// (often a condition, e.g. Ghost) stays in system.difficulty and shows as a
// note under the tabs whenever it says more than the bare level.
const LEVELS = ['Standard', 'Risky', 'Dangerous', 'Legendary'];

// Adversary sheet (redesigned 2026-09-29). Layout in sheet.html; shared
// tabs / tracks / editor / edit-toggle behaviour in common/panel-sheet.js.
export default class AdversarySheet extends HeartActorSheet {
    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions);
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'stat';
        this._editing = false;
    }

    async _onDropItemCreate(itemData) {
        if(this.actor.type === 'adversary') {

            itemData.system.active = true;
        }

        return super._onDropItemCreate(itemData);
    }

    static get type() { return Object.keys(template.Actor)[0]; }

    get template() {
        return sheetHTML.path;
    }

    get img() {
        return 'systems/heart/assets/high-punch.svg';
    }

    getData() {
        const data = super.getData();
        const system = this.actor.system;
        data.user = game.user;
        data.editable = this.isEditable;
        data.owner = this.actor.isOwner;
        data.editing = this._editing;
        data.levels = Object.fromEntries(LEVELS.map(l => [l, l]));
        data.resistanceValue = Number(system.resistance) || 0;

        const difficulty = String(system.difficulty ?? '').trim();
        const level = String(system.level ?? '').trim();
        data.difficultyNote = difficulty && difficulty.toLowerCase() !== level.toLowerCase() ? difficulty : '';

        data.domainChips = toChips(system.domains);
        data.inactiveItems = this.actor.items.filter(i => i.system.active !== undefined && !i.system.active);
        return data;
    }

    // Adversaries imported before the 2026-09-29 field split carry their
    // flavour text (plus "Example names" / "Domains" lines) in system.notes and
    // an empty system.description. On first open, move that text to the
    // Description and the two lines to the Profile fields, leaving GM Notes
    // empty. Only for adversaries from fvtt-heart-content (their notes were
    // never the GM's), and only for owners.
    async _render(force, options) {
        await this._migrateLegacyLore();
        return super._render(force, options);
    }

    async _migrateLegacyLore() {
        const actor = this.actor;
        const system = actor.system;
        if (!actor.isOwner || !actor.flags?.['fvtt-heart-content']) return;
        if (String(system.description ?? '').trim() || !String(system.notes ?? '').trim()) return;
        let text = String(system.notes);
        const updates = { 'system.notes': '' };
        const names = text.match(/<p><strong>Example names:<\/strong>\s*([\s\S]*?)<\/p>/);
        if (names) {
            text = text.replace(names[0], '');
            if (!system.names) updates['system.names'] = names[1].trim();
        }
        const domains = text.match(/<p><strong>Domains:<\/strong>\s*([\s\S]*?)<\/p>/);
        if (domains) {
            text = text.replace(domains[0], '');
            // "Haven, Technology; note" / "Haven" / "note" (no domain list)
            const [head, ...rest] = domains[1].split(/;\s*/);
            const isList = /^(Cursed|Desolate|Haven|Occult|Religion|Technology|Warren|Wild)(,\s*(Cursed|Desolate|Haven|Occult|Religion|Technology|Warren|Wild))*$/.test(head.trim());
            const list = isList ? head.trim() : '';
            const note = (isList ? rest : [head, ...rest]).join('; ').trim();
            if (list && !system.domains) updates['system.domains'] = list;
            if (note && !system.domainsNote) updates['system.domainsNote'] = note;
        }
        if (!system.level) {
            const lead = String(system.difficulty ?? '').match(/^(Standard|Risky|Dangerous|Legendary)/i);
            if (lead) updates['system.level'] = lead[1][0].toUpperCase() + lead[1].slice(1).toLowerCase();
        }
        updates['system.description'] = text.trim();
        await actor.update(updates, { render: false });
    }

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
    }
}
