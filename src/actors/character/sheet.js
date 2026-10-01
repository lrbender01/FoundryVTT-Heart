import sheetHTML from './sheet.html';
import './character.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';
import { activateBeatListeners, openCallingBeats, createCustomBeat } from '../../items/beat/actions';
import { activateTrinketListeners, trinketItemOf } from '../../items/trinkets';
import { activateQuestionListeners } from '../../items/ancestry/questions';
import { needsEquipmentPick } from '../../items/class/equipment';
import { enableReorder, orderByFlag, orderKeys } from './reorder';
import { provisionsView, memberView, partyMembers } from '../party/view';

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
            // default size (2026-09-30 review): fits the Character tab
            width: 930,
            height: 920,
            dragDrop: [{ dragSelector: '.item:not(.non-draggable)', dropSelector: null }]
        })
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

            // This essentially overwrites pre-existing callings and removes all associated items
            if (itemData.type === 'calling') {
                this.actor.itemTypes.calling.forEach(item => {
                    item.delete();
                });
            }

            // This essentially overwrites pre-existing classes and removes all associated items
            if (itemData.type === 'class') {
                this.actor.itemTypes.class.forEach(item => {
                    item.delete();
                });
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
            // equipment warns on the Equipment section, beats on Pursued Beats
            class: join([!classItem && t('no-class')]),
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
            data.warnings.party = data.inParty ? '' : game.i18n.localize('heart.warn.party');
        }
        return data;
    }

    // Dropping the party actor on this sheet makes the character a member
    // (the other way: drop the character on the party sheet)
    async _onDropActor(event, data) {
        const dropped = await Actor.implementation.fromDropData(data);
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

    activateListeners(html) {
        super.activateListeners(html);

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

        html.find('.ordered-checkable-box:not(.checked):not(.readonly)').click(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const parent = element.parentElement;
            const target = parent.dataset.target;

            const data = {};
            data[target] = index + 1;
            this.actor.update(data);
        });

        html.find('.ordered-checkable-box.checked:not(.readonly)').click(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const parent = element.parentElement;
            const target = parent.dataset.target;

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