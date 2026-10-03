// The Heart map board (2026-10-02, the scrapboard rework; design phase, in
// the Heart Map Board mock). A dark board the delvers' journey is pinned to
// as they go: each landmark is a real piece of the books' paper with its art
// as a torn clipping taped or pinned on and its name handwritten under it;
// rumours are small notes; the GM's own notes are scraps too; red string,
// twine, and pale thread run between the pins; anything from the texture set
// or the content art can be placed as decoration. The board itself is one
// enormous ledger sheet of dark, torn, scratched paper, folded into panels:
// the party's map, spread out by the fire (Luke, 2026-10-02). There is no
// depth gauge (players needn't be told how deep they are), but the deeper a
// thing sits, the shakier and redder the hand that wrote it. Strings are
// rope textures laid along a curve (PIXI SimpleRope in Foundry).
//
// Pure (no DOM, no Foundry), and the one copy both editors run: the Heart
// Map Board mock (docs/mocks/heart-map/, the primary editor and the source
// of truth for the look) inlines this file into its page and draws it with
// canvas 2D; the system's map scene draws the same geometry with PIXI
// (sprites, polygons, masks, text). Change the map here, then rebuild the
// mock (node build.mjs there) so the two stay in lockstep. Two documents:
//   look   the style and the art library: the content module's
//          heart-map.json (v3), from the mock's "Look and library" export
//   board  what is pinned where: a scene's flags.heart.map in Foundry, the
//          mock's "Board" export
// Texture and art references are ids: 'tx/<folder>__<name>' (the texture
// set, assets/art/map/textures in Foundry) and 'art/<kind>__<name>' (the
// content art, placed by reference, never copied).

export const STATES = ['hidden', 'rumoured', 'known'];
export const LINK_KINDS = ['delve', 'rail', 'path'];
// The marker at its widest: three strings wide (Luke, 2026-10-03)
export const markMax = (look) => (look?.string?.w ?? 4) * 3;
export const SCRAP_TYPES = ['landmark', 'note', 'scrawl'];
// How a card's writing is set (Luke, 2026-10-03): which way its lines align
// in its box, and bold, italic, underlined, or struck through
export const ALIGNS = ['left', 'center', 'right'];
export const TEXT_STYLES = ['bold', 'italic', 'underline', 'strike'];
export function textStyleOf(o = {}) {
    const out = { align: ALIGNS.includes(o?.align) ? o.align : null };
    for (const k of TEXT_STYLES) out[k] = Boolean(o?.[k]);
    return out;
}
// the canvas font prefix for a style ('italic bold', or '')
export const fontStyle = (st) => [st?.italic ? 'italic' : '', st?.bold ? 'bold' : ''].filter(Boolean).join(' ');
export const LOOK_VERSION = 3;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (v, list, d) => (list.includes(v) ? v : d);
// a palette: up to six colours (the defaults if none read)
const MAX_INKS = 16;
const inks = (list, d) => {
    const out = (Array.isArray(list) ? list : []).map((c) => color(c, null)).filter((c) => c !== null).slice(0, MAX_INKS);
    return out.length ? out : d.map((c) => color(c, 0));
};
const color = (v, d) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(v ?? ''));
    return m ? parseInt(m[1], 16) : d;
};
const strList = (v, d) => (Array.isArray(v) ? v.filter(Boolean).map(String) : d);
const DEG = Math.PI / 180;

/* -------------------------------------------- */
/*  Seeded randomness                           */
/* -------------------------------------------- */

export function hashSeed(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

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

// One of a list, the same one for the same seed
export function pickFrom(list, seed) {
    if (!list?.length) return null;
    return list[hashSeed(seed) % list.length];
}

/* -------------------------------------------- */
/*  The look and the library                    */
/* -------------------------------------------- */

export const DEFAULT_LOOK = {
    size: { w: 3200, h: 3600 },
    // the ledger sheet: a paper texture tiled `tile` px wide, darkened toward
    // `tint` by `darken` %, with scratch and grime overlays, folded into
    // cols x rows panels, its torn edge `jag` px and burnt `burn` px in
    sheet: {
        // 'panels': each fold panel is its own whole paper (from `papers`),
        // flipped or turned by its seed, so nothing visibly repeats;
        // 'tile': one paper repeated (a TilingSprite)
        // `match`: how far (%) each panel's paper is evened toward the sheet's
        // average tone; `crop`: how far each paper is zoomed so its own torn
        // border is cut away and the panels meet edge to edge
        mode: 'panels', papers: [], match: 85, crop: 1.05,
        paper: 'tx/paper__portrait__paper_aged_creased_torn_portrait', tile: 1400, darken: 72, tint: '#4a3527',
        // grime and scratch overlays: each tiled `tile` px wide (mirrored, so
        // no seams; turned by its seed, so the repeats don't line up with the
        // folds or each other), softened by `blur` board px
        scratches: [
            { tex: 'tx/overlay__overlay_soft_grey_blotches_portrait', o: 45, blend: 'multiply', tile: 700, blur: 1 },
            { tex: 'tx/overlay__overlay_black_scratches_portrait', o: 40, blend: 'multiply', tile: 600, blur: 0.6 },
            { tex: 'tx/overlay__overlay_white_scratches_portrait', o: 18, blend: 'screen', tile: 640, blur: 0.6 },
        ],
        // `wear`: rubbed, lighter patches where the folds cross
        folds: { cols: 4, rows: 4, o: 55, wear: 50 },
        // the ledger's printed rules: a red double margin line down the left and a
        // rule under the head, `o` % strong (0: none)
        ledger: { o: 30 },
        // the sheet's edge: `margin` px of table around it, torn `jag` px,
        // burnt `burn` px in (thin: it only marks where the sheet ends)
        edge: { margin: 10, jag: 3, burn: 12 },
    },
    // firelight: warm light from below the sheet (the party's fire)
    fire: 45,
    // a darkening and a faint red stain toward the foot (the Heart); no gauge
    wash: { top: 0, bottom: 25 },
    glow: 25,
    vignette: 35,
    // the hands that write on the board: each scrap takes one by its name (the
    // party's different writers); `scale` evens out the faces' sizes
    fonts: { hands: ['Reenie Beanie'], display: 'Mosherif', scale: {} },
    // `text` on paper; `scrawl` straight on the dark sheet (grease pencil)
    // the inks a card or writing is written in (Luke, 2026-10-02: a few
    // presets, legible, never busy): on paper (iron-gall brown, blue-black,
    // oxblood, graphite) and straight on the dark sheet (chalk, ochre wax,
    // red chalk, slate); a scrap with none chosen takes one by its name
    ink: {
        text: '#241a16', scrawl: '#2e231c',
        // (a full spread, every colour burnt and grimy: Luke, 2026-10-02;
        // a card with none chosen takes one of the first `auto`)
        paper: ['#241a16', '#1c2a44', '#5c1610', '#3a3631', '#4a2f1c', '#7a2414', '#7a3a18', '#5e4718', '#33421f', '#24443b', '#272a52', '#3e2546'],
        // paints and chalks on the dark sheet, worn into it
        sheet: ['#8c8473', '#7a2a1f', '#7d6029', '#3d5266', '#66615a', '#5c1714', '#844020', '#857337', '#4a5733', '#375a4f', '#343857', '#503755', '#744c4c'],
        auto: 4,
    },
    // colour grading, so book art sits in the same world as the paper:
    // saturation, sepia, and brightness in %. `clip` for the landmark
    // clippings, `art` for placed content art (a piece may override it)
    grade: { clip: { sat: 70, sepia: 30, bright: 88 }, art: { sat: 60, sepia: 40, bright: 82 }, paper: { sat: 75, sepia: 15, bright: 92 }, panel: { sat: 35, sepia: 20, bright: 100 } },
    // each string kind's rope texture; every string is drawn `string.w` board
    // px thick (one narrow width, so none goes grainy)
    ropes: {
        delve: { texs: ['rope/red_1', 'rope/red_2', 'rope/red_3'] },
        rail: { texs: ['rope/violet_1', 'rope/violet_2', 'rope/violet_3', 'rope/violet_4'] },
        path: { texs: ['rope/pale_1', 'rope/pale_2', 'rope/pale_3'] },
    },
    string: { w: 4, slack: 100 },
    // small, so a campaign's twenty-odd places, their delves, and their tags
    // all fit with room to read
    scrap: { w: 200 },
    // the pools each kind of scrap and fixture draws from (texture ids); the
    // GM can always swap one scrap's paper or fixture
    pools: { papers: [], notes: [], pins: [], tapes: [], stains: [], ends: { delve: [], rail: [], path: [] } },
    // how dirty the map is (0-100): every scrap's paper (soot, gunpowder,
    // stains, darkened edges), the sheet under them, and how much of the
    // stain is blood, thickening toward the Heart (Luke, 2026-10-02: "grime
    // and soot and gunpowder and blood from the heart all over everything")
    // stitches: seams sewn along the folds; mends: strips of tape over them
    // (none by default: Luke, 2026-10-02, tape stays off the background)
    grime: { scraps: 60, sheet: 55, blood: 45, stitches: 70, mends: 0 },
    // the background's decorations (same shape as a board's decor): drawn
    // with the sheet, under everything on the board, the same on every map;
    // the board's own decor is the scene's foreground
    decor: [],
};

export function normalizeLook(json) {
    const j = json && typeof json === 'object' ? json : {};
    const D = DEFAULT_LOOK;
    const w = Math.max(200, num(j.size?.w, D.size.w));
    const h = Math.max(200, num(j.size?.h, D.size.h));
    const library = {};
    for (const [key, e] of Object.entries(j.library ?? {})) {
        if (!e) continue;
        const f = e.clip ?? e.frame;
        library[key] = {
            key,
            uuid: e.uuid ? String(e.uuid) : null,
            name: String(e.name ?? key),
            tier: e.tier !== undefined ? String(e.tier) : null,
            art: e.art ? String(e.art) : null,
            // the art's framing in its clipping: zoom %, centre as % of the clip
            clip: { z: num(f?.z, 100), x: num(f?.x, 50), y: num(f?.y, 50) },
        };
    }
    const p = j.pools ?? {};
    return {
        v: LOOK_VERSION, w, h, library,
        sheet: normalizeSheet(j.sheet ?? {}, D.sheet),
        fire: clamp(num(j.fire, D.fire), 0, 100),
        ropes: Object.fromEntries(['delve', 'rail', 'path'].map(k => [k, { texs: strList(j.ropes?.[k]?.texs, D.ropes[k].texs) }])),
        string: { w: clamp(num(j.string?.w, D.string.w), 2, 20), slack: clamp(num(j.string?.slack, D.string.slack), 0, 300) },
        wash: { top: clamp(num(j.wash?.top, D.wash.top), 0, 100), bottom: clamp(num(j.wash?.bottom, D.wash.bottom), 0, 100) },
        glow: clamp(num(j.glow, D.glow), 0, 100),
        vignette: clamp(num(j.vignette, D.vignette), 0, 100),
        fonts: {
            hands: strList(j.fonts?.hands, j.fonts?.hand ? [String(j.fonts.hand)] : D.fonts.hands),
            display: String(j.fonts?.display ?? D.fonts.display),
            scale: { ...HAND_SCALE, ...(j.fonts?.scale ?? {}) },
        },
        grade: { clip: grade(j.grade?.clip, D.grade.clip), art: grade(j.grade?.art, D.grade.art), paper: grade(j.grade?.paper, D.grade.paper), panel: grade(j.grade?.panel, D.grade.panel) },
        ink: {
            text: color(j.ink?.text, color(D.ink.text)), scrawl: color(j.ink?.scrawl, color(D.ink.scrawl)), auto: clamp(num(j.ink?.auto, D.ink.auto), 1, MAX_INKS),
            paper: inks(j.ink?.paper, D.ink.paper), sheet: inks(j.ink?.sheet, D.ink.sheet),
        },
        scrap: { w: clamp(num(j.scrap?.w, D.scrap.w), 120, 800) },
        grime: Object.fromEntries(['scraps', 'sheet', 'blood', 'stitches', 'mends'].map((k) => [k, clamp(num(j.grime?.[k], D.grime[k]), 0, 100)])),
        pools: { papers: strList(p.papers, []), notes: strList(p.notes, []), pins: strList(p.pins, []), tapes: strList(p.tapes, []), stains: strList(p.stains, []), ends: Object.fromEntries(['delve', 'rail', 'path'].map(k => [k, strList(p.ends?.[k], [])])) },
        decor: normalizeDecor(j.decor),
    };
}

const grade = (g, d) => ({ sat: clamp(num(g?.sat, d.sat), 0, 200), sepia: clamp(num(g?.sepia, d.sepia), 0, 100), bright: clamp(num(g?.bright, d.bright), 0, 200) });

// How big each handwriting face writes at the same size (their x-heights
// differ a lot); 1 = as set
export const HAND_SCALE = {
    'Reenie Beanie': 1.2, 'Rock Salt': 0.72, 'Nothing You Could Do': 0.9, 'Homemade Apple': 0.78, 'Caveat': 1.02,
    'Covered By Your Grace': 1.02, 'Zeyada': 1.12, 'Dawning of a New Day': 1.0, 'La Belle Aurore': 0.9,
    'Cedarville Cursive': 0.88, 'Kristi': 1.15, 'Waiting for the Sunrise': 1.0, 'Just Me Again Down Here': 1.1,
};

// Each pin's default size against the others (texture stem -> factor), set
// by eye so pushpin and tack heads come out alike, nails a little smaller,
// and the long pins by their length; 1 = as the scrap sizes it
export const PIN_SCALE = {
    // iron tacks: heads about 26 px at the default scrap size
    fixture_dark_tack_head_flat: 0.76, fixture_dark_thumbtack_side: 0.76, fixture_grey_tack_head_round: 0.76,
    fixture_grey_tack_small: 0.72, fixture_iron_nail_single: 0.72, fixture_iron_pushpin_dark: 0.72,
    // coloured pushpins: heads about 22 px
    fixture_red_pushpin_long: 1.0, fixture_violet_pushpin_patterned: 0.65,
    // left out of the pools, sized in case one is picked by hand
    fixture_red_pushpin_short: 1.0, fixture_bone_spike_pin: 0.8, fixture_iron_t_pin: 0.9, fixture_iron_nail_driven: 1.2,
};
// A pin stands mostly upright (Luke, 2026-10-02): it turns only part of the
// way with the paper it is in, plus a little of its own tilt (radians)
export const UPRIGHT = 0.3;
export const pinTurn = (paperRot, own = 0) => paperRot * UPRIGHT + own;

export const pinScale = (id) => PIN_SCALE[String(id ?? '').split('__').pop()] ?? 1;

function normalizeSheet(s, D) {
    return {
        mode: pick(s.mode, ['panels', 'tile'], D.mode),
        papers: strList(s.papers, D.papers),
        match: clamp(num(s.match, D.match), 0, 100),
        crop: clamp(num(s.crop, D.crop), 1, 2),
        paper: s.paper ? String(s.paper) : D.paper,
        tile: Math.max(100, num(s.tile, D.tile)),
        darken: clamp(num(s.darken, D.darken), 0, 100),
        tint: color(s.tint, color(D.tint)),
        scratches: (Array.isArray(s.scratches) ? s.scratches : D.scratches).filter(x => x?.tex).map(x => ({
            tex: String(x.tex), o: clamp(num(x.o, 30), 0, 100), tile: Math.max(100, num(x.tile, 700)), blur: clamp(num(x.blur, 0.6), 0, 10),
            // a fixed turn in degrees (ruled lines stay level); none: turned by its seed
            angle: x.angle === undefined || x.angle === null ? null : num(x.angle, 0),
            blend: pick(x.blend, ['multiply', 'screen', 'overlay', 'normal'], 'multiply'),
        })),
        folds: { cols: clamp(Math.round(num(s.folds?.cols, D.folds.cols)), 1, 8), rows: clamp(Math.round(num(s.folds?.rows, D.folds.rows)), 1, 8), o: clamp(num(s.folds?.o, D.folds.o), 0, 100), wear: clamp(num(s.folds?.wear, D.folds.wear), 0, 100) },
        ledger: { o: clamp(num(s.ledger?.o, D.ledger.o), 0, 100) },
        edge: { margin: clamp(num(s.edge?.margin, D.edge.margin), 0, 200), jag: clamp(num(s.edge?.jag, D.edge.jag), 0, 60), burn: clamp(num(s.edge?.burn, D.edge.burn), 0, 300) },
    };
}

// The ledger sheet's torn outline, inset `margin` px from the map's edge
export function sheetOutline(look, margin = look.sheet.edge.margin) {
    const w = look.w - margin * 2;
    const h = look.h - margin * 2;
    return place(tornRect(w, h, { seed: 'sheet', jag: look.sheet.edge.jag, step: 22 }), look.w / 2, look.h / 2, 0);
}

// A paper's solid region (fractions of its image: x0, y0, x1, y1), when its
// size() doesn't say: most papers have a torn or burnt rim about this wide
export const DEFAULT_SAFE = [0.06, 0.06, 0.94, 0.94];
// below this much solid paper (diagonal tears, notches), a paper isn't used
// for scraps or panels
export const MIN_COVER = 0.4;
// the aspect (w / h) of a paper's solid region
export const safeAspect = (z) => { const sb = z.safe ?? DEFAULT_SAFE; return (z.w * (sb[2] - sb[0])) / (z.h * (sb[3] - sb[1])); };

// A colour [r, g, b] (0-255) through a grade { sat, sepia, bright }: the
// same three steps as the CSS filter and the PIXI ColorMatrixFilter
export function gradeColor(c, g) {
    const cl = (v) => clamp(v, 0, 255);
    const s = g.sat / 100;
    let [r, gr, b] = c;
    [r, gr, b] = [
        cl((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * gr + (0.072 - 0.072 * s) * b),
        cl((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * gr + (0.072 - 0.072 * s) * b),
        cl((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * gr + (0.072 + 0.928 * s) * b),
    ];
    const a = 1 - clamp(g.sepia / 100, 0, 1);
    [r, gr, b] = [
        cl((0.393 + 0.607 * a) * r + (0.769 - 0.769 * a) * gr + (0.189 - 0.189 * a) * b),
        cl((0.349 - 0.349 * a) * r + (0.686 + 0.314 * a) * gr + (0.168 - 0.168 * a) * b),
        cl((0.272 - 0.272 * a) * r + (0.534 - 0.534 * a) * gr + (0.131 + 0.869 * a) * b),
    ];
    const k = g.bright / 100;
    return [cl(r * k), cl(gr * k), cl(b * k)];
}

// The sheet's panels between its folds, each its own paper, but cut and
// toned so together they read as one folded sheet:
// [{ x, y, w, h, tex, flipX, flipY, zoom, dx, dy, gain: [r, g, b], shade }]
//   src           the paper's solid region (no torn rim, holes, or burnt bands)
//   zoom, dx, dy  how far it is zoomed past that; which part shows
//   gain          per-channel factors evening its tone toward the sheet's
//                 average (`toneOf(tex)` gives a paper's mean [r, g, b])
//   shade         + darker / - lighter: alternating with the fold direction,
//                 the way a map folded like an accordion catches the light
export function sheetPanels(look, toneOf = () => null, safeOf = () => null) {
    const S = look.sheet;
    const { cols, rows } = look.sheet.folds;
    const papers = look.sheet.papers.length ? look.sheet.papers : [look.sheet.paper];
    const out = [];
    const used = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const rr = rng(`panel:${c}:${r}`);
            // no two neighbours share a paper when there are enough of them
            let i = Math.floor(rr() * papers.length);
            for (let t = 0; t < papers.length; t++) {
                const id = papers[(i + t) % papers.length];
                if (papers.length < 3 || (used[(r - 1) * cols + c] !== id && used[r * cols + c - 1] !== id)) { i = (i + t) % papers.length; break; }
            }
            used[r * cols + c] = papers[i];
            const w = look.w / cols;
            const h = look.h / rows;
            out.push({
                x: c * w, y: r * h, w, h, tex: papers[i],
                src: safeOf(papers[i]) ?? DEFAULT_SAFE,
                flipX: rr() < 0.5, flipY: rr() < 0.5, zoom: S.crop, dx: 0.2 + rr() * 0.6, dy: 0.2 + rr() * 0.6,
                shade: (c % 2 ? 0.05 : -0.03) + (r % 2 ? 0.02 : 0) + (rr() - 0.5) * 0.02,
            });
        }
    }
    // even every panel toward the average tone of the papers in use (as
    // graded, since the gain is applied after the panel grade)
    const graded = (id) => { const t = toneOf(id); return t ? gradeColor(t, look.grade.panel) : null; };
    const tones = out.map(p => graded(p.tex)).filter(Boolean);
    const avg = tones.length ? [0, 1, 2].map(ch => tones.reduce((a, t) => a + t[ch], 0) / tones.length) : null;
    const m = S.match / 100;
    for (const p of out) {
        const t = graded(p.tex);
        p.gain = avg && t ? [0, 1, 2].map(ch => 1 + (avg[ch] / Math.max(1, t[ch]) - 1) * m) : [1, 1, 1];
    }
    return out;
}

// Where the sheet's folds cross each other, and meet its edge: [{ x, y, edge }]
export function foldCrossings(look) {
    const { cols, rows } = look.sheet.folds;
    const out = [];
    for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
            const edge = c === 0 || c === cols || r === 0 || r === rows;
            if ((c === 0 || c === cols) && (r === 0 || r === rows)) continue;
            if (edge && (c === 0 || c === cols) && rows < 2) continue;
            out.push({ x: (look.w * c) / cols, y: (look.h * r) / rows, edge });
        }
    }
    return out;
}

