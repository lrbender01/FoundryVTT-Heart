import { HeartActorSheet } from "./actor-sheet.js"

export class HeartConciseActorSheet extends HeartActorSheet {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.window.contentClasses = ["standard-form", "actor"];
    DEFAULT_OPTIONS.actions = {
      "find-item": HeartActorSheet.findItem,
      "create-item": HeartActorSheet.createItem,
      "spawn-heart-roll-helper": HeartActorSheet.spawnHeartRollHelper,
      "toggle-view-mode": HeartActorSheet.toggleViewMode,
      "view-item": HeartActorSheet.viewItem,
      "delete-item": HeartActorSheet.deleteItem,
    };
    return DEFAULT_OPTIONS;
  }

  static PARTS = {
    header: {
      template: "systems/heart/templates/actor/parts/header.hbs",
    },
    toolbar: {
      template: "systems/heart/templates/actor/parts/toolbar.hbs",
      templates: [
        "systems/heart/templates/actor/parts/toolbar.hbs",
        "systems/heart/templates/parts/view-mode.hbs",
      ],
    },
    character_basics: {
      template: "systems/heart/templates/actor/parts/character-basics.hbs",
      templates: [
        "systems/heart/templates/actor/parts/character-basics.hbs",
        "systems/heart/templates/item/parts/base-item-micro.hbs",
        "systems/heart/templates/item/parts/item-placeholder.hbs",
      ],
    },
    character_resistances: {
      template: "systems/heart/templates/actor/parts/character-resistances.hbs",
    },
    character_domains: {
      template: "systems/heart/templates/actor/parts/character-domains.hbs",
    },
    character_skills: {
      template: "systems/heart/templates/actor/parts/character-skills.hbs",
    },
    adversary_fields: {
      template: "systems/heart/templates/actor/parts/adversary-fields.hbs",
      templates: [
        "systems/heart/templates/actor/parts/adversary-fields.hbs",
        "systems/heart/templates/parts/field-number.hbs",
        "systems/heart/templates/parts/field-string-array.hbs",
        "systems/heart/templates/parts/field-string.hbs",
      ],
    },
    delve_fields: {
      template: "systems/heart/templates/actor/parts/delve-fields.hbs",
      templates: [
        "systems/heart/templates/parts/field-editor.hbs",
        "systems/heart/templates/parts/field-number.hbs",
        "systems/heart/templates/parts/field-string-array.hbs",
      ],
    },
    landmark_fields: {
      template: "systems/heart/templates/actor/parts/landmark-fields.hbs",
      templates: [
        "systems/heart/templates/parts/field-editor.hbs",
        "systems/heart/templates/parts/field-number.hbs",
        "systems/heart/templates/parts/field-string-array.hbs",
        "systems/heart/templates/parts/field-string.hbs",
      ],
    },
    items: {
      template: "systems/heart/templates/parts/items.hbs",
      templates: ["systems/heart/templates/item/parts/base-item-micro.hbs"],
    },
  };

  static async findItem(_, target) {
    const type = target.dataset.type;
    game.heart.addItemMacro(this.document, [type], []);
  }

  static async createItem(_, target) {
    const type = target.dataset.type;
    const data = duplicate(target.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    delete itemData.system["type"];
    return await Item.create(itemData, { parent: this.document });
  }

  static async toggleViewMode() {
    this._view_mode = !this._view_mode;
    this.render();
  }

  static async spawnHeartRollHelper(_, target) {
    const options = target.dataset.options.split(",").reduce((o, line) => {
      let [k, v] = line.split("=", 2);
      if (["domain", "skill", "difficulty", "has_mastery"].includes(k)) {
        o[k] = v;
      }
      return o;
    }, {});
    new game.heart.HeartRollHelperApplication(this, options).render(true);
  }

  static async viewItem(_, target) {
    const id = target.dataset.itemId;
    this.document.items.get(id).sheet.render(true);
  }

  static async deleteItem(event, target) {
    event.preventDefault();
    event.stopPropagation();
    ui.notifications.error("Deleting Items not yet implemented")
  }

  constructor() {
    super(...arguments);
    this._view_mode = true;
  }

  _configureRenderParts(options) {
    super._configureRenderParts(options);

    const parts = ["header"];
    if (this.isEditable) {
      parts.push("toolbar");
    }

    switch (this.document.type) {
      case "adversary":
        parts.push("adversary_fields");
        break;
      case "delve":
        parts.push("delve_fields");
        break;
      case "landmark":
        parts.push("landmark_fields");
        break;
      case "character":
        parts.push(
          "character_basics",
          "character_resistances",
          "character_domains",
          "character_skills"
        );
        break;
      default:
        throw `Unexpected actor type ${this.document.type}`;
    }

    parts.push("items");
    options.parts = parts;
    return Object.fromEntries(parts.map((k) => [k, this.constructor.PARTS[k]]));
  }

  async _preparePartContext(partId, context) {
    const actor = this.document;
    async function updateFields() {
      context.fields = {};
      await Promise.all(
        Object.values(actor.system.schema.fields).map(async (field) => {
          const value = foundry.utils.getProperty(actor, field.fieldPath);
          context.fields[field.name] = {
            schema: field,
            value: value,
            enriched:
              await foundry.applications.ux.TextEditor.implementation.enrichHTML(
                value,
                {
                  // Whether to show secret blocks in the finished html
                  secrets: actor.isOwner,
                  // Data to fill in for inline rolls
                  rollData: actor.getRollData(),
                  // Relative UUID resolution
                  relativeTo: actor,
                }
              ),
          };
        })
      );
    }

    switch (partId) {
      case "adversary_fields":
        await updateFields();
        break;
      case "delve_fields":
        await updateFields();
        break;
      case "landmark_fields":
        await updateFields();
        break;
      case "toolbar":
        context.viewMode = this._view_mode;
        break;
      case "items":
        context.items = this.document.items;
        break;
      case "character_basics":
        context.itemTypes = this.document.itemTypes;
        break;
      case "character_resistances":
        context.tally = {};
        context.protection = {};
        Object.entries(this.document.system.resistances).forEach(
          ([name, value]) => {
            context.tally[name] = [];
            context.protection[name] = [];

            let v = value.value;
            while (v > 5) {
              context.tally[name].push(5);
              v -= 5;
            }
            context.tally[name].push(v);

            for (let i = 0; i < value.protection; i++) {
              context.protection[name].push("shield");
            }
          }
        );

        context.tally.total = [];
        let v = this.document.system.total_stress;
        while (v > 5) {
          context.tally.total.push(5);
          v -= 5;
        }
        context.tally.total.push(v);
        break;
      default:
        break;
    }

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = super._prepareContext(options);

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toPlainObject();

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Adding a pointer to CONFIG.HEART
    context.config = CONFIG.HEART;
    context.viewMode = this.options.viewMode;
    context.actor = this.document;

    return context;
  }
  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {}
}
