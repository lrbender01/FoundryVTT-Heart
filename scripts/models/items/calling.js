import { ItemDataModel } from "./item.js";
const { HTMLField, DocumentUUIDField, ArrayField, SchemaField } = foundry.data.fields;

export class CallingDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({ required: true }),
      questions: new ArrayField(new SchemaField({
        question: new HTMLField(),
        answer: new HTMLField(),
      })),
      ability: new DocumentUUIDField({type: "Item"}),
      beats: new ArrayField(new DocumentUUIDField({type: "Item"})),
    };
  }

  get inheritableUuids() {
    return {
      ability: this.ability,
      beats: this.beats
    };
  }
}