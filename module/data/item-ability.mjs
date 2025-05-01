import HeartItemBase from "./base-item.mjs";
import { PseudoEmbeddedCollectionField, ListItemField } from "./common.mjs";
import migrations  from "./migrations/item-ability-migrations.mjs";

export default class HeartAbility extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    schema.items = new PseudoEmbeddedCollectionField(foundry.documents.BaseItem);
    schema.type = new ListItemField(CONFIG.HEART.ability_types, {
      label: "HEART.Item.ability.type-label"
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
