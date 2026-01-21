import { HeartItemSheet } from "./base.js";
import { domains, abilitiesLong } from "../../util.js";

export class AbilitySheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/ability/index.hbs",
      templates: [
        "systems/heart/templates/items/ability/index.hbs",
        "systems/heart/templates/items/ability/preview.hbs",
      ],
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.subTypeLabel = abilitiesLong[this.document.system.type];
    context.domains = domains;
    return context;
  }
}
