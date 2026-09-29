// Generic "Item": anything a character carries that has no roll automation
// (trinkets, keepsakes, tokens, letters, loot). Name, image, description and
// a quantity. Added 2026-09-29 alongside fvtt-heart-content's linked
// trinket tables; the sheet is the base item sheet plus a quantity field.
import sheetHTML from './sheet.html';
import templateJSON from './template.json';

const data = Object.freeze({
    type: Object.keys(templateJSON.Item)[0],
    img: 'icons/svg/item-bag.svg',
    template: sheetHTML.path,
});

export {
    data
}