// The ledger's printed rules: [{ pts, w, color, o }], gently wandering lines
// (a red double margin down the left, a double rule under the head)
export function ledgerRules(look) {
    const o = look.sheet.ledger.o / 100;
    if (!o) return [];
    const W = look.w;
    const H = look.h;
    const mx = W * 0.075;
    const hy = H * 0.055;
    const v = (x, seed) => stringPoints({ x, y: 40 }, { x: x + 3, y: H - 40 }, { seed, depth: 0.1, sag: 0 });
    const h = (y, seed) => stringPoints({ x: 40, y }, { x: W - 40, y: y + 2 }, { seed, depth: 0.1, sag: 0 });
    return [
        { pts: v(mx, 'ledger:m1'), w: 4, color: 0x9a2a20, o },
        { pts: v(mx + 14, 'ledger:m2'), w: 2.5, color: 0x9a2a20, o },
        { pts: h(hy, 'ledger:h1'), w: 3, color: 0x3a3f58, o: o * 0.8 },
        { pts: h(hy + 12, 'ledger:h2'), w: 2, color: 0x3a3f58, o: o * 0.8 },
    ];
}

// The sheet's fold creases: [{ along: 'x' | 'y', pts }], each a gently
// wandering line across the sheet
export function foldLines(look) {
    const out = [];
    const { cols, rows } = look.sheet.folds;
    for (let c = 1; c < cols; c++) {
        const x = (look.w * c) / cols;
        out.push({ along: 'y', pts: stringPoints({ x, y: 30 }, { x: x + 4, y: look.h - 30 }, { seed: `foldv:${c}`, depth: 0.25, sag: 0 }) });
    }
    for (let r = 1; r < rows; r++) {
        const y = (look.h * r) / rows;
        out.push({ along: 'x', pts: stringPoints({ x: 30, y }, { x: look.w - 30, y: y + 3 }, { seed: `foldh:${r}`, depth: 0.25, sag: 0 }) });
    }
    return out;
}

/* -------------------------------------------- */
/*  The board                                   */
/* -------------------------------------------- */

