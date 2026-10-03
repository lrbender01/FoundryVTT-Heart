import sheetHTML from './sheet.html';
import './character.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activateBeatListeners, openCallingBeats, createCustomBeat } from '../../items/beat/actions';
import { activateTrinketListeners, trinketItemOf } from '../../items/trinkets';
import { activateQuestionListeners } from '../../items/ancestry/questions';
import { needsEquipmentPick } from '../../items/class/equipment';
import { enableReorder, orderByFlag, orderKeys } from './reorder';
import { provisionsView, memberView, partyMembers, memberRows } from '../party/view';
import { canVolunteer, canResign } from '../party/party';
import { bondsOf, bondTarget, bondFallouts, bondState } from '../../bonds/bonds';
import { bondRowView } from '../../bonds/view';
import { grantBond, requestBond } from '../../bonds/flow';
import { visitDialog, healDialog, bondActionDialog } from '../../bonds/dialogs';
import { heartDialogOptions } from '../../common/dialog';
import { confirmRemoval } from '../../items/removal';
import { artOf, artCanvas, piecesOf, gearPieces, plainPiece, showGallery, startAt, startAtSrc } from '../../common/art';
import { SheetDecor } from '../../common/decor-dom';
import { artShown, artToggleButton, markArtButton } from '../../common/art-toggle';
import { CHARACTER_ANCHORS, CHARACTER_SECTIONS, characterArt, characterArtUrl, loadCharacterArt } from './decor';
import { characterSize } from '../../common/window-sizes';

class HeartTabs {
    constructor({ navSelector, contentSelector, initial, sheet }) {
        this.navSelector = navSelector;
        this.contentSelector = contentSelector;
        this.activeTab = initial;
        this.sheet = sheet;
    }

    async _render(force = false, options = {}) {
        // Preserve tab state across renders
        if (this.heartTabs) {
            this._savedActiveTab = this.heartTabs.activeTab;
        }
        await super._render(force, options);
    }

    init() {
        // Attach click event handlers using jQuery
        this.navItems.each((index, nav) => {
            $(nav).on("click", (event) => {
                console.log("nav clicked", nav);
                event.preventDefault();
                const tab = $(nav).data("tab");
                this._activeTab = tab;
                this.showTab(tab);
            });
        });
        this.showTab(this.activeTab);
    }

    showTab(tab) {
        // Save the tab state to sheet options
        this.activeTab = tab;
        if (this.sheet) this.sheet.options.activeTab = tab;

        // Toggle nav and content visibility
        this.navItems.each((i, nav) => {
            $(nav).toggleClass("active", $(nav).data("tab") === tab);
        });
        this.contents.each((i, content) => {
            const isActive = $(content).data("tab") === tab;
            $(content).toggleClass("active", isActive);
            $(content).toggle(isActive);
        });
    }

    bind(html) {
        if (!html) return;
        // Use jQuery's find method to locate elements within the provided html object
        this.navItems = html.find(this.navSelector);
        this.contents = html.find(this.contentSelector);
        this.init();
    }
}


export default class CharacterSheet extends HeartActorSheet {
    static get defaultOptions() {
        const defaultOptions = super.defaultOptions;
        return foundry.utils.mergeObject(defaultOptions, {
            // default size (2026-10-01, Luke): 1000 wide (940 until
            // 2026-10-02; common/window-sizes.js), as tall as the
            // Foundry window less 100px, so the art banner and the Character
            // tab both fit; other sheets size from it (common/window-sizes)
            ...characterSize(),
            dragDrop: [{ dragSelector: '.item:not(.non-draggable)', dropSelector: null }]
        })
    }

