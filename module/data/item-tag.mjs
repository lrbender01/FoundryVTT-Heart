import HeartItemBase from "./base-item.mjs";
import migrations  from "./migrations/item-tag-migrations.mjs";

export default class HeartTag extends HeartItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.uses = new fields.NumberField({ initial: 0, integer: true, label: "HEART.Item.tag.uses" });
    return schema;
  }

  static get migrations() {
    return migrations;
  }

  prepareDerivedData() {
    this.uses_label = game.i18n.localize('HEART.Item.tag.limited');
  }
}
