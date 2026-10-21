// A haunt's service button (Luke, 2026-10-21): asks what pays, then rolls
// that payment's die capped at the haunt's (HCB pp. 81 and 140; the rule is
// in rules.js). The landmark sheet and the haunt sheet both call it. It
// only rolls: spending or downgrading the resource and removing the stress
// stay by hand, as before.

import { heartDialogOptions } from '../../common/dialog';
import { resourcePayments, otherPaymentDice } from './rules';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
const dieLabel = (die) => loc('heart.die_size.d(N)', { N: String(die).replace(/^d/, '') });

// The characters whose resources can pay: the user's own (their assigned
// character first); for the GM, the players' characters
function payers() {
    const own = game.actors.filter(a => a.type === 'character' && a.isOwner && (!game.user.isGM || a.hasPlayerOwner));
    const mine = game.user.character;
    return mine && own.includes(mine) ? [mine, ...own.filter(a => a !== mine)] : own;
}

// Which payment, as { die, paidWith }; null when closed
function askPayment({ haunt, service }) {
    const hauntDie = service.die_size;
    const resistance = loc(`heart.resistance.${service.resistance}`);
    const payments = resourcePayments(payers().map(a => ({ id: a.id, name: a.name, items: [...a.items] })), hauntDie, game.heart.die_sizes);
    const byKey = new Map(payments.map(p => [p.key, p]));
    const chip = (value, checked, inner, tip) => `<label class="chip-toggle"${tip ? ` data-tooltip="${esc(tip)}"` : ''}>`
        + `<input type="radio" name="payment" value="${esc(value)}"${checked ? ' checked' : ''} /><span>${inner}</span></label>`;
    const resourceChips = payments.map((p, i) => chip(p.key, i === 0,
        `${esc(p.name)}<b class="chip-count">${esc(dieLabel(p.rolls))}</b>`,
        loc(p.capped ? 'heart.haunt.pay.chip-capped' : 'heart.haunt.pay.chip-tip', { owner: p.owner, die: dieLabel(p.die), rolls: dieLabel(p.rolls) })));
    const otherChips = otherPaymentDice(hauntDie, game.heart.die_sizes)
        .map(die => chip(`die:${die}`, !payments.length && die === hauntDie, esc(dieLabel(die))));
    const body = `<p>${esc(loc('heart.haunt.pay.lead', { haunt: haunt.name, resistance, die: dieLabel(hauntDie) }))}</p>`
        + `<div class="requirement-title">${esc(loc('heart.haunt.pay.resources'))}</div>`
        + (payments.length ? `<div class="chip-set">${resourceChips.join('')}</div>` : `<p class="bond-quiet">${esc(loc('heart.haunt.pay.no-resources'))}</p>`)
        + `<div class="requirement-title">${esc(loc('heart.haunt.pay.other'))}</div><div class="chip-set">${otherChips.join('')}</div>`
        + `<p class="bond-dialog-note">${esc(loc('heart.haunt.pay.note'))}</p>`;
    return new Promise(resolve => {
        new Dialog({
            title: loc('heart.haunt.pay.title', { haunt: haunt.name }),
            content: `<form class="heart form bond-dialog" autocomplete="off">${body}</form>`,
            buttons: {
                ok: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: esc(loc('heart.haunt.pay.button', { resistance })),
                    callback: html => {
                        const value = html.find('input[name=payment]:checked').val();
                        if (!value) return resolve(null);
                        if (value.startsWith('die:')) return resolve({ die: value.slice(4), paidWith: '' });
                        const p = byKey.get(value);
                        resolve(p ? { die: p.rolls, paidWith: loc('heart.haunt.pay.paid-with', { resource: p.name, die: dieLabel(p.die) }) } : null);
                    },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: esc(loc('heart.bond.dialog.cancel')), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
            render: html => html.find('form').on('submit', ev => ev.preventDefault()),
        }, heartDialogOptions({ width: 460 })).render(true);
    });
}

// haunt: the haunt item; service: one of its system.resistances entries
// ({ resistance, die_size }); speaker: whom the card speaks for
export async function rollHauntService({ haunt, service, speaker }) {
    if (!haunt || !service) return;
    const payment = await askPayment({ haunt, service });
    if (!payment) return;
    // the haunt rides on the roll as its item (2026-09-30 review): the
    // card's outcome is its icon and name, the hint its service
    const roll = game.heart.rolls.ItemRoll.build({ item: {
        name: haunt.name, img: haunt.img, type: 'haunt',
        system: { die_size: payment.die, service: service.resistance },
    } }, {}, { paidWith: payment.paidWith });
    await roll.evaluate();
    return roll.toMessage({ speaker });
}
