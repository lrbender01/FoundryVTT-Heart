// The art banner on panel sheets (2026-10-02): landmarks, adversaries, and
// companions. fvtt-heart-content gives the actor
// flags.fvtt-heart-content.art = { src, ar, banner } (common/art.js); the
// sheet's header is wrapped in .character-head.has-art with the art behind
// it (the template draws {{{heartArt actor "banner"}}} when data.art is set),
// a 200px lead strip over the 124px header (panel-sheet.sass).
//
// The title bar gets the Art button (the one per-user art switch,
// common/art-toggle.js, since 2026-10-02) and, for the GM, Show players: the whole piece in Foundry's image viewer
// for everyone, the moment the party meets it. A click on the banner opens
// the whole piece for this user (and pages through any extras).
//
//   class AdversarySheet extends BannerSheet(HeartActorSheet) { ... }
//
// The sheet's own getData / activateListeners call super, so the mixin's
// run first.
import { artOf, showArt } from './art';
import { artShown, toggleArt } from './art-toggle';

export const BannerSheet = (Base) => class extends Base {
    _art() {
        return artOf(this.actor);
    }

    // the one art switch for this user (common/art-toggle.js, 2026-10-02)
    _artHidden() {
        return !artShown();
    }

    async _toggleArt() {
        await toggleArt();
    }

    _showPlayers() {
        const art = this._art();
        if (!art || !game.user.isGM) return;
        const popout = new ImagePopout(art.src, { title: this.actor.name, shareable: true, uuid: this.actor.uuid });
        popout.render(true);
        popout.shareImage();
    }

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        if (this._art()) {
            if (game.user.isGM) buttons.unshift({
                label: game.i18n.localize('heart.art.show-players'),
                class: 'heart-art-share',
                icon: 'fas fa-eye',
                onclick: () => this._showPlayers(),
            });
            buttons.unshift({
                label: game.i18n.localize('heart.art.toggle'),
                class: 'heart-art-toggle',
                icon: 'fas fa-image',
                onclick: () => this._toggleArt(),
            });
        }
        return buttons;
    }

    // the title bar is drawn once, so the Art button's white / grey look is
    // refreshed after every render (as on the item sheets)
    async _render(...args) {
        await super._render(...args);
        this.element?.find('.window-header .heart-art-toggle').toggleClass('art-off', this._artHidden());
    }

    getData(...args) {
        const data = super.getData(...args);
        data.art = this._art() && !this._artHidden() ? this._art() : null;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.character-head.has-art > .heart-art-canvas').click(ev => {
            ev.preventDefault();
            showArt(this.actor);
        });
    }
};
