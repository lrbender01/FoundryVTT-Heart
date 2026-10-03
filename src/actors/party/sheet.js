import sheetHTML from './sheet.html';
import './party.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activatePanelSheet, panelSheetDefaults } from '../../common/panel-sheet';
import { getParty, canVolunteer, canResign } from './party';
import { provisionsView, memberView, partyMembers, memberBeats, memberRows } from './view';
import { characterSize } from '../../common/window-sizes';
import { highlightRendered } from '../../common/terms';
import { heartDialogOptions } from '../../common/dialog';
import { oneAtATime } from '../../common/busy';
import { companionCards } from '../../bonds/view';
import { bondTarget } from '../../bonds/bonds';
import { BannerSheet } from '../../common/banner';
import { plainPiece, showGallery, startAtSrc } from '../../common/art';
import { SheetDecor } from '../../common/decor-dom';
import { loadPartyArt, partyArt, partyBanner } from './art';
import { partyArtUrl, ANCHORS, SECTION_ANCHORS } from './decor';
import { boardNotes, noteRemoval } from './board';
import { openPartyNote } from './note-window';

// Party sheet (2026-09-30): the world's one party actor (party.js). Header:
// portrait, name and quartermaster, the shared Provisions track with its
// protection. Body: the members strip (token art + name; drag characters in
// or use +), the Provisions actions, party fallouts (drop fallout items
// here), notes.
//
// Every Provisions write goes through the party API on actor.proxy (each
// call posts its own chat card); the sheet only writes the name, img, notes
// and the member list (system.members, actor ids).
//
// Art (2026-10-02, docs/plans/heart-party-art.md): the banner sheets' look
// (common/banner.js) with the content module's party-art.json as its art
// (art.js), plus that file's decorations, laid out and drawn by the shared
// decoration code (common/decor.js, common/decor-dom.js). The title bar's
// Art button hides both for this player; there is no Show players.

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

const MARK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];
// what the party can carry together (the Items section)
const PARTY_ITEM_TYPES = ['equipment', 'resource', 'item'];
const RESTOCK_DICE = ['d4', 'd6', 'd8'];

export default class PartySheet extends BannerSheet(HeartActorSheet) {
    static get type() { return Object.keys(template.Actor)[0]; }

    static get defaultOptions() {
        // the character sheet's size (2026-10-02, Luke; the panel sheets'
        // 85% from 2026-10-01, and 980 x 860 before that)
        return panelSheetDefaults(super.defaultOptions, characterSize());
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

    // ------------------------------------------------------------ art
    // the banner (common/banner.js reads _art)
    _art() {
        return partyBanner();
    }

    _hasPartyArt() {
        const art = partyArt();
        return Boolean(art?.banner || art?.decor?.length);
    }

    // the Art button whenever there is party art (banner or decorations);
    // no Show players
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons().filter(b => b.class !== 'heart-art-share');
        if (!this._art() && this._hasPartyArt()) {
            const reset = buttons.findIndex(b => b.class === 'heart-party-reset');
            buttons.splice(reset + 1, 0, {
                label: loc('heart.art.toggle'),
                class: 'heart-art-toggle',
                icon: 'fas fa-image',
                onclick: () => this._toggleArt(),
            });
        }
        return buttons;
    }

    // The decorations (common/decor-dom.js): drawn on every render, kept on
    // their sections as the form changes size; a click on one (with nothing
    // clickable in the way) opens the gallery at it
    get _decor() {
        this.__decor ??= new SheetDecor({
            art: () => partyArt(),
            url: partyArtUrl,
            anchors: ANCHORS,
            sections: SECTION_ANCHORS,
            hidden: () => this._artHidden(),
            open: (index) => this._showGallery(index),
        });
        return this.__decor;
    }

