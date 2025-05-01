import { migrateLegacyItem, maybeMigrateTranslation } from "./common.mjs";

function migration000(source) {
  const effects = [];
  const description = maybeMigrateTranslation(source.description || "");
  const domain = source.core_domain ?? Object.keys(CONFIG.HEART.domains)[0];
  const skill = source.core_skill ?? Object.keys(CONFIG.HEART.skills)[0];

  const items = [];
  Object.values(source.children ?? {}).forEach((child) => {
    const group = child.system.group;
    const item = migrateLegacyItem(child);
    if (group !== undefined) {
      item.flags ??= {};
      item.flags.heart ??= {};
      item.flags.heart['equipment_group'] = group;
    }
    items.push(item);
  });

  return { domain, skill, description, items, effects };
}

export default {
  "000": migration000,
};
