const { DocumentSheetV2, HandlebarsApplicationMixin } =
  foundry.applications.api;
import { items } from "../../util.js";

export class HeartItemSheet extends HandlebarsApplicationMixin(
  DocumentSheetV2
) {
  static DEFAULT_OPTIONS = {
    classes: ["heart"],
    tag: "form",
    position: {
      width: 700
    },
    window: {
      resizable: true
    }
  };
  static PARTS = {
    content: {
      id: "content",
      template: "systems/heart/templates/items/resource/index.hbs",
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.typeLabel = items[this.document.type];
    return context;
  }

  get title() {
    return this.document.name || this.document.id;
  }
}
