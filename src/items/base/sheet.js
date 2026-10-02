import sheetHTML from './sheet.html';
import HeartSheetMixin from '../../common/sheet';
import './preview.sass';
import './item-sheet.sass';
import { highlightRendered } from '../../common/terms';
import { iconFor } from '../../common/icons';
import { heartDialogOptions } from '../../common/dialog';
import { learnedTimes } from '../ability/repeat';
import { activateBeatListeners } from '../beat/actions';
import { activateTrinketListeners } from '../trinkets';
import { artOf, showArt } from '../../common/art';
import { canHoldChild } from '../../common/drops';

let measureContext;
// the item types that carry book art (fvtt-heart-content, 2026-10-01; gear
// too since the item art landed)
const ART_TYPES = new Set(['class', 'calling', 'ancestry', 'equipment', 'resource', 'item']);

// Size an input to its text (or placeholder) in its own font; refits as the
// user types and once the display font has loaded
function fitNameField(input) {
    if (!input) return;
    const fit = () => {
        const cs = getComputedStyle(input);
        measureContext ??= document.createElement('canvas').getContext('2d');
        measureContext.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        let text = input.value || input.placeholder || '';
        if (cs.textTransform === 'uppercase') text = text.toUpperCase();
        const spacing = (parseFloat(cs.letterSpacing) || 0) * text.length;
        const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        input.style.width = `${Math.ceil(measureContext.measureText(text).width + spacing + pad + 8)}px`;
    };
    fit();
    input.addEventListener('input', fit);
    document.fonts?.ready.then(fit);
}

export default class HeartItemSheet extends HeartSheetMixin(ItemSheet) {
    static get type() { return 'base'; }

    static get defaultOptions() {
        const defaultOptions = super.defaultOptions;
        return foundry.utils.mergeObject(defaultOptions, {
            // Shared item chrome (2026-09-29): full-bleed header, readable size
            // (650 wide since 2026-10-01; was 720)
            classes: [...defaultOptions.classes, 'heart-item-sheet'],
            width: 650,
            // fits its content (fallout / tag / beat sheets were mostly empty
            // space at a fixed 600px); long sheets set their own height
            height: 'auto',
            // keep the scroll position across re-renders (pursuing a beat on
            // the calling's Beats tab jumped back to the top, 2026-09-30)
            scrollY: ['.window-content', '.item-body'],
            dragDrop: defaultOptions.dragDrop.concat([{ dragSelector: ".item", dropSelector: null }])
        });
    }

    get template() {
        return sheetHTML.path;
    }

    // Art in the title bar (2026-10-01, Luke): the character sheet's button,
    // on every class, calling, ancestry, and gear sheet with book art. Each sheet
    // remembers its own choice for this player (client setting
    // heart.hiddenItemArt: the item uuids whose art is hidden), across
    // reopening the sheet and logging in again.
    _hasArt() {
        return ART_TYPES.has(this.item.type) && Boolean(artOf(this.item));
    }

    _artHidden() {
        return Boolean(game.settings.get('heart', 'hiddenItemArt')?.[this.item.uuid]);
    }

    async _toggleArt() {
        const hidden = { ...(game.settings.get('heart', 'hiddenItemArt') ?? {}) };
        if (hidden[this.item.uuid]) delete hidden[this.item.uuid];
        else hidden[this.item.uuid] = true;
        await game.settings.set('heart', 'hiddenItemArt', hidden);
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        if (this._hasArt()) {
            buttons.unshift({
                label: game.i18n.localize('heart.art.toggle'),
                class: 'heart-art-toggle',
                icon: 'fas fa-image',
                onclick: () => this._toggleArt(),
            });
        }
        return buttons;
    }

    // the title bar is drawn once, so the Art button's white / grey look
    // (character.sass) is refreshed after every render
    async _render(...args) {
        await super._render(...args);
        this.element?.find('.window-header .heart-art-toggle').toggleClass('art-off', this._artHidden());
    }

