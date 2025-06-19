import { migrateLegacyItem, maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  const die_size_conversions = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
  };

  const die_size = die_size_conversions[source.die_size] || 4;
  const description = maybeMigrateTranslation(source.description || "");
  const type = source.type;
  const resistances = source.resistances || [];
  const items = [];

  Object.values(source.children ?? {}).forEach((child) => {
    items.push(migrateLegacyItem(child));
  });

  return {
    description,
    die_size,
    type,
    resistances,
    items,
  };
}

export default {
  "000": migration000,
};
