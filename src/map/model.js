// The Heart map (2026-10-02, monorepo docs/plans/heart-map.md): a point
// crawl the delvers' journey builds up as they go, like scraps of paper
// pinned to a dark board. Every landmark the GM places sits on its own torn
// scrap (its art in a ragged circle, its name inked under it, a pin or tape
// holding it on); routes run between the scraps as threads and sketched
// lines; a paper strip down the margin is the depth gauge (Tier 0 at the
// top to the Heart at the foot). The map starts empty: the Heart changes,
// and every crew's journey is its own (Luke, 2026-10-02).
//
// Each placed landmark and link is hidden (the GM sees a dashed ghost),
// rumoured (a small torn note with an ink blot and a shaky name), or known.
// The deeper a thing sits, the more its ink wavers and reddens and the more
// ragged its paper.
//
// This module is the pure half: the layout (fvtt-heart-content's
// assets/art/map/heart-map.json, the export of Luke's Heart Map tuner: the
// look, the depth gauge, and the art library, every book landmark's art
// framing), merged with a scene's state (flags.heart.map: what is placed
// where), filtered for a viewer, and the hand-drawn geometry that both the
// Foundry renderer (render.js) and the tuner draw from. No Foundry globals:
// it is tested (test/map-model.test.mjs) and the tuner inlines it as is.

export const STATES = ['hidden', 'rumoured', 'known'];
export const LINK_KINDS = ['delve', 'rail', 'path'];
// a node's art circle at s = 1, in map px
export const NODE_SIZE = 200;
// the scene's state flag (flags.heart.map)
export const MAP_FLAG = 'map';
// the layout's version: 2 = the scrapbook map (library, gauge, board)
export const LAYOUT_VERSION = 2;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (v, list, d) => (list.includes(v) ? v : d);
const color = (v, d) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(v ?? ''));
    return m ? parseInt(m[1], 16) : d;
};

/* -------------------------------------------- */
/*  Randomness that never changes               */
/* -------------------------------------------- */

