// Ledger chat cards (2026-09-30, approved "Heart Chat Cards" mock B; styles in
// chat-messages/ledger.sass). Shared by the party's Provisions actions and
// bonds (moved here from actors/party/party.js on 2026-10-01). The rolls ride
// along on the message so Dice So Nice animates them (Foundry keeps custom
// content instead of drawing them).

import { diceRow, rollParts } from '../rolls/dice';

// Same layout as the roll cards (2026-09-30, round-2 mock B, no badge): the
// hint line, the outcome led by its glyph, every die in one row, a small
// note, who took what, then buttons
export async function ledgerCard({ what, glyph = '', bad = false, out, det = '', lines = [], acts = '', rolls = [] }) {
    // rolls: a Roll, or { roll, label } to label its dice
    const shown = rolls.filter(Boolean).map(r => (r.roll ? r : { roll: r, label: '' }));
    const dice = diceRow(shown.flatMap(x => rollParts(x.roll, x.label)));
    const lineHtml = lines.length
        ? `<div class="ledger-lines">${lines.map(l => `<div class="ledger-line"><span>${l.name}</span><span class="v">${l.value}</span></div>`).join('')}</div>`
        : '';
    return `<div class="heart ledger-card"><div class="ledger">`
        + `<div class="ledger-what">${what}</div>`
        + `<div class="ledger-out${bad ? ' bad' : ''}">${glyph}${out}</div>`
        + dice
        + (det ? `<div class="ledger-det">${det}</div>` : '')
        + lineHtml
        + (acts ? `<div class="ledger-acts">${acts}</div>` : '')
        + `</div></div>`;
}
