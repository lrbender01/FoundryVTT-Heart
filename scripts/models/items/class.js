import { ItemDataModel } from "./item.js";
import { domains, skills } from "../../util.js";
const {
  DocumentUUIDField,
  HTMLField,
  ArrayField,
  StringField,
} = foundry.data.fields;

export class ClassDataModel extends ItemDataModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new HTMLField({ required: true }),
      resources: new ArrayField(new DocumentUUIDField({type: "Item"})),
      equipment: new ArrayField(new DocumentUUIDField({type: "Item"})),
      equipmentGroup: new ArrayField(new DocumentUUIDField({type: "Item"})),
      equipmentGroups: new ArrayField(
        new ArrayField(new DocumentUUIDField({type: "Item"}))
      ),
      abilities: new ArrayField(new DocumentUUIDField({type: "Item"})),
      futureAbilities: new ArrayField(new DocumentUUIDField({type: "Item"})),
    };
  }

  get inheritableUuids() {
    return {
      resources: this.resources,
      equipment: this.equipment,
      abilities: this.abilities
    };
  }
}
