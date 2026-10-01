import chatTemplateHTML from './roll.html';
import { iconFor, glyphFor } from '../../common/icons';
import { diceRow, rollParts } from '../dice';

export default class ItemRoll extends Roll {
    static get CHAT_TEMPLATE() { return chatTemplateHTML.path; }

    static build({item} = {}, data={}, options={}) {
        options.item = item;
        let die_size = options.stepIncrease ? stepIncrease(item.system.die_size) : item.system.die_size;
        die_size = options.stepDecrease ? stepDecrease(item.system.die_size) : die_size;
        return new this(die_size, data, options);
    }

    // Ledger card (2026-09-30): the item's icon and name beside the result,
    // then its skill (equipment) or domain (resource) and the die rolled
    async render(chatOptions = {}) {
        chatOptions = foundry.utils.mergeObject({
            user: game.user.id,
            flavor: null,
            template: this.constructor.CHAT_TEMPLATE,
            blind: false
        }, chatOptions);
        const isPrivate = chatOptions.isPrivate;
        if (!this._evaluated) await this.evaluate();

        const loc = (k) => game.i18n.localize(k);
        const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
        const item = this.options.item ?? {};
        const sys = item.system ?? {};
        const name = item.name ? localizeHeart(item.name) : '';
        const die = String(this.formula ?? '').toUpperCase();

        // what the item is used for: its skill or domain (with its glyph),
        // then the die; the die in the row is labelled the same way
        // a haunt service: the resistance it treats (2026-09-30 review)
        const [kind, id] = sys.service ? ['resistance', sys.service]
            : sys.domain ? ['domain', sys.domain]
            : sys.type && game.heart.skills?.includes(sys.type) ? ['skill', sys.type] : [];
        const use = kind ? loc(`heart.${kind}.${id}`) : '';
        const stepped = this.options.stepIncrease ? loc('heart.card.stepped-up')
            : this.options.stepDecrease ? loc('heart.card.stepped-down') : '';
        const what = [use ? `${glyphFor(kind, id)}<b>${esc(use)}</b>` : esc(loc('heart.card.item-roll')), esc(die)].join(', ');

        // a haunt service (no item name) is named by the caller's flavour
        const out = name ? `${iconFor(item.img)}${esc(name)}` : (chatOptions.flavor ?? '');

        return renderTemplate(chatOptions.template, {
            what: isPrivate ? '???' : what,
            out: isPrivate ? '?' : out,
            det: isPrivate ? '' : stepped,
            total: isPrivate ? '?' : this.total,
            dice: isPrivate ? '' : diceRow(rollParts(this, use).map(p => ({ ...p, kept: true }))),
        });
    }
}

function stepIncrease(die_size) {
    const gameDieSizes = game.heart.die_sizes;

    var currentDieSizeIndex = gameDieSizes.indexOf(die_size);

    if(currentDieSizeIndex < (gameDieSizes.length - 1)) {
        var largerSize = gameDieSizes[currentDieSizeIndex+1];
        return largerSize;
    }
    return die_size;
}

function stepDecrease(die_size) {
  const gameDieSizes = game.heart.die_sizes;

  var currentDieSizeIndex = gameDieSizes.indexOf(die_size);

  if(currentDieSizeIndex > 1) {
      var smallerSize = gameDieSizes[currentDieSizeIndex-1];
      return smallerSize;
  }
  return die_size;
}