    get default_img() {
        return 'icons/svg/item-bag.svg';
    }

    get img() {
        return this.default_img;
    }

    get children() {
        return this.item.children;
    }

    get childrenTypes() {
        return this.item.children?.reduce((map, value) => {
            if (map[value.type] === undefined) {
                map[value.type] = [value];
            } else {
                map[value.type].push(value);
            }
            return map;
        }, {});
    }

    activateListeners(html) {
       
        super.activateListeners(html);

        // ---- shared item chrome (2026-09-29) ----
        // Game terms (skills, domains, resistances, fallout, protection, dice)
        // highlighted in the DISPLAYED descriptions; editing uses stored data.
        // Ability, class, and calling text also mark capitalised ability
        // references ("as per HEARTSBLOOD", 2026-09-30, Luke)
        highlightRendered(html[0], '.editor-panel .editor-content, .class-description, .calling-text',
            { abilityRefs: ['ability', 'class', 'calling'].includes(this.item.type) });

        // Book art: a click on the art opens the whole piece
        html.find('.item-head.has-art > .heart-art-canvas').click(ev => {
            ev.preventDefault();
            showArt(this.item);
        });

        // The name field is as wide as its text, so the header chips sit
        // right after the name instead of a fixed field width away
        // (2026-09-30 review)
        fitNameField(html.find('input.item-name')[0]);

        // Question answers (ancestry, calling): the small pencil after a
        // question opens that answer's editor, taller than the resting view
        // (Foundry sizes the editor from the element when it opens).
        html.find('[data-action=edit-answer]').click(ev => {
            ev.preventDefault();
            const li = ev.currentTarget.closest('li');
            if (!li) return;
            li.classList.add('editing');
            const button = li.querySelector('.answer .editor-edit');
            if (button) button.click();
        });
        // Tabs (only sheets that render a .character-nav-tabs strip)
        const tabs = html.find('.character-nav-tabs a[data-tab]');
        if (tabs.length) {
            const show = (tab) => {
                this._activeTab = tab;
                tabs.each((i, el) => $(el).toggleClass('active', el.dataset.tab === tab));
                html.find('.item-tab[data-tab]').each((i, el) => $(el).toggle(el.dataset.tab === tab));
            };
            show(this._activeTab ?? tabs.first().data('tab'));
            tabs.click(ev => { ev.preventDefault(); show(ev.currentTarget.dataset.tab); });
        }

        // Beat Activate / Complete buttons (rows on the calling, the beat's
        // own header) - rules in items/beat/actions.js
        activateBeatListeners(html);
        // ancestry / calling header: Roll keepsake / trinket (items/trinkets.js)
        activateTrinketListeners(html);

        // Abilities on a character's class (2026-09-30): Learn is permanent
        // for players (no confirmation, per Luke); the GM can un-learn one
        html.find('[data-action=ability-unlock]').click(async ev => {
            ev.preventDefault();
            const ability = await fromUuid(ev.currentTarget.closest('[data-item-id]').dataset.itemId);
            if (!ability) return;
            // a major ability's option needs the major ability learned first
            const parent = ability.parentItem;
            if (parent?.type === 'ability' && !parent.system.active) {
                ui.notifications.warn(game.i18n.localize('heart.ability.parent-first'));
                return;
            }
            await ability.update({ 'system.active': true });
        });
        // Repeatable abilities ("You can take this advance more than once",
        // 2026-09-30, Luke): "+" learns one again (system.times counts them);
        // the GM's click on Learned takes one back, the last one un-learns it
        html.find('[data-action=ability-again]').click(async ev => {
            ev.preventDefault();
            const ability = await fromUuid(ev.currentTarget.closest('[data-item-id]').dataset.itemId);
            if (!ability?.isOwner || !ability.system.active) return;
            await ability.update({ 'system.times': learnedTimes(ability) + 1 });
        });
        html.find('[data-action=ability-lock]').click(async ev => {
            ev.preventDefault();
            if (!game.user.isGM) return;
            const ability = await fromUuid(ev.currentTarget.closest('[data-item-id]').dataset.itemId);
            if (!ability) return;
            const times = learnedTimes(ability);
            if (times > 1) await ability.update({ 'system.times': times - 1 });
            else await ability.update({ 'system.active': false, 'system.times': 1 });
        });

        // Header chips that flip a boolean (Active, Complete)
        html.find('[data-action=toggle-field][data-field]').click(ev => {
            ev.preventDefault();
            const field = ev.currentTarget.dataset.field;
            this.item.update({ [field]: !foundry.utils.getProperty(this.item, field) });
        });

        // Header die: roll this item's die
        html.find('[data-action=item-roll-self]').click(async ev => {
            ev.preventDefault();
            const roll = game.heart.rolls.ItemRoll.build({ item: this.item }, {}, { stepIncrease: ev.shiftKey && !ev.altKey, stepDecrease: ev.altKey && !ev.shiftKey });
            await roll.evaluate();
            roll.toMessage({
                flavor: `${iconFor(this.item.img)}${localizeHeart(this.item.name)} (<span class="item-type">${this.item.type}</span>)`,
                speaker: ChatMessage.getSpeaker({ actor: this.item.actor })
            });
        });

        // Pencil in a panel title opens that panel's editor (native click:
        // jQuery .trigger() skips the default on <a>)
        html.find('[data-action=edit-editor]').click(ev => {
            ev.preventDefault();
            const button = $(ev.currentTarget).closest('.editor-panel').find('.editor-edit').get(0);
            if (button) button.click();
        });

        // Quantity stepper (generic items)
        html.find('[data-action=qty-step]').click(ev => {
            ev.preventDefault();
            const step = Number(ev.currentTarget.dataset.step) || 0;
            const next = Math.max(0, (Number(this.item.system.quantity) || 0) + step);
            this.item.update({ 'system.quantity': next });
        });

        html.find('[data-action=add-child][data-type]').click(ev => {
            const target = $(ev.currentTarget);
            const documentName = target.data('document-name') || 'Item';
            const type = target.data('type');
            let itemData = target.data('data') || {};

            const data = { documentName, type: type, name: `New ${type}`, system: itemData };
            // open the new child's sheet to name and fill it (addChildren
            // gives the data its id); it is already listed in its section
            this.item.addChildren([data]).then(() => this.item.children?.get(data._id)?.sheet.render(true));
        });

        html.find('[data-item-id] [data-action=view]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            item.sheet.render(true);
        });

