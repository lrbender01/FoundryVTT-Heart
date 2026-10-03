// Sheet decorations (2026-10-02; shared by the party and character sheets
// since 2026-10-02): the layout maths for the exports of Luke's sheet art
// tools (docs/mocks/party-art/, docs/mocks/character-art/), drawn exactly as
// the tools draw them. Pure, so it is tested (test/party-decor.test.mjs,
// test/decor.test.mjs); the DOM half is decor-dom.js.
//
// A decoration is anchored to a box: `sheet` (the sheet's content),
// `header` (the header block), or another named box (a section, or a whole
// tab). `corner` names one of the box's nine points; the decoration's CENTRE
// sits at that point plus x, y px. `w` is its width (its height follows the
// image), `r` degrees of turn, `flip` mirrors it, `o` is its opacity in %,
// `blend` its blend mode, `hover` what it does while the pointer is over its
// anchor. Layers: `behind` (under the sections; shows around and between
// them), `in` (inside its section, behind the content), `above` (inside its
// section, over the content and its buttons, which still take the clicks,
// but under the section's title; 2026-10-02, Luke), and `over` (above
// everything). `clip` keeps an `in` or
// `above` piece inside the section's rounded box. Decorations draw in array
// order, later on top within a layer.
//
// Growing with the anchor (2026-10-02, Luke): `grow` 'h' or 'w' with `ref`,
// the anchor box's height or width (px) when the piece was tuned. The piece
// then scales uniformly by (box now / ref): its width and its x / y offsets
// from the anchor point alike, so a line lined up with part of the box stays
// on it as the box grows. 'none' (or no ref) keeps the fixed size.

export const LAYERS = ['behind', 'in', 'above', 'over'];
// the layers that live inside a section
export const SECTION_LAYERS = ['in', 'above'];
export const HOVERS = ['none', 'fade', 'reveal', 'glow', 'lift', 'hide'];
export const BLENDS = ['normal', 'screen', 'lighten', 'luminosity', 'soft-light', 'overlay', 'multiply'];
export const GROWS = ['none', 'h', 'w'];
// what a decoration does on hover when the export doesn't say (2026-10-02,
// Luke: every newly placed piece lifts)
export const DEFAULT_HOVER = 'lift';
// and its opacity in % when the export doesn't say
export const DEFAULT_OPACITY = 30;

// the nine points of a box, as fractions of its width and height (the tools')
export const POINTS = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] };

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

// One tool export, checked and with every field filled; null when there is
// nothing to draw. `anchors` are the boxes this sheet has; unknown anchors,
// layers, and so on fall back to the tools' defaults rather than failing.
// The banner is the party tool's (the character sheet has none).
export function normalizeDecorArt(json, anchors) {
    if (!json || typeof json !== 'object') return null;
    const b = json.banner ?? {};
    const banner = b.on && b.img ? {
        img: String(b.img),
        z: num(b.z, 100), x: num(b.x, 50), y: num(b.y, 50),
        ar: Number(b.ar) > 0 ? Number(b.ar) : null,
    } : null;
    const decor = (Array.isArray(json.decor) ? json.decor : [])
        .filter(d => d && d.img)
        .map((d, i) => ({
            id: String(d.id ?? `d${i}`),
            img: String(d.img),
            anchor: pick(d.anchor, anchors, 'sheet'),
            corner: POINTS[d.corner] ? d.corner : 'c',
            x: num(d.x, 0), y: num(d.y, 0),
            w: Math.max(1, num(d.w, 200)),
            r: num(d.r, 0),
            // 30% unless the export says otherwise (2026-10-02, Luke: art
            // on a sheet is 30%; only the header banners are solid)
            o: Math.min(100, Math.max(0, num(d.o, DEFAULT_OPACITY))),
            flip: Boolean(d.flip),
            layer: pick(d.layer, LAYERS, 'over'),
            clip: Boolean(d.clip),
            blend: pick(d.blend, BLENDS, 'normal'),
            hover: pick(d.hover, HOVERS, DEFAULT_HOVER),
            grow: pick(d.grow, GROWS, 'none'),
            ref: Math.max(0, num(d.ref, 0)),
        }));
    if (!banner && !decor.length) return null;
    return { banner, decor };
}

