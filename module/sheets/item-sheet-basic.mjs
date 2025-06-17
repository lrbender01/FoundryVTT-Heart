import { HeartApplicationMixin } from "./common.mjs";

export class HeartBasicItemSheet extends HeartApplicationMixin(
  foundry.applications.sheets.ItemSheetV2
) {
  static PARTS = {
    header: super.PARTS.header,
    description: {
      template: "systems/heart/templates/item/basic/parts/description.hbs",
    },
    items: super.PARTS.items,
  };

  static TYPE_PARTS = {
    ability: ["header", "description", "type", "items"],
    beat: ["header", "type"],
    calling: ["header", "description", "questions", "items"],
    class: ["header", "description", "domain", "skill", "items"],
    equipment: [
      "header",
      "description",
      "type",
      "die_size",
      "resistances",
      "items",
    ],
    fallout: ["header", "description", "type", "resistance"],
    haunt: ["header", "description", "die_size", "resistances"],
    resource: ["header", "description", "domain", "die_size", "items"],
    tag: ["header", "description", "uses"],
  };


  async _preparePartContext(partId, context) {
    context = super._prepareContext(partId, context);

    switch (partId) {
      case "description":
        context = {};
        context.label = this.document.system.schema.fields.notes.label;
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.document.system.description,
            { secrets: this.document.isOwner }
          );
        context.fieldPath = "system.description";
        break;
    }
    return context;
  }
}