        html.find('[data-item-id] [data-action=delete]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            if(item === null) return;
            await item.deleteDialog(heartDialogOptions());
        });

        html.find('[data-item-id] [data-action=activate]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item.update({ 'system.active': true });
            this.render(true);
        });

        html.find('[data-item-id] [data-action=deactivate]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item.update({ 'system.active': false });
            this.render(true);
        });

        html.find('[data-item-id] [data-action=complete]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item.update({ 'system.complete': true });
            this.render(true);
        });

        html.find('[data-item-id] [data-action=uncomplete]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item.update({ 'system.complete': false });
            this.render(true);
        });
    }

    getData() {
        const data = super.getData();
        data.user = game.user;

        data.die_sizes = game.heart.die_sizes.reduce((map, die) => {
            map[die] = game.i18n.format('heart.die_size.d(N)', { N: die.replace(/^d/, '') });
            return map;
        }, {});

        data.skills = game.heart.skills.reduce((map, skill) => {
            map[skill] = game.i18n.localize(`heart.skill.${skill}`);
            return map;
        }, {});

        data.domains = game.heart.domains.reduce((map, domain) => {
            map[domain] = game.i18n.localize(`heart.domain.${domain}`);
            return map;
        }, {});

        data.equipment_types = game.heart.equipment_types.reduce((map, equipment_type) => {
            map[equipment_type] = game.i18n.localize(`heart.equipment.type.${equipment_type}`);
            return map;
        }, {});

        data.resistances = game.heart.resistances.reduce((map, resistance) => {
            map[resistance] = game.i18n.localize(`heart.resistance.${resistance}`);
            return map;
        }, {});

        // a Fallout may also hit Provisions or a bond (2026-10-01)
        data.fallout_resistances = game.heart.fallout_resistances.reduce((map, resistance) => {
            map[resistance] = game.i18n.localize(`heart.resistance.${resistance}`);
            return map;
        }, {});

        data.beat_levels = game.heart.beat_levels.reduce((map, beat_level) => {
          map[beat_level] = game.i18n.localize(`heart.beat.level.${beat_level}`);
          return map;
        }, {});

        data.fallout_levels = game.heart.fallout_levels.reduce((map, fallout_level) => {
          map[fallout_level] = game.i18n.localize(`heart.fallout.level.${fallout_level}`);
          return map;
        }, {});

        data.ability_tiers = ['core', 'minor', 'major', 'zenith'].reduce((map, tier) => {
          map[tier] = tier === 'core' ? game.i18n.localize('heart.item-sheet.core') : game.i18n.localize(`heart.ability.type.${tier}`);
          return map;
        }, {});

        // "Crawler", "Vess Harrowmere"... shown after the type in the header
        data.parentName = this.item.parentItem ? localizeHeart(this.item.parentItem.name) : (this.item.actor?.name ?? '');
        data.editable = this.isEditable;
        data.owner = this.item.isOwner;

        data.children = this.children;
        data.childrenTypes = this.childrenTypes;
        data.system = this.item.system;
        // book art banner (2026-10-01, common/art.js), unless this player hid
        // it on this sheet (the Art button)
        data.art = this._hasArt() && !this._artHidden() ? artOf(this.item) : null;

        return data;
    }

    // Drops onto an item sheet (2026-10-02: the type check now runs; it was
    // async, so its promise always passed and any owned item could land
    // hidden inside any other; the upstream debugging logs are gone)
    async _onDrop(event) {
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch (err) {
            return false;
        }
        if (Hooks.call('dropItemSheetData', this.item, this, data) === false) return;
        if (data?.type !== 'Item') return;
        data.documentName = 'Item';
        return this._onDropItem(event, data);
    }

    async _onDropItem(event, data) {
        if (!this.item.isOwner) return false;
        const item = await Item.implementation.fromDropData(data);
        if (!item || item.uuid === this.item.uuid) return false;
        if (!this._canDragDropItem(item)) {
            const label = (type) => game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type);
            ui.notifications.warn(game.i18n.format('heart.drop.refused-child', { child: label(item.type), parent: label(this.item.type) }));
            return false;
        }
        // (upstream behaviour, kept: only an item from an actor or another
        // item is copied in; a world or compendium item dropped here is not)
        if (item.parent == null) return;
        // dragged out of this sheet and back onto it
        if (data.parentItemId === this.item.id) return;
        const itemData = item.toObject();
        itemData.documentName = 'Item';
        return this.item.addChildren([itemData]);
    }

    // The child types this sheet shows (common/drops.js); synchronous, so a
    // refusal refuses
    _canDragDropItem(item) {
        return canHoldChild(this.item.type, item?.type);
    }

    async _onDragStart(event) {
        const li = event.currentTarget;
        if (event.target.classList.contains("entity-link")) return;

        const dragData = {
            parentItemId: this.item.id,
            uuid: event.target.dataset.documentId,
            type: "Item"
        };

        // Compendium items: the data itself, without an id, so the drop
        // makes a new item
        if (dragData.uuid?.startsWith('Compendium')) {
            const item = await fromUuid(li.dataset.itemId);
            if (!item) return;
            dragData.data = item.toObject();
            delete dragData.data._id;
            delete dragData.uuid;
        }

        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
}
