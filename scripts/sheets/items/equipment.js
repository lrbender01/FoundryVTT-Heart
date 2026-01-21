import { HeartItemSheet } from "./base.js";
import { equipment, dieSizes, resistances } from "../../util.js";

export class EquipmentSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/equipment/index.hbs",
      templates: [
        "systems/heart/templates/items/equipment/index.hbs",
        "systems/heart/templates/items/tag/preview.hbs",
      ],
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.equipment = equipment;
    context.dieSizes = dieSizes;
    context.resistances = resistances;
    return context;
  }
}
