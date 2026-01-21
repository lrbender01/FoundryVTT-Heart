import { HeartItemSheet } from "./base.js";

export class ClassSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/class/index.hbs",
      templates: [
        "systems/heart/templates/items/class/index.hbs",
        "systems/heart/templates/items/ability/preview.hbs",
        "systems/heart/templates/items/equipment/preview.hbs",
        "systems/heart/templates/items/resource/preview.hbs",
        "systems/heart/templates/items/tag/preview.hbs",
      ],
    },
  };
}
