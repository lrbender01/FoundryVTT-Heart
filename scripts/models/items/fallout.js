import { ItemDataModel } from "./item.js";
import { resistances, fallouts } from "../../util.js";
const { HTMLField, StringField } = foundry.data.fields;


export class FalloutDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({required: true }),
      resistance: new StringField({ choices: resistances }),
      type: new StringField({ choices: fallouts }),
    };
  }
}
