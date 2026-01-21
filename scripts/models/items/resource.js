import { ItemDataModel } from "./item.js";
import { dieSizes, domains } from "../../util.js";
const { ArrayField, BooleanField, DocumentUUIDField, StringField } =
  foundry.data.fields;

export class ResourceDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // description: new HTMLField({required: true }),
      consumed: new BooleanField({ initial: false }),
      dieSize: new StringField({ choices: dieSizes }),
      domain: new StringField({ choices: domains }),
      tags: new ArrayField(new DocumentUUIDField({type: "Item"})),
    };
  }
}
