// Party sheet decorations (2026-10-02, docs/plans/heart-party-art.md): the
// layout maths for the export of Luke's Heart Party Sheet Art tool
// (docs/mocks/party-art/), drawn exactly as the tool draws it. Pure, so it is
// tested (test/party-decor.test.mjs); the DOM half is in sheet.js.
//
// A decoration is anchored to a box: `sheet` (the sheet's content), `header`
// (the header block), or a section (SECTION_ANCHORS). `corner` names one of
// the box's nine points; the decoration's CENTRE sits at that point plus
// x, y px. `w` is its width (its height follows the image), `r` degrees of
// turn, `flip` mirrors it, `o` is its opacity in %, `blend` its blend mode.
// Layers: `behind` (under the sections; shows around and between them),
// `in` (inside its section, behind the content; `clip` keeps it inside the
// section's rounded box), and `over` (above everything). Decorations draw
// in array order, later on top within a layer.

export const SECTION_ANCHORS = ['members', 'companions', 'fallouts', 'provisions', 'items', 'notes', 'beats'];
export const ANCHORS = ['sheet', 'header', ...SECTION_ANCHORS];
export const LAYERS = ['behind', 'in', 'over'];
export const HOVERS = ['none', 'fade', 'reveal', 'glow', 'lift', 'hide'];
export const BLENDS = ['normal', 'screen', 'lighten', 'luminosity', 'soft-light', 'overlay', 'multiply'];

// the nine points of a box, as fractions of its width and height (the tool's)
export const POINTS = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] };

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

// The tool's export, checked and with every field filled; null when there is
// nothing to draw. Unknown anchors, layers, and so on fall back to the
// tool's defaults rather than failing.
export function normalizeArt(json) {
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
            anchor: pick(d.anchor, ANCHORS, 'sheet'),
            corner: POINTS[d.corner] ? d.corner : 'c',
            x: num(d.x, 0), y: num(d.y, 0),
            w: Math.max(1, num(d.w, 200)),
            r: num(d.r, 0),
            o: Math.min(100, Math.max(0, num(d.o, 100))),
            flip: Boolean(d.flip),
            layer: pick(d.layer, LAYERS, 'over'),
            clip: Boolean(d.clip),
            blend: pick(d.blend, BLENDS, 'normal'),
            hover: pick(d.hover, HOVERS, 'none'),
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

// The inline style of one decoration (the tool's custom properties)
export function decorStyle(d) {
    return `--r:${d.r}deg;--fx:${d.flip ? -1 : 1};--o:${d.o / 100};--blend:${d.blend};width:${d.w}px`;
}

// Where each decoration goes, given the boxes the DOM measured:
//   boxes = { sheet: {left, top, width, height}, header: {...}, members: {...}, ... }
// every box relative to the sheet-level layers' origin. Returns, in draw
// order: { id, img, layer, host, clip, left, top, style, hover, anchor }.
//   host: 'behind' | 'over' for the sheet-level layers, or the section key
//   for `in` (left / top then from the section's own box). An `in`
//   decoration on the sheet or header goes to the behind layer, as the tool
//   does. A decoration whose anchor wasn't measured (a section the sheet
//   doesn't show, e.g. Companions with none) is left out.
export function decorLayout(art, boxes) {
    const out = [];
    for (const d of art?.decor ?? []) {
        const box = boxes?.[d.anchor];
        if (!box) continue;
        const p = anchorPoint(box, d.corner);
        const inSection = d.layer === 'in' && SECTION_ANCHORS.includes(d.anchor);
        const layer = inSection ? 'in' : d.layer === 'over' ? 'over' : 'behind';
        out.push({
            id: d.id,
            img: d.img,
            anchor: d.anchor,
            layer,
            host: inSection ? d.anchor : layer,
            clip: inSection && d.clip,
            left: (inSection ? p.local.x : p.x) + d.x,
            top: (inSection ? p.local.y : p.y) + d.y,
            style: decorStyle(d),
            hover: d.hover,
        });
    }
    return out;
}

// An image name from the export, as a path in the content module ("rope" or
// "rope.webp" in the party art folder; a name with a slash is a path inside
// the module)
export const PARTY_ART_DIR = 'modules/fvtt-heart-content/assets/art/party';
export function partyArtUrl(img) {
    const name = String(img ?? '');
    if (!name) return '';
    if (/^(https?:|data:|modules\/|systems\/)/.test(name)) return name;
    if (name.includes('/')) return `modules/fvtt-heart-content/${name.replace(/^\/+/, '')}`;
    return `${PARTY_ART_DIR}/${/\.[a-z0-9]+$/i.test(name) ? name : `${name}.webp`}`;
}