    // The party's gallery (2026-10-02, Luke: every piece on the sheet; the
    // one gallery for every sheet, common/art.js): the banner, then each
    // decoration, named for the section it sits on; at decoration `index`
    // when one was clicked
    _showGallery(index = null) {
        const art = partyArt();
        if (!art) return;
        const sectionName = {
            members: loc('heart.party-sheet.members'),
            companions: loc('heart.bond.ui.companions'),
            fallouts: loc('heart.party-sheet.fallout'),
            provisions: loc('heart.party-sheet.actions'),
            items: loc('heart.party-sheet.items'),
            notes: loc('heart.party-sheet.notes'),
            beats: loc('heart.party-sheet.beats'),
        };
        const banner = this._art();
        const pieces = [
            banner ? plainPiece(banner.src, this.actor.name, banner.ar) : null,
            ...art.decor.map(d => plainPiece(partyArtUrl(d.img), sectionName[d.anchor] ?? this.actor.name)),
        ].filter(Boolean);
        const clicked = art.decor[index];
        showGallery(pieces, { title: this.actor.name, start: clicked ? startAtSrc(pieces, partyArtUrl(clicked.img)) : 0 });
    }

    async close(...args) {
        this._decor.stop();
        return super.close(...args);
    }

    async getData() {
        // the party art, read once from the content module (art.js)
        await loadPartyArt();
        const data = super.getData();
        const p = this.actor.proxy.provisions;
        data.user = game.user;
        data.owner = this.actor.isOwner;
        data.editable = this.isEditable;
        data.provisions = provisionsView(p);

        // class icon, name, and ancestry / class / calling (2026-09-30 review)
        // volunteer: a player's own member card offers the empty quartermaster
        // post (2026-10-01, Luke; the GM uses the picker); the quartermaster's
        // own card offers to resign it
        data.members = partyMembers(this.actor).map(a => ({
            ...memberView(a, this.actor),
            removable: PartySheet.canManage(a),
            volunteer: !game.user.isGM && canVolunteer(this.actor, a),
            resign: !game.user.isGM && canResign(this.actor, a),
            beats: memberBeats(a),
        }));
        // Pursued Beats: only members actually pursuing one (2026-10-02, Luke)
        data.beatMembers = data.members.filter(m => m.beats.length);
        // the cards in balanced rows of three at most (2026-10-02, Luke)
        data.memberRows = memberRows(data.members);

        // a quartermaster who has left the party still shows, so the picker
        // doesn't silently claim "None" while they still protect Provisions
        const candidates = this._candidates();
        const qm = p.quartermaster ? game.actors.get(p.quartermaster) : null;
        const qmList = qm && !candidates.includes(qm) ? [qm, ...candidates] : candidates;
        data.qmOptions = qmList.map(a => ({ id: a.id, name: a.name, selected: a.id === p.quartermaster }));
        // nobody picked: the warning badge by the Members title (2026-10-01,
        // Luke), as on every member's sheet
        data.qmWarning = p.quartermaster ? '' : loc('heart.warn.no-quartermaster');

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

        // Companions (2026-10-01, Luke's pick): the hirelings and animals
        // bonded to members, who travel with the party. Under the name, what
        // the book calls them when they go by another name, then "Bond of"
        data.companions = companionCards(partyMembers(this.actor), bondTarget);

        data.fallouts = this.actor.itemTypes.fallout ?? [];
        // party-shared gear (2026-09-30, Luke): equipment, resources, items
        data.partyItems = PARTY_ITEM_TYPES.flatMap(type => this.actor.itemTypes[type] ?? []);
        // the note board (2026-10-02, Luke; board.js), each note's text as
        // its rich text shows
        data.board = await Promise.all(boardNotes(this.actor.system.board).map(async n => ({
            ...n,
            html: await TextEditor.enrichHTML(n.text, { async: true, secrets: this.actor.isOwner, relativeTo: this.actor }),
        })));
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

    // ------------------------------------------------------------ the note board

    // "+" pins a new note, a card opens its note in a window (note-window.js),
    // the trash takes it off after asking; a note too long for its card
    // fades out at the bottom (is-long)
    _activateBoard(html) {
        html.find('[data-action=add-note]').on('click', ev => {
            ev.preventDefault();
            openPartyNote(this.actor);
        });
        html.find('.board-note[data-action=open-note]').on('click', ev => {
            if (ev.target.closest('a[href], [data-action=delete-note]')) return;
            ev.preventDefault();
            openPartyNote(this.actor, ev.currentTarget.dataset.noteId);
        });
        html.find('[data-action=delete-note]').on('click', async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const id = ev.currentTarget.dataset.noteId;
            const note = boardNotes(this.actor.system.board).find(n => n.id === id);
            if (!note || !this.isEditable) return;
            const title = note.title || loc('heart.party-sheet.note-untitled');
            const yes = await Dialog.confirm({
                title: loc('heart.party-sheet.note-delete'),
                content: `<p>${esc(loc('heart.party-sheet.note-delete-confirm', { title }))}</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: false,
                options: heartDialogOptions(),
            });
            if (yes) await this.actor.update(noteRemoval(id));
        });
        requestAnimationFrame(() => {
            for (const body of html[0]?.querySelectorAll?.('.board-note-body') ?? []) {
                body.closest('.board-note').classList.toggle('is-long', body.scrollHeight > body.clientHeight + 1);
            }
        });
    }

    // ------------------------------------------------------------ listeners

    activateListeners(html) {
        super.activateListeners(html);
        activatePanelSheet(this, html);
        // the banner opens the gallery; the decorations are placed once the
        // sheet is laid out, and kept placed as it changes size
        html.find('.character-head.has-art > .heart-art-canvas').off('click').on('click', ev => {
            ev.preventDefault();
            this._showGallery();
        });
        this._decor.attach(SheetDecor.formOf(html));
        // game terms in the Provisions actions' one-line descriptions, like
        // every other sheet's text
        highlightRendered(html[0], '.action-desc');
        this._activateBoard(html);
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
        // an action that rolls or writes runs once at a time (2026-10-02,
        // Luke: a double-click posted two Provisions cards; common/busy.js)
        const act = (action, fn) => html.find(`[data-action=${action}]`).on('click', ev => {
            ev.preventDefault();
            return oneAtATime(`party:${action}`, ev.currentTarget, () => fn(ev));
        });

        click('party-quartermaster-clear', () => api.setQuartermaster(null));
        act('volunteer-quartermaster', ev => api.volunteerQuartermaster(ev.currentTarget.dataset.memberId));
        act('resign-quartermaster', ev => api.resignQuartermaster(ev.currentTarget.dataset.memberId));
        // the warning badge leads the GM to the picker
        click('pick-quartermaster', () => {
            if (game.user.isGM) html.find('[data-control=quartermaster]').trigger('focus');
        });
        html.find('[data-control=quartermaster]').on('change', ev => {
            ev.stopPropagation();
            api.setQuartermaster(ev.currentTarget.value || null);
        });

        act('party-upkeep', () => api.upkeep());
        act('party-mark', () => api.markProvisions({
            die: this._ui.markDie,
            amount: amountOf('mark-amount'),
            ignoreProtection: html.find('[data-control=ignore-protection]').is(':checked'),
        }));
        act('party-relieve', () => api.relieveProvisions({
            die: this._ui.relieveDie,
            amount: amountOf('relieve-amount'),
        }));
        act('party-restock', () => {
            const payerId = html.find('[data-control=payer]').val();
            if (!payerId) {
                ui.notifications.warn(loc('heart.party-sheet.payer-needed'));
                return;
            }
            return api.restock({ payerId, die: this._ui.restockDie });
        });
        act('party-scavenge', () => api.scavengeRelief());
        act('party-clear', async () => {
            const ok = await Dialog.confirm({
                title: loc('heart.party.clear'),
                content: `<p>${esc(loc('heart.party.confirm-clear', { name: this.actor.name, count: this.actor.proxy.provisions.value }))}</p>`,
                options: heartDialogOptions(),
            });
            if (ok) await api.clearProvisions({});
        });

        // Members: open, remove, add
        click('open-member', ev => game.actors.get(ev.currentTarget.closest('[data-member-id]').dataset.memberId)?.sheet.render(true));
        // a companion card opens the hireling or animal
        click('open-companion', async ev => (await fromUuid(ev.currentTarget.dataset.uuid))?.sheet.render(true));
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
