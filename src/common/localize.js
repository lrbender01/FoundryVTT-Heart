// localizeHeart('class', 'cleaver', 'name') -> game.i18n of the key
// heart.class.cleaver.name, or the joined text itself when there is no
// such key: names from the content packs are literal (since 2026-09-30), not
// keys, so they come back unchanged. A last argument that is an object (a
// Handlebars options hash) is dropped. Only a string is a translation
// (2026-10-02): a key that names a whole lang section ("trinket",
// "fallout") came back as an object and turned names into "[object
// Object]".
//
// One module since 2026-10-21 (Luke): it was defined inside index.js's init
// and read everywhere else as a window global. index.js still sets
// window.localizeHeart and registers the Handlebars helper from this.
export function localizeHeart(...args) {
    if (args.length && typeof args[args.length - 1] === 'object') args = args.slice(0, -1);
    const key = args.join('.');
    const value = `heart.${key}`;
    const response = game.i18n.localize(value);
    if (typeof response !== 'string' || response === value) return key;
    return response;
}

// The name a "+" gives a new item: "New Equipment", from the type's label
// (Luke, 2026-10-21, S17: it was the raw type id, "New equipment"); the id
// itself when the type has no label
export function newItemName(type) {
    const key = CONFIG.Item?.typeLabels?.[type];
    const label = key ? game.i18n.localize(key) : '';
    return game.i18n.format('heart.new-item', { type: label && label !== key ? label : type });
}
