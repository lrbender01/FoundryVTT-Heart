import { migrateLegacyItem } from "./common.mjs";

function migration000(source) {
  const die_size_conversions = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
  };

  const items = [];

  Object.values(source.children ?? {}).forEach((child) => {
    items.push(migrateLegacyItem(child));
  });

  let die_size = die_size_conversions[source.die_size || "d4"];
  let domain = source.domain;

  if (die_size === undefined) {
    die_size = 6;
    domain = "haven";
    // console.warn(`Missing die size: ${source.die_size}, ${JSON.stringify(source)}`);
  }

  return {
    die_size,
    domain,
    items
  };
}

export default {
  "000": migration000,
};
