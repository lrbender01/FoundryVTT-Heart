// The art viewer's zoom and pan (2026-10-02, Luke: "point cursor, scroll
// wheel zooms in, click and drag to pan"). Pure, so it is tested
// (test/art-zoom.test.mjs); the viewer (art.js ArtViewer) applies the view
// as the image's transform, translate(x, y) scale(k) from its top left.
//
// A view is { k, x, y }: the zoom (1 = the piece fitted in the window) and
// where the image's top left sits, in px of the stage. The image never
// leaves a gap at the stage's edges: at 1 it sits still, zoomed in it pans
// only as far as its own edges.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;
export const FITTED = Object.freeze({ k: 1, x: 0, y: 0 });

// keep the zoomed image covering the stage (size: { w, h })
export function clampPan(v, { w, h }) {
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k));
    return {
        k,
        x: Math.min(0, Math.max(w * (1 - k), v.x)),
        y: Math.min(0, Math.max(h * (1 - k), v.y)),
    };
}

// zoom by `factor` about the point p (px of the stage): the spot under the
// cursor stays under it
export function zoomAt(v, p, factor, size) {
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
    const r = k / v.k;
    return clampPan({ k, x: p.x - (p.x - v.x) * r, y: p.y - (p.y - v.y) * r }, size);
}

// pan by a drag of dx, dy px
export function panBy(v, dx, dy, size) {
    return clampPan({ k: v.k, x: v.x + dx, y: v.y + dy }, size);
}

// the wheel's zoom factor: a notch (100) is about 16%, smooth for trackpads
export function wheelFactor(deltaY) {
    return Math.exp(-deltaY * 0.0015);
}