// A board (a scene's state): scraps, links, decorations. Coordinates are
// board px; r is degrees; s is a size factor.
export function normalizeBoard(json) {
    const j = json && typeof json === 'object' ? json : {};
    const scraps = {};
    for (const [key, s] of Object.entries(j.scraps ?? {})) {
        if (!s || !Number.isFinite(Number(s.x)) || !Number.isFinite(Number(s.y))) continue;
        scraps[key] = {
            key,
            type: pick(s.type, SCRAP_TYPES, 'landmark'),
            lib: s.lib ? String(s.lib) : null,
            uuid: s.uuid ? String(s.uuid) : null,
            name: s.name ? String(s.name) : '',
            text: s.text ? String(s.text) : '',
            art: s.art ? String(s.art) : null,
            x: num(s.x, 0), y: num(s.y, 0),
            r: s.r === undefined || s.r === null ? null : num(s.r, 0),
            s: Math.max(0.001, num(s.s, 1)),
            paper: s.paper ? String(s.paper) : null,
            fix: pick(s.fix, ['tape', 'pin'], null),
            hand: s.hand ? String(s.hand) : null,
            // how its writing is set (align; bold, italic, underline, strike)
            ...textStyleOf(s),
            // who wrote it: a player's note (they may edit its text; it writes in
            // their own hand)
            author: s.author ? String(s.author) : null,
            z: num(s.z, 0),
            // (only a landmark is ever rumoured: anything else is shown or not)
            state: ((st) => (st === 'rumoured' && pick(s.type, SCRAP_TYPES, 'landmark') !== 'landmark' ? 'known' : st))(pick(s.state, STATES, 'known')),
            // a name tag (a note hung from a string: sized to its writing)
            tag: Boolean(s.tag),
            // where its own pin holds it to the board, as a point on its text
            // box ({ u, v }; null: near the top)
            pinAt: endAt(s.pinAt),
            // its own pin shown even when strings hold it
            pinShow: Boolean(s.pinShow),
            // its own pin taken out (dragged off onto the board, or erased)
            pinOff: Boolean(s.pinOff),
            // its ink: an index into the look's paper (or, for writing on the
            // sheet, sheet) inks; null: one picked by its name
            ink: s.ink === undefined || s.ink === null || !Number.isFinite(Number(s.ink)) ? null : clamp(Math.round(Number(s.ink)), 0, MAX_INKS - 1),
            // pieces of it moved by hand (the clipping, a strip of tape, a pin
            // through the clipping): { id: { u, v } } on its text box
            // (each { u, v } on its text box, and its own size s, turn r
            // degrees, and, for its writing, wrap width w in text box widths)
            parts: Object.fromEntries(Object.entries(s.parts && typeof s.parts === 'object' ? s.parts : {}).map(([k, p]) => [k, partAt(p)]).filter(([, p]) => p)),
            // more pins the GM put in it ({ u, v } points on its text box)
            pins: (Array.isArray(s.pins) ? s.pins : []).map(endAt).filter(Boolean),
            // the marker on it (Luke, 2026-10-03): { id: { by, c, w, o, pts } },
            // its points in the card's own frame (card units: its width at
            // size 1 is look.scrap.w; x along it), so they go where it goes
            marks: Object.fromEntries(Object.entries(s.marks && typeof s.marks === 'object' ? s.marks : {}).map(([id, m]) => [id, cleanStroke(m, { card: true })]).filter(([, m]) => m)),
            // a reshuffle of how it is put together (its paper, the clipping's
            // place and tilt, its tape and pins, its grime); 0: the first
            seed: Math.max(0, Math.round(num(s.seed, 0))),
        };
    }
    const links = {};
    for (const [id, l] of Object.entries(j.links ?? {})) {
        // each end is tied to a scrap (a, b: its key) or loose on the board
        // (aPt, bPt: a board point; Luke, 2026-10-02: drag strings off places
        // and onto them freely)
        // (or held by a pin of the board's own, shared with other strings:
        // aPin, bPin)
        const aPin = l?.aPin ? String(l.aPin) : null;
        const bPin = l?.bPin ? String(l.bPin) : null;
        const a = !aPin && l?.a ? String(l.a) : null;
        const b = !bPin && l?.b ? String(l.b) : null;
        const aPt = a || aPin ? null : pointAt(l?.aPt);
        const bPt = b || bPin ? null : pointAt(l?.bPt);
        if (!l || !(a || aPt || aPin) || !(b || bPt || bPin) || (a && a === b) || (aPin && aPin === bPin)) continue;
        links[id] = {
            id, a, b, aPt, bPt, aPin, bPin, kind: pick(l.kind, LINK_KINDS, 'delve'), state: pick(l.state, STATES, 'known'),
            // its colour (Luke, 2026-10-03: any string in any colour): an
            // index into the sheet's paints, the marker's; null: its kind's own
            color: l.color === undefined || l.color === null || l.color === '' || !Number.isFinite(Number(l.color)) ? null : clamp(Math.round(Number(l.color)), 0, MAX_INKS - 1),
            bend: num(l.bend, 0), label: l.label ? String(l.label) : '', resistance: l.resistance ?? null, max: l.max ?? null,
            delve: l.delve ? String(l.delve) : null,
            // its name tag: tied to the string tagAt of the way along, sitting
            // tagDx, tagDy from there, turned tagR degrees (null: by its seed)
            tagAt: clamp(num(l.tagAt, 0.5), 0.02, 0.98),
            tagDx: clamp(num(l.tagDx, 14), -1200, 1200), tagDy: clamp(num(l.tagDy, l.tagDrop ?? 80), -1200, 1200),
            tagR: l.tagR === undefined || l.tagR === null ? null : clamp(num(l.tagR, 0), -180, 180),
            // where each end ties on, as a point on its scrap's text box
            // ({ u, v } from its centre, in its widths and heights; null: the
            // side facing the other end)
            aAt: endAt(l.aAt), bAt: endAt(l.bAt),
            // a tagged string's junction, pinned where the GM put it (null: on
            // the string, tagAt of the way along); the string runs through it
            via: viaAt(l.via),
            // where the pin goes through its tag, as a point on the tag
            // ({ u, v }; null: the end of the tag facing the junction)
            tagPinAt: endAt(l.tagPinAt),
            // this string's own sag, in % of the look's gravity
            slack: clamp(num(l.slack, 100), 0, 400),
            // pins the string is pulled to between its ends (Shift+drag), in
            // order: board points it runs through, each span hanging on its own
            // (a joint is a point, or a pin of the board's own: { pin })
            joints: (Array.isArray(l.joints) ? l.joints : []).map((j) => (j?.pin ? { pin: String(j.pin) } : pointAt(j))).filter(Boolean),
            // a span pulled by hand (Ctrl+drag), by span (index: 0 from the
            // first end): its point t of the way along goes u, v span lengths
            // along and across the straight line (null: it hangs by gravity)
            pulls: (Array.isArray(l.pulls) ? l.pulls : []).map(pullAt),
        };
    }
    // pins of their own (Luke, 2026-10-02: pins as generic as strings): in a
    // scrap (on: its key, at: a point on its text box; it goes with it) or
    // loose on the board (x, y)
    const pins = {};
    for (const [id, p] of Object.entries(j.pins ?? {})) {
        if (!p?.tex) continue;
        // (s: its size set by hand, null: by its strings; r: its turn set by
        // hand, null: by its strings' pull)
        const base = { id, tex: String(p.tex), s: p.s === undefined || p.s === null ? null : Math.max(0.001, num(p.s, 1)), r: p.r === undefined || p.r === null ? null : num(p.r, 0), state: p.state === 'hidden' ? 'hidden' : 'known' };
        if (p.on && endAt(p.at)) pins[id] = { ...base, on: String(p.on), at: endAt(p.at) };
        else if (pointAt(p)) pins[id] = { ...base, on: null, ...pointAt(p) };
    }
    // the marker: each user's own layer of strokes ({ layer: { id: { c, w,
    // pts } } }: c an index into the sheet inks, w its width), drawn on the
    // sheet under everything pinned to it
    const marks = {};
    for (const [layer, strokes] of Object.entries(j.marks ?? {})) {
        const out = {};
        for (const [id, m] of Object.entries(strokes ?? {})) {
            const st = cleanStroke(m);
            if (st) out[id] = st;
        }
        if (Object.keys(out).length) marks[layer] = out;
    }
    return { scraps, links, pins, marks, decor: normalizeDecor(j.decor) };
}

const partAt = (p) => {
    const at = endAt(p);
    if (!at) return null;
    const out = { ...at };
    if (Number.isFinite(Number(p.s))) out.s = Math.max(0.001, Number(p.s));
    if (Number.isFinite(Number(p.r))) out.r = clamp(Number(p.r), -360, 360);
    if (Number.isFinite(Number(p.w))) out.w = clamp(Number(p.w), 0.1, 3);
    return out;
};
const pullAt = (p) => (p && [p.t, p.u, p.v].every((x) => Number.isFinite(Number(x))) ? { t: clamp(Number(p.t), 0.08, 0.92), u: clamp(Number(p.u), -3, 3), v: clamp(Number(p.v), -3, 3) } : null);
const pointAt = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) } : null);
const endAt = (p) => (p && Number.isFinite(Number(p.u)) && Number.isFinite(Number(p.v)) ? { u: clamp(Number(p.u), -2, 2), v: clamp(Number(p.v), -2, 2) } : null);
// where a tagged string's junction sits: t along the line between its ends,
// off px to the side of it (so it follows when the scraps move)
const viaAt = (p) => (p && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.off)) ? { t: clamp(Number(p.t), -0.5, 1.5), off: clamp(Number(p.off), -3000, 3000) } : null);

// Decorations, for a board (its foreground) or the look (the background)
export function normalizeDecor(list) {
    return (Array.isArray(list) ? list : []).filter(d => d?.tex).map((d, i) => ({
        // a piece may carry its own grading { sat, sepia, bright }
        fx: d.fx ? grade(d.fx, { sat: 100, sepia: 0, bright: 100 }) : null,
        id: String(d.id ?? `d${i}`), tex: String(d.tex),
        x: num(d.x, 0), y: num(d.y, 0), w: Math.max(4, num(d.w, 200)), r: num(d.r, 0),
        o: clamp(num(d.o, 100), 0, 100), flip: Boolean(d.flip),
        blend: pick(d.blend, ['normal', 'multiply', 'screen', 'overlay', 'lighten'], 'normal'),
        layer: pick(d.layer, ['under', 'over'], 'under'),
    }));
}

/* -------------------------------------------- */
/*  Depth and the hand                          */
/* -------------------------------------------- */

export function depthAt(y, look) {
    return clamp(y / (look?.h || 1), 0, 1);
}

export function mixColor(a, b, t) {
    const k = clamp(t, 0, 1);
    const ch = (c, s) => (c >> s) & 0xff;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (m(16) << 16) | (m(8) << 8) | m(0);
}
export const INK_DEEP = 0x7d1a14;
export const inkAt = (depth, top) => mixColor(top, INK_DEEP, Math.pow(clamp(depth, 0, 1), 1.4));
export const cssColor = (c) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

// How much the hand shakes at a depth: per-letter turn (radians) and drift (px)
export function shakeAt(depth) {
    const d = clamp(depth, 0, 1);
    return { turn: (1 + 7 * d * d) * DEG, drift: 0.4 + 3.2 * d * d, tilt: (0.5 + 3 * d) * DEG };
}

// Each letter of a line of handwriting, placed: [{ ch, x, y, rot }] from
// the line's start, using `measure(text)` for advances (canvas measureText in
// the mock, PIXI TextMetrics in Foundry)
export function handLine(text, measure, depth, seed) {
    const r = rng(`hand:${seed}`);
    const sh = shakeAt(depth);
    const out = [];
    let x = 0;
    for (const ch of String(text)) {
        out.push({ ch, x, y: (r() - 0.5) * 2 * sh.drift, rot: (r() - 0.5) * 2 * sh.turn });
        x += measure(ch) * (0.96 + r() * 0.08);
    }
    return { glyphs: out, width: x };
}

// Words wrapped to a width with `measure`
export function wrapText(text, measure, maxW) {
    const out = [];
    for (const para of String(text ?? '').split(/\n/)) {
        let cur = '';
        for (const w of para.split(/\s+/).filter(Boolean)) {
            const t = cur ? `${cur} ${w}` : w;
            if (cur && measure(t) > maxW) {
                out.push(cur);
                cur = w;
            } else cur = t;
        }
        out.push(cur);
    }
    return out;
}

/* -------------------------------------------- */
/*  Torn edges                                  */
/* -------------------------------------------- */

// A torn rectangle (local, centred on 0,0): every edge jagged by `jag` px.
export function tornRect(w, h, { seed = 'tear', jag = 3, step = 9 } = {}) {
    const r = rng(seed);
    const pts = [];
    const c = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (let k = 0; k < 4; k++) {
        const [x0, y0] = c[k];
        const [x1, y1] = c[(k + 1) % 4];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(2, Math.round(len / step));
        const nx = (y1 - y0) / len;
        const ny = -(x1 - x0) / len;
        for (let i = 0; i < n; i++) {
            const t = i / n;
            let off = (r() - 0.5) * 2 * jag;
            if (r() < 0.05) off -= jag * (1 + r() * 1.5);
            pts.push(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off);
        }
    }
    return pts;
}

// Local points turned by rot (radians) and moved to cx, cy
export function place(pts, cx, cy, rot) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const out = [];
    for (let i = 0; i < pts.length; i += 2) out.push(cx + pts[i] * c - pts[i + 1] * s, cy + pts[i] * s + pts[i + 1] * c);
    return out;
}

const toWorld = (x, y, cx, cy, rot) => ({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });

// A marker stroke made whole, or null: its paint (an index into the sheet's
// inks), width, opacity, points, and, on a card, who drew it (`card`: its
// points are card units, so not rounded)
export function cleanStroke(m, { card = false } = {}) {
    const pts = (Array.isArray(m?.pts) ? m.pts : []).map(Number).filter(Number.isFinite).slice(0, 6000);
    if (pts.length < 4 || pts.length % 2) return null;
    return {
        ...(card ? { by: m.by ? String(m.by) : null } : {}),
        c: clamp(Math.round(num(m.c, 0)), 0, MAX_INKS - 1), w: clamp(num(m.w, 6), 0.5, 60), pts: card ? pts.map((v) => Math.round(v * 10000) / 10000) : pts,
        ...(m.o === undefined || m.o === null ? {} : { o: clamp(num(m.o, 0.85), 0.05, 1) }),
    };
}

