export function HeartApplicationMixin(BaseApplication) {
  class HeartApplication extends foundry.applications.api.HandlebarsApplicationMixin(
    BaseApplication
  ) {
    static get DEFAULT_OPTIONS() {
      const DEFAULT_OPTIONS = super.DEFAULT_OPTIONS;
      DEFAULT_OPTIONS.window ??= {};
      DEFAULT_OPTIONS.window.contentClasses = ["basic"];
      DEFAULT_OPTIONS.actions = {
        "view-item": HeartApplication.viewItem,
        "delete-item": HeartApplication.deleteItem,
        "activate-item": HeartApplication.activateItem,
        "deactivate-item": HeartApplication.deactivateItem,
      };
      DEFAULT_OPTIONS.form = {
        handler: this.onSubmitDocumentForm,
        submitOnChange: true,
        closeOnSubmit: false,
      };
      return DEFAULT_OPTIONS;
    }

    static PARTS = {
      header: {
        template: "systems/heart/templates/document/basic/parts/header.hbs",
      },
      items: {
        template: "systems/heart/templates/document/basic/parts/items.hbs",
      },
      equipment_groups: {
        template: "systems/heart/templates/document/basic/parts/equipment_groups.hbs",
      },
    };

    static TYPE_PARTS = {};

    static async onSubmitDocumentForm(event, form, formData, options = {}) {
      if (!this.isEditable) return;
      const { updateData, ...updateOptions } = options;
      const submitData = this._prepareSubmitData(
        event,
        form,
        formData,
        updateData
      );
      return await this._processSubmitData(
        event,
        form,
        submitData,
        updateOptions
      );
    }

    static async viewItem(_, target) {
      const id = target.closest("[data-item-id]").dataset.itemId;
      this.document.items.get(id).sheet.render(true);
    }

    static async deleteItem(_, target) {
      const id = target.closest("[data-item-id]").dataset.itemId;
      const item = this.document.items.get(id);

      if (item.parent instanceof Actor) {
        item.delete();
      }
    }

    static async activateItem(_, target) {
      const id = target.closest("[data-item-id]").dataset.itemId;
      const item = this.document.items.get(id);
      console.warn(item);

      await item.setFlag("heart", "active", true);
      this.render();
      return item;
    }

    static async deactivateItem(_, target) {
      const id = target.closest("[data-item-id]").dataset.itemId;
      const item = this.document.items.get(id);
      console.warn(item);
      await item.setFlag("heart", "active", false);
      this.render();
      return item;
    }

    static async activateEquipmentGroup(_, target) {
      const classID = target.closest("[data-class]")?.dataset
        ?.class;
      const equipmentGroup = target.closest("[data-equipment-group]").dataset
        .equipmentGroup;
      if (classID === undefined) {
        await this.document.activateEquipmentGroup(equipmentGroup);
      } else {
        await this.document.items.get(classID).activateEquipmentGroup(equipmentGroup);
      }
      this.render();
      return item;
    }

    static async deactivateEquipmentGroup(_, target) {
      const classID = target.closest("[data-class]")?.dataset
        ?.class;
      const equipmentGroup = target.closest("[data-equipment-group]").dataset
        .equipmentGroup;

      if (classID === undefined) {
        await this.document.deactivateEquipmentGroup(equipmentGroup);
      } else {
        await this.document.items.get(classID).deactivateEquipmentGroup(equipmentGroup);
      }

      this.render();
      return item;
    }

    _configureRenderParts(options) {
      super._configureRenderParts(options);
      options.parts = this.constructor.TYPE_PARTS[this.document.type];
      return Object.fromEntries(
        options.parts.map((k) => [k, this.constructor.PARTS[k]])
      );
    }

    /** @override */
    async _prepareContext(options) {
      const context = super._prepareContext(options);
      context.document = this.document;
      return context;
    }

    async _preparePartContext(partId, context) {
      switch (partId) {
        case "header":
          context = {};
          context.document = this.document;
          break;
        case "items":
          context = {};
          context.document = this.document;
          context.items = this.document.items.map((item) => {
            return {
              _id: item._id,
              type: item.type,
              subtype: item.system.type,
              active: item?.flags?.heart?.active ?? false,
              name: item.name,
              editable: this.isEditable,
              deletable: item.parent instanceof Actor,
            };
          });
          break;
        case "equipment_groups":
          context = {};
          let documents;
          if(this.document.documentName === "Item" && this.document.type === "class") {
            documents = [this.document];
          } else {
            documents = this.document.itemTypes.class;
          }

          context.classes = documents.reduce((out, document) => {
            const c = out[document.id] = {};
            c.equipment_group = document.getFlag(
              "heart",
              "equipment_group"
            );
            c.equipment_groups = document.getEquipmentGroups();
            return out;
          }, {});
          
          break;
      }
      return context;
    }
  }

  return HeartApplication;
}
