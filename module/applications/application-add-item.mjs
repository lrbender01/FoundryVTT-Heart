export class HeartAddItemApplication extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["form", "heart", "add-item"],
        types: [],
        hints: [],
        findMany: false,
      });
    }
  
    get template() {
      return `systems/heart/templates/application/application-add-item.hbs`;
    }
  
    get title() {
      return game.i18n.localize(`HEART.Application.add-item.title`);
    }

    async getData(options={}) {

      let data = super.getData(options);

      const matches = [];
      const hasTypeMatch = (item) => this.options.types.includes(item.type);
      matches.push(...game.items.filter(hasTypeMatch));
      const matchGroups = await Promise.all(game.packs.contents.map(async (pack) => {
        let ids = pack.index.filter(hasTypeMatch).map(item => item._id);
        console.warn(ids);

        return await Promise.all(ids.map(async (id) => {
          return await pack.getDocument(id);
        }));
      }));

      matches.push(...[].concat(...matchGroups));
      
      data.matches = matches;
      this.matches = matches;
      return data;
    }
  
    activateListeners(html) {
      html.find("button").click((ev) => {
        ev.preventDefault();
      });
  
      html.find("[data-action=cancel]").click((ev) => {
        this.close();
      });

      html.find(".item-add").click(async (ev) => {
        const li = $(ev.currentTarget).parents(".item");
        const matches = this.matches.filter((item) => item._id === li.data("itemId"));
        if (matches.length != 1) {
          throw `Unexpected number of matching items during add: ${matches.length}`;
        }
        const match = matches[0];

        await CONFIG.Item.documentClass.create(match, {parent: this.object});
        if(!this.options.findMany) {
          this.close();
        }
      });
    }
  }
  