// A card's frame for its marker: its middle, turn, and unit (board px per
// card unit), from its view
export function cardFrame(vs, look) {
    const B = vs.layout.box ?? vs.layout.paper;
    return { cx: B.cx, cy: B.cy, rot: B.rot, unit: look.scrap.w * (vs.s ?? 1) };
}
// a stroke on the board (pts board px, w board px) as the card's own
export function strokeToCard(st, vs, look) {
    const F = cardFrame(vs, look);
    const c = Math.cos(-F.rot), s = Math.sin(-F.rot);
    const pts = [];
    for (let i = 0; i < st.pts.length; i += 2) {
        const dx = st.pts[i] - F.cx, dy = st.pts[i + 1] - F.cy;
        pts.push((dx * c - dy * s) / F.unit, (dx * s + dy * c) / F.unit);
    }
    return cleanStroke({ ...st, pts, w: st.w / (vs.s ?? 1) }, { card: true });
}
// a card's stroke on the board
export function strokeFromCard(st, vs, look) {
    const F = cardFrame(vs, look);
    const pts = [];
    for (let i = 0; i < st.pts.length; i += 2) {
        const p = toWorld(st.pts[i] * F.unit, st.pts[i + 1] * F.unit, F.cx, F.cy, F.rot);
        pts.push(p.x, p.y);
    }
    return { by: st.by ?? null, c: st.c, w: st.w * (vs.s ?? 1), ...(st.o === undefined ? {} : { o: st.o }), pts };
}

/* -------------------------------------------- */
/*  A scrap's layout                            */
/* -------------------------------------------- */

// Everything one scrap draws, in board px. `size(texId)` returns { w, h }
// of a texture (or null); `measure(text, px)` a text width in px.
//   paper  { tex, cx, cy, w, h, rot }       the paper piece, centred
//   clip   { pts, box: {cx, cy, w, h, rot}, art } the torn art clipping
//   blot   [pts...]                          a rumour's ink blot
//   lines  [{ text, x, y, size, rot }]       handwriting, centred lines
//   tapes  [{ tex, cx, cy, w, rot }]         tape over the clipping
//   pin    { tex, x, y, w, rot }             the pin that holds it (strings tie here)
//   hull   [pts]                             the paper's outline, for hit tests
// A tilt of up to `max` degrees either way from a draw v in -0.5..0.5:
// mostly small, now and then steep (Luke, 2026-10-03: a more varied hand,
// never past about 20 degrees)
const tilt = (v, max) => Math.sign(v) * max * Math.pow(Math.abs(2 * v), 1.5);

