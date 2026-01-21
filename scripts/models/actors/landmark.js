import { ActorDataModel } from "./actor.js";
import { domains, dieSizes } from "../../util.js";
const { ArrayField, HTMLField, StringField } = foundry.data.fields;

export class LandmarkDataModel extends ActorDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField(),
      domains: new ArrayField(new StringField({ choices: domains })),
      potentialPlots: new StringField(),
      specialRules: new HTMLField(),
      stress: new StringField({ choices: dieSizes }),
      tier: new StringField(),
    };
  }
}