// A 32-bit hash of a string (FNV-1a): the same key always draws the same
// tear and wobble, so the map looks the same on every client and redraw
export function hashSeed(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// A seeded PRNG (mulberry32): rng() -> [0, 1)
export function rng(seed) {
    let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* -------------------------------------------- */
/*  The layout                                  */
/* -------------------------------------------- */

export const DEFAULT_INK = { delve: 0xa3231b, rail: 0xd6c6a4, path: 0xcdbf9f, text: 0x2b211c };

// The tuner's export, checked and with every field filled; null when there
// is nothing at all. The gauge's marks are the tiers, top to bottom; each
// runs from its y to the next mark's (the last to the map's foot).
export function normalizeLayout(json) {
    if (!json || typeof json !== 'object') return null;
    const w = Math.max(100, num(json.size?.w, 2400));
    const h = Math.max(100, num(json.size?.h, 3600));
    const g = json.gauge ?? {};
    // (v1 layouts had full-width bands; their tiers become the gauge's marks)
    const marks = (Array.isArray(g.marks) ? g.marks : Array.isArray(json.bands) ? json.bands : [])
        .filter(b => b && b.id)
        .map(b => ({ id: String(b.id), label: String(b.label ?? ''), sub: String(b.sub ?? ''), y: clamp(num(b.y, 0), 0, h) }))
        .sort((a, b) => a.y - b.y)
        .map((b, i, all) => ({ ...b, y1: i + 1 < all.length ? all[i + 1].y : h }));
    const library = {};
    for (const [key, n] of Object.entries(json.library ?? json.nodes ?? {})) {
        if (!n) continue;
        const f = n.frame;
        library[key] = {
            key,
            uuid: n.uuid ? String(n.uuid) : null,
            name: String(n.name ?? key),
            tier: n.tier !== undefined ? String(n.tier) : null,
            s: clamp(num(n.s, 1), 0.3, 3),
            frame: f ? { z: num(f.z, 100), x: num(f.x, 50), y: num(f.y, 50) } : null,
        };
    }
    const links = (Array.isArray(json.links) ? json.links : [])
        .filter(l => l && l.id && l.a && l.b && l.a !== l.b)
        .map(l => layoutLink(l));
    const decor = (Array.isArray(json.decor) ? json.decor : [])
        .filter(d => d && d.img)
        .map((d, i) => ({
            id: String(d.id ?? `d${i}`),
            img: String(d.img),
            x: num(d.x, w / 2), y: num(d.y, h / 2),
            w: Math.max(1, num(d.w, 600)),
            r: num(d.r, 0),
            o: clamp(num(d.o, 60), 0, 100),
            flip: Boolean(d.flip),
            blend: pick(d.blend, ['normal', 'multiply', 'screen', 'overlay', 'luminosity'], 'normal'),
            // under the scraps (on the board) or over them (a web in a corner)
            layer: pick(d.layer, ['under', 'over'], 'under'),
        }));
    const b = json.board ?? {};
    const sc = json.scraps ?? {};
    const ink = json.ink ?? {};
    return {
        w, h, library, links, decor,
        gauge: { x: clamp(num(g.x, 80), 0, w), w: Math.max(40, num(g.w, 120)), marks },
        // the board: one tile `w` map px wide (so an upscaled file tiles the same)
        board: { img: b.img ? String(b.img) : null, w: Math.max(50, num(b.w, 1200)), o: clamp(num(b.o, 100), 0, 100) },
        // the scraps' paper: each scrap takes one of these, by its key
        scraps: {
            imgs: (Array.isArray(sc.imgs) ? sc.imgs : []).filter(Boolean).map(String),
            w: Math.max(50, num(sc.w, 900)),
        },
        wash: { top: clamp(num(json.wash?.top, 0), 0, 100), bottom: clamp(num(json.wash?.bottom, 45), 0, 100) },
        ink: {
            delve: color(ink.delve, DEFAULT_INK.delve),
            rail: color(ink.rail, DEFAULT_INK.rail),
            path: color(ink.path, DEFAULT_INK.path),
            text: color(ink.text, DEFAULT_INK.text),
        },
    };
}

function layoutLink(l) {
    return {
        id: String(l.id),
        a: String(l.a),
        b: String(l.b),
        kind: pick(l.kind, LINK_KINDS, 'delve'),
        bend: num(l.bend, 0),
        start: pick(l.start, STATES, 'hidden'),
    };
}

/* -------------------------------------------- */
/*  The layout with a scene's state             */
/* -------------------------------------------- */

// The scene's flags.heart.map:
//   { nodes: { <key>: { x, y, state?, s?, actor? } | custom node },
//     links: { <id>: { a, b, kind, state?, bend?, delve? } } }
// A book landmark is on the map only once the scene places it (x and y);
// its key is its library key, and `actor` pins it to a world copy. A key
// the library doesn't have is the GM's own landmark: it needs a uuid too
// ({ uuid, name?, x, y, s?, state }).
//
// `resolve` (optional) looks a uuid up: (uuid) => { name } or null, and for
// a delve { name, resistance, max }; the DOM half passes Foundry's lookups.
export function buildMap(layout, state = {}, resolve = () => null) {
    const L = layout ?? normalizeLayout({});
    const sn = state?.nodes ?? {};
    const sl = state?.links ?? {};
    const nodes = {};
    for (const [key, s] of Object.entries(sn)) {
        if (!s || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.y))) continue;
        const book = L.library[key];
        if (!book && !s.uuid) continue;
        nodes[key] = mapNode(L, key, book, s, resolve);
    }
    const links = [];
    const seen = new Set();
    const addLink = (base, s, custom) => {
        const a = nodes[base.a];
        const b = nodes[base.b];
        if (!a || !b) return;
        seen.add(base.id);
        const delve = s.delve ? String(s.delve) : null;
        const info = delve ? resolve(delve) : null;
        const max = num(info?.max, 0);
        links.push({
            id: base.id, a: base.a, b: base.b, kind: pick(s.kind, LINK_KINDS, base.kind), custom,
            bend: num(s.bend, base.bend),
            state: pick(s.state, STATES, base.start),
            delve,
            delveName: info?.name ?? null,
            resistance: info ? num(info.resistance, 0) : null,
            max: info ? max : null,
            crossed: Boolean(info) && max > 0 && num(info.resistance, max) <= 0,
            depth: depthAt((a.y + b.y) / 2, L),
        });
    };
    for (const l of L.links) addLink(l, sl[l.id] ?? {}, false);
    for (const [id, s] of Object.entries(sl)) {
        if (seen.has(id) || !s?.a || !s?.b) continue;
        addLink(layoutLink({ ...s, id, start: s.state ?? 'known' }), s, true);
    }
    return {
        w: L.w, h: L.h, gauge: L.gauge, bands: L.gauge.marks, decor: L.decor, board: L.board,
        scraps: L.scraps, wash: L.wash, ink: L.ink, nodes, links,
    };
}