// The ways a card is made up (Luke, 2026-10-03: more variety than chance
// alone): from the look's papers, tape, inks, and stamps. Each recipe's
// weight, for a place (landmark) and for a note; some cards get a second
// touch from those that sit on the paper.
const RECIPES = {
    landmark: { plain: 30, stacked: 18, stamped: 12, ringed: 10, boxed: 12, taped: 10, webbed: 4, hazard: 4 },
    note: { plain: 40, stacked: 15, stamped: 8, ringed: 12, taped: 15, tallied: 6, webbed: 2, hazard: 2 },
};
const ON_PAPER = ['stamped', 'ringed', 'tallied'];
const TX = {
    stamps: ['tx/fixtures__fixture_red_ink_stamp_round', 'tx/fixtures__fixture_stamp_horned_head_brown'],
    rings: ['tx/ink__ink_coffee_ring_orange', 'tx/ink__ink_fingerprint_smudged_orange', 'tx/ink__ink_orange_fingerprint_smudge'],
    boxes: ['tx/frames__frame_ink_rough_box_landscape', 'tx/frames__frame_ink_rough_box_wide'],
    web: 'tx/decorations__deco_web_corner_many_spiders_1_crop',
    hazard: 'tx/fixtures__fixture_hazard_tape_strip',
    tally: 'tx/ink__ink_rust_tally_strokes',
};
const weighted = (table, x) => {
    const all = Object.entries(table);
    let t = x * all.reduce((n, [, w]) => n + w, 0);
    for (const [k, w] of all) if ((t -= w) < 0) return k;
    return all[0][0];
};
// A card's extra pieces: { tex, cx, cy, w, h?, rot, layer ('under' the
// paper, 'on' it (kept to the paper), or 'over' it), blend, alpha }
function cardExtras({ scrap, sk, W, H, PW, PH, pc, rot, depth, clip, look, size, isNote, paperTex }) {
    const has = (id) => Boolean(size(id));
    const r = rng(`recipe:${sk}`);
    const kind = weighted(RECIPES[isNote ? 'note' : 'landmark'], r());
    const second = r() < 0.3 ? ON_PAPER[Math.floor(r() * ON_PAPER.length)] : null;
    const out = [];
    const at = (lx, ly) => toWorld(lx, ly, scrap.x, scrap.y, rot);
    const corner = () => [r() < 0.5 ? -1 : 1, r() < 0.5 ? -1 : 1];
    const make = (k) => {
        if (k === 'stacked') {
            const pool = (isNote ? look.pools.notes : look.pools.papers).filter((id) => id !== paperTex && has(id));
            if (!pool.length) return;
            const p = { x: pc.x + (r() - 0.5) * PW * 0.12, y: pc.y + (r() - 0.5) * PH * 0.1 };
            out.push({ tex: pickFrom(pool, `${sk}:under`), cx: p.x, cy: p.y, w: PW * 1.03, h: PH * 1.03, rot: rot + tilt(r() - 0.5, 11) * DEG, layer: 'under', grade: true });
        } else if (k === 'stamped') {
            const tex = TX.stamps.filter(has)[Math.floor(r() * 2) % Math.max(1, TX.stamps.filter(has).length)];
            if (!tex) return;
            const p = at((r() - 0.5) * W * 0.6, (r() - 0.5) * H * 0.6);
            out.push({ tex, cx: p.x, cy: p.y, w: Math.min(W, H) * (0.3 + r() * 0.14), rot: rot + (r() - 0.5) * 70 * DEG, layer: 'on', alpha: 0.62 + r() * 0.2 });
        } else if (k === 'ringed') {
            const pool = TX.rings.filter(has);
            if (!pool.length) return;
            const tex = pool[Math.floor(r() * pool.length)];
            const p = at((r() - 0.5) * W * 0.8, (r() - 0.5) * H * 0.8);
            out.push({ tex, cx: p.x, cy: p.y, w: W * (0.32 + r() * 0.28), rot: r() * Math.PI * 2, layer: 'on', alpha: 0.45 + r() * 0.25 });
        } else if (k === 'boxed' && clip) {
            const tex = TX.boxes.filter(has)[clip.box.w / Math.max(1, clip.box.h) > 1.6 ? 1 : 0];
            if (!tex) return;
            out.push({ tex, cx: clip.box.cx, cy: clip.box.cy, w: clip.box.w * 1.2, h: clip.box.h * 1.24, rot: clip.box.rot + (r() - 0.5) * 6 * DEG, layer: 'on', alpha: 0.8 });
        } else if (k === 'taped') {
            const tapes = look.pools.tapes.filter(has);
            if (!tapes.length) return;
            const n = r() < 0.6 ? 2 : 4;
            const cs = n === 2 ? [[-1, -1], [1, -1]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
            cs.forEach(([sx, sy], i) => {
                const p = toWorld(sx * PW * 0.46, sy * PH * 0.46, pc.x, pc.y, rot);
                out.push({ tex: pickFrom(tapes, `${sk}:cornertape:${i}`), cx: p.x, cy: p.y, w: PW * (0.26 + r() * 0.1), rot: rot + sx * sy * (40 + r() * 14) * DEG, layer: 'over', grade: true, alpha: 0.92 });
            });
        } else if (k === 'tallied' && has(TX.tally)) {
            const [sx, sy] = corner();
            const p = at(sx * W * 0.3, sy * H * 0.34);
            out.push({ tex: TX.tally, cx: p.x, cy: p.y, w: W * (0.2 + r() * 0.08), rot: rot + (r() - 0.5) * 24 * DEG, layer: 'on', alpha: 0.75 });
        } else if (k === 'webbed' && has(TX.web)) {
            const [sx, sy] = corner();
            const p = toWorld(sx * PW * 0.38, sy * PH * 0.4, pc.x, pc.y, rot);
            out.push({ tex: TX.web, cx: p.x, cy: p.y, w: PW * 0.48, rot: rot + (sy > 0 ? Math.PI : 0), flip: sx * (sy > 0 ? -1 : 1) < 0, layer: 'over', alpha: 0.9 });
        } else if (k === 'hazard' && has(TX.hazard) && depth > 0.45) {
            const [sx, sy] = corner();
            const p = toWorld(sx * PW * 0.36, sy * PH * 0.4, pc.x, pc.y, rot);
            out.push({ tex: TX.hazard, cx: p.x, cy: p.y, w: PW * (0.5 + r() * 0.12), rot: rot + sx * sy * (38 + r() * 12) * DEG, layer: 'over', alpha: 0.9 });
        }
    };
    make(kind);
    if (second && second !== kind) make(second);
    return { recipe: kind, extras: out };
}

export function scrapLayout(scrap, look, size, measure, libEntry = null) {
    const depth = depthAt(scrap.y, look);
    const r = rng(`scrap:${scrap.key}`);
    const font = scrap.hand ?? pickFrom(look.fonts.hands, `hand:${scrap.key}`) ?? 'serif';
    const palette = scrap.type === 'scrawl' ? look.ink.sheet : look.ink.paper;
    const ink = palette?.length ? palette[scrap.ink ?? -1] ?? pickFrom(palette.slice(0, look.ink.auto ?? 4), `ink:${scrap.key}`) : scrap.type === 'scrawl' ? look.ink.scrawl : look.ink.text;
    const fk = look.fonts.scale[font] ?? 1;
    // its writing's style: measured as it is drawn
    const style = fontStyle(scrap);
    const align = scrap.align ?? 'center';
    const marks = { style, underline: Boolean(scrap.underline), strike: Boolean(scrap.strike) };
    measure = ((m) => (t, px) => m(t, px, font, style))(measure);
    // a line's offset across its box, by its alignment
    const across = (w, boxW) => (align === 'left' ? -(boxW - w) / 2 : align === 'right' ? (boxW - w) / 2 : 0);
    // its pieces moved, turned, or sized by hand (each on its text box,
    // independent of the others)
    const parts = scrap.parts ?? {};
    if (scrap.type === 'scrawl') {
        const px = Math.round(look.scrap.w * scrap.s * 0.18 * fk);
        const lines = wrapText(scrap.text || '...', (t) => measure(t, px), look.scrap.w * scrap.s * 1.7);
        const W = Math.max(px, ...lines.map((t) => measure(t, px))) + px * 0.5;
        const H = lines.length * px * 0.95 + px * 0.35;
        const rot = (scrap.r ?? tilt(r() - 0.5, 10)) * DEG;
        const out = { key: scrap.key, depth, rumour: false, font, ink, bare: true, paper: { tex: null, cx: scrap.x, cy: scrap.y, w: W, h: H, rot } };
        out.hull = place([-W / 2, -H / 2, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2], scrap.x, scrap.y, rot);
        out.lines = lines.map((text, i) => {
            const lw = measure(text, px);
            const p = toWorld(across(lw, W - px * 0.5), -H / 2 + px * 0.2 + (i + 0.5) * px * 0.95, scrap.x, scrap.y, rot);
            return { text, font, ...marks, align, w: lw, x: p.x, y: p.y, size: px, rot: rot + (r() - 0.5) * 2 * (1 + 2 * depth) * DEG, seed: `${scrap.key}:${i}` };
        });
        out.tapes = [];
        out.pin = { tex: null, x: scrap.x, y: scrap.y, w: 0, rot: 0 };
        return out;
    }
    const rumour = scrap.type === 'landmark' && scrap.state === 'rumoured';
    // what its assembly is drawn from (a reshuffle changes it, nothing else)
    const sk = scrap.seed ? `${scrap.key}~${scrap.seed}` : scrap.key;
    const isNote = scrap.type === 'note' || rumour;
    const pool = isNote ? look.pools.notes : look.pools.papers;
    // a paper of a fitting shape (by its text bounds: a landmark's clipping
    // and name stack up about square) with enough of it solid; papers mostly torn away (diagonal tears, notches) are left out
    const fits = (id) => {
        const z = size(id); if (!z) return false;
        const a = safeAspect(z);
        return (z.cover ?? 1) >= MIN_COVER && (rumour ? a > 0.6 && a < 1.7 : isNote ? a > 0.55 : a > 0.72 && a < 1.1);
    };
    const shaped = pool.filter(fits);
    // a name tag is a ticket stub, sized to its writing
    const tagged = scrap.type === 'note' && scrap.tag;
    const paperTex = scrap.paper ?? (tagged && size(TAG_PAPER) ? TAG_PAPER : pickFrom(shaped.length ? shaped : pool, sk));
    const pd = (paperTex && size(paperTex)) || { w: 3, h: 4 };
    const sb = pd.safe ?? DEFAULT_SAFE;
    // W x H from here on is the paper's solid region, where everything goes
    const ar = safeAspect(pd);
    const unit = look.scrap.w * scrap.s;
    let W = isNote ? unit * (rumour ? 0.62 : 0.72) * 0.85 : unit;
    // writing has a set size (by the scrap size, not its paper); a note's
    // paper grows, keeping its shape, until its writing fits
    const notePx = Math.round(unit * (rumour ? 0.1 : 0.115) * fk);
    const tagPx = Math.round(unit * 0.12 * fk * (parts.text?.s ?? 1));
    let tagH = null;
    if (tagged) {
        // (narrow: as wide as its writing, a line or two high)
        const ls = wrapText(scrap.text || '...', (t) => measure(t, tagPx), unit * (parts.text?.w ?? 1.5));
        W = Math.max(tagPx * 2.5, ...ls.map((t) => measure(t, tagPx))) + tagPx * 1.2;
        tagH = ls.length * tagPx * 0.95 + tagPx * 0.8;
    }
    if (isNote && !tagged) {
        const text = rumour ? `${scrap.name || libEntry?.name || scrap.key}?` : (scrap.text || '...');
        for (let i = 0; i < 16; i++) {
            const lines = wrapText(text, (t) => measure(t, notePx), W * 0.8).length;
            const need = lines * notePx * 0.95 + notePx * 0.8 + (rumour ? Math.min(W, W / ar) * 0.4 : 0) + Math.min(26, (W / ar) * 0.12) + (W / ar) * 0.07;
            if (need <= (W / ar) * 0.94) break;
            W *= 1.08;
        }
    }
    const H = tagH ?? W / ar;
    const rot = (scrap.r ?? tilt(r() - 0.5, 14 + 6 * depth)) * DEG;
    // the whole paper around its solid region (which sits at the scrap's x, y)
    const PW = W / (sb[2] - sb[0]);
    const PH = H / (sb[3] - sb[1]);
    const pc = toWorld(PW * (0.5 - (sb[0] + sb[2]) / 2), PH * (0.5 - (sb[1] + sb[3]) / 2), scrap.x, scrap.y, rot);
    const out = { key: scrap.key, seedKey: sk, depth, rumour, font, ink, paper: { tex: paperTex, cx: pc.x, cy: pc.y, w: PW, h: PH, rot }, box: { cx: scrap.x, cy: scrap.y, w: W, h: H, rot } };
    out.hull = place([-PW / 2, -PH / 2, PW / 2, -PH / 2, PW / 2, PH / 2, -PW / 2, PH / 2], pc.x, pc.y, rot);

    const handPx = tagged ? tagPx : Math.round((isNote ? notePx : unit * 0.15 * fk) * (parts.text?.s ?? 1));
    const lineH = handPx * 0.95;
    // (its writing's wrap width: its own, set by its handle's box)
    const textW = tagged ? W : parts.text?.w ? parts.text.w * W : W * 0.86;
    // (its writing's box shaped by hand, Luke 2026-10-02: a height too, and
    // writing too tall for it shrinks to fit)
    const boxH = !tagged && parts.text?.h ? parts.text.h * H : null;
    const fit = (text, px) => {
        if (!boxH) return px;
        let p = px;
        while (p > px * 0.45 && wrapText(text, (t) => measure(t, p), textW).length * p * 0.95 > boxH) p *= 0.92;
        return Math.round(p);
    };
    let top = -H / 2 + H * 0.07;
    out.lines = [];
    const addLines = (text, px0, rotJitter = 0) => {
        const px = fit(text, px0);
        for (const line of wrapText(text, (t) => measure(t, px), textW)) {
            const lw = measure(line, px);
            const lx = tagged ? 0 : across(lw, textW);
            const p = toWorld(lx, top + px * 0.55, scrap.x, scrap.y, rot);
            out.lines.push({ text: line, font, ...marks, align: tagged ? null : align, w: lw, x: p.x, y: p.y, lx, ly: top + px * 0.55, size: px, rot: rot + (r() - 0.5) * 2 * (0.5 + 2.5 * depth) * DEG + rotJitter, seed: `${scrap.key}:${out.lines.length}` });
            top += px * 0.95;
        }
    };

    if (scrap.type === 'landmark' && !rumour) {
        // the clipping: as wide as the paper allows, its height kept to fit
        // the name under it
        // (its own seed, so the rest of the scrap's draws don't shift)
        const ar = rng(`assembly:${sk}`);
        let cw = W * (0.68 + ar() * 0.2);
        let ch = cw * (0.68 + ar() * 0.12);
        const name = scrap.name || libEntry?.name || scrap.key;
        const nameLines = wrapText(name, (t) => measure(t, handPx), textW).length;
        const nameH = nameLines * handPx * 0.95 + handPx * 0.25;
        const room = H * 0.88 - nameH;
        if (ch > room) {
            ch = Math.max(room, H * 0.3);
            cw = Math.min(cw, ch / 0.6);
        }
        // the clipping and the name roughly centred on the paper, the
        // clipping nudged off true and tilted a little (always mostly upright)
        top = Math.max(-H / 2 + H * 0.05, -(ch + nameH) / 2 - H * 0.03 + (ar() - 0.5) * H * 0.09);
        const clipRot0 = (ar() - 0.5) * 2 * 6 * DEG;
        // (every draw is taken whatever is moved by hand, so the rest of the
        // assembly never shifts: a moved clipping keeps its tape)
        const ox0 = (ar() - 0.5) * (W - cw) * 0.95;
        // (the name stays where it was written when the clipping moves)
        const cy0 = top + ch / 2;
        const PC = parts.clip;
        const c0 = toWorld(ox0, cy0, scrap.x, scrap.y, rot);
        const c = PC ? toWorld(PC.u * W, PC.v * H, scrap.x, scrap.y, rot) : c0;
        const clipRot = PC?.r !== undefined ? PC.r * DEG : clipRot0;
        const ck = PC?.s ?? 1;
        const pts = place(tornRect(cw * ck, ch * ck, { seed: `clip:${sk}`, jag: 2 + 3 * depth, step: 8 }), c.x, c.y, rot + clipRot);
        out.clip = { pts, box: { cx: c.x, cy: c.y, w: cw * ck, h: ch * ck, rot: rot + clipRot }, art: scrap.art ?? libEntry?.art ?? null, frame: libEntry?.clip ?? { z: 100, x: 50, y: 50 } };
        top = cy0 + ch / 2 + handPx * 0.25;
        addLines(scrap.name || libEntry?.name || scrap.key, handPx);
        // how the clipping holds on: tape (across the top, over two or all four
        // corners) or pins (one, two, or a pin and a strip of tape), each tape
        // its own piece, length, and angle
        const fix = scrap.fix ?? (ar() < 0.6 ? 'tape' : 'pin');
        const style = pickFrom(fix === 'tape' ? ['corners', 'corners', 'top', 'cross', 'four'] : ['pin', 'pins', 'pin-tape'], `${sk}:fix`);
        // (its tape and pins sit on the card where the clipping first was,
        // each its own piece from then on)
        const crot = rot + clipRot0;
        const onClip = (lx, ly) => toWorld(lx, ly, c0.x, c0.y, crot);
        out.tapes = [];
        out.clipPins = [];
        const tape = (lx, ly, ang, len, i) => {
            const t = onClip(lx, ly);
            out.tapes.push({ tex: pickFrom(look.pools.tapes, `${sk}:tape:${i}`), cx: t.x, cy: t.y, w: len, rot: crot + ang * DEG });
        };
        const corner = (sx, sy, i) => tape(sx * cw * (0.43 + ar() * 0.06), sy * ch * (0.43 + ar() * 0.06), sx * sy * (38 + ar() * 16), cw * (0.26 + ar() * 0.14), i);
        const pinAt = (lx, ly, i) => {
            const p = onClip(lx, ly);
            const tex = pickFrom(look.pools.pins, `${sk}:clippin:${i}`);
            out.clipPins.push({ tex, x: p.x, y: p.y, w: Math.max(12, W * 0.13) * pinScale(tex), rot: pinTurn(crot, (ar() - 0.5) * 0.35) });
        };
        if (style === 'top') tape((ar() - 0.5) * cw * 0.3, -ch / 2, (ar() - 0.5) * 14, cw * (0.45 + ar() * 0.2), 0);
        else if (style === 'corners') { corner(-1, -1, 0); corner(1, -1, 1); }
        else if (style === 'cross') { corner(-1, -1, 0); corner(1, 1, 1); }
        else if (style === 'four') { corner(-1, -1, 0); corner(1, -1, 1); corner(-1, 1, 2); corner(1, 1, 3); }
        else if (style === 'pin') pinAt((ar() - 0.5) * cw * 0.3, -ch * (0.36 + ar() * 0.08), 0);
        else if (style === 'pins') { pinAt(-cw * 0.38, -ch * 0.38, 0); pinAt(cw * 0.38, -ch * 0.36, 1); }
        else { pinAt((ar() < 0.5 ? -1 : 1) * cw * 0.38, -ch * 0.38, 0); corner(ar() < 0.5 ? -1 : 1, 1, 0); }
        // now and then a strip of tape mending the paper's own edge
        if (ar() < 0.25) {
            const side = Math.floor(ar() * 4);
            const along = (ar() - 0.5) * 0.7;
            const lx = side % 2 ? (side === 1 ? W / 2 : -W / 2) : along * W;
            const ly = side % 2 ? along * H : (side === 0 ? -H / 2 : H / 2);
            const t = toWorld(lx, ly, scrap.x, scrap.y, rot);
            out.tapes.push({ tex: pickFrom(look.pools.tapes, `${sk}:mend`), cx: t.x, cy: t.y, w: W * (0.18 + ar() * 0.12), rot: rot + ((side % 2 ? 0 : 90) + (ar() - 0.5) * 30) * DEG });
        }
        out.fix = fix;
        // each piece (the clipping, its tape, its pins) moved by hand, and
        // where its handle sits
        const placeAt = (p) => toWorld(p.u * W, p.v * H, scrap.x, scrap.y, rot);
        out.tapes.forEach((t, i) => {
            const p = parts[`tape${i}`];
            if (!p) return;
            const q = placeAt(p);
            Object.assign(t, { cx: q.x, cy: q.y, w: t.w * (p.s ?? 1) }, p.r !== undefined ? { rot: rot + p.r * DEG } : {});
        });
        out.clipPins.forEach((t, i) => {
            const p = parts[`pin${i}`];
            if (!p) return;
            Object.assign(t, placeAt(p), { w: t.w * (p.s ?? 1) }, p.r !== undefined ? { rot: rot + p.r * DEG } : {});
        });
        // each piece's handle, and its frame (for its own turn and size)
        const hOf = (tex, w) => { const z = size(tex); return z ? (w * z.h) / z.w : w * 0.3; };
        out.parts = [
            { id: 'clip', x: c.x, y: c.y, w: cw * ck, h: ch * ck, rot: rot + clipRot },
            ...out.tapes.map((t, i) => ({ id: `tape${i}`, x: t.cx, y: t.cy, w: t.w, h: hOf(t.tex, t.w), rot: t.rot })),
            ...out.clipPins.map((t, i) => ({ id: `pin${i}`, x: t.x, y: t.y, w: t.w, h: hOf(t.tex, t.w), rot: t.rot })),
        ];
    } else if (rumour) {
        // an ink blot somewhere on it (its own size, place, and splatter)
        // and the name, hurried, with a question, roughly centred
        const br = rng(`rumour:${sk}`);
        const m = Math.min(W, H);
        const b = toWorld((br() - 0.5) * W * 0.62, (br() - 0.5) * H * 0.62, scrap.x, scrap.y, rot);
        out.blot = inkBlot(b.x, b.y, m * (0.07 + br() * 0.09), `blot:${sk}`);
        const name = `${scrap.name || libEntry?.name || scrap.key}?`;
        const n = wrapText(name, (t) => measure(t, handPx), textW).length;
        top = clamp(-n * handPx * 0.95 / 2 + (br() - 0.5) * H * 0.2, -H / 2 + H * 0.06, H / 2 - n * handPx * 0.95 - H * 0.06);
        addLines(name, handPx);
    } else {
        if (tagged) top = -H / 2 + tagPx * 0.4;
        addLines(scrap.text || '...', handPx);
    }
    // its writing, moved, turned, or given a new wrap width by hand (a handle
    // at the middle of the lines; its box is the lines' extent)
    const moved = parts.text;
    if (out.lines.length) {
        const ly = out.lines.reduce((t, ln) => t + (ln.ly ?? 0), 0) / out.lines.length;
        const mid = toWorld(0, ly, scrap.x, scrap.y, rot);
        const cx = out.lines.every((ln) => ln.ly !== undefined) ? mid.x : out.lines.reduce((t, ln) => t + ln.x, 0) / out.lines.length;
        const cy = out.lines.every((ln) => ln.ly !== undefined) ? mid.y : out.lines.reduce((t, ln) => t + ln.y, 0) / out.lines.length;
        let tx = cx;
        let ty = cy;
        if (moved && !tagged) {
            const q = toWorld(moved.u * W, moved.v * H, scrap.x, scrap.y, rot);
            tx = q.x;
            ty = q.y;
        }
        const turn = moved?.r !== undefined ? moved.r * DEG : 0;
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        for (const ln of out.lines) {
            const dx = ln.x - cx;
            const dy = ln.y - cy;
            ln.x = tx + dx * c - dy * sn;
            ln.y = ty + dx * sn + dy * c;
            ln.rot += turn;
        }
        const bh = out.lines.length * out.lines[0].size * 0.95;
        // (Luke, 2026-10-03: the box shows its own size, not the writing's
        // bounds: as wide as it wraps, as tall as it was shaped; writing in a
        // box taller than it sits at the box's top)
        if (boxH && boxH > bh && !tagged) {
            // ((0, -up) in the box's own frame)
            const up = (boxH - bh) / 2;
            const a = rot + turn;
            for (const ln of out.lines) {
                ln.x += up * Math.sin(a);
                ln.y -= up * Math.cos(a);
            }
        }
        (out.parts ??= []).push({ id: 'text', x: tx, y: ty, w: tagged ? Math.max(...out.lines.map((ln) => measure(ln.text, ln.size)), textW * 0.5) : textW, h: boxH ?? bh, rot: rot + turn });
    }
    // the pin that holds the paper to the board: near the top, a little off
    // centre; every string ties to it
    const pinDefault = { x: (r() - 0.5) * W * 0.3, y: -H / 2 + Math.min(26, H * 0.12) };
    const pinLocal = scrap.pinAt ? { x: scrap.pinAt.u * W, y: scrap.pinAt.v * H } : pinDefault;
    const pw = toWorld(pinLocal.x, pinLocal.y, scrap.x, scrap.y, rot);
    const pinTex = pickFrom(look.pools.pins, `${scrap.key}:pin`);
    out.pinOff = Boolean(scrap.pinOff);
    out.pin = { tex: pinTex, x: pw.x, y: pw.y, w: Math.max(12, W * 0.13) * pinScale(pinTex), base: Math.max(12, W * 0.13), rot: pinTurn(rot, (r() - 0.5) * 0.35) };
    // pins added by hand
    out.pins = (scrap.pins ?? []).map((p, i) => {
        const at = toWorld(p.u * W, p.v * H, scrap.x, scrap.y, rot);
        const tex = pickFrom(look.pools.pins, `${scrap.key}:pin:${i}`);
        return { tex, x: at.x, y: at.y, w: Math.max(12, W * 0.13) * pinScale(tex), rot: pinTurn(rot, (((hashSeed(`${scrap.key}:${i}`) % 40) - 20) * DEG) / 2) };
    });
    if (!tagged) Object.assign(out, cardExtras({ scrap, sk, W, H, PW, PH, pc, rot, depth, clip: out.clip, look, size, isNote, paperTex }));
    // the marker on it, on the board (Luke, 2026-10-03)
    out.strokes = Object.entries(scrap.marks ?? {}).map(([id, m]) => ({ id, ...strokeFromCard(m, { s: scrap.s, layout: out }, look) }));
    return out;
}

// A blot of ink with splatters: [polygon, ...]
export function inkBlot(cx, cy, rad, seed) {
    const r = rng(seed);
    const blob = (x, y, rr, n, rough) => {
        const f = [2 + Math.floor(r() * 3), 5 + Math.floor(r() * 4)];
        const p = [r() * 6.283, r() * 6.283];
        const out = [];
        for (let i = 0; i < n; i++) {
            const a = (i / n) * 6.283;
            const k = 1 + rough * (0.6 * Math.sin(f[0] * a + p[0]) + 0.3 * Math.sin(f[1] * a + p[1]) + 0.3 * (r() - 0.5));
            out.push(x + Math.cos(a) * rr * k, y + Math.sin(a) * rr * k);
        }
        return out;
    };
    const parts = [blob(cx, cy, rad, 40, 0.3)];
    const count = 3 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
        const a = r() * 6.283;
        const d = rad * (1.3 + r() * 0.8);
        parts.push(blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rad * (0.08 + r() * 0.14), 14, 0.35));
    }
    return parts;
}

