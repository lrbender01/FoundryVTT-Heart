import { HeartApplicationMixin } from "./common.mjs";

export class HeartBasicItemSheet extends HeartApplicationMixin(
  foundry.applications.sheets.ItemSheetV2
) {
  static PARTS = {
    header: super.PARTS.header,
    description: {
      template: "systems/heart/templates/item/basic/parts/description.hbs",
    },
    domain: {
      template: "systems/heart/templates/item/basic/parts/domain.hbs",
    },
    skill: {
      template: "systems/heart/templates/item/basic/parts/skill.hbs",
    },
    type: {
      template: "systems/heart/templates/item/basic/parts/type.hbs",
    },
    questions: {
      template: "systems/heart/templates/item/basic/parts/questions.hbs",
    },
    resistances: {
      template: "systems/heart/templates/item/basic/parts/resistances.hbs",
    },
    die_size: {
      template: "systems/heart/templates/item/basic/parts/die_size.hbs",
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
    context = await super._preparePartContext(partId, context);

    switch (partId) {
      case "description":
        context = {};
        context.label = this.document.system.schema.fields.description.label;
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.document.system.description,
            { secrets: this.document.isOwner }
          );
        context.fieldPath = "system.description";
        break;
      case "domain":
        context = {};
        context.domain = this.document.system.domain;
        context.domains = CONFIG.HEART.domains;
        break;
      case "skill":
        context = {};
        context.skill = this.document.system.skill;
        context.skills = CONFIG.HEART.skills;
        break;
      case "type":
        context = {};
        context.type = this.document.system.type;
        switch (this.document.type) {
          case "ability":
            context.types = CONFIG.HEART.ability_types;
            break;
          case "beat":
            context.types = CONFIG.HEART.beat_types;
            break;
          case "equipment":
            context.types = CONFIG.HEART.equipment_types;
            break;
          case "fallout":
            context.types = CONFIG.HEART.fallout_types;
            break;
          default:
            throw `Unexpected document type "${this.document.type}" for getting context for system.type parts`;
        }
        break;
      case "questions":
        context = {};
        context.questions = this.document.system.questions;
        context.show_answers = this.document.parent !== null;
        break;
      case "die_size":
        context = {};
        context.die_size = this.document.system.die_size;
        context.die_sizes = CONFIG.HEART.die_sizes;
        break;
      case "resistances":
        context = {};
        context.selected = this.document.system.resistances;
        context.choices = CONFIG.HEART.resistances;
        break;
    }
    return context;
  }
}
