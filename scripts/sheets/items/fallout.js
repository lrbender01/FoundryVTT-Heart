import { HeartItemSheet } from "./base.js";
import { fallouts, beatsLong } from "../../util.js";

export class FalloutSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/fallout/index.hbs",
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.subTypeLabel = beatsLong[this.document.system.type];
    context.fallouts = fallouts;
    return context;
  }
}
