import { ActorDataModel } from "./actor.js";
import { domains, dieSizes } from "../../util.js";
const { ArrayField, HTMLField, NumberField, StringField } = foundry.data.fields;

export class DelveDataModel extends ActorDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      descripton: new HTMLField(),
      connection: new StringField(),
      domains: new ArrayField(new StringField({ choices: domains })),
      events: new ArrayField(new StringField({})),
      notes: new HTMLField(),
      resistance: new NumberField({ integer: true, initial: 0 }),
      resistanceMax: new NumberField({ integer: true, initial: 5 }),
      stress: new StringField({ choices: dieSizes }),
      tier: new StringField(),
    };
  }
}
