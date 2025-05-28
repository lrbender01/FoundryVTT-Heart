/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    // Common partials
    "systems/heart/templates/parts/base-field.hbs",
    "systems/heart/templates/parts/field-editor.hbs",
    "systems/heart/templates/parts/field-number.hbs",
    "systems/heart/templates/parts/field-string.hbs",
    "systems/heart/templates/parts/field-string-array.hbs",
    "systems/heart/templates/parts/items.hbs",
    "systems/heart/templates/parts/view-mode.hbs",
    // Actor partials
    // Item partials
    "systems/heart/templates/item/parts/base-item.hbs",
    "systems/heart/templates/item/parts/base-item-micro.hbs",
    "systems/heart/templates/item/parts/item-die.hbs",
    "systems/heart/templates/item/parts/item-ability.hbs",
    "systems/heart/templates/item/parts/item-beat.hbs",
    "systems/heart/templates/item/parts/item-calling.hbs",
    "systems/heart/templates/item/parts/item-class.hbs",
    "systems/heart/templates/item/parts/item-effects.hbs",
    "systems/heart/templates/item/parts/item-equipment.hbs",
    "systems/heart/templates/item/parts/item-placeholder.hbs",
    "systems/heart/templates/item/parts/item-resource.hbs",
    "systems/heart/templates/item/parts/item-tag.hbs",
    "systems/heart/templates/item/parts/item-single-selector.hbs",
  ]);
};
