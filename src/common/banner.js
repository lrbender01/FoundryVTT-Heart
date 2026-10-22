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
import { artOf, showArt, showImage } from './art';
import { artShown, artToggleButton, markArtButton } from './art-toggle';

export const BannerSheet = (Base) => class extends Base {
    _art() {
        return artOf(this.actor);
    }

    // the one art switch for this user (common/art-toggle.js, 2026-10-02)
    _artHidden() {
        return !artShown();
    }

    _showPlayers() {
        const art = this._art();
        if (!art || !game.user.isGM) return;
        // (in Heart's own viewer, here and on every player's screen)
        showImage(art.src, { title: this.actor.name, share: true, uuid: this.actor.uuid });
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
            // (the one Art button, common/art-toggle.js, since 2026-10-21)
            buttons.unshift(artToggleButton());
        }
        return buttons;
    }

    // the title bar is drawn once, so the Art button's white / grey look is
    // refreshed after every render (as on the item sheets)
    async _render(...args) {
        await super._render(...args);
        markArtButton(this);
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
