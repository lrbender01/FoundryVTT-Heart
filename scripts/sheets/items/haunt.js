import { HeartItemSheet } from "./base.js";
import { resistances, dieSizes } from "../../util.js";

export class HauntSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/haunt/index.hbs",
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.resistances = resistances;
    context.dieSizes = dieSizes;
    return context;
  }
}
