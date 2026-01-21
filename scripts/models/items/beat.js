import { ItemDataModel } from "./item.js";
import { beats } from "../../util.js";
const { HTMLField, StringField } = foundry.data.fields;

export class BeatDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({ required: true }),
      type: new StringField({
        required: true,
        choices: beats,
      }),
    };
  }
}