// How the art fills its clipping (the library's z / x / y, as on every art
// canvas): the art's box { x, y, w, h } in the clip's own frame (centred,
// unrotated)
export function clipArtBox(box, ar, frame) {
    const f = frame ?? { z: 100, x: 50, y: 50 };
    const coverW = Math.max(box.w, box.h * ar);
    const w = (coverW * f.z) / 100;
    const h = w / ar;
    const cx = -box.w / 2 + (box.w * f.x) / 100;
    const cy = -box.h / 2 + (box.h * f.y) / 100;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/* -------------------------------------------- */
/*  String                                      */
/* -------------------------------------------- */

// A string between two pins: it sags under its weight (more over a longer
// span), bowed by `bend` px if set, with a slight wander
export function stringPoints(a, b, { bend = 0, seed = 'string', depth = 0, sag = null, slack = 1, wander = 1, pull = null } = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // gravity: a string hangs below the line between its pins, more the
    // longer and more level it runs (vertical ones hang nearly straight);
    // slack scales it (the look's string.slack)
    sag = sag ?? (20 + len * 0.25) * (0.3 + 0.7 * Math.abs(dx) / len) * slack;
    // the control point hangs below the midpoint; bend pushes it sideways
    const nx = -dy / len;
    const ny = dx / len;
    let cx = (a.x + b.x) / 2 + nx * bend;
    let cy = (a.y + b.y) / 2 + ny * bend + sag;
    // pulled by hand: the curve runs through the point it was pulled to (its
    // point t of the way along, moved u, v lengths along and across the
    // line), and gravity no longer has it
    if (pull) {
        const t = pull.t;
        const k = 2 * t * (1 - t);
        const tx = a.x + dx * t + pull.u * dx - pull.v * dy;
        const ty = a.y + dy * t + pull.u * dy + pull.v * dx;
        cx = (tx - (1 - t) * (1 - t) * a.x - t * t * b.x) / k;
        cy = (ty - (1 - t) * (1 - t) * a.y - t * t * b.y) / k;
    }
    const n = Math.max(8, Math.ceil(len / 16));
    const r = rng(`wander:${seed}`);
    const f = 2 + r() * 3;
    const p = r() * 6.283;
    const amp = (0.6 + 4 * depth * depth) * wander;
    const out = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const x = u * u * a.x + 2 * u * t * cx + t * t * b.x;
        const y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
        const o = amp * Math.sin(Math.PI * t) * Math.sin(6.283 * f * t + p);
        out.push(x + nx * o, y + ny * o);
    }
    return out;
}

// The point on a path nearest to pt: { x, y, d (its distance), s (how far
// along), i (the vertex its segment starts at) }
export function nearestOnPath(pts, pt) {
    let best = { d: Infinity, s: 0, i: 0, x: pts[0], y: pts[1] };
    let run = 0;
    for (let i = 2; i < pts.length; i += 2) {
        const x0 = pts[i - 2];
        const y0 = pts[i - 1];
        const sx = pts[i] - x0;
        const sy = pts[i + 1] - y0;
        const len = Math.hypot(sx, sy) || 1;
        const u = Math.max(0, Math.min(1, ((pt.x - x0) * sx + (pt.y - y0) * sy) / (len * len)));
        const x = x0 + u * sx;
        const y = y0 + u * sy;
        const d = Math.hypot(pt.x - x, pt.y - y);
        if (d < best.d) best = { d, s: run + u * len, i: i / 2 - 1, x, y };
        run += len;
    }
    return best;
}

// The pins a GM or a board's owners can place (the Pin tool's menu): the
// look's pin pools, then any fixture in the texture set that is a pin, tack,
// nail, or spike
export function pinChoices(look, ids = []) {
    const pools = [...(look.pools.pins ?? []), ...Object.values(look.pools.ends ?? {}).flat()];
    const more = ids.filter((id) => /fixtures__/.test(id) && /pin|tack|nail|spike/.test(id));
    return [...new Set([...pools, ...more])];
}

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
            return { x: sx + (pts[i] - sx) * t, y: sy + (pts[i + 1] - sy) * t, ux: seg ? (pts[i] - sx) / seg : 1, uy: seg ? (pts[i + 1] - sy) / seg : 0 };
        }
        left -= seg;
    }
    return { x: pts[0] ?? 0, y: pts[1] ?? 0, ux: 1, uy: 0 };
}

export function dashes(pts, dash = 16, gap = 12) {
    const total = pathLength(pts);
    const out = [];
    for (let d = 0; d < total; d += dash + gap) {
        const seg = [];
        const end = Math.min(total, d + dash);
        for (let s = d; s < end; s += 5) {
            const q = pointAlong(pts, s);
            seg.push(q.x, q.y);
        }
        const q = pointAlong(pts, end);
        seg.push(q.x, q.y);
        if (seg.length >= 4) out.push(seg);
    }
    return out;
}

/* -------------------------------------------- */
/*  What a viewer sees                          */
/* -------------------------------------------- */

