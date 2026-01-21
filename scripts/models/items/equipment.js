import { ItemDataModel } from "./item.js";
import { dieSizes, resistances, equipment } from "../../util.js";
const { ArrayField, DocumentUUIDField, HTMLField, StringField } =
  foundry.data.fields;

export class EquipmentDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({ required: true }),
      dieSize: new StringField({ choices: dieSizes }),
      resistances: new ArrayField(
        new StringField({
          choices: resistances,
        })
      ),
      type: new StringField({
        required: true,
        choices: equipment,
      }),
      tags: new ArrayField(new DocumentUUIDField({type: "Item"})),
    };
  }
}
