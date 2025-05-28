export class HeartActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ActorSheetV2
) {
  static get DEFAULT_OPTIONS() {
    const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
    DEFAULT_OPTIONS.window.contentClasses= ["standard-form", "actor"];
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

  static ACTIONS = {
    "find-item": HeartActorSheet.findItem,
    "create-item": HeartActorSheet.createItem,
  };

  static async findItem() {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;

    game.heart.addItemMacro(this.actor, [type], []);
  }
  static async createItem() {}

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
      case "items":
        context.items = this.document.items;
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

    // Prepare character data and items.
    if (actorData.type == "character") {
      this._prepareCharacterData(context);
    }

    return context;
  }

  /**
   * Character-specific context modifications
   *
   * @param {object} context The context object to mutate
   */
  _prepareCharacterData(context) {
    // Initialize containers.
    const beats = {
      minor: [],
      major: [],
      zenith: [],
    };

    const abilities = [];

    context.itemTypes = this.actor.itemTypes;

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      if (i.type === "calling") {
        context.calling = i;
        // abilities.push(new CONFIG.Item.documentClass({type: "calling", ...i.system.ability}));
      } else if (i.type === "beat") {
        beats[i.system.type].push(i);
      } else if (i.type === "ability") {
        abilities.push(i);
      }
    }

    context.beats = beats;
    context.abilities = abilities;

    context.tally = {};
    context.protection = {};
    Object.entries(this.actor.system.resistances).forEach(([name, value]) => {
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
    });

    context.tally.total = [];
    let v = this.actor.system.total_stress;
    while (v > 5) {
      context.tally.total.push(5);
      v -= 5;
    }
    context.tally.total.push(v);
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system["type"];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle creating a new Owned Item via an Application that searches for matching types
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemFind(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;

    game.heart.addItemMacro(this.actor, [type], []);
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == "item") {
        const itemId = element.closest(".item").dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : "";
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get("core", "rollMode"),
      });
      return roll;
    }
  }
}
