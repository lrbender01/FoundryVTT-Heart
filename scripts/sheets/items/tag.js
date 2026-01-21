import { HeartItemSheet } from "./base.js";
import { domains, dieSizes } from "../../util.js";

export class TagSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/tag/index.hbs",
    },
  };
}
