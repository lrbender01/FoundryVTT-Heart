import './chat-message.sass';
import './ledger.sass';

class HeartChatMessage extends ChatMessage {
    get isRollRequest() {
        return this.getFlag('heart', 'roll-request') !== undefined;
    }

    get stressRoll() {
        if(this.rolls[0] instanceof game.heart.rolls.StressRoll) {
            return this.rolls[0];
        }

        const json = this.getFlag('heart', 'stress-roll');
        if (json === undefined) {
            return
        }
        const Roll = CONFIG.Dice.rolls.find(x => x.name === json.class);
        const roll = Roll.fromData(json);
        return roll;
    }

    async setStressRoll(roll) {
        const json = roll.toJSON()
        await this.setFlag('heart', 'stress-roll', json);
    }

    get showStressRollButton() {
        const showStressRollButton = this.getFlag('heart', 'show-stress-roll-button')
        if (this.stressRoll !== undefined) {
            return false;
        }
        if (showStressRollButton === undefined) {
            return true
        } else {
            return Boolean(showStressRollButton);
        }
    }

    set showStressRollButton(value) {
        return this.setFlag('heart', 'show-stress-roll-button', value);
    }

    get showTakeStressButton() {
        const showTakeStressButton = this.getFlag('heart', 'show-take-stress-button')
        if(this.stressRoll !== undefined) {
            if (showTakeStressButton === undefined) {
                return true
            } else {
                return Boolean(showTakeStressButton);
            }
        } else {
            return false;
        }
    }

    set showTakeStressButton(value) {
        return this.setFlag('heart', 'show-take-stress-button', value);
    }

    get falloutRoll() {
        if(this.rolls[0] instanceof game.heart.rolls.FalloutRoll) {
            return this.rolls[0];
        }

        const json = this.getFlag('heart', 'fallout-roll');
        if (json === undefined) {
            return
        }
        const Roll = CONFIG.Dice.rolls.find(x => x.name === json.class);
        const roll = Roll.fromData(json);
        return roll;
    }

    set falloutRoll(roll) {
        const json = roll.toJSON()
        this.setFlag('heart', 'fallout-roll', json);
        return
    }

    async setFalloutRoll(roll) {
        const json = roll.toJSON()
        await this.setFlag('heart', 'fallout-roll', json);
    }

    // Stress got through, so fallout may be rolled. Per character since
    // 2026-09-30 (the roller and each helper): who already rolled is in the
    // 'fallout-done' flag, and the stress card hides only their button.
    get showFalloutRollButton() {
        const showFalloutRollButton = this.getFlag('heart', 'show-fallout-roll-button')
        if (showFalloutRollButton === undefined) {
            return this.falloutRoll === undefined;
        }
        return Boolean(showFalloutRollButton);
    }

    get falloutDone() {
        return this.getFlag('heart', 'fallout-done') ?? [];
    }

    set showFalloutRollButton(value) {
        return this.setFlag('heart', 'show-fallout-roll-button', value);
    }

    get showClearStressButton() {
        const showClearStressButton = this.getFlag('heart', 'show-clear-stress-button')
        if (this.falloutRoll !== undefined) {
            if (showClearStressButton === undefined) {
                return this.falloutRoll.result == 'no-fallout' ? false : true;
            } else {
                return Boolean(showClearStressButton);
            }
        }
        return false;

    }

    set showClearStressButton(value) {
        return this.setFlag('heart', 'show-clear-stress-button', value);
    }

    async getHTML() {
        const html = await super.getHTML();

        if (this.isRoll && this.isContentVisible) {
            const content = await this.rolls[0].render({
                isPrivate: false,
                showStressRollButton: this.showStressRollButton,
                showTakeStressButton: this.showTakeStressButton,
                showFalloutRollButton: this.showFalloutRollButton,
                showClearStressButton: this.showClearStressButton,
                falloutDone: this.falloutDone,
            });
            html.find('.message-content').find('.dice-roll').html(
                $(content).children()
            );

            if (this.stressRoll && this.stressRoll !== this.rolls[0]) {
                const stressContent = await this.stressRoll.render({
                    isPrivate: false,
                    showTakeStressButton: this.showTakeStressButton,
                    showFalloutRollButton: this.showFalloutRollButton,
                    showClearStressButton: this.showClearStressButton,
                    falloutDone: this.falloutDone,
                });
                html.append(
                    $('<div class="message-content"></div>').append(stressContent)
                );
            }

            if (this.falloutRoll && this.falloutRoll !== this.rolls[0]) {
                const falloutContent = await this.falloutRoll.render({
                    isPrivate: false,
                    showClearStressButton: this.showClearStressButton,
                });
                html.append(
                    $('<div class="message-content"></div>').append(falloutContent)
                );
            }
        }

        if(this.isRollRequest) {
            const data = this.getFlag('heart', 'roll-request');
            const content = await renderTemplate('heart:applications/prepare-roll-request/chat-message.html', data);
            // inside the message body, like every ledger card (2026-09-30)
            const body = html.find('.message-content');
            (body.length ? body : html).append(content);
        }

        // Ledger cards: chained blocks (a stress roll under its Heart roll,
        // the fallout under that) get a rule above them. Every block keeps
        // its own hint line; the header is just the portrait and the name
        // (2026-09-30, round-2 mock B review)
        html.find('.ledger').slice(1).addClass('chained');

        return html;
    }
}