// viewer 'gm' sees everything (hidden things as ghosts); 'player' sees what
// is rumoured or known, and a string only when neither end is hidden.
// Scraps come back in draw order (higher on the board first, so lower
// scraps overlap them like papers pinned on later), each with its layout.
export function boardView(look, board, viewer, size, measure) {
    const gm = viewer === 'gm';
    const scraps = Object.values(board.scraps)
        .filter(s => gm || s.state !== 'hidden')
        // (writing on the sheet always under the cards; then by layer)
        .sort((a, b) => ((b.type === 'scrawl') - (a.type === 'scrawl')) || (a.z - b.z) || (a.y - b.y))
        .map(s => ({ ...s, look: s.state === 'hidden' ? 'ghost' : s.state, layout: scrapLayout(s, look, size, measure, s.lib ? look.library[s.lib] : null) }));
    const byKey = Object.fromEntries(scraps.map(s => [s.key, s]));
    const hidden = (k) => board.scraps[k]?.state === 'hidden';
    // the board's own pins (before the strings, which may be held by them):
    // in a scrap (gone with it when players can't see it) or loose; a hidden
    // one is the GM's alone
    // (a pin's own size: by hand, else the middle of a string's three, until
    // its strings say otherwise below)
    const base = look.scrap.w * 0.13 * 0.85;
    const pinHidden = (p) => p.state === 'hidden' || (p.on && hidden(p.on));
    const pins = Object.values(board.pins ?? {}).filter((p) => gm || !pinHidden(p)).map((p) => {
        const w = Math.max(11, base * (p.s ?? 1)) * pinScale(p.tex);
        const own = ((hashSeed(p.id) % 40) - 20) / 2;
        const look2 = pinHidden(p) ? 'ghost' : 'known';
        if (!p.on) return { ...p, w, rot: (p.r ?? own) * DEG, look: look2 };
        const s = byKey[p.on];
        if (!s) return null;
        const B = s.layout.box ?? s.layout.paper;
        const at = toWorld(p.at.u * B.w, p.at.v * B.h, B.cx, B.cy, B.rot);
        return { ...p, x: at.x, y: at.y, w, rot: pinTurn(B.rot, (p.r ?? own) * DEG), look: look2 };
    }).filter(Boolean);
    const pinById = Object.fromEntries(pins.map((p) => [p.id, p]));
    const endOk = (key, pt, pinId) => (pinId ? Boolean(pinById[pinId]) : key ? Boolean(byKey[key]) : Boolean(pt));
    const links = Object.values(board.links)
        .filter(l => endOk(l.a, l.aPt, l.aPin) && endOk(l.b, l.bPt, l.bPin))
        .filter(l => gm || (l.state !== 'hidden' && !hidden(l.a) && !hidden(l.b)))
        .map(l => {
            const A = l.a ? byKey[l.a].layout : null;
            const B = l.b ? byKey[l.b].layout : null;
            const ca = A ? A.box ?? A.paper : null;
            const cb = B ? B.box ?? B.paper : null;
            const at = (L, p) => toWorld(p.u * L.w, p.v * L.h, L.cx, L.cy, L.rot);
            // a tied end sits where it was put on its scrap (else the side
            // facing the other end); a loose end where it was left; a held
            // end at its pin
            const toward = (c, pt, pinId) => (pinId ? pinById[pinId] : c ? { x: c.cx, y: c.cy } : pt);
            const endOf = (L, c, uv, pt, pinId, other) => (pinId ? { x: pinById[pinId].x, y: pinById[pinId].y } : L ? (uv ? at(c, uv) : edgePin(L, other, L.bare ? 0 : 16)) : { x: pt.x, y: pt.y });
            // its joints: points, or pins of the board's own (each keeping
            // its place in the string's list, for edits)
            const J = l.joints.map((j, i) => (j.pin ? (pinById[j.pin] ? { x: pinById[j.pin].x, y: pinById[j.pin].y, idx: i, pin: j.pin } : null) : { x: j.x, y: j.y, idx: i })).filter(Boolean);
            // (a tied end faces its nearest joint, else the other end)
            const a = endOf(A, ca, l.aAt, l.aPt, l.aPin, J[0] ?? toward(cb, l.bPt, l.bPin));
            const b = endOf(B, cb, l.bAt, l.bPt, l.bPin, J[J.length - 1] ?? toward(ca, l.aPt, l.aPin));
            const pin = (p, side) => {
                // the string's own family of pins (red for a delve, violet for the
                // Vermissian, iron tacks for a path)
                const ends = look.pools.ends?.[l.kind];
                const tex = pickFrom(ends?.length ? ends : look.pools.pins, `${l.id}:${side}`);
                return { ...p, tex, w: Math.max(11, look.scrap.w * 0.13 * 0.85 * size) * pinScale(tex), rot: (hashSeed(`${l.id}:${side}`) % 40 - 20) * DEG };
            };
            // (its pins' size, once its length is known)
            let size = 1;
            const depth = depthAt((a.y + b.y) / 2, look);
            // the way it runs: its ends, the joints it is pulled through, and a
            // named string's junction where the GM pinned it (an older board's
            // tag, until it is made a note), each span hanging (or pulled) on its own
            const mids = J.map((p) => ({ x: p.x, y: p.y, kind: 'joint', idx: p.idx, pin: p.pin ?? null }));
            let junction = null;
            if (l.label && l.via) {
                junction = viaPoint(a, b, l.via);
                const ex = b.x - a.x;
                const ey = b.y - a.y;
                const along = (p) => ((p.x - a.x) * ex + (p.y - a.y) * ey) / Math.max(1, ex * ex + ey * ey);
                let at2 = mids.findIndex((m) => along(m) > l.via.t);
                if (at2 < 0) at2 = mids.length;
                mids.splice(at2, 0, { x: junction.x, y: junction.y, kind: 'junction' });
            }
            const waypoints = [{ x: a.x, y: a.y, kind: 'end', pin: l.aPin }, ...mids, { x: b.x, y: b.y, kind: 'end', pin: l.bPin }];
            const slack = (look.string.slack / 100) * (l.slack / 100);
            const one = waypoints.length === 2;
            let points = [];
            const spans = [];
            for (let i = 0; i < waypoints.length - 1; i++) {
                const p = stringPoints(waypoints[i], waypoints[i + 1], { bend: one ? l.bend : 0, seed: one ? l.id : `${l.id}:${i + 1}`, depth, slack, wander: 0, pull: l.pulls[i] ?? null });
                const from = points.length / 2 - (i ? 1 : 0);
                points = i ? [...points, ...p.slice(2)] : p;
                spans.push({ from, to: points.length / 2 - 1 });
            }
            if (l.label && !l.via) { const p = pointAlong(points, pathLength(points) * l.tagAt); junction = { x: p.x, y: p.y }; }
            // a string's pins come in three sizes, bigger the further it runs
            // (Luke, 2026-10-02: they grow as they're pulled apart, in steps)
            const run = pathLength(points);
            size = run < 700 ? 0.8 : run < 1600 ? 1 : 1.3;
            // (an end or joint held by a board pin shows that pin, not its own)
            const ends = [{ ...pin(a, 'a'), shared: l.aPin }, { ...pin(b, 'b'), shared: l.bPin }];
            if (junction) junction = pin(junction, 'join');
            const joints = J.map((p) => ({ ...pin(p, `j${p.idx}`), idx: p.idx, shared: p.pin ?? null }));
            const pinHid = [l.aPin, l.bPin, ...J.map((j) => j.pin)].some((id) => id && pinById[id]?.look === 'ghost');
            return {
                ...l, depth, junction, joints, waypoints, spans, ends, run, tier: size,
                look: l.state === 'hidden' || hidden(l.a) || hidden(l.b) || pinHid ? 'ghost' : l.state,
                points,
            };
        })
        // (players never see a string held by a pin they can't see)
        .filter((l) => gm || l.look !== 'ghost');
    // a scrap a string ties to is held by that string's pins; its own pin
    // shows only when nothing else holds it
    for (const l of links) for (const k of [l.a, l.b]) if (k && byKey[k]) byKey[k].tied = true;
    // a pin holding strings: as big as its longest string says (Luke,
    // 2026-10-02: by distance, or by hand; never by joining), and the scrap
    // it is stuck in is held by it
    for (const l of links) {
        for (const id of [l.aPin, l.bPin, ...l.waypoints.filter((w) => w.kind === 'joint' && w.pin).map((w) => w.pin)]) {
            const p = id && pinById[id];
            if (!p) continue;
            p.tier = Math.max(p.tier ?? 0, l.tier);
            if (p.on && byKey[p.on]) byKey[p.on].tied = true;
        }
    }
    for (const p of pins) {
        if (p.s === null && p.tier) p.w = Math.max(11, base * p.tier) * pinScale(p.tex);
        // (its size against a string's middle pin, for sizing it by hand)
        p.sEff = p.w / (base * pinScale(p.tex));
    }
    // a string from a pin lying on a card to a pin stuck in that card (a name
    // tag set back on its route's pin): the near pin holds the card, so the
    // string and its far pin aren't shown (Luke, 2026-10-02)
    const hullOf = (key) => byKey[key]?.layout.hull;
    for (const l of links) {
        if (l.waypoints.length !== 2 || !l.aPin || !l.bPin) continue;
        const A = pinById[l.aPin];
        const B = pinById[l.bPin];
        const over = (P, Q) => Q?.on && P && (P.on === Q.on || (hullOf(Q.on) && pointInPoly(P, hullOf(Q.on))));
        if (over(A, B)) { l.collapsed = true; B.covered = (B.covered ?? 0) + 1; }
        else if (over(B, A)) { l.collapsed = true; A.covered = (A.covered ?? 0) + 1; }
    }
    // (a pin is hidden under its card only when every string it holds lies there)
    const holds = {};
    for (const l of links) for (const id of [l.aPin, l.bPin, ...l.waypoints.filter((w) => w.kind === 'joint' && w.pin).map((w) => w.pin)]) if (id) holds[id] = (holds[id] ?? 0) + 1;
    for (const p of pins) if (p.covered && p.covered >= (holds[p.id] ?? 0)) p.hidden = true;
    // each board pin holding strings leans by all of their pulls: a point a
    // little way along each string from it
    const n2 = (l) => l.points.length / 2;
    const ptAt = (l, i) => ({ x: l.points[2 * Math.max(0, Math.min(n2(l) - 1, i))], y: l.points[2 * Math.max(0, Math.min(n2(l) - 1, i)) + 1] });
    for (const l of links) {
        const add = (id, p) => { if (id && pinById[id]) (pinById[id].pulls ??= []).push(p); };
        add(l.aPin, ptAt(l, 5));
        add(l.bPin, ptAt(l, n2(l) - 6));
        l.waypoints.forEach((w, i) => {
            if (w.kind !== 'joint' || !w.pin) return;
            const v = l.spans[i - 1]?.to ?? 0;
            add(w.pin, ptAt(l, v - 5));
            add(w.pin, ptAt(l, v + 5));
        });
    }
    // a string's name: the note hung from one of its pins by a thread of its
    // own (Luke, 2026-10-02: a name tag is a note like any other; cut its
    // thread or its pin and the string has no name)
    for (const l of links) {
        const own = new Set(l.waypoints.filter((w) => w.kind === 'joint' && w.pin).map((w) => w.pin));
        if (!own.size) continue;
        for (const t of links) {
            if (t === l) continue;
            const cardOf = (key, pinId) => key ?? (pinId ? pinById[pinId]?.on ?? null : null);
            const end = own.has(t.aPin) ? cardOf(t.b, t.bPin) : own.has(t.bPin) ? cardOf(t.a, t.aPin) : null;
            const note = end ? byKey[end] : null;
            if (note?.type === 'note') {
                l.named = note.text;
                l.nameNote = note.key;
                (l.threads ??= []).push(t.id);
                t.thread = true;
            }
        }
    }
    // players never see a pin that only hidden strings hold
    const shown = gm ? pins : pins.filter((p) => !Object.values(board.links).some((l) => l.state === 'hidden' && [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j.pin)].includes(p.id)) || (p.pulls?.length ?? 0) > 0);
    return { viewer: gm ? 'gm' : 'player', scraps, links, pins: shown, marks: board.marks ?? {}, decor: board.decor };
}

// A junction's place from { t, off } against the line a -> b, and back
export function viaPoint(a, b, via) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * via.t - (dy / len) * via.off, y: a.y + dy * via.t + (dx / len) * via.off };
}
export function viaFrom(a, b, pt) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const len = Math.sqrt(l2);
    return { t: ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2, off: (-(pt.x - a.x) * dy + (pt.y - a.y) * dx) / len };
}

// Where a string ties on: a pin on the scrap's paper, on the side facing
// `toward`, `inset` px in from the edge
export function edgePin(layout, toward, inset = 16) {
    const P = layout.box ?? layout.paper;
    const c = Math.cos(-P.rot);
    const sn = Math.sin(-P.rot);
    const dx = toward.x - P.cx;
    const dy = toward.y - P.cy;
    const lx = dx * c - dy * sn;
    const ly = dx * sn + dy * c;
    const hw = Math.max(4, P.w / 2 - inset);
    const hh = Math.max(4, P.h / 2 - inset);
    const t = Math.min(hw / Math.max(1e-6, Math.abs(lx)), hh / Math.max(1e-6, Math.abs(ly)));
    return toWorld(lx * t, ly * t, P.cx, P.cy, P.rot);
}

export function nextState(state, dir = 1) {
    const i = STATES.indexOf(state);
    return STATES[(Math.max(0, i) + (dir < 0 ? STATES.length - 1 : 1)) % STATES.length];
}

/* -------------------------------------------- */
/*  Hit tests                                   */
/* -------------------------------------------- */

export function pointInPoly(pt, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
        if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// A decoration's outline (its image's box, turned)
export function decorHull(d, size) {
    const s = size(d.tex) ?? { w: 1, h: 1 };
    const h = d.w * (s.h / s.w);
    return place([-d.w / 2, -h / 2, d.w / 2, -h / 2, d.w / 2, h / 2, -d.w / 2, h / 2], d.x, d.y, d.r * DEG);
}

function segDist(pt, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((pt.x - x1) * dx + (pt.y - y1) * dy) / l2, 0, 1) : 0;
    return Math.hypot(pt.x - (x1 + t * dx), pt.y - (y1 + t * dy));
}

// What is under a point, topmost first: { kind: 'decor'|'scrap'|'link', item }
export function hitTest(view, pt, size, { tol = 14, decorUnder = true } = {}) {
    view = { ...view, links: view.links.filter((l) => !l.collapsed) };
    const over = view.decor.filter(d => d.layer === 'over');
    for (let i = over.length - 1; i >= 0; i--) if (pointInPoly(pt, decorHull(over[i], size))) return { kind: 'decor', item: over[i] };
    for (const l of view.links) {
        const p = l.points;
        for (let i = 2; i < p.length; i += 2) if (segDist(pt, p[i - 2], p[i - 1], p[i], p[i + 1]) <= tol) return { kind: 'link', item: l };
    }
    for (let i = view.scraps.length - 1; i >= 0; i--) if (pointInPoly(pt, view.scraps[i].layout.hull)) return { kind: 'scrap', item: view.scraps[i] };
    if (decorUnder) {
        const under = view.decor.filter(d => d.layer === 'under');
        for (let i = under.length - 1; i >= 0; i--) if (pointInPoly(pt, decorHull(under[i], size))) return { kind: 'decor', item: under[i] };
    }
    return null;
}

