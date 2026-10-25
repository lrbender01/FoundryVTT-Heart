// The Heart map's previews (2026-10-25, split out of layer.js): strokes and
// doodles painted as the brush will lay them, a string being tied, dashed
// lines, the corner handles, and the doodles window's tiles, as canvases and
// PIXI drawing the layer shows. Plain painting: no state of the layer's.
import { stringPoints, pickFrom, pinTint, pinScale, doodleBoard } from './model.js';

// the selection's red
export const SELECTED = 0xef5a4d;

// Strokes (board px) as the brush lays them, in three canvases at `res`
// layer px per board px: soaked in (multiplied), laid on under the grime's
// veil, and a bright one's light pass over; and the box they cover (board
// px); `short` when a stroke could not be painted yet (a texture not yet
// loaded: paint them again soon). Null when nothing could be painted. (The
// doodle in hand's ghost and the live previews: Luke 2026-10-25)
export function layPasses(painter, strokes, res, seed) {
    const layers = [];
    let short = false;
    for (const st of strokes) {
        try {
            const L = painter.strokeLayer(st, res, seed);
            if (L) layers.push(L);
        } catch {
            short = true;
        }
    }
    if (!layers.length) return null;
    const x0 = Math.min(...layers.map((L) => L.x0));
    const y0 = Math.min(...layers.map((L) => L.y0));
    const x1 = Math.max(...layers.map((L) => L.x1));
    const y1 = Math.max(...layers.map((L) => L.y1));
    const make = () => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil((x1 - x0) * res));
        c.height = Math.max(1, Math.ceil((y1 - y0) * res));
        return c;
    };
    const passes = [make(), make(), make()];
    const [gs, gl, go] = passes.map((c) => c.getContext('2d'));
    const veil = `#${painter.grimeVeil.toString(16).padStart(6, '0')}`;
    for (const L of layers) {
        const v = document.createElement('canvas');
        v.width = L.canvas.width;
        v.height = L.canvas.height;
        const vg = v.getContext('2d');
        vg.drawImage(L.canvas, 0, 0);
        vg.globalCompositeOperation = 'multiply';
        vg.fillStyle = veil;
        vg.fillRect(0, 0, v.width, v.height);
        vg.globalCompositeOperation = 'destination-in';
        vg.drawImage(L.canvas, 0, 0);
        const box = [(L.x0 - x0) * res, (L.y0 - y0) * res, (L.x1 - L.x0) * res, (L.y1 - L.y0) * res];
        gs.globalAlpha = L.soak;
        gs.drawImage(L.canvas, ...box);
        gl.globalAlpha = L.lay;
        gl.drawImage(v, ...box);
        if (L.over) {
            go.globalAlpha = L.over;
            go.drawImage(L.canvas, ...box);
        }
    }
    return { passes, box: { x0, y0, x1, y1 }, short };
}
export const PASS_BLENDS = () => [PIXI.BLEND_MODES.MULTIPLY, PIXI.BLEND_MODES.NORMAL, PIXI.BLEND_MODES.NORMAL];

// A doodle as the doodles window shows it, painted once (Luke, 2026-10-25:
// every tile was painted afresh on each change of paint, size, or window):
// the brush's own painting of it at the standard width, laid out on a tile
// 48 across, at TILE_BAKE_PX square, in white to be tinted; a drawing of
// this user's own (`saved`) in its own paints (`paints`, the look's, for its
// key), never tinted. Kept for the session, by kind, nib, and drawing.
const TILE_BAKE_PX = 128;
const tileBakes = new Map();
export function doodleBake(painter, kind, nib, saved, paints) {
    const key = JSON.stringify([kind, nib, saved ? [saved.at ?? 0, paints] : null]);
    const had = tileBakes.get(key);
    if (had) return had;
    const c = document.createElement('canvas');
    c.width = c.height = TILE_BAKE_PX;
    const g = c.getContext('2d');
    g.setTransform(TILE_BAKE_PX / 48, 0, 0, TILE_BAKE_PX / 48, 0, 0);
    try {
        for (const st of doodleBoard(kind, `palette:${kind}`, { x: 24, y: 24, size: 17, c: 0, w: 9, b: 1, o: 1, n: nib, saved })) painter.drawStroke(g, st, `palette:${kind}`, saved ? null : 0xffffff);
    } catch {
        // (a texture not yet loaded: painted again next time, never kept)
        return c;
    }
    tileBakes.set(key, c);
    return c;
}

