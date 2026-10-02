// The "Pick Fallout" button for a chat card (2026-10-01). Only the GM sees
// it (fallout-picker/index.js removes [data-gm-only] for everyone else);
// it opens the picker for the target (an actor or a bond item, by uuid) at
// the card's severity.
export function pickFalloutButton({ targetUuid, severity, resistance = '' }) {
    const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
    return `<button type="button" data-action="pick-fallout" data-gm-only data-target="${esc(targetUuid)}" data-severity="${esc(severity)}" data-resistance="${esc(resistance)}" data-tooltip="heart.fallout-picker.button-tip">${esc(game.i18n.localize('heart.fallout-picker.button'))}</button>`;
}
