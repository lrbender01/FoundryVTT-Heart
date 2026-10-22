import './sheet.sass';
import HeartSheetMixin from '../../common/sheet';
import { heartDialogOptions } from '../../common/dialog';
import { removalLoss, confirmRemoval } from '../../items/removal';
import { actorDropRefusal, draggableRowUuid, rowItemId } from '../../common/drops';
import { showsLimitedSheet } from '../../common/gm-notes';
import { newItemName } from '../../common/localize';
import limitedHTML from './limited.html';

// The cut-down sheet for a Limited viewer of an adversary, landmark, or
// delve (Luke, 2026-10-21; common/gm-notes.js)
export const LIMITED_SHEET = limitedHTML.path;

export default class HeartActorSheet extends HeartSheetMixin(ActorSheet) {
    // (no template of its own since 2026-10-21, Luke: every registered actor
    // sheet names its own; the unused base page went)
    static get type() { return 'base'; }

    // Whether this user gets the cut-down sheet (name, picture, public
    // description); the sheets with GM Notes check it in their template
    // and rich-text getters
    get limitedView() {
        return showsLimitedSheet(this.actor, game.user);
    }

    get img() {
        return this.default_img;
    }

    // Every Heart actor sheet's drop ends here (each type's own rules run
    // first and call super). Only clear mistakes are refused (2026-10-02,
    // common/drops.js): a class, calling, or ancestry off a character, a tag
    // on an actor, a haunt off a landmark.
    async _onDropItemCreate(itemData) {
        const list = (Array.isArray(itemData) ? itemData : [itemData]).filter(Boolean);
        const kept = [];
        for (const data of list) {
            const reason = actorDropRefusal(this.actor.type, data.type);
            if (!reason) {
                kept.push(data);
                continue;
            }
            ui.notifications.warn(game.i18n.format(`heart.drop.refused-actor.${reason}`, {
                item: data.name ?? '',
                actor: this.actor.name,
            }));
        }
        if (!kept.length) return [];
        return super._onDropItemCreate(Array.isArray(itemData) ? kept : kept[0]);
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

          // a Fallout "+" opens the Fallout picker (2026-10-01, Luke: one
          // picker wherever Fallout goes; Write your own makes a blank one)
          if (type === 'fallout' && game.heart.fallout?.pick) {
            game.heart.fallout.pick({ target: this.actor, severity: 'minor', resistance: this.actor.type === 'hireling' ? 'bond' : '' });
            return;
          }

          const doc = new CONFIG.Item.documentClass({
              type,
              name: newItemName(type),
              system: itemData
          });

          this.actor.createEmbeddedDocuments('Item', [doc.toObject()]);
        });

        html.find('[data-action=view]').click(async ev => {
          const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
          const item = await fromUuid(uuid);
          item?.sheet.render(true);
        });

        html.find('[data-action=delete]').click(async ev => {
            const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            if (!item) return;
            // a class, calling, or ancestry with the character's work in it
            // asks once, saying what goes with it (items/removal.js)
            if (removalLoss(item)) {
                if (await confirmRemoval(item)) await item.delete();
                return;
            }
            await item.deleteDialog(heartDialogOptions());
        });

        html.find('[data-action=item-roll]').click(async ev => {
          const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
          const item = await fromUuid(uuid);
          if (!item) return;

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

          // no flavor (Luke, 2026-10-21): the card already shows the item's
          // icon and escaped name, and a flavor built from the name ran any
          // markup typed into it on every client
          roll.toMessage({ speaker: {actor: this.actor.id} });
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
        
        

        // Switch a row's item on or off, or finish it. A row whose item is
        // gone (a stale render) does nothing (Luke, 2026-10-21: these threw).
        // (open-compendium and open-type-compendium went 2026-10-21: no
        // template had them; the slots open the Choose window)
        const setField = (action, changes) => html.find(`[data-item-id] [data-action=${action}]`).click(async ev => {
            const uuid = $(ev.currentTarget).closest('[data-item-id]').data('itemId');
            const item = await fromUuid(uuid);
            await item?.update(changes);
        });
        setField('activate', { 'system.active': true });
        setField('deactivate', { 'system.active': false });
        setField('complete', { 'system.complete': true });
        setField('uncomplete', { 'system.complete': false });
    }

    // A row's drag carries the item's own drag data (its uuid), so a drop
    // back on the same actor sorts instead of making a copy (Luke,
    // 2026-10-21, S5: the panel sheets sent a copy with no uuid, and every
    // drop on the sheet created a duplicate). A drop on another actor or the
    // sidebar still copies it, as before. One copy for every actor sheet
    // (the character sheet's own went). A class's or calling's child row,
    // a tab link, or a content link drags nothing (common/drops.js).
    async _onDragStart(event) {
        const li = event.currentTarget;
        if (event.target?.classList?.contains('content-link')) return;
        const uuid = draggableRowUuid(li.dataset.itemId);
        if (!uuid) return;
        const item = await fromUuid(uuid);
        if (!item) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
    }

    // Foundry's sort reads item ids from data-item-id; Heart's rows carry
    // uuids, so its own sort found no target and threw. The same sort, by
    // the rows' item ids (common/drops.js rowItemId).
    async _onSortItem(event, itemData) {
        const items = this.actor.items;
        const source = items.get(itemData?._id);
        const dropTarget = event.target?.closest?.('[data-item-id]');
        if (!source || !dropTarget) return;
        const target = items.get(rowItemId(dropTarget.dataset.itemId));
        if (!target || target.id === source.id) return;
        const siblings = [...(dropTarget.parentElement?.children ?? [])]
            .map(el => items.get(rowItemId(el.dataset?.itemId)))
            .filter(i => i && i.id !== source.id);
        const updates = SortingHelpers.performIntegerSort(source, { target, siblings })
            .map(u => ({ ...u.update, _id: u.target.id }));
        return this.actor.updateEmbeddedDocuments('Item', updates);
    }
}