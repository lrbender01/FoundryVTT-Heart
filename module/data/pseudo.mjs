const PseudoEmbeddedCollectionField = (function () {
  const PseudoEmbeddedCollectionField = class extends foundry.data.fields
    .EmbeddedCollectionField {};

  // We do _not_ want this class to be recognized as an instance of the EmbeddedCollectionField
  // as other code assumes embedded collection fields are under documents.
  // However, we do want all the rest of the code, so we just overwrite
  // the effect of `xyz instanceof EmbeddedCollectionField`.
  const original =
    foundry.data.fields.EmbeddedCollectionField[Symbol.hasInstance];
  Object.defineProperty(
    foundry.data.fields.EmbeddedCollectionField,
    Symbol.hasInstance,
    {
      value(instance) {
        if (instance?.constructor === PseudoEmbeddedCollectionField) {
          return false;
        } else {
          return original(instance);
        }
      },
    }
  );
  return PseudoEmbeddedCollectionField;
})();

export { PseudoEmbeddedCollectionField };

export function PseudoDataModelMixin(base) {
  return class extends base {
    get pack() {
      if (super.pack) return super.pack;
      return this.parent.pack;
    }


    /*
     * pseudo-inherited from foundry.abstract.Document
     */
    static get hierarchy() {
      return Object.getOwnPropertyDescriptor(
        foundry.abstract.Document,
        "hierarchy"
      ).get.call(this);
    }

    static getCollectionName(...args) {
      return foundry.abstract.Document.getCollectionName.call(this, ...args);
    }

    getEmbeddedCollection(...args) {
      return foundry.abstract.Document.prototype.getEmbeddedCollection.call(
        this,
        ...args
      );
    }

    testUserPermission(...args) {
      return foundry.abstract.Document.prototype.testUserPermission.call(
        this,
        ...args
      );
    }

    _configure({ pack = null, parentCollection = null } = {}) {
      super._configure({ pack, parentCollection });

      const collections = {};
      for (const [fieldName, field] of Object.entries(
        this.constructor.hierarchy
      )) {
        if (!field.constructor.implementation) continue;
        const data = this._source[fieldName];
        const c = (collections[fieldName] =
          new field.constructor.implementation(fieldName, this, data));
        Object.defineProperty(this, fieldName, { value: c, writable: false });

        const documentName = c.documentClass.documentName;
        const name = `${documentName.toLowerCase()}Types`;
        
        Object.defineProperty(this, name, {get: function () {
          const allTypes = game.documentTypes[documentName];
          const types = Object.fromEntries(
            allTypes.map((t) => [t, []])
          );
          for (const item of c.values()) {
            types[item.type].push(item);
          }
          return types;
        }})
      }

      Object.defineProperty(this, "collections", {
        value: Object.seal(collections),
        writable: false,
      });
    }
  };
}

export function PseudoMixin(base) {
  return class extends base {
    // This can detect if we're a pseudo embedded item
    get parentDocument() {
      if (this.parent && !(this.parent instanceof Document)) {
        return this.parent.parent;
      }
      return undefined;
    }

    async update(data = {}, operation = {}) {
      const parentDocument = this.parentDocument;
      if (!parentDocument) return await super.update(data, operation);

      // Instead of asking for an update for this document,
      // try to update our parent instead. This propagates the
      // way you'd hope.
      const collectionName =
        parentDocument.system.constructor.getCollectionName(this.documentName);
      const source = parentDocument.system._source[collectionName];

      source.findSplice(
        (id) => this.id === id,
        foundry.utils.mergeObject(this._source, data)
      );

      return await parentDocument.update(
        { [`system.${collectionName}`]: source },
        { ...operation, diff: false }
      );
    }

    prepareDerivedData() {
      super.prepareDerivedData();

      if (this.system.collections === undefined) {
        return;
      }

      // make the collections available at the parent level (e.g. this.items, vs this.system.items)
      Object.defineProperties(
        this,
        Object.fromEntries(
          Object.entries(this.system.collections)
            .filter(([key, _]) => {
              return this[key] === undefined;
            })
            .map(([key, value]) => {
              return [key, { value }];
            })
        )
      );

      // make the collections by type available at the parent level (e.g. this.itemTypes)
      Object.defineProperties(
        this,
        Object.fromEntries(
          Object.entries(this.system.collections)
            .filter(([_, value]) => {
              const documentName = value.documentClass.documentName.toLowerCase();
              const name = `${documentName.toLowerCase()}Types`;
              return this[name] === undefined;
            })
            .map(([_, value]) => {
              const documentName = value.documentClass.documentName.toLowerCase();
              const name = `${documentName.toLowerCase()}Types`;
              return [name, {
                get: () => this.system[name]
              }];
            })
        )
      );
    }
  };
}
