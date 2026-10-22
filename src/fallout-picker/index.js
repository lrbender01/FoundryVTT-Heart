// The Fallout picker (2026-10-01): picked up by the './**/index.js' module
// glob in src/index.js. game.heart.fallout.pick({ target, severity,
// resistance }) opens it from anywhere; chat cards carry a GM-only "Pick
// Fallout" button (button.js).
import { openFalloutPicker } from './picker';
import { askGM } from '../common/relay';
import './picker.sass';

// Chat cards' Pick Fallout button opens the picker for its target (an actor
// or a bond item). Bound by delegation on the chat log and every chat
// popout, like the roll cards' buttons (Luke, 2026-10-21, R1): a fallout
// card's markup is redrawn by HeartChatMessage.getHTML after the
// renderChatMessage hook has run (Foundry 12.343 calls the hook inside
// ChatMessage#getHTML), so a handler bound there was lost with the old
// markup. The GM-only strip happens at the end of getHTML for the same
// reason (button.js stripGmOnly).
export async function onPickFallout(ev) {
    ev.preventDefault();
    if (!game.user.isGM) return;
    const button = ev.currentTarget;
    const { target, severity, resistance } = button.dataset;
    const doc = await fromUuid(target);
    if (!doc) {
        ui.notifications.warn(game.i18n.localize('heart.bond.no-target'));
        return;
    }
    // on a fallout card, the pick is recorded on the message so its Clear
    // button clears the picked Fallout's resistance (Luke, 2026-10-21;
    // the GM's own call runs through the relay queue like every card write)
    const messageId = button.closest('[data-message-id]')?.dataset?.messageId;
    const onCard = messageId && button.closest('.fallout-roll');
    const onPicked = onCard
        ? (pick) => askGM('record-fallout-pick', { messageId, pick })
        : undefined;
    await openFalloutPicker({ target: doc, severity, resistance: resistance || undefined, onPicked });
}

export function activateListeners(html) {
    html.on('click', '[data-action=pick-fallout]', onPickFallout);
}

export function initialise() {
    game.heart.fallout = { pick: openFalloutPicker };
    Hooks.on('renderChatLog', (app, html) => activateListeners(html));
    Hooks.on('renderChatPopout', (app, html) => activateListeners(html));
}
