import './sheet.sass';
import sheetHTML from './sheet.html';
import HeartSheetMixin from '../../common/sheet';
import { iconFor } from '../../common/icons';
import { heartDialogOptions } from '../../common/dialog';

export default class HeartActorSheet extends HeartSheetMixin(ActorSheet) {
    static get type() { return 'base'; }

    get template() {
        return sheetHTML.path;
    }

    get img() {
        return this.default_img;
    }

    getData() {
        const data = super.getData();

        const items = {};
        Object.keys(CONFIG.Item.typeLabels).forEach((type) => {
            items[type] = [];
        });

        this.actor.items.forEach((item) => {
            items[item.type].push(item);
        });

        data.heart = items;
        data.system = this.actor.system;

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action=add][data-type]').click(ev => {
          const target = $(ev.currentTarget);
          const type = target.data('type');
          const itemData = target.data('data') || {};

          const doc = new CONFIG.Item.documentClass({
              type,
              name: `New ${type}`,
              system: itemData
          });

          this.actor.createEmbeddedDocuments('Item', [doc.toObject()]);
        });

        html.find('[data-action=view]').click(async ev => {
          const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
          const item = await fromUuid(uuid);
          item.sheet.render(true);
        });

        html.find('[data-action=delete]').click(async ev => {
            const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item.deleteDialog(heartDialogOptions());
        });

        html.find('[data-action=item-roll]').click(async ev => {
          const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
          const item = await fromUuid(uuid);

          let rollOptions = {'stepIncrease': false, 'stepDecrease': false};

          if (ev.shiftKey) {
            rollOptions.stepIncrease = true;
          }
          if (ev.altKey) {
            rollOptions.stepDecrease = true;
          }
          if (ev.altKey && ev.shiftKey) {
            rollOptions = {'stepIncrease': false, 'stepDecrease': false};
          }

          const roll = game.heart.rolls.ItemRoll.build({item}, {}, rollOptions);

          await roll.evaluate();

          roll.toMessage({
              // the item's own icon leads the card (2026-09-30)
              flavor: `${iconFor(item.img)}${localizeHeart(item.name)} (<span class="item-type">${item.type}</span>)`,
              speaker: {actor: this.actor.id}
          });
        });
      
        // Heart rolls (2026-09-30 rebuild): every entry point opens the
        // actor-aware roll prompt, preselecting what was clicked. A knack is
        // shown there as a suggestion, never forced as mastery (HCB p.9).
        // Closing the prompt posts nothing. Dice So Nice animates the pool as
        // the card is created (roll.toMessage).
        const heartRoll = async (preset = {}) => {
            const roll = await game.heart.rolls.HeartRoll.build({ character: this.actor.id, ...preset });
            if (!roll) return;
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        };

        html.find('[data-action=roll]').click(ev => {
            ev.preventDefault();
            heartRoll();
        });

        html.find('[data-action=stress-roll]').click(async ev => {
            ev.preventDefault();
            const resistance = ev.currentTarget.dataset.resistance || undefined;
            const roll = await game.heart.rolls.StressRoll.build({ character: this.actor.id, resistance });
            if (!roll) return;
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        });

        html.find('[data-action=skill-roll]').click(ev => {
            ev.preventDefault();
            heartRoll({ skill: ev.currentTarget.dataset.skill });
        });

        html.find('[data-action=domain-roll]').click(ev => {
            ev.preventDefault();
            heartRoll({ domain: ev.currentTarget.dataset.domain });
        });
        
        

        html.find('[data-item-id] [data-action=activate]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            item.update({'system.active': true});
        });

        html.find('[data-item-id] [data-action=deactivate]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            item.update({'system.active': false});
        });

        html.find('[data-item-id] [data-action=complete]').click(async ev => {
          const target = $(ev.currentTarget);
          const uuid = target.closest('[data-item-id]').data('itemId');
          const item = await fromUuid(uuid);
          item.update({'system.complete': true});
        });

        html.find('[data-item-id] [data-action=uncomplete]').click(async ev => {
            const target = $(ev.currentTarget);
            const uuid = target.closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            item.update({'system.complete': false});
        });

        html.find('[data-action=open-compendium]').click(async ev => {
            // Get the compendium name from the data-compendium attribute
            const target = $(ev.currentTarget);

            const compendiumName = target.data('compendium'); // e.g., "heart.items"
        
            if (!compendiumName) {
                console.error("No compendium name specified in the data-compendium attribute.");
                return;
            }
        
            // Retrieve the compendium
            const pack = game.packs.get(compendiumName);
        
            if (!pack) {
                console.error(`Compendium '${compendiumName}' not found.`);
                return;
            }
        
            // Render the compendium
            pack.render(true);
        });

        // Like open-compendium, but opens EVERY Item compendium that provides
        // the given item type instead of a hardcoded pack id - so "Select a
        // Class" shows the core book AND Ways & Means packs together
        // (2026-09-29), and content modules can supply types the system
        // doesn't ship packs for (e.g. ancestries).
        html.find('[data-action=open-type-compendium]').click(async ev => {
            const type = $(ev.currentTarget).data('itemType');
            if (!type) {
                console.error("No item type specified in the data-item-type attribute.");
                return;
            }

            let opened = 0;
            for (const pack of game.packs) {
                if (pack.metadata.type !== 'Item') continue;
                if (!pack.visible) continue;
                const index = await pack.getIndex();
                if (index.some(entry => entry.type === type)) {
                    pack.render(true);
                    opened++;
                }
            }
            if (opened > 0) return;

            ui.notifications.warn(`No compendium provides "${type}" items. Enable a content module that ships them.`);
        });
    }

    async _onDragStart(event) {
        const li = event.currentTarget;
        if (event.target.classList.contains("content-link")) return;

        // Create drag data
        let dragData = {
            actorId: this.actor.id,
            sceneId: this.actor.isToken ? canvas.scene?.id : null,
            tokenId: this.actor.isToken ? this.actor.token.id : null,
            pack: this.actor.pack
        };

        // Owned Items
        if (li.dataset.itemId) {
            const item = await fromUuid(li.dataset.itemId);
            dragData.type = "Item";
            dragData.data = item.toObject();
            // Delete _id so that when dropped in Item panel Foundry knows to create a new Item
            delete dragData.data._id;
        }

        // Active Effect
        if (li.dataset.effectId) {
            const effect = this.actor.heart_effects.get(li.dataset.effectId);
            dragData.type = "ActiveEffect";
            dragData.data = effect.data;
        }

        // Set data transfer
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
}