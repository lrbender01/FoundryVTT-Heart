import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from "../helpers/effects.mjs";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class HeartItemSheet extends foundry.appv1.sheets.ItemSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["heart", "sheet", "item"],
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "description",
        },
      ],
      viewMode: 0,
    });
  }

  /** @override */
  get template() {
    const path = "systems/heart/templates/item";
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.hbs`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.hbs`.
    return `${path}/item-${this.item.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  _prepareBeatData(context) {
    const types = CONFIG.HEART.beat_types;

    context.types = types;
  }

  _prepareFalloutData(context) {
    const resistance_label = game.i18n.localize(
      CONFIG.HEART.resistances[context.item.system.resistance]
    );

    const type_label = game.i18n.localize(
      CONFIG.HEART.fallout_types[context.item.system.type]
    );

    const resistances = CONFIG.HEART.resistances;
    const types = CONFIG.HEART.fallout_types;

    context.resistances = resistances;
    context.resistance_label = resistance_label;
    context.types = types;
    context.type_label = type_label;
  }

  _prepareClassData(context) {
    const domains = CONFIG.HEART.domains;
    const domain_label = game.i18n.localize(
      domains[context.item.system.domain]
    );
    const skills = CONFIG.HEART.skills;
    const skill_label = game.i18n.localize(skills[context.item.system.skill]);

    const resources = this.item.itemTypes.resource;
    const core_equipment = this.item.itemTypes.equipment;
    const abilities = this.item.itemTypes.ability;
    const equipment_groups = context.item.system.equipment_groups;

    context.abilities = abilities;
    context.core_equipment = core_equipment;
    context.domains = domains;
    context.domain_label = domain_label;
    context.skills = skills;
    context.skill_label = skill_label;
    context.resources = resources;
    context.equipment_groups = equipment_groups;
  }

  async _prepareTagData(context) {
    const uses = context.item.system.uses || "X";
    context.replaced_name = context.item.name.replaceAll(/\${X}/g, uses);
    const replaced_description = context.item.system.description.replaceAll(
      /\${X}/g,
      uses
    );

    context.replaced_description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      replaced_description,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Data to fill in for inline rolls
        rollData: this.item.getRollData(),
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );
  }

  /** @override */
  async getData() {
    // Retrieve base data structure.
    const context = super.getData();

    // Use a safe clone of the item data for further operations.
    const itemData = this.document.toPlainObject();

    context.fields = {};
    await Promise.all(Object.values(this.item.system.schema.fields).map(async (field) => {
      const value = foundry.utils.getProperty(this.item, field.fieldPath);
      context.fields[field.name] = {
        schema: field,
        value: value,
        enriched: await TextEditor.enrichHTML(
          value,
          {
            // Whether to show secret blocks in the finished html
            secrets: this.document.isOwner,
            // Data to fill in for inline rolls
            rollData: this.item.getRollData(),
            // Relative UUID resolution
            relativeTo: this.item,
          }
        )
      };
    }));

    // Enrich description info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Data to fill in for inline rolls
        rollData: this.item.getRollData(),
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );

    // Add the item's data to context.data for easier access, as well as flags.
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.viewMode = this.options.viewMode;

    // Adding a pointer to CONFIG.HEART
    context.config = CONFIG.HEART;

    // Prepare active effects for easier access
    context.effects = prepareActiveEffectCategories(this.item.effects);
    context.itemTypes = this.item.itemTypes;
    context.items = itemData.items;

    if (context.item.type === "fallout") {
      this._prepareFalloutData(context);
    } else if (context.item.type === "tag") {
      await this._prepareTagData(context);
    } else if (context.item.type === "class") {
      this._prepareClassData(context);
    } else if (context.item.type === "beat") {
      this._prepareBeatData(context);
    }

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.on(
      "click",
      ".toggle-view-mode",
      () => {
        this.options.viewMode = 1 - this.options.viewMode;
        this.render();
      }
    );

    html.on("click", ".item", (ev) => {
      const itemId = ev.currentTarget.dataset.itemId;

      return this.item.items.get(itemId)?.sheet.render(true);
    });

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Roll handlers, click handlers, etc. would go here.

    // Active Effect management
    html.on("click", ".effect-control", (ev) =>
      onManageActiveEffect(ev, this.item)
    );
  }
}
