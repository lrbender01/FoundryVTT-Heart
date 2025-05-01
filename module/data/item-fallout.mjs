import HeartItemBase from "./base-item.mjs";
import { ResistanceField, ListItemField } from "./common.mjs";
import migrations from "./migrations/item-fallout-migrations.mjs";

export default class HeartClass extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    schema.resistance = new ResistanceField();
    schema.type = new ListItemField(CONFIG.HEART.fallout_types, {
      label: "HEART.common.type"
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }

  prepareDerivedData() {
    this.resistance_label = game.i18n.localize(
      CONFIG.HEART.resistances[this.resistance]
    );
    this.type_label = game.i18n.localize(CONFIG.HEART.fallout_types[this.type]);
  }
}