// What revealing does to a scrap: a landmark steps hidden, rumoured, known
// (dir -1 back); anything else is shown or not (Luke, 2026-10-02)
export function revealOf(s, dir = 1) {
    if (s.type === 'landmark') return nextState(s.state, dir);
    return s.state === 'hidden' ? 'known' : 'hidden';
}

// A name tag's paper (a ticket stub)
export const TAG_PAPER = 'tx/paper__strip__paper_ticket_stub_rose_strip';

// A string's pulls with one span split in two (a joint put in)
function splitPulls(pulls, span) {
    const out = [];
    (pulls ?? []).forEach((p, k) => {
        if (k < span) out[k] = p;
        else if (k > span) out[k + 1] = p;
    });
    return Array.from(out, (p) => p ?? null);
}

// A patch applied to a board's JSON (in place): scraps', strings', and pins'
// fields; new scraps and strings (newScraps, newLinks); a pin set to null is
// taken out
export function applyPatch(board, patch) {
    board.scraps ??= {};
    board.links ??= {};
    for (const [k, p] of Object.entries(patch?.newScraps ?? {})) board.scraps[k] = p;
    for (const [k, p] of Object.entries(patch?.newLinks ?? {})) board.links[k] = p;
    for (const [k, p] of Object.entries(patch?.scraps ?? {})) {
        if (!board.scraps[k]) continue;
        // (a card's marker strokes: each set, or taken off by a null)
        const { marks, ...rest } = p;
        Object.assign(board.scraps[k], rest);
        if (marks && typeof marks === 'object') {
            const m = { ...(board.scraps[k].marks ?? {}) };
            for (const [id, st] of Object.entries(marks)) {
                if (st === null) delete m[id];
                else m[id] = st;
            }
            board.scraps[k].marks = m;
        }
    }
    // the sheet's marker strokes ({ layer: { id: stroke | null } })
    for (const [layer, strokes] of Object.entries(patch?.marks ?? {})) {
        board.marks ??= {};
        const L = (board.marks[layer] ??= {});
        for (const [id, st] of Object.entries(strokes ?? {})) {
            if (st === null) delete L[id];
            else L[id] = st;
        }
        if (!Object.keys(L).length) delete board.marks[layer];
    }
    if (patch?.link && board.links[patch.link[0]]) Object.assign(board.links[patch.link[0]], patch.link[1]);
    for (const [id, p] of Object.entries(patch?.links ?? {})) {
        if (p === null) delete board.links[id];
        else if (board.links[id]) Object.assign(board.links[id], p);
    }
    for (const [id, p] of Object.entries(patch?.pins ?? {})) {
        board.pins ??= {};
        if (p === null) delete board.pins[id];
        else board.pins[id] = { ...(board.pins[id] ?? {}), ...p };
    }
    return board;
}

// A name for a string: a pin put into it (partway along, or `at`), a name
// tag (a note) by it, and a thread from the pin to the tag, all ordinary
// pieces from then on. Returns the patch, or null.
export function labelPatch(raw, id, label, look, size, measure, { at = null, tag = null } = {}) {
    const view = boardView(look, normalizeBoard(raw), 'gm', size, measure);
    const l = view.links.find((x) => x.id === id);
    const rl = raw.links?.[id];
    if (!l || !rl) return null;
    const mid = at ?? pointAlong(l.points, pathLength(l.points) * 0.5);
    const near = nearestOnPath(l.points, mid);
    const span = Math.max(0, l.spans.findIndex((x) => near.i >= x.from && near.i < x.to));
    const ji = l.waypoints.slice(1, span + 1).filter((w) => w.kind === 'joint').length;
    const pinId = customKey('pin', raw.pins ?? {});
    const fam = look.pools.ends?.[l.kind]?.length ? look.pools.ends[l.kind] : look.pools.pins;
    const joints = [...(rl.joints ?? [])];
    joints.splice(ji, 0, { pin: pinId });
    const noteKey = customKey('t', raw.scraps ?? {});
    const T = tag ?? { x: mid.x + 20, y: mid.y + 70 };
    const note = { type: 'note', tag: true, text: label, x: Math.round(T.x), y: Math.round(T.y), state: rl.state === 'hidden' ? 'hidden' : 'known' };
    if (T.r !== undefined && T.r !== null) note.r = T.r;
    const threadId = customKey('l', { ...(raw.links ?? {}), [id]: 1 });
    const tagPin = customKey('pin', { ...(raw.pins ?? {}), [pinId]: 1 });
    const tex = pickFrom(fam, `${id}:join`) ?? 'tx/fixtures__fixture_grey_tack_small';
    return {
        pins: {
            [pinId]: { tex, x: Math.round(mid.x), y: Math.round(mid.y) },
            // (the thread's far pin, through the top of the tag)
            [tagPin]: { tex: pickFrom(fam, `${id}:tag`) ?? tex, on: noteKey, at: { u: 0, v: -0.42 } },
        },
        links: { [id]: { joints, pulls: splitPulls(rl.pulls, span) } },
        newScraps: { [noteKey]: note },
        newLinks: { [threadId]: { kind: rl.kind ?? 'delve', state: rl.state ?? 'known', aPin: pinId, bPin: tagPin } },
    };
}

// An older board's name tags made ordinary pieces (a pin in the string where
// its junction was, a note where its tag was, a thread between): { board,
// changed }
export function migrateLabels(raw, look, size, measure) {
    const board = JSON.parse(JSON.stringify(raw ?? {}));
    let changed = false;
    const view = boardView(look, normalizeBoard(board), 'gm', size, measure);
    for (const l of view.links) {
        const rl = board.links?.[l.id];
        if (!rl?.label) continue;
        const J = l.junction ?? pointAlong(l.points, pathLength(l.points) * 0.5);
        const T = { x: J.x + (l.tagDx ?? 14), y: J.y + (l.tagDy ?? 80), r: l.tagR };
        const label = rl.label;
        for (const k of ['label', 'tagAt', 'tagDx', 'tagDy', 'tagR', 'tagPinAt', 'tagDrop', 'via']) delete rl[k];
        const patch = labelPatch(board, l.id, label, look, size, measure, { at: J, tag: T });
        if (patch) applyPatch(board, patch);
        changed = true;
    }
    return { board, changed };
}

// A point on a scrap as a place on its text box ({ u, v }), kept on its paper
export function uvOn(layout, pt) {
    const B = layout.box ?? layout.paper;
    const P = layout.paper;
    const c = Math.cos(-B.rot);
    const sn = Math.sin(-B.rot);
    const loc = (x, y) => ({ x: (x - B.cx) * c - (y - B.cy) * sn, y: (x - B.cx) * sn + (y - B.cy) * c });
    const q = loc(pt.x, pt.y);
    const pc = loc(P.cx, P.cy);
    const lx = Math.max(pc.x - P.w / 2, Math.min(pc.x + P.w / 2, q.x));
    const ly = Math.max(pc.y - P.h / 2, Math.min(pc.y + P.h / 2, q.y));
    return { u: +(lx / B.w).toFixed(3), v: +(ly / B.h).toFixed(3) };
}

// The topmost scrap whose paper is under a point (writing on the sheet aside)
function cardUnder(view, pt, not = null) {
    for (let i = view.scraps.length - 1; i >= 0; i--) {
        const s = view.scraps[i];
        if (s.key !== not && !s.layout.bare && pointInPoly(pt, s.layout.hull)) return s;
    }
    return null;
}

// A new string: a pin at each end (one already there, or one made where the
// end was asked for: stuck in the scrap under it, else loose), and the string
// between them; `prep` first (a pin it shares, made). Returns { id, patch }.
export function newStringPatch(raw, act, kind, look, { color = null } = {}) {
    const fam = look.pools.ends?.[kind]?.length ? look.pools.ends[kind] : look.pools.pins;
    const id = customKey('l', raw.links ?? {});
    const patch = { pins: { ...(act.prep?.pins ?? {}) }, links: { ...(act.prep?.links ?? {}) }, scraps: { ...(act.prep?.scraps ?? {}) } };
    const used = { ...(raw.pins ?? {}), ...patch.pins };
    const make = (key, at, pt, side) => {
        const pid = customKey('pin', used);
        used[pid] = 1;
        const tex = pickFrom(fam, `${id}:${side}`) ?? 'tx/fixtures__fixture_grey_tack_small';
        patch.pins[pid] = key ? { tex, on: key, at: at ?? { u: 0, v: -0.4 } } : { tex, x: Math.round(pt.x), y: Math.round(pt.y) };
        return pid;
    };
    const aPin = act.aPin ?? make(act.a, act.aAt, act.aPt, 'a');
    const bPin = act.bPin ?? make(act.b, act.bAt, act.bPt, 'b');
    patch.newLinks = { [id]: { kind, state: 'known', aPin, bPin, ...(color === null || color === undefined ? {} : { color }) } };
    return { id, patch };
}

// An older board made whole (Luke, 2026-10-02: one kind of pin): its name
// tags made notes; every string's ends and joints made pins of the board's
// own (stuck in the scrap they were on, else loose, where they were drawn);
// and every loose pin lying on a card stuck in it. Returns { board, changed }.
export function tidyBoard(raw, look, size, measure) {
    const { board, changed: named } = migrateLabels(raw, look, size, measure);
    let changed = named;
    board.pins ??= {};
    board.links ??= {};
    const view = boardView(look, normalizeBoard(board), 'gm', size, measure);
    const scrapOf = (key) => view.scraps.find((x) => x.key === key);
    for (const l of view.links) {
        const rl = board.links[l.id];
        if (!rl) continue;
        [['a', 0], ['b', 1]].forEach(([side, i]) => {
            if (rl[`${side}Pin`]) return;
            const e = l.ends[i];
            const key = rl[side];
            const pid = customKey('pin', board.pins);
            const s = key ? scrapOf(key) : null;
            board.pins[pid] = s ? { tex: e.tex, on: key, at: uvOn(s.layout, e) } : { tex: e.tex, x: Math.round(e.x), y: Math.round(e.y) };
            delete rl[side];
            delete rl[`${side}At`];
            delete rl[`${side}Pt`];
            rl[`${side}Pin`] = pid;
            changed = true;
        });
        if ((rl.joints ?? []).some((j) => !j?.pin)) {
            rl.joints = rl.joints.map((j, idx) => {
                if (j?.pin) return j;
                const vj = l.joints.find((x) => x.idx === idx);
                const pid = customKey('pin', board.pins);
                board.pins[pid] = { tex: vj?.tex ?? 'tx/fixtures__fixture_grey_tack_small', x: Math.round(j.x), y: Math.round(j.y) };
                return { pin: pid };
            });
            changed = true;
        }
    }
    // loose pins lying on a card are stuck in it (a pin in a card goes with it)
    const v2 = boardView(look, normalizeBoard(board), 'gm', size, measure);
    for (const p of v2.pins) {
        if (p.on) continue;
        const s = cardUnder(v2, p);
        if (!s) continue;
        const rp = board.pins[p.id];
        delete rp.x;
        delete rp.y;
        rp.on = s.key;
        rp.at = uvOn(s.layout, p);
        changed = true;
    }
    return { board, changed };
}

// What taking things off the board takes with them: the pins in a scrap
// that goes, every string tied to a scrap or held by a pin that goes, and
// joints held by a pin that goes (Luke, 2026-10-02: a string whose pin is
// gone goes too). Returns { scraps, pins, links, edits: { id: patch } }.
export function removalOf(raw, { scraps = [], pins = [], links = [] } = {}) {
    const S = new Set(scraps.filter((k) => raw.scraps?.[k]));
    const P = new Set(pins.filter((id) => raw.pins?.[id]));
    for (const [id, p] of Object.entries(raw.pins ?? {})) if (p?.on && S.has(p.on)) P.add(id);
    const L = new Set(links.filter((id) => raw.links?.[id]));
    const edits = {};
    for (const [id, l] of Object.entries(raw.links ?? {})) {
        if (L.has(id) || !l) continue;
        const gone = (key, pin) => (pin ? P.has(pin) : S.has(key));
        if (gone(l.a, l.aPin) || gone(l.b, l.bPin)) {
            L.add(id);
            continue;
        }
        const joints = (l.joints ?? []).filter((j) => !(j?.pin && P.has(j.pin)));
        if (joints.length !== (l.joints ?? []).length) edits[id] = { joints, pulls: [] };
    }
    return { scraps: [...S], pins: [...P], links: [...L], edits };
}

export function customKey(prefix, existing = {}) {
    let i = 1;
    while (existing[`${prefix}${i}`]) i++;
    return `${prefix}${i}`;
}
