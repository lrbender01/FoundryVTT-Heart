import chatTemplateHTML from './roll.html';
import { iconFor, glyphFor } from '../../common/icons';
import { diceRow, rollParts } from '../dice';
import { itemRollDie } from '../stress-roll/rules';
import { localizeHeart } from '../../common/localize';

// Only what the card reads, so a roll's message does not carry the whole
// item (description, children, flags; 2026-10-21, R25)
export function itemSummary(item) {
    const sys = item?.system ?? {};
    return {
        name: item?.name ?? '',
        img: item?.img ?? '',
        system: { die_size: sys.die_size, domain: sys.domain, type: sys.type, service: sys.service },
    };
}

export default class ItemRoll extends Roll {
    static get CHAT_TEMPLATE() { return chatTemplateHTML.path; }

    // The die steps on the one ladder (stress-roll/rules.js; Luke,
    // 2026-10-21: a D6 never stepped down to a D4, and the card said
    // "stepped" when the die had not moved)
    static build({item} = {}, data={}, options={}) {
        options.item = itemSummary(item);
        const { die, stepped } = itemRollDie(item?.system?.die_size, options);
        options.stepped = stepped;
        return new this(die, data, options);
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
        // cards rolled before 2026-10-21 have no `stepped`: their flags say it
        const moved = 'stepped' in this.options ? this.options.stepped
            : this.options.stepIncrease ? 'up' : this.options.stepDecrease ? 'down' : '';
        const stepped = moved === 'up' ? loc('heart.card.stepped-up')
            : moved === 'down' ? loc('heart.card.stepped-down')
            // a haunt service: what paid for it (2026-10-21)
            : this.options.paidWith ? String(this.options.paidWith) : '';
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
