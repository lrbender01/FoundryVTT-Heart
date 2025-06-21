import { PseudoMixin } from "../data/pseudo.mjs";
import migrations from "../data/migrations/item-migrations.mjs";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class HeartItem extends PseudoMixin(Item) {
  static migrateData(source) {
    return super.migrateData(
      Object.entries(migrations)
        .filter(([version, _]) => {
          return foundry.utils.isNewerVersion(
            version,
            source._stats?.systemVersion ?? "0"
          );
        })
        .reduce((source, [_, migrator]) => {
          const out = migrator(source);
          Object.assign(source, out);
          return source;
        }, source)
    );
  }

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Convert the actor document to a plain object.
   *
   * The built in `toObject()` method will ignore derived data when using Data Models.
   * This additional method will instead use the spread operator to return a simplified
   * version of the data.
   *
   * @returns {object} Plain object either via deepClone or the spread operator.
   */
  toPlainObject() {
    const result = { ...this };

    // Simplify system data.
    result.system = this.system.toPlainObject();

    // Add effects.
    result.effects = this.effects?.size > 0 ? this.effects.contents : [];

    // Add collections & collections by type
    Object.entries(this.system.collections).forEach(([key, value]) => {
      result[key] = value?.size > 0 ? value.contents : [];
      const documentName = value.documentClass.documentName;
      const typesKey = `${documentName.toLowerCase()}Types`;
      result[typesKey] = this.typesKey;
    });

    return result;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get("core", "rollMode");
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? "",
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }

  getActiveItems() {
    return this.items.reduce((out, item) => {
      if(item.flags.heart.active) {
        out.push(item, ...item.getActiveItems());
      }
      return out;
    }, []);
  }
}
