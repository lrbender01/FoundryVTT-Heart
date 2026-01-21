import { HeartActorSheet } from "./base.js";

export class CharacterSheet extends HeartActorSheet {
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs",
    },
    brief: {
      id: "brief",
      template: "systems/heart/templates/actors/character/brief.hbs",
      templates: [
        "systems/heart/templates/actors/character/brief.hbs",
        "systems/heart/templates/common/view.hbs",
        "systems/heart/templates/common/remove.hbs",
        "systems/heart/templates/items/class/preview.hbs",
        "systems/heart/templates/items/calling/preview.hbs",
        "systems/heart/templates/items/ability/preview.hbs",
        "systems/heart/templates/items/beat/preview.hbs",
        "systems/heart/templates/items/resource/preview.hbs",
        "systems/heart/templates/items/equipment/preview.hbs",
        "systems/heart/templates/items/fallout/preview.hbs",
      ],
    },
    verbose: {
      id: "verbose",
      template: "systems/heart/templates/actors/character/verbose.hbs",
      templates: [
        "systems/heart/templates/actors/character/verbose.hbs",
        "systems/heart/templates/common/view.hbs",
        "systems/heart/templates/common/remove.hbs",
        "systems/heart/templates/common/editmode.hbs",
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

  static TABS = {
    tabs: {
      tabs: [
        { id: "brief", icon: "fas fa-clipboard-list" },
        { id: "verbose", icon: "fas fa-circle-info" },
      ],
      labelPrefix: "heart.character",
      initial: "brief",
    },
  };

  static DEFAULT_OPTIONS = Object.assign({}, super.DEFAULT_OPTIONS, {
    actions: Object.assign({}, super.DEFAULT_OPTIONS.actions, {
      toggleEditMode: this.toggleEditMode,
      remove: this.removeDocument,
      openPicker: this.openPicker,
      view: this.viewDocument,
      switchClass: this.switchClass,
      setStress: this.setStress,
    }),
    window: {
      controls: [
        {
          icon: "fas fa-edit",
          label: "Toggle Edit Mode",
          action: "toggleEditMode",
          visible: function () {
            return this.isEditable;
          },
        },
      ],
    },
  });

  static toggleEditMode(event, target) {
    if (this.isEditable) {
      this.editMode = !this.editMode;
      this.render(true);
    }
  }

  static async viewDocument(event, target) {
    event.stopImmediatePropagation();
    event.preventDefault();
    const uuid = target.closest("[data-document-uuid]").dataset.documentUuid;
    const document = await fromUuid(uuid);
    await document.sheet.render(true);
  }

  static async switchClass(event, target) {
    if (this.document.itemTypes.class.length > 1) {
      this.document.itemTypes.class.forEach(async (c) => {
        c.delete();
      });
    }

    if (target.value === "") {
      return;
    }

    const classTemplate = await fromUuid(target.value);
    await Item.implementation.create(classTemplate.toObject(), {
      parent: this.document,
    });
  }

  static async switchCalling(event, target) {
    if (this.document.itemTypes.calling.length > 1) {
      this.document.itemTypes.calling.forEach(async (c) => {
        c.delete();
      });
    }

    if (target.value === "") {
      return;
    }

    const callingTemplate = await fromUuid(target.value);
    await Item.implementation.create(callingTemplate.toObject(), {
      parent: this.document,
    });
  }

  static async switchCalling(event, target) {
    if (this.document.itemTypes.calling.length > 1) {
      this.document.itemTypes.calling.forEach(async (c) => {
        c.delete();
      });
    }

    if (target.value === "") {
      return;
    }

    const callingTemplate = await fromUuid(target.value);
    await Item.implementation.create(callingTemplate.toObject(), {
      parent: this.document,
    });
  }

  static async switchBeat(event, target, index) {
    this.document.itemTypes.beat.forEach(async (c, i) => {
      if (i === index || i > 2) {
        c.delete();
      }
    });

    if (target.value === "") {
      this.render(true);
      return;
    }

    const beatTemplate = await fromUuid(target.value);
    await Item.implementation.create(beatTemplate.toObject(), {
      parent: this.document,
    });
  }

  static async setStress(event, target) {
    const value = target.dataset.index;
    const resistance = target.closest("[data-resistance]").dataset.resistance;

    const update = {};
    update[`system.resistances.${resistance}.value`] = parseInt(value);
    const ret = await this.document.update(update);
    await this.render(true);
  }

  async _prepareContext(context) {
    context = await super._prepareContext(context);
    context.editMode = this.editMode;
    context.tabs = this._prepareTabs("tabs");

    return context;
  }

  async _preparePartContext(partId, context) {
    context.tab = context.tabs[partId];
    if (partId === "verbose") {
      context.classOptions = await this.getClassOptions();
      context.callingOptions = await this.getCallingOptions();
      context.beatOptions = await this.getBeatOptions();
    }
    return context;
  }

  async getClassOptions() {
    const uuids = game.packs.reduce((output, pack) => {
      output.push(
        ...pack.index.filter((x) => x.type === "class" && x.name !== this.document.class?.name).map((x) => x.uuid)
      );
      return output;
    }, []);
    const objs = await Promise.all(
      uuids.map(async (uuid) => {
        const doc = await fromUuid(uuid);
        return doc;
      })
    );
    if( this.document.class !== undefined) {
      objs.splice(0, 0, this.document.class);
    }
    return objs;
  }

  async getCallingOptions() {
    const uuids = game.packs.reduce((output, pack) => {
      output.push(
        ...pack.index
          .filter(
            (x) =>
              x.type === "calling" && x.name !== this.document.calling?.name
          )
          .map((x) => x.uuid)
      );
      return output;
    }, []);
    const objs = await Promise.all(
      uuids.map(async (uuid) => {
        const doc = await fromUuid(uuid);
        return doc;
      })
    );
    return objs;
  }

  async getBeatOptions() {
    const uuids = this.document.itemTypes.calling.reduce((output, calling) => {
      output.push(...calling.system.beats);
      return output;
    }, []);

    const objs = (await Promise.all(
      uuids.map(async (uuid) => {
        const doc = await fromUuid(uuid);
        return doc;
      })
    )).filter(
      (beat) =>
        beat.name !== this.document.activeBeatOne?.name &&
        beat.name !== this.document.activeBeatTwo?.name
    );
    return objs;
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
        drop: this._onDrop.bind(this),
      },
    }).bind(this.element);

    this.element.querySelectorAll("select").forEach((select) =>
      select.addEventListener("change", (e) => {
        const type = select.dataset.type;
        if (type !== undefined) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        if (type === "class") {
          this.constructor.switchClass.call(this, e, select);
        } else if (type === "calling") {
          this.constructor.switchCalling.call(this, e, select);
        } else if (type === "beat") {
          this.constructor.switchBeat.call(
            this,
            e,
            select,
            parseInt(select.dataset.index)
          );
        }
      })
    );

    this.element.querySelectorAll("[name]").forEach((box) =>
      box.addEventListener("change", (e) => {
        const name = box.getAttribute("name");
        this.document.update({
          [name]: box.value,
        });
      })
    );

    this.element.querySelectorAll("select").forEach((select) =>
      select.addEventListener("mousedown", async (ev) => {
        if (ev.shiftKey) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (select.value !== "") {
            const doc = await fromUuid(select.value);
            doc.sheet?.render(true);
          }
        }
      })
    );

    this.element.querySelectorAll(".item.preview").forEach((item) =>
      item.addEventListener("click", async (ev) => {
        if (ev.shiftKey) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          const doc = await fromUuid(item.dataset.documentUuid);
          doc.sheet?.render(true);
        }
      })
    );

    this.element.querySelectorAll(".item.preview > summary").forEach((item) =>
      item.addEventListener("click", async (ev) => {
        if (ev.shiftKey) {
          ev.preventDefault();
        }
      })
    );

    this.element.setAttribute("tabindex", 0);
    this.element.addEventListener("keydown", (ev) => {
      if (ev.key === "Shift") {
        this.element.classList.add("shifted");
      }
    });

    this.element.addEventListener("keyup", (ev) => {
      if (ev.key === "Shift") {
        this.element.classList.remove("shifted");
      }
    });
  }

}