// An anchor box's point: { x, y } from the box's own left / top, and from
// the layer origin (the box's left / top are relative to it)
export function anchorPoint(box, corner) {
    const [fx, fy] = POINTS[corner] ?? POINTS.c;
    const local = { x: box.width * fx, y: box.height * fy };
    return { local, x: box.left + local.x, y: box.top + local.y };
}

// The lift (2026-10-02, Luke): a lifted piece grows by this many pixels of
// width whatever its size (util.sass $art-lift, kept equal)
export const LIFT_PX = 20;

// The inline style of one decoration (the tools' custom properties), at
// scale s (growScale); --lift is the scale that adds LIFT_PX to its width
export function decorStyle(d, s = 1) {
    const width = d.w * s;
    const lift = Math.round((1 + LIFT_PX / Math.max(1, width)) * 10000) / 10000;
    return `--r:${d.r}deg;--fx:${d.flip ? -1 : 1};--o:${d.o / 100};--blend:${d.blend};--lift:${lift};width:${width}px`;
}

// How much a piece that grows with its anchor is scaled now: the box's
// height or width over the one it was tuned at (1 for a fixed piece)
export function growScale(d, box) {
    if (!box || !(d.ref > 0)) return 1;
    if (d.grow === 'h') return box.height / d.ref;
    if (d.grow === 'w') return box.width / d.ref;
    return 1;
}

// Where each decoration goes, given the boxes the DOM measured:
//   boxes = { sheet: {left, top, width, height}, header: {...}, members: {...}, ... }
// every box relative to the sheet-level layers' origin, and `sections` the
// anchors that are titled sections (an `in` decoration goes inside one).
// Returns, in draw order: { id, img, layer, host, clip, left, top, style,
// hover, anchor, index } (index: its place in art.decor).
//   host: 'behind' | 'over' for the sheet-level layers, or the section key
//   for `in` / `above` (left / top then from the section's own box). An
//   `in` decoration on the sheet, the header, or a tab goes to the behind
//   layer, and an `above` one to the over layer, as the tools do. A
//   decoration whose anchor wasn't measured (a section the sheet doesn't
//   show, or one on another tab) is left out.
export function decorLayout(art, boxes, sections) {
    const out = [];
    (art?.decor ?? []).forEach((d, index) => {
        const box = boxes?.[d.anchor];
        if (!box) return;
        const p = anchorPoint(box, d.corner);
        const inSection = SECTION_LAYERS.includes(d.layer) && sections.includes(d.anchor);
        const layer = inSection ? d.layer : (d.layer === 'over' || d.layer === 'above') ? 'over' : 'behind';
        const s = growScale(d, box);
        out.push({
            id: d.id,
            index,
            img: d.img,
            anchor: d.anchor,
            layer,
            host: inSection ? d.anchor : layer,
            clip: inSection && d.clip,
            left: (inSection ? p.local.x : p.x) + d.x * s,
            top: (inSection ? p.local.y : p.y) + d.y * s,
            style: decorStyle(d, s),
            hover: d.hover,
        });
    });
    return out;
}

// An image name from an export, as a path in the content module: "rope" or
// "rope.webp" in the tool's art folder `dir`; a name with a slash is a path
// inside the module
export function decorArtUrl(dir, img) {
    const name = String(img ?? '');
    if (!name) return '';
    if (/^(https?:|data:|modules\/|systems\/)/.test(name)) return name;
    if (name.includes('/')) return `modules/fvtt-heart-content/${name.replace(/^\/+/, '')}`;
    return `${dir}/${/\.[a-z0-9]+$/i.test(name) ? name : `${name}.webp`}`;
}

// Where a point falls on a decoration's image, as fractions of its width and
// height ({ u, v }, 0 to 1 inside it), or null when it misses. The image is
// drawn centred on `center`, `width` x `height` before its turn (`r`
// degrees), mirror (`flip`), and any hover `scale`; all in one coordinate
// space (the click's).
export function decorUV(point, { center, width, height, r = 0, flip = false, scale = 1 }) {
    if (!(width > 0 && height > 0 && scale > 0)) return null;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    // undo the turn (CSS turns clockwise for positive degrees, y down)
    const a = (-r * Math.PI) / 180;
    let x = (dx * Math.cos(a) - dy * Math.sin(a)) / scale;
    const y = (dx * Math.sin(a) + dy * Math.cos(a)) / scale;
    if (flip) x = -x;
    const u = x / width + 0.5;
    const v = y / height + 0.5;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}
