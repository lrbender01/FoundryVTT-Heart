const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HeartDocumentPickerSheet extends HandlebarsApplicationMixin(
  ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heart"],
    tag: "form",
    position: {
      width: 700,
    },
    window: {
      resizable: true,
    },
    actions: {
      add: this.add,
      replace: this.replace,
      cancel: this.cancel,
      activate: this.activate,
    },
  };

  static PARTS = {
    main: {
      id: "main",
      template: "systems/heart/templates/applications/picker.hbs",
      templates: [
        "systems/heart/templates/applications/picker.hbs",
        "systems/heart/templates/items/class/preview.hbs",
        "systems/heart/templates/items/calling/preview.hbs",
        "systems/heart/templates/items/ability/preview.hbs",
        "systems/heart/templates/items/beat/preview.hbs",
        "systems/heart/templates/items/resource/preview.hbs",
        "systems/heart/templates/items/equipment/preview.hbs",
        "systems/heart/templates/items/fallout/preview.hbs",
      ],
    },
  };

  constructor() {
    super(...arguments);

    this.activeUuid = this.options.activeUuid ?? null;
    this.mode =
      ["add", "replace"].find((m) => m === this.options.mode) ?? "add";
  }

  static async activate(event, element) {
    const uuid = element.dataset.activate;
    if (this.activeUuid === uuid) {
      this.activeUuid = null;
    } else {
      this.activeUuid = uuid;
    }
    this.render(true);
  }

  static async cancel() {
    await this.close();
  }

  static async add(event, element) {
    const uuid = element.dataset.activate ?? this.activeUuid ?? null;
    if (uuid === null) {
      return;
    }
    const template = await fromUuid(uuid);
    await template.constructor.create(template.toObject(), {
      parent: this.options.target,
      inheritables: true,
    });
    await this.options.target.sheet.render();
    await this.close();
  }

  static async replace(event, element) {
    const uuid = element.dataset.activate ?? this.activeUuid ?? null;
    if (uuid === null) {
      return;
    }

    const old = await fromUuid(this.options.activeUuid);
    const template = await fromUuid(uuid);

    await old.delete({
      inheritables: true,
    });
    await template.constructor.create(template.toObject(), {
      parent: this.options.target,
      inheritables: true,
    });
    await this.options.target.sheet.render();
    await this.close();
  }

  static async renderSheetByUUID(event, element) {
    await (await fromUuid(element.dataset.documentUuid))?.sheet.render(true);
  }

  async _prepareContext(context) {
    context.activeUuid = this.activeUuid;
    context.type = this.options.type;
    context.choices = this.options.choices;
    context.mode = this.mode;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-document-uuid]").forEach((element) => {
      element.addEventListener("dblclick", (event) => {
        this.constructor.renderSheetByUUID.call(this, event, element);
      });
    });
  }

  _onFirstRender() {
    this._createContextMenu(
      () => {
        return [
          {
            name: "View",
            icon: '<i class="fa-solid fa-eye"></i>',
            callback: (li) =>
              this.constructor.renderSheetByUUID.call(this, null, li),
          },
        ];
      },
      "[data-document-uuid]",
      {
        fixed: true,
        hookName: "getDocumentContextOptions",
        parentClassHooks: false,
      },
    );
  }
}
