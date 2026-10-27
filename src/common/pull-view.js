// Pull views to mine (Luke, 2026-10-27, Session scripting): how long a player's
// view takes to slide to the GM's. Pure: no Foundry globals, tested in
// test/pull-view.test.mjs.

export const PULL_MIN_MS = 1000;
export const PULL_MAX_MS = 4000;
// each screen's length of way adds this much, and each doubling or halving of
// the zoom a little more
const PER_SCREEN_MS = 700;
const PER_ZOOM_MS = 350;

// `from` and `to`: { x, y, scale } (the scene point at the view's centre, and
// the zoom); `screen`: { w, h } in pixels. About a second for a short hop,
// growing with the distance in screen diagonals as the player sees it at the
// larger of the two zooms, capped at four seconds.
export function pullDuration(from, to, screen) {
    const diagonal = Math.hypot(screen?.w ?? 0, screen?.h ?? 0);
    const s0 = from?.scale > 0 ? from.scale : 1;
    const s1 = to?.scale > 0 ? to.scale : 1;
    const way = Math.hypot((to?.x ?? 0) - (from?.x ?? 0), (to?.y ?? 0) - (from?.y ?? 0)) * Math.max(s0, s1);
    const screens = diagonal > 0 ? way / diagonal : 0;
    const zoom = Math.abs(Math.log2(s1 / s0));
    const ms = PULL_MIN_MS + screens * PER_SCREEN_MS + zoom * PER_ZOOM_MS;
    return Number.isFinite(ms) ? Math.round(Math.min(PULL_MAX_MS, Math.max(PULL_MIN_MS, ms))) : PULL_MIN_MS;
}
