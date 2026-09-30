import sheetHTML from './sheet.html';
import './party.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults } from '../../common/panel-sheet';
import { getParty } from './party';
import { provisionsView, memberView, partyMembers } from './view';

// Party sheet (2026-09-30): the world's one party actor (party.js). Header:
// portrait, name and quartermaster, the shared Provisions track with its
// protection. Body: the members strip (token art + name; drag characters in
// or use +), the Provisions actions, party fallouts (drop fallout items
// here), notes.
//
// Every Provisions write goes through the party API on actor.proxy (each
// call posts its own chat card); the sheet only writes the name, img, notes
// and the member list (system.members, actor ids).

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

const MARK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];
const RESTOCK_DICE = ['d4', 'd6', 'd8'];

export default class PartySheet extends HeartActorSheet {
    static get type() { return Object.keys(template.Actor)[0]; }

    static get defaultOptions() {
        return panelSheetDefaults(super.defaultOptions, { width: 980, height: 860 });
    }

    constructor(...args) {
        super(...args);
        this._activeTab = 'main';
        this._editing = false;
        // control choices survive the re-render each API call causes
        this._ui = { markDie: 'd4', relieveDie: 'd4', restockDie: 'd4', payer: '' };
    }

    get template() {
        return sheetHTML.path;
    }

    get img() {
        return 'systems/heart/assets/icons/resistances/provisions.svg';
    }

    // Member ids that still point at a character
    memberIds() {
        return (this.actor.system.members ?? []).filter(id => game.actors.get(id)?.type === 'character');
    }

    // Who can be quartermaster or pay a restock: the members, or every
    // character while nobody has been added
    _candidates() {
        const ids = this.memberIds();
        const list = ids.length ? ids.map(id => game.actors.get(id)) : game.actors.filter(a => a.type === 'character');
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }

    getData() {
        const data = super.getData();
        const p = this.actor.proxy.provisions;
        data.user = game.user;
        data.owner = this.actor.isOwner;
        data.editable = this.isEditable;
        data.provisions = provisionsView(p);

        // class icon, name, and ancestry / class / calling (2026-09-30 review)
        data.members = partyMembers(this.actor).map(a => memberView(a, this.actor));

        const candidates = this._candidates();
        const qm = p.quartermaster ? game.actors.get(p.quartermaster) : null;
        const qmList = qm && !candidates.includes(qm) ? [qm, ...candidates] : candidates;
        data.qmOptions = qmList.map(a => ({ id: a.id, name: a.name, selected: a.id === p.quartermaster }));

        const own = game.user.character?.id;
        const payer = candidates.find(a => a.id === this._ui.payer) ?? candidates.find(a => a.id === own) ?? candidates[0];
        data.payerOptions = candidates.map(a => ({ id: a.id, name: a.name, selected: a.id === payer?.id }));

        const dieOptions = (dice, chosen) => dice.map(d => ({ die: d, label: d.toUpperCase(), selected: d === chosen }));
        data.markDice = dieOptions(MARK_DICE, this._ui.markDie);
        data.relieveDice = dieOptions(MARK_DICE, this._ui.relieveDie);
        data.restockDice = dieOptions(RESTOCK_DICE, this._ui.restockDie);

        data.fallouts = this.actor.itemTypes.fallout ?? [];
        return data;
    }

    // ------------------------------------------------------------ members

    async _setMembers(ids) {
        await this.actor.update({ 'system.members': [...new Set(ids)] });
    }

    async _addMembers(actors) {
        const chars = actors.filter(a => a?.type === 'character');
        if (!chars.length) {
            ui.notifications.warn(loc('heart.party-sheet.only-characters'));
            return;
        }
        await this._setMembers([...this.memberIds(), ...chars.map(a => a.id)]);
    }

    async _chooseMember() {
        const current = new Set(this.memberIds());
        const options = game.actors
            .filter(a => a.type === 'character' && !current.has(a.id))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (!options.length) {
            ui.notifications.info(loc('heart.party-sheet.no-candidates'));
            return;
        }
        const content = `<form class="heart"><div class="form-group"><select name="member">${options
            .map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div></form>`;
        const id = await Dialog.prompt({
            title: loc('heart.party-sheet.add-member'),
            content,
            label: loc('heart.party-sheet.add'),
            callback: html => html.find('[name=member]').val(),
            rejectClose: false,
        });
        if (id) await this._addMembers([game.actors.get(id)]);
    }

    // Dropping a character adds it to the party
    async _onDropActor(event, data) {
        if (!this.actor.isOwner) return false;
        const actor = await Actor.implementation.fromDropData(data);
        if (!actor) return false;
        await this._addMembers([actor]);
        return actor;
    }

    // Only fallouts belong on the party (they befall everyone)
    async _onDropItemCreate(itemData) {
        const list = (Array.isArray(itemData) ? itemData : [itemData]).filter(i => i?.type === 'fallout');
        if (!list.length) {
            ui.notifications.warn(loc('heart.party-sheet.only-fallout'));
            return [];
        }
        return super._onDropItemCreate(list);
    }

