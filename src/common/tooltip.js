// Heart tooltips (2026-09-30, Luke): every Heart tooltip is Foundry's styled
// tooltip (data-tooltip), not the browser's native title.
//
// Foundry v12's TooltipManager.activate() puts the hovered element's
// data-tooltip into #tooltip with innerHTML (after game.i18n.localize), and
// takes its class from the nearest data-tooltip-class. Heart tooltips carry
// item, actor, and party names, knacks, and tag rules, which players type,
// so read as HTML they could inject markup. Rather than marking and double-
// escaping every attribute, one wrapper around game.tooltip.activate does
// both jobs for elements inside a Heart surface, and only there:
//   - adds the heart-tooltip class (styled in theme.sass), and
//   - shows the attribute as plain text (escaped; newlines kept by the
//     pre-line style), exactly as the native title showed it.
// The attribute still goes through localize first, as Foundry does (core
// elements inside a Heart window, such as the sheet's copy-id link, carry a
// key); a value that resolves to a whole lang section stays as written.
// Everything outside a Heart surface, and any call that passes its own text
// or content, goes to Foundry untouched.
//
// Hover delay (2026-09-30, Luke): Heart tooltips are rules a player reads on
// purpose, so they open only after a deliberate hover of HEART_TOOLTIP_DELAY_MS
// and never flash up while the mouse crosses a sheet. Foundry's own
// tooltips elsewhere keep Foundry's delay. How it fits Foundry v12's
// TooltipManager (client/core/tooltip.js):
//   - Foundry's pointerenter handler waits TOOLTIP_ACTIVATION_MS (500), then
//     calls this.activate(element); when a tooltip is already showing, it
//     calls activate at once (and pointerleave onto a tooltipped parent does
//     too). Both land in the wrapper below, which, for a Heart element on
//     that hover path (no explicit text, content, or locked option), shows
//     nothing yet: it hides any open tooltip and waits for the rest of the
//     delay (the full delay when Foundry did not wait).
//   - When the wait ends, the element must still be in the page and still be
//     the innermost tooltipped element under the pointer (:hover), else
//     nothing shows. So leaving it, moving onto a nested tooltip, or a
//     re-render cancels it, whatever Foundry's private state says.
//   - Foundry's pointerleave path ends in clearPending() (and deactivate()
//     calls it too); the wrapped clearPending also cancels a waiting Heart
//     tooltip, so dismissal works exactly as before.
//   - Once shown, it is Foundry's tooltip: pointerleave dismissal, the
//     middle-click lock (which needs a showing tooltip, so it follows the
//     delay), and locked-tooltip dismissal are untouched.
//   - An explicit call (other modules, or Heart code passing text, content,
//     or locked) shows at once, as Foundry would.

export const HEART_TOOLTIP_CLASS = 'heart-tooltip';

// A deliberate hover: one second (2026-09-30, Luke; two felt too long)
export const HEART_TOOLTIP_DELAY_MS = 1000;

// Heart's windows (every Heart application, sheet, and dialog carries
// heart-window), Heart forms and item previews (.heart, also in journals and
// chat), Heart's chat cards (.ledger: the roll templates' .heart root is
// unwrapped into Foundry's .dice-roll, chat-messages/index.js), and a
// highlighted game term anywhere (.heart-term, e.g. in a journal page)
export const HEART_TOOLTIP_SCOPE = '.heart-window, .heart, .ledger, .heart-term';

// The innermost element under the pointer that has a tooltip
function hoveredTooltipOwner() {
    const hovered = document.querySelectorAll(':hover');
    let el = hovered[hovered.length - 1] ?? null;
    while (el && !el.dataset?.tooltip) el = el.parentElement;
    return el;
}

export function registerHeartTooltips() {
    const manager = game.tooltip;
    if (!manager || manager._heartTooltips) return;
    const activate = manager.activate.bind(manager);
    const clearPending = manager.clearPending.bind(manager);
    const foundryDelay = Number(manager.constructor?.TOOLTIP_ACTIVATION_MS) || 0;
    let waiting = null;
    const cancelWaiting = () => {
        if (waiting) window.clearTimeout(waiting);
        waiting = null;
    };

    // Heart styling and plain text, read when the tooltip actually opens
    const heartOptions = (element, options) => {
        const opts = { ...options };
        if (!opts.text && !opts.content) {
            const raw = element.dataset?.tooltip ?? '';
            const localized = raw ? game.i18n.localize(raw) : '';
            if (raw) opts.text = Handlebars.escapeExpression(typeof localized === 'string' ? localized : raw);
        }
        const inherited = opts.cssClass ?? element.closest('[data-tooltip-class]')?.dataset.tooltipClass;
        opts.cssClass = [HEART_TOOLTIP_CLASS, inherited].filter(Boolean).join(' ');
        return opts;
    };

    manager.activate = function (element, options = {}) {
        cancelWaiting();
        if (!element?.closest?.(HEART_TOOLTIP_SCOPE)) return activate(element, options);
        const explicit = Boolean(options.text || options.content || options.locked);
        if (explicit) return activate(element, heartOptions(element, options));

        // the hover path: wait out the rest of the Heart delay
        const shownAlready = Boolean(manager.element);
        if (shownAlready) manager.deactivate();
        const rest = Math.max(0, HEART_TOOLTIP_DELAY_MS - (shownAlready ? 0 : foundryDelay));
        waiting = window.setTimeout(() => {
            waiting = null;
            if (!element.isConnected || hoveredTooltipOwner() !== element) return;
            activate(element, heartOptions(element, options));
        }, rest);
        return undefined;
    };

    manager.clearPending = function (...args) {
        cancelWaiting();
        return clearPending(...args);
    };
    manager._heartTooltips = true;
}