// applied to chat messages to allow dragging of previewed items
const dragDrop = new DragDrop({
    dragSelector: ".item",
    dropSelector: null,
    permissions: { dragstart: true, drop: false },
    callbacks: { dragstart: _onDragStart }
  });

// workaround for nested-children uuids not dragging properly
async function _onDragStart(event) {    
    const target = event.currentTarget;
    const uuid = target.dataset.itemId;
    const document = await fromUuid(uuid);
    const dragData = document.toDragData();
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
}

// The chat panel (and the sidebar around it) never scrolls: only the log
// inside it does. Foundry's scrollIntoView on the newest message scrolls
// every ancestor that has overflow, so content poking out of a card once
// pushed the whole panel up and squeezed the chat to the top of the screen
// until the card was deleted (2026-10-02, Luke). The cause is fixed in
// application.sass (.chip-toggle); this puts the panel back if anything,
// a module included, ever scrolls it again.
function pinChatPanel(html) {
    const panel = html?.[0] ?? html;
    for (const el of [panel, panel?.closest?.('#sidebar')]) {
        if (!el || el.dataset.heartPinned) continue;
        el.dataset.heartPinned = '1';
        el.addEventListener('scroll', () => {
            if (el.scrollTop || el.scrollLeft) {
                el.scrollTop = 0;
                el.scrollLeft = 0;
            }
        });
    }
}

function activateListeners(html) {

    html.on('click', 'form button', ev => {
        ev.preventDefault();
    });

    // Ledger cards (2026-09-30 review): a button in the card never reaches
    // Foundry's roll-card click, which toggles its tooltip on any click and
    // broke the layout
    html.on('click', '.ledger button', ev => ev.stopPropagation());

    html.on('click', 'form.roll-request [data-action=roll][data-character]', async (ev) => {
        const button = $(ev.currentTarget);
        const {
            character
        } = button.data();

        const form = button.closest('form.roll-request');
        const data = new FormData(form.get(0));

        // Everything is on the card, so no prompt; the pool rules (missing
        // skills, Tired / Clouded, helper checks) still apply
        const roll = await game.heart.rolls.HeartRoll.build({
            character: character,
            difficulty: data.get('difficulty') || 'standard',
            skill: data.get('skill') || null,
            domain: data.get('domain') || null,
            mastery: data.get('mastery') === "on",
            helpers: data.getAll('helper'),
        });
        if (!roll) return;

        await roll.toMessage({speaker: ChatMessage.getSpeaker({ actor: game.actors.get(character) })});
    });

    // delegated (2026-09-30 review): previews posted after the log first
    // rendered never got a handler when this bound once with html.find
    html.on('click', '[data-item-id] [data-action=view]', async ev => {
        ev.preventDefault();
        const target = $(ev.currentTarget);
        const uuid = target.closest('[data-item-id]').data('itemId');
        const item = await fromUuid(uuid);
        item.sheet.render(true);
    });

    dragDrop.bind(html.get(0));
}

// Overridden so Item content links render as draggable item previews (the
// chat log's dragDrop above picks them up) instead of plain anchors.
//
// Hardened 2026-09-29: the upstream WIP only handled @Item[...] and the
// legacy @Compendium[...] forms. An @UUID[...] link - which is what
// RollTable draws and every modern journal link emit - fell through with no
// document and threw on `doc.documentName`, killing enrichment for the whole
// message. Now every link type resolves via fromUuid; anything that is not a
// resolvable Item with a preview partial falls back to Foundry's default.
class HeartTextEditor extends TextEditor {
    static async _createContentLink(match, { relativeTo } = {}) {
        const [type, target] = match.slice(1, 3);

        let doc = null;
        try {
            switch (type) {
                case "UUID":
                    doc = await fromUuid(target, { relative: relativeTo });
                    break;
                case "Compendium":
                    doc = await fromUuid(`Compendium.${target}`);
                    break;
                case "Item":
                    doc = await fromUuid(`Item.${target}`);
                    break;
            }
        } catch (err) {
            console.warn(`heart | could not resolve content link ${type}[${target}]`, err);
            doc = null;
        }

        const partial = doc?.documentName === "Item"
            ? Handlebars.partials[`heart:items/${doc.type}/preview.html`]
            : undefined;
        if (partial) {
            try {
                return await this._renderItemPreview(doc, partial);
            } catch (err) {
                console.warn(`heart | item preview failed for ${doc.uuid}; using the default link`, err);
            }
        }

        return super._createContentLink(match, { relativeTo });
    }

    static async _renderItemPreview(item, partial) {
        const data = await item.sheet.getData();
        const innerHTML = partial(data, {
            allowedProtoProperties: {
                uuid: true,
                childrenTypes: true,
                isOwner: true
            }
        });
        const div = document.createElement('div');
        div.innerHTML = innerHTML;
        div.classList.add('heart', 'sheet');
        return div;
    }
}



export function initialise() {
    console.log('heart | Registering ChatMessage');
    CONFIG.ChatMessage.documentClass = HeartChatMessage;
    TextEditor = HeartTextEditor;

    // every render (2026-10-02): a re-drawn log or a second chat popout is
    // new markup that needs its handlers (the roll cards bind the same way)
    Hooks.on('renderChatLog', (app, html, data) => {
        activateListeners(html);
        pinChatPanel(html);
    });
    Hooks.on('renderChatPopout', (app, html, data) => activateListeners(html));
}