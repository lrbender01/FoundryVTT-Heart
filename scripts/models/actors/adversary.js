import { ActorDataModel } from "./actor.js";
const { HTMLField, NumberField, StringField } = foundry.data.fields;

export class AdversaryDataModel extends ActorDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      descriptors: new StringField(),
      difficulty: new StringField(),
      motivation: new StringField(),
      names: new StringField(),
      notes: new HTMLField(),
      protection: new NumberField({ integer: true, initial: 0 }),
      resistance: new NumberField({ integer: true, initial: 0 }),
      resistanceMax: new NumberField({ integer: true, initial: 5 }),
      special: new HTMLField(),
    };
  }
}
