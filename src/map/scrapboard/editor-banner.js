// The banner on a board scene that has a published Map Dreamer map (2026-10-28; Luke, "build
// anytime"): one small strip at the top of the screen, the GM's only, saying which revision the
// scene holds against the newest Map Dreamer published, with a Bring in button when the scene is
// behind (or was brought in by hand). The state is decided in boardfile.js bannerInfo; this file
// only draws it. editor-link.js paints it when it finds a new meta and after a bring-in, and takes it
// down when no map is published. Players never get one: nothing is drawn on their clients.
const ID = 'heart-board-editor-banner';
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
let hooked = false;

export function removeBanner() {
    document.getElementById(ID)?.remove();
}

// `info`: boardfile.js bannerInfo (null: no banner); `onBring`: what the button does
export function paintBanner(info, { onBring } = {}) {
    if (!game.user?.isGM || !info || !canvas?.ready) return removeBanner();
    // (gone with the canvas, whichever scene comes next paints its own)
    if (!hooked) {
        hooked = true;
        Hooks.on('canvasTearDown', removeBanner);
    }
    let el = document.getElementById(ID);
    if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.className = 'heart-board-editor-banner';
        el.setAttribute('role', 'status');
        document.body.append(el);
    }
    el.dataset.kind = info.kind;
    el.replaceChildren();
    const text = document.createElement('span');
    text.className = 'txt';
    text.textContent = loc(`heart.board.editor-banner-${info.kind}`, { have: info.have ?? '', now: info.now });
    el.append(text);
    if (info.kind !== 'current' && onBring) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = loc('heart.board.editor-banner-bring');
        b.title = loc(info.merges ? 'heart.board.editor-banner-bring-merge' : 'heart.board.editor-banner-bring-whole');
        b.addEventListener('click', async () => {
            b.disabled = true;
            try {
                await onBring();
            } finally {
                b.disabled = false;
            }
        });
        el.append(b);
    }
}
