import { HeartItemSheet } from "./base.js";
import { domains, dieSizes } from "../../util.js";

export class ResourceSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/resource/index.hbs",
      templates: [
        "systems/heart/templates/items/resource/index.hbs",
        "systems/heart/templates/items/tag/preview.hbs",
      ],
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.domains = domains;
    context.dieSizes = dieSizes;
    return context;
  }
}
