import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from "../helpers/effects.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class HeartActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["heart", "sheet", "actor"],
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "features",
        },
      ],
      viewMode: 0,
    });
  }

  /** @override */
  get template() {
    return `systems/heart/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toPlainObject();

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Adding a pointer to CONFIG.HEART
    context.config = CONFIG.HEART;
    context.viewMode = this.options.viewMode;

    context.fields = {};
    await Promise.all(Object.values(this.actor.system.schema.fields).map(async (field) => {
      const value = foundry.utils.getProperty(this.actor, field.fieldPath);
      context.fields[field.name] = {
        schema: field,
        value: value,
        enriched: await TextEditor.enrichHTML(
          value,
          {
            // Whether to show secret blocks in the finished html
            secrets: this.document.isOwner,
            // Data to fill in for inline rolls
            rollData: this.actor.getRollData(),
            // Relative UUID resolution
            relativeTo: this.actor,
          }
        )
      };
    }));

    // Prepare character data and items.
    if (actorData.type == "character") {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(
      // A generator that returns all effects stored on the actor
      // as well as any items
      this.actor.allApplicableEffects()
    );

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
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {}

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.on("click", ".item-edit", (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    html.on("change", "input[name]", async (ev) => {
      const input = $(ev.currentTarget);
      let value = input.val();
      if (input.attr("type") === "number") {
        value = parseInt(value);
      }

      const output = await this.actor.update({ [input.attr("name")]: value });
      return output;
    });

    // Add Inventory Item
    html.on("click", ".item-create", this._onItemCreate.bind(this));

    // Find and Add Item
    html.on(
      "click",
      ".item-find,.item-placeholder",
      this._onItemFind.bind(this)
    );

    html.on(
      "click",
      ".toggle-view-mode",
      () => {
        this.options.viewMode = 1 - this.options.viewMode;
        this.render();
      }
    );

    // Delete Inventory Item
    html.on("click", ".item-delete", (ev) => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Active Effect management
    html.on("click", ".effect-control", (ev) => {
      const row = ev.currentTarget.closest("li");
      const document =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // Rollable abilities.
    html.on("click", ".rollable", this._onRoll.bind(this));

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find("li.item").each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }

    html.on("click", ".item", (ev) => {
      const itemId = ev.currentTarget.dataset.itemId;

      return this.actor.items.get(itemId)?.sheet.render(true);
    });

    html.on("click", ".field .add", async (ev) => {
      const target = ev.currentTarget.dataset.target;
      const field = this.actor.system.schema.getField(
        target.replace(/^system\./, "")
      );

      const value = foundry.utils.getProperty(this.actor, target);
      const new_value = [...value, field.element.options.initial];
      await this.actor.update({
        [target]: new_value,
      });
    });

    html.on("click", ".field .remove", async (ev) => {
      const target = ev.currentTarget.dataset.target;
      const index = parseInt(ev.currentTarget.dataset.index);
      
      const value = foundry.utils.getProperty(this.actor, target);
      let new_value = [...value];
      new_value.splice(index, 1);

      await this.actor.update({
        [target]: new_value,
      });
    });
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