function mapNode(L, key, book, s, resolve) {
    const uuid = s.actor ? String(s.actor) : (book?.uuid ?? (s.uuid ? String(s.uuid) : null));
    const info = uuid ? resolve(uuid) : null;
    const y = clamp(num(s.y, 0), 0, L.h);
    const size = clamp(num(s.s, book?.s ?? 1), 0.3, 3);
    return {
        key,
        uuid,
        bookUuid: book?.uuid ?? null,
        name: info?.name ?? (s.name || book?.name || key),
        custom: !book,
        tier: book?.tier ?? null,
        x: clamp(num(s.x, 0), 0, L.w),
        y,
        s: size,
        radius: (NODE_SIZE * size) / 2,
        frame: book?.frame ?? null,
        state: pick(s.state, STATES, 'known'),
        depth: depthAt(y, L),
    };
}

// How deep a point is: 0 at the top of the map, 1 at its foot
export function depthAt(y, layout) {
    const h = layout?.h || 1;
    return clamp(y / h, 0, 1);
}

// The tier mark a point sits under (or null)
export function bandAt(y, layout) {
    const marks = layout?.gauge?.marks ?? layout?.bands ?? [];
    return marks.find(b => y >= b.y && y < b.y1) ?? null;
}

/* -------------------------------------------- */
/*  What a viewer sees                          */
/* -------------------------------------------- */

// viewer 'gm' sees every placed node and link (hidden ones as ghosts);
// 'player' (also the GM's player preview) sees what is rumoured or known,
// and a link only when neither end is hidden. Each item gains `look`:
// 'ghost' | 'rumoured' | 'known' (a link may be 'crossed', its delve
// spent), and each node its scrap (scrapFor) and label place.
export function viewFor(map, viewer = 'player') {
    const gm = viewer === 'gm';
    const nodes = Object.values(map.nodes)
        .filter(n => gm || n.state !== 'hidden')
        .map(n => {
            const node = { ...n, look: n.state === 'hidden' ? 'ghost' : n.state };
            node.place = labelPlace(node);
            node.scrap = scrapFor(node);
            return node;
        });
    const shown = new Set(nodes.map(n => n.key));
    const hiddenEnd = (l) => map.nodes[l.a]?.state === 'hidden' || map.nodes[l.b]?.state === 'hidden';
    const links = map.links
        .filter(l => shown.has(l.a) && shown.has(l.b))
        .filter(l => gm || (l.state !== 'hidden' && !hiddenEnd(l)))
        .map(l => ({
            ...l,
            look: l.state === 'hidden' || hiddenEnd(l) ? 'ghost' : l.crossed ? 'crossed' : l.state,
            points: linkPoints(l, map.nodes[l.a], map.nodes[l.b]),
        }));
    return { ...map, viewer: gm ? 'gm' : 'player', nodes, links };
}

// The next state when the GM clicks (dir 1) or right-clicks (dir -1)
export function nextState(state, dir = 1) {
    const i = STATES.indexOf(state);
    return STATES[(Math.max(0, i) + (dir < 0 ? STATES.length - 1 : 1)) % STATES.length];
}

