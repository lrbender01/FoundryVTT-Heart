import sheetHTML from './sheet.html';
import './character.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';

class HeartTabs {
    constructor({ navSelector, contentSelector, initial }) {
        this.navSelector = navSelector;
        this.contentSelector = contentSelector;
        this.activeTab = initial;
    }

    init() {
        // Attach click event handlers using jQuery
        this.navItems.each((index, nav) => {
            $(nav).on("click", (event) => {
                event.preventDefault();
                const tab = $(nav).data("tab");
                this.showTab(tab);
            });
        });
        this.showTab(this.activeTab);
    }

    showTab(tab) {
        // Toggle active class for navigation
        this.navItems.each((index, nav) => {
            $(nav).toggleClass("active", $(nav).data("tab") === tab);
        });
        // Show or hide content based on the active tab
        this.contents.each((index, content) => {
            if ($(content).data("tab") === tab) {
                $(content).show();
            } else {
                $(content).hide();
            }
        });
        this.activeTab = tab;
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
            width: 1250,
            height: 1000,
            dragDrop: [{ dragSelector: '.item', dropSelector: null }]
        })
    }

    // workaround for nested-children uuids not dragging properly
    async _onDragStart(event) {
        console.log("character onDragStart");

        const target = event.currentTarget;

        // prevent drag and drop of embedded items from callings or classes
        if (target.dataset.documentId && target.dataset.documentId.includes("@"))
        {
            console.warn("target contains @");
            return;
        }

        console.log("target:", target);

        const uuid = target.dataset.itemId;
        const document = await fromUuid(uuid);
        const dragData = document.toDragData();
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }

    async _onDropItemCreate(itemData) {
        console.log("character _onDropItemCreate");

        if (this.actor.type === 'character') {

            console.log("actor is a character");
            console.log("Dropped item data:", itemData);
            console.log("Actor items:", this.actor.items);

            // Validate itemData to ensure it has the required structure
            if (!itemData.name || !itemData.type || !itemData.system) {
                console.error("Invalid item data detected. Skipping creation.", itemData);
                return;
            }

            // Prevent duplication of items embedded in class or calling
            // This is not really a good way to do this, but it works for now
            if (
                    (   itemData.type == "equipment" ||
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
        const callingItem = this.actor.proxy.calling;
        const classItem = this.actor.proxy.class;
        data.user = game.user;
        data.pronouns = this.actor.system.pronouns || "";
        data.ancestry = this.actor.system.ancestry || "";
        data.callingItem = callingItem;
        data.classItem = classItem;
        data.showTextboxesBelowItems = game.settings.get('heart', 'showTextboxesBelowItems');
        data.showTotalStress = game.settings.get('heart', 'showTotalStress');
        data.showStressInputBox = game.settings.get('heart', 'showStressInputBox');
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        this.heartTabs = new HeartTabs({
            navSelector: ".character-nav-tabs a",
            contentSelector: ".tab-content .tab",
            initial: "character"
        });
        this.heartTabs.bind(html);

        html.find('.ordered-checkable-box:not(.checked)').click(ev => {
            ev.preventDefault();
            const element = ev.currentTarget;
            const index = parseInt(element.dataset.index);
            const parent = element.parentElement;
            const target = parent.dataset.target;

            const data = {};
            data[target] = index + 1;
            this.actor.update(data);
        });

        html.find('.ordered-checkable-box.checked').click(ev => {
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