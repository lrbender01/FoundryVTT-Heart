import { ItemDataModel } from "./item.js";
const { HTMLField, NumberField } = foundry.data.fields;

export class TagDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({required: true }),
      limitedUses: new NumberField({ integer: true }),
    };
  }

  static migrateData(source) {
    delete source.effects;
  }
}
