import { HeartDocumentPickerSheet } from "./document-picker.js";
const { DocumentSheetV2, HandlebarsApplicationMixin } =
  foundry.applications.api;

export class HeartDocumentSheet extends HandlebarsApplicationMixin(
  DocumentSheetV2
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
  };

  static async renderSheetByUUID(event, element) {
    await (await fromUuid(element.dataset.documentUuid))?.sheet.render(true);
  }

  get title() {
    return this.document.name || this.document.id;
  }

  async _getOptions(pickerType) {
    switch (pickerType) {
        case "ability": return await this.getAbilityOptions();
        case "beat": return await this.getBeatOptions();
        case "calling": return await this.getCallingOptions();
        case "class": return await this.getClassOptions();
        case "equipment": return await this.getEquipmentOptions();
        case "equipmentGroup": return await this.getEquipmentGroupOptions();
        case "fallout": return await this.getFalloutOptions();
        case "resource": return await this.getResourceOptions();
        case "tag": return await this.getTagOptions();
        default: {
            ui.notifications.warn(game.i18n.localize("heart.picker.no-choices"));
            return [];
            
        };
    }
  }

  static async openPicker(event, element) {
    const pickerType = element.dataset.picker;
    const options = await this._getOptions(pickerType);
    
    const picker = new HeartDocumentPickerSheet({
        choices: options,
        type: pickerType,
        target: this.document,
        mode: "add",
        activeUuid: null,
    });
    picker.render(true);
  }

  async getAbilityOptions() { return []; }
  async getBeatOptions() { return []; }
  async getCallingOptions() { return []; }
  async getClassOptions() { return []; }
  async getEquipmentGroupOptions() { return []; }
  async getEquipmentOptions() { return []; }
  async getFalloutOptions() { return []; }
  async getResourceOptions() { return []; }
  async getTagOptions() { return []; }


  static async removeDocument(event, target) {
    const uuid = target.closest("[data-document-uuid]").dataset.documentUuid;
    const document = await fromUuid(uuid);
    await document.deleteDialog({}, {
      inheritables: true
    });
    this.render();
  }

  static async replaceDocument(event, target) {
    const uuid = target.closest("[data-document-uuid]").dataset.documentUuid;
    const document = await fromUuid(uuid);
    const options = await this._getOptions(document.type);
    
    if (options.length === 0) {
        ui.notifications.warn(game.i18n.localize("heart.picker.no-choices"));
        return;
    }
    const picker = new HeartDocumentPickerSheet({
        choices: options,
        type: document.type,
        target: this.document,
        mode: "replace",
        activeUuid: target.closest("[data-document-uuid]").dataset.documentUuid,
    });
    await picker.render(true);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: ".draggable",
      dropSelector: ".dropzone",
      permissions: {
        dragstart: () => this.isEditable,
        drop: () => this.isEditable,
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        drop: this._onDrop.bind(this),
        dragover: (ev) => {
          console.warn("dragover", ev);
        },
        dragenter: (ev) => {
          console.warn("dragenter", ev);
        },
        dragleave: this._onDragEnd.bind(this),
      },
    }).bind(this.element);

    this.element.querySelectorAll("[data-document-uuid]").forEach((element) => {
      element.addEventListener("dblclick", (event) => {
        this.constructor.renderSheetByUUID.call(this, event, element);
      });
    });
  }

  _onFirstRender() {
    this._createContextMenu(
      () => {
        const options = [
          {
            name: "View",
            icon: '<i class="fa-solid fa-eye"></i>',
            callback: (li) =>
              this.constructor.renderSheetByUUID.call(this, null, li),
          },
        ];
        if (this.isEditable) {
          options.push({
            name: "heart.button.replace",
            icon: '<i class="fa-solid fa-arrows-rotate"></i>',
            callback: (li) => this.constructor.replaceDocument.call(this, null, li)
          }, {
            name: "Delete",
            icon: '<i class="fa-solid fa-trash"></i>',
            callback: (li) =>
              this.constructor.removeDocument.call(this, null, li),
          });
        }
        return options;
      },
      "[data-document-uuid]",
      {
        fixed: true,
        hookName: "getDocumentContextOptions",
        parentClassHooks: false,
      }
    );

    this._createContextMenu(
      () => {
        const options = [
          {
            name: "heart.picker.context",
            icon: '<i class="fa-solid fa-search"></i>',
            callback: (li) =>
              this.constructor.openPicker.call(this, null, li),
          },
        ];
        return options;
      },
      "[data-picker]",
      {
        fixed: true,
        hookName: "getDocumentContextOptions",
        parentClassHooks: false,
      }
    );
  }

  _onDragStart(ev) {
    console.warn("drag start", ev);
  }

  async _onDrop(ev) {
    console.warn("hello", ev);
    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const document = this.document;
    const allowed = Hooks.call("dropActorSheetData", document, this, data);
    if (allowed === false) return;

    // Dropped Documents
    const documentClass = foundry.utils.getDocumentClass(data.type);
    if (documentClass) {
      const document = await documentClass.fromDropData(data);
      await this._onDropDocument(event, document);
    }
  }

  async _onDropDocument(event, document) {
    switch (document.documentName) {
      case "ActiveEffect":
        return this._onDropActiveEffect(
          event,
          /** @type ActiveEffect */ document
        );
      case "Item":
        return this._onDropItem(event, /** @type Item */ document);
    }
  }

  async _onDropActiveEffect(event, effect) {
    if (!this.document.isOwner) return;
    if (this.document.uuid === item.parent?.uuid) {
      return;
    }
    const keepId = !this.document.items.has(item.id);
    ActiveEffect.implementation.create(effect.toObject(), {
      parent: this.document,
      keepId,
    });
  }

  async _onDropItem(event, item) {
    if (!this.document.isOwner) return;
    if (this.document.uuid === item.parent?.uuid)
      return this._onSortItem(event, item);
    const keepId = !this.document.items.has(item.id);
    await Item.implementation.create(item.toObject(), {
      parent: this.document,
      keepId,
    });
  }

  async _onDragEnd(event) {
    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    console.warn(data, event);
  }
}
