export class HeartItem extends Item {
  static async recreateWithInheritables(data, operation) {
    const model = new CONFIG.Item.dataModels[data.type](data.system);
    const uuidMap = model.inheritableUuids;
    const cloneMap = await Object.entries(uuidMap).reduce(
      async (output, [key, uuids]) => {
        const cloneUuids = await Promise.all(
          uuids.map(async (uuid) => {
            const original = await fromUuid(uuid);
            const clone = await this.createDocuments(
              [original.toObject()],
              operation,
            );
            return clone[0].uuid;
          }),
        );
        const out = await output;
        out[key] = cloneUuids;
        return out;
      },
      Promise.resolve({}),
    );

    Object.entries(cloneMap).forEach(function ([key, uuids]) {
      data.system[key] = uuids;
    });

    return data;
  }

  static async createDocuments(data, operation = {}) {
    if (operation.inheritables) {
      await Promise.all(
        data.map(async (d) => {
          return await this.recreateWithInheritables(d, operation);
        }),
      );
    }

    return super.createDocuments(data, operation);
  }

  async delete(operation = {}) {
    if (operation.inheritables && this.parent !== null) {
      const uuidMap = this.system.inheritableUuids;
      const ids = Object.values(uuidMap).reduce((output, uuids) => {
        output.push(
          ...uuids
            .map((uuid) => foundry.utils.parseUuid(uuid).id)
            .filter((id) => this.parent.items.has(id)),
        );
        return output;
      }, []);
      await this.parent.deleteEmbeddedDocuments("Item", ids, operation);
    }
    return super.delete(operation);
  }

  async deleteDialog(options = {}, operation = {}) {
    let content = options.content;
    if (!content && operation.inheritables) {
      const type = game.i18n.localize(this.constructor.metadata.label);
      const question = game.i18n.localize("heart.AreYouSureInheritables");
      const warning = game.i18n.format("heart.DeleteManyWarning", { type });

      const previews = (
        await Object.values(this.system.inheritableUuids).reduce(
          async (output, uuids) => {
            const result = await Promise.all(
              uuids.map(async (uuid) => {
                const document = await fromUuid(uuid);
                const partial =
                  Handlebars.partials[
                    `systems/heart/templates/items/${document.type}/preview.hbs`
                  ];
                return await partial({ document });
              }),
            );
            let o = await output;
            o.push(...result);
            return o;
          },
          Promise.resolve([]),
        )
      ).join("");
      if (previews !== "") {
        content = `<p><strong>${question}</strong><div class='flex flex-col gap-5 margin-5'>${previews}</div>${warning}</p>`;
        options.classes = ["dialog", "heart"];
        options.content = content;
      }
    }
    return await super.deleteDialog(options, operation);
  }
}