// A string being tied as it will be (Luke, 2026-10-25): its rope sagging
// from where it starts to where it ends, in its paint (or its kind's own),
// a pin at each end in the string's colour or its own. A canvas at `res`
// layer px per board px, and the box it covers (board px); null when it
// can't be painted yet.
export function stringGhost(painter, look, s, res) {
    const pts = stringPoints(s.from, s.to, { seed: s.seed ?? 'string-ghost', depth: 0, slack: (look.string.slack / 100) * 0.5, wander: 0 });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
    }
    const pad = Math.max(40, look.scrap.w * 0.15);
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((x1 - x0) * res));
    c.height = Math.max(1, Math.ceil((y1 - y0) * res));
    const g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    try {
        painter.drawLink(g, { id: s.seed ?? 'string-ghost', kind: s.kind, color: s.color ?? null, points: pts, look: 'known' });
        const fam = look.pools.ends?.[s.kind]?.length ? look.pools.ends[s.kind] : look.pools.pins;
        const tex = s.pin ?? pickFrom(fam, s.seed ?? 'string-ghost');
        if (tex && painter.drawPin) {
            const tint = pinTint(look, { kind: s.kind, color: s.color ?? null, plainPins: Boolean(s.plainPins) }, tex);
            const w = Math.max(11, look.scrap.w * 0.13 * 0.85) * pinScale(tex);
            painter.drawPin(g, tex, pts[0], pts[1], w, 0, tint);
            painter.drawPin(g, tex, pts[pts.length - 2], pts[pts.length - 1], w, 0, tint);
        }
    } catch (err) {
        // (a picture not yet in draws nothing; a throw is a real fault)
        console.warn('heart | the string being tied could not be painted', err);
        return null;
    }
    return { canvas: c, box: { x0, y0, x1, y1 } };
}

// A line along points (canvas px), whole or (`dash`: [on, off]) dashed
export function dashed(g, c, dash = null) {
    if (!dash) {
        g.moveTo(c[0], c[1]);
        for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1]);
        return;
    }
    let on = true;
    let left = dash[0];
    g.moveTo(c[0], c[1]);
    for (let i = 2; i < c.length; i += 2) {
        let x0 = c[i - 2];
        let y0 = c[i - 1];
        const x1 = c[i];
        const y1 = c[i + 1];
        let seg = Math.hypot(x1 - x0, y1 - y0);
        while (seg > 0) {
            const step = Math.min(left, seg);
            const t = step / seg;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            if (on) g.lineTo(x, y);
            else g.moveTo(x, y);
            x0 = x;
            y0 = y;
            seg -= step;
            left -= step;
            if (left <= 0) {
                on = !on;
                left = dash[on ? 0 : 1];
            }
        }
    }
}

// The corner handles (Luke, 2026-10-02: compact and clear): size, a hollow
// square broken along its edges; turn, a quarter arc from top-left round to
// bottom-right with an arrowhead at each end. Dark under red, so they read
// on anything.
export function handleGlyph(g, c, k, kind) {
    const pass = (w, color, alpha) => {
        g.lineStyle({ width: w * k, color, alpha, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
        if (kind === 'size') {
            const h = 6 * k;
            const a = 3 * k;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                g.moveTo(c.x + sx * h, c.y + sy * (h - a)).lineTo(c.x + sx * h, c.y + sy * h).lineTo(c.x + sx * (h - a), c.y + sy * h);
            }
            return;
        }
        const rad = 6.5 * k;
        const t0 = (-3 * Math.PI) / 4;
        const t1 = Math.PI / 4;
        g.moveTo(c.x + Math.cos(t0) * rad, c.y + Math.sin(t0) * rad).arc(c.x, c.y, rad, t0, t1, false);
        for (const [t, sgn] of [[t0, -1], [t1, 1]]) {
            const px = c.x + Math.cos(t) * rad;
            const py = c.y + Math.sin(t) * rad;
            const dx = -Math.sin(t) * sgn;
            const dy = Math.cos(t) * sgn;
            const b = 3.2 * k;
            g.moveTo(px - dx * b - dy * b * 0.8, py - dy * b + dx * b * 0.8).lineTo(px, py).lineTo(px - dx * b + dy * b * 0.8, py - dy * b - dx * b * 0.8);
        }
    };
    pass(3.4, 0x1a0d0b, 0.7);
    pass(1.6, SELECTED, 1);
}
