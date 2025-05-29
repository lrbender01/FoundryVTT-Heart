import "./fake_html.mjs";

import * as fields from "/home/cian/Downloads/FoundryVTT/resources/app/common/data/fields.mjs";
import BaseFolder from "/home/cian/Downloads/FoundryVTT/resources/app/common/documents/folder.mjs";
import BaseItem from "/home/cian/Downloads/FoundryVTT/resources/app/common/documents/item.mjs";
import Collection from "/home/cian/Downloads/FoundryVTT/resources/app/common/utils/collection.mjs";
import { deepClone } from  "/home/cian/Downloads/FoundryVTT/resources/app/common/utils/helpers.mjs";
import Document from "/home/cian/Downloads/FoundryVTT/resources/app/common/abstract/document.mjs"
import TypeDataModel from "/home/cian/Downloads/FoundryVTT/resources/app/common/abstract/type-data.mjs";
import { HEART } from "./module/helpers/config.mjs";
import * as CONST from "/home/cian/Downloads/FoundryVTT/resources/app/common/constants.mjs";
import { randomID } from "/home/cian/Downloads/FoundryVTT/resources/app/common/utils/helpers.mjs";

global.foundry = {
  abstract: {
    TypeDataModel,
    Document
  },
  data: {
    fields,
  },
  utils: {
    Collection,
    deepClone,
    randomID,
  },
  documents: {
    BaseItem
  }
};
global.CONST = CONST;
global.CONFIG = {
  Item: {
    documentClass: {
      defineSchema: () => {
        return {
          _id: new fields.DocumentIdField(),
          name: new fields.StringField({
            required: true,
            blank: false,
            textSearch: true,
          }),
          type: new fields.DocumentTypeField({
            validationError: "is not a valid type for the Item Document class",
          }),
          img: new fields.FilePathField({ categories: ["IMAGE"] }),
          system: new fields.TypeDataField(),
          folder: new fields.ForeignDocumentField(BaseFolder),
          sort: new fields.IntegerSortField(),
          ownership: new fields.DocumentOwnershipField(),
          flags: new fields.ObjectField(),
        };
      },
    },
  },
  HEART,
};
