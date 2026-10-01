// Showing dice (2026-09-30): Dice So Nice first, Foundry's own dice sound as
// the fallback.
//
// Rolls posted as their own chat message (the Heart roll, a standalone
// stress or fallout roll) go through roll.toMessage(), which Dice So Nice
// already intercepts: it animates the dice and reveals the card when they
// land. Rolls that ATTACH to an existing card (the stress and fallout rolls
// chained under a Heart roll) never create a message, so they call this to
// get the same treatment before the card updates.

export async function showDice(roll, { setting = null, rollMode = game.settings.get('core', 'rollMode') } = {}) {
    if (!roll?.dice?.length) return;
    if (setting && !game.settings.get('heart', setting)) return;

    if (game.dice3d) {
        // whisper / blind follow the roll mode, as Dice So Nice does for messages
        const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
        const whisper = ['gmroll', 'blindroll'].includes(rollMode) ? gmIds
            : rollMode === 'selfroll' ? [game.user.id] : null;
        const blind = rollMode === 'blindroll';
        try {
            await game.dice3d.showForRoll(roll, game.user, true, whisper, blind);
            return;
        } catch (err) {
            console.warn('heart | Dice So Nice could not show the roll; falling back', err);
        }
    }
    // Foundry default: the dice sound, as a chat roll would play it
    const src = CONFIG.sounds?.dice;
    if (src) foundry.audio.AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, true);
}

// ---------------------------------------------------------------- dice row
// Every ledger card's dice (2026-09-30, Luke's pick of the round-2 mock B):
// one always-visible row, each die drawn as Foundry's own die shape with
// its number on top and its label under it (Base, Kill, a helper, d6). The
// kept die is red; a die the difficulty removed is crossed out. Replaces
// the old dice summary line and its click-to-open breakdown.

// Every die in a roll as a part: { label, faces, value, kept, removed }
export function rollParts(roll, label = '') {
    return (roll?.dice ?? []).flatMap(die => (die.results ?? []).map(r => ({
        label: die.flavor || label,
        faces: die.faces,
        value: r.result,
        kept: r.active !== false && !r.discarded,
        removed: r.active === false || Boolean(r.discarded),
    })));
}

const DIE_ICONS = new Set([4, 6, 8, 10, 12, 20]);

// The die shape is a mask (like the glyphs), so the card colours it: grey,
// or red for the kept die
export function diceRow(parts) {
    const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
    if (!parts?.length) return '';
    const dice = parts.map(p => {
        const faces = DIE_ICONS.has(Number(p.faces)) ? Number(p.faces) : 6;
        const cls = ['ledger-die', p.kept ? 'kept' : '', p.removed ? 'removed' : ''].filter(Boolean).join(' ');
        // a label only when it says something the die shape doesn't (Base,
        // Kill, a helper); a bare "d20" is left off (2026-09-30 review)
        return `<span class="${cls}" data-tooltip="d${faces}">`
            + `<span class="die-shape"><i style="--die: url('icons/svg/d${faces}-grey.svg')"></i><b>${esc(p.value)}</b></span>`
            + (p.label ? `<span class="die-label">${esc(p.label)}</span>` : '')
            + `</span>`;
    }).join('');
    return `<div class="ledger-dice">${dice}</div>`;
}
