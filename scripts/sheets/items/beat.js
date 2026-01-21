import { HeartItemSheet } from "./base.js";
import { beats, beatsLong } from "../../util.js";

export class BeatSheet extends HeartItemSheet {
  static PARTS = {
    body: {
      id: "body",
      template: "systems/heart/templates/items/beat/index.hbs",
    },
  };

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.subTypeLabel = beatsLong[this.document.system.type];
    context.beats = beats;
    return context;
  }
}
