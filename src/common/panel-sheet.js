import './panel-sheet.sass';
import { highlightRendered } from './terms';
import { shareOfCharacter } from './window-sizes';
import { bindTrack } from './tracks';

// Shared behaviour for the "panel" actor sheets - adversary, landmark, delve
// (2026-09-29). They share the character sheet's chrome (torn header, tab
// strip, titled containers) and these interactions:
//
//   tabs          .character-nav-tabs a[data-tab] + .tab-content > .tab
//                 (active tab kept in sheet._activeTab across re-renders)
//   actor tracks  [data-actor-track][data-target] > .ordered-checkable-box
//                 click to mark up to a box; click the last marked box again
//                 to clear it
//   editors       [data-action=edit-editor] in a .editor-panel title opens that
//                 panel's editor (Foundry's floating button is hidden)
//   edit toggle   [data-action=toggle-edit] flips sheet._editing (chips/text
//                 <-> inputs) after saving pending field changes
//   die roll      [data-action=roll-die][data-die] posts a plain roll with
//                 data-flavor as its flavour (e.g. a landmark's default stress)

export const PANEL_SHEET_CLASS = 'heart-panel-sheet';

export function panelSheetDefaults(defaultOptions, extra = {}) {
    return foundry.utils.mergeObject(defaultOptions, {
        classes: [...defaultOptions.classes, PANEL_SHEET_CLASS],
        // 85% of the character sheet (2026-10-01; was 920 x 780)
        ...shareOfCharacter(),
        dragDrop: [{ dragSelector: '.item', dropSelector: null }],
        ...extra,
    });
}

// Comma-separated text OR an array (delves store domains as an array) -> chips
export function toChips(value) {
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    return list.map(v => String(v).trim()).filter(Boolean);
}

function showTab(sheet, html, tab) {
    sheet._activeTab = tab;
    html.find('.character-nav-tabs a').each((i, el) => $(el).toggleClass('active', el.dataset.tab === tab));
    html.find('.tab-content > .tab').each((i, el) => {
        const on = el.dataset.tab === tab;
        $(el).toggleClass('active', on).toggle(on);
    });
}

export function activatePanelSheet(sheet, html) {
    const actor = sheet.actor;

    // Game terms highlighted in the displayed text: panels (Special, Rules,
    // Plots...), the adversary difficulty banner and domain note
    highlightRendered(html[0], '.editor-panel .editor-content, .difficulty-note, .profile-note');

    showTab(sheet, html, sheet._activeTab);
    html.find('.character-nav-tabs a').click(ev => {
        ev.preventDefault();
        showTab(sheet, html, ev.currentTarget.dataset.tab);
    });

    // (only for those who may edit it, 2026-10-21: common/tracks.js)
    const targetOf = (box) => box.parentElement.dataset.target;
    bindTrack(html, '[data-actor-track] > .ordered-checkable-box', {
        editable: sheet.isEditable,
        read: (box) => Number(foundry.utils.getProperty(actor, targetOf(box))) || 0,
        write: (box, value) => actor.update({ [targetOf(box)]: value }),
    });

    // Native .click() because jQuery .trigger() skips the default on <a>
    html.find('[data-action=edit-editor]').click(ev => {
        ev.preventDefault();
        const button = $(ev.currentTarget).closest('.editor-panel').find('.editor-edit').get(0);
        if (button) button.click();
    });

    html.find('[data-action=toggle-edit]').click(async ev => {
        ev.preventDefault();
        if (sheet._editing) await sheet._onSubmit(new Event('submit'), { preventClose: true, preventRender: true });
        sheet._editing = !sheet._editing;
        sheet.render();
    });

    html.find('[data-action=roll-die]').click(async ev => {
        ev.preventDefault();
        const { die, flavor } = ev.currentTarget.dataset;
        if (!die) return;
        const roll = await new Roll(`1${die}`).evaluate();
        // escaped (Luke, 2026-10-21): the flavor carries a landmark's name,
        // and the chat card draws the flavor as HTML
        roll.toMessage({ flavor: Handlebars.escapeExpression(flavor ?? ''), speaker: ChatMessage.getSpeaker({ actor }) });
    });
}