    // Art in the title bar (2026-10-01): the one per-user art switch since
    // 2026-10-02 (common/art-toggle.js), every open Heart window redraws
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift(artToggleButton());
        return buttons;
    }

    // the title bar is drawn once, so the Art button's on / off look (white /
    // grey, character.sass) is refreshed after every render
    async _render(...args) {
        await super._render(...args);
        markArtButton(this);
    }

    // Decorations (2026-10-02, Luke; actors/character/decor.js, drawn by
    // common/decor-dom.js): the Heart Character Sheet Art tool's layout on
    // every character sheet, hidden with the art band by the Art button; a
    // click on one (with nothing clickable in the way) opens the gallery at it
    get _decor() {
        this.__decor ??= new SheetDecor({
            art: () => characterArt(),
            url: characterArtUrl,
            anchors: CHARACTER_ANCHORS,
            sections: CHARACTER_SECTIONS,
            hidden: () => !artShown(),
            open: (index) => {
                const d = characterArt()?.decor?.[index];
                if (d) this._showGallery({ src: characterArtUrl(d.img) });
            },
        });
        return this.__decor;
    }

    // The character's gallery (2026-10-02, one gallery for every sheet,
    // common/art.js): the ancestry, calling, and class pieces (key art,
    // alternates to pick, the book's drawings), the art of the gear on the
    // sheet, then the decorations showing, named for the section they sit
    // on; at the clicked document or picture
    _showGallery({ doc = null, src = null } = {}) {
        const p = this.actor.proxy;
        const form = this.element?.find('form')[0];
        const sectionName = (key) => form?.querySelector(`[data-anchor="${key}"] .container-title`)?.textContent.replace(/\s+/g, ' ').trim() || this.actor.name;
        const decor = artShown() ? characterArt()?.decor ?? [] : [];
        const pieces = [
            ...[p.ancestry, p.calling, p.class].filter(Boolean).flatMap(item => piecesOf(item)),
            ...gearPieces([...(p.equipment ?? []), ...(p.resources ?? []), ...(this.actor.itemTypes.item ?? [])]),
            ...decor.map(d => plainPiece(characterArtUrl(d.img), sectionName(d.anchor))),
        ];
        const start = src ? startAtSrc(pieces, src) : startAt(pieces, doc);
        showGallery(pieces, { title: this.actor.name, start });
    }

    async close(...args) {
        this._decor.stop();
        return super.close(...args);
    }

    // workaround for nested-children uuids not dragging properly
    async _onDragStart(event) {
        const target = event.currentTarget;

        // prevent drag and drop of embedded items from callings or classes
        if (target.dataset.documentId && target.dataset.documentId.includes("@")) {
            console.warn("target contains @");
            return;
        }

        const uuid = target.dataset.itemId;
        const document = await fromUuid(uuid);
        const dragData = document.toDragData();
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }

    async _onDropItemCreate(itemData) {
        if (this.actor.type === 'character') {

            // Validate itemData to ensure it has the required structure
            if (!itemData.name || !itemData.type || !itemData.system) {
                console.error("Invalid item data detected. Skipping creation.", itemData);
                return;
            }

            // Prevent duplication of items embedded in class or calling
            // This is not really a good way to do this, but it works for now
            if (
                (itemData.type == "equipment" ||
                    itemData.type == "resource" ||
                    itemData.type == "ability" ||
                    itemData.type == "beat"
                )
                &&
                (
                    itemData.name.startsWith('class.') ||
                    itemData.name.startsWith('calling.')
                )
            ) {
                console.warn(`Invalid item detected: ${itemData.name}. Skipping creation.`);
                return;
            }

            // Sanity check: Prevent duplication of items
            const existingItem = this.actor.items.find(i => i.name === itemData.name && i.type === itemData.type);
            if (existingItem) {
                // Generic items stack: dropping a second copy (e.g. rolling
                // the same keepsake twice) bumps the quantity instead.
                if (itemData.type === 'item') {
                    const current = Number(existingItem.system.quantity) || 1;
                    const added = Number(itemData.system.quantity) || 1;
                    await existingItem.update({ 'system.quantity': current + added });
                    return existingItem;
                }
                console.warn(`Duplicate item detected: ${itemData.name}. Skipping creation.`);
                return;
            }

            // A new calling or class replaces the old one and everything it
            // gave. Waited for (2026-10-01): removing a class resets the
            // skills and domains (index.js), which must happen before the new
            // class marks its core skill and domain.
            // A class with learned abilities, a calling with tracked beats,
            // or an ancestry with written questions asks first (2026-10-01,
            // Luke; items/removal.js); declining keeps the old one
            if (['calling', 'class', 'ancestry'].includes(itemData.type)) {
                for (const old of this.actor.itemTypes[itemData.type]) {
                    if (!(await confirmRemoval(old))) return;
                }
            }
            if (itemData.type === 'calling' || itemData.type === 'class') {
                await Promise.all(this.actor.itemTypes[itemData.type].map(item => item.delete()));
            }

            // Generic items have no active flag; everything else lands active.
            if (itemData.type !== 'item') {
                itemData.system.active = true;
            }
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
        const callingItem = this.actor.proxy.calling;
        const classItem = this.actor.proxy.class;
        const ancestryItem = this.actor.proxy.ancestry;
        data.editable = this.actor.isOwner || game.user.isGM;
        data.user = game.user;
        data.pronouns = this.actor.system.pronouns || "";
        data.ancestry = this.actor.system.ancestry || "";
        data.callingItem = callingItem;
        data.classItem = classItem;
        data.ancestryItem = ancestryItem;
        // the art banner (2026-10-01): ancestry, calling, class, each pane
        // framed for the banner; none at all when the player hid it or no
        // slot has art
        data.showArt = artShown();
        if (data.showArt) {
            const panes = [ancestryItem, callingItem, classItem].map(item => {
                const art = artOf(item);
                return { art: Boolean(art), uuid: item?.uuid ?? '', name: item ? localizeHeart(item.name) : '', html: artCanvas(art, 'band') };
            });
            data.artBand = panes.some(p => p.art) ? panes : null;
        }
        // the Items section in the player's order (dragged on the sheet)
        data.orderedItems = orderByFlag(this.actor, this.actor.itemTypes.item ?? [], 'itemOrder');
        // the Biography's keepsake / trinket: the item's current name (it
        // may have been renamed), else the name recorded when it was rolled
        const trinketName = (owner) => owner ? (trinketItemOf(owner)?.name ?? owner.flags?.heart?.trinket?.name ?? '') : '';
        data.trinketNames = { calling: trinketName(callingItem), ancestry: trinketName(ancestryItem) };
        data.orderedFallouts = orderByFlag(this.actor, this.actor.itemTypes.fallout ?? [], 'falloutOrder');
        data.orderedEquipment = orderByFlag(this.actor, this.actor.proxy.equipment ?? [], 'equipmentOrder');
        data.orderedBeats = orderByFlag(this.actor, this.actor.proxy.beats ?? [], 'beatOrder');
        // a class pick-one choice not made yet (header badge + Equipment line)
        data.classNeedsEquipment = needsEquipmentPick(classItem);

        // Warnings (2026-09-30): one "!" badge per header slot / section,
        // its tooltip listing what is missing. Keepsake / trinket only for
        // book ancestries / callings (fvtt-heart-content), which have tables.
        const t = (k, d) => game.i18n.format(`heart.warn.${k}`, d ?? {});
        const fromBook = (i) => Boolean(i?.flags?.['fvtt-heart-content']);
        const pursued = this.actor.proxy.beats?.length ?? 0;
        const join = (list) => list.filter(Boolean).join('\n');
        data.warnings = {
            ancestry: join([!ancestryItem && t('no-ancestry'),
                ancestryItem && fromBook(ancestryItem) && !ancestryItem.flags?.heart?.trinket && t('keepsake')]),
            // beats warn on Pursued Beats; equipment on the Equipment section
            // and on the class slot too (2026-10-01, Luke), whose badge opens
            // the class's Overview, where it is picked
            class: join([!classItem && t('no-class'), data.classNeedsEquipment && t('equipment')]),
            calling: join([!callingItem && t('no-calling'),
                callingItem && fromBook(callingItem) && !callingItem.flags?.heart?.trinket && t('trinket')]),
            equipment: data.classNeedsEquipment ? t('equipment') : '',
            beats: callingItem && pursued < 2 ? t('beats', { count: pursued }) : '',
        };
        // how many rows the Skills / Domains grids hold (one row sits alone)
        data.skillCount = Object.values(this.actor.system.skills ?? {}).filter(s => s.value).length;
        data.domainCount = Object.values(this.actor.system.domains ?? {}).filter(d => d.value).length;
        // the cards in the player's order (dragged on the sheet, reorder.js)
        const traitList = (group, flag) => {
            const all = this.actor.system[group] ?? {};
            const names = Object.keys(all).filter(n => all[n]?.value);
            return orderKeys(this.actor, names, flag).map(name => ({ name, knack: all[name].knack ?? '' }));
        };
        data.skillList = traitList('skills', 'skillOrder');
        data.domainList = traitList('domains', 'domainOrder');
        // the cards in balanced rows of three, each centred, like the party
        // sheet's members (2026-10-02, Luke: 4 as 2 + 2, 5 as 3 + 2)
        data.skillRows = memberRows(data.skillList);
        data.domainRows = memberRows(data.domainList);
        data.beatSlots = game.i18n.format('heart.beat.slots', { count: this.actor.proxy.beats?.length ?? 0 });
        data.showTotalStress = game.settings.get('heart', 'showTotalStress');

        // Inactive items: switched-off items owned by the character, PLUS class
        // equipment/resources switched off from the sheet while their equipment
        // group is still selected on the class. Those used to vanish with no way
        // back (fixed 2026-09-29). Options from unselected pick-one groups are
        // deliberately left out - they are choices, not switched-off gear.
        const isInactive = (item) => item.system.active !== undefined && !item.system.active;
        const inactiveItems = this.actor.items.filter(isInactive);
        if (classItem) {
            const groups = classItem.system.active_equipment_groups ?? [];
            for (const child of classItem.children) {
                if (!isInactive(child)) continue;
                if (child.type === 'resource' || (child.type === 'equipment' && groups.includes(child.system.group))) {
                    inactiveItems.push(child);
                }
            }
        }
        data.inactiveItems = inactiveItems;
        data.orderedInactive = orderByFlag(this.actor, inactiveItems, 'inactiveOrder');

        // Provisions (house rule, 2026-09-30): the party's shared track under
        // the five resistances; nothing before the party actor exists
        data.provisions = provisionsView(this.actor.proxy.provisions);
        if (data.provisions) {
            const p = data.provisions;
            const f = (k, d) => game.i18n.format(`heart.party-sheet.${k}`, d ?? {});
            // the Party section: named after the party actor, members as chips
            const party = game.heart.party;
            data.partyName = party?.name || game.i18n.localize('heart.party.label-single');
            // membership is explicit (2026-09-30 review): drop the party on
            // this sheet or this character on the party sheet; until then the
            // section only says how, with a warning
            data.inParty = Boolean(party && (party.system.members ?? []).includes(this.actor.id));
            // the other members (not this character) as chips
            data.partyMembers = partyMembers(party).filter(a => a.id !== this.actor.id).map(a => memberView(a, party));
            data.isQuartermaster = Boolean(this.actor.proxy.isQuartermaster);
            data.partyQm = p.quartermaster ? f('qm-line', { name: p.quartermasterName }) : f('qm-none-line');
            // only this character's owner, only while the post is empty
            data.canVolunteer = !game.user.isGM && canVolunteer(party, this.actor);
            // and the quartermaster's owner may resign it
            data.canResign = !game.user.isGM && canResign(party, this.actor);
            // and a party with nobody to protect Provisions (2026-10-01, Luke)
            data.warnings.party = [
                data.inParty ? '' : game.i18n.localize('heart.warn.party'),
                p.quartermaster ? '' : game.i18n.localize('heart.warn.no-quartermaster'),
            ].filter(Boolean).join('\n');
        }

        // Bonds (2026-10-01, Luke's picks): compact rows on the Character
        // tab, under everything but Inactive Items (bonds/view.js)
        data.bonds = bondsOf(this.actor).map(bond => {
            const target = bondTarget(bond);
            return bondRowView(bond, {
                target,
                fallouts: bondFallouts(bond),
                companionItems: target?.items ?? [],
                // who runs a companion rolls its Stress and Fallout
                canRun: Boolean(target?.isOwner),
            });
        });
        return data;
    }

    // Dropping the party actor on this sheet makes the character a member
    // (the other way: drop the character on the party sheet). Any other
    // actor is a bond (2026-10-01): the GM grants it, a player's drop asks
    // the GM (bonds/flow.js)
    async _onDropActor(event, data) {
        const dropped = await Actor.implementation.fromDropData(data);
        if (dropped && dropped.type !== 'party' && this.actor.type === 'character' && this.actor.isOwner) {
            if (dropped.id === this.actor.id) return false;
            return game.user.isGM ? grantBond(this.actor, dropped) : requestBond(this.actor, dropped);
        }
        if (dropped?.type !== 'party') return super._onDropActor(event, data);
        if (!this.actor.isOwner || this.actor.type !== 'character') return false;
        // only the GM adds members (2026-09-30, Luke)
        if (!game.user.isGM) {
            ui.notifications.warn(game.i18n.localize('heart.party.gm-only-settings'));
            return false;
        }
        const members = dropped.system.members ?? [];
        if (!members.includes(this.actor.id)) await dropped.update({ 'system.members': [...members, this.actor.id] });
        return dropped;
    }

    // The Bonds section's buttons (2026-10-01). Each finds its bond from the
    // row and calls game.heart.bonds, which checks who may do what and posts
    // the card; the dialogs only ask (bonds/dialogs.js).
    _activateBondListeners(html) {
        const actor = this.actor;
        const bondOf = (el) => actor.items.get(el.closest('[data-bond-id]')?.dataset.bondId);
        const api = () => game.heart.bonds;
        const on = (action, fn) => html.find(`.bonds-container [data-action="${action}"]`).on('click', async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            await fn(ev.currentTarget, bondOf(ev.currentTarget));
        });
        const ids = (bond) => ({ characterId: actor.id, bondId: bond.id });

        on('view-bond', (el, bond) => bond?.sheet.render(true));
        on('open-target', async (el) => (await fromUuid(el.dataset.uuid))?.sheet.render(true));
        on('open-companion', (el, bond) => bond && bondTarget(bond)?.sheet.render(true));
        on('open-companion-fallout', async (el) => (await fromUuid(el.dataset.uuid))?.sheet.render(true));
        on('remove-bond', async (el, bond) => {
            if (!bond) return;
            const ok = await Dialog.confirm({
                title: game.i18n.format('heart.bond.dialog.remove-title', { bond: bond.name }),
                content: `<p>${Handlebars.escapeExpression(game.i18n.format('heart.bond.dialog.remove-body', { bond: bond.name, name: actor.name }))}</p>`,
                defaultYes: false,
                options: heartDialogOptions(),
            });
            if (ok) await api().removeBond(ids(bond));
        });
        on('bond-visit', async (el, bond) => {
            const resistance = bond && await visitDialog(actor, bond);
            if (resistance) await api().transferStress({ ...ids(bond), resistance });
        });
        on('bond-heal', async (el, bond) => {
            const falloutId = bond && await healDialog(actor, bond);
            if (falloutId) await api().healFallout({ ...ids(bond), falloutId });
        });
        on('bond-action', async (el, bond) => {
            const answer = bond && await bondActionDialog(bond);
            if (answer) await api().bondAction({ ...ids(bond), ...answer });
        });
        on('bond-check', (el, bond) => bond && api().rollBondFallout(ids(bond)));
        // a companion's Stress and Fallout: the ordinary rolls, for them
        // (the Stress roll's stakes picker; the Fallout card's Pick Fallout)
        on('companion-stress', async (el, bond) => {
            const target = bond && bondState(bond).target;
            if (!target) return;
            const roll = await game.heart.rolls.StressRoll.build({ character: target.id });
            if (roll) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }) });
        });
        on('companion-fallout', async (el, bond) => {
            const target = bond && bondState(bond).target;
            if (!target) return;
            const roll = await game.heart.rolls.FalloutRoll.build({ character: target.id });
            if (roll) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: target }) });
        });
        // the GM sets a person bond's pool by its marks: click to mark up to a
        // box, the last marked again to clear it
        html.find('.bonds-container [data-bond-pool] .ordered-checkable-box').on('click', async ev => {
            ev.preventDefault();
            if (!game.user.isGM) return;
            const bond = bondOf(ev.currentTarget);
            if (!bond) return;
            const index = Number(ev.currentTarget.dataset.index) || 0;
            const value = Number(bond.system.stress?.value) || 0;
            const next = ev.currentTarget.classList.contains('checked') && index + 1 === value ? index : index + 1;
            await api().setBondStress({ ...ids(bond), value: next });
        });
        // the GM resolves a person bond's Fallout: kept, struck, as history
        on('resolve-bond-fallout', async (el) => {
            if (!game.user.isGM) return;
            const fallout = await fromUuid(el.dataset.uuid);
            await fallout?.update({ 'system.complete': true });
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Art banner: a pane opens the character's gallery at its piece
        html.find('.character-art-band [data-action=view-art]').click(async ev => {
            ev.preventDefault();
            this._showGallery({ doc: await fromUuid(ev.currentTarget.dataset.itemId) });
        });
        // the decorations, once their file is read (once; at once after that)
        const decorForm = SheetDecor.formOf(html);
        loadCharacterArt().then(() => {
            if (decorForm?.isConnected) this._decor.attach(decorForm);
        });

        // Bonds: every row button (bonds/view.js names the actions)
        this._activateBondListeners(html);

        // Beats: Activate / Complete on the Active Beats rows, and the eye /
        // "Choose another" that open the calling on its Beats tab
        activateBeatListeners(html);
        html.find('[data-action=open-calling-beats]').click(ev => {
            ev.preventDefault();
            openCallingBeats(this.actor);
        });
        // "+" (GM): a custom beat, added to the calling and pursued at once
        // when there is room (items/beat/actions.js)
        html.find('[data-action=create-beat]').click(ev => {
            ev.preventDefault();
            createCustomBeat({ calling: this.actor.proxy.calling ?? null, actor: this.actor, pursue: true });
        });

        // Drag to reorder abilities, resources and items (actors/character/reorder.js)
        enableReorder(html, this.actor, '.abilities-container .tab-item-list > .item.preview[data-item-id]', 'abilityOrder');
        enableReorder(html, this.actor, '.resources-container .tab-item-list > .item.preview[data-item-id]', 'resourceOrder');
        enableReorder(html, this.actor, '.items-container .tab-item-list > .item.preview[data-item-id]', 'itemOrder');
        enableReorder(html, this.actor, '.fallout-container .tab-item-list > .item.preview[data-item-id]', 'falloutOrder');
        enableReorder(html, this.actor, '.equipment-container .tab-item-list > .item.preview[data-item-id]', 'equipmentOrder');
        enableReorder(html, this.actor, '.active-beats-container .tab-item-list > .item.preview[data-item-id]', 'beatOrder');
        enableReorder(html, this.actor, '.inactive-items-container .tab-item-list > .item.preview[data-item-id]', 'inactiveOrder');
        enableReorder(html, this.actor, '.skills-container .skill-row[data-skill]', 'skillOrder', { key: 'skill', axis: 'x' });
        enableReorder(html, this.actor, '.domains-container .domain-row[data-domain]', 'domainOrder', { key: 'domain', axis: 'x' });

        // Trinkets / keepsakes (Biography): roll once, item into inventory
        activateTrinketListeners(html);
        // ancestry questions: delete, add (2026-09-30, Luke)
        activateQuestionListeners(html, { openSheetOnAdd: true });
        html.find('[data-action=open-party]').click(ev => {
            ev.preventDefault();
            game.heart.party?.sheet.render(true);
        });
        // The Party warning badge (2026-10-02, Luke): not a member yet, it
        // only says how to join (drag the party from the Actors sidebar onto
        // this sheet) and never opens the party sheet; a member whose party
        // lacks a quartermaster is taken to the party sheet, where one is
        // picked
        html.find('[data-action=party-warning]').click(ev => {
            ev.preventDefault();
            const party = game.heart.party;
            const member = Boolean(party && (party.system.members ?? []).includes(this.actor.id));
            if (member) party.sheet.render(true);
            else ui.notifications.info(game.i18n.localize('heart.warn.party'));
        });
        // this character takes the empty quartermaster post (2026-10-01, Luke)
        html.find('[data-action=volunteer-quartermaster]').click(ev => {
            ev.preventDefault();
            game.heart.party?.proxy.volunteerQuartermaster(this.actor.id);
        });
        // ...or gives it up
        html.find('[data-action=resign-quartermaster]').click(ev => {
            ev.preventDefault();
            game.heart.party?.proxy.resignQuartermaster(this.actor.id);
        });
        // a party member chip opens that character (if this user may see it)
        html.find('.party-chips [data-action=open-member]').click(ev => {
            ev.preventDefault();
            game.actors.get(ev.currentTarget.dataset.memberId)?.sheet.render(true);
        });

        html.find('[data-action=open-class-overview]').click(ev => {
            ev.preventDefault();
            const cls = this.actor.items.find(i => i.type === 'class');
            if (!cls) return;
            cls.sheet._activeTab = 'overview';
            cls.sheet.render(true);
        });

        // the calling's warning badge (trinket not rolled) opens it on its
        // Overview tab, where the trinket is rolled, whichever tab it last
        // showed (2026-10-01, Luke: it reopened on Beats)
        html.find('[data-action=open-calling-overview]').click(ev => {
            ev.preventDefault();
            const calling = this.actor.items.find(i => i.type === 'calling');
            if (!calling) return;
            calling.sheet._activeTab = 'overview';
            calling.sheet.render(true);
        });

        // Abilities: the eye opens the class on its Abilities tab, where
        // abilities are unlocked
        html.find('[data-action=open-class-abilities]').click(ev => {
            ev.preventDefault();
            const cls = this.actor.items.find(i => i.type === 'class');
            if (!cls) return;
            cls.sheet._activeTab = 'abilities';
            cls.sheet.render(true);
        });

        this.heartTabs = new HeartTabs({
            navSelector: ".character-nav-tabs a",
            contentSelector: ".tab-content .tab",
            initial: this.options.activeTab || "character",
            sheet: this
        });
        this.heartTabs.bind(html);

        // Tracks whose box group names its field (data-target). A bond's pool
        // marks have their own handler (_activateBondListeners) and no
        // target; they used to fire this too, sending update({undefined: n})
        // on every GM click (2026-10-02)
        html.find('.ordered-checkable-box:not(.checked):not(.readonly)').click(ev => {
            const element = ev.currentTarget;
            const target = element.parentElement?.dataset.target;
            if (!target) return;
            ev.preventDefault();
            const index = parseInt(element.dataset.index);

            const data = {};
            data[target] = index + 1;
            this.actor.update(data);
        });

        html.find('.ordered-checkable-box.checked:not(.readonly)').click(ev => {
            const element = ev.currentTarget;
            const target = element.parentElement?.dataset.target;
            if (!target) return;
            ev.preventDefault();
            const index = parseInt(element.dataset.index);

            const data = {};
            if (index + 1 === foundry.utils.getProperty(this.actor, target)) {
                data[target] = index;
            } else {
                data[target] = index + 1;
            }
            this.actor.update(data);
        });

        html.find('.resistance-input').change(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const parent = element.parentElement;
            const target = parent.dataset.target;

            const data = {};
            data[target] = parseInt(element.value);
            this.actor.update(data);

        })

        html.find('[data-action=edit]').click(async ev => {
            ev.preventDefault();

            const target = $(ev.currentTarget); // or $(ev.currentTarget).closest('[data-action=edit]')

            const type = target.data('type'); // returns "skills"

            if (type == "skills") {
                new game.heart.applications.SkillsManagementApplication(this.actor).render(true);
                return;
            }

            if (type == "domains") {
                new game.heart.applications.DomainsManagementApplication(this.actor).render(true);
                return;
            }

            console.log("heart | no matching ManagementApplication for this edit-action found");


        });


        // Notes edit button lives in the container title (consistent with the
        // other Biography sections); it clicks Foundry's own editor button,
        // which CSS hides. Native .click() because jQuery .trigger() skips the
        // default action on <a> elements.
        html.find('[data-action=edit-notes]').click(ev => {
            ev.preventDefault();
            const button = html.find('.notes-container .editor-edit').get(0);
            if (button) button.click();
        });

        // "+" on the Ancestry / Class / Calling slots: the Character Options
        // picker (every compendium providing that type, searchable). An empty
        // slot opens it from anywhere inside (2026-09-30, Luke); the inner "+"
        // and "!" stop here so it opens once
        html.find('[data-action=choose-option]').click(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const type = ev.currentTarget.dataset.itemType;
            new game.heart.applications.CharacterOptionsApplication(this.actor, type).render(true);
        });

        html.find('[data-action=prepare-request-roll]').click(ev => {
            new game.heart.applications.PrepareRollRequestApplication({}).render(true);
        });

        html.find('[data-action=fallout-roll]').click(async ev => {
            const roll = await game.heart.rolls.FalloutRoll.build({
                character: this.actor.id
            });

            roll.toMessage({
                speaker: { actor: this.actor.id }
            });
        });

        html.find('.pronouns-input').change(ev => {
            ev.preventDefault();
            const newPronouns = ev.currentTarget.value;
            // Update the actor data (adjust the data path as needed)
            this.actor.update({ 'system.pronouns': newPronouns });
        });

        html.find('.ancestry-input').change(ev => {
            ev.preventDefault();
            const newAncestry = ev.currentTarget.value;
            // Update the actor data (adjust the data path as needed)
            this.actor.update({ 'system.ancestry': newAncestry });
        });
    }
}