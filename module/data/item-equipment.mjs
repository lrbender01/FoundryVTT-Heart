import HeartItemBase from "./base-item.mjs";
import {
  DieSizeField,
  ResistancesField,
  ListItemField,
  PseudoEmbeddedCollectionField,
} from "./common.mjs";
import migrations  from "./migrations/item-equipment-migrations.mjs";

export default class HeartEquipment extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    schema.die_size = new DieSizeField();
    schema.items = new PseudoEmbeddedCollectionField(foundry.documents.BaseItem);
    schema.resistances = new ResistancesField();
    schema.type = new ListItemField(CONFIG.HEART.equipment_types, {
      label: "HEART.common.type"
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }

  prepareDerivedData() {
    this.die_size_label = game.i18n.localize(CONFIG.HEART.die_sizes[this.die_size]);
    this.resistance_labels = this.resistances.reduce(
      (out, resistance) => {
        out[resistance] = game.i18n.localize(
          CONFIG.HEART.resistances[resistance]
        );
        return out;
      },
      {}
    );
    this.type_label =  game.i18n.localize(CONFIG.HEART.equipment_types[this.type]);
  }
}
