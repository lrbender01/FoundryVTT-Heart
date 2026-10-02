// The Fallout picker (2026-10-01): picked up by the './**/index.js' module
// glob in src/index.js. game.heart.fallout.pick({ target, severity,
// resistance }) opens it from anywhere; chat cards carry a GM-only "Pick
// Fallout" button (button.js).
import { openFalloutPicker } from './picker';
import './picker.sass';

// Chat cards: GM-only controls are removed for everyone else, and the Pick
// Fallout button opens the picker for its target (an actor or a bond item)
Hooks.on('renderChatMessage', (message, html) => {
    if (!game.user.isGM) {
        html.find('[data-gm-only]').remove();
        html.find('.ledger-acts').filter((i, el) => !el.children.length).remove();
        return;
    }
    html.find('[data-action=pick-fallout]').on('click', async ev => {
        ev.preventDefault();
        const { target, severity, resistance } = ev.currentTarget.dataset;
        const doc = await fromUuid(target);
        if (!doc) {
            ui.notifications.warn(game.i18n.localize('heart.bond.no-target'));
            return;
        }
        await openFalloutPicker({ target: doc, severity, resistance: resistance || undefined });
    });
});

export function initialise() {
    game.heart.fallout = { pick: openFalloutPicker };
}
