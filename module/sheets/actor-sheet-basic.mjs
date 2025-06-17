import { HeartActorSheet } from "./actor-sheet.mjs";

export class HeartBasicActorSheet extends HeartActorSheet {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.window.contentClasses = ["basic"];
    return DEFAULT_OPTIONS;
  }

  static PARTS = {
    header: super.PARTS.header,
    resistances: {
      template: "systems/heart/templates/actor/basic/parts/resistances.hbs",
    },
    domains: {
      template: "systems/heart/templates/actor/basic/parts/domains.hbs",
    },
    skills: {
      template: "systems/heart/templates/actor/basic/parts/skills.hbs",
    },
    notes: {
      template: "systems/heart/templates/actor/basic/parts/notes.hbs",
    },
    items: super.PARTS.items,
  };

  static TYPE_PARTS = {
    adversary: [
      "header",
      "names",
      "descriptors",
      "motivation",
      "difficulty",
      "resistance",
      "protection",
      "special",
      "domains",
    ],
    character: ["header", "resistances", "domains", "skills", "notes", "items"],
    delve: [
      "header",
      "route",
      "tiers",
      "domains",
      "stress",
      "resistance",
      "description",
    ],
    landmark: [
      "header",
      "domains",
      "tier",
      "resistance",
      "description",
      "special_rules",
      "base_stress",
      "potential_plots",
    ],
  };

  async _preparePartContext(partId, context) {
    context.document = this.document;
    switch (partId) {
      case "resistances":
        context = {};
        context.resistances = Object.values(
          this.document.system.schema.fields.resistances.fields
        ).map((resistance) => {
          return {
            label: resistance.label,
            fieldPath: resistance.fieldPath,
            value: foundry.utils.getProperty(
              this.document,
              resistance.fieldPath + ".value"
            ),
            protection: foundry.utils.getProperty(
              this.document,
              resistance.fieldPath + ".protection"
            ),
          };
        });
        break;
      case "domains":
        context = {};
        context.domains = Object.values(
          this.document.system.schema.fields.domains.fields
        ).map((domain) => {
          return {
            label: domain.label,
            fieldPath: domain.fieldPath,
            value: foundry.utils.getProperty(
              this.document,
              domain.fieldPath + ".value"
            ),
            knack: foundry.utils.getProperty(
              this.document,
              domain.fieldPath + ".knack"
            ),
          };
        });
        break;
      case "skills":
        context = {};
        context.skills = Object.values(
          this.document.system.schema.fields.skills.fields
        ).map((skill) => {
          return {
            label: skill.label,
            fieldPath: skill.fieldPath,
            value: foundry.utils.getProperty(
              this.document,
              skill.fieldPath + ".value"
            ),
            knack: foundry.utils.getProperty(
              this.document,
              skill.fieldPath + ".knack"
            ),
          };
        });
        break;
      case "notes":
        context = {};
        context.label = this.document.system.schema.fields.notes.label;
        context.enrichedNotes =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.document.system.notes,
            { secrets: this.document.isOwner }
          );
        context.fieldPath = "system.notes";
        break;
      case "items":
        context = {};
        context.items = this.document.items.map((item) => {
          return {
            _id: item._id,
            type: item.type,
            name: item.name,
            editable: this.isEditable,
            deletable: item.parent instanceof Actor,
          };
        });
        break;
    }
    return context;
  }
}
