import { ItemDataModel } from "./item.js";
import { abilities } from "../../util.js";
const { DocumentUUIDField, ArrayField, HTMLField, StringField } =
  foundry.data.fields;

export class AbilityDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({ required: true }),
      minorAbilities: new ArrayField(
        new DocumentUUIDField({type: "Item"}),
      ),
      type: new StringField({
        required: true,
        choices: abilities,
      }),
    };
  }

  get inheritableUuids() {
    return {
      minorAbilities: this.minorAbilities
    };
  }
}
