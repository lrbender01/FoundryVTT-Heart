import { migrateLegacyItem, maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  const description = maybeMigrateTranslation(source.description);
  const type = source.type;
  
  const items = [];
  Object.values(source.children ?? {}).forEach((child) => {
    items.push(migrateLegacyItem(child));
  });

  return { description, type, items };
}

export default {
  "000": migration000,
};