/* -------------------------------------------- */
/*  The ink                                     */
/* -------------------------------------------- */

// Ink colour by depth: brown-black at the top, blood red at the foot
export const INK_TOP = 0x2b211c;
export const INK_DEEP = 0x7d1a14;
export function mixColor(a, b, t) {
    const k = clamp(t, 0, 1);
    const ch = (c, s) => (c >> s) & 0xff;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (m(16) << 16) | (m(8) << 8) | m(0);
}
export function inkAt(depth, top = INK_TOP) {
    return mixColor(top, INK_DEEP, Math.pow(clamp(depth, 0, 1), 1.4));
}
export const cssColor = (c) => `#${c.toString(16).padStart(6, '0')}`;

// How far the ink wanders, in px, at a depth: a steady hand at the top,
// shaking near the Heart
export function wobbleAt(depth) {
    return 1.5 + 12 * Math.pow(clamp(depth, 0, 1), 2);
}

// How ragged paper tears at a depth (px of jag)
export function raggedAt(depth) {
    return 3 + 9 * Math.pow(clamp(depth, 0, 1), 1.3);
}

// A smooth wander along t in [0, 1], pinned to 0 at both ends
function wander(seed) {
    const r = rng(seed);
    const f = [1 + r() * 1.5, 3 + r() * 3, 7 + r() * 5];
    const p = [r() * 6.283, r() * 6.283, r() * 6.283];
    const w = [0.6, 0.3, 0.12];
    return (t) => Math.sin(Math.PI * t) * f.reduce((s, fi, i) => s + w[i] * Math.sin(6.283 * fi * t + p[i]), 0);
}

// A quadratic curve from a to b bowed sideways by `bend` px, then wavering
// by `amp` px; points as [x, y, ...] pairs in a flat array
export function inkCurve(a, b, { bend = 0, amp = 0, seed = 'ink', step = 20 } = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = (a.x + b.x) / 2 + nx * bend;
    const cy = (a.y + b.y) / 2 + ny * bend;
    const n = Math.max(6, Math.ceil(len / step));
    const wv = wander(seed);
    const out = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const x = u * u * a.x + 2 * u * t * cx + t * t * b.x;
        const y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
        const o = amp * wv(t);
        out.push(x + nx * o, y + ny * o);
    }
    return out;
}

// A second, fainter pass of a stroke a hand would make: the same line, a
// little off, the way a pen goes over a line twice
export function sketchPass(pts, seed, amp = 2) {
    const r = rng(`pass:${seed}`);
    const drift = [(r() - 0.5) * amp * 2, (r() - 0.5) * amp * 2];
    const wv = wander(`pass2:${seed}`);
    const out = [];
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const k = Math.sin(Math.PI * t) * 0.7 + 0.3;
        out.push(pts[2 * i] + drift[0] * k + wv(t) * amp, pts[2 * i + 1] + drift[1] * k - wv(t) * amp * 0.5);
    }
    return out;
}

