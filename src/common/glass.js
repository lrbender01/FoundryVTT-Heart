// Glass sheets (2026-10-02, Luke; tuned in the monorepo's Heart Sheet Glass
// mock, docs/mocks/sheet-glass): every Heart sheet's sections, rows, chips,
// header boxes, and tab strip as smoked glass over a dark grunge ground. An
// opinionated look, so it is one switch per user, off by default: the client
// setting in Configure Settings and the Glass button in every sheet's title
// bar flip the same thing.
//
// The look is CSS only (glass.sass), keyed on body.heart-glass, so flipping
// the switch needs no redraw: every open sheet, and its Glass button, changes
// at once. The ground is book art from fvtt-heart-content (the texture set);
// without the module the glass sits on the window's own charcoal.
import './glass.sass';

export const GLASS_SETTING = 'glassSheets';

// the ground under the glass, in the content module
export const GLASS_GROUND = 'modules/fvtt-heart-content/assets/art/map/textures/dark/dark_charcoal_scaly_grunge_portrait.webp';

export const glassOn = () => game.settings.get('heart', GLASS_SETTING) === true;

export const toggleGlass = () => game.settings.set('heart', GLASS_SETTING, !glassOn());

// the title bar's Glass button (white while glass is on, grey when off:
// glass.sass, from the body class)
export function glassToggleButton() {
    return {
        label: game.i18n.localize('heart.glass.toggle'),
        class: 'heart-glass-toggle',
        icon: 'fas fa-gem',
        onclick: () => toggleGlass(),
    };
}

// the page-wide class the look hangs on
export function applyGlassClass() {
    document.body?.classList.toggle('heart-glass', glassOn());
}

// The ground's CSS value: the texture when the content module is active
// (a route-aware path, so a world served under a prefix still finds it)
export function glassGround(contentActive, route = (p) => p) {
    return contentActive ? `url("${route(GLASS_GROUND)}")` : 'none';
}

// See-through to the scene (2026-10-02, Luke): two per-user sliders. The
// ground's see-through share (0 to 90%) and the blur over what shows through
// it. Nothing showing through (or no blur) means no window blur at all, so a
// solid glass window costs what it did before.
export const SEE_THROUGH_SETTING = 'glassSeeThrough';
export const BLUR_SETTING = 'glassBlur';

export function glassPass(seeThrough, blur) {
    const clear = Math.min(90, Math.max(0, Number(seeThrough) || 0)) / 100;
    const px = Math.max(0, Number(blur) || 0);
    return { clear, pass: clear > 0 && px > 0 ? `blur(${px}px)` : 'none' };
}

// One glass, layered (2026-10-02, Luke: "the clearness should feel like a
// product of what makes up each element"). Only the window frosts the scene;
// everything on it is the same tinted glass, one Glass Tint per layer, so how
// dark a thing reads is how many layers it sits under: a section is one, a
// row in it two, a chip on the row three (the browser stacks them). Pieces
// that stand alone are given their layer count outright, each 1 - (1 - t)^n:
// header boxes 3, the red tab strip 6, title pills 7 (at the default 80%,
// Luke's pick on 2026-10-22: 99%, 100%, 100%). The tint runs to 90% so the
// glass can go nearly black.
export const TINT_SETTING = 'glassTint';
export const LAYERS = { section: 1, head: 3, strip: 6, pill: 7 };
export const TINT_MAX = 90;

export function glassLayers(tint) {
    const t = Math.min(TINT_MAX, Math.max(0, Number(tint) || 0)) / 100;
    const of = (n) => Math.round((1 - (1 - t) ** n) * 1000) / 1000;
    return Object.fromEntries(Object.entries(LAYERS).map(([k, n]) => [k, of(n)]));
}

export function applyGlassPass() {
    const { clear, pass } = glassPass(game.settings.get('heart', SEE_THROUGH_SETTING), game.settings.get('heart', BLUR_SETTING));
    const style = document.documentElement?.style;
    style?.setProperty('--heart-glass-clear', String(clear));
    style?.setProperty('--heart-glass-pass', pass);
    for (const [k, a] of Object.entries(glassLayers(game.settings.get('heart', TINT_SETTING)))) {
        style?.setProperty(`--heart-glass-${k}`, String(a));
    }
}

// One reset for everyone (2026-10-23, Luke: "reset everyone's and then have
// them pick up the defaults"). The sliders are each client's own, out of the
// GM's reach, so the GM bumps a hidden world stamp instead:
//   game.settings.set('heart', 'glassReset', Date.now())
// and every client puts its own sliders back to their defaults, at once if
// it is connected, else on its next load. Each client remembers the last
// stamp it followed, so a reset happens once per bump. The Glass switch
// itself is left as each user set it.
export const GLASS_RESET_SETTING = 'glassReset';
export const GLASS_RESET_SEEN = 'glassResetSeen';
export const GLASS_SLIDERS = [SEE_THROUGH_SETTING, BLUR_SETTING, TINT_SETTING];

export const needsGlassReset = (stamp, seen) => Boolean(stamp) && stamp !== seen;

export async function followGlassReset() {
    const stamp = game.settings.get('heart', GLASS_RESET_SETTING);
    if (!needsGlassReset(stamp, game.settings.get('heart', GLASS_RESET_SEEN))) return false;
    // (said only where a slider moved: Luke 2026-10-25, every new player
    // was told their sliders were reset though none had changed)
    let moved = false;
    for (const key of GLASS_SLIDERS) {
        const fallback = game.settings.settings.get(`heart.${key}`)?.default;
        if (fallback === undefined || game.settings.get('heart', key) === fallback) continue;
        await game.settings.set('heart', key, fallback);
        moved = true;
    }
    await game.settings.set('heart', GLASS_RESET_SEEN, stamp);
    if (moved) globalThis.ui?.notifications?.info(game.i18n.localize('heart.glass.reset-done'));
    return true;
}

export function applyGlassGround() {
    const active = Boolean(game.modules?.get('fvtt-heart-content')?.active);
    const route = (p) => foundry.utils.getRoute?.(p) ?? p;
    document.documentElement?.style.setProperty('--heart-glass-ground', glassGround(active, route));
}
