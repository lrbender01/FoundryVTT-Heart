// One click at a time (2026-10-02, Luke: a double-click took stress twice).
// A button that writes is switched off until its work is done, and the same
// action on the same card can't start again meanwhile (the chat log and a
// chat popout draw every card twice, so the key, not the element, decides).
// A failure is logged and reported once, and the button comes back.

const running = new Set();

export function isRunning(key) {
    return running.has(key);
}

export async function oneAtATime(key, button, fn) {
    if (running.has(key)) return undefined;
    running.add(key);
    const el = button?.jquery ? button[0] : button;
    if (el) {
        el.classList.add('heart-busy');
        if ('disabled' in el) el.disabled = true;
    }
    try {
        return await fn();
    } catch (err) {
        console.error(`heart | ${key} failed`, err);
        ui.notifications?.error(game.i18n.localize('heart.relay.failed'));
        return undefined;
    } finally {
        running.delete(key);
        if (el) {
            el.classList.remove('heart-busy');
            if ('disabled' in el) el.disabled = false;
        }
    }
}