// A link's line, from one scrap's centre to the other's (the scraps cover
// its ends). Threads sag: with no bend set, a link bows downward by a
// little of its length, like string pinned at both ends.
export function linkPoints(link, a, b) {
    if (!a || !b) return [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // the bend that points down the map (the normal's y is dx / len)
    const sag = (dx >= 0 ? 1 : -1) * len * 0.06;
    const bend = link.bend ? link.bend : sag;
    const depth = link.depth ?? 0;
    return inkCurve(a, b, {
        bend,
        amp: wobbleAt(depth) * (link.kind === 'rail' ? 0.4 : link.kind === 'delve' ? 0.6 : 1),
        seed: `link:${link.id}`,
    });
}

// A polyline's length and the point / direction at a distance along it
export function pathLength(pts) {
    let len = 0;
    for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    return len;
}
export function pointAlong(pts, dist) {
    let left = Math.max(0, dist);
    for (let i = 2; i < pts.length; i += 2) {
        const sx = pts[i - 2], sy = pts[i - 1];
        const seg = Math.hypot(pts[i] - sx, pts[i + 1] - sy);
        if (left <= seg || i === pts.length - 2) {
            const t = seg ? Math.min(1, left / seg) : 0;
            const ux = seg ? (pts[i] - sx) / seg : 1;
            const uy = seg ? (pts[i + 1] - sy) / seg : 0;
            return { x: sx + (pts[i] - sx) * t, y: sy + (pts[i + 1] - sy) * t, ux, uy };
        }
        left -= seg;
    }
    return { x: pts[0] ?? 0, y: pts[1] ?? 0, ux: 1, uy: 0 };
}

// A polyline cut into dashes: [[x, y, ...], ...]
export function dashes(pts, dash = 18, gap = 14) {
    const total = pathLength(pts);
    const out = [];
    for (let d = 0; d < total; d += dash + gap) {
        const seg = [];
        const end = Math.min(total, d + dash);
        for (let s = d; s < end; s += 6) {
            const p = pointAlong(pts, s);
            seg.push(p.x, p.y);
        }
        const p = pointAlong(pts, end);
        seg.push(p.x, p.y);
        if (seg.length >= 4) out.push(seg);
    }
    return out;
}

// The sleepers of a rail line: short strokes across it every `every` px,
// each a little askew
export function railTies(pts, every = 26, half = 10, seed = 'rail') {
    const r = rng(`ties:${seed}`);
    const total = pathLength(pts);
    const out = [];
    for (let d = every / 2; d < total; d += every) {
        const p = pointAlong(pts, d);
        const tilt = (r() - 0.5) * 0.5;
        const ux = p.ux + tilt * p.uy;
        const uy = p.uy - tilt * p.ux;
        out.push([p.x - uy * half, p.y + ux * half, p.x + uy * half, p.y - ux * half]);
    }
    return out;
}

// A torn circle: the edge of a node's art, or (rough, small) an ink blot.
// Points as a flat [x, y, ...] polygon.
export function blob(cx, cy, r, { seed = 'blob', rough = 0.04, n = 72 } = {}) {
    const wv = rng(seed);
    const f = [2 + Math.floor(wv() * 3), 5 + Math.floor(wv() * 4), 11 + Math.floor(wv() * 6)];
    const p = [wv() * 6.283, wv() * 6.283, wv() * 6.283];
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283;
        const k = 1 + rough * (0.55 * Math.sin(f[0] * a + p[0]) + 0.3 * Math.sin(f[1] * a + p[1]) + 0.25 * Math.sin(f[2] * a + p[2]) + 0.35 * (wv() - 0.5));
        out.push(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k);
    }
    return out;
}

// How torn a node's art circle is at a depth
export function roughAt(depth) {
    return 0.025 + 0.11 * Math.pow(clamp(depth, 0, 1), 1.6);
}

// A rumoured landmark's mark: a blot and a few splatters, [{ x, y, r, pts }]
export function inkBlot(node) {
    const r = rng(`blot:${node.key}`);
    const base = node.radius * 0.36;
    const out = [{ x: node.x, y: node.y, r: base, pts: blob(node.x, node.y, base, { seed: `blot:${node.key}`, rough: 0.28, n: 48 }) }];
    const count = 2 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
        const a = r() * 6.283;
        const d = base * (1.25 + r() * 0.7);
        const rr = base * (0.08 + r() * 0.12);
        const x = node.x + Math.cos(a) * d;
        const y = node.y + Math.sin(a) * d;
        out.push({ x, y, r: rr, pts: blob(x, y, rr, { seed: `splat:${node.key}:${i}`, rough: 0.3, n: 16 }) });
    }
    return out;
}

/* -------------------------------------------- */
/*  Scraps of paper                             */
/* -------------------------------------------- */

