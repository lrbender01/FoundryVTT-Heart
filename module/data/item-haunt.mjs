import HeartItemBase from "./base-item.mjs";
import { ResistancesField, DieSizeField} from "./common.mjs";
import migrations  from "./migrations/item-haunt-migrations.mjs";

export default class HeartHaunt extends HeartItemBase {
  static defineSchema() {
    const schema = super.defineSchema();
    schema.die_size = new DieSizeField();
    schema.resistances = new ResistancesField();
    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
