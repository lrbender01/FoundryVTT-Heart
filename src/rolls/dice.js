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