    // ------------------------------------------------------------ listeners

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
        const api = this.actor.proxy;

        // Controls are not form fields: remember them, and keep their change
        // events away from the sheet's submit-on-change
        const remember = (selector, key) => html.find(selector).on('change', ev => {
            ev.stopPropagation();
            this._ui[key] = ev.currentTarget.value;
        });
        remember('[data-control=mark-die]', 'markDie');
        remember('[data-control=relieve-die]', 'relieveDie');
        remember('[data-control=restock-die]', 'restockDie');
        remember('[data-control=payer]', 'payer');
        html.find('[data-control=mark-amount], [data-control=relieve-amount], [data-control=ignore-protection]')
            .on('change', ev => ev.stopPropagation());

        const amountOf = (control) => {
            const raw = String(html.find(`[data-control=${control}]`).val() ?? '').trim();
            return raw === '' ? undefined : Math.max(0, Math.floor(Number(raw) || 0));
        };
        const click = (action, fn) => html.find(`[data-action=${action}]`).on('click', ev => {
            ev.preventDefault();
            fn(ev);
        });

        click('party-quartermaster-clear', () => api.setQuartermaster(null));
        html.find('[data-control=quartermaster]').on('change', ev => {
            ev.stopPropagation();
            api.setQuartermaster(ev.currentTarget.value || null);
        });

        click('party-upkeep', () => api.upkeep());
        click('party-mark', () => api.markProvisions({
            die: this._ui.markDie,
            amount: amountOf('mark-amount'),
            ignoreProtection: html.find('[data-control=ignore-protection]').is(':checked'),
        }));
        click('party-relieve', () => api.relieveProvisions({
            die: this._ui.relieveDie,
            amount: amountOf('relieve-amount'),
        }));
        click('party-restock', () => {
            const payerId = html.find('[data-control=payer]').val();
            api.restock({ payerId, die: this._ui.restockDie });
        });
        click('party-scavenge', () => api.scavengeRelief());
        click('party-clear', async () => {
            const ok = await Dialog.confirm({
                title: loc('heart.party.clear'),
                content: `<p>${esc(loc('heart.party.confirm-clear', { name: this.actor.name, count: this.actor.proxy.provisions.value }))}</p>`,
            });
            if (ok) api.clearProvisions({});
        });
        click('party-reset', async () => {
            const ok = await Dialog.confirm({
                title: loc('heart.party-sheet.reset'),
                content: `<p>${esc(loc('heart.party-sheet.reset-confirm', { name: this.actor.name }))}</p>`,
            });
            if (ok) api.reset();
        });

        // Members: open, remove, add
        click('open-member', ev => game.actors.get(ev.currentTarget.closest('[data-member-id]').dataset.memberId)?.sheet.render(true));
        click('remove-member', ev => {
            ev.stopPropagation();
            const id = ev.currentTarget.closest('[data-member-id]').dataset.memberId;
            this._setMembers(this.memberIds().filter(m => m !== id));
        });
        click('add-member', () => this._chooseMember());
    }
}

// ------------------------------------------------------------ live refresh
// Provisions shows on every character sheet and members show on the party
// sheet, so changes on one actor re-render the other sheets that show them.

function renderCharacterSheets() {
    for (const actor of game.actors) {
        if (actor.type === 'character' && actor.sheet?.rendered) actor.sheet.render(false);
    }
}

Hooks.on('updateActor', (actor, changes) => {
    const party = getParty();
    if (!party) return;
    if (actor.type === 'party') {
        renderCharacterSheets();
        return;
    }
    if (actor.type !== 'character') return;
    const isQuartermaster = party.system.quartermaster === actor.id;
    const shown = isQuartermaster || (party.system.members ?? []).includes(actor.id);
    if (shown && party.sheet?.rendered) party.sheet.render(false);
    // a member's name shows on every character sheet's Party chips
    if (shown && 'name' in changes) renderCharacterSheets();
    // the quartermaster's Supplies protection protects Provisions
    if (isQuartermaster && foundry.utils.hasProperty(changes, 'system.resistances.supplies')) renderCharacterSheets();
});

// Party fallouts (Empty removes Provisions protection), and a member's
// ancestry / class / calling (their chip shows the class icon and names)
const MEMBER_TRAITS = ['ancestry', 'class', 'calling'];
for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
    Hooks.on(hook, (item) => {
        if (item.parent?.type === 'party') { renderCharacterSheets(); return; }
        const party = getParty();
        if (!party || !MEMBER_TRAITS.includes(item.type)) return;
        if (!(party.system.members ?? []).includes(item.parent?.id)) return;
        renderCharacterSheets();
        if (party.sheet?.rendered) party.sheet.render(false);
    });
}

Hooks.on('deleteActor', (actor) => {
    const party = getParty();
    if (actor.type === 'character' && party?.sheet?.rendered) party.sheet.render(false);
});
