// The "Pick Fallout" button for a chat card (2026-10-01). Only the GM sees
// it (stripGmOnly below removes [data-gm-only] for everyone else); it opens
// the picker for the target (an actor or a bond item, by uuid) at the
// card's severity (fallout-picker/index.js).
export function pickFalloutButton({ targetUuid, severity, resistance = '' }) {
    const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
    return `<button type="button" data-action="pick-fallout" data-gm-only data-target="${esc(targetUuid)}" data-severity="${esc(severity)}" data-resistance="${esc(resistance)}" data-tooltip="heart.fallout-picker.button-tip">${esc(game.i18n.localize('heart.fallout-picker.button'))}</button>`;
}

// A card as a player sees it: no GM-only controls, and no button row left
// empty by their removal. Called last in HeartChatMessage.getHTML (Luke,
// 2026-10-21, R1): getHTML redraws a roll card after Foundry's
// renderChatMessage hook has run, so a strip in the hook missed the redrawn
// fallout blocks. html: the card's jQuery.
export function stripGmOnly(html, user = game.user) {
    if (user?.isGM) return html;
    html.find('[data-gm-only]').remove();
    html.find('.ledger-acts').filter((i, el) => !el.children.length).remove();
    return html;
}