// A torn rectangle: the box (centre cx / cy, w by h, turned rot radians)
// with every edge torn by `jag` px, the odd deeper bite. A flat polygon.
export function tornRect(cx, cy, w, h, rot = 0, { seed = 'tear', jag = 4, step = 12 } = {}) {
    const r = rng(seed);
    const pts = [];
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (let c = 0; c < 4; c++) {
        const [x0, y0] = corners[c];
        const [x1, y1] = corners[(c + 1) % 4];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(2, Math.round(len / step));
        // the edge's outward normal
        const nx = (y1 - y0) / len;
        const ny = -(x1 - x0) / len;
        for (let i = 0; i < n; i++) {
            const t = i / n;
            let off = (r() - 0.5) * 2 * jag;
            if (r() < 0.06) off -= jag * (1.5 + r() * 2);
            // corners are often torn away a little
            const corner = i === 0 && r() < 0.5 ? -jag * (1 + r() * 2) : 0;
            pts.push(x0 + (x1 - x0) * t + nx * (off + corner), y0 + (y1 - y0) * t + ny * (off + corner));
        }
    }
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const out = [];
    for (let i = 0; i < pts.length; i += 2) {
        out.push(cx + pts[i] * cos - pts[i + 1] * sin, cy + pts[i] * sin + pts[i + 1] * cos);
    }
    return out;
}

// About how wide a name sets at a font size (no font metrics here)
export function textWidth(text, size) {
    return String(text ?? '').length * size * 0.52;
}

// The label's lines: the name broken to fit `maxW` px
export function wrapName(text, size, maxW) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (cur && textWidth(t, size) > maxW) {
            lines.push(cur);
            cur = w;
        } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
}

// A node's label: its font size, lines, and where they sit (centred under
// the art, inside the scrap)
export function labelPlace(node) {
    const rumoured = node.look === 'rumoured';
    const size = rumoured ? 30 : 34;
    const r = rumoured ? node.radius * 0.5 : node.radius;
    const maxW = Math.max(r * 2 + 40, 300);
    const lines = wrapName(node.name, size, maxW);
    const rr = rng(`label:${node.key}`);
    const shake = (rumoured ? 3 : 1) * (0.5 + 4 * Math.pow(node.depth ?? 0, 1.5));
    const rot = ((rr() - 0.5) * 2 * shake * Math.PI) / 180;
    return { x: node.x, y: node.y + r + 14, size, lines, lineHeight: size * 1.15, width: Math.max(...lines.map(l => textWidth(l, size))), rot };
}

// A node's scrap of paper: the torn polygon, its turn, its paper (an index
// into the layout's scrap papers), and what holds it on (a pin, or a strip
// of tape across a corner). Rumoured landmarks get a small torn note.
export function scrapFor(node) {
    const r = rng(`scrap:${node.key}`);
    const place = node.place ?? labelPlace(node);
    const rumoured = node.look === 'rumoured';
    const art = rumoured ? node.radius * 0.5 : node.radius;
    const pad = rumoured ? 22 : 28;
    const w = Math.max(art * 2, place.width) + pad * 2;
    const labelH = place.lines.length * place.lineHeight;
    const top = node.y - art - pad;
    const bottom = place.y + labelH + pad * 0.8;
    const h = bottom - top;
    const cx = node.x;
    const cy = (top + bottom) / 2;
    const rot = ((r() - 0.5) * 2 * (2 + 4 * (node.depth ?? 0)) * Math.PI) / 180;
    const pts = tornRect(cx, cy, w, h, rot, { seed: `scrap:${node.key}`, jag: raggedAt(node.depth ?? 0) * (rumoured ? 0.8 : 1) });
    // a pin near the top edge, or tape over a top corner
    const usePin = r() < 0.6;
    const local = usePin ? { x: (r() - 0.5) * w * 0.4, y: -h / 2 + 16 } : { x: (r() < 0.5 ? -1 : 1) * (w / 2 - 10), y: -h / 2 + 8 };
    const fx = cx + local.x * Math.cos(rot) - local.y * Math.sin(rot);
    const fy = cy + local.x * Math.sin(rot) + local.y * Math.cos(rot);
    const fix = usePin
        ? { kind: 'pin', x: fx, y: fy, r: 9 }
        : { kind: 'tape', x: fx, y: fy, w: 86, h: 30, rot: rot + (local.x < 0 ? -0.75 : 0.75) + (r() - 0.5) * 0.3 };
    return { pts, cx, cy, w, h, rot, paper: Math.floor(r() * 1e6), fix };
}

