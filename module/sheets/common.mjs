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
      context.document = this.document;
      switch (partId) {
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

  return HeartApplication;
}
