// The paused screen (2026-10-02, Luke's picks in the "Heart Pause Screen"
// mock, https://claude.ai/artifact/NJimhToGxe4W8fvsTdLsFS): Foundry's
// spinning clockwork becomes a slowly turning ouroboros (game-icons.net,
// tinted by a mask like every Heart glyph, with the soft halo); the band
// behind the words, the words, and Monk's Little Details' screen glow take
// Heart's reds (pause.sass). Only in Heart worlds: the system's code and
// styles load nowhere else.
import './pause.sass';

function heartPause(app, html) {
    const root = html?.[0] ?? html;
    const img = root?.querySelector?.('img');
    if (!img || root.querySelector('.heart-pause-icon')) return;
    const icon = document.createElement('span');
    icon.className = 'heart-pause-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<span class="heart-pause-halo"><span class="heart-pause-glyph"></span></span>';
    img.replaceWith(icon);
}

export function initialise() {
    Hooks.on('renderPause', heartPause);
}
