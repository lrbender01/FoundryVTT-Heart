import sheetHTML from './sheet.html';
import './party.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults } from '../../common/panel-sheet';
import { getParty } from './party';
import { provisionsView, memberView, partyMembers, memberBeats } from './view';
import { highlightRendered } from '../../common/terms';
import { heartDialogOptions } from '../../common/dialog';

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
// what the party can carry together (the Items section)
const PARTY_ITEM_TYPES = ['equipment', 'resource', 'item'];
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

    // Who can be quartermaster: the members only, so a party with no members
    // offers nobody (2026-09-30, Luke; restock payers likewise, getData)
    _candidates() {
        return this.memberIds().map(id => game.actors.get(id)).sort((a, b) => a.name.localeCompare(b.name));
    }

    getData() {
        const data = super.getData();
        const p = this.actor.proxy.provisions;
        data.user = game.user;
        data.owner = this.actor.isOwner;
        data.editable = this.isEditable;
        data.provisions = provisionsView(p);

        // class icon, name, and ancestry / class / calling (2026-09-30 review)
        data.members = partyMembers(this.actor).map(a => ({ ...memberView(a, this.actor), removable: PartySheet.canManage(a), beats: memberBeats(a) }));

        // a quartermaster who has left the party still shows, so the picker
        // doesn't silently claim "None" while they still protect Provisions
        const candidates = this._candidates();
        const qm = p.quartermaster ? game.actors.get(p.quartermaster) : null;
        const qmList = qm && !candidates.includes(qm) ? [qm, ...candidates] : candidates;
        data.qmOptions = qmList.map(a => ({ id: a.id, name: a.name, selected: a.id === p.quartermaster }));

        // Restock is paid from your own Supplies (2026-09-30 review): only
        // characters this user owns can pay (the GM sees every member), and
        // nobody is picked until someone chooses
        // only party members pay, never every character (2026-09-30, Luke)
        const payers = partyMembers(this.actor).filter(a => game.user.isGM || a.isOwner);
        data.payerOptions = payers.map(a => ({ id: a.id, name: a.name, selected: a.id === this._ui.payer }));

        const dieOptions = (dice, chosen) => dice.map(d => ({ die: d, label: d.toUpperCase(), selected: d === chosen }));
        data.markDice = dieOptions(MARK_DICE, this._ui.markDie);
        data.relieveDice = dieOptions(MARK_DICE, this._ui.relieveDie);
        data.restockDice = dieOptions(RESTOCK_DICE, this._ui.restockDie);

        data.fallouts = this.actor.itemTypes.fallout ?? [];
        // party-shared gear (2026-09-30, Luke): equipment, resources, items
        data.partyItems = PARTY_ITEM_TYPES.flatMap(type => this.actor.itemTypes[type] ?? []);
        return data;
    }

    // Reset sits in the window's title bar, GM only (2026-09-30, Luke): out
    // of the way of the Provisions actions, and named for what it does
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        if (game.user.isGM) {
            buttons.unshift({
                label: loc('heart.party-sheet.reset'),
                class: 'heart-party-reset',
                icon: 'fas fa-skull',
                onclick: () => this._confirmReset(),
            });
        }
        return buttons;
    }

    // header buttons take no tooltip, so it is added to the drawn frame
    // (a Foundry tooltip like every Heart one, 2026-09-30, Luke)
    async _renderOuter() {
        const html = await super._renderOuter();
        html.find('.heart-party-reset').attr('data-tooltip', loc('heart.party-sheet.reset-tip'));
        return html;
    }

    async _confirmReset() {
        const ok = await Dialog.confirm({
            title: loc('heart.party-sheet.reset'),
            content: `<p>${esc(loc('heart.party-sheet.reset-confirm', { name: this.actor.name }))}</p>`,
            options: heartDialogOptions(),
        });
        if (ok) this.actor.proxy.reset();
    }

    // ------------------------------------------------------------ members

    async _setMembers(ids) {
        await this.actor.update({ 'system.members': [...new Set(ids)] });
    }

    // Players add and remove only their own characters; the GM anyone
    // (2026-09-30 review)
    static canManage(actor) {
        return game.user.isGM || Boolean(actor?.isOwner);
    }

    // Only the GM adds members (2026-09-30, Luke); players may still take
    // their own character out
    async _addMembers(actors) {
        if (!game.user.isGM) {
            ui.notifications.warn(loc('heart.party.gm-only-settings'));
            return;
        }
        const chars = actors.filter(a => a?.type === 'character');
        if (!chars.length) {
            ui.notifications.warn(loc('heart.party-sheet.only-characters'));
            return;
        }
        if (chars.some(a => !PartySheet.canManage(a))) {
            ui.notifications.warn(loc('heart.party-sheet.own-only'));
            return;
        }
        await this._setMembers([...this.memberIds(), ...chars.map(a => a.id)]);
    }

    async _chooseMember() {
        const current = new Set(this.memberIds());
        const options = game.actors
            .filter(a => a.type === 'character' && !current.has(a.id) && PartySheet.canManage(a))
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
            options: heartDialogOptions(),
        });
        if (id) await this._addMembers([game.actors.get(id)]);
    }

    // Dropping a character adds it to the party (GM only, _addMembers)
    async _onDropActor(event, data) {
        if (!this.actor.isOwner) return false;
        const actor = await Actor.implementation.fromDropData(data);
        if (!actor) return false;
        await this._addMembers([actor]);
        return actor;
    }

    // Fallouts (they befall everyone) and the party's shared gear
    async _onDropItemCreate(itemData) {
        const list = (Array.isArray(itemData) ? itemData : [itemData])
            .filter(i => i?.type === 'fallout' || PARTY_ITEM_TYPES.includes(i?.type));
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
        // game terms in the Provisions actions' one-line descriptions, like
        // every other sheet's text
        highlightRendered(html[0], '.action-desc');
        const api = this.actor.proxy;

        // Controls are not form fields: remember them, and keep their change
        // events away from the sheet's submit-on-change
        const remember = (selector, key) => html.find(selector).on('change', ev => {
            ev.stopPropagation();
            this._ui[key] = ev.currentTarget.value;
        });
        remember('[data-control=payer]', 'payer');
        // die chips: the clicked one becomes the choice (no re-render)
        const dieChips = (control, key) => html.find(`[data-control=${control}] .die-chip`).on('click', ev => {
            ev.preventDefault();
            this._ui[key] = ev.currentTarget.dataset.die;
            $(ev.currentTarget).addClass('on').siblings('.die-chip').removeClass('on');
        });
        dieChips('mark-die', 'markDie');
        dieChips('relieve-die', 'relieveDie');
        dieChips('restock-die', 'restockDie');
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
            if (!payerId) {
                ui.notifications.warn(loc('heart.party-sheet.payer-needed'));
                return;
            }
            api.restock({ payerId, die: this._ui.restockDie });
        });
        click('party-scavenge', () => api.scavengeRelief());
        click('party-clear', async () => {
            const ok = await Dialog.confirm({
                title: loc('heart.party.clear'),
                content: `<p>${esc(loc('heart.party.confirm-clear', { name: this.actor.name, count: this.actor.proxy.provisions.value }))}</p>`,
                options: heartDialogOptions(),
            });
            if (ok) api.clearProvisions({});
        });

        // Members: open, remove, add
        click('open-member', ev => game.actors.get(ev.currentTarget.closest('[data-member-id]').dataset.memberId)?.sheet.render(true));
        click('remove-member', ev => {
            ev.stopPropagation();
            const id = ev.currentTarget.closest('[data-member-id]').dataset.memberId;
            if (!PartySheet.canManage(game.actors.get(id))) return;
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

// Party fallouts (Empty removes Provisions protection), a member's
// ancestry / class / calling (their chip shows the class icon and names),
// and a member's beats (the party sheet's Beats section; the calling's
// beats are its children, so pursuing one updates the calling)
const MEMBER_TRAITS = ['ancestry', 'class', 'calling'];
for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
    Hooks.on(hook, (item) => {
        if (item.parent?.type === 'party') { renderCharacterSheets(); return; }
        const party = getParty();
        if (!party || !(party.system.members ?? []).includes(item.parent?.id)) return;
        if (MEMBER_TRAITS.includes(item.type)) renderCharacterSheets();
        else if (item.type !== 'beat') return;
        if (party.sheet?.rendered) party.sheet.render(false);
    });
}

Hooks.on('deleteActor', (actor) => {
    const party = getParty();
    if (actor.type === 'character' && party?.sheet?.rendered) party.sheet.render(false);
});
