import { ItemDataModel } from "./item.js";
import { resistances } from "../../util.js";
const { HTMLField, StringField } = foundry.data.fields;

export const types = {
  "minor": "heart.common.minor",
  "major": "heart.common.major",
  "zenith": "heart.common.zenith",
};

export class HauntDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({required: true }),
      resistance: new StringField({ choices: resistances }),
      upgradeTrack: new StringField(),
    };
  }
}