/* -------------------------------------------- */
/*  The depth gauge                             */
/* -------------------------------------------- */

// The paper strip down the margin: its torn outline, the ruled line down
// it, and a tick at each tier mark
export function gaugeStrip(layout) {
    const g = layout.gauge;
    const top = 40;
    const bottom = layout.h - 40;
    const pts = tornRect(g.x, (top + bottom) / 2, g.w, bottom - top, 0, { seed: 'gauge', jag: 4, step: 16 });
    const line = inkCurve({ x: g.x + g.w * 0.3, y: top + 30 }, { x: g.x + g.w * 0.3, y: bottom - 30 }, { amp: 6, seed: 'gauge-line', step: 24 });
    const ticks = g.marks.map(m => {
        const depth = depthAt(m.y, layout);
        const y = Math.max(top + 30, m.y);
        return { id: m.id, label: m.label, sub: m.sub, y, y1: m.y1, depth, pts: inkCurve({ x: g.x - g.w * 0.42, y }, { x: g.x + g.w * 0.42, y: y + (depth - 0.5) * 6 }, { amp: 1 + wobbleAt(depth) * 0.3, seed: `tick:${m.id}`, step: 10 }) };
    });
    return { pts, line, ticks, top, bottom };
}

// How a node's art fills its circle: the frame is the tuner's z (zoom %,
// 100 = the art just covers the circle), x / y (the art's centre as % of
// the circle). Returns the art's box { x, y, w, h } in map px.
export function artBox(node, ar = 1) {
    const f = node.frame ?? { z: 100, x: 50, y: 50 };
    const d = node.radius * 2;
    const cover = ar >= 1 ? { w: d * ar, h: d } : { w: d, h: d / ar };
    const w = (cover.w * f.z) / 100;
    const h = (cover.h * f.z) / 100;
    const cx = node.x - node.radius + (d * f.x) / 100;
    const cy = node.y - node.radius + (d * f.y) / 100;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/* -------------------------------------------- */
/*  Hit tests (the GM's tools)                  */
/* -------------------------------------------- */

export function pointInPoly(pt, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
        if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// The topmost node whose scrap is under a point (or null): the last drawn
export function nodeAt(view, pt) {
    for (let i = view.nodes.length - 1; i >= 0; i--) {
        const n = view.nodes[i];
        const scrap = n.scrap ?? scrapFor(n);
        if (pointInPoly(pt, scrap.pts)) return n;
    }
    return null;
}

// The link whose line passes within `tol` px of a point (or null)
export function linkAt(view, pt, tol = 20) {
    let best = null;
    for (const l of view.links) {
        const p = l.points ?? [];
        for (let i = 2; i < p.length; i += 2) {
            const d = segDist(pt, p[i - 2], p[i - 1], p[i], p[i + 1]);
            if (d <= tol && (!best || d < best.d)) best = { d, link: l };
        }
    }
    return best?.link ?? null;
}

function segDist(pt, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((pt.x - x1) * dx + (pt.y - y1) * dy) / l2, 0, 1) : 0;
    return Math.hypot(pt.x - (x1 + t * dx), pt.y - (y1 + t * dy));
}

/* -------------------------------------------- */
/*  Edits to the scene's state                  */
/* -------------------------------------------- */

// A key for something the GM adds in play
export function customKey(prefix, existing = {}) {
    let i = 1;
    while (existing[`${prefix}${i}`]) i++;
    return `${prefix}${i}`;
}

// Is there already a link between these two nodes (either way round)?
export function hasLink(map, a, b) {
    return map.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
}

// The library entry for a landmark actor (by its uuid, the compendium entry
// it was imported from, or its name), or null
export function libraryKeyFor(layout, { uuid, source, name } = {}) {
    const entries = Object.values(layout?.library ?? {});
    const hit = entries.find(e => e.uuid && (e.uuid === uuid || e.uuid === source))
        ?? (name ? entries.find(e => e.name === name) : null);
    return hit?.key ?? null;
}
