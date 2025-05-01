import HeartItemBase from "./base-item.mjs";
import { PseudoEmbeddedCollectionField } from "./common.mjs";
import migrations  from "./migrations/item-calling-migrations.mjs";

export default class HeartCalling extends HeartItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;

    const schema = super.defineSchema();
    schema.items = new PseudoEmbeddedCollectionField(foundry.documents.BaseItem);
    schema.questions = new fields.ArrayField(new fields.SchemaField({
      question: new fields.StringField(),
      answer: new fields.StringField(),
    }));

    return schema;
  }

  static get migrations() {
    return migrations;
  }
}
