import HeartItemBase from "./base-item.mjs";
import migrations  from "./migrations/item-ability-migrations.mjs";
import { ListItemField } from "./common.mjs";

export default class HeartBeat extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();

    delete schema.description;
    schema.type = new ListItemField(CONFIG.HEART.beat_types, {
      label: "HEART.common.type",
    });

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
