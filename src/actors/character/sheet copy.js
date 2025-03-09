import sheetHTML from './sheet.html';
import './character.sass';
import HeartActorSheet from '../base/sheet';
import template from './template.json';

class Tabs {
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
            dragDrop: [{ dragSelector: '.item', dropSelector: null }]
        })
    }

    // workaround for nested-children uuids not dragging properly
    async _onDragStart(event) {
        const target = event.currentTarget;
        const uuid = target.dataset.itemId;
        const document = await fromUuid(uuid);
        const dragData = document.toDragData();
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }

    async _onDropItemCreate(itemData) {
        if (this.actor.type === 'character') {
            if (itemData.type === 'calling') {
                this.actor.itemTypes.calling.forEach(item => {
                    item.delete();
                });
            }

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
        return 'systems/heart/assets/d10.svg';
    }

    getData() {
        const data = super.getData();
        const callingItem = this.actor.proxy.calling;
        const classItem = this.actor.proxy.class;
        data.user = game.user;
        data.callingItem = callingItem;
        data.classItem = classItem;
        data.showTextboxesBelowItems = game.settings.get('heart', 'showTextboxesBelowItems');
        data.showTotalStress = game.settings.get('heart', 'showTotalStress');
        data.showStressInputBox = game.settings.get('heart', 'showStressInputBox');
        return data;
    }

    activateListeners(html) {

        super.activateListeners(html);

        console.log("TAAAABS");
        //console.log(html[0].find(".sheet-tabs a"));

        // Activate Listeners for Tabs
        // this.sheetTabs = new Tabs({
        //     navSelector: ".sheet-tabs a",       // Targets the individual <a> elements
        //     contentSelector: ".tab-content .tab", // Targets each content section
        //     initial: "main"                      // The data-tab value to show by default
        // });
        // this.sheetTabs.bind(html[0]);

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
    }
}