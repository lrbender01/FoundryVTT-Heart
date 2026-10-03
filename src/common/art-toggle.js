// One art switch per user (2026-10-02, Luke): turned off in any window, the
// books' art is off everywhere for that user (the character and party
// sheets, the landmark, adversary, and companion banners, item headers, the
// art behind gear rows, decorations, the Choose window's cards); every
// window that shows art carries the same Art button in its title bar. It
// replaced the character sheet's own setting (showCharacterArt) and the
// per-document one (hiddenItemArt). The art viewers themselves (gallery,
// image popout) show art on request and have no button.
export const ART_SETTING = 'showArt';

export const artShown = () => game.settings.get('heart', ART_SETTING) !== false;

export const toggleArt = () => game.settings.set('heart', ART_SETTING, !artShown());

// the title bar's Art button (white while art shows, grey when off)
export function artToggleButton() {
    return {
        label: game.i18n.localize('heart.art.toggle'),
        class: 'heart-art-toggle',
        icon: 'fas fa-image',
        onclick: () => toggleArt(),
    };
}

// the title bar is drawn once, so the button's look is refreshed after
// every render
export function markArtButton(app) {
    app.element?.find('.window-header .heart-art-toggle').toggleClass('art-off', !artShown());
}

// a page-wide class for art drawn outside a sheet's own data (gear row art
// in any window or chat card)
export function applyArtClass() {
    document.body?.classList.toggle('heart-art-off', !artShown());
}

// the switch flipped: every open Heart window redraws
export function redrawArtWindows() {
    applyArtClass();
    for (const app of Object.values(ui.windows ?? {})) {
        if (app.rendered && app.options?.classes?.includes('heart')) app.render(false);
    }
}

// a user who had switched the character art off keeps it off (the old
// client setting, read once from its stored value)
export function carryOldArtSetting() {
    try {
        if (localStorage.getItem(`heart.${ART_SETTING}`) !== null) return;
        if (localStorage.getItem('heart.showCharacterArt') === 'false') game.settings.set('heart', ART_SETTING, false);
    } catch (err) {
        // storage blocked: the default (art on) stands
    }
}
