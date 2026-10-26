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
//          assets/art/map/heart-board.json (v3), from the mock's
//          `node build.mjs --export`
//   board  what is pinned where: a scene's flags.heart.board in Foundry, the
//          mock's "Board" export
// Texture and art references are ids: 'tx/<folder>__<name>' (the texture
// set, assets/art/map/textures in Foundry) and 'art/<kind>__<name>' (the
// content art, placed by reference, never copied).

const STATES = ['hidden', 'rumoured', 'known'];
// (`plain`: no kind at all, a white thread, its pins their own colour, the
// default string for everyone; Luke 2026-10-25)
export const LINK_KINDS = ['plain', 'delve', 'rail', 'path'];
// The marker at its widest: three strings wide (Luke, 2026-10-03)
// (a wash as broad as a hand's sweep: Luke 2026-10-25)
export const WASH_MAX = 160;
export const markMax = (look, nib = null) => (nib === 'wash' ? WASH_MAX : (look?.string?.w ?? 4) * 3);
// The brush's nibs (Luke, 2026-10-25): the pen, the brush (a stroke with no
// `n`), and the wash; each nib's own width and opacity to start (the wash
// faint, a background under what is drawn over it). One copy, for both
// hosts and the relay.
export const NIBS = ['pen', 'brush', 'wash'];
export const NIB_DEFAULTS = Object.freeze({ pen: { w: 3, o: 1 }, brush: { w: 8, o: 0.85 }, wash: { w: 40, o: 0.25 } });
// a stroke's nib as it is written: { n: 'pen' } or { n: 'wash' }, or
// nothing for the brush; a wash `fill`ed (Luke, 2026-10-25, polygon washes:
// its points a closed shape, filled as the wash paints, any size) { n:
// 'wash', fill: true }
export const nibOf = (n, fill = false) => (n === 'wash' && fill ? { n, fill: true } : n === 'pen' || n === 'wash' ? { n } : {});
// a client's kept width and opacity by nib, over the defaults (a wash still
// at its first default, 45%, takes the new one)
export const nibStyleOf = (kept) => {
    const s = kept && typeof kept === 'object' ? kept : {};
    return { ...NIB_DEFAULTS, ...s, ...(s.wash?.o === 0.45 ? { wash: { ...s.wash, o: NIB_DEFAULTS.wash.o } } : {}) };
};
const SCRAP_TYPES = ['landmark', 'note', 'scrawl'];
// How a card's writing is set (Luke, 2026-10-03): which way its lines align
// in its box, and bold, italic, underlined, or struck through
export const ALIGNS = ['left', 'center', 'right'];
export const TEXT_STYLES = ['bold', 'italic', 'underline', 'strike'];
export function textStyleOf(o = {}) {
    const out = { align: ALIGNS.includes(o?.align) ? o.align : null };
    for (const k of TEXT_STYLES) out[k] = Boolean(o?.[k]);
    return out;
}
// Writing set a stretch at a time (Luke, 2026-10-25): bold, italic,
// underlined, or struck through over part of a card's writing, `fmt`:
// [[start, end, flags]] (offsets into its text; flags of b, i, u, s), sorted,
// none overlapping, neighbours of the same setting joined. Over the card's
// own setting (its bold, italic, underline, strike), which still sets all of it.
export const FMT_FLAGS = 'bius';
const flagsOf = (f) => [...FMT_FLAGS].filter((c) => String(f ?? '').includes(c)).join('');
// each letter's flags ('' for none), for text `len` long
export function fmtFlags(fmt, len) {
    const out = new Array(Math.max(0, len)).fill('');
    for (const r of Array.isArray(fmt) ? fmt : []) {
        if (!Array.isArray(r)) continue;
        const a = clamp(Math.round(num(r[0], 0)), 0, len);
        const b = clamp(Math.round(num(r[1], 0)), 0, len);
        const f = flagsOf(r[2]);
        for (let i = a; i < b; i++) out[i] = f;
    }
    return out;
}
// the ranges of each letter's flags
export function fmtRanges(flags) {
    const out = [];
    for (let i = 0; i < flags.length;) {
        const f = flags[i] ?? '';
        let j = i + 1;
        while (j < flags.length && (flags[j] ?? '') === f) j++;
        if (f) out.push([i, j, f]);
        i = j;
    }
    return out;
}
export const fmtOf = (raw, len) => (Array.isArray(raw) && raw.length && len > 0 ? fmtRanges(fmtFlags(raw.slice(0, 2000), len)) : []);
// The flags of each letter of each line wrapText made of `text` (the gap
// between two words takes the setting of the space before the second), or
// null when none is set
export function lineFx(text, fmt, lines) {
    if (!fmt?.length) return null;
    const t = String(text ?? '');
    const F = fmtFlags(fmt, t.length);
    const words = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(t))) words.push(m.index);
    let k = 0;
    return lines.map((line) => {
        const fx = [];
        String(line).split(' ').filter(Boolean).forEach((w, j) => {
            const at = words[k++];
            if (j > 0) fx.push(at === undefined ? '' : F[at - 1] ?? '');
            for (let c = 0; c < w.length; c++) fx.push(at === undefined ? '' : F[at + c] ?? '');
        });
        return fx.some(Boolean) ? fx : null;
    });
}

// a note's writing at its smallest, against the largest that fits its paper
// (Luke, 2026-10-24: fit, or smaller, never spilling)
export const TEXT_SIZE_MIN = 0.25;
// a note stretched no thinner than this, either way (width over height)
export const NOTE_AR_MIN = 0.15;
// the canvas font prefix for a style ('italic bold', or '')
export const fontStyle = (st) => [st?.italic ? 'italic' : '', st?.bold ? 'bold' : ''].filter(Boolean).join(' ');
export const LOOK_VERSION = 3;

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (v, list, d) => (list.includes(v) ? v : d);
// a palette: up to MAX_INKS colours (the defaults if none read)
export const MAX_INKS = 96;
const inks = (list, d) => {
    const out = (Array.isArray(list) ? list : []).map((c) => color(c, null)).filter((c) => c !== null).slice(0, MAX_INKS);
    return out.length ? out : d.map((c) => color(c, 0));
};
// (a palette that is the defaults' start, saved before more were added, gets
// the rest: Luke 2026-10-24, the brush's fuller palette reaches saved looks)
const fuller = (out, d) => {
    const all = d.map((c) => color(c, 0));
    return out.length < all.length && out.every((c, i) => c === all[i]) ? all.slice(0, MAX_INKS) : out;
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
        // the pages pasted on it (the newsprint; Luke, 2026-10-06: browned and
        // quieted so they lie in the sheet, not over it): how far toward the
        // sheet's own darkness (%), how browned (sepia %), their contrast (%),
        // and how far their edges are soaked into the sheet (board px)
        pages: { darken: 55, sepia: 55, contrast: 72, soak: 36 },
        // the sheet's edge: `margin` px of table around it, torn `jag` px,
        // burnt `burn` px in (thin: it only marks where the sheet ends);
        // `tear` %: torn deeper and less evenly, bitten, a corner or two gone
        // (Luke, 2026-10-06, the raggedness mock's A)
        edge: { margin: 10, jag: 3, burn: 12, tear: 100 },
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
        // the brush's paints, and coloured strings' (Luke, 2026-10-03: much
        // brighter than the sheet's own inks, the players' canvas; still the
        // Heart's: bone, blood, rust, ochre, moss, verdigris, sky, indigo,
        // violet, rose, iron grey, soot, and (2026-10-06) a brown the
        // brightness steps take from the paper's own to a light tan; the grey
        // darker, clear of the bone)
        marker: ['#e9dfc8', '#d4483a', '#e07a3a', '#e3b54a', '#c9c75a', '#8fbf5a', '#4fb3a0', '#6aa6e0', '#7a78e0', '#b07ad8', '#e070a0', '#6f6a65', '#3a3431', '#9a6a40',
            // (Luke, 2026-10-24: a much fuller palette, in the same burnt
            // brightness: whites and greys, browns, reds, ambers, greens,
            // blues, and purples; each added after the first fourteen, so
            // every stroke, note, and string keeps its paint)
            '#f2ece0', '#a39d94', '#5d6670', '#6b4630', '#d6bf8e', '#9c2c44', '#ec5a2e', '#ee8a70', '#b5603c', '#eb9a2c', '#f2cf72', '#b99a2a', '#8a8a3a',
            '#b2c98a', '#5e9548', '#3c6e50', '#2f8a8a', '#a6d6d8', '#7c9ab8', '#4f6fd6', '#3b4685', '#b4a8ec', '#7e3f7c', '#d58fdc', '#a9798f', '#f2aab8',
            // (Luke, 2026-10-24, again: even more, eighty in all, after the forty)
            '#e8d6a8', '#9aa0a6', '#8a837a', '#4a4744', '#c49a6c', '#7a3e22', '#5a2a20', '#704f32', '#4e3426', '#c06a3a', '#b8202e', '#8e1a24', '#a3422e', '#e88a78', '#5e1a1c', '#f08a2a', '#f2b47a', '#f0b030', '#a8742c', '#ecdc6a',
            '#dccd88', '#9aae86', '#2f5a38', '#2a4a3a', '#b4cc4a', '#4aa070', '#9adcb4', '#6ac8c8', '#245a62', '#c8dcf0', '#7a92e6', '#28305e', '#4a6488', '#4a9ae0', '#c8a8e0', '#9a5ac8', '#5a2e6a', '#c84a9a', '#b03a6a', '#f2a0c8'],
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
        plain: { texs: ['rope/pale_1', 'rope/pale_2', 'rope/pale_3'] },
    },
    // (Luke, 2026-10-03: half again as thick, more prominent)
    string: { w: 6, slack: 100 },
    // small, so a campaign's twenty-odd places, their delves, and their tags
    // all fit with room to read
    scrap: { w: 200 },
    // the pools each kind of scrap and fixture draws from (texture ids); the
    // GM can always swap one scrap's paper or fixture
    pools: { papers: [], notes: [], pins: [], tapes: [], stains: [], ends: { plain: [], delve: [], rail: [], path: [] } },
    // how dirty the map is (0-100): every scrap's paper (soot, gunpowder,
    // stains, darkened edges), the sheet under them, and how much of the
    // stain is blood, thickening toward the Heart (Luke, 2026-10-02: "grime
    // and soot and gunpowder and blood from the heart all over everything")
    // stitches: seams sewn along the folds; mends: strips of tape over them
    // (none by default: Luke, 2026-10-02, tape stays off the background)
    // damp: tide lines in from the sheet's edges, water rings, and foxing
    // (Luke, 2026-10-06, the raggedness mock's D); blood up (2026-10-06)
    grime: { scraps: 60, sheet: 55, blood: 75, stitches: 70, mends: 0, damp: 60 },
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
    // each pin's size and turn, as tuned in the editor (Look, Pins)
    const pinTune = {};
    for (const [k, t] of Object.entries(j.pinTune ?? {})) {
        const e = {};
        if (Number.isFinite(t?.s)) e.s = clamp(t.s, 0.2, 4);
        if (Number.isFinite(t?.r)) e.r = clamp(t.r, -180, 180);
        if (Object.keys(e).length) pinTune[String(k)] = e;
    }
    tunePins(pinTune);
    const sheet = normalizeSheet(j.sheet ?? {}, D.sheet);
    return {
        v: LOOK_VERSION, w, h, library, pinTune,
        sheet,
        // one page of the sheet (a fold panel), and the page grid as the look
        // has it: a board's sheet grows and shrinks a page at a time from
        // here (sheetLook; Luke 2026-10-24)
        page: { w: w / sheet.folds.cols, h: h / sheet.folds.rows, left: 0, top: 0, cols0: sheet.folds.cols, rows0: sheet.folds.rows },
        fire: clamp(num(j.fire, D.fire), 0, 100),
        // the nib a new stroke takes until one is picked (Luke, 2026-10-25):
        // 'brush' (Heart's ink brush) or 'pen'
        nib: nibOf(j.nib).n ?? 'brush',
        ropes: Object.fromEntries(LINK_KINDS.map(k => [k, { texs: strList(j.ropes?.[k]?.texs, D.ropes[k].texs) }])),
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
            paper: inks(j.ink?.paper, D.ink.paper), sheet: inks(j.ink?.sheet, D.ink.sheet), marker: fuller(inks(j.ink?.marker, D.ink.marker), D.ink.marker),
        },
        scrap: { w: clamp(num(j.scrap?.w, D.scrap.w), 120, 800) },
        grime: Object.fromEntries(['scraps', 'sheet', 'blood', 'stitches', 'mends', 'damp'].map((k) => [k, clamp(num(j.grime?.[k], D.grime[k]), 0, 100)])),
        pools: { papers: strList(p.papers, []), notes: strList(p.notes, []), pins: strList(p.pins, []), tapes: strList(p.tapes, []), stains: strList(p.stains, []), ends: Object.fromEntries(LINK_KINDS.map(k => [k, strList(p.ends?.[k], [])])) },
        decor: normalizeDecor(j.decor),
    };
}

const grade = (g, d) => ({ sat: clamp(num(g?.sat, d.sat), 0, 200), sepia: clamp(num(g?.sepia, d.sepia), 0, 100), bright: clamp(num(g?.bright, d.bright), 0, 200) });

// How big each handwriting face writes at the same size (their x-heights
// differ a lot); 1 = as set
// The typewriter (Luke, 2026-10-03): a card typed instead of handwritten
// (`typed`), the GM's and a Witness's to choose
export const TYPEWRITER = 'Special Elite';
export const HAND_SCALE = {
    'Reenie Beanie': 1.2, 'Rock Salt': 0.72, 'Nothing You Could Do': 0.9, 'Homemade Apple': 0.78, 'Caveat': 1.02,
    'Covered By Your Grace': 1.02, 'Zeyada': 1.12, 'Dawning of a New Day': 1.0, 'La Belle Aurore': 0.9,
    'Cedarville Cursive': 0.88, 'Kristi': 1.15, 'Waiting for the Sunrise': 1.0, 'Just Me Again Down Here': 1.1,
};

// Each pin's default size against the others (texture stem -> factor), set
// by eye so pushpin and tack heads come out alike, nails a little smaller,
// and the long pins by their length; 1 = as the scrap sizes it
// (Luke, 2026-10-06: every head the same size, half the pin's base width:
// each factor half over its head's measured share of its image's width)
// (2026-10-06, second look: the short red pushpin's head was two thirds the
// others', the bone spike a speck, and two nails never measured)
const PIN_SCALE0 = {
    fixture_dark_tack_head_flat: 0.749, fixture_dark_thumbtack_side: 0.701, fixture_grey_tack_head_round: 0.75,
    fixture_grey_tack_small: 0.702, fixture_iron_nail_single: 0.758, fixture_iron_pushpin_dark: 0.687,
    fixture_red_pushpin_long: 1.099, fixture_violet_pushpin_patterned: 0.698, fixture_red_pushpin_short: 1.9,
    fixture_iron_nails_three_1_crop: 0.833, fixture_iron_nails_three_2_crop: 0.873, fixture_brass_pushpins_pair_crop: 0.843,
    fixture_iron_t_pin: 0.743,
    // (no head to speak of, or lying on its side: sized by eye)
    fixture_bone_spike_pin: 1.5, fixture_iron_nail_driven: 1.2, fixture_bent_nails_pair: 1.1, fixture_iron_nails_three_3_crop: 0.85,
};
export const PIN_SCALE = { ...PIN_SCALE0 };
// How far each pin's drawing leans from upright (degrees, its head to its
// point; measured): turned back by this, every pin stands the same way before
// its string's pull tips it (Luke, 2026-10-06)
const PIN_LEAN0 = {
    fixture_dark_tack_head_flat: -7.8, fixture_dark_thumbtack_side: -20.5, fixture_grey_tack_head_round: -3.5,
    fixture_grey_tack_small: 15.4, fixture_iron_nail_single: 18.1, fixture_iron_pushpin_dark: 8.9,
    fixture_iron_nails_three_1_crop: 4.5, fixture_iron_nails_three_2_crop: -2.9, fixture_brass_pushpins_pair_crop: -2.3,
    fixture_red_pushpin_long: -12.7, fixture_red_pushpin_short: -42, fixture_violet_pushpin_patterned: -4.1,
    fixture_bone_spike_pin: -8.4, fixture_iron_t_pin: -2.9,
};
export const PIN_LEAN = { ...PIN_LEAN0 };
// The look's own sizes and turns for any pin (Luke, 2026-10-06: tuned by eye
// in the editor's Look, Pins), over the measured ones above. normalizeLook
// sets them, so both hosts draw every pin as the look says.
function tunePins(tune = {}) {
    for (const k of Object.keys(PIN_SCALE)) delete PIN_SCALE[k];
    for (const k of Object.keys(PIN_LEAN)) delete PIN_LEAN[k];
    Object.assign(PIN_SCALE, PIN_SCALE0);
    Object.assign(PIN_LEAN, PIN_LEAN0);
    for (const [k, t] of Object.entries(tune ?? {})) {
        if (Number.isFinite(t?.s)) PIN_SCALE[k] = t.s;
        if (Number.isFinite(t?.r)) PIN_LEAN[k] = t.r;
    }
}
// (a pin's texture stem, the key of its size and turn)
export const pinStem = (id) => String(id ?? '').split('__').pop();
export const pinUpright = (id) => ((PIN_LEAN[String(id ?? '').split('__').pop()] ?? 0) * Math.PI) / 180;

// A string's pins in its colour (Luke, 2026-10-06): a pin on a string given a
// colour of its own is that colour (the pin's light and shade kept); a plain
// iron pin chosen for a delve or the Vermissian is painted their red or violet
export const KIND_TINT = { plain: null, delve: 0xc0442f, rail: 0x8f86da, path: null };
const PLAIN_PIN = (tex) => !/red_|violet_|brass_|bone_/.test(String(tex ?? ''));
// (a string's `plainPins`: its pins keep their own colour; Luke 2026-10-25)
export function pinTint(look, l, tex) {
    if (l?.plainPins) return null;
    if (l?.color !== null && l?.color !== undefined) return look.ink.marker?.[l.color] ?? null;
    const t = KIND_TINT[l?.kind];
    return t !== null && t !== undefined && PLAIN_PIN(tex) && (look.pools.ends?.[l.kind] ?? []).includes(tex) ? t : null;
}
// A pin stands mostly upright (Luke, 2026-10-02): it turns only part of the
// way with the paper it is in, plus a little of its own tilt (radians)
const UPRIGHT = 0.3;
const pinTurn = (paperRot, own = 0) => paperRot * UPRIGHT + own;

// a landmark's clipping's area, against the card's unit squared (its shape the art's)
const CLIP_AREA = 0.42;

export const pinScale = (id) => PIN_SCALE[String(id ?? '').split('__').pop()] ?? 1;

function normalizeSheet(s, D) {
    return {
        mode: pick(s.mode, ['panels', 'tile'], D.mode),
        // (every panel the paper unshaded, so the seams between them all but
        // vanish: a well-kept survey; Luke 2026-10-25. Still mirrored by
        // chance: laid all one way, the paper's own marks tiled)
        even: Boolean(s.even),
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
        pages: Object.fromEntries(['darken', 'sepia', 'contrast', 'soak'].map((k) => [k, clamp(num(s.pages?.[k], D.pages[k]), 0, k === 'contrast' ? 150 : k === 'soak' ? 200 : 100)])),
        edge: { margin: clamp(num(s.edge?.margin, D.edge.margin), 0, 200), jag: clamp(num(s.edge?.jag, D.edge.jag), 0, 60), burn: clamp(num(s.edge?.burn, D.edge.burn), 0, 300), tear: clamp(num(s.edge?.tear, D.edge.tear), 0, 200) },
    };
}

// The ledger sheet's torn outline, inset `margin` px from the map's edge
export function sheetOutline(look, margin = look.sheet.edge.margin) {
    const w = look.w - margin * 2;
    const h = look.h - margin * 2;
    const tear = (look.sheet.edge.tear ?? 0) / 100;
    if (!tear) return place(tornRect(w, h, { seed: 'sheet', jag: look.sheet.edge.jag, step: 22 }), look.w / 2, look.h / 2, 0);
    return place(raggedRect(w, h, { seed: 'sheet', jag: look.sheet.edge.jag, tear }), look.w / 2, look.h / 2, 0);
}

// A rectangle torn deep and unevenly (Luke, 2026-10-06): its edges wandering
// in, bitten here and there, a corner or two torn away
export function raggedRect(w, h, { seed = 'ragged', jag = 3, tear = 1 } = {}) {
    const r = rng(`${seed}:ragged`);
    const C = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const gone = C.map(() => r() < 0.35 * Math.min(1.5, tear));
    const cut = C.map(() => [(70 + r() * 70) * tear, (60 + r() * 60) * tear]);
    const pts = [];
    for (let k = 0; k < 4; k++) {
        const [x0, y0] = C[k];
        const [x1, y1] = C[(k + 1) % 4];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const tx = (x1 - x0) / len;
        const ty = (y1 - y0) / len;
        // (in: toward the sheet's middle)
        const ix = -ty;
        const iy = tx;
        const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
        const bites = [];
        for (let i = 0, n = Math.round((2 + r() * 3) * tear * len / 1000); i < n; i++) bites.push({ t: r() * len, w: 45 + r() * 110, d: (16 + r() * 34) * tear });
        const a = gone[k] ? cut[k][0] : 0;
        const nk = (k + 1) % 4;
        const b = len - (gone[nk] ? cut[nk][1] : 0);
        for (let t = a; t < b; t += 8) {
            let d = (7 + 5 * Math.sin(t * 0.021 + ph[0]) + 4 * Math.sin(t * 0.067 + ph[1]) + 3 * Math.sin(t * 0.19 + ph[2])) * tear + (r() - 0.5) * 3 * tear + (r() - 0.5) * 2 * jag;
            for (const q of bites) {
                const u = (t - q.t) / q.w;
                if (Math.abs(u) < 1) d += q.d * Math.sqrt(1 - u * u) * (0.85 + r() * 0.3);
            }
            d = Math.max(0, d);
            pts.push(x0 + tx * t + ix * d, y0 + ty * t + iy * d);
        }
        // (the next corner torn away: a ragged line across it, sagging in)
        if (gone[nk]) {
            const [cx, cy] = C[nk];
            const [qx, qy] = C[(nk + 1) % 4];
            const ql = Math.hypot(qx - cx, qy - cy);
            const E = { x: cx - tx * cut[nk][1], y: cy - ty * cut[nk][1] };
            const S = { x: cx + ((qx - cx) / ql) * cut[nk][0], y: cy + ((qy - cy) / ql) * cut[nk][0] };
            const inx = -Math.sign(cx);
            const iny = -Math.sign(cy);
            for (let i = 1; i < 12; i++) {
                const t = i / 12;
                const sag = Math.sin(t * Math.PI) * 18 * tear;
                pts.push(E.x + (S.x - E.x) * t + inx * sag * 0.7 + (r() - 0.5) * 9, E.y + (S.y - E.y) * t + iny * sag * 0.7 + (r() - 0.5) * 9);
            }
        }
    }
    return pts;
}

// The board's scale (Luke, 2026-10-06): each fold panel is a printer's page,
// 11 inches tall; board px per inch (the style's own page, however big a
// board's pages are made: Luke 2026-10-25)
export const pxPerInch = (look) => (look.page?.h0 ?? look.h / Math.max(1, look.sheet.folds.rows)) / 11;

// Blood prints at their own size (Luke, 2026-10-06: hand and footprints were
// far too small and strewn about): each print texture's one print, as a share
// of its image's longest side (measured), and how long it is in inches
export const PRINTS = {
    blood_footprint_b1: { frac: 0.27, inches: 11, kind: 'foot' },
    blood_footprint_b5: { frac: 0.27, inches: 11, kind: 'foot' },
    blood_footprints_a1: { frac: 0.33, inches: 10.5, kind: 'trail' },
    blood_footprints_b1: { frac: 0.31, inches: 10.5, kind: 'trail' },
    blood_footprints_c1: { frac: 0.35, inches: 10.5, kind: 'trail' },
    blood_handprint_a1: { frac: 0.26, inches: 7.5, kind: 'hand' },
    blood_handprint_a3: { frac: 0.23, inches: 7.5, kind: 'hand' },
    blood_handprint_b1: { frac: 0.2, inches: 3.5, kind: 'fingers' },
    blood_handprint_b3: { frac: 0.17, inches: 3, kind: 'fingers' },
    blood_handprints_a1: { frac: 0.41, inches: 9, kind: 'hand' },
};
export const printOf = (id) => PRINTS[String(id ?? '').split('__').pop()] ?? null;

// A paper's solid region (fractions of its image: x0, y0, x1, y1), when its
// size() doesn't say: most papers have a torn or burnt rim about this wide
const DEFAULT_SAFE = [0.06, 0.06, 0.94, 0.94];
// below this much solid paper (diagonal tears, notches), a paper isn't used
// for scraps or panels
const MIN_COVER = 0.4;
// the aspect (w / h) of a paper's solid region
export const safeAspect = (z) => { const sb = z.safe ?? DEFAULT_SAFE; return (z.w * (sb[2] - sb[0])) / (z.h * (sb[3] - sb[1])); };

// A paper as it lies turned `turn` quarters clockwise, mirrored first
// (`flip`): its size and its solid region (Luke, 2026-10-06)
export function paperAs(z, turn = 0, flip = false) {
    let [x0, y0, x1, y1] = z.safe ?? DEFAULT_SAFE;
    if (flip) [x0, x1] = [1 - x1, 1 - x0];
    const t = ((turn % 4) + 4) % 4;
    const safe = t === 0 ? [x0, y0, x1, y1] : t === 1 ? [1 - y1, x0, 1 - y0, x1] : t === 2 ? [1 - x1, 1 - y1, 1 - x0, 1 - y0] : [y0, 1 - x1, y1, 1 - x0];
    return { ...z, w: t % 2 ? z.h : z.w, h: t % 2 ? z.w : z.h, safe };
}

// A colour [r, g, b] (0-255) through a grade { sat, sepia, bright }: the
// same three steps as the CSS filter and the PIXI ColorMatrixFilter
function gradeColor(c, g) {
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
    const P = look.page ?? { left: 0, top: 0, cols0: cols, rows0: rows };
    const pick = panelPicker(papers, P.cols0, P.rows0);
    const out = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // (each by its place among the look's own pages, so a page keeps
            // its paper, flips, and shade however many are added round it:
            // Luke 2026-10-24)
            const ac = c - P.left;
            const ar = r - P.top;
            const rr = rng(`panel:${ac}:${ar}`);
            void rr();
            const tex = pick(ac, ar);
            const w = look.w / cols;
            const h = look.h / rows;
            out.push({
                x: c * w, y: r * h, w, h, tex,
                src: safeOf(tex) ?? DEFAULT_SAFE,
                flipX: rr() < 0.5, flipY: rr() < 0.5, zoom: S.crop, dx: 0.2 + rr() * 0.6, dy: 0.2 + rr() * 0.6,
                shade: S.even ? 0 : (((ac % 2) + 2) % 2 ? 0.05 : -0.03) + (((ar % 2) + 2) % 2 ? 0.02 : 0) + (rr() - 0.5) * 0.02,
            });
        }
    }
    // even every panel toward the average tone of the look's own pages' papers
    // (as graded, since the gain is applied after the panel grade; the look's
    // own pages, so pages added never shift the tone of those there)
    const graded = (id) => { const t = toneOf(id); return t ? gradeColor(t, look.grade.panel) : null; };
    const own = [];
    for (let r = 0; r < P.rows0; r++) for (let c = 0; c < P.cols0; c++) own.push(pick(c, r));
    const tones = own.map((id) => graded(id)).filter(Boolean);
    const avg = tones.length ? [0, 1, 2].map(ch => tones.reduce((a, t) => a + t[ch], 0) / tones.length) : null;
    const m = S.match / 100;
    for (const p of out) {
        const t = graded(p.tex);
        p.gain = avg && t ? [0, 1, 2].map(ch => 1 + (avg[ch] / Math.max(1, t[ch]) - 1) * m) : [1, 1, 1];
    }
    return out;
}

// Which paper a page takes, by its place among the look's own pages (ac, ar;
// fewer than none left of or above them): the look's own pages as they always
// were (each its seed's draw, stepped on past the paper above it and the one
// left of it), then each ring of pages outside them, outward, stepped past
// the papers of its neighbours already settled (a nearer ring's, or its own
// ring's earlier in order). The same page, the same paper, whatever else is
// on the sheet (Luke, 2026-10-24).
function panelPicker(papers, cols0, rows0) {
    const n = papers.length;
    const memo = new Map();
    const draw = (ac, ar) => Math.floor(rng(`panel:${ac}:${ar}`)() * n);
    // (the look's own pages, as sheetPanels always laid them)
    const own = [];
    for (let r = 0; r < rows0; r++) {
        for (let c = 0; c < cols0; c++) {
            let i = draw(c, r);
            for (let t = 0; t < n; t++) {
                const id = papers[(i + t) % n];
                if (n < 3 || (own[(r - 1) * cols0 + c] !== id && own[r * cols0 + c - 1] !== id)) { i = (i + t) % n; break; }
            }
            own[r * cols0 + c] = papers[i];
        }
    }
    const ring = (ac, ar) => Math.max(ac < 0 ? -ac : ac >= cols0 ? ac - cols0 + 1 : 0, ar < 0 ? -ar : ar >= rows0 ? ar - rows0 + 1 : 0);
    const before = (a, b) => (a[1] - b[1]) || (a[0] - b[0]);
    const pick = (ac, ar) => {
        const k = ring(ac, ar);
        if (!k) return own[ar * cols0 + ac];
        const key = `${ac}:${ar}`;
        if (memo.has(key)) return memo.get(key);
        const near = [[ac - 1, ar], [ac + 1, ar], [ac, ar - 1], [ac, ar + 1]]
            .filter(([x, y]) => { const q = ring(x, y); return q < k || (q === k && before([x, y], [ac, ar]) < 0); })
            .map(([x, y]) => pick(x, y));
        let i = draw(ac, ar);
        if (n >= 3) for (let t = 0; t < n && near.includes(papers[i]); t++) i = (i + 1) % n;
        memo.set(key, papers[i]);
        return papers[i];
    };
    return pick;
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
            out.push({ x: (look.w * c) / cols, y: (look.h * r) / rows, edge, ...pagePlace(look, (look.w * c) / cols, (look.h * r) / rows) });
        }
    }
    return out;
}

// A point's place against the look's own pages (where it would be had none
// been added above or left): { ax, ay }, what seeds a page's wear and grime
function pagePlace(look, x, y) {
    const P = look.page ?? { w: 0, h: 0, left: 0, top: 0 };
    return { ax: Math.round(x - P.left * P.w), ay: Math.round(y - P.top * P.h) };
}

// The sheet's pages, each with its place among the look's own (ac, ar: its
// seed, the same however the sheet grows), its box, and the sheet's edges it
// lies on: [{ c, r, ac, ar, x, y, w, h, left, right, top, bottom }]
export function sheetPages(look) {
    const P = look.page;
    const { cols, rows } = look.sheet.folds;
    const out = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            out.push({ c, r, ac: c - P.left, ar: r - P.top, x: c * P.w, y: r * P.h, w: P.w, h: P.h, left: c === 0, right: c === cols - 1, top: r === 0, bottom: r === rows - 1 });
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
    // (in from the left and the head by the look's own sheet's measure, so
    // a grown sheet's rules sit as they did: Luke 2026-10-24)
    const P = look.page ?? { w: W, h: H, cols0: 1, rows0: 1 };
    const mx = P.w * P.cols0 * 0.075;
    const hy = P.h * P.rows0 * 0.055;
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
    const P = look.page ?? { left: 0, top: 0 };
    // (`at`: the page line it runs along, c or r)
    for (let c = 1; c < cols; c++) {
        const x = (look.w * c) / cols;
        out.push({ along: 'y', at: c, pts: stringPoints({ x, y: 30 }, { x: x + 4, y: look.h - 30 }, { seed: `foldv:${c - P.left}`, depth: 0.25, sag: 0 }) });
    }
    for (let r = 1; r < rows; r++) {
        const y = (look.h * r) / rows;
        out.push({ along: 'x', at: r, pts: stringPoints({ x: 30, y }, { x: look.w - 30, y: y + 3 }, { seed: `foldh:${r - P.top}`, depth: 0.25, sag: 0 }) });
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
            // how its clipping is held on: glue (nothing shows), tape, or a pin
            fix: pick(s.fix, ['glue', 'tape', 'pin'], null),
            hand: s.hand ? String(s.hand) : null,
            // typed (the typewriter) rather than written in its hand
            typed: Boolean(s.typed),
            // locked to the sheet (Luke, 2026-10-03: right-click): it doesn't
            // move, size, or turn; what is on and around it still does
            locked: Boolean(s.locked),
            // how its writing is set (align; bold, italic, underline, strike)
            ...textStyleOf(s),
            // who wrote it: a player's note (they may edit its text; it writes in
            // their own hand)
            author: s.author ? String(s.author) : null,
            // public (Luke, 2026-10-24): anyone may change it as its maker
            // may; never a place
            open: Boolean(s.open) && pick(s.type, SCRAP_TYPES, 'landmark') !== 'landmark',
            // its writing's size, a share of the largest that fits its paper
            // (null: that largest; a note's, Luke 2026-10-24)
            textSize: s.textSize === undefined || s.textSize === null || !Number.isFinite(Number(s.textSize)) ? null : clamp(Number(s.textSize), TEXT_SIZE_MIN, 1),
            // a note's shape, its width over its height, set by its corner
            // (Luke, 2026-10-24: stretched and squished freely, its paper
            // with it); null: its paper's own
            ar: s.ar === undefined || s.ar === null || !Number.isFinite(Number(s.ar)) ? null : clamp(Number(s.ar), NOTE_AR_MIN, 1 / NOTE_AR_MIN),
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
            // its writing in one of the brush's paints, at a brightness (Luke,
            // 2026-10-06: the same choices as the brush); over `ink`
            paint: s.paint === undefined || s.paint === null || !Number.isFinite(Number(s.paint)) ? null : clamp(Math.round(Number(s.paint)), 0, MAX_INKS - 1),
            bright: s.bright === undefined || s.bright === null || !Number.isFinite(Number(s.bright)) ? null : clamp(Math.round(Number(s.bright)), 0, BRIGHT_MAX),
            // its paper's quarter turns, set by hand (null: by its seed)
            pturn: s.pturn === undefined || s.pturn === null || !Number.isFinite(Number(s.pturn)) ? null : ((Math.round(Number(s.pturn)) % 4) + 4) % 4,
            // pieces of it moved by hand (the clipping, a strip of tape, a pin
            // through the clipping): { id: { u, v } } on its text box
            // (each { u, v } on its text box, and its own size s, turn r
            // degrees, and, for its writing, wrap width w in text box widths)
            parts: Object.fromEntries(Object.entries(s.parts && typeof s.parts === 'object' ? s.parts : {}).map(([k, p]) => [k, partAt(p)]).filter(([, p]) => p)),
            // more pins the GM put in it ({ u, v } points on its text box)
            pins: (Array.isArray(s.pins) ? s.pins : []).map(endAt).filter(Boolean),
            // its own pieces taken off (Luke, 2026-10-06: a strip of tape, a
            // pin through the clipping, a ring or web: by the piece's id)
            drop: strList(s.drop, []),
            // its writing set a stretch at a time (Luke, 2026-10-25)
            fmt: fmtOf(s.fmt, s.text ? String(s.text).length : 0),
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
            // who made it (a player's own string: theirs to edit; Luke 2026-10-03)
            author: l.author ? String(l.author) : null,
            // public: anyone's to change (Luke, 2026-10-24)
            open: Boolean(l.open),
            // its colour (Luke, 2026-10-03: any string in any colour): an
            // index into the sheet's paints, the marker's; null: its kind's own
            color: l.color === undefined || l.color === null || l.color === '' || !Number.isFinite(Number(l.color)) ? null : clamp(Math.round(Number(l.color)), 0, MAX_INKS - 1),
            // its pins in their own colour, not its (Luke, 2026-10-25: they
            // take its colour unless this says not)
            plainPins: Boolean(l.plainPins),
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
            // (Luke, 2026-10-03: half the sag it had)
            slack: clamp(num(l.slack, 50), 0, 400),
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
        const base = { id, tex: String(p.tex), s: p.s === undefined || p.s === null ? null : Math.max(0.001, num(p.s, 1)), r: p.r === undefined || p.r === null ? null : num(p.r, 0), state: p.state === 'hidden' ? 'hidden' : 'known', author: p.author ? String(p.author) : null, open: Boolean(p.open),
            // (its own paint, picked in the Pin window: over any string's; Luke 2026-10-25)
            c: p.c === undefined || p.c === null || !Number.isFinite(Number(p.c)) ? null : clamp(Math.round(Number(p.c)), 0, MAX_INKS - 1) };
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
    // loose pieces of the board's own (Luke, 2026-10-06): a strip of tape or
    // a web taken off a card onto the board, there to move, size, turn, or
    // take off by itself (only a card's picture and writing stay on it)
    const bits = {};
    for (const [id, b] of Object.entries(j.bits ?? {})) {
        if (!b?.tex || !pointAt(b)) continue;
        // (a piece off a note keeps the note's maker and its public setting:
        // Luke, 2026-10-24)
        bits[id] = { id, tex: String(b.tex), ...pointAt(b), w: clamp(num(b.w, 40), 4, 3000), r: num(b.r, 0), flip: Boolean(b.flip), alpha: clamp(num(b.alpha, 1), 0.05, 1), author: b.author ? String(b.author) : null, open: Boolean(b.open) };
    }
    return { scraps, links, pins, marks, bits, decor: normalizeDecor(j.decor), sheet: sheetAt(j.sheet) };
}

// A board's own sheet (Luke, 2026-10-24: a map grows or shrinks a page at a
// time, on any side): pages across (cols) and down (rows), and how many of
// them lie left of and above the look's own first page (left, top; fewer
// than none when its first pages were taken away). Null: the look's.
// (Luke, 2026-10-25) `pw`, `ph`: its pages' size (board px; none, the
// style's own page). `bare`: no sheet at all, the scene's own background
// under the board, `w` x `h` (the scene's size): any scene a board.
export const PAGE_MIN = 100;
export const PAGE_MAX = 6000;
const pageSide = (v) => { const n = Math.round(num(v, 0)); return n >= PAGE_MIN ? Math.min(PAGE_MAX, n) : 0; };
const sheetAt = (S) => {
    if (S?.bare) {
        const w = Math.round(num(S.w, 0)), h = Math.round(num(S.h, 0));
        return w >= 100 && h >= 100 ? { bare: true, w, h } : null;
    }
    if (!S || !Number.isFinite(Number(S.cols)) || !Number.isFinite(Number(S.rows))) return null;
    const out = { cols: Math.max(1, Math.round(Number(S.cols))), rows: Math.max(1, Math.round(Number(S.rows))), left: Math.round(num(S.left, 0)), top: Math.round(num(S.top, 0)) };
    const pw = pageSide(S.pw), ph = pageSide(S.ph);
    if (pw) out.pw = pw;
    if (ph) out.ph = ph;
    return out;
};
export const boardSheet = (look, raw) => sheetAt(raw?.sheet) ?? { cols: look.sheet.folds.cols, rows: look.sheet.folds.rows, left: 0, top: 0 };
// a board on its scene's own background, the scene's size
export const bareSheet = (w, h) => ({ bare: true, w: Math.round(w), h: Math.round(h) });
export const isBareBoard = (raw) => Boolean(sheetAt(raw?.sheet)?.bare);
// a board's page (board px): its own size, else the style's
export function pageOf(look, raw) {
    const S = sheetAt(raw?.sheet);
    return { w: S?.pw || look.page?.w || look.w, h: S?.ph || look.page?.h || look.h };
}

// The look a board is drawn with: the look, its sheet the board's own size
// and page grid (the same object for the same board's sheet, so a host's
// caches hold)
const sheetLooks = new WeakMap();
export function sheetLook(look, raw) {
    const S = sheetAt(raw?.sheet);
    if (!S || !look?.page) return look;
    const key = S.bare ? `bare:${S.w}x${S.h}` : `${S.cols}x${S.rows}@${S.left},${S.top}:${S.pw ?? ''}x${S.ph ?? ''}`;
    let byKey = sheetLooks.get(look);
    if (!byKey) sheetLooks.set(look, (byKey = new Map()));
    if (byKey.has(key)) return byKey.get(key);
    const P = look.page;
    // (on the scene's own background: no sheet, table, light, or wash, one
    // page the scene's size; the style's cards, strings, pins, and paints;
    // Luke 2026-10-25)
    const out = S.bare
        ? {
            ...look, bare: true,
            w: S.w, h: S.h,
            fire: 0, glow: 0, vignette: 0, wash: { top: 0, bottom: 0 },
            sheet: { ...look.sheet, folds: { ...look.sheet.folds, cols: 1, rows: 1 } },
            page: { ...P, w: S.w, h: S.h, left: 0, top: 0, cols0: 1, rows0: 1, w0: P.w, h0: P.h },
            decor: [],
        }
        : (() => {
            // (its pages their own size: Luke 2026-10-25)
            const pw = S.pw || P.w, ph = S.ph || P.h;
            return {
                ...look,
                w: Math.round(pw * S.cols), h: Math.round(ph * S.rows),
                sheet: { ...look.sheet, folds: { ...look.sheet.folds, cols: S.cols, rows: S.rows } },
                page: { ...P, w: pw, h: ph, left: S.left, top: S.top, w0: P.w, h0: P.h },
                // (the look's own decorations, the pages pasted on it among
                // them, on the look's own pages wherever they now lie)
                decor: (look.decor ?? []).map((d) => ({ ...d, x: (d.x / P.w + S.left) * pw, y: (d.y / P.h + S.top) * ph })),
            };
        })();
    byKey.set(key, out);
    return out;
}

// Everything placed on a board moved by (dx, dy) board px, in place: cards,
// loose string ends and joints, loose pins, the marker on the sheet, loose
// pieces, decorations, and the cards in the bin (a sheet grown or cut on its
// left or top: Luke 2026-10-24)
export function shiftBoard(board, dx, dy) {
    const pt = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { ...p, x: Math.round(Number(p.x) + dx), y: Math.round(Number(p.y) + dy) } : p);
    const scrap = (s) => (s ? Object.assign(s, pt(s)) : s);
    const link = (l) => {
        if (!l) return;
        if (l.aPt) l.aPt = pt(l.aPt);
        if (l.bPt) l.bPt = pt(l.bPt);
        if (Array.isArray(l.joints)) l.joints = l.joints.map((j) => (j?.pin ? j : pt(j)));
    };
    const pin = (p) => { if (p && !p.on) Object.assign(p, pt(p)); };
    for (const s of Object.values(board.scraps ?? {})) scrap(s);
    for (const l of Object.values(board.links ?? {})) link(l);
    for (const p of Object.values(board.pins ?? {})) pin(p);
    for (const b of Object.values(board.bits ?? {})) if (b) Object.assign(b, pt(b));
    for (const d of board.decor ?? []) if (d) Object.assign(d, pt(d));
    for (const strokes of Object.values(board.marks ?? {})) {
        for (const st of Object.values(strokes ?? {})) if (Array.isArray(st?.pts)) st.pts = st.pts.map((v, i) => Math.round((Number(v) + (i % 2 ? dy : dx)) * 10) / 10);
    }
    for (const e of Object.values(board.bin ?? {})) {
        scrap(e?.scrap);
        for (const p of Object.values(e?.pins ?? {})) pin(p);
        for (const l of Object.values(e?.links ?? {})) link(l);
    }
    return board;
}

// How far everything placed on a board reaches (board px): every card's
// paper, every string, pin, stroke, loose piece, and decoration, as the GM
// sees it (`view`: model.js boardView). Null when nothing is placed.
export function contentBounds(view, size = () => null) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (pts, pad = 0) => {
        for (let i = 0; i + 1 < (pts?.length ?? 0); i += 2) {
            x0 = Math.min(x0, pts[i] - pad); x1 = Math.max(x1, pts[i] + pad);
            y0 = Math.min(y0, pts[i + 1] - pad); y1 = Math.max(y1, pts[i + 1] + pad);
        }
    };
    for (const s of view?.scraps ?? []) { take(s.layout.hull); for (const ln of s.layout.lines ?? []) take([ln.x, ln.y], ln.size); for (const st of s.layout.strokes ?? []) take(st.pts, st.w / 2); }
    for (const l of view?.links ?? []) take(l.points, 4);
    for (const p of view?.pins ?? []) take([p.x, p.y], (p.w ?? 20) / 2);
    for (const strokes of Object.values(view?.marks ?? {})) for (const st of Object.values(strokes ?? {})) take(st.pts, (st.w ?? 6) / 2);
    for (const b of view?.bits ?? []) take([b.x, b.y], Math.max(b.w ?? 0, b.h ?? 0) / 2);
    for (const d of view?.decor ?? []) take(decorHull(d, size));
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

// A board's sheet grown or cut (Luke, 2026-10-24): `by` pages on each side
// ({ left, right, top, bottom }: more to add, fewer to take away). Never
// smaller than what is placed on it (`bounds`, model.js contentBounds), never
// less than a page. Returns { sheet, dx, dy } (dx, dy: how far everything
// placed moves), or { refused: side } when a side can't come in that far.
export function resizeSheet(look, raw, by = {}, bounds = null) {
    const S = boardSheet(look, raw);
    if (S.bare) return { refused: 'bare' };
    const P = pageOf(look, raw);
    const L = Math.round(Number(by.left) || 0), R = Math.round(Number(by.right) || 0), T = Math.round(Number(by.top) || 0), B = Math.round(Number(by.bottom) || 0);
    const cols = S.cols + L + R;
    const rows = S.rows + T + B;
    if (cols < 1) return { refused: L < 0 ? 'left' : 'right' };
    if (rows < 1) return { refused: T < 0 ? 'top' : 'bottom' };
    if (bounds) {
        // (the sheet after, in today's board px: what is placed must lie within it)
        // (only a side coming in can cut through anything: pages added never
        // are, whatever hangs past the sheet now; Luke 2026-10-25, a sheet
        // with a card over its edge never grew)
        const nx0 = -L * P.w, ny0 = -T * P.h, nx1 = (S.cols + R) * P.w, ny1 = (S.rows + B) * P.h;
        const tol = 0.5;
        if (L < 0 && bounds.x0 < nx0 - tol) return { refused: 'left' };
        if (R < 0 && bounds.x1 > nx1 + tol) return { refused: 'right' };
        if (T < 0 && bounds.y0 < ny0 - tol) return { refused: 'top' };
        if (B < 0 && bounds.y1 > ny1 + tol) return { refused: 'bottom' };
    }
    return { sheet: { ...S, cols, rows, left: S.left + L, top: S.top + T }, dx: Math.round(L * P.w), dy: Math.round(T * P.h) };
}

// A board's sheet made `cols` x `rows` pages of `pw` x `ph` board px (0: the
// style's own page), from the Board tab of the scene's settings (Luke,
// 2026-10-25): pages come or go on its right and bottom, nothing placed
// moves. A bare board (its scene's own background) gets a sheet. Never
// smaller than what is placed on it (`bounds`): { sheet } or { refused: side,
// w, h } (the size it would need).
export function reshapeSheet(look, raw, want = {}, bounds = null) {
    const was = sheetAt(raw?.sheet);
    const S = was && !was.bare ? was : { cols: look.sheet.folds.cols, rows: look.sheet.folds.rows, left: 0, top: 0 };
    const int = (v, d, lo, hi) => clamp(Math.round(num(v, d)), lo, hi);
    const cols = int(want.cols, S.cols, 1, 60);
    const rows = int(want.rows, S.rows, 1, 60);
    const pw = want.pw === undefined ? S.pw ?? 0 : pageSide(want.pw);
    const ph = want.ph === undefined ? S.ph ?? 0 : pageSide(want.ph);
    const W = cols * (pw || look.page.w), H = rows * (ph || look.page.h);
    if (bounds) {
        // (only a sheet coming in can cut through anything)
        const sheet = was && !was.bare;
        const W0 = sheet ? S.cols * (S.pw || look.page.w) : 0, H0 = sheet ? S.rows * (S.ph || look.page.h) : 0;
        const need = { w: Math.ceil(bounds.x1), h: Math.ceil(bounds.y1) };
        if (W < W0 - 0.5 || !sheet) { if (bounds.x1 > W + 0.5) return { refused: 'right', ...need }; }
        if (H < H0 - 0.5 || !sheet) { if (bounds.y1 > H + 0.5) return { refused: 'bottom', ...need }; }
    }
    const sheet = { cols, rows, left: S.left, top: S.top };
    if (pw) sheet.pw = pw;
    if (ph) sheet.ph = ph;
    return { sheet };
}

// The patch-free edit a sheet's resize makes: the board's JSON with its new
// sheet and everything placed moved (a copy). Null when refused.
export function resizedBoard(look, raw, by = {}, bounds = null) {
    const r = resizeSheet(look, raw, by, bounds);
    if (!r.sheet) return null;
    const out = JSON.parse(JSON.stringify(raw ?? {}));
    if (r.dx || r.dy) shiftBoard(out, r.dx, r.dy);
    out.sheet = r.sheet;
    return out;
}

/* -------------------------------------------- */
/*  Owned or public (Luke, 2026-10-24)          */
/* -------------------------------------------- */

// Everything anyone makes is its maker's (`author`; none: the GM's) or
// public (`open`): anyone may then change it, move it, or take it off, as its
// maker may. Places are the GM's alone, and a hidden thing stays the GM's
// whatever it is. Only its maker and the GM switch it.
// (`user`: { id, isGM, owner }; owner: one of a players' board's owners)
export const isOpen = (x) => Boolean(x?.open) && x?.state !== 'hidden';
// a thing of this user's making, or public
export const mineOrOpen = (x, user) => Boolean(x && user) && ((Boolean(x.author) && x.author === user.id) || isOpen(x));
// Whether a user may make a thing public, or theirs again: its maker, or the GM
// (a card is a note or writing to be switched: a place, its type unsaid or
// 'landmark', never; a pin or a loose piece has its texture, a string none)
const isPlace = (x) => 'x' in x && !('tex' in x) && x.type !== 'note' && x.type !== 'scrawl';
export const mayShare = (x, user) => Boolean(x && user) && !isPlace(x) && (user.isGM || (Boolean(x.author) && x.author === user.id));
// a stroke's maker (its layer on the sheet, `by` on a card; Luke 2026-10-25)
export const strokeMaker = (where, st) => (String(where).startsWith('@') ? st?.by ?? null : where);
// whether a user may make a stroke public or its maker's again: its maker, or the GM
export const mayShareStroke = (where, st, user) => Boolean(st && user) && (user.isGM || strokeMaker(where, st) === user.id);
// Whether a user may move, size, turn, or take off a loose piece of the board
// (a strip of tape or a web off a card): an editor any, a player one of theirs
// or a public one
export const mayBit = (b, user) => Boolean(b && user) && (user.isGM || user.owner || mineOrOpen(b, user));

// What switching things public (on) or back (off) writes: each card, string,
// and loose pin or piece this user may switch, and with a string its name
// tag and the thread it hangs by (a pin holding strings goes as its strings
// go). `view`: the board's (model.js boardView), for the strings' names.
// Null when nothing changes.
// (and strokes, [[where, id]]: each written whole, `open` true or false;
// Luke 2026-10-25)
export function sharePatch(raw, view, { scraps = [], links = [], pins = [], bits = [], strokes = [] } = {}, on, user) {
    const open = Boolean(on);
    const out = { scraps: {}, links: {}, pins: {}, bits: {}, marks: {} };
    for (const [where, id] of strokes) {
        const card = String(where).startsWith('@') ? raw?.scraps?.[String(where).slice(1)] : null;
        const st = card ? card.marks?.[id] : raw?.marks?.[where]?.[id];
        if (!st || !mayShareStroke(where, st, user) || Boolean(st.open) === open || card?.locked) continue;
        if (card) ((out.scraps[String(where).slice(1)] ??= { marks: {} }).marks)[id] = { ...st, open };
        else (out.marks[where] ??= {})[id] = { ...st, open };
    }
    const hidden = (x) => x?.state === 'hidden' && !user?.isGM;
    // (merged into what is there: Luke 2026-10-25, a note and a stroke on it
    // switched together lost the stroke's switch to the note's)
    const take = (coll, id, x) => {
        if (!x || hidden(x) || !mayShare(x, user) || Boolean(x.open) === open) return;
        out[coll][id] = { ...(out[coll][id] ?? {}), open };
    };
    for (const k of scraps) {
        const s = raw?.scraps?.[k];
        if (s && (s.type === 'note' || s.type === 'scrawl')) take('scraps', k, s);
    }
    for (const id of links) {
        const l = raw?.links?.[id];
        take('links', id, l);
        if (!out.links[id]) continue;
        // (its name goes with it: the tag and its thread)
        const vl = view?.links?.find((x) => x.id === id);
        for (const t of vl?.threads ?? []) if (raw.links?.[t] && Boolean(raw.links[t].open) !== open) out.links[t] = { open };
        if (vl?.nameNote && raw.scraps?.[vl.nameNote] && Boolean(raw.scraps[vl.nameNote].open) !== open) out.scraps[vl.nameNote] = { ...(out.scraps[vl.nameNote] ?? {}), open };
    }
    for (const id of pins) take('pins', id, raw?.pins?.[id]);
    for (const id of bits) take('bits', id, raw?.bits?.[id]);
    for (const k of Object.keys(out)) if (!Object.keys(out[k]).length) delete out[k];
    return Object.keys(out).length ? out : null;
}

const partAt = (p) => {
    const at = endAt(p);
    if (!at) return null;
    const out = { ...at };
    if (Number.isFinite(Number(p.s))) out.s = Math.max(0.001, Number(p.s));
    if (Number.isFinite(Number(p.r))) out.r = clamp(Number(p.r), -360, 360);
    if (Number.isFinite(Number(p.w))) out.w = clamp(Number(p.w), 0.1, 3);
    // (a writing box's height, shaped by hand: Luke 2026-10-03, it had been dropped)
    if (Number.isFinite(Number(p.h))) out.h = clamp(Number(p.h), 0.05, 3);
    // (a note's writing's size, kept once it was moved, sized, or turned:
    // against its paper's width; Luke 2026-10-25)
    if (Number(p.fs) > 0) out.fs = clamp(Number(p.fs), 0.005, 2);
    return out;
};
const pullAt = (p) => (p && [p.t, p.u, p.v].every((x) => Number.isFinite(Number(x))) ? { t: clamp(Number(p.t), 0.08, 0.92), u: clamp(Number(p.u), -3, 3), v: clamp(Number(p.v), -3, 3) } : null);
const pointAt = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) } : null);
const endAt = (p) => (p && Number.isFinite(Number(p.u)) && Number.isFinite(Number(p.v)) ? { u: clamp(Number(p.u), -2, 2), v: clamp(Number(p.v), -2, 2) } : null);
// where a tagged string's junction sits: t along the line between its ends,
// off px to the side of it (so it follows when the scraps move)
const viaAt = (p) => (p && Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.off)) ? { t: clamp(Number(p.t), -0.5, 1.5), off: clamp(Number(p.off), -3000, 3000) } : null);

// Decorations, for a board (its foreground) or the look (the background)
function normalizeDecor(list) {
    return (Array.isArray(list) ? list : []).filter(d => d?.tex).map((d, i) => ({
        // a piece may carry its own grading { sat, sepia, bright }
        fx: d.fx ? grade(d.fx, { sat: 100, sepia: 0, bright: 100 }) : null,
        id: String(d.id ?? `d${i}`), tex: String(d.tex),
        x: num(d.x, 0), y: num(d.y, 0), w: Math.max(4, num(d.w, 200)), r: num(d.r, 0),
        o: clamp(num(d.o, 100), 0, 100), flip: Boolean(d.flip),
        blend: pick(d.blend, ['normal', 'multiply', 'screen', 'overlay', 'lighten'], 'normal'),
        // ('page': a page pasted on the sheet itself, under the marker and the
        // grime; Luke 2026-10-03, the newsprint)
        layer: pick(d.layer, ['under', 'over', 'page'], 'under'),
        // a page: sewn to the sheet (seams by its seed) unless false
        seam: d.seam === false ? false : null,
    }));
}

/* -------------------------------------------- */
/*  Depth and the hand                          */
/* -------------------------------------------- */

// (Luke, 2026-10-24: fixed per page, against the look's own sheet: a grown
// sheet never changes how deep anything already placed is; pages below the
// look's own foot are as deep as it)
export function depthAt(y, look) {
    const P = look?.page;
    if (P) return clamp((y - P.top * P.h) / Math.max(1, P.rows0 * P.h), 0, 1);
    return clamp(y / (look?.h || 1), 0, 1);
}

export function mixColor(a, b, t) {
    const k = clamp(t, 0, 1);
    const ch = (c, s) => (c >> s) & 0xff;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k);
    return (m(16) << 16) | (m(8) << 8) | m(0);
}
const INK_DEEP = 0x7d1a14;
export const inkAt = (depth, top) => mixColor(top, INK_DEEP, Math.pow(clamp(depth, 0, 1), 1.4));
export const cssColor = (c) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

// How much the hand shakes at a depth: per-letter turn (radians) and drift (px)
function shakeAt(depth) {
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
    // (`i`: the letter's place in the text, for its own setting)
    let i = 0;
    for (const ch of String(text)) {
        out.push({ ch, i, x, y: (r() - 0.5) * 2 * sh.drift, rot: (r() - 0.5) * 2 * sh.turn });
        x += measure(ch, i) * (0.96 + r() * 0.08);
        i += ch.length;
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
function tornRect(w, h, { seed = 'tear', jag = 3, step = 9 } = {}) {
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
        c: clamp(Math.round(num(m.c, 0)), 0, MAX_INKS - 1), w: clamp(num(m.w, 6), 0.5, m.n === 'wash' ? WASH_MAX : 60), pts: card ? pts.map((v) => Math.round(v * 10000) / 10000) : pts,
        ...(m.o === undefined || m.o === null ? {} : { o: clamp(num(m.o, 0.85), 0.05, 1) }),
        // its brightness (Luke, 2026-10-06): 0 dim (soaked in, as the brush
        // first was), 1 as it is (the default), 2 bright
        ...(m.b === undefined || m.b === null ? {} : { b: clamp(Math.round(num(m.b, 1)), 0, BRIGHT_MAX) }),
        // its nib (Luke, 2026-10-25): 'pen', a crisp ink line; none, the brush;
        // a wash filled, a shape (no width cap: its shape is its size)
        ...nibOf(m.n, m.fill),
        // locked (Luke, 2026-10-24: right-click; never moved, sized, turned,
        // or rubbed out until let go)
        ...(m.locked ? { locked: true } : {}),
        // public (Luke, 2026-10-25: its maker's or the GM's switch; anyone's
        // to change, as a public note is)
        ...(m.open ? { open: true } : {}),
        // a piece of a stroke partly rubbed out (Luke, 2026-10-25): the seed
        // its brush is painted with (the whole stroke's) and the stretch of
        // the whole it is, [a, b] in fractions of its length; painted as that
        // stretch, so what is left looks as it did
        ...(typeof m.seed === 'string' && m.seed ? { seed: m.seed.slice(0, 120) } : {}),
        ...(spanOf(m.span) ? { span: spanOf(m.span) } : {}),
        // (and the eraser's bites out of its cut ends: [x, y, r] each, in its
        // points' own units; Luke 2026-10-25, only the ink it touched goes)
        ...(bitesOf(m.bites, card) ? { bites: bitesOf(m.bites, card) } : {}),
    };
}
// (a stroke's bites at most: every circle of the eraser's that touched it,
// along a long scrub too; Luke 2026-10-25, 24 left a broad stroke joined
// across its cut)
const BITE_MAX = 600;
function bitesOf(v, card = false) {
    if (!Array.isArray(v)) return null;
    const k = card ? 1e4 : 10;
    const out = v.filter((b) => Array.isArray(b) && b.length === 3 && b.every((x) => Number.isFinite(Number(x))) && Number(b[2]) > 0).slice(0, BITE_MAX).map((b) => b.map((x) => Math.round(Number(x) * k) / k));
    return out.length ? out : null;
}
// a piece's stretch of its whole stroke, [a, b] with 0 <= a < b <= 1 (not the whole)
function spanOf(v) {
    if (!Array.isArray(v) || v.length !== 2) return null;
    const a = clamp(num(v[0], 0), 0, 1);
    const b = clamp(num(v[1], 1), 0, 1);
    if (!(b > a) || (a === 0 && b === 1)) return null;
    return [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6];
}
const BRIGHT_MAX = 2;
// the brush's paints in the palette's order: Bone, the greys, Brown, then the
// colours (Luke, 2026-10-06: named and sorted)
// (Luke, 2026-10-24: by family, light to dark within each: whites and
// greys, browns, reds, ambers and yellows, greens, sea, blues, purples)
export const PAINT_ORDER = [14, 0, 40, 18, 15, 41, 42, 11, 16, 43, 12, 44, 49, 22, 13, 47, 45, 17, 48, 46, 39, 53, 21, 20, 1, 52, 50, 51, 19, 54, 56, 55, 2, 23, 57, 58, 24, 60, 59, 3, 25, 64, 4, 26, 27, 61, 66, 5, 28, 65, 29, 62, 63, 31, 67, 6, 30, 68, 69, 7, 73, 32, 72, 70, 33, 34, 71, 35, 74, 8, 9, 75, 37, 38, 36, 76, 79, 10, 77, 78];

// A note's dialog answered, as a scrap's fields (Luke, 2026-10-06): its
// writing in a brush paint at a brightness (or an ink of the paper's, as
// before), its paper's quarter turns, its own turn, and where its writing
// sits on it (merged into what was there: `had`, the scrap as it is)
export function noteFields(a, look, had = null) {
    const out = {};
    const paint = a?.paint === '' || a?.paint === null || a?.paint === undefined ? null : Math.round(Number(a.paint));
    if (Number.isInteger(paint) && paint >= 0 && paint < (look.ink.marker?.length ?? 0)) {
        out.paint = paint;
        out.bright = clamp(Math.round(num(a.bright, 1)), 0, BRIGHT_MAX);
        out.ink = null;
    } else {
        out.paint = null;
        out.bright = null;
    }
    if (a && 'pturn' in a) out.pturn = a.pturn === null || !Number.isFinite(Number(a.pturn)) ? null : ((Math.round(Number(a.pturn)) % 4) + 4) % 4;
    if (a && 'r' in a) out.r = a.r === null || !Number.isFinite(Number(a.r)) ? null : clamp(Math.round(Number(a.r)), -180, 180);
    const t = a?.textAt;
    if (t && Number.isFinite(t.u) && Number.isFinite(t.v)) out.parts = { ...(had?.parts ?? {}), text: { ...(had?.parts?.text ?? {}), u: +clamp(t.u, -0.6, 0.6).toFixed(3), v: +clamp(t.v, -0.6, 0.6).toFixed(3) } };
    return out;
}
// (Luke, 2026-10-06) the brush's paints by name, in the default palette's
// order, and how each brightness mixes a paint (dim toward black, bright
// toward white): the painter's and the palette's swatches alike
export const PAINT_NAMES = ['Bone', 'Blood', 'Rust', 'Ochre', 'Moss', 'Leaf', 'Verdigris', 'Sky', 'Indigo', 'Violet', 'Rose', 'Iron', 'Soot', 'Brown', 'Chalk', 'Ash', 'Slate', 'Umber', 'Sand', 'Wine', 'Ember', 'Coral', 'Clay', 'Amber', 'Honey', 'Mustard', 'Olive', 'Lichen', 'Fern', 'Pine', 'Teal', 'Frost', 'Steel', 'Cobalt', 'Midnight', 'Lavender', 'Plum', 'Orchid', 'Mauve', 'Blush',
    'Parchment', 'Pewter', 'Smoke', 'Graphite', 'Tan', 'Chestnut', 'Mahogany', 'Sepia', 'Cocoa', 'Copper', 'Crimson', 'Cardinal', 'Brick', 'Salmon', 'Oxblood', 'Tangerine', 'Apricot', 'Saffron', 'Bronze', 'Lemon', 'Straw', 'Sage', 'Forest', 'Bottle', 'Chartreuse', 'Jade', 'Mint', 'Aqua', 'Petrol', 'Ice', 'Cornflower', 'Navy', 'Denim', 'Azure', 'Lilac', 'Amethyst', 'Grape', 'Magenta', 'Raspberry', 'Pink'];
export const BRIGHT_MIX = [[0x000000, 0.42], null, [0xffffff, 0.16]];
export const brushColor = (c, b = 1) => { const m = BRIGHT_MIX[Math.max(0, Math.min(BRIGHT_MAX, b ?? 1))]; return m ? mixColor(c, m[0], m[1]) : c; };

// A card's frame for its marker: its middle, turn, and unit (board px per
// card unit), from its view
function cardFrame(vs, look) {
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
    const bites = (st.bites ?? []).map(([x, y, r]) => {
        const dx = x - F.cx, dy = y - F.cy;
        return [(dx * c - dy * s) / F.unit, (dx * s + dy * c) / F.unit, r / F.unit];
    });
    return cleanStroke({ ...st, pts, w: st.w / (vs.s ?? 1), ...(bites.length ? { bites } : {}) }, { card: true });
}
// a card's stroke on the board
function strokeFromCard(st, vs, look) {
    const F = cardFrame(vs, look);
    const pts = [];
    for (let i = 0; i < st.pts.length; i += 2) {
        const p = toWorld(st.pts[i] * F.unit, st.pts[i + 1] * F.unit, F.cx, F.cy, F.rot);
        pts.push(p.x, p.y);
    }
    // (and public, and a piece's seed, stretch, and bites: Luke 2026-10-25)
    const bites = (st.bites ?? []).map(([x, y, r]) => {
        const p = toWorld(x * F.unit, y * F.unit, F.cx, F.cy, F.rot);
        return [p.x, p.y, r * F.unit];
    });
    return { by: st.by ?? null, c: st.c, w: st.w * (vs.s ?? 1), ...(st.o === undefined ? {} : { o: st.o }), ...(st.b === undefined ? {} : { b: st.b }), ...nibOf(st.n, st.fill), ...(st.locked ? { locked: true } : {}), ...(st.open ? { open: true } : {}), ...(st.seed ? { seed: st.seed } : {}), ...(st.span ? { span: st.span } : {}), ...(bites.length ? { bites } : {}), pts };
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
    // (no tape of their own, at their corners or edges: Luke 2026-10-06,
    // tape only holds the pictures on; spiders rarely, Luke 2026-10-06; no
    // stamps, Luke 2026-10-21: they are faction marks, placed by hand, never
    // scattered as decoration)
    landmark: { plain: 42, stacked: 22, ringed: 14, boxed: 16, webbed: 1 },
    note: { plain: 57, stacked: 21, ringed: 19, webbed: 1 },
};
const ON_PAPER = ['ringed'];
const TX = {
    stamps: ['tx/fixtures__fixture_red_ink_stamp_round', 'tx/fixtures__fixture_stamp_horned_head_brown'],
    rings: ['tx/ink__ink_coffee_ring_orange', 'tx/ink__ink_fingerprint_smudged_orange', 'tx/ink__ink_orange_fingerprint_smudge'],
    boxes: ['tx/frames__frame_ink_rough_box_landscape', 'tx/frames__frame_ink_rough_box_wide'],
    web: 'tx/decorations__deco_web_corner_many_spiders_1_crop',
    hazard: 'tx/fixtures__fixture_hazard_tape_strip',
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

// How far each hand's ink reaches past what a measure of it says, against
// its size (Luke, 2026-10-24: writing still spilled off notes; measured in a
// browser, each face's worst of plain, bold, and italic): left and right of
// a line's advance, and above and below its middle (the hand draws on its
// middle line). Unknown faces take a wide guess.
const HAND_INK = {
    'Reenie Beanie': { l: 0.1, r: 0.07, u: 0.54, d: 0.52 }, 'Rock Salt': { l: 0.16, r: 0.17, u: 0.85, d: 0.63 },
    'Nothing You Could Do': { l: 0.14, r: 0.23, u: 0.61, d: 0.74 }, 'Homemade Apple': { l: 0.46, r: 0.21, u: 0.95, d: 0.98 },
    'Caveat': { l: 0.09, r: 0.3, u: 0.47, d: 0.54 }, 'Covered By Your Grace': { l: 0.02, r: 0.1, u: 0.58, d: 0.63 },
    'Zeyada': { l: 0.08, r: 0.08, u: 0.6, d: 0.76 }, 'Dawning of a New Day': { l: 0.13, r: 0.24, u: 0.78, d: 0.65 },
    'La Belle Aurore': { l: 0.31, r: 0.43, u: 0.87, d: 0.8 }, 'Cedarville Cursive': { l: 0.04, r: 0.08, u: 0.81, d: 0.7 },
    'Kristi': { l: 0.26, r: 0.43, u: 0.65, d: 0.66 }, 'Waiting for the Sunrise': { l: 0.03, r: 0.09, u: 0.61, d: 0.74 },
    'Just Me Again Down Here': { l: 0.03, r: 0.14, u: 0.56, d: 0.67 }, 'Special Elite': { l: 0.02, r: 0.14, u: 0.53, d: 0.47 },
};
export const inkOf = (font) => HAND_INK[font] ?? { l: 0.3, r: 0.3, u: 0.9, d: 0.9 };
// (the hand's own spacing runs up to 4% wide, and its letters shake and
// turn: a little more room up and down)
const HAND_SPREAD = 1.04;
const HAND_RISE = 1.1;

// The largest writing (px) whose lines, wrapped to `w`, fit a box `h` high,
// none of them running past `w` (Luke, 2026-10-24: a note's writing fills
// its paper and never spills off it). `memo`: what measure writes in (its
// face and style), so the answer is kept for the next layout. `ink`: how
// far the hand's ink reaches past its measure (inkOf: the whole of the ink
// is fitted, not only its advance).
const fitMemo = new Map();
export function fitText(text, measure, w, h, memo = null, ink = null) {
    const key = memo === null ? null : `${memo}|${Math.round(w)}|${Math.round(h)}|${text}`;
    if (key !== null && fitMemo.has(key)) return fitMemo.get(key);
    const I = ink ?? { l: 0, r: 0, u: 0.5, d: 0.5 };
    const wide = (t, px) => (ink ? measure(t, px) * HAND_SPREAD + (I.l + I.r) * px : measure(t, px));
    const fits = (px) => {
        const lines = wrapText(text, (t) => wide(t, px), w);
        const tall = ink ? ((lines.length - 1) * 0.95 + (I.u + I.d) * HAND_RISE) * px : lines.length * px * 0.95 + px * 0.3;
        // (half a pixel spare: a box fitted to its writing, kept rounded,
        // holds the same writing)
        return tall <= h + 0.5 && lines.every((t) => wide(t, px) <= w + 0.5);
    };
    let lo = 4;
    let hi = Math.max(lo, Math.floor(h / 1.25));
    while (hi > lo) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(mid)) lo = mid;
        else hi = mid - 1;
    }
    if (key !== null) {
        if (fitMemo.size > 4000) fitMemo.clear();
        fitMemo.set(key, lo);
    }
    return lo;
}

// (`legacy`: a note laid out as before 2026-10-24, its paper grown to fit
// its writing; the layout's `grew` says by how much: the one-time update of
// older boards, fitNotes)
export function scrapLayout(scrap, look, size, measure, libEntry = null, { legacy = false } = {}) {
    const depth = depthAt(scrap.y, look);
    const r = rng(`scrap:${scrap.key}`);
    const font = scrap.typed ? TYPEWRITER : scrap.hand ?? pickFrom(look.fonts.hands, `hand:${scrap.key}`) ?? 'serif';
    const palette = scrap.type === 'scrawl' ? look.ink.sheet : look.ink.paper;
    const ink = scrap.paint !== null && scrap.paint !== undefined && look.ink.marker?.[scrap.paint] !== undefined
        ? brushColor(look.ink.marker[scrap.paint], scrap.bright ?? 1)
        : palette?.length ? palette[scrap.ink ?? -1] ?? pickFrom(palette.slice(0, look.ink.auto ?? 4), `ink:${scrap.key}`) : scrap.type === 'scrawl' ? look.ink.scrawl : look.ink.text;
    const fk = scrap.typed ? 0.82 : look.fonts.scale[font] ?? 1;
    // its writing's style: measured as it is drawn
    const style = fontStyle(scrap);
    const align = scrap.align ?? 'center';
    const marks = { style, underline: Boolean(scrap.underline), strike: Boolean(scrap.strike) };
    measure = ((m) => (t, px) => m(t, px, font, style))(measure);
    // a line's offset across its box, by its alignment
    const across = (w, boxW) => (align === 'left' ? -(boxW - w) / 2 : align === 'right' ? (boxW - w) / 2 : 0);
    // its pieces moved, turned, or sized by hand (each on its text box,
    // independent of the others), and those taken off
    const parts = scrap.parts ?? {};
    const dropped = new Set(scrap.drop ?? []);
    if (scrap.type === 'scrawl') {
        const px = Math.round(look.scrap.w * scrap.s * 0.18 * fk);
        const lines = wrapText(scrap.text || '...', (t) => measure(t, px), look.scrap.w * scrap.s * 1.7);
        const W = Math.max(px, ...lines.map((t) => measure(t, px))) + px * 0.5;
        const H = lines.length * px * 0.95 + px * 0.35;
        const rot = (scrap.r ?? tilt(r() - 0.5, 10)) * DEG;
        const out = { key: scrap.key, depth, rumour: false, font, ink, bare: true, paper: { tex: null, cx: scrap.x, cy: scrap.y, w: W, h: H, rot } };
        out.hull = place([-W / 2, -H / 2, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2], scrap.x, scrap.y, rot);
        const fxs = scrap.text ? lineFx(scrap.text, scrap.fmt, lines) : null;
        out.lines = lines.map((text, i) => {
            const lw = measure(text, px);
            const p = toWorld(across(lw, W - px * 0.5), -H / 2 + px * 0.2 + (i + 0.5) * px * 0.95, scrap.x, scrap.y, rot);
            return { text, font, ...marks, align, w: lw, x: p.x, y: p.y, size: px, rot: rot + (r() - 0.5) * 2 * (1 + 2 * depth) * DEG, seed: `${scrap.key}:${i}`, ...(fxs?.[i] ? { fx: fxs[i] } : {}) };
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
    // a name tag is a ticket stub, sized to its writing
    const tagged = scrap.type === 'note' && scrap.tag;
    // a note's writing fits its paper (Luke, 2026-10-24): its paper keeps its
    // size and the writing is as large as fits, or smaller (textSize)
    const fitted = scrap.type === 'note' && !tagged && !legacy;
    // (its writing taken off it, now writing of its own: Luke, 2026-10-24)
    // (or never written: a blank note, a card with nothing on it yet; Luke
    // 2026-10-25)
    const textOff = scrap.type === 'note' && !tagged && (dropped.has('text') || !String(scrap.text ?? '').trim());
    // (Luke, 2026-10-06: the same paper never looking the same twice) its
    // paper turned a quarter at a time (portrait becomes landscape) and
    // mirrored, by its own seed; a name tag's stub lies as it is
    const pr = rng(`paperturn:${sk}`);
    const seeded = [0, 0, 1, 2, 3, 1, 3, 2][Math.floor(pr() * 8)];
    // (or as its owner turned it, Luke 2026-10-06: kept so, whatever fits)
    const handTurned = !tagged && scrap.pturn !== null && scrap.pturn !== undefined;
    const turn0 = tagged ? 0 : handTurned ? scrap.pturn : seeded;
    const flip = !tagged && pr() < 0.5;
    // a landmark's paper the shape of its art (landscape art on landscape
    // paper, portrait on portrait; Luke 2026-10-06), roughly: the clipping
    // and the name under it
    const artId0 = scrap.type === 'landmark' && !rumour ? scrap.art ?? libEntry?.art ?? null : null;
    const az0 = artId0 ? size(artId0) : null;
    const artAr0 = az0?.w && az0?.h ? az0.w / az0.h : null;
    // (Luke, 2026-10-06: the same card should come out about the same size,
    // its art too, whichever paper it draws) A landmark's clipping is sized
    // by its art's shape alone (the same area, whatever its shape), and the
    // paper is one shaped like the clipping and its name together, sized
    // round them; a note's paper is never a long strip
    const unit0 = look.scrap.w * scrap.s;
    let land = null;
    if (artAr0 !== null && !rumour) {
        const aar = clamp(artAr0, 0.6, 1.8);
        const A = unit0 * unit0 * CLIP_AREA;
        const cw = Math.sqrt(A * aar);
        const ch = cw / aar;
        const hp = Math.round(unit0 * 0.15 * fk * (parts.text?.s ?? 1));
        const nm = scrap.name || libEntry?.name || scrap.key;
        const nl = wrapText(nm, (t) => measure(t, hp), Math.max(cw, unit0 * 0.6)).length;
        const nameH = nl * hp * 0.95 + hp * 0.25;
        land = { cw, ch, w: Math.max(cw, unit0 * 0.6) / 0.9, h: (ch + nameH) / 0.86 };
    }
    const want = land ? [(land.w / land.h) * 0.88, (land.w / land.h) * 1.18] : rumour ? [0.6, 1.7] : isNote ? [0.62, 1.6] : [0.72, 1.15];
    // a paper of a fitting shape, as it lies, with enough of it solid; papers
    // mostly torn away (diagonal tears, notches) are left out
    const fits = (id, t) => {
        const z = size(id); if (!z) return false;
        const a = safeAspect(paperAs(z, t, false));
        return (z.cover ?? 1) >= MIN_COVER && a > want[0] && a < want[1];
    };
    let turn = turn0;
    let shaped = pool.filter((id) => fits(id, turn));
    // (none fits turned so: the other way round)
    if (!shaped.length && !tagged && !handTurned) {
        turn = (turn0 + 1) % 4;
        shaped = pool.filter((id) => fits(id, turn));
    }
    // (none fits at all, closely: the nearest shapes, either way round)
    if (!shaped.length && land && !scrap.paper && !handTurned) {
        const aim = land.w / land.h;
        const near = (id, t) => { const z = size(id); return z && (z.cover ?? 1) >= MIN_COVER ? Math.abs(Math.log(safeAspect(paperAs(z, t, false)) / aim)) : Infinity; };
        const ranked = pool.flatMap((id) => [[id, turn0], [id, (turn0 + 1) % 4]]).map(([id, t]) => [id, t, near(id, t)]).filter((x) => x[2] < Infinity).sort((a, b) => a[2] - b[2]);
        if (ranked.length) {
            // (any as near as the nearest, a hair either way)
            const best = ranked.filter((x) => x[2] <= ranked[0][2] + 0.08);
            const [id, t] = best[Math.floor(pr() * best.length)];
            turn = t;
            shaped = [id];
        }
    }
    if (!shaped.length) turn = turn0;
    const paperTex = scrap.paper ?? (tagged && size(TAG_PAPER) ? TAG_PAPER : pickFrom(shaped.length ? shaped : pool, sk));
    const pd = paperAs((paperTex && size(paperTex)) || { w: 3, h: 4 }, turn, flip);
    const sb = pd.safe ?? DEFAULT_SAFE;
    // W x H from here on is the paper's solid region, where everything goes
    const ar = safeAspect(pd);
    const unit = look.scrap.w * scrap.s;
    // (a landmark: the paper round its clipping and name, its whole content
    // shown whichever way the paper is wider)
    let W = isNote ? unit * (rumour ? 0.62 : 0.72) * 0.85 : land ? Math.max(land.w, land.h * ar) : unit;
    const W0 = W;
    // a rumour's writing has a set size (by the scrap size, not its paper);
    // its paper grows, keeping its shape, until its writing fits (a note's
    // did too, before it fitted: legacy)
    const notePx = Math.round(unit * (rumour ? 0.1 : 0.115) * fk);
    const tagPx = Math.round(unit * 0.12 * fk * (parts.text?.s ?? 1));
    let tagH = null;
    if (tagged) {
        // (narrow: as wide as its writing, a line or two high)
        const ls = wrapText(scrap.text || '...', (t) => measure(t, tagPx), unit * (parts.text?.w ?? 1.5));
        W = Math.max(tagPx * 2.5, ...ls.map((t) => measure(t, tagPx))) + tagPx * 1.2;
        tagH = ls.length * tagPx * 0.95 + tagPx * 0.8;
    }
    if (isNote && !tagged && !fitted) {
        const text = rumour ? `${scrap.name || libEntry?.name || scrap.key}?` : (scrap.text || '...');
        for (let i = 0; i < 16; i++) {
            const lines = wrapText(text, (t) => measure(t, notePx), W * 0.8).length;
            const need = lines * notePx * 0.95 + notePx * 0.8 + (rumour ? Math.min(W, W / ar) * 0.4 : 0) + Math.min(26, (W / ar) * 0.12) + (W / ar) * 0.07;
            if (need <= (W / ar) * 0.94) break;
            W *= 1.08;
        }
    }
    // (a note's shape set by hand: its paper stretched to it, Luke 2026-10-24)
    const H = tagH ?? (scrap.type === 'note' && !tagged && scrap.ar ? W / scrap.ar : W / ar);
    const rot = (scrap.r ?? tilt(r() - 0.5, 14 + 6 * depth)) * DEG;
    // the whole paper around its solid region (which sits at the scrap's x, y)
    const PW = W / (sb[2] - sb[0]);
    const PH = H / (sb[3] - sb[1]);
    const pc = toWorld(PW * (0.5 - (sb[0] + sb[2]) / 2), PH * (0.5 - (sb[1] + sb[3]) / 2), scrap.x, scrap.y, rot);
    const out = { key: scrap.key, seedKey: sk, depth, rumour, font, ink, paper: { tex: paperTex, cx: pc.x, cy: pc.y, w: PW, h: PH, rot, turn, flip }, box: { cx: scrap.x, cy: scrap.y, w: W, h: H, rot }, grew: W / W0 };
    out.hull = place([-PW / 2, -PH / 2, PW / 2, -PH / 2, PW / 2, PH / 2, -PW / 2, PH / 2], pc.x, pc.y, rot);

    // (its writing's wrap width: its own, set by its handle's box)
    const textW = tagged ? W : parts.text?.w ? parts.text.w * W : W * 0.86;
    // (its writing's box shaped by hand, Luke 2026-10-02: a height too, and
    // writing too tall for it shrinks to fit)
    const boxH = !tagged && parts.text?.h ? parts.text.h * H : null;
    // (a fitted note's writing: below its pin, clear of the paper's rim)
    const fitTop = -H / 2 + H * 0.07 + Math.min(26, H * 0.12);
    const fitH = boxH ?? H / 2 - H * 0.07 - fitTop;
    // (a box shaped by hand by its corner: its writing as large as fills
    // it, set at its top-left corner, and shown by its own outline; Luke
    // 2026-10-25)
    const boxed = fitted && Boolean(boxH);
    // (writing once moved, sized, or turned keeps the size it had then,
    // never fitted again: `fs`, its size against the paper's width; Luke
    // 2026-10-25. Not in a box shaped by hand: that always fills it)
    const frozen = fitted && !boxed && parts.text?.fs > 0 ? parts.text.fs : null;
    const fitBase = !fitted ? null : frozen ? frozen * W : fitText(scrap.text || '...', measure, textW, fitH, `${font}|${style}|ink`, inkOf(font));
    const handPx = tagged ? tagPx
        : fitted ? Math.max(4, Math.floor(fitBase * (scrap.textSize ?? 1) + 1e-3))
            : Math.round((isNote ? notePx : unit * 0.15 * fk) * (parts.text?.s ?? 1));
    // (what a move, a size, or a turn of its writing keeps)
    if (fitted) out.textFs = Math.round((fitBase / W) * 1e6) / 1e6;
    const fit = (text, px) => {
        if (!boxH || frozen || boxed) return px;
        let p = px;
        while (p > px * 0.45 && wrapText(text, (t) => measure(t, p), textW).length * p * 0.95 > boxH) p *= 0.92;
        return Math.round(p);
    };
    let top = -H / 2 + H * 0.07;
    out.lines = [];
    // (a fitted note's lines wrapped and set by their whole ink, as fitted:
    // each kept in its box, overhangs and all; Luke 2026-10-24)
    const reach = fitted ? inkOf(font) : null;
    const wrapOf = (px) => (reach ? (t) => measure(t, px) * HAND_SPREAD + (reach.l + reach.r) * px : (t) => measure(t, px));
    // (writing in a box shaped by hand: its block, the whole of its ink, w x h)
    let block = null;
    const addLines = (text, px0, rotJitter = 0, rich = false) => {
        const px = fit(text, px0);
        const wrapped = wrapText(text, wrapOf(px), textW);
        const fxs = rich ? lineFx(text, scrap.fmt, wrapped) : null;
        // (the block at the box's left, its lines aligned within it)
        if (boxed) block = { w: Math.max(...wrapped.map(wrapOf(px))), h: ((wrapped.length - 1) * 0.95 + (reach.u + reach.d) * HAND_RISE) * px };
        for (const [li, line] of wrapped.entries()) {
            const lw = measure(line, px);
            const lx = tagged ? 0
                : boxed ? -textW / 2 + block.w / 2 + across(wrapOf(px)(line), block.w) + ((reach.l - reach.r) / 2) * px
                    : reach ? across(lw * HAND_SPREAD + (reach.l + reach.r) * px, textW) + ((reach.l - reach.r) / 2) * px : across(lw, textW);
            const p = toWorld(lx, top + px * 0.55, scrap.x, scrap.y, rot);
            out.lines.push({ text: line, font, ...marks, align: tagged ? null : align, w: lw, x: p.x, y: p.y, lx, ly: top + px * 0.55, size: px, rot: rot + (r() - 0.5) * 2 * (0.5 + 2.5 * depth) * DEG + rotJitter, seed: `${scrap.key}:${out.lines.length}`, ...(fxs?.[li] ? { fx: fxs[li] } : {}) });
            top += px * 0.95;
        }
    };

    if (scrap.type === 'landmark' && !rumour) {
        // the clipping: as wide as the paper allows, its height kept to fit
        // the name under it
        // (its own seed, so the rest of the scrap's draws don't shift)
        const ar = rng(`assembly:${sk}`);
        // (Luke, 2026-10-03: the art as large as the paper allows, room left
        // for its name: the clipping takes the art's own shape, so all of it
        // shows, as wide or as tall as it can go)
        const name = scrap.name || libEntry?.name || scrap.key;
        const nameLines = wrapText(name, (t) => measure(t, handPx), textW).length;
        const nameH = nameLines * handPx * 0.95 + handPx * 0.25;
        const artId = scrap.art ?? libEntry?.art ?? null;
        const az = artId ? size(artId) : null;
        const artAr = az?.w && az?.h ? clamp(az.w / az.h, 0.6, 1.8) : 1.3;
        const roomW = W * 0.92;
        const roomH = Math.max(H * 0.3, H * 0.9 - nameH);
        const fill = 0.95 + ar() * 0.05;
        void ar();
        const cw = (land ? Math.min(land.cw, roomW, roomH * artAr) : Math.min(roomW, roomH * artAr)) * fill;
        const ch = cw / artAr;
        // the clipping and the name together on the paper, nudged a little
        // off true, the clipping tilted a little (always mostly upright)
        top = clamp(-(ch + nameH) / 2 - H * 0.02 + (ar() - 0.5) * H * 0.05, -H / 2 + H * 0.04, H / 2 - H * 0.04 - (ch + nameH));
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
        // (Luke, 2026-10-06: glued on, or taped on its front; rarely a pin)
        const fx = ar();
        const fix = scrap.fix ?? (fx < 0.42 ? 'glue' : fx < 0.9 ? 'tape' : 'pin');
        const style = fix === 'glue' ? 'glue' : pickFrom(fix === 'tape' ? ['corners', 'corners', 'top', 'cross', 'four'] : ['pin'], `${sk}:fix`);
        // (its tape and pins go with the clipping, Luke 2026-10-06: tape left
        // where the clipping first was looked strewn about; each still its
        // own piece, to move by hand)
        const crot = rot + clipRot;
        const onClip = (lx, ly) => toWorld(lx * ck, ly * ck, c.x, c.y, crot);
        out.tapes = [];
        out.clipPins = [];
        const tape = (lx, ly, ang, len, i) => {
            const t = onClip(lx, ly);
            out.tapes.push({ tex: pickFrom(look.pools.tapes, `${sk}:tape:${i}`), cx: t.x, cy: t.y, w: len, rot: crot + ang * DEG });
        };
        const corner = (sx, sy, i) => tape(sx * cw * (0.43 + ar() * 0.06), sy * ch * (0.43 + ar() * 0.06), sx * sy * (38 + ar() * 16), cw * ck * (0.26 + ar() * 0.14), i);
        const pinAt = (lx, ly, i) => {
            const p = onClip(lx, ly);
            const tex = pickFrom(look.pools.pins, `${sk}:clippin:${i}`);
            out.clipPins.push({ tex, x: p.x, y: p.y, w: Math.max(12, W * 0.13) * pinScale(tex), rot: pinTurn(crot, (ar() - 0.5) * 0.35) });
        };
        if (style === 'top') tape((ar() - 0.5) * cw * 0.3, -ch / 2, (ar() - 0.5) * 14, cw * ck * (0.45 + ar() * 0.2), 0);
        else if (style === 'corners') { corner(-1, -1, 0); corner(1, -1, 1); }
        else if (style === 'cross') { corner(-1, -1, 0); corner(1, 1, 1); }
        else if (style === 'four') { corner(-1, -1, 0); corner(1, -1, 1); corner(-1, 1, 2); corner(1, 1, 3); }
        else if (style === 'pin') pinAt((ar() - 0.5) * cw * 0.3, -ch * (0.36 + ar() * 0.08), 0);
        // (no tape mending the paper's own edge: Luke 2026-10-06)
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
        // each piece's handle, and its frame (for its own turn and size); a
        // piece taken off (drop) is gone, the others keeping their ids
        const hOf = (tex, w) => { const z = size(tex); return z ? (w * z.h) / z.w : w * 0.3; };
        out.tapes.forEach((t, i) => (t.id = `tape${i}`));
        out.clipPins.forEach((t, i) => (t.id = `pin${i}`));
        out.tapes = out.tapes.filter((t) => !dropped.has(t.id));
        out.clipPins = out.clipPins.filter((t) => !dropped.has(t.id));
        out.parts = [
            { id: 'clip', x: c.x, y: c.y, w: cw * ck, h: ch * ck, rot: rot + clipRot },
            ...out.tapes.map((t) => ({ id: t.id, x: t.cx, y: t.cy, w: t.w, h: hOf(t.tex, t.w), rot: t.rot })),
            ...out.clipPins.map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: hOf(t.tex, t.w), rot: t.rot })),
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
        // (in a box shaped by hand: from its top, laid as if the box were at
        // the card's middle; moved to the box below)
        else if (boxed) top = -boxH / 2 + reach.u * HAND_RISE * handPx - handPx * 0.55;
        // (fitted: in the middle of the room below its pin)
        else if (fitted && !boxH) {
            const n = wrapText(scrap.text || '...', wrapOf(handPx), textW).length;
            // (the ink's own height in the middle of the room: the first
            // line's middle its reach above in from the room's top)
            const tall = ((n - 1) * 0.95 + (reach.u + reach.d) * HAND_RISE) * handPx;
            top = fitTop + Math.max(0, (fitH - tall) / 2) + reach.u * HAND_RISE * handPx - handPx * 0.55;
        }
        // (a note's writing in the middle of its paper, a little high: Luke
        // 2026-10-06, it hung from the top whatever the paper's shape)
        else if (!boxH) {
            const n = wrapText(scrap.text || '...', (t) => measure(t, handPx), textW).length;
            top = clamp(-(n * handPx * 0.95) / 2 - H * 0.05, -H / 2 + H * 0.07, H / 2 - H * 0.07 - n * handPx * 0.95);
        }
        if (!textOff) addLines(scrap.text || '...', handPx, 0, Boolean(scrap.text));
    }
    // its writing, moved, turned, or given a new wrap width by hand (a handle
    // at the middle of the lines; its box is the lines' extent)
    const moved = parts.text;
    if (out.lines.length) {
        const ly = out.lines.reduce((t, ln) => t + (ln.ly ?? 0), 0) / out.lines.length;
        const mid = toWorld(0, ly, scrap.x, scrap.y, rot);
        // (in a box shaped by hand: laid round the card's middle, as its box's)
        const cx = block ? scrap.x : out.lines.every((ln) => ln.ly !== undefined) ? mid.x : out.lines.reduce((t, ln) => t + ln.x, 0) / out.lines.length;
        const cy = block ? scrap.y : out.lines.every((ln) => ln.ly !== undefined) ? mid.y : out.lines.reduce((t, ln) => t + ln.y, 0) / out.lines.length;
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
        // (Luke, 2026-10-24: the writing in the middle of its box, and the
        // box shown round the writing itself, never hanging past it: the box
        // as shaped, `box`, is what its corner handle sizes. Before, 2026-10-03,
        // the box showed its own size, the writing at its top.)
        const a = rot + turn;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const ln of out.lines) {
            const lx = tagged ? 0 : ln.lx ?? 0;
            x0 = Math.min(x0, lx - ln.w / 2);
            x1 = Math.max(x1, lx + ln.w / 2);
        }
        const pad = out.lines[0].size * 0.15;
        const hx = tagged ? 0 : (x0 + x1) / 2;
        const shapedW = tagged ? Math.max(...out.lines.map((ln) => measure(ln.text, ln.size)), textW * 0.5) : textW;
        if (block) {
            // (shown, and sized next, by the outline of its ink: its top-left
            // the box's, its corner where the writing ends; Luke 2026-10-25)
            const bx = -textW / 2 + block.w / 2;
            const by = -boxH / 2 + block.h / 2;
            const at = { x: tx + bx * Math.cos(a) - by * Math.sin(a), y: ty + bx * Math.sin(a) + by * Math.cos(a) };
            (out.parts ??= []).push({ id: 'text', ...at, w: block.w, h: block.h, rot: a, box: { ...at, w: block.w, h: block.h } });
        } else {
            (out.parts ??= []).push({
                id: 'text', x: tx + hx * Math.cos(a), y: ty + hx * Math.sin(a), w: tagged ? shapedW : x1 - x0 + pad * 2, h: bh + pad * 2, rot: a,
                box: { x: tx, y: ty, w: shapedW, h: boxH ?? bh },
            });
        }
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
    if (!tagged) {
        Object.assign(out, cardExtras({ scrap, sk, W, H, PW, PH, pc, rot, depth, clip: out.clip, look, size, isNote, paperTex }));
        // (each its own piece: moved, turned, or sized by hand, or taken off)
        out.extras.forEach((e, i) => {
            e.id = `x${i}`;
            const p = parts[e.id];
            if (!p) return;
            const q = toWorld(p.u * W, p.v * H, scrap.x, scrap.y, rot);
            Object.assign(e, { cx: q.x, cy: q.y, w: e.w * (p.s ?? 1), ...(e.h ? { h: e.h * (p.s ?? 1) } : {}) }, p.r !== undefined ? { rot: rot + p.r * DEG } : {});
        });
        out.extras = out.extras.filter((e) => !dropped.has(e.id));
        // (Luke, 2026-10-06) a web (a spider) is a thing on the card, as a pin
        // is: it has a handle, moves, and comes off; rings, ink frames, and
        // the paper under it are the card's own, never edited
        for (const e of out.extras) {
            if (!e.h) { const z = size(e.tex); e.h = z ? (e.w * z.h) / z.w : e.w * 0.3; }
            e.thing = e.tex === TX.web;
            if (e.thing) (out.parts ??= []).push({ id: e.id, x: e.cx, y: e.cy, w: e.w, h: e.h, rot: e.rot });
        }
    }
    // the marker on it, on the board (Luke, 2026-10-03)
    out.strokes = Object.entries(scrap.marks ?? {}).map(([id, m]) => ({ id, ...strokeFromCard(m, { s: scrap.s, layout: out }, look) }));
    return out;
}

// A blot of ink with splatters: [polygon, ...]
function inkBlot(cx, cy, rad, seed) {
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
        // (a little turn of its own: Luke 2026-10-06, they stood too crooked)
        const own = ((hashSeed(p.id) % 21) - 10) / 2;
        const look2 = pinHidden(p) ? 'ghost' : 'known';
        // (its own paint, over any string's)
        const tint = p.c !== null && p.c !== undefined ? { tint: look.ink.marker?.[p.c] ?? null } : {};
        if (!p.on) return { ...p, w, rot: (p.r ?? own) * DEG, look: look2, ...tint };
        const s = byKey[p.on];
        if (!s) return null;
        const B = s.layout.box ?? s.layout.paper;
        const at = toWorld(p.at.u * B.w, p.at.v * B.h, B.cx, B.cy, B.rot);
        return { ...p, x: at.x, y: at.y, w, rot: pinTurn(B.rot, (p.r ?? own) * DEG), look: look2, ...tint };
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
            // the string's one kind of pin, the same at every end and joint
            // (Luke, 2026-10-06): its first pin's, else one of its family's (red
            // for a delve, violet for the Vermissian, iron tacks for a path),
            // and its first pin's size for any it is given
            const fam0 = look.pools.ends?.[l.kind];
            const P0 = pinById[l.aPin] ?? pinById[l.bPin] ?? null;
            const pinTex = P0?.tex ?? pickFrom(fam0?.length ? fam0 : look.pools.pins, l.id);
            const pinS = P0?.s ?? null;
            const pin = (p, side) => ({ ...p, tex: pinTex, tint: pinTint(look, l, pinTex), w: Math.max(11, look.scrap.w * 0.13 * 0.85 * (pinS ?? 1)) * pinScale(pinTex), rot: (hashSeed(`${l.id}:${side}`) % 40 - 20) * DEG });
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
            // (pins no longer grow with a string's length: Luke 2026-10-06, it
            // felt a bug; a head is sized by hand)
            const run = pathLength(points);
            // (an end or joint held by a board pin shows that pin, not its own)
            const ends = [{ ...pin(a, 'a'), shared: l.aPin }, { ...pin(b, 'b'), shared: l.bPin }];
            if (junction) junction = pin(junction, 'join');
            const joints = J.map((p) => ({ ...pin(p, `j${p.idx}`), idx: p.idx, shared: p.pin ?? null }));
            const pinHid = [l.aPin, l.bPin, ...J.map((j) => j.pin)].some((id) => id && pinById[id]?.look === 'ghost');
            return {
                ...l, depth, junction, joints, waypoints, spans, ends, run, pinTex, pinS,
                look: l.state === 'hidden' || hidden(l.a) || hidden(l.b) || pinHid ? 'ghost' : l.state,
                points,
            };
        })
        // (players never see a string held by a pin they can't see)
        .filter((l) => gm || l.look !== 'ghost');
    // (Luke, 2026-10-06) a string players can't see takes its name with it:
    // the thread its tag hangs by, the tag, and their pins
    if (!gm) {
        const seen = new Set(links.map((l) => l.id));
        const gonePins = new Set();
        for (const [id, rl] of Object.entries(board.links)) if (!seen.has(id)) for (const j of rl.joints ?? []) if (j?.pin) gonePins.add(j.pin);
        const goneLinks = new Set();
        const goneNotes = new Set();
        for (const t of links) {
            const far = gonePins.has(t.aPin) ? 'b' : gonePins.has(t.bPin) ? 'a' : null;
            if (!far) continue;
            const key = t[far] ?? (t[`${far}Pin`] ? pinById[t[`${far}Pin`]]?.on ?? null : null);
            if (key && byKey[key]?.type === 'note' && byKey[key].tag) {
                goneLinks.add(t.id);
                goneNotes.add(key);
            }
        }
        if (goneLinks.size) {
            for (let i = links.length - 1; i >= 0; i--) if (goneLinks.has(links[i].id)) links.splice(i, 1);
            for (let i = scraps.length - 1; i >= 0; i--) if (goneNotes.has(scraps[i].key)) scraps.splice(i, 1);
            const used = new Set(links.flatMap((l) => [l.aPin, l.bPin, ...l.joints.map((j) => j.shared)]).filter(Boolean));
            for (let i = pins.length - 1; i >= 0; i--) {
                const p = pins[i];
                if ((gonePins.has(p.id) && !used.has(p.id)) || (p.on && goneNotes.has(p.on))) pins.splice(i, 1);
            }
        }
    }
    // a scrap a string ties to is held by that string's pins; its own pin
    // shows only when nothing else holds it
    for (const l of links) for (const k of [l.a, l.b]) if (k && byKey[k]) byKey[k].tied = true;
    // (a pin holding strings holds the scrap it is stuck in)
    for (const l of links) {
        for (const id of [l.aPin, l.bPin, ...l.waypoints.filter((w) => w.kind === 'joint' && w.pin).map((w) => w.pin)]) {
            const p = id && pinById[id];
            if (p?.on && byKey[p.on]) byKey[p.on].tied = true;
        }
    }
    // (a board pin a string runs through takes that string's colour: the
    // first string's, by the board's order)
    for (const l of links) {
        for (const id of [l.aPin, l.bPin, ...l.waypoints.filter((w) => w.kind === 'joint' && w.pin).map((w) => w.pin)]) {
            const p = id && pinById[id];
            if (p && p.tint === undefined) p.tint = pinTint(look, l, p.tex);
        }
    }
    // (its size against the plain size, for sizing it by hand)
    for (const p of pins) p.sEff = p.w / (base * pinScale(p.tex));
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
    // (the GM's view: a string the players can't see hangs its name as a
    // ghost too, its thread and tag)
    if (gm) {
        for (const l of links) {
            if (l.look !== 'ghost') continue;
            for (const id of l.threads ?? []) {
                const t = links.find((x) => x.id === id);
                if (t) t.look = 'ghost';
            }
            if (l.nameNote && byKey[l.nameNote]) byKey[l.nameNote].look = 'ghost';
        }
    }
    // players never see a pin that only hidden strings hold
    const shown = gm ? pins : pins.filter((p) => !Object.values(board.links).some((l) => l.state === 'hidden' && [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j.pin)].includes(p.id)) || (p.pulls?.length ?? 0) > 0);
    // (each loose piece its height by its picture's shape)
    const bits = Object.values(board.bits ?? {}).map((b) => { const z = size(b.tex); return { ...b, h: z?.w ? (b.w * z.h) / z.w : b.w * 0.3, rot: b.r * DEG }; });
    // (writing on the sheet lying on a card, `over`: drawn on that card, taken
    // before it, and gone with it when it moves; Luke 2026-10-25)
    for (const s of scraps) {
        if (!s.layout?.bare) continue;
        s.over = null;
        for (let i = scraps.length - 1; i >= 0; i--) {
            const c = scraps[i];
            if (c === s || c.layout?.bare || c.tag || !c.layout?.hull) continue;
            if (pointInPoly({ x: s.x, y: s.y }, c.layout.hull)) {
                s.over = c.key;
                break;
            }
        }
    }
    return { viewer: gm ? 'gm' : 'player', scraps, links, pins: shown, marks: board.marks ?? {}, bits, decor: board.decor };
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
function edgePin(layout, toward, inset = 16) {
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

function nextState(state, dir = 1) {
    const i = STATES.indexOf(state);
    return STATES[(Math.max(0, i) + (dir < 0 ? STATES.length - 1 : 1)) % STATES.length];
}

/* -------------------------------------------- */
/*  Hit tests                                   */
/* -------------------------------------------- */

// Whether a path of points (S, flat) comes within `r` of a closed shape (P,
// flat): a point of it inside the shape, or near its edge
export function shapeTouched(P, S, r) {
    const ring = [...P, P[0], P[1]];
    for (let i = 0; i < S.length; i += 2) {
        const q = { x: S[i], y: S[i + 1] };
        if (pointInPoly(q, P) || nearestOnPath(ring, q).d <= r) return true;
    }
    return false;
}

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
    // (a name tag lies over the strings)
    for (let i = view.scraps.length - 1; i >= 0; i--) if (view.scraps[i].tag && pointInPoly(pt, view.scraps[i].layout.hull)) return { kind: 'scrap', item: view.scraps[i] };
    for (const l of view.links) {
        const p = l.points;
        for (let i = 2; i < p.length; i += 2) if (segDist(pt, p[i - 2], p[i - 1], p[i], p[i + 1]) <= tol) return { kind: 'link', item: l };
    }
    // (writing lying on a card, before the card)
    for (let i = view.scraps.length - 1; i >= 0; i--) if (view.scraps[i].over && pointInPoly(pt, view.scraps[i].layout.hull)) return { kind: 'scrap', item: view.scraps[i] };
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

// What a Reveal press writes (controls.js press; one copy for both hosts,
// Luke 2026-10-21): the card's, pin's, or string's new state, and a string's
// joined strings, name tags, and threads with it. Null for anything else.
export function revealPatch(a) {
    const state = { state: a?.to };
    if (a?.scrap) return { scraps: { [a.scrap.key]: state } };
    if (a?.pin) return { pins: { [a.pin.id]: state } };
    if (!a?.link) return null;
    return {
        link: [a.link.id, state],
        links: Object.fromEntries((a.also?.links ?? []).map((id) => [id, { ...state }])),
        scraps: Object.fromEntries((a.also?.scraps ?? []).map((k) => [k, { ...state }])),
    };
}

// A name tag's paper (a ticket stub)
const TAG_PAPER = 'tx/paper__strip__paper_ticket_stub_rose_strip';

// A string's pulls with one span split in two (a joint put in): the spans
// either side keep theirs
export function splitPulls(pulls, span) {
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
        // (a card taken off: into the bin, binPatch)
        if (p === null) {
            delete board.scraps[k];
            continue;
        }
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
    // (the board's loose pieces)
    for (const [id, p] of Object.entries(patch?.bits ?? {})) {
        board.bits ??= {};
        if (p === null) delete board.bits[id];
        else board.bits[id] = { ...(board.bits[id] ?? {}), ...p };
    }
    // (the bin: cards taken off, or put back)
    for (const [k, e] of Object.entries(patch?.bin ?? {})) {
        board.bin ??= {};
        if (e === null) delete board.bin[k];
        else board.bin[k] = e;
    }
    return board;
}

// A name for a string: a pin put into it (partway along, or `at`), a name
// tag (a note) by it, and a thread from the pin to the tag, all ordinary
// pieces from then on. Returns the patch, or null. (`author`: a player naming
// their own string, Luke 2026-10-21: the tag, its thread, and its pins are
// theirs too, so their undo and their edits reach them.)
// (`open`: a public string's name is public too, Luke 2026-10-24)
export function labelPatch(raw, id, label, look, size, measure, { at = null, tag = null, author = null, open = false } = {}) {
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
    const noteKey = customKey('t', keysTaken(raw));
    const T = tag ?? { x: mid.x + 20, y: mid.y + 70 };
    const by = { ...(author ? { author } : {}), ...(open ? { open: true } : {}) };
    const note = { type: 'note', tag: true, text: label, x: Math.round(T.x), y: Math.round(T.y), state: rl.state === 'hidden' ? 'hidden' : 'known', ...by };
    if (T.r !== undefined && T.r !== null) note.r = T.r;
    const threadId = customKey('l', { ...(raw.links ?? {}), [id]: 1 });
    const tagPin = customKey('pin', { ...(raw.pins ?? {}), [pinId]: 1 });
    // (the string's own kind of pin, and its size)
    const tex = l.pinTex ?? pickFrom(fam, id) ?? 'tx/fixtures__fixture_grey_tack_small';
    const sz = l.pinS ? { s: l.pinS } : {};
    return {
        pins: {
            [pinId]: { tex, ...sz, x: Math.round(mid.x), y: Math.round(mid.y), ...by },
            // (the thread's far pin, through the top of the tag)
            [tagPin]: { tex, ...sz, on: noteKey, at: { u: 0, v: -0.42 }, ...by },
        },
        links: { [id]: { joints, pulls: splitPulls(rl.pulls, span) } },
        newScraps: { [noteKey]: note },
        newLinks: { [threadId]: { kind: rl.kind ?? 'delve', state: rl.state ?? 'known', aPin: pinId, bPin: tagPin, ...by } },
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

/* -------------------------------------------- */
/*  Rubbing out part of a stroke (Luke, 2026-10-25) */
/* -------------------------------------------- */

// The eraser's sweep ({ pts: [x, y, ...], r }, board px) over a stroke ({
// pts, w, n?, span?, bites? }, board px): null when it touches none of its
// ink, else the pieces left ([] when none), each { pts, span, bites? } where
// span is its stretch of the whole stroke. The stroke is walked in small
// steps: cut through where the eraser covered all of the ink's width there;
// where it only touched the ink (an edge, a graze, a narrow eraser down a
// broad stroke), left whole and bitten. Each piece keeps the stroke's own
// points, with new ones where it is cut, its old bites that still touch it,
// and every circle of the eraser's that touched its ink as a bite. A filled
// wash is bitten the same way, and goes only when the eraser covered all of
// it. (Luke, 2026-10-25, more accurate erasing for every nib: only what the
// eraser touches goes, and all of it. Before, a cut kept just the six
// circles nearest each cut end, so a broad stroke stayed joined across the
// cut, and a graze off its middle did nothing.) At most CUT_MAX pieces,
// BITE_MAX bites each.
const CUT_MAX = 24;
// how far either side of a stroke's middle its ink reaches (a brush's ragged
// edge a little past half its width)
export const inkHalf = (st) => ((st?.w ?? 6) / 2) * (st?.n === 'pen' || st?.n === 'wash' ? 1 : 1.1);
// The distance from a point to a path ([x, y, ...]), from a grid of its
// segments: exact within R of the path, Infinity past that
function pathNear(S, R) {
    const G = Math.max(8, R);
    const reach = R + G;
    const cells = new Map();
    const segs = [];
    if (S.length < 4) segs.push([S[0], S[1], S[0], S[1]]);
    for (let i = 0; i + 3 < S.length; i += 2) segs.push([S[i], S[i + 1], S[i + 2], S[i + 3]]);
    segs.forEach(([x0, y0, x1, y1], j) => {
        const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / G));
        for (let s = 0; s <= k; s++) {
            const x = x0 + ((x1 - x0) * s) / k, y = y0 + ((y1 - y0) * s) / k;
            for (let a = Math.floor((x - reach) / G); a <= Math.floor((x + reach) / G); a++) {
                for (let b = Math.floor((y - reach) / G); b <= Math.floor((y + reach) / G); b++) {
                    const key = `${a},${b}`;
                    let c = cells.get(key);
                    if (!c) cells.set(key, (c = []));
                    if (c[c.length - 1] !== j) c.push(j);
                }
            }
        }
    });
    return (x, y) => {
        const c = cells.get(`${Math.floor(x / G)},${Math.floor(y / G)}`);
        if (!c) return Infinity;
        let best = Infinity;
        for (const j of c) {
            const [x0, y0, x1, y1] = segs[j];
            const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
            best = Math.min(best, Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)));
        }
        return best;
    };
}
// The eraser's circles ([x, y, r]) along its path, half its radius apart
function sweepCircles(S, r) {
    const out = [];
    const gap = Math.max(1, r / 2);
    if (S.length < 4) out.push([S[0], S[1], r]);
    for (let i = 0; i + 3 < S.length; i += 2) {
        const sx = S[i], sy = S[i + 1], ex = S[i + 2], ey = S[i + 3];
        const k = Math.max(1, Math.ceil(Math.hypot(ex - sx, ey - sy) / gap));
        for (let j = i ? 1 : 0; j <= k; j++) out.push([sx + ((ex - sx) * j) / k, sy + ((ey - sy) * j) / k, r]);
    }
    return out;
}
// Each circle ([x, y, r]) reaching within `pad` of a point, from a grid of
// them: near(x, y, hit) calls hit(i) for each
function circlesNear(C, pad) {
    let rmax = 0;
    for (const c of C) rmax = Math.max(rmax, c[2]);
    const G = Math.max(8, rmax + pad);
    const cells = new Map();
    C.forEach((c, i) => {
        const key = `${Math.floor(c[0] / G)},${Math.floor(c[1] / G)}`;
        let l = cells.get(key);
        if (!l) cells.set(key, (l = []));
        l.push(i);
    });
    return (x, y, hit) => {
        const a0 = Math.floor(x / G), b0 = Math.floor(y / G);
        for (let a = a0 - 1; a <= a0 + 1; a++) {
            for (let b = b0 - 1; b <= b0 + 1; b++) {
                for (const i of cells.get(`${a},${b}`) ?? []) if (Math.hypot(C[i][0] - x, C[i][1] - y) <= C[i][2] + pad) hit(i);
            }
        }
    };
}
// The circles taken as a piece's bites, in order (its old bites first),
// rounded; past BITE_MAX, an even spread of them
function biteList(C, took) {
    const out = [...took].sort((a, b) => a - b).map((i) => C[i].map((v) => Math.round(v * 10) / 10));
    if (out.length <= BITE_MAX) return out;
    const k = out.length / BITE_MAX;
    return Array.from({ length: BITE_MAX }, (_, i) => out[Math.floor(i * k)]);
}
export function cutStroke(st, sweep) {
    const P = st?.pts ?? [];
    const n = P.length / 2;
    const S = sweep?.pts ?? [];
    if (n < 2 || S.length < 2 || !(sweep.r > 0)) return null;
    const r = sweep.r;
    const w = st.w ?? 6;
    const h = inkHalf(st);
    // (a quick miss: the sweep's box against the stroke's)
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
    for (let i = 0; i < S.length; i += 2) { sx0 = Math.min(sx0, S[i]); sx1 = Math.max(sx1, S[i]); sy0 = Math.min(sy0, S[i + 1]); sy1 = Math.max(sy1, S[i + 1]); }
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (let i = 0; i < P.length; i += 2) { px0 = Math.min(px0, P[i]); px1 = Math.max(px1, P[i]); py0 = Math.min(py0, P[i + 1]); py1 = Math.max(py1, P[i + 1]); }
    const reach = r + h + 2;
    if (px1 < sx0 - reach || px0 > sx1 + reach || py1 < sy0 - reach || py0 > sy1 + reach) return null;
    // (the bites it had, then the eraser's circles: the candidates for each
    // piece's bites)
    const old = Array.isArray(st.bites) ? st.bites.length : 0;
    const C = [...(old ? st.bites : []), ...sweepCircles(S, r)];
    // (a wash filled, a shape: never cut along a line; bitten where the
    // eraser touched it, gone when it covered all of it)
    if (st.fill) return fillRubbed(st, S, r, C, old);
    const L = [0];
    for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]));
    const total = L[n - 1];
    if (!(total > 0)) return null;
    // the point s along it, and the segment it is on
    const at = (s) => {
        let lo = 1, hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (L[mid] < s) lo = mid + 1;
            else hi = mid;
        }
        const i = lo;
        const t = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
        return [P[2 * i - 2] + (P[2 * i] - P[2 * i - 2]) * t, P[2 * i - 1] + (P[2 * i + 1] - P[2 * i - 1]) * t, i];
    };
    const near = pathNear(S, r + h);
    const step = Math.max(0.75, Math.min(4, w / 4, r / 3));
    const steps = Math.max(1, Math.ceil(total / step));
    // each step: 0 left alone, 1 touched (bitten), 2 rubbed through (the
    // eraser over its middle and across its ink's whole width there)
    const state = new Uint8Array(steps);
    let any = false;
    let through = false;
    for (let k = 0; k < steps; k++) {
        const [x, y, i] = at(((k + 0.5) / steps) * total);
        const d = near(x, y);
        if (d > r + h) continue;
        any = true;
        const dx = P[2 * i] - P[2 * i - 2], dy = P[2 * i + 1] - P[2 * i - 1], dl = Math.hypot(dx, dy) || 1;
        const nx = (-dy / dl) * h, ny = (dx / dl) * h;
        const all = d <= r && [1, -1, 0.5, -0.5].every((f) => near(x + nx * f, y + ny * f) <= r);
        if (all) state[k] = 2;
        else state[k] = 1;
        through ||= all;
    }
    if (!any) return null;
    // the runs left between where it was rubbed through, in arc length
    const runs = [];
    let from = null;
    for (let k = 0; k <= steps; k++) {
        const keep = k < steps && state[k] !== 2;
        if (keep && from === null) from = k;
        if (!keep && from !== null) {
            runs.push([(from / steps) * total, (k / steps) * total]);
            from = null;
        }
    }
    // (a piece only a step or so long is the walk's own rounding, not ink)
    const least = Math.max(1.5, step * 1.5);
    const [a0, b0] = st.span ?? [0, 1];
    // (a cut end is painted running on a little into what was rubbed out, at
    // most the eraser's radius: the bites there take it off)
    const ext = Math.min(w * 0.6, r) + 1;
    const hits = circlesNear(C, h + r / 4 + 1);
    const out = [];
    for (const [s0, s1] of runs) {
        if (s1 - s0 < least) continue;
        // the bites that reach its ink
        const took = new Set();
        const lo = s0 > 0 ? Math.max(0, s0 - ext) : 0;
        const hi = s1 < total ? Math.min(total, s1 + ext) : total;
        const m = Math.max(1, Math.ceil((hi - lo) / step));
        for (let j = 0; j <= m; j++) {
            const [x, y] = at(lo + ((hi - lo) * j) / m);
            hits(x, y, (i) => took.add(i));
        }
        // (only touched, never cut: left as it is, unless the eraser bit it)
        if (!through && ![...took].some((i) => i >= old)) return null;
        let pts;
        if (s0 === 0 && s1 === total) pts = P.slice();
        else {
            const A = at(s0);
            const B = at(s1);
            pts = [A[0], A[1]];
            for (let i = 1; i < n - 1; i++) if (L[i] > s0 && L[i] < s1) pts.push(P[2 * i], P[2 * i + 1]);
            pts.push(B[0], B[1]);
            pts = pts.map((v) => Math.round(v * 100) / 100);
        }
        const bites = biteList(C, took);
        out.push({ pts, span: [a0 + (b0 - a0) * (s0 / total), a0 + (b0 - a0) * (s1 / total)], ...(bites.length ? { bites } : {}) });
        if (out.length >= CUT_MAX) break;
    }
    return out;
}
// A filled wash under the eraser's sweep: [] when the eraser covered all of
// the shape, else the shape as it was, bitten where the eraser touched it;
// null when it touched none of it
function fillRubbed(st, S, r, C, old) {
    const P = st.pts;
    // (its soft edge, a little past its outline)
    const pad = Math.max(0.6, (st.w ?? 6) * 0.04) + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
    const ring = [...P, P[0], P[1]];
    const nearRing = pathNear(ring, r + pad);
    const took = new Set();
    for (let i = 0; i < C.length; i++) {
        const [cx, cy, cr] = C[i];
        if (i < old) took.add(i);
        else if (cx >= x0 - cr - pad && cx <= x1 + cr + pad && cy >= y0 - cr - pad && cy <= y1 + cr + pad && (pointInPoly({ x: cx, y: cy }, P) || nearRing(cx, cy) <= cr + pad)) took.add(i);
    }
    if (![...took].some((i) => i >= old)) return null;
    // all of it covered: its outline, then inside it, every few px
    const near = pathNear(S, r);
    const under = (x, y) => near(x, y) <= r;
    let all = true;
    const gap = Math.max(1, r / 2);
    for (let i = 0; all && i + 3 < ring.length; i += 2) {
        const k = Math.max(1, Math.ceil(Math.hypot(ring[i + 2] - ring[i], ring[i + 3] - ring[i + 1]) / gap));
        for (let j = 0; all && j < k; j++) all = under(ring[i] + ((ring[i + 2] - ring[i]) * j) / k, ring[i + 1] + ((ring[i + 3] - ring[i + 1]) * j) / k);
    }
    if (all) {
        const g = Math.max(gap, Math.sqrt(((x1 - x0) * (y1 - y0)) / 20000));
        for (let y = y0 + g / 2; all && y < y1; y += g) {
            for (let x = x0 + g / 2; all && x < x1; x += g) if (pointInPoly({ x, y }, P) && !under(x, y)) all = false;
        }
    }
    if (all) return [];
    return [{ pts: P.slice(), span: st.span ?? [0, 1], bites: biteList(C, took) }];
}

// The patch rubbing out what the sweep passes over, of the strokes asked for
// ([[where, id]]: a user's layer on the sheet, or '@' and a card's key):
// each cut into the pieces left (the first keeping its id), each piece the
// stroke's own (paint, width, brightness, opacity, public, maker) with the
// whole stroke's seed and its stretch of it. `may(where, stroke, card)`:
// whether this user may rub it out. Never a locked stroke, nor one on a
// locked card. Null when nothing changes.
// (`view`: the board's view, or a function making it: only a card's strokes
// need it, laid out on the card)
export function cutPatch(raw, view, sweep, keys, look, may = () => true) {
    let V = null;
    const viewNow = () => (V ??= typeof view === 'function' ? view() : view);
    const out = { marks: {}, scraps: {} };
    // (the ids each layer or card has, those given out here too: Luke
    // 2026-10-25, every stroke's second piece took the same new id, so one
    // drag across many strokes kept only the last stroke's)
    const ids = {};
    // (each stroke once: a stroke named twice was cut twice, its pieces
    // after the first made twice)
    const done = new Set();
    let any = false;
    for (const [where, id] of keys ?? []) {
        if (done.has(`${where}|${id}`)) continue;
        done.add(`${where}|${id}`);
        const onCard = String(where).startsWith('@');
        const key = onCard ? String(where).slice(1) : null;
        const card = onCard ? raw?.scraps?.[key] : null;
        const had = onCard ? card?.marks?.[id] : raw?.marks?.[where]?.[id];
        if (!had || had.locked || card?.locked || !may(where, had, card)) continue;
        const vs = onCard ? viewNow()?.scraps?.find((x) => x.key === key) : null;
        if (onCard && !vs) continue;
        // (in board px: a card's stroke as the board lays it out)
        const board = onCard ? vs.layout.strokes?.find((x) => x.id === id) : had;
        if (!board) continue;
        const pieces = cutStroke(board, sweep);
        if (!pieces) continue;
        any = true;
        const seed = had.seed ?? (onCard ? `cmark:${key}:${id}` : `mark:${id}:${had.pts.length}`);
        const taken = (ids[where] ??= { ...((onCard ? card.marks : raw.marks?.[where]) ?? {}) });
        const put = {};
        put[id] = null;
        pieces.forEach((pc, i) => {
            const pid = i === 0 ? id : customKey('m', taken);
            taken[pid] = 1;
            const whole = { ...board, pts: pc.pts, span: pc.span, seed, bites: pc.bites ?? null };
            delete whole.id;
            if (!whole.bites) delete whole.bites;
            const st = onCard ? { ...strokeToCard(whole, vs, look), by: had.by ?? null } : cleanStroke(whole);
            if (st) put[pid] = st;
        });
        if (onCard) out.scraps[key] = { marks: { ...(out.scraps[key]?.marks ?? {}), ...put } };
        else out.marks[where] = { ...(out.marks[where] ?? {}), ...put };
    }
    if (!any) return null;
    if (!Object.keys(out.scraps).length) delete out.scraps;
    if (!Object.keys(out.marks).length) delete out.marks;
    return out;
}

// A new pin where the Pin tool would put it (Luke, 2026-10-25: shown under
// the pointer before the click), as the board will draw it: stuck in the card
// under the point (kept to its paper), else loose; its size and its little
// turn of its own from the id it will have. { tex, x, y, w, rot, on, at,
// locked } (locked: the card under it won't take it)
export function pinPreview(raw, view, look, tex, pt) {
    const id = customKey('pin', raw?.pins ?? {});
    const w = Math.max(11, look.scrap.w * 0.13 * 0.85) * pinScale(tex);
    const own = (((hashSeed(id) % 21) - 10) / 2) * DEG;
    const scraps = view?.scraps ?? [];
    let card = null;
    for (let i = scraps.length - 1; i >= 0; i--) {
        if (pointInPoly(pt, scraps[i].layout.hull)) {
            card = scraps[i];
            break;
        }
    }
    if (!card) return { tex, x: pt.x, y: pt.y, w, rot: own, on: null, at: null, locked: false };
    const at = uvOn(card.layout, pt);
    const B = card.layout.box ?? card.layout.paper;
    const p = toWorld(at.u * B.w, at.v * B.h, B.cx, B.cy, B.rot);
    return { tex, x: p.x, y: p.y, w, rot: pinTurn(B.rot, own), on: card.key, at, locked: Boolean(card.locked) };
}

// A new string: a pin at each end (one already there, or one made where the
// end was asked for: stuck in the scrap under it, else loose), and the string
// between them; `prep` first (a pin it shares, made). Returns { id, patch }.
// (`pin`: the pin its ends are, picked in the String window; Luke 2026-10-25)
// (`plainPins`: its pins keep their own colour; Luke 2026-10-25)
export function newStringPatch(raw, act, kind, look, { color = null, author = null, state = 'known', pin = null, plainPins = false } = {}) {
    const fam = look.pools.ends?.[kind]?.length ? look.pools.ends[kind] : look.pools.pins;
    const id = customKey('l', raw.links ?? {});
    const patch = { pins: { ...(act.prep?.pins ?? {}) }, links: { ...(act.prep?.links ?? {}) }, scraps: { ...(act.prep?.scraps ?? {}) } };
    const used = { ...(raw.pins ?? {}), ...patch.pins };
    // (one kind of pin a string, chosen when it is made; run on from a pin, that
    // pin's kind and size: Luke 2026-10-06)
    const from = used[act.aPin] ?? used[act.bPin] ?? null;
    const tex = from?.tex ?? (pin || pickFrom(fam, id)) ?? 'tx/fixtures__fixture_grey_tack_small';
    const sz = from?.s ? { s: from.s } : {};
    const make = (key, at, pt) => {
        const pid = customKey('pin', used);
        used[pid] = 1;
        patch.pins[pid] = key ? { tex, ...sz, on: key, at: at ?? { u: 0, v: -0.4 } } : { tex, ...sz, x: Math.round(pt.x), y: Math.round(pt.y) };
        if (author) patch.pins[pid].author = author;
        return pid;
    };
    const aPin = act.aPin ?? make(act.a, act.aAt, act.aPt);
    const bPin = act.bPin ?? make(act.b, act.bAt, act.bPt);
    // (a string run on from another is shown or hidden as that one is: Luke 2026-10-06)
    patch.newLinks = { [id]: { kind, state: state === 'hidden' ? 'hidden' : 'known', aPin, bPin, ...(color === null || color === undefined ? {} : { color }), ...(author ? { author } : {}), ...(plainPins ? { plainPins: true } : {}) } };
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
    // (once, 2026-10-06: each string's pins made one kind, its first pin's;
    // only the pins of its family that no other string holds)
    if ((board.pinsEd ?? 0) < 1) {
        unifyStringPins(board, look);
        board.pinsEd = 1;
        changed = true;
    }
    // (once, 2026-10-24: every note's writing fits its paper, which no longer
    // grows to fit it; each grown note keeps its size)
    if ((board.notesEd ?? 0) < NOTES_EDITION) {
        if ((board.notesEd ?? 0) < 1) fitNotes(board, look, size, measure);
        // (once, 2026-10-25: writing moved, sized, or turned keeps its size)
        freezeNoteText(board, look, size, measure);
        board.notesEd = NOTES_EDITION;
        changed = true;
    }
    return { board, changed };
}

// Which edition of the notes' layout a board is in (board.notesEd): 1 since
// 2026-10-24, when a note's writing came to fit its paper; 2 since
// 2026-10-25, when writing moved, sized, or turned kept its size
export const NOTES_EDITION = 2;

// Every note whose writing was moved, sized, or turned by hand keeps the
// size its writing has now (`fs` on its writing's part; Luke, 2026-10-25:
// only untouched notes fit their writing). The cards in the bin too. Laid
// out with the fonts loaded (the caller's). In place; returns how many.
export function freezeNoteText(board, look, size, measure) {
    let n = 0;
    const one = (key, raw) => {
        const t = raw?.parts?.text;
        if (!t || raw.type !== 'note' || raw.tag || Number(t.fs) > 0) return;
        const s = normalizeBoard({ scraps: { [key]: raw } }).scraps[key];
        const fs = s ? scrapLayout(s, look, size, measure).textFs : null;
        if (!(fs > 0)) return;
        t.fs = fs;
        n++;
    };
    for (const [key, raw] of Object.entries(board?.scraps ?? {})) one(key, raw);
    for (const [key, e] of Object.entries(board?.bin ?? {})) one(key, e?.scrap);
    return n;
}

// An older board's notes brought into the fitted layout (Luke, 2026-10-24:
// the change is retroactive, every note already placed): a note whose paper
// had grown to fit its writing has that growth written into its own size, so
// it keeps the size it has; its marker strokes (in its own units) are drawn
// back down by as much, so they keep theirs. The cards in the bin too, so one
// put back comes back the same. In place; returns how many changed.
export function fitNotes(board, look, size, measure) {
    let n = 0;
    const one = (key, raw) => {
        if (!raw || raw.type !== 'note' || raw.tag) return;
        const s = normalizeBoard({ scraps: { [key]: raw } }).scraps[key];
        if (!s) return;
        const g = scrapLayout(s, look, size, measure, null, { legacy: true }).grew;
        if (!(g > 1.0005)) return;
        raw.s = Number((s.s * g).toPrecision(4));
        const k = s.s / raw.s;
        for (const m of Object.values(raw.marks ?? {})) {
            if (!Array.isArray(m?.pts)) continue;
            m.pts = m.pts.map((v) => Math.round(Number(v) * k * 10000) / 10000);
            if (Number.isFinite(Number(m.w))) m.w = Math.round(Number(m.w) * k * 100) / 100;
        }
        n++;
    };
    for (const [key, raw] of Object.entries(board?.scraps ?? {})) one(key, raw);
    for (const [key, e] of Object.entries(board?.bin ?? {})) one(key, e?.scrap);
    return n;
}

// The texture a card's web is (the one extra that is a thing on it)
export const WEB_TEX = TX.web;

// The papers a new note may lie on (Luke, 2026-10-24: "Any" picks one at
// once, and the note keeps it): the look's note papers solid enough, of a
// note's shape one way round or the other
function notePapers(look, size) {
    return (look.pools.notes ?? []).filter((id) => {
        const z = size(id);
        if (!z || (z.cover ?? 1) < MIN_COVER) return false;
        return [0, 1].some((t) => { const a = safeAspect(paperAs(z, t, false)); return a > 0.62 && a < 1.6; });
    });
}
// one of them at random, not `not` (when there is another)
export function pickNotePaper(look, size, not = null, rand = Math.random) {
    const all = notePapers(look, size);
    const list = all.length > 1 ? all.filter((id) => id !== not) : all;
    return list.length ? list[Math.floor(rand() * list.length)] : null;
}

// A note or writing as its window previews it (Luke, 2026-10-24: the note as
// it will be, before it is made and when it is edited): the card the board
// would make of `fields` (a scrap's: its key, type, place, text, hand, paper,
// paint, turns, writing's place and size, strokes), laid out where it is or
// will be, and how a preview `cw` x `ch` px shows it: { scrap (as a view's),
// k, ox, oy } (board px to preview px: x * k + ox, y * k + oy)
export function notePreview(fields, look, size, measure, cw, ch, { pad = 0.1 } = {}) {
    const key = fields?.key ?? 'preview';
    const raw = { ...(fields ?? {}), text: String(fields?.text ?? '').trim() || '...', drop: (fields?.drop ?? []).filter((id) => id !== 'text') };
    const s = normalizeBoard({ scraps: { [key]: { x: 0, y: 0, ...raw } } }).scraps[key];
    if (!s) return null;
    const layout = scrapLayout(s, look, size, measure, s.lib ? look.library[s.lib] : null);
    const pts = [...layout.hull];
    for (const ln of layout.lines ?? []) pts.push(ln.x - (ln.w ?? 0) / 2, ln.y - ln.size, ln.x + (ln.w ?? 0) / 2, ln.y + ln.size);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const w = Math.max(1, x1 - x0) * (1 + pad * 2);
    const h = Math.max(1, y1 - y0) * (1 + pad * 2);
    const k = Math.min(cw / w, ch / h);
    // (its text left out of the view's copy: the painter keeps the paper's
    // picture by what it is, and the writing is drawn over it, so typing
    // never paints the paper again)
    return { scrap: { ...s, text: '', look: 'known', layout }, k, ox: cw / 2 - k * (x0 + x1) / 2, oy: ch / 2 - k * (y0 + y1) / 2 };
}

// A note's writing dragged clear off it (Luke, 2026-10-24): it becomes
// writing on the sheet where it was let go, in the note's hand, paint, and
// setting, the size it was written, and the note's maker's and public as the
// note was; the note left blank. `vs`: the note as the view lays it out; `at`
// the writing's middle; `key` the new writing's (else the next free).
// Returns the patch, or null.
export function breakAwayPatch(raw, vs, at, look, key = null) {
    const rs = raw?.scraps?.[vs?.key];
    if (!rs || vs.type !== 'note' || vs.tag || !String(rs.text ?? '').trim()) return null;
    const L = vs.layout;
    const ln = L.lines?.[0];
    if (!ln) return null;
    const box = (L.parts ?? []).find((p) => p.id === 'text');
    const fk = vs.typed ? 0.82 : look.fonts?.scale?.[L.font] ?? 1;
    const s = clamp(ln.size / (look.scrap.w * 0.18 * fk), 0.05, 8);
    const k = key ?? customKey('w', keysTaken(raw));
    const writing = {
        type: 'scrawl', text: String(rs.text), x: Math.round(at.x), y: Math.round(at.y),
        r: Math.round(((box?.rot ?? L.paper.rot) * 180) / Math.PI), s: Number(s.toPrecision(4)),
        state: vs.state === 'hidden' ? 'hidden' : 'known',
        ...(vs.typed ? { typed: true } : { hand: L.font }),
        ...(rs.paint !== null && rs.paint !== undefined ? { paint: rs.paint, bright: rs.bright ?? 1 } : {}),
        ...Object.fromEntries(Object.entries(textStyleOf(rs)).filter(([, v]) => v)),
        ...(rs.fmt?.length ? { fmt: rs.fmt } : {}),
        ...(rs.author ? { author: rs.author } : {}),
        ...(rs.open ? { open: true } : {}),
    };
    const parts = { ...(rs.parts ?? {}) };
    delete parts.text;
    return {
        scraps: { [vs.key]: { text: '', fmt: [], drop: [...new Set([...(rs.drop ?? []), 'text'])], parts } },
        newScraps: { [k]: writing },
    };
}

// A note with no writing on it (Luke, 2026-10-25): never written, or its
// writing taken off
export const noteBlank = (rs) => Boolean(rs && rs.type === 'note' && !rs.tag && (!String(rs.text ?? '').trim() || (rs.drop ?? []).includes('text')));

// Writing on the sheet dropped on a blank note (Luke, 2026-10-25): it
// becomes the note's writing, in its hand, paint, and setting, fitted to the
// note as a note's writing is; the writing itself gone. The reverse of
// breakAwayPatch. Null unless `wKey` is writing, `nKey` a blank note, and
// neither is locked.
export function absorbPatch(raw, wKey, nKey) {
    const w = raw?.scraps?.[wKey];
    const n = raw?.scraps?.[nKey];
    if (!w || w.type !== 'scrawl' || w.locked || !String(w.text ?? '').trim() || !noteBlank(n) || n.locked || wKey === nKey) return null;
    const parts = { ...(n.parts ?? {}) };
    delete parts.text;
    const style = Object.fromEntries(Object.entries(textStyleOf(w)).filter(([, v]) => v));
    return {
        scraps: {
            [nKey]: {
                text: String(w.text), drop: (n.drop ?? []).filter((id) => id !== 'text'), parts, fmt: w.fmt ?? [],
                ...(w.typed ? { typed: true } : w.hand ? { hand: w.hand, typed: false } : {}),
                ...(w.paint !== null && w.paint !== undefined ? { paint: w.paint, bright: w.bright ?? 1 } : {}),
                ...style,
            },
            [wKey]: null,
        },
    };
}

// Each string's own pins (held by no other string) the kind of its first pin,
// where both are of its family's pool. Returns whether any changed.
export function unifyStringPins(board, look) {
    const holds = {};
    for (const l of Object.values(board.links ?? {})) for (const id of [l?.aPin, l?.bPin, ...(l?.joints ?? []).map((j) => j?.pin)]) if (id) holds[id] = (holds[id] ?? 0) + 1;
    let any = false;
    for (const l of Object.values(board.links ?? {})) {
        if (!l) continue;
        const fam = new Set([...(look.pools.ends?.[l.kind] ?? []), ...(look.pools.pins ?? [])]);
        const ids = [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j?.pin)].filter((id) => id && board.pins?.[id]);
        const first = ids.map((id) => board.pins[id]).find((p) => fam.has(p.tex));
        if (!first) continue;
        for (const id of ids) {
            const p = board.pins[id];
            if (holds[id] === 1 && p.tex !== first.tex && fam.has(p.tex)) { p.tex = first.tex; any = true; }
        }
    }
    return any;
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
    // (a string taken off takes its pins, those no string left holds: its
    // ends and joints, so no lone pins are left where it was; Luke 2026-10-25.
    // Only a string taken off itself: one going to the bin with its card
    // keeps its far pin, to come back by)
    const held = new Set();
    for (const [id, l] of Object.entries(raw.links ?? {})) {
        if (!l || L.has(id)) continue;
        for (const pid of [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j?.pin)]) if (pid) held.add(pid);
    }
    for (const id of links.filter((x) => raw.links?.[x])) {
        const l = raw.links?.[id];
        for (const pid of [l?.aPin, l?.bPin, ...(l?.joints ?? []).map((j) => j?.pin)]) if (pid && raw.pins?.[pid] && !held.has(pid)) P.add(pid);
    }
    return { scraps: [...S], pins: [...P], links: [...L], edits };
}

export function customKey(prefix, existing = {}) {
    let i = 1;
    while (existing[`${prefix}${i}`]) i++;
    return `${prefix}${i}`;
}

// The keys a new card may not take: the board's cards and the bin's (Luke,
// 2026-10-21: a card binned under a key a new card then took was lost when
// that one was binned too, the older going to make room)
export const keysTaken = (raw) => ({ ...(raw?.bin ?? {}), ...(raw?.scraps ?? {}) });

/* -------------------------------------------- */
/*  The brush's doodles (Luke, 2026-10-06)      */
/* -------------------------------------------- */

// A bank of quick brush drawings: placed from the brush's doodle palette
// where they are wanted, and now and then on a card as it comes. Each is
// clean shapes (polylines in a box from -1 to 1) drawn over by a shaky human
// hand (humanize: a slow waver, a little tremor, an overshot end). Laid down
// they are ordinary strokes of whoever placed them (or the card's owner),
// theirs to move or rub out.
const arcPts = (cx, cy, rx, ry, a0, a1, n = 24) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); } return out; };
const TAU = Math.PI * 2;
// (a hand's curve through points: Catmull-Rom, n steps a span)
const smooth = (p, n = 6) => {
    const m = p.length / 2;
    const P = (i) => { const k = Math.max(0, Math.min(m - 1, i)); return [p[2 * k], p[2 * k + 1]]; };
    const out = [];
    for (let i = 0; i < m - 1; i++) {
        const [x0, y0] = P(i - 1), [x1, y1] = P(i), [x2, y2] = P(i + 1), [x3, y3] = P(i + 2);
        for (let k = 0; k < n; k++) {
            const t = k / n, t2 = t * t, t3 = t2 * t;
            out.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3),
                0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3));
        }
    }
    out.push(p[p.length - 2], p[p.length - 1]);
    return out;
};
const circle = (cx, cy, r, n = 18) => arcPts(cx, cy, r, r, 0, TAU + 0.25, n);
// The board's doodles (Luke, 2026-10-25): little engraved map pictures for
// the players' own map, all in one hand. Places stand on a ground line, lit
// from the upper left, their shadowed faces hatched; signs are marks to set
// by them, without the ground. Three weights (outline, detail, hatching:
// a shape's `k`) and a steady pen. Each a function returning shapes in a box
// from -1 to 1, y down (fitShapes centres and sizes them).
const gOut = (pts) => ({ pts, k: 0.8 });
const gDet = (pts) => ({ pts, k: 0.55 });
// (hatching as runs, hatchRun: Luke 2026-10-25, round eight)
const gShade = (poly, gap = 0.15, ang = 1.05) => hatchRun(poly, gap, ang);
const gShadeFine = (poly, gap = 0.12, ang = 1.05) => hatchRun(poly, gap, ang);
const gGround = (x0 = -0.9, x1 = 0.9, y = 0.84) => [gOut([x0, y, x1, y + 0.01]), gDet([x0 + 0.35, y + 0.12, x1 - 0.25, y + 0.12])];
const gArch = (cx, y, r, n = 14) => arcPts(cx, y, r, r, Math.PI, TAU, n);
const gEll = (cx, cy, rx, ry, a0 = 0, a1 = TAU, n = 20) => arcPts(cx, cy, rx, ry, a0, a1, n);
const gCurve = (f, n = 16) => { const p = []; for (let i = 0; i <= n; i++) { const [x, y] = f(i / n); p.push(x, y); } return p; };
const gMirror = (p) => p.map((v, i) => (i % 2 ? v : -v));
// (a spark one stroke, a little four-pointed star; a tuft one stroke, its
// blades a zigzag: Luke 2026-10-25, round eight)
const gSpark = (x, y, r = 0.07) => { const p = []; for (let i = 0; i <= 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, q = i % 2 ? r * 0.3 : r; p.push(x + Math.cos(a) * q, y + Math.sin(a) * q); } return [gDet(p)]; };
const gTuft = (x, y, k = 1) => [gDet([x - 0.06 * k, y - 0.12 * k, x - 0.012 * k, y, x, y - 0.15 * k, x + 0.012 * k, y, x + 0.06 * k, y - 0.11 * k])];
const gCurl = (cx, cy, r0, a0, turns = 1.4, dir = 1) => gCurve((t) => { const a = a0 + dir * t * TAU * turns, r = r0 * (1 - t * 0.85); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }, 20);
const gLeaf = (x, y, a, l = 0.14, w = 0.05) => { const c = Math.cos(a), s = Math.sin(a), Q = (u, v) => [x + u * c - v * s, y + u * s + v * c]; return gDet([...Q(0, 0), ...Q(l * 0.5, w), ...Q(l, 0), ...Q(l * 0.5, -w), ...Q(0, 0)]); };
const gHeartPts = (cx, cy, k, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const t = (i / n) * TAU; p.push(cx + ((16 * Math.sin(t) ** 3) / 17) * k, cy - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17) * k); } return p; };
export const DOODLES = {
    // ---- places
    // a walled town: a spired church over its rooftops, its gate
    haven: () => {
        const out = [gOut([-0.92, 0.84, -0.92, 0.36, 0.92, 0.36, 0.92, 0.84])];
        for (let i = 0; i < 9; i++) { const x = -0.92 + i * 0.2044; out.push(gOut([x, 0.36, x, 0.28, x + 0.1, 0.28, x + 0.1, 0.36])); }
        out.push(gOut([-0.14, 0.84, -0.14, 0.62, ...gArch(0, 0.62, 0.14, 8), 0.14, 0.84]), ...gShadeFine([-0.14, 0.84, -0.14, 0.62, ...gArch(0, 0.62, 0.14, 8), 0.14, 0.84], 0.05));
        out.push(gOut([-0.7, 0.28, -0.7, -0.06, -0.48, -0.06, -0.48, 0.28]), gOut([-0.74, -0.06, -0.59, -0.3, -0.44, -0.06]), gOut([0.46, 0.28, 0.46, -0.1, 0.72, -0.1, 0.72, 0.28]), gOut([0.42, -0.1, 0.59, -0.34, 0.76, -0.1]));
        out.push(gOut([-0.16, 0.28, -0.16, -0.4, 0.16, -0.4, 0.16, 0.28]), gOut([-0.2, -0.4, 0, -0.98, 0.2, -0.4]), gDet([0, -0.98, 0, -1.08]), gDet([-0.04, -1.04, 0.04, -1.04]), gOut([-0.05, -0.22, -0.05, -0.08, 0.05, -0.08, 0.05, -0.22]));
        out.push(gOut([-0.4, 0.28, -0.4, 0.06, -0.24, 0.06, -0.24, 0.28]), gOut([-0.44, 0.06, -0.32, -0.12, -0.2, 0.06]), gOut([0.24, 0.28, 0.24, 0.0, 0.4, 0.0, 0.4, 0.28]), gOut([0.2, 0.0, 0.32, -0.16, 0.44, 0.0]));
        out.push(...gShadeFine([0, -0.98, 0.2, -0.4, 0, -0.4], 0.05), ...gShadeFine([0.59, -0.34, 0.76, -0.1, 0.59, -0.1], 0.05), ...gShadeFine([-0.59, -0.3, -0.44, -0.06, -0.59, -0.06], 0.05), ...gShade([0.5, 0.36, 0.92, 0.36, 0.92, 0.84, 0.5, 0.84], 0.1), ...gGround(-0.98, 0.98));
        return out;
    },
    // a palisade: sharpened stakes round a gate, roofs over it
    palisade: () => {
        const top = [];
        for (let i = 0; i <= 12; i++) { const x = -0.88 + i * 0.1467; top.push(x - 0.05, 0.14, x, 0.0, x + 0.05, 0.14); }
        const out = [gOut([-0.93, 0.84, -0.93, 0.14, ...top, 0.93, 0.14, 0.93, 0.84])];
        for (let i = 1; i < 12; i++) { const x = -0.88 + i * 0.1467; if (Math.abs(x) < 0.2) continue; out.push(gDet([x - 0.07, 0.16, x - 0.07, 0.84])); }
        out.push(gOut([-0.18, 0.84, -0.18, 0.44, 0.18, 0.44, 0.18, 0.84]), gDet([0, 0.44, 0, 0.84]), ...gShade([0.0, 0.44, 0.18, 0.44, 0.18, 0.84, 0.0, 0.84], 0.07),
            gOut([-0.66, 0.0, -0.44, -0.34, -0.22, 0.0]), gOut([0.16, 0.0, 0.42, -0.5, 0.68, 0.0]), gOut([0.36, -0.38, 0.36, -0.6]), ...gShade([-0.44, -0.34, -0.22, 0.0, -0.44, 0.0], 0.08), ...gShade([0.42, -0.5, 0.68, 0.0, 0.42, 0.0], 0.08), ...gGround(-0.98, 0.98));
        return out;
    },
    // a cottage: thatch, timber framing, a shuttered window, an arched door, smoke curling, a fence
    hovel: () => {
        const out = [gOut([-0.56, 0.84, -0.56, 0.06, 0.48, 0.06, 0.48, 0.84]), gOut(smooth([-0.74, 0.12, -0.36, -0.36, -0.06, -0.66, 0.28, -0.32, 0.66, 0.12], 4)), gDet(smooth([-0.7, 0.1, -0.06, -0.6, 0.62, 0.1], 4))];
        for (let i = 0; i < 9; i++) { const t = 0.1 + i * 0.1; const x = -0.74 + 1.4 * t, y = -0.66 + Math.abs(x + 0.06) * 0.98 + 0.06; out.push(gDet([x, y - 0.02, x + (x < -0.06 ? 0.05 : -0.05), y + 0.12])); }
        out.push(gDet([-0.56, 0.42, 0.48, 0.42]), gDet([-0.56, 0.06, -0.3, 0.42]), gDet([0.48, 0.06, 0.24, 0.42]), gDet([-0.04, 0.06, -0.04, 0.42]));
        out.push(gOut([-0.38, 0.84, -0.38, 0.56, ...arcPts(-0.24, 0.56, 0.14, 0.12, Math.PI, TAU, 8), -0.1, 0.84]), gDet(circle(-0.14, 0.7, 0.02, 4)), ...gShadeFine([-0.24, 0.84, -0.24, 0.44, -0.1, 0.56, -0.1, 0.84], 0.05));
        out.push(gOut([0.1, 0.52, 0.32, 0.52, 0.32, 0.72, 0.1, 0.72, 0.1, 0.52]), gDet([0.21, 0.52, 0.21, 0.72]), gDet([0.1, 0.62, 0.32, 0.62]), gDet([0.02, 0.5, 0.08, 0.5, 0.08, 0.74, 0.02, 0.74]), gDet([0.34, 0.5, 0.4, 0.5, 0.4, 0.74, 0.34, 0.74]));
        out.push(gOut([0.22, -0.34, 0.22, -0.68, 0.38, -0.68, 0.38, -0.16]), gDet(smooth([0.3, -0.74, 0.22, -0.86, 0.34, -0.94, 0.26, -1.06, 0.36, -1.14], 3)), gDet(smooth([0.36, -0.8, 0.46, -0.9, 0.42, -1.0], 3)));
        out.push(...gShade([-0.06, -0.66, 0.28, -0.32, 0.66, 0.12, -0.06, 0.12], 0.13), gDet([0.56, 0.84, 0.56, 0.58]), gDet([0.74, 0.84, 0.74, 0.58]), gDet([0.92, 0.84, 0.92, 0.58]), gDet([0.5, 0.66, 0.98, 0.66]), gDet([0.5, 0.76, 0.98, 0.76]), ...gGround(-0.95, 0.98));
        return out;
    },
    // a watchtower: battlements, a pennant, arrow slits, buttresses
    tower: () => {
        const out = [gOut([-0.32, 0.84, -0.28, -0.34, 0.28, -0.34, 0.32, 0.84]), gOut([-0.4, -0.34, 0.4, -0.34, 0.4, -0.5, -0.4, -0.5, -0.4, -0.34])];
        for (let i = 0; i < 4; i++) { const x = -0.4 + i * 0.24; out.push(gOut([x, -0.5, x, -0.64, x + 0.12, -0.64, x + 0.12, -0.5])); }
        out.push(gDet([0, -0.64, 0, -0.98]), gOut([0, -0.98, 0.34, -0.9, 0.2, -0.84, 0.34, -0.76, 0, -0.78]), ...gShadeFine([0, -0.98, 0.34, -0.9, 0.2, -0.84, 0.34, -0.76, 0, -0.78], 0.04));
        out.push(gOut([-0.12, 0.84, -0.12, 0.56, ...gArch(0, 0.56, 0.12, 6), 0.12, 0.84]), ...gShadeFine([-0.12, 0.84, -0.12, 0.56, ...gArch(0, 0.56, 0.12, 6), 0.12, 0.84], 0.05));
        out.push(gOut([-0.03, -0.2, -0.03, 0.0, 0.03, 0.0, 0.03, -0.2]), gOut([-0.06, -0.1, 0.06, -0.1]), gOut([-0.03, 0.2, -0.03, 0.36, 0.03, 0.36, 0.03, 0.2]), gDet([-0.3, 0.42, 0.3, 0.42]), gDet([-0.29, 0.08, 0.29, 0.08]));
        out.push(gOut([-0.32, 0.84, -0.48, 0.84, -0.32, 0.5]), gOut([0.32, 0.84, 0.48, 0.84, 0.32, 0.5]), ...gShade([0.12, 0.84, 0.12, -0.34, 0.28, -0.34, 0.32, 0.84], 0.07), ...gGround(-0.8, 0.8));
        return out;
    },
    // a signal fire: its brazier blazing on a corbelled stone tower, sparks
    // flying, smoke curling away
    beacon: () => {
        const out = [gOut([-0.26, 0.84, -0.2, -0.1, 0.2, -0.1, 0.26, 0.84]), ...gShade([0.08, 0.84, 0.08, -0.1, 0.2, -0.1, 0.26, 0.84], 0.08)];
        for (const y of [0.56, 0.28, 0.02]) { const hw = 0.26 - ((0.84 - y) / 0.94) * 0.06; out.push(gDet([-hw, y, hw, y])); }
        out.push(gDet([-0.1, 0.28, -0.1, 0.56]), gDet([0.04, 0.02, 0.04, 0.28]), gDet([-0.11, -0.1, -0.11, 0.02]));
        out.push(gOut([-0.09, 0.84, -0.09, 0.68, ...gArch(0, 0.68, 0.09, 6), 0.09, 0.84]), ...gShadeFine([-0.09, 0.84, -0.09, 0.68, ...gArch(0, 0.68, 0.09, 6), 0.09, 0.84], 0.04));
        out.push(gOut([-0.34, -0.1, 0.34, -0.1, 0.34, -0.2, -0.34, -0.2, -0.34, -0.1]), ...[-0.14, 0.14].map((x) => gDet(arcPts(x, -0.1, 0.07, 0.07, 0, Math.PI, 6))));
        out.push(gOut([-0.36, -0.46, -0.22, -0.2, 0.22, -0.2, 0.36, -0.46]), gOut([-0.42, -0.46, 0.42, -0.46]), gDet([-0.3, -0.33, 0.3, -0.33]), ...[-0.14, 0, 0.14].map((x) => gDet([x * 1.3, -0.46, x, -0.2])));
        out.push(gOut(smooth([-0.32, -0.47, -0.4, -0.66, -0.24, -0.62, -0.26, -0.84, -0.08, -0.72, 0.0, -1.02, 0.1, -0.74, 0.26, -0.88, 0.22, -0.62, 0.4, -0.68, 0.32, -0.47], 4)));
        out.push(gDet(smooth([-0.16, -0.47, -0.16, -0.6, -0.05, -0.56, 0.0, -0.76, 0.06, -0.58, 0.16, -0.62, 0.16, -0.47], 3)), ...gShadeFine([0.1, -0.74, 0.26, -0.88, 0.22, -0.62, 0.4, -0.68, 0.32, -0.47, 0.16, -0.47], 0.05));
        out.push(gDet(smooth([0.02, -1.04, 0.12, -1.16, 0.04, -1.28, 0.16, -1.38], 3)), gDet(gCurl(0.25, -1.38, 0.09, Math.PI, 1.2, 1)));
        out.push(...gSpark(-0.56, -0.84, 0.09), ...gSpark(0.6, -0.92, 0.08), ...gSpark(0.62, -0.5, 0.07), ...gSpark(-0.6, -0.48, 0.06));
        out.push(...gTuft(-0.42, 0.84, 0.8), ...gTuft(0.44, 0.84, 0.7), ...gGround(-0.66, 0.66));
        return out;
    },
    // a market: a stall under a scalloped, striped awning, its goods on the counter, a sign hung from it
    market: () => {
        const out = [gOut([-0.84, -0.18, -0.72, -0.62, 0.72, -0.62, 0.84, -0.18])];
        const sc = []; for (let i = 0; i < 7; i++) { const x0 = -0.84 + (i * 1.68) / 7; sc.push(...arcPts(x0 + 0.12, -0.18, 0.12, 0.09, Math.PI, 0, 5)); } out.push(gOut(sc));
        for (let i = 0; i < 7; i += 2) { const xa = -0.84 + (i * 1.68) / 7, xb = xa + 1.68 / 7; out.push(...gShadeFine([xa + 0.12 * (i / 7), -0.6, xb - 0.12 * (i / 7) + 0.02, -0.6, xb + 0.02, -0.18, xa, -0.18], 0.035, 1.3)); }
        out.push(gOut([-0.76, -0.12, -0.76, 0.84]), gOut([0.76, -0.12, 0.76, 0.84]), gOut([-0.84, 0.3, 0.84, 0.3, 0.84, 0.4, -0.84, 0.4, -0.84, 0.3]), gOut([-0.7, 0.4, -0.7, 0.84, 0.7, 0.84, 0.7, 0.4]), ...gShade([0.3, 0.4, 0.7, 0.4, 0.7, 0.84, 0.3, 0.84], 0.08), ...[-0.24, 0.24].map((x) => gDet([x, 0.4, x, 0.84])));
        out.push(gOut([-0.6, 0.3, -0.6, 0.12, -0.44, 0.12, -0.44, 0.3]), gOut(gEll(-0.52, 0.12, 0.08, 0.025, 0, TAU, 6)), gOut(smooth([-0.3, 0.3, -0.34, 0.14, -0.22, 0.06, -0.1, 0.14, -0.14, 0.3], 3)), gDet([-0.26, 0.08, -0.18, 0.08]));
        for (const [x, y] of [[0.12, 0.24], [0.24, 0.24], [0.18, 0.15], [0.36, 0.25]]) out.push(gOut(circle(x, y, 0.055, 7)));
        out.push(gOut(gEll(0.58, 0.18, 0.1, 0.12, 0, TAU, 10)), gDet([0.52, 0.08, 0.64, 0.08]));
        out.push(gDet([0.0, -0.18, 0.0, -0.06]), gOut([-0.18, -0.06, 0.18, -0.06, 0.18, 0.06, -0.18, 0.06, -0.18, -0.06]), gDet(circle(0, 0.0, 0.03, 4)), ...gGround(-0.98, 0.98));
        return out;
    },
    // a throne: a high back under a pointed arch, finials, a carved crest, scrolled arms, a cushion, its carpeted dais
    throne: () => {
        const out = [gOut([-0.36, 0.42, -0.36, -0.56, ...arcPts(0, -0.56, 0.36, 0.38, Math.PI, TAU, 14), 0.36, -0.56, 0.36, 0.42]), gDet([-0.26, 0.2, -0.26, -0.52, ...arcPts(0, -0.52, 0.26, 0.28, Math.PI, TAU, 12), 0.26, -0.52, 0.26, 0.2])];
        for (const x of [-0.4, 0.4]) out.push(gOut([x - 0.05, -0.56, x + 0.05, -0.56, x, -0.74, x - 0.05, -0.56]), gOut(circle(x, -0.78, 0.04, 5)));
        out.push(gOut(circle(0, -0.98, 0.05, 6)), gOut(circle(0, -0.4, 0.1, 10)));
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; out.push(gDet([Math.cos(a) * 0.12, -0.4 + Math.sin(a) * 0.12, Math.cos(a) * 0.18, -0.4 + Math.sin(a) * 0.18])); }
        for (const s of [-1, 1]) out.push(gOut([s * 0.36, 0.0, s * 0.56, 0.0, s * 0.56, 0.42]), gOut(smooth([s * 0.36, -0.04, s * 0.58, -0.06, s * 0.66, 0.02, s * 0.6, 0.1, s * 0.54, 0.06], 3)), gDet([s * 0.46, 0.06, s * 0.46, 0.42]));
        out.push(gOut([-0.36, 0.2, 0.36, 0.2, 0.4, 0.3, -0.4, 0.3, -0.36, 0.2]), gDet(smooth([-0.36, 0.22, 0, 0.16, 0.36, 0.22], 2)), gOut([-0.56, 0.42, 0.56, 0.42]), ...gShade([0.26, 0.2, 0.26, -0.52, 0.36, -0.56, 0.36, 0.2], 0.05), ...gShade([0.46, 0.06, 0.56, 0.0, 0.56, 0.42, 0.46, 0.42], 0.05));
        out.push(gOut([-0.74, 0.84, -0.74, 0.62, 0.74, 0.62, 0.74, 0.84]), gOut([-0.62, 0.62, -0.62, 0.42, 0.62, 0.42, 0.62, 0.62]), gOut([-0.24, 0.84, -0.2, 0.42, 0.2, 0.42, 0.24, 0.84]), ...gShadeFine([-0.24, 0.84, -0.2, 0.42, 0.2, 0.42, 0.24, 0.84], 0.05, 0.4), ...gShade([0.4, 0.62, 0.74, 0.62, 0.74, 0.84, 0.4, 0.84], 0.07), ...gGround(-0.98, 0.98));
        return out;
    },
    // a shrine: an arched niche between pilasters, a pediment, a hooded figure, candles and an offering on its steps
    shrine: () => {
        const out = [gOut([-0.7, 0.84, -0.7, 0.68, 0.7, 0.68, 0.7, 0.84]), gOut([-0.56, 0.68, -0.56, 0.54, 0.56, 0.54, 0.56, 0.68]), ...gShade([0.5, 0.84, 0.5, 0.68, 0.7, 0.68, 0.7, 0.84], 0.07)];
        for (const s of [-1, 1]) out.push(gOut([s * 0.5, 0.54, s * 0.5, -0.36]), gOut([s * 0.36, 0.54, s * 0.36, -0.36]), gDet([s * 0.43, 0.5, s * 0.43, -0.32]), gOut([s * 0.54, -0.36, s * 0.32, -0.36]));
        out.push(gOut([-0.6, -0.36, 0.6, -0.36]), gOut([-0.62, -0.42, 0, -0.82, 0.62, -0.42, -0.62, -0.42]), gDet([-0.42, -0.48, 0, -0.74, 0.42, -0.48]), gOut(circle(0, -0.58, 0.05, 6)));
        const niche = [-0.3, 0.54, -0.3, -0.06, ...arcPts(0, -0.06, 0.3, 0.26, Math.PI, TAU, 12), 0.3, 0.54];
        out.push(gOut(niche), gDet(arcPts(0, -0.06, 0.3, 0.26, Math.PI * 1.15, Math.PI * 1.35, 4)), ...gShadeFine([0.1, 0.54, 0.12, -0.2, 0.3, -0.06, 0.3, 0.54], 0.07));
        out.push(gOut([-0.14, 0.54, ...smooth([-0.14, 0.54, -0.12, 0.12, -0.08, -0.12, 0, -0.26, 0.08, -0.12, 0.12, 0.12, 0.14, 0.54], 4)]), gDet([-0.06, -0.12, 0, -0.04, 0.06, -0.12]), gDet([0, -0.04, 0, 0.4]));
        for (const x of [-0.62, 0.62]) out.push(gOut([x - 0.03, 0.54, x - 0.03, 0.36, x + 0.03, 0.36, x + 0.03, 0.54]), gDet(smooth([x, 0.18, x + 0.03, 0.26, x, 0.32, x - 0.03, 0.26, x, 0.18], 2)));
        out.push(gOut([-0.16, 0.68, ...arcPts(0, 0.62, 0.16, 0.06, Math.PI, 0, 6), 0.16, 0.68]), ...gGround(-0.98, 0.98));
        return out;
    },
    // an idol: a squat old god on its stepped plinth, hands on its belly,
    // rayed behind its head, a candle either side
    idol: () => {
        const out = [gOut([-0.6, 0.84, -0.6, 0.66, 0.6, 0.66, 0.6, 0.84]), gOut([-0.46, 0.66, -0.46, 0.5, 0.46, 0.5, 0.46, 0.66]), ...gShade([0.36, 0.84, 0.36, 0.66, 0.6, 0.66, 0.6, 0.84], 0.07)];
        const zz = []; for (let i = 0; i <= 10; i++) zz.push(-0.5 + i * 0.1, i % 2 ? 0.71 : 0.79); out.push(gDet(zz));
        out.push(gOut([-0.3, 0.5, ...smooth([-0.3, 0.5, -0.36, 0.22, -0.32, 0.0, -0.18, -0.12, 0, -0.14, 0.18, -0.12, 0.32, 0.0, 0.36, 0.22, 0.3, 0.5], 4)]));
        out.push(gOut(gEll(0, -0.34, 0.19, 0.21, 0, TAU, 16)), gOut(gEll(-0.075, -0.37, 0.05, 0.025, 0, TAU, 6)), gOut(gEll(0.075, -0.37, 0.05, 0.025, 0, TAU, 6)), gDet([-0.07, -0.24, 0.07, -0.24]), gDet([0, -0.34, 0, -0.29]), gDet([-0.16, -0.46, 0, -0.43, 0.16, -0.46]));
        for (const s of [-1, 1]) out.push(gOut(smooth([s * 0.26, -0.04, s * 0.26, 0.16, s * 0.14, 0.26, s * 0.03, 0.24], 3)));
        out.push(...gShade([0.12, 0.5, 0.2, 0.3, 0.27, 0.0, 0.32, 0.0, 0.36, 0.22, 0.3, 0.5], 0.06), gDet(arcPts(0, -0.34, 0.3, 0.3, Math.PI * 0.86, Math.PI * 2.14, 18)));
        for (let k = 0; k < 9; k++) { const a = Math.PI * (0.95 + (k * 1.1) / 8), c = Math.cos(a), s = Math.sin(a); out.push(k % 2 ? gDet([c * 0.36, -0.34 + s * 0.36, c * 0.52, -0.34 + s * 0.52]) : gDet(smooth([c * 0.36, -0.34 + s * 0.36, c * 0.44 - s * 0.03, -0.34 + s * 0.44 + c * 0.03, c * 0.5 + s * 0.03, -0.34 + s * 0.5 - c * 0.03, c * 0.58, -0.34 + s * 0.58], 2))); }
        for (const x of [-0.53, 0.53]) out.push(gOut([x - 0.035, 0.66, x - 0.035, 0.44, x + 0.035, 0.44, x + 0.035, 0.66]), gDet(smooth([x, 0.26, x + 0.035, 0.34, x, 0.41, x - 0.035, 0.34, x, 0.26], 2)));
        out.push(...gGround(-0.96, 0.96));
        return out;
    },
    // a well: a shingled roof, its pulley wheel, the bucket on its rope
    well: () => [
        gOut(gEll(0, 0.36, 0.58, 0.14, 0, TAU, 22)), gOut([-0.58, 0.36, -0.58, 0.84]), gOut([0.58, 0.36, 0.58, 0.84]), gOut(gEll(0, 0.84, 0.58, 0.12, 0, Math.PI, 12)), ...gShade([0.22, 0.42, 0.58, 0.36, 0.58, 0.84, 0.22, 0.94], 0.08),
        ...[0.52, 0.68].map((y) => gDet(gEll(0, y, 0.58, 0.12, Math.PI * 0.05, Math.PI * 0.95, 10))), ...[-0.3, 0.0, 0.3].map((x, i) => gDet([x, 0.48 + (i % 2) * 0.02, x, 0.62])),
        gOut([-0.46, 0.3, -0.46, -0.4]), gOut([0.46, 0.3, 0.46, -0.4]), gOut([-0.76, -0.36, ...smooth([-0.76, -0.36, -0.4, -0.62, 0, -0.96, 0.4, -0.62, 0.76, -0.36], 4), -0.76, -0.36]),
        ...gShadeFine([0, -0.96, 0.4, -0.62, 0.76, -0.36, 0, -0.36], 0.08), gDet(smooth([-0.6, -0.4, -0.3, -0.58, 0, -0.84], 3)),
        gOut(circle(0, -0.2, 0.12, 12)), ...[0, 1, 2, 3].map((k) => gDet([Math.cos(k * Math.PI / 4) * 0.12, -0.2 + Math.sin(k * Math.PI / 4) * 0.12, -Math.cos(k * Math.PI / 4) * 0.12, -0.2 - Math.sin(k * Math.PI / 4) * 0.12])), gDet([-0.46, -0.2, 0.46, -0.2]),
        gDet([0.12, -0.2, 0.12, 0.1]), gOut([0.0, 0.1, 0.24, 0.1, 0.2, 0.26, 0.04, 0.26, 0.0, 0.1]),
    ],
    // a fountain: a moulded basin, a pedestal and its upper bowl, a finial spout, water falling in arcs
    fountain: () => {
        const out = [gOut(gEll(0, 0.52, 0.86, 0.14, 0, TAU, 26)), gDet(gEll(0, 0.52, 0.76, 0.1, 0, TAU, 22)), gOut([-0.86, 0.52, -0.86, 0.72]), gOut([0.86, 0.52, 0.86, 0.72]), gOut(gEll(0, 0.72, 0.86, 0.14, 0, Math.PI, 14)), gDet(gEll(0, 0.64, 0.86, 0.13, Math.PI * 0.05, Math.PI * 0.95, 12)), ...gShade([0.5, 0.62, 0.86, 0.52, 0.86, 0.74, 0.5, 0.84], 0.07)];
        out.push(gOut([-0.12, 0.5, -0.08, 0.36, -0.14, 0.3, -0.08, 0.22, -0.08, 0.08]), gOut(gMirror([-0.12, 0.5, -0.08, 0.36, -0.14, 0.3, -0.08, 0.22, -0.08, 0.08])), ...gShadeFine([0.0, 0.5, 0.0, 0.08, 0.08, 0.08, 0.08, 0.22, 0.14, 0.3, 0.08, 0.36, 0.12, 0.5], 0.035));
        out.push(gOut([-0.44, 0.0, ...smooth([-0.44, 0.0, -0.3, 0.08, 0, 0.1, 0.3, 0.08, 0.44, 0.0], 3)]), gOut(gEll(0, 0.0, 0.44, 0.06, 0, TAU, 16)), gOut([-0.05, 0.0, -0.05, -0.3, 0.05, -0.3, 0.05, 0.0]), gOut(circle(0, -0.36, 0.06, 6)), gOut([0, -0.42, 0, -0.5]));
        out.push(gDet(smooth([0, -0.5, -0.2, -0.66, -0.36, -0.4, -0.4, -0.04], 3)), gDet(smooth([0, -0.5, 0.2, -0.66, 0.36, -0.4, 0.4, -0.04], 3)), gDet(smooth([-0.44, 0.02, -0.6, 0.18, -0.64, 0.46], 3)), gDet(smooth([0.44, 0.02, 0.6, 0.18, 0.64, 0.46], 3)), gDet(smooth([-0.3, 0.06, -0.4, 0.24, -0.42, 0.46], 3)), gDet(smooth([0.3, 0.06, 0.4, 0.24, 0.42, 0.46], 3)));
        out.push(gDet([-0.7, 0.46, -0.66, 0.4]), gDet([0.68, 0.44, 0.72, 0.38]), ...gGround(-0.98, 0.98, 0.9));
        return out;
    },
    // an alarm bell: a timber frame under a little roof, the bell banded and flared, its clapper and tasselled rope
    bell: () => {
        const out = [gOut([-0.66, 0.84, -0.66, -0.56]), gOut([-0.54, 0.84, -0.54, -0.56]), gOut([0.54, 0.84, 0.54, -0.56]), gOut([0.66, 0.84, 0.66, -0.56]), gOut([-0.76, -0.56, 0.76, -0.56, 0.76, -0.64, -0.76, -0.64, -0.76, -0.56])];
        out.push(gOut([-0.86, -0.62, 0, -0.98, 0.86, -0.62]), gDet([-0.72, -0.66, 0, -0.9, 0.72, -0.66]), ...gShadeFine([0, -0.98, 0.86, -0.62, 0, -0.64], 0.06), gDet([-0.54, -0.24, -0.28, -0.56]), gDet([0.54, -0.24, 0.28, -0.56]), gDet([-0.66, 0.5, 0.66, 0.5]), gDet([-0.66, 0.5, -0.54, 0.36]), gDet([0.66, 0.5, 0.54, 0.36]));
        const bell = [-0.4, 0.22, ...smooth([-0.4, 0.22, -0.3, 0.06, -0.26, -0.24, -0.16, -0.38, 0, -0.42, 0.16, -0.38, 0.26, -0.24, 0.3, 0.06, 0.4, 0.22], 4), -0.4, 0.22];
        out.push(gOut([0, -0.64, 0, -0.42]), gOut(bell), gDet(gEll(0, 0.22, 0.4, 0.05, 0, Math.PI, 10)), gDet([-0.28, -0.12, 0.28, -0.12]), gDet([-0.3, 0.04, 0.3, 0.04]), ...gShade([0.1, -0.4, 0.26, -0.24, 0.3, 0.06, 0.4, 0.22, 0.14, 0.22], 0.06), gOut(circle(0, 0.32, 0.06, 6)), gDet([0, 0.22, 0, 0.26]));
        out.push(gDet(smooth([0.38, 0.2, 0.46, 0.42, 0.42, 0.62], 3)), gOut([0.42, 0.62, 0.36, 0.74, 0.48, 0.74, 0.42, 0.62]), ...gGround(-0.98, 0.98));
        return out;
    },
    // a gateway: its arch on two pillars, ball finials, a keystone, the iron gates with their spears and scrolls
    gate: () => {
        const out = [];
        for (const s of [-1, 1]) {
            out.push(gOut([s * 0.62, 0.84, s * 0.62, -0.3, s * 0.84, -0.3, s * 0.84, 0.84]), gOut([s * 0.58, -0.3, s * 0.88, -0.3, s * 0.88, -0.38, s * 0.58, -0.38, s * 0.58, -0.3]), gOut(circle(s * 0.73, -0.48, 0.09, 10)), gDet([s * 0.62, 0.1, s * 0.84, 0.1]), gDet([s * 0.62, 0.5, s * 0.84, 0.5]));
        }
        out.push(...gShade([0.73, 0.84, 0.73, -0.3, 0.84, -0.3, 0.84, 0.84], 0.06));
        out.push(gOut(arcPts(0, -0.3, 0.62, 0.6, Math.PI, TAU, 18)), gDet(arcPts(0, -0.3, 0.5, 0.48, Math.PI, TAU, 16)));
        for (let k = 1; k < 10; k++) { if (k === 5) continue; const t = Math.PI + (k / 10) * Math.PI; out.push(gDet([Math.cos(t) * 0.5, -0.3 + Math.sin(t) * 0.48, Math.cos(t) * 0.62, -0.3 + Math.sin(t) * 0.6])); }
        out.push(gOut([-0.06, -0.92, 0.06, -0.92, 0.04, -0.76, -0.04, -0.76, -0.06, -0.92]));
        for (let x = -0.5; x <= 0.51; x += 0.1) { const top = -0.3 - 0.48 * Math.sqrt(Math.max(0, 1 - (x / 0.5) ** 2)) * 0.7 + 0.04; out.push(gDet([x, 0.84, x, top + 0.05, x - 0.03, top + 0.05, x, top - 0.02, x + 0.03, top + 0.05, x, top + 0.05])); }
        out.push(gOut([-0.52, 0.12, 0.52, 0.12]), gOut([-0.52, 0.6, 0.52, 0.6]), gOut([0, 0.84, 0, -0.78]), ...[-0.25, 0.25].map((x) => gDet(circle(x, 0.36, 0.11, 10))), ...[-0.25, 0.25].map((x) => gDet(arcPts(x, 0.36, 0.05, 0.05, 0, Math.PI * 1.5, 6))), ...gGround(-0.98, 0.98));
        return out;
    },
    // a vault door: round, in its ring of dressed stones and keystone, hinged,
    // a ring of rivets, a spoked wheel, its keyhole
    vault: () => {
        const out = [gOut(circle(0, -0.02, 0.9, 40)), gOut(circle(0, -0.02, 0.74, 34))];
        for (let k = 1; k < 14; k++) { const a = (k / 14) * TAU + Math.PI / 14 - Math.PI / 2; out.push(gDet([Math.cos(a) * 0.74, -0.02 + Math.sin(a) * 0.74, Math.cos(a) * 0.9, -0.02 + Math.sin(a) * 0.9])); }
        out.push(gOut([-0.1, -0.98, 0.1, -0.98, 0.07, -0.74, -0.07, -0.74, -0.1, -0.98]));
        out.push(gOut(circle(0, -0.02, 0.64, 30)), gDet(circle(0, -0.02, 0.5, 26)), ...gShadeFine(arcPts(0, -0.02, 0.63, 0.63, -Math.PI * 0.1, Math.PI * 0.6, 12).concat(arcPts(0, -0.02, 0.51, 0.51, Math.PI * 0.6, -Math.PI * 0.1, 10)), 0.045));
        for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; out.push(gDet(circle(Math.cos(a) * 0.57, -0.02 + Math.sin(a) * 0.57, 0.022, 4))); }
        for (const y of [-0.4, 0.36]) out.push(gOut([-0.8, y - 0.045, -0.56, y - 0.045, -0.5, y, -0.56, y + 0.045, -0.8, y + 0.045]));
        out.push(gOut(circle(0, -0.1, 0.08, 10)));
        for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a); out.push(gOut([c * 0.08, -0.1 + s * 0.08, c * 0.28, -0.1 + s * 0.28]), gOut(circle(c * 0.32, -0.1 + s * 0.32, 0.045, 6))); }
        out.push(gOut(smooth([0, 0.24, 0.09, 0.28, 0.08, 0.42, 0, 0.46, -0.08, 0.42, -0.09, 0.28, 0, 0.24], 2)), gOut(circle(0, 0.32, 0.025, 4)), gDet([0, 0.34, 0, 0.4]));
        out.push(...gGround(-0.96, 0.96, 0.92));
        return out;
    },
    // a stone bridge (Luke, round seven: the plainer one): two arches and
    // their keystones under its parapet, the river under them
    bridge: () => {
        const out = [gOut([-0.98, -0.46, 0.98, -0.46]), gOut([-0.98, -0.3, 0.98, -0.3]), gOut([-0.95, -0.46, -0.95, 0.84]), gOut([0.95, -0.46, 0.95, 0.84])];
        for (const x of [-0.5, 0.0, 0.5]) out.push(gDet([x, -0.46, x, -0.3]));
        for (const cx of [-0.46, 0.46]) { const a = [cx - 0.38, 0.84, cx - 0.38, 0.42, ...arcPts(cx, 0.42, 0.38, 0.4, Math.PI, TAU, 16), cx + 0.38, 0.84]; out.push(gOut(a), ...gShade(a, 0.09, 1.05), gOut([cx - 0.05, -0.02, cx + 0.05, -0.02, cx + 0.04, 0.1, cx - 0.04, 0.1, cx - 0.05, -0.02])); }
        out.push(...gShade([0.84, -0.3, 0.95, -0.3, 0.95, 0.84, 0.84, 0.84], 0.07));
        const w = (y, a) => gCurve((t) => [-0.98 + 1.96 * t, y + Math.sin(t * TAU * 3) * a], 30);
        out.push(gDet(w(0.9, 0.02)));
        return out;
    },
    // a rope bridge: knotted posts, sagging rope rails with their hangers, planks one by one, one gone, the chasm below misted
    ropebridge: () => {
        const D = (t) => -0.04 + 0.34 * Math.sin(Math.PI * t), Rl = (t) => -0.5 + 0.3 * Math.sin(Math.PI * t), X = (t) => -0.62 + 1.24 * t;
        const out = [gOut([-0.98, -0.04, -0.62, -0.04, -0.68, 0.34, -0.58, 0.92]), gOut([0.98, -0.04, 0.62, -0.04, 0.68, 0.36, 0.58, 0.92]),
            ...gShade([-0.98, -0.04, -0.62, -0.04, -0.68, 0.34, -0.58, 0.92, -0.98, 0.92], 0.12), ...gShade([0.98, -0.04, 0.62, -0.04, 0.68, 0.36, 0.58, 0.92, 0.98, 0.92], 0.12)];
        for (const x of [-0.62, 0.62]) out.push(gOut([x - 0.03, -0.04, x - 0.03, -0.6]), gOut([x + 0.03, -0.04, x + 0.03, -0.6]), gOut(circle(x, -0.62, 0.04, 5)), gDet(gEll(x, -0.5, 0.06, 0.03, 0, TAU, 6)));
        out.push(gOut(gCurve((t) => [X(t), Rl(t)], 24)), gDet(gCurve((t) => [X(t), D(t) + 0.04], 24)));
        // (the planks a run each side of the gone one, drawn on along their
        // tops: Luke 2026-10-25, round eight)
        let run = [];
        for (let t = 0.05; t < 0.97; t += 0.06) {
            if (Math.abs(t - 0.59) < 0.02) { out.push(gOut(run)); run = []; continue; }
            const x = X(t), y = D(t);
            run.push(x - 0.025, y - 0.02, x - 0.025, y + 0.05, x + 0.025, y + 0.05, x + 0.025, y - 0.02);
        }
        out.push(gOut(run));
        for (let t = 0.12; t < 0.9; t += 0.12) out.push(gDet([X(t), Rl(t), X(t), D(t) - 0.02]));
        out.push(gDet([-0.3, 0.66, -0.12, 0.66]), gDet([0.04, 0.76, 0.26, 0.76]), gDet([-0.18, 0.86, 0.0, 0.86]));
        return out;
    },
    // a ferry: banks with reeds, posts with their pulleys, the guide rope, a planked raft and its ferryman poling
    ferry: () => {
        const out = [gOut([-0.98, 0.3, -0.62, 0.3, -0.56, 0.6, -0.62, 0.9]), gOut([0.98, 0.34, 0.62, 0.34, 0.56, 0.62, 0.62, 0.9]), ...gShadeFine([-0.98, 0.3, -0.62, 0.3, -0.56, 0.6, -0.62, 0.9, -0.98, 0.9], 0.08), ...gShadeFine([0.98, 0.34, 0.62, 0.34, 0.56, 0.62, 0.62, 0.9, 0.98, 0.9], 0.08)];
        out.push(gOut([-0.8, 0.3, -0.8, -0.4]), gOut([0.8, 0.34, 0.8, -0.4]), gOut(circle(-0.8, -0.44, 0.06, 6)), gOut(circle(0.8, -0.44, 0.06, 6)), gDet([-0.8, -0.38, 0.8, -0.38]), gDet([-0.2, -0.38, -0.2, 0.38]), gDet([0.2, -0.38, 0.2, 0.38]));
        out.push(gOut([-0.42, 0.38, 0.42, 0.38, 0.38, 0.5, -0.38, 0.5, -0.42, 0.38]), ...[-0.24, -0.08, 0.08, 0.24].map((x) => gDet([x, 0.38, x, 0.5])));
        out.push(gOut(circle(0.04, -0.06, 0.06, 6)), gOut([0.04, 0.0, 0.04, 0.22]), gOut([0.04, 0.22, -0.04, 0.38]), gOut([0.04, 0.22, 0.12, 0.38]), gDet([0.04, 0.06, 0.18, 0.0]), gOut([0.3, -0.14, 0.12, 0.62]), gDet([-0.02, -0.12, 0.1, -0.12]));
        for (const [y, x0, x1] of [[0.6, -0.5, 0.5], [0.72, -0.4, 0.44], [0.84, -0.48, 0.3]]) out.push(gDet(gCurve((t) => [x0 + (x1 - x0) * t, y + Math.sin(t * TAU * 2) * 0.02], 14)));
        out.push(...gTuft(-0.92, 0.3), ...gTuft(-0.72, 0.3, 0.8), ...gTuft(0.9, 0.34, 0.9));
        return out;
    },
    // a signpost: carved arms, a finial, a lantern hung from it
    signpost: () => [
        gOut([-0.05, 0.84, -0.05, -0.74]), gOut([0.05, 0.84, 0.05, -0.74]), gOut([-0.09, -0.74, 0, -0.9, 0.09, -0.74, -0.09, -0.74]), gOut(circle(0, -0.94, 0.04, 5)), ...gShadeFine([0.0, 0.84, 0.0, -0.74, 0.05, -0.74, 0.05, 0.84], 0.04),
        gOut([0.05, -0.62, 0.66, -0.62, 0.84, -0.5, 0.66, -0.38, 0.05, -0.38]), gDet([0.12, -0.56, 0.62, -0.56]), gDet([0.12, -0.44, 0.62, -0.44]),
        gOut([-0.05, -0.24, -0.66, -0.24, -0.84, -0.12, -0.66, 0.0, -0.05, 0.0]), gDet([-0.12, -0.18, -0.62, -0.18]), gDet([-0.12, -0.06, -0.62, -0.06]),
        gOut([0.05, 0.1, 0.46, 0.1]), gDet([0.36, 0.1, 0.36, 0.2]), gOut([0.28, 0.2, 0.44, 0.2, 0.42, 0.42, 0.3, 0.42, 0.28, 0.2]), gDet(smooth([0.36, 0.24, 0.39, 0.32, 0.36, 0.38, 0.33, 0.32, 0.36, 0.24], 2)), gDet(smooth([0.05, 0.22, 0.2, 0.12, 0.3, 0.1], 2)),
        gDet([-0.2, 0.84, -0.26, 0.7]), gDet([-0.16, 0.84, -0.12, 0.72]), gDet([0.2, 0.84, 0.26, 0.72]), ...gGround(-0.6, 0.6),
    ],
    // stones stacked to mark the way
    cairn: () => {
        const out = [];
        for (const [x, y, rx, ry] of [[-0.44, 0.68, 0.32, 0.16], [0.2, 0.7, 0.36, 0.15], [-0.14, 0.38, 0.34, 0.15], [0.32, 0.4, 0.22, 0.13], [0.06, 0.1, 0.28, 0.14], [-0.02, -0.16, 0.2, 0.12], [0.04, -0.38, 0.13, 0.1]]) {
            out.push(gOut(gEll(x, y, rx, ry, 0, TAU, 14)), ...gShade(gEll(x, y, rx * 0.9, ry * 0.9, -Math.PI * 0.45, Math.PI * 0.45, 8), 0.07));
        }
        out.push(...gGround(-0.95, 0.95));
        return out;
    },
    // a way down: a stone archway, its blocks and keystone, ivy over its
    // shoulder, its steps going down into the dark
    descent: () => {
        const inner = [-0.42, 0.84, -0.42, -0.1, ...gArch(0, -0.1, 0.42, 14), 0.42, 0.84];
        const out = [gOut([-0.64, 0.84, -0.64, -0.1, ...gArch(0, -0.1, 0.64, 18), 0.64, 0.84]), gOut(inner)];
        for (let k = 1; k < 9; k++) { if (k === 4 || k === 5) continue; const t = Math.PI + (k / 9) * Math.PI; out.push(gDet([Math.cos(t) * 0.42, -0.1 + Math.sin(t) * 0.42, Math.cos(t) * 0.64, -0.1 + Math.sin(t) * 0.64])); }
        out.push(gOut([-0.08, -0.78, 0.08, -0.78, 0.05, -0.5, -0.05, -0.5, -0.08, -0.78]));
        for (const s of [-1, 1]) out.push(gDet([s * 0.42, 0.2, s * 0.64, 0.2]), gDet([s * 0.42, 0.52, s * 0.64, 0.52]));
        out.push(...gShade([0.42, -0.1, 0.64, -0.1, 0.64, 0.84, 0.42, 0.84], 0.07));
        out.push(...gShadeFine([-0.42, 0.14, -0.42, -0.1, ...gArch(0, -0.1, 0.42, 14), 0.42, -0.1, 0.42, 0.14], 0.05));
        out.push(gDet([-0.42, 0.84, -0.16, 0.14]), gDet([0.42, 0.84, 0.16, 0.14]), ...gShade([0.16, 0.14, 0.42, 0.14, 0.42, 0.84], 0.07));
        for (const [y, w] of [[0.7, 0.37], [0.56, 0.31], [0.44, 0.27], [0.34, 0.23], [0.25, 0.2], [0.18, 0.17]]) out.push(gDet([-w, y, w, y]));
        // (the ivy: a stem along the stones, leaves on it, a curl at its tip)
        const vine = gCurve((t) => { const a = Math.PI * (0.98 + t * 0.5), r = 0.67 + 0.035 * Math.sin(t * 14); return [Math.cos(a) * r, -0.1 + Math.sin(a) * r]; }, 18);
        out.push(gDet(vine), gDet(gCurl(0.0, -0.84, 0.07, Math.PI, 1.3, 1)));
        for (let i = 2; i < 18; i += 4) { const x = vine[2 * i], y = vine[2 * i + 1], a = Math.atan2(y + 0.1, x); out.push(gLeaf(x, y, a + (i % 8 ? 0.8 : -0.8), 0.22, 0.08)); }
        out.push(gDet(smooth([-0.67, -0.04, -0.72, 0.2, -0.68, 0.4], 2)), gLeaf(-0.71, 0.16, Math.PI * 0.85, 0.2, 0.075), gLeaf(-0.69, 0.36, Math.PI * 0.12, 0.18, 0.07));
        out.push(...gTuft(-0.74, 0.84, 0.8), ...gTuft(0.76, 0.84, 0.7), ...gGround(-0.94, 0.94));
        return out;
    },
    // a spiral stair (Luke, round seven), seen from above as a map shows
    // stairs: its round wall, the steps fanned round a post, its rail winding
    // in, the last of them going dark
    spiral: () => {
        const out = [gOut(circle(0, 0, 0.9, 36)), gDet(circle(0, 0, 0.8, 32)), gOut(circle(0, 0, 0.1, 10))];
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2; out.push(gDet([Math.cos(a) * 0.1, Math.sin(a) * 0.1, Math.cos(a) * 0.8, Math.sin(a) * 0.8])); }
        out.push(gOut(gCurve((t) => { const a = -Math.PI / 2 + t * TAU * 1.2, r = 0.66 - t * 0.5; return [Math.cos(a) * r, Math.sin(a) * r]; }, 44)));
        out.push(...gShadeFine([0, 0, ...arcPts(0, 0, 0.79, 0.79, Math.PI * 0.9, Math.PI * 1.5, 10)], 0.06, 0.3));
        return out;
    },
    // a shaft: its stone-lined mouth, a windlass and crank over it, a bucket on its rope
    shaft: () => {
        const out = [gOut(gEll(0, 0.5, 0.7, 0.22, 0, TAU, 30)), gDet(gEll(0, 0.52, 0.52, 0.14, 0, TAU, 24)), ...gShade(gEll(0, 0.52, 0.5, 0.13, 0, TAU, 20), 0.065, 1.05)];
        for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; out.push(gDet([Math.cos(a) * 0.53, 0.52 + Math.sin(a) * 0.145, Math.cos(a) * 0.69, 0.5 + Math.sin(a) * 0.215])); }
        out.push(gOut([-0.7, 0.5, -0.7, 0.74]), gOut([0.7, 0.5, 0.7, 0.74]), gOut(gEll(0, 0.74, 0.7, 0.2, 0, Math.PI, 14)), ...gShade([0.3, 0.68, 0.7, 0.52, 0.7, 0.76, 0.3, 0.92], 0.09));
        out.push(gOut([-0.56, 0.42, -0.56, -0.52]), gOut([-0.46, 0.4, -0.46, -0.52]), gOut([0.46, 0.4, 0.46, -0.52]), gOut([0.56, 0.42, 0.56, -0.52]), gOut([-0.62, -0.52, -0.4, -0.52]), gOut([0.4, -0.52, 0.62, -0.52]));
        out.push(gOut([-0.46, -0.36, 0.46, -0.36]), gOut([-0.46, -0.2, 0.46, -0.2]), ...[-0.3, -0.14, 0.02, 0.18, 0.34].map((x) => gDet([x, -0.36, x + 0.06, -0.2])));
        out.push(gOut([0.56, -0.28, 0.76, -0.28, 0.76, -0.04]), gOut(gEll(0.76, 0.02, 0.05, 0.06, 0, TAU, 6)), gDet([0.06, -0.2, 0.06, 0.24]), gOut([-0.06, 0.24, 0.18, 0.24, 0.14, 0.4, -0.02, 0.4, -0.06, 0.24]), gDet(arcPts(0.06, 0.24, 0.12, 0.08, Math.PI, TAU, 6)));
        return out;
    },
    // a headframe (Luke, round seven): its timber A-frame braced, the sheave
    // wheel spoked at its head, the rope down to the shaft and across to the
    // winding drum
    headframe: () => {
        const out = [];
        for (const s of [-1, 1]) out.push(gOut([s * 0.6, 0.84, s * 0.1, -0.66]), gOut([s * 0.5, 0.84, s * 0.04, -0.6]));
        out.push(gOut([-0.42, 0.34, 0.42, 0.34]), gOut([-0.27, -0.1, 0.27, -0.1]), gDet([-0.42, 0.34, 0.27, -0.1]), gDet([0.42, 0.34, -0.27, -0.1]));
        out.push(gOut(circle(0, -0.74, 0.2, 18)), gDet(circle(0, -0.74, 0.15, 14)), gOut(circle(0, -0.74, 0.04, 5)));
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; out.push(gDet([Math.cos(a) * 0.04, -0.74 + Math.sin(a) * 0.04, Math.cos(a) * 0.15, -0.74 + Math.sin(a) * 0.15])); }
        out.push(gDet([0.2, -0.74, 0.2, 0.42]), gOut([0.12, 0.42, 0.28, 0.42, 0.25, 0.56, 0.15, 0.56, 0.12, 0.42]));
        out.push(gDet([-0.2, -0.74, -0.84, 0.48]), gOut(circle(-0.82, 0.64, 0.14, 12)), gOut(circle(-0.82, 0.64, 0.04, 5)), gOut([-0.82, 0.64, -0.62, 0.5]), gOut([-0.98, 0.84, -0.82, 0.64, -0.66, 0.84]));
        out.push(gOut(gEll(0.06, 0.72, 0.36, 0.09, 0, TAU, 18)), ...gShadeFine(gEll(0.06, 0.73, 0.3, 0.06, 0, TAU, 14), 0.03, 0), ...gShade([0.1, -0.66, 0.6, 0.84, 0.5, 0.84, 0.04, -0.6], 0.06));
        out.push(...gTuft(0.84, 0.84, 0.7), ...gGround(-0.98, 0.98));
        return out;
    },
    // the Vermissian line: a stone portal, voussoirs and keystone, rails running in over their ties and ballast, a signal lamp
    rails: () => {
        const L = (t) => [-0.86 + 0.66 * t, 0.86 - 0.98 * t], R = (t) => [0.86 - 0.66 * t, 0.86 - 0.98 * t];
        const out = [gOut([...L(0), ...L(1)]), gOut([...R(0), ...R(1)]), gDet([L(0)[0] + 0.06, 0.86, L(1)[0] + 0.03, -0.12]), gDet([R(0)[0] - 0.06, 0.86, R(1)[0] - 0.03, -0.12])];
        for (const t of [0.03, 0.26, 0.46, 0.62, 0.76, 0.87, 0.95]) { const a = L(t), b = R(t), e = 0.14 * (1 - t); out.push(gDet([a[0] - e, a[1], b[0] + e, b[1]])); }
        for (const [x, y] of [[-0.6, 0.78], [0.5, 0.7], [-0.2, 0.62], [0.2, 0.46], [-0.4, 0.4], [0.62, 0.86]]) out.push(gDet(circle(x, y, 0.02, 4)));
        const arch = [-0.62, -0.12, -0.62, -0.4, ...arcPts(0, -0.4, 0.62, 0.56, Math.PI, TAU, 18), 0.62, -0.12];
        out.push(gOut(arch), gOut([-0.42, -0.12, -0.42, -0.4, ...arcPts(0, -0.4, 0.42, 0.38, Math.PI, TAU, 14), 0.42, -0.12]), ...gShade([-0.42, -0.12, -0.42, -0.4, ...arcPts(0, -0.4, 0.42, 0.38, Math.PI, TAU, 14), 0.42, -0.12], 0.075, 1.05));
        for (let k = 1; k < 8; k++) { if (k === 4) continue; const t = Math.PI + (k / 8) * Math.PI; out.push(gDet([Math.cos(t) * 0.42, -0.4 + Math.sin(t) * 0.38, Math.cos(t) * 0.62, -0.4 + Math.sin(t) * 0.56])); }
        out.push(gOut([-0.07, -0.96, 0.07, -0.96, 0.05, -0.78, -0.05, -0.78, -0.07, -0.96]), gDet([-0.62, -0.12, -0.86, -0.12]), gDet([0.62, -0.12, 0.86, -0.12]));
        out.push(gOut([0.8, 0.5, 0.8, -0.38]), gOut([0.72, -0.38, 0.88, -0.38, 0.88, -0.6, 0.72, -0.6, 0.72, -0.38]), gOut(circle(0.8, -0.49, 0.045, 6)), gDet([0.72, 0.5, 0.88, 0.5]), gDet(smooth([0.92, -0.56, 0.98, -0.49, 0.92, -0.42], 2)));
        return out;
    },
    // a mine: its timbered mouth in an outcrop of rock, lumped and cracked,
    // knee-braced, the rails running out of the dark, boulders at its foot
    mine: () => {
        const rock = gCurve((t) => { const a = Math.PI + t * Math.PI, r = 1 + 0.05 * Math.sin(t * 31) + 0.04 * Math.sin(t * 13 + 1); return [Math.cos(a) * 0.9 * r, 0.84 + Math.sin(a) * 1.3 * r]; }, 44);
        const out = [gOut(rock)];
        out.push(gDet(smooth([-0.84, 0.36, -0.72, 0.3, -0.62, 0.34], 2)), gDet(smooth([-0.62, -0.2, -0.5, -0.26, -0.4, -0.22], 2)), gDet(smooth([-0.16, -0.36, -0.04, -0.4, 0.08, -0.36], 2)), gDet(smooth([0.38, -0.28, 0.5, -0.2, 0.58, -0.08], 2)), gDet(smooth([0.66, 0.26, 0.76, 0.34, 0.86, 0.36], 2)), ...gShade([0.62, -0.16, 0.8, 0.2, 0.9, 0.6, 0.9, 0.84, 0.62, 0.84], 0.09));
        for (const s of [-1, 1]) out.push(gOut([s * 0.34, 0.84, s * 0.34, 0.0]), gOut([s * 0.44, 0.84, s * 0.44, 0.0]), gDet([s * 0.34, 0.2, s * 0.14, 0.0]), gDet([s * 0.39, 0.3, s * 0.39, 0.5]));
        out.push(gOut([-0.56, 0.0, 0.56, 0.0, 0.56, -0.12, -0.56, -0.12, -0.56, 0.0]), gDet([-0.4, -0.06, -0.1, -0.06]), gDet([0.06, -0.06, 0.3, -0.06]));
        out.push(...gShadeFine([-0.34, 0.46, -0.34, 0.0, 0.34, 0.0, 0.34, 0.46, 0.1, 0.46, -0.1, 0.46], 0.05));
        out.push(gOut([-0.32, 0.84, -0.1, 0.46]), gOut([0.32, 0.84, 0.1, 0.46]));
        for (const [y, w] of [[0.76, 0.32], [0.64, 0.26], [0.55, 0.2], [0.49, 0.16]]) out.push(gDet([-w, y, w, y]));
        out.push(gOut(gEll(0.62, 0.76, 0.12, 0.08, 0, TAU, 8)), gOut(gEll(0.8, 0.8, 0.08, 0.05, 0, TAU, 8)), ...gTuft(-0.92, 0.84, 0.7), ...gTuft(0.96, 0.84, 0.6), ...gGround(-0.98, 0.98));
        return out;
    },
    // an ore cart: planked and iron-banded, riveted, on spoked wheels, heaped with ore that glints, on its rails
    orecart: () => {
        const out = [gOut([-0.74, -0.18, 0.74, -0.18, 0.6, 0.42, -0.6, 0.42, -0.74, -0.18]), ...[-0.4, -0.12, 0.16, 0.44].map((x) => gDet([x, -0.18, x * 0.86, 0.42])), gOut([-0.71, -0.06, 0.71, -0.06]), gOut([-0.64, 0.28, 0.64, 0.28])];
        for (const x of [-0.62, -0.3, 0.0, 0.3, 0.62]) out.push(gDet(circle(x, -0.12, 0.018, 4)), gDet(circle(x * 0.92, 0.35, 0.018, 4)));
        out.push(...gShade([0.34, -0.18, 0.74, -0.18, 0.6, 0.42, 0.3, 0.42], 0.08));
        out.push(gOut(smooth([-0.66, -0.18, -0.54, -0.42, -0.36, -0.36, -0.22, -0.6, -0.02, -0.46, 0.14, -0.66, 0.34, -0.48, 0.5, -0.56, 0.66, -0.18], 4)));
        for (const [x, y, r] of [[-0.42, -0.3, 0.08], [-0.16, -0.44, 0.09], [0.12, -0.5, 0.08], [0.36, -0.36, 0.08], [0.0, -0.26, 0.07]]) out.push(gDet(gEll(x, y, r, r * 0.8, 0, TAU, 7)));
        out.push(...gSpark(-0.2, -0.78, 0.08), ...gSpark(0.3, -0.74, 0.07));
        for (const cx of [-0.36, 0.36]) { out.push(gOut(circle(cx, 0.54, 0.16, 14)), gOut(circle(cx, 0.54, 0.04, 6))); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; out.push(gDet([cx + Math.cos(a) * 0.15, 0.54 + Math.sin(a) * 0.15, cx - Math.cos(a) * 0.15, 0.54 - Math.sin(a) * 0.15])); } }
        out.push(gOut([-0.98, 0.7, 0.98, 0.7]), gDet([-0.98, 0.74, 0.98, 0.74]), ...[-0.86, -0.56, -0.12, 0.12, 0.56, 0.86].map((x) => gDet([x - 0.05, 0.74, x - 0.08, 0.86, x + 0.04, 0.86, x + 0.05, 0.74])));
        return out;
    },
    // a cave: strata in its rock, a fringe of teeth over its mouth, boulders at its foot
    cave: () => {
        const rock = smooth([-0.95, 0.84, -0.86, 0.18, -0.6, -0.34, -0.16, -0.62, 0.32, -0.54, 0.7, -0.18, 0.9, 0.3, 0.95, 0.84], 5);
        const mouth = [-0.42, 0.84, ...smooth([-0.42, 0.84, -0.42, 0.36, -0.24, 0.08, 0.04, 0.0, 0.3, 0.12, 0.44, 0.44, 0.46, 0.84], 4)];
        const out = [gOut(rock), gOut(mouth), ...gShade(mouth, 0.085, 1.05)];
        for (const [x, len] of [[-0.3, 0.16], [-0.16, 0.24], [0.0, 0.18], [0.16, 0.26], [0.32, 0.16]]) { const y = 0.02 + (Math.abs(x) * 0.5) ** 2; out.push(gOut([x - 0.05, y, x, y + len, x + 0.05, y])); }
        out.push(gDet(smooth([-0.8, 0.0, -0.6, -0.1, -0.4, -0.16], 3)), gDet(smooth([-0.86, 0.36, -0.64, 0.28, -0.5, 0.26], 3)), gDet(smooth([0.48, -0.08, 0.66, 0.04, 0.82, 0.08], 3)), gDet(smooth([0.56, 0.32, 0.72, 0.38, 0.88, 0.36], 3)), gDet(smooth([-0.2, -0.42, 0.04, -0.46, 0.22, -0.4], 3)));
        out.push(...gShade([0.5, -0.04, 0.7, -0.18, 0.9, 0.3, 0.95, 0.84, 0.5, 0.84], 0.12));
        out.push(gOut(gEll(-0.62, 0.74, 0.14, 0.1, 0, TAU, 10)), gOut(gEll(0.66, 0.76, 0.12, 0.08, 0, TAU, 10)), gOut(gEll(-0.46, 0.8, 0.08, 0.05, 0, TAU, 8)), ...gGround(-0.98, 0.98));
        return out;
    },
    // a cavern: a chamber in the rock, its teeth hanging and rising
    cavern: () => {
        const outer = smooth([-0.95, 0.84, -0.9, 0.0, -0.66, -0.58, -0.2, -0.9, 0.3, -0.86, 0.72, -0.56, 0.92, 0.0, 0.95, 0.84], 5);
        const inner = [-0.66, 0.84, ...smooth([-0.66, 0.84, -0.64, 0.1, -0.42, -0.4, 0.0, -0.56, 0.42, -0.4, 0.64, 0.1, 0.66, 0.84], 5)];
        const roof = (x) => -0.56 + 0.16 * (x / 0.42) ** 2;
        const out = [gOut(outer), gOut(inner), ...gShade([...outer.slice(0, 2), ...outer.slice(2), ...inner.slice().reverse().reduce((a, v, i, A) => (i % 2 ? a : a.concat([A[i + 1], v])), [])], 0.15)];
        for (const [x, len] of [[-0.3, 0.3], [-0.08, 0.42], [0.16, 0.24], [0.36, 0.34]]) { const y = roof(x) + 0.02; out.push(gDet([x - 0.06, y, x, y + len, x + 0.06, y])); }
        for (const [x, h] of [[-0.42, 0.28], [-0.1, 0.18], [0.24, 0.38], [0.5, 0.2]]) out.push(gDet([x - 0.07, 0.84, x, 0.84 - h, x + 0.07, 0.84]));
        out.push(...gGround(-0.95, 0.95));
        return out;
    },
    // a ruin: a broken column, fluted, a fallen drum by it, its capital toppled
    ruin: () => [
        gOut([-0.5, 0.7, -0.5, -0.52, -0.42, -0.62, -0.32, -0.5, -0.22, -0.7, -0.12, -0.56, -0.1, 0.7]), gOut([-0.6, 0.84, -0.6, 0.7, 0.0, 0.7, 0.0, 0.84]), ...[-0.4, -0.3, -0.2].map((x) => gDet([x, 0.68, x, -0.48])),
        ...gShade([-0.2, 0.7, -0.2, -0.6, -0.12, -0.56, -0.1, 0.7], 0.06),
        gOut([0.18, 0.84, 0.18, 0.5, 0.72, 0.5, 0.72, 0.84]), gOut(gEll(0.72, 0.67, 0.07, 0.17, 0, TAU, 10)), ...[0.3, 0.42, 0.54].map((x) => gDet([x, 0.52, x, 0.82])),
        gOut([0.1, 0.36, 0.24, 0.16, 0.48, 0.2, 0.42, 0.42, 0.1, 0.36]), ...gShade([0.24, 0.16, 0.48, 0.2, 0.42, 0.42], 0.06), ...gGround(-0.95, 0.95),
    ],
    // a collapse: an arch half fallen, its voussoirs strewn, a heap of rubble, a fallen drum
    rubble: () => {
        const out = [gOut([-0.8, 0.84, -0.8, -0.1, -0.56, -0.1, -0.56, 0.84]), ...gShade([-0.64, 0.84, -0.64, -0.1, -0.56, -0.1, -0.56, 0.84], 0.05)];
        const blocks = []; for (let k = 0; k < 4; k++) { const a0 = Math.PI + k * 0.24, a1 = a0 + 0.22; blocks.push([Math.cos(a0) * 0.64 + 0.08, -0.1 + Math.sin(a0) * 0.64, Math.cos(a0) * 0.88 + 0.08, -0.1 + Math.sin(a0) * 0.88, Math.cos(a1) * 0.88 + 0.08, -0.1 + Math.sin(a1) * 0.88, Math.cos(a1) * 0.64 + 0.08, -0.1 + Math.sin(a1) * 0.64]); }
        for (const b of blocks) out.push(gOut([...b, b[0], b[1]]));
        for (const [x, y, r] of [[0.0, 0.6, 0.14], [0.26, 0.66, 0.12], [0.14, 0.44, 0.1], [0.42, 0.74, 0.08], [-0.2, 0.74, 0.08]]) out.push(gOut(gEll(x, y, r * 1.3, r, 0, TAU, 10)), ...gShade(gEll(x, y, r * 1.2, r * 0.9, -Math.PI * 0.4, Math.PI * 0.4, 6), 0.05));
        out.push(gOut([0.4, 0.62, 0.62, 0.36, 0.78, 0.48, 0.56, 0.74, 0.4, 0.62]), gOut([0.58, 0.84, 0.58, 0.62, 0.94, 0.62, 0.94, 0.84]), gOut(gEll(0.94, 0.73, 0.05, 0.11, 0, TAU, 8)), ...[0.68, 0.8].map((x) => gDet([x, 0.63, x, 0.83])));
        // (its three specks of falling grit left out: Luke 2026-10-25, round eight)
        out.push(...gGround(-0.98, 0.98));
        return out;
    },
    // a choked tunnel (Luke, round seven: the plainer one): its stone arch,
    // the dark, a heap of fallen rock, a broken beam across
    chokedtunnel: () => {
        const out = [gOut([-0.8, 0.84, -0.8, -0.04, ...arcPts(0, -0.04, 0.8, 0.76, Math.PI, TAU, 20), 0.8, 0.84]), gOut([-0.6, 0.84, -0.6, -0.04, ...arcPts(0, -0.04, 0.6, 0.56, Math.PI, TAU, 18), 0.6, 0.84])];
        out.push(gOut([-0.07, -0.84, 0.07, -0.84, 0.05, -0.6, -0.05, -0.6, -0.07, -0.84]), ...gShade([0.6, -0.04, 0.8, -0.04, 0.8, 0.84, 0.6, 0.84], 0.07));
        out.push(...gShadeFine([-0.6, 0.3, -0.6, -0.04, ...arcPts(0, -0.04, 0.6, 0.56, Math.PI, TAU, 18), 0.6, -0.04, 0.6, 0.5, 0.3, 0.3, 0.0, 0.24, -0.3, 0.3], 0.06));
        out.push(gOut(smooth([-0.6, 0.84, -0.6, 0.36, -0.3, 0.3, 0.0, 0.24, 0.3, 0.3, 0.6, 0.5, 0.6, 0.84], 4)));
        for (const [x, y, r] of [[-0.3, 0.52, 0.1], [0.04, 0.44, 0.09], [0.32, 0.6, 0.1], [-0.12, 0.72, 0.09]]) out.push(gOut(gEll(x, y, r * 1.3, r, 0, TAU, 10)));
        out.push(gOut([-0.56, 0.14, 0.5, -0.24, 0.54, -0.14, -0.52, 0.24, -0.56, 0.14]), ...gGround(-0.98, 0.98));
        return out;
    },
    // a camp: a ridged tent on its guy lines, its flap tied back, a fire high in its ring of stones, a log to sit on
    camp: () => {
        const out = [gOut([-0.94, 0.84, -0.5, -0.22, -0.06, 0.84]), gOut([-0.5, -0.22, -0.5, -0.36]), gDet([-0.5, -0.22, -0.98, 0.5]), gDet([-0.5, -0.22, -0.02, 0.5]), gDet([-0.98, 0.5, -1.0, 0.58]), gDet([-0.02, 0.5, 0.0, 0.58])];
        out.push(gOut([-0.5, 0.84, -0.5, 0.3, -0.62, 0.84]), ...gShadeFine([-0.5, 0.84, -0.5, 0.3, -0.38, 0.84], 0.05), gDet(smooth([-0.5, 0.3, -0.36, 0.44, -0.28, 0.66, -0.3, 0.84], 3)), ...gShade([-0.5, -0.22, -0.06, 0.84, -0.3, 0.84, -0.36, 0.44], 0.11));
        out.push(gOut(smooth([0.5, 0.0, 0.62, 0.24, 0.72, 0.16, 0.76, 0.42, 0.7, 0.66, 0.5, 0.74, 0.3, 0.66, 0.24, 0.42, 0.3, 0.2, 0.38, 0.32, 0.5, 0.0], 3)), gDet(smooth([0.5, 0.34, 0.58, 0.5, 0.56, 0.64, 0.5, 0.68, 0.44, 0.64, 0.42, 0.5, 0.5, 0.34], 2)), gOut([0.24, 0.8, 0.76, 0.68]), gOut([0.24, 0.68, 0.76, 0.8]));
        for (const x of [0.16, 0.3, 0.7, 0.84]) out.push(gOut(gEll(x, 0.84, 0.06, 0.04, Math.PI, TAU, 6)));
        out.push(...[[0.4, -0.12], [0.62, -0.2], [0.52, -0.34]].map(([x, y]) => gDet(circle(x, y, 0.015, 3))), gOut([0.0, 0.84, 0.0, 0.72, 0.18, 0.72, 0.18, 0.84]), gOut(gEll(0.18, 0.78, 0.03, 0.06, 0, TAU, 6)), ...gGround(-0.98, 0.98));
        return out;
    },
    // a hanging lantern: a scrolled bracket, its chain, a domed cap and finials, leaded panes, the flame within
    lantern: () => {
        const out = [gOut([-0.86, -0.96, -0.86, 0.1]), gOut([-0.86, -0.78, 0.16, -0.78]), gDet(smooth([-0.86, -0.32, -0.56, -0.42, -0.4, -0.62, -0.46, -0.72, -0.56, -0.66, -0.52, -0.58], 3)), gDet(smooth([-0.62, -0.78, -0.5, -0.9, -0.36, -0.86, -0.38, -0.78], 3)), gOut(circle(-0.86, -0.82, 0.04, 5))];
        for (let i = 0; i < 3; i++) out.push(gDet(gEll(0.16, -0.72 + i * 0.08, 0.025, 0.045, 0, TAU, 6)));
        out.push(gOut([-0.12, -0.42, ...arcPts(0.16, -0.42, 0.28, 0.16, Math.PI, TAU, 10), 0.44, -0.42, -0.12, -0.42]), gOut(circle(0.16, -0.6, 0.035, 5)), ...gShadeFine([0.16, -0.58, ...arcPts(0.16, -0.42, 0.28, 0.16, Math.PI * 1.5, TAU, 5), 0.16, -0.42], 0.05));
        out.push(gOut([-0.08, -0.42, -0.12, 0.32, 0.44, 0.32, 0.4, -0.42]), gDet([0.16, -0.42, 0.16, 0.32]), gDet([-0.1, -0.06, 0.42, -0.06]), gDet([-0.04, -0.38, 0.36, 0.28]), gDet([0.36, -0.38, -0.04, 0.28]));
        out.push(gOut([-0.18, 0.32, 0.5, 0.32, 0.4, 0.44, -0.08, 0.44, -0.18, 0.32]), gOut([0.16, 0.44, 0.1, 0.56, 0.16, 0.66, 0.22, 0.56, 0.16, 0.44]));
        out.push(gDet(smooth([0.16, -0.24, 0.24, -0.06, 0.22, 0.1, 0.16, 0.16, 0.1, 0.1, 0.08, -0.06, 0.16, -0.24], 3)), ...[[0.66, -0.22, 0.84, -0.3], [0.7, 0.0, 0.9, 0.0], [0.66, 0.22, 0.84, 0.3]].map(gDet));
        return out;
    },
    // a barricade: a log beam, sharpened stakes crossed through it and lashed, their points shaded
    barricade: () => {
        const out = [gOut([-0.84, 0.32, 0.84, 0.32]), gOut([-0.84, 0.48, 0.84, 0.48]), gOut(gEll(-0.84, 0.4, 0.05, 0.08, Math.PI * 0.5, Math.PI * 1.5, 8)), gOut(gEll(0.84, 0.4, 0.05, 0.08, 0, TAU, 10)), gDet(circle(0.84, 0.4, 0.025, 5)), ...gShadeFine([-0.84, 0.42, 0.84, 0.42, 0.84, 0.48, -0.84, 0.48], 0.03, 0)];
        for (const x of [-0.56, 0, 0.56]) {
            for (const s of [-1, 1]) {
                const b = [x - s * 0.34, 0.84], t = [x + s * 0.3, -0.24], tip = [x + s * 0.4, -0.42];
                const n = [0.03, s * 0.02];
                out.push(gOut([b[0] - n[0], b[1], t[0] - n[0], t[1], ...tip, t[0] + n[0], t[1] + 0.03, b[0] + n[0], b[1]]), ...gShadeFine([t[0], t[1], ...tip, t[0] + n[0], t[1] + 0.03], 0.025, 0.4));
            }
            out.push(gDet([x - 0.07, 0.34, x + 0.07, 0.46]), gDet([x + 0.07, 0.34, x - 0.07, 0.46]));
        }
        out.push(...gTuft(-0.86, 0.84), ...gTuft(0.88, 0.84, 0.8), ...gGround(-0.98, 0.98));
        return out;
    },
    // a warning pole: a skull on its crosspiece, bones and rags hung from it, a board daubed with a cross, a cairn at its foot
    stake: () => [
        gOut([-0.04, 0.84, -0.04, -0.34]), gOut([0.06, 0.84, 0.06, -0.34]), ...gShadeFine([0.01, 0.84, 0.01, -0.34, 0.06, -0.34, 0.06, 0.84], 0.03), gOut([-0.56, -0.06, 0.58, -0.1]), gDet([-0.56, -0.02, 0.58, -0.06]),
        gOut([...arcPts(0.01, -0.62, 0.28, 0.27, Math.PI * 0.72, Math.PI * 2.28, 18), 0.16, -0.3, -0.14, -0.3, ...arcPts(0.01, -0.62, 0.28, 0.27, Math.PI * 0.72, Math.PI * 0.73, 1)]),
        gOut(gEll(-0.09, -0.62, 0.075, 0.07, 0, TAU, 8)), gOut(gEll(0.11, -0.62, 0.075, 0.07, 0, TAU, 8)), ...gShadeFine(gEll(-0.09, -0.62, 0.06, 0.06, 0, TAU, 8), 0.03), ...gShadeFine(gEll(0.11, -0.62, 0.06, 0.06, 0, TAU, 8), 0.03), gDet([0.01, -0.5, -0.03, -0.42, 0.05, -0.42, 0.01, -0.5]), ...[-0.06, 0.02, 0.1].map((x) => gDet([x, -0.34, x, -0.28])),
        gDet([-0.46, -0.05, -0.48, 0.2]), gOut(gEll(-0.48, 0.26, 0.04, 0.07, 0, TAU, 6)), gDet([-0.26, -0.06, -0.24, 0.32]), gOut([-0.3, 0.32, -0.18, 0.32, -0.2, 0.42, -0.28, 0.42, -0.3, 0.32]), gDet(smooth([0.3, -0.08, 0.34, 0.14, 0.28, 0.3, 0.34, 0.42], 3)), gDet(smooth([0.48, -0.09, 0.5, 0.1, 0.46, 0.22], 2)), gDet(circle(0.46, 0.26, 0.04, 5)),
        gOut([0.1, 0.2, 0.46, 0.18, 0.46, 0.42, 0.1, 0.44, 0.1, 0.2]), gDet([0.16, 0.24, 0.4, 0.4]), gDet([0.4, 0.24, 0.16, 0.4]),
        gOut(gEll(-0.3, 0.78, 0.16, 0.08, 0, TAU, 10)), gOut(gEll(0.32, 0.8, 0.14, 0.06, 0, TAU, 10)), gOut(gEll(-0.12, 0.66, 0.1, 0.06, 0, TAU, 8)), ...gGround(-0.7, 0.7),
    ],
    // a cage hung on its chain
    cage: () => {
        const out = [gDet([0, -0.95, 0, -0.78]), gOut(circle(0, -0.72, 0.06, 6)), gOut([...arcPts(0, -0.3, 0.42, 0.36, Math.PI, TAU, 14)]), gOut(gEll(0, 0.62, 0.42, 0.1, 0, TAU, 16)), gOut([-0.42, -0.3, -0.42, 0.62]), gOut([0.42, -0.3, 0.42, 0.62])];
        for (const x of [-0.22, 0, 0.22]) out.push(gDet([x, -0.3 - 0.36 * Math.sqrt(1 - (x / 0.42) ** 2) + 0.02, x, 0.68]));
        out.push(gDet([-0.42, 0.14, 0.42, 0.14]), ...gShade([0.22, -0.56, 0.42, -0.3, 0.42, 0.62, 0.22, 0.7], 0.1));
        return out;
    },
    // a web in a corner, its spider
    web: () => {
        const out = [gOut([-0.9, -0.9, 0.9, -0.9]), gOut([-0.9, -0.9, -0.9, 0.9])];
        const rays = [0.06, 0.32, 0.6, 0.88, 1.2, 1.5].map((a) => [Math.cos(a), Math.sin(a)]);
        for (const [c, s] of rays) out.push(gDet([-0.9, -0.9, -0.9 + c * 1.7, -0.9 + s * 1.7]));
        for (const r of [0.4, 0.75, 1.1, 1.45]) { const p = []; rays.forEach(([c, s], i) => { p.push(-0.9 + c * r, -0.9 + s * r); if (i < rays.length - 1) { const m = [(c + rays[i + 1][0]) / 2, (s + rays[i + 1][1]) / 2]; p.push(-0.9 + m[0] * r * 0.9, -0.9 + m[1] * r * 0.9); } }); out.push(gDet(p)); }
        out.push(gDet([0.22, -0.9 + 1.1 * 0.5, 0.22, 0.32]), gOut(gEll(0.22, 0.42, 0.08, 0.11, 0, TAU, 8)), ...gShadeFine(gEll(0.22, 0.42, 0.07, 0.1, 0, TAU, 8), 0.04));
        for (const s of [-1, 1]) for (const k of [0, 1, 2]) out.push(gDet([0.22 + s * 0.06, 0.36 + k * 0.06, 0.22 + s * 0.2, 0.28 + k * 0.1, 0.22 + s * 0.26, 0.38 + k * 0.12]));
        return out;
    },
    // the bones of something huge, arching
    ribs: () => {
        const out = [gOut(smooth([-0.95, 0.8, -0.5, 0.74, 0.0, 0.76, 0.5, 0.8, 0.72, 0.8], 4))];
        for (const [x, r, h] of [[-0.62, 0.3, 1.3], [-0.24, 0.27, 1.1], [0.12, 0.24, 0.9], [0.44, 0.2, 0.7]]) {
            out.push(gOut(arcPts(x + r, 0.8, r, h, Math.PI, Math.PI * 1.62, 12)), gOut(arcPts(x + r, 0.8, r, h, Math.PI * 1.62, Math.PI * 1.98, 6).map((v, n) => (n % 2 ? v : v + 0.04))));
            out.push(gDet(arcPts(x + r, 0.8, r - 0.07, h - 0.08, Math.PI * 1.05, Math.PI * 1.55, 8)));
        }
        out.push(gOut(smooth([0.72, 0.8, 0.8, 0.56, 0.96, 0.6, 0.96, 0.8], 3)), gDet(circle(0.86, 0.68, 0.04, 5)), ...gGround(-0.98, 0.98, 0.86));
        return out;
    },
    // a dead tree: gnarled, its bark twisting, a hollow in it, roots gripping, many-forked
    deadtree: () => {
        const out = [gOut(smooth([-0.14, 0.84, -0.08, 0.44, -0.14, 0.06, -0.1, -0.24, -0.34, -0.56, -0.5, -0.82], 4)), gOut(smooth([0.14, 0.84, 0.1, 0.44, 0.16, 0.06, 0.12, -0.2, 0.36, -0.44, 0.6, -0.78], 4)),
            gOut(smooth([-0.1, -0.24, -0.02, -0.56, 0.02, -0.94], 4)), gOut(smooth([-0.12, 0.02, -0.44, -0.08, -0.72, -0.34, -0.9, -0.36], 4)), gOut(smooth([0.15, 0.06, 0.46, 0.02, 0.68, -0.14, 0.9, -0.1], 4))];
        for (const [x, y, x1, y1, x2, y2] of [[-0.36, -0.58, -0.2, -0.8, -0.14, -0.94], [-0.5, -0.82, -0.62, -0.96, -0.7, -0.9], [0.36, -0.46, 0.2, -0.66, 0.24, -0.84], [0.6, -0.78, 0.74, -0.92, 0.82, -0.88], [-0.44, -0.08, -0.5, 0.08, -0.58, 0.12], [-0.72, -0.34, -0.74, -0.52, -0.66, -0.62], [0.68, -0.14, 0.72, -0.34, 0.8, -0.42], [0.02, -0.7, 0.14, -0.84, 0.2, -0.82]]) out.push(gDet([x, y, x1, y1, x2, y2]));
        out.push(gOut(gEll(0.0, 0.34, 0.06, 0.12, 0, TAU, 10)), ...gShadeFine(gEll(0.0, 0.34, 0.05, 0.11, 0, TAU, 10), 0.04), gDet(smooth([-0.08, 0.7, 0.04, 0.6, 0.0, 0.52], 3)), gDet(smooth([0.04, 0.16, -0.06, 0.04, 0.02, -0.08], 3)), gDet(smooth([-0.04, -0.3, 0.06, -0.4], 3)));
        out.push(gOut(smooth([-0.14, 0.84, -0.36, 0.9, -0.6, 0.84, -0.7, 0.9], 3)), gOut(smooth([0.14, 0.84, 0.4, 0.92, 0.62, 0.84, 0.74, 0.88], 3)), gDet([-0.04, 0.86, -0.12, 0.96]), gDet([0.06, 0.86, 0.16, 0.96]), ...gShade([0.04, 0.84, 0.1, 0.44, 0.16, 0.06, 0.12, -0.2, 0.14, 0.84], 0.07), ...gGround(-0.9, 0.9, 0.86));
        return out;
    },
    // fungi: caps spotted and gilled, rings on their stems, small ones at their foot, tufts of grass
    fungi: () => {
        const shroom = (x, y, w, h, s, spots) => {
            const o = [gOut([x - w, y, ...arcPts(x, y, w, h, Math.PI, TAU, 16), x - w, y]), gOut(gEll(x, y, w, h * 0.12, 0, Math.PI, 10))];
            for (let k = 1; k < 6; k++) { const t = x - w + (2 * w * k) / 6; o.push(gDet([t, y + 0.01, x + (t - x) * 0.3, y + h * 0.1])); }
            o.push(gOut([x - s, y + h * 0.1, x - s * 0.8, 0.84]), gOut([x + s, y + h * 0.1, x + s * 1.2, 0.84]), gDet(gEll(x, y + (0.84 - y) * 0.3, s * 1.6, 0.03, 0, Math.PI, 6)), ...gShadeFine([x + s * 0.2, y + h * 0.1, x + s, y + h * 0.1, x + s * 1.2, 0.84, x + s * 0.2, 0.84], 0.03));
            for (const [u, v, r] of spots) o.push(gDet(gEll(x + u * w, y - v * h, r * w, r * h * 0.7, 0, TAU, 6)));
            o.push(...gShadeFine([x + w * 0.3, y, ...arcPts(x, y, w, h, Math.PI * 1.65, TAU, 6)], 0.07));
            return o;
        };
        return [...shroom(-0.08, -0.22, 0.44, 0.5, 0.08, [[-0.4, 0.5, 0.12], [0.1, 0.8, 0.1], [0.5, 0.4, 0.1], [-0.1, 0.35, 0.08]]), ...shroom(0.54, 0.32, 0.3, 0.3, 0.06, [[-0.3, 0.5, 0.14], [0.3, 0.6, 0.12]]), ...shroom(-0.62, 0.46, 0.24, 0.22, 0.05, [[0.1, 0.6, 0.16]]),
            gOut([-0.3, 0.84, ...arcPts(-0.24, 0.78, 0.06, 0.06, Math.PI, TAU, 6), -0.18, 0.84]), gOut([0.28, 0.84, ...arcPts(0.32, 0.8, 0.05, 0.05, Math.PI, TAU, 6), 0.36, 0.84]), ...gTuft(0.84, 0.84), ...gTuft(-0.88, 0.84, 0.8), ...gGround(-0.98, 0.98)];
    },
    // crystals: a cluster of faceted shards on their rock, glinting
    crystals: () => {
        const shard = (x, y, w, h, lean) => { const c = Math.cos(lean), s = Math.sin(lean), Q = (u, v) => [x + u * c - v * s, y + u * s + v * c]; const tip = Q(0, -h - w * 1.5); return [gOut([...Q(-w, 0), ...Q(-w, -h), ...tip, ...Q(w, -h), ...Q(w, 0)]), gDet([...Q(-w, -h), ...Q(-w * 0.3, -h), ...tip, ...Q(w, -h), ...Q(-w * 0.3, -h), ...Q(-w * 0.3, 0)]), ...gShade([...Q(-w * 0.3, 0), ...Q(-w * 0.3, -h), ...tip, ...Q(w, -h), ...Q(w, 0)], 0.06, 1.2)]; };
        const out = [...shard(0, 0.62, 0.17, 0.98, 0), ...shard(-0.38, 0.66, 0.13, 0.62, -0.36), ...shard(0.38, 0.66, 0.14, 0.72, 0.3), ...shard(-0.66, 0.72, 0.09, 0.36, -0.7), ...shard(0.66, 0.74, 0.08, 0.3, 0.68), ...shard(0.16, 0.7, 0.07, 0.28, 0.12)];
        out.push(gOut(smooth([-0.92, 0.84, -0.84, 0.66, -0.6, 0.62, -0.3, 0.66, 0.0, 0.6, 0.3, 0.66, 0.6, 0.62, 0.86, 0.68, 0.94, 0.84], 4)), ...gSpark(-0.62, -0.42, 0.1), ...gSpark(0.56, -0.66, 0.1), ...gGround(-0.98, 0.98));
        return out;
    },
    // still water (Luke, round seven): cattails and reeds at its edge, lily
    // pads and a flower, rings spreading, its far water shaded
    lake: () => {
        const shore = smooth([-0.92, 0.42, -0.72, 0.16, -0.2, 0.1, 0.4, 0.14, 0.86, 0.28, 0.94, 0.5, 0.52, 0.72, -0.3, 0.74, -0.8, 0.64, -0.92, 0.42], 5);
        const out = [gOut(shore), ...gShadeFine([-0.66, 0.2, -0.2, 0.15, 0.4, 0.18, 0.8, 0.3, 0.4, 0.26, -0.2, 0.24], 0.035, 0)];
        for (const [x, y, r] of [[-0.42, 0.5, 0.12], [-0.18, 0.62, 0.09], [0.56, 0.54, 0.1]]) out.push(gDet([...arcPts(x, y, r, r * 0.4, 0.4, TAU - 0.1, 10), x, y]));
        out.push(gDet([-0.42, 0.44, -0.46, 0.38, -0.42, 0.34, -0.38, 0.38, -0.42, 0.44]), gDet([-0.47, 0.42, -0.42, 0.42, -0.37, 0.42]));
        out.push(gDet(gEll(0.16, 0.46, 0.12, 0.04, 0, TAU, 12)), gDet(gEll(0.16, 0.46, 0.26, 0.08, Math.PI * 0.1, Math.PI * 0.9, 10)), gDet(gEll(0.16, 0.46, 0.26, 0.08, Math.PI * 1.15, Math.PI * 1.85, 10)));
        for (const [x, h, l] of [[-0.86, 0.66, -0.06], [-0.74, 0.86, 0.02], [-0.62, 0.62, 0.06]]) out.push(gDet([x, 0.26, x + l, 0.26 - h]), gOut(gEll(x + l * 0.86, 0.26 - h * 0.86, 0.035, 0.1, 0, TAU, 8)));
        out.push(gDet(smooth([-0.56, 0.24, -0.5, 0.0, -0.42, -0.18], 2)), gDet(smooth([-0.92, 0.3, -0.98, 0.1, -1.0, -0.06], 2)));
        for (const [x, h] of [[0.74, 0.36], [0.82, 0.5], [0.9, 0.3]]) out.push(gDet(smooth([x, 0.32, x + 0.02, 0.32 - h * 0.5, x + 0.06, 0.32 - h], 2)));
        return out;
    },
    // ---- signs
    // a heart, its right side shaded
    love: () => {
        const p = []; for (let i = 0; i <= 48; i++) { const t = (i / 48) * TAU; p.push((16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17); }
        const right = []; for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI; right.push((16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17); }
        return [gOut(p), ...gShadeFine([0.22, -0.4, ...right.slice(8), 0.22, 0.6], 0.12)];
    },
    // an eye, plainly (Luke, 2026-10-25: an icon, not a portrait): its almond,
    // the iris, the dark pupil lit by a glint, five lashes
    eye: () => {
        const up = smooth([-0.96, 0.0, -0.52, -0.42, 0, -0.56, 0.52, -0.42, 0.96, 0.0], 5), lo = smooth([0.96, 0.0, 0.52, 0.36, 0, 0.48, -0.52, 0.36, -0.96, 0.0], 5);
        const lid = (x) => -0.56 + 0.6 * (x / 0.96) ** 2;
        const out = [gOut([...up, ...lo]), gOut(circle(0, -0.04, 0.36, 22)), gOut(circle(0, -0.04, 0.15, 12)), ...gShadeFine(circle(0, -0.04, 0.14, 12), 0.035), gDet(circle(-0.17, -0.2, 0.05, 6))];
        for (const x of [-0.56, -0.28, 0, 0.28, 0.56]) { const y = lid(x) - 0.03; out.push(gDet([x, y, x * 1.18, y - 0.18])); }
        return out;
    },
    // the sun, its rays straight and waved by turns
    sun: () => {
        const out = [gOut(circle(0, 0, 0.4, 22)), ...gShadeFine(arcPts(0, 0, 0.36, 0.36, -Math.PI * 0.4, Math.PI * 0.6, 12), 0.1)];
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, c = Math.cos(a), s = Math.sin(a); out.push(k % 2 ? gDet([c * 0.52, s * 0.52, c * 0.95, s * 0.95]) : gDet(smooth([c * 0.52, s * 0.52, c * 0.66 - s * 0.06, s * 0.66 + c * 0.06, c * 0.8 + s * 0.06, s * 0.8 - c * 0.06, c * 0.95, s * 0.95], 3))); }
        return out;
    },
    // a crescent moon among its stars
    moon: () => [
        gOut([...arcPts(0, 0, 0.82, 0.82, Math.PI * 0.32, Math.PI * 1.68, 26), ...arcPts(0.34, 0, 0.54, 0.6, Math.PI * 1.55, Math.PI * 0.45, 20)]), ...gShadeFine([...arcPts(0, 0, 0.78, 0.78, Math.PI * 0.6, Math.PI * 1.4, 14), ...arcPts(0.34, 0, 0.58, 0.64, Math.PI * 1.25, Math.PI * 0.75, 10)], 0.09),
        ...[[0.62, -0.62, 0.12], [0.78, 0.0, 0.07], [0.56, 0.6, 0.09]].flatMap(([x, y, r]) => { const p = []; for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 4, rr = k % 2 ? r * 0.35 : r; p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } return [gDet(p)]; }),
        gDet(circle(0.9, -0.36, 0.02, 4)), gDet(circle(0.36, 0.86, 0.02, 4)), gDet(circle(0.9, 0.36, 0.02, 4)),
    ],
    // a skull: its sutures, temples, and cheekbones, sockets dark, its teeth and jaw
    skull: () => [
        gOut([...arcPts(0, -0.2, 0.68, 0.62, Math.PI * 0.8, Math.PI * 2.2, 28), 0.5, 0.26, 0.42, 0.4]), gOut([-0.5, 0.26 - 0.02, -0.42, 0.4]), gOut([-0.42, 0.4, -0.3, 0.44, 0.3, 0.44, 0.42, 0.4]),
        gOut([-0.34, 0.44, -0.3, 0.76, 0.3, 0.76, 0.34, 0.44]), ...[-0.2, -0.07, 0.07, 0.2].map((x) => gDet([x, 0.44, x, 0.6])), gDet([-0.32, 0.6, 0.32, 0.6]), ...[-0.14, 0, 0.14].map((x) => gDet([x, 0.6, x, 0.74])),
        gOut(gEll(-0.26, -0.08, 0.17, 0.15, 0, TAU, 12)), gOut(gEll(0.26, -0.08, 0.17, 0.15, 0, TAU, 12)), ...gShadeFine(gEll(-0.26, -0.08, 0.15, 0.13, 0, TAU, 12), 0.05), ...gShadeFine(gEll(0.26, -0.08, 0.15, 0.13, 0, TAU, 12), 0.05),
        gOut([0, 0.1, -0.08, 0.28, 0.0, 0.32, 0.08, 0.28, 0, 0.1]), gDet(smooth([-0.62, 0.0, -0.5, 0.12, -0.44, 0.26], 2)), gDet(smooth([0.62, 0.0, 0.5, 0.12, 0.44, 0.26], 2)),
        gDet(smooth([0, -0.82, -0.04, -0.66, 0.03, -0.56, -0.02, -0.42], 3)), gDet(smooth([-0.44, -0.62, -0.24, -0.6, 0, -0.56, 0.24, -0.6, 0.44, -0.62], 3)), gDet(smooth([-0.6, -0.3, -0.5, -0.36, -0.48, -0.48], 2)),
        ...gShadeFine([0.44, -0.66, 0.62, -0.4, 0.68, -0.12, 0.5, 0.24, 0.44, 0.1, 0.5, -0.3], 0.08),
    ],
    // a flame: its tongues curling, a heart of fire within, a swirl at its root
    flame: () => [
        gOut(smooth([-0.08, 0.9, -0.5, 0.72, -0.64, 0.3, -0.46, -0.08, -0.56, -0.44, -0.3, -0.22, -0.22, -0.62, -0.04, -0.96, 0.08, -0.56, 0.26, -0.76, 0.28, -0.36, 0.52, -0.56, 0.54, -0.1, 0.64, 0.3, 0.46, 0.72, 0.08, 0.9, -0.08, 0.9], 4)),
        gDet(smooth([0.0, 0.76, -0.3, 0.6, -0.36, 0.26, -0.18, -0.06, -0.1, -0.34, 0.06, -0.06, 0.12, -0.3, 0.26, 0.04, 0.34, 0.36, 0.24, 0.62, 0.0, 0.76], 4)),
        gDet(smooth([-0.04, 0.62, -0.16, 0.42, -0.06, 0.2, 0.06, 0.32, 0.14, 0.5, 0.04, 0.62], 3)), gDet(smooth([-0.46, -0.08, -0.38, -0.2, -0.3, -0.22], 2)), gDet(smooth([0.28, -0.36, 0.36, -0.3, 0.42, -0.36], 2)),
        ...gShadeFine([0.3, -0.12, 0.54, -0.1, 0.64, 0.3, 0.46, 0.72, 0.2, 0.84, 0.32, 0.4], 0.08),
    ],
    // a candlestick: dish, knopped stem, drip tray, its candle running with wax, the flame and its glow
    candle: () => {
        const L = [-0.32, 0.0, -0.3, 0.06, -0.08, 0.1, -0.06, 0.2, -0.14, 0.28, -0.06, 0.36, -0.06, 0.56, -0.16, 0.66, -0.48, 0.78, -0.56, 0.9];
        const out = [gOut(L), gOut(gMirror(L)), gOut([-0.32, 0.0, 0.32, 0.0]), gOut([-0.56, 0.9, 0.56, 0.9]), gDet([-0.16, 0.66, 0.16, 0.66]), ...gShade([0.06, 0.36, 0.06, 0.56, 0.16, 0.66, 0.48, 0.78, 0.56, 0.9, 0.24, 0.9], 0.07)];
        out.push(gOut([-0.14, 0.0, -0.14, -0.56, 0.14, -0.56, 0.14, 0.0]), gDet(smooth([-0.14, -0.5, -0.1, -0.3, -0.06, -0.24, -0.04, -0.5], 3)), gDet(smooth([0.08, -0.56, 0.1, -0.4, 0.14, -0.36], 3)), ...gShadeFine([0.04, -0.52, 0.14, -0.56, 0.14, 0.0, 0.04, 0.0], 0.05));
        out.push(gDet([-0.32, 0.0, -0.36, 0.08, -0.32, 0.12]), gDet([0, -0.56, 0, -0.64]), gOut(smooth([0, -0.96, 0.08, -0.8, 0.06, -0.68, 0, -0.63, -0.06, -0.68, -0.08, -0.8, 0, -0.96], 3)));
        // (its glow four rays, not seven ticks: Luke 2026-10-25, round eight)
        for (let k = 0; k < 4; k++) { const a = Math.PI * (1.1 + k * 0.27), c = Math.cos(a), s = Math.sin(a); out.push(gDet([c * 0.2, -0.78 + s * 0.2, c * 0.34, -0.78 + s * 0.34])); }
        return out;
    },
    // a dagger, point down
    dagger: () => [gOut([-0.12, -0.3, -0.12, 0.6, 0, 0.95, 0.12, 0.6, 0.12, -0.3]), gDet([0, -0.26, 0, 0.78]), ...gShadeFine([0, -0.3, 0.12, -0.3, 0.12, 0.6, 0, 0.9], 0.07),
        gOut([-0.46, -0.36, 0.46, -0.36, 0.46, -0.26, -0.46, -0.26, -0.46, -0.36]), gOut([-0.08, -0.36, -0.08, -0.8, 0.08, -0.8, 0.08, -0.36]), ...[-0.48, -0.6, -0.72].map((y) => gDet([-0.08, y, 0.08, y + 0.04])), gOut(circle(0, -0.9, 0.1, 8))],
    // a pentacle in a double ring, its points marked
    pentacle: () => {
        const st = []; for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k % 5) * ((4 * Math.PI) / 5); st.push(Math.cos(a) * 0.76, Math.sin(a) * 0.76); }
        const out = [gOut(circle(0, 0, 0.96, 34)), gOut(circle(0, 0, 0.8, 30)), gOut(st), gDet(circle(0, 0, 0.29, 16))];
        // (its points marked with a spark each, the specks between left out:
        // Luke 2026-10-25, round eight)
        for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * TAU) / 5; out.push(...gSpark(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.06)); }
        return out;
    },
    // a crown of five points, each jewelled, its band set with stones
    crown: () => {
        const tips = [-0.72, -0.36, 0, 0.36, 0.72];
        const top = [-0.82, 0.3];
        tips.forEach((x, i) => top.push(x - 0.14, i % 2 ? -0.12 : -0.26, x, i % 2 ? -0.34 : -0.62, x + 0.14, i % 2 ? -0.12 : -0.26));
        top.push(0.82, 0.3);
        const out = [gOut(top), gOut([-0.82, 0.3, -0.82, 0.62, 0.82, 0.62, 0.82, 0.3, -0.82, 0.3]), ...gShadeFine([0.4, 0.3, 0.82, 0.3, 0.82, 0.62, 0.4, 0.62], 0.08)];
        tips.forEach((x, i) => { const y = i % 2 ? -0.34 : -0.62; out.push(gOut(circle(x, y - 0.08, 0.07, 6))); });
        for (const x of [-0.5, 0, 0.5]) out.push(gDet(gEll(x, 0.46, 0.08, 0.06, 0, TAU, 6)));
        out.push(gDet([-0.82, 0.38, 0.82, 0.38]), gDet([-0.82, 0.54, 0.82, 0.54]));
        return out;
    },
    // a pointing hand, the old margin mark, its cuff shaded
    hand: () => [
        gOut(smooth([-0.95, -0.24, -0.6, -0.26, -0.36, -0.36, -0.16, -0.34, 0.86, -0.3, 0.92, -0.2, 0.86, -0.12, 0.2, -0.12], 3)),
        gOut(smooth([0.2, -0.12, 0.32, -0.06, 0.3, 0.06, 0.14, 0.08, 0.26, 0.12, 0.24, 0.24, 0.08, 0.26, 0.18, 0.3, 0.14, 0.42, -0.06, 0.42, -0.36, 0.4, -0.6, 0.3, -0.95, 0.3], 3)),
        gOut(smooth([-0.16, -0.34, -0.06, -0.52, 0.12, -0.48, 0.06, -0.3], 3)), gDet([0.08, 0.08, -0.1, 0.08]), gDet([0.06, 0.26, -0.12, 0.26]),
        gOut([-0.95, -0.4, -0.72, -0.42, -0.7, 0.44, -0.95, 0.46]), ...gShadeFine([-0.95, -0.4, -0.72, -0.42, -0.7, 0.44, -0.95, 0.46], 0.08), ...gShadeFine([-0.36, 0.4, -0.3, 0.12, 0.2, 0.2, 0.14, 0.42], 0.08),
    ],
    // a tentacle, curling, its suckers along its underside
    tentacle: () => {
        const spine = smooth([-0.78, 0.92, -0.52, 0.5, -0.56, 0.02, -0.26, -0.44, 0.22, -0.64, 0.62, -0.46, 0.62, -0.12, 0.36, -0.1, 0.36, -0.3], 6);
        const n = spine.length / 2, L = [], R = [];
        for (let i = 0; i < n; i++) { const j = Math.min(n - 1, i + 1), h = Math.max(0, i - 1); const dx = spine[2 * j] - spine[2 * h], dy = spine[2 * j + 1] - spine[2 * h + 1], l = Math.hypot(dx, dy) || 1, w = 0.24 * (1 - i / n) ** 0.8 + 0.01; L.push(spine[2 * i] - (dy / l) * w, spine[2 * i + 1] + (dx / l) * w); R.push(spine[2 * i] + (dy / l) * w, spine[2 * i + 1] - (dx / l) * w); }
        const body = [...L];
        for (let i = n - 1; i >= 0; i--) body.push(R[2 * i], R[2 * i + 1]);
        const out = [gOut(body), ...gShadeFine(body.slice(0, Math.floor(L.length * 0.7) & ~1).concat(spine.slice(0, Math.floor(L.length * 0.7) & ~1).reverse().reduce((a, v, i, A) => (i % 2 ? a : a.concat([A[i + 1], v])), [])), 0.1)];
        for (let i = 4; i < n - 6; i += 5) { const t = i / n, x = R[2 * i] * 0.6 + spine[2 * i] * 0.4, y = R[2 * i + 1] * 0.6 + spine[2 * i + 1] * 0.4; out.push(gDet(circle(x, y, 0.055 * (1 - t) + 0.02, 6))); }
        return out;
    },
    // an hourglass, its sand running out
    hourglass: () => [
        gOut([-0.56, -0.9, 0.56, -0.9]), gOut([-0.56, 0.9, 0.56, 0.9]), gOut([-0.48, -0.9, -0.48, 0.9]), gOut([0.48, -0.9, 0.48, 0.9]),
        gOut([-0.36, -0.82, ...smooth([-0.36, -0.82, -0.32, -0.3, -0.06, 0, -0.32, 0.3, -0.36, 0.82], 4)]), gOut([0.36, -0.82, ...smooth([0.36, -0.82, 0.32, -0.3, 0.06, 0, 0.32, 0.3, 0.36, 0.82], 4)]),
        ...gShadeFine([-0.3, 0.82, 0.3, 0.82, 0.22, 0.5, 0, 0.36, -0.22, 0.5], 0.06), ...gShadeFine([-0.22, -0.32, 0.22, -0.32, 0.04, -0.06, -0.04, -0.06], 0.05), gDet([0, -0.04, 0, 0.36]),
    ],
    // a spider
    spider: () => {
        const out = [gOut(gEll(0, 0.22, 0.26, 0.34, 0, TAU, 18)), gOut(gEll(0, -0.24, 0.15, 0.14, 0, TAU, 12)), ...gShadeFine(gEll(0, 0.22, 0.24, 0.32, -Math.PI * 0.45, Math.PI * 0.45, 10), 0.07), gDet([0, 0.02, 0, 0.42])];
        for (const s of [-1, 1]) for (const [a, b, c] of [[[0.12, -0.3], [0.5, -0.66], [0.82, -0.42]], [[0.14, -0.24], [0.6, -0.36], [0.92, -0.06]], [[0.14, -0.2], [0.58, -0.06], [0.86, 0.32]], [[0.12, -0.16], [0.46, 0.18], [0.64, 0.66]]]) out.push(gOut([s * a[0], a[1], s * b[0], b[1], s * c[0], c[1]]));
        return out;
    },
    // a moth: its furred, banded body, feathered feelers, veined forewings with eyes, patterned hindwings
    moth: () => {
        const out = [gOut(gEll(0, 0.04, 0.08, 0.44, 0, TAU, 14)), ...[-0.16, 0.0, 0.16, 0.3].map((y) => gDet([-0.07, y, 0.07, y])), gOut(circle(0, -0.46, 0.07, 6))];
        for (const s of [-1, 1]) {
            const ant = gCurve((t) => [s * (0.04 + t * 0.32), -0.5 - Math.sin(t * Math.PI * 0.8) * 0.3], 10); out.push(gDet(ant));
            for (let i = 2; i < 10; i += 2) { const x = ant[2 * i], y = ant[2 * i + 1]; out.push(gDet([x, y, x + s * 0.03, y - 0.05]), gDet([x, y, x - s * 0.01, y - 0.06])); }
            const fw = [s * 0.07, -0.26, ...smooth([s * 0.07, -0.26, s * 0.42, -0.62, s * 0.92, -0.5, s * 0.86, -0.08, s * 0.08, 0.04], 4)];
            const hw = [s * 0.07, 0.06, ...smooth([s * 0.07, 0.06, s * 0.6, 0.1, s * 0.66, 0.5, s * 0.34, 0.66, s * 0.07, 0.34], 4)];
            out.push(gOut(fw), gOut(hw));
            for (const [x, y] of [[0.5, -0.5], [0.66, -0.3], [0.5, -0.1]]) out.push(gDet([s * 0.1, -0.12, s * x, y]));
            out.push(gOut(circle(s * 0.5, -0.28, 0.12, 12)), gDet(circle(s * 0.5, -0.28, 0.07, 8)), ...gShadeFine(circle(s * 0.5, -0.28, 0.04, 6), 0.03), gDet(smooth([s * 0.72, -0.48, s * 0.8, -0.3, s * 0.76, -0.12], 2)));
            out.push(gDet(gEll(s * 0.38, 0.34, 0.1, 0.07, 0, TAU, 8)), gDet(smooth([s * 0.12, 0.2, s * 0.32, 0.18, s * 0.52, 0.28], 2)), ...gShadeFine([s * 0.3, 0.5, s * 0.6, 0.36, s * 0.66, 0.5, s * 0.34, 0.66], 0.05));
        }
        return out;
    },
    // a rat (Luke, round seven) sat up on its haunches: its round ear and
    // bright eye, whiskers, its paws held up, its long tail curled round its feet
    rat: () => {
        const body = smooth([-0.34, 0.72, -0.46, 0.36, -0.38, -0.02, -0.2, -0.34, 0.0, -0.58, 0.2, -0.64, 0.36, -0.56, 0.6, -0.44, 0.36, -0.36, 0.2, -0.2, 0.26, 0.2, 0.2, 0.6, 0.0, 0.74, -0.34, 0.72], 4);
        const out = [gOut(body), gOut(gEll(0.02, -0.66, 0.1, 0.12, 0, TAU, 10)), gDet(gEll(0.03, -0.65, 0.05, 0.065, 0, TAU, 6)), gOut(circle(0.3, -0.52, 0.03, 5)), gOut(circle(0.6, -0.44, 0.025, 4))];
        for (const [x, y] of [[0.8, -0.56], [0.84, -0.44], [0.8, -0.32]]) out.push(gDet([0.58, -0.43, x, y]));
        out.push(gOut(smooth([0.2, -0.14, 0.34, -0.06, 0.4, 0.02], 2)), gOut(smooth([0.22, -0.02, 0.34, 0.06, 0.38, 0.14], 2)), gOut(gEll(0.12, 0.74, 0.16, 0.045, 0, TAU, 10)), gDet(smooth([-0.24, 0.3, -0.06, 0.34, 0.02, 0.6], 2)));
        out.push(...gShadeFine([0.06, -0.3, 0.2, -0.2, 0.26, 0.2, 0.2, 0.6, 0.0, 0.74, -0.06, 0.4], 0.055));
        out.push(gOut(smooth([-0.34, 0.68, -0.58, 0.8, -0.82, 0.72, -0.9, 0.5, -0.82, 0.3, -0.66, 0.24], 4)), gOut(gCurl(-0.62, 0.32, 0.08, -Math.PI / 2, 1.2, 1)));
        return out;
    },
    // a crow (Luke, round seven) perched on a leafy branch: its beak and
    // bright eye, a folded wing feathered and shaded, its fanned tail
    crow: () => {
        const out = [gOut(circle(-0.36, -0.42, 0.16, 14)), gOut([-0.5, -0.5, -0.78, -0.4, -0.5, -0.33]), gDet([-0.52, -0.42, -0.72, -0.4]), gOut(circle(-0.4, -0.46, 0.03, 4))];
        out.push(gOut(smooth([-0.24, -0.54, 0.02, -0.42, 0.26, -0.22, 0.46, 0.02, 0.6, 0.18], 3)), gOut(smooth([-0.46, -0.3, -0.38, -0.06, -0.22, 0.12, 0.04, 0.24, 0.3, 0.24, 0.5, 0.22], 3)));
        out.push(gOut([0.46, 0.04, 0.92, 0.42, 0.86, 0.52, 0.5, 0.26]), gDet([0.52, 0.12, 0.88, 0.47]), gDet([0.5, 0.2, 0.8, 0.5]));
        const wing = smooth([-0.16, -0.32, 0.12, -0.28, 0.38, -0.06, 0.64, 0.26, 0.32, 0.16, 0.02, 0.06, -0.16, -0.08, -0.16, -0.32], 3);
        out.push(gOut(wing), ...gShadeFine(wing, 0.055, 0.5));
        for (const [x, y] of [[-0.08, 0.0], [0.08, 0.06], [0.24, 0.12], [0.4, 0.18]]) out.push(gDet(arcPts(x, y, 0.08, 0.05, 0, Math.PI, 5)));
        out.push(gDet([-0.14, 0.18, -0.16, 0.4]), gDet([0.02, 0.24, 0.02, 0.4]), gDet([-0.22, 0.42, -0.16, 0.4, -0.1, 0.43]), gDet([-0.04, 0.42, 0.02, 0.4, 0.08, 0.43]));
        out.push(gOut(smooth([-0.92, 0.42, -0.5, 0.4, 0.0, 0.4, 0.5, 0.46, 0.9, 0.42], 3)), gOut(smooth([-0.9, 0.5, -0.5, 0.48, 0.0, 0.48, 0.46, 0.53, 0.86, 0.5], 3)));
        out.push(gDet(smooth([0.36, 0.52, 0.5, 0.62, 0.62, 0.74], 2)), gLeaf(0.62, 0.74, Math.PI * 0.35, 0.18, 0.07), gLeaf(0.5, 0.62, Math.PI * 0.75, 0.16, 0.06), gLeaf(-0.76, 0.46, Math.PI * 0.62, 0.18, 0.065), gLeaf(-0.56, 0.48, Math.PI * 0.38, 0.15, 0.055));
        return out;
    },
    // coins: a stack with milled edges, a coin stood up showing its crown, others scattered, a purse on its drawstring
    coins: () => {
        const out = [];
        for (let i = 0; i < 6; i++) { const y = 0.74 - i * 0.1; out.push(gOut(gEll(-0.36, y, 0.34, 0.1, 0, Math.PI, 10)), gOut([-0.7, y, -0.7, y - 0.1]), gOut([0.02, y, 0.02, y - 0.1])); }
        out.push(gOut(gEll(-0.36, 0.14, 0.34, 0.1, 0, TAU, 16)), gDet(gEll(-0.36, 0.14, 0.24, 0.06, 0, TAU, 12)), ...gShadeFine([-0.14, 0.82, 0.02, 0.74, 0.02, 0.2, -0.14, 0.26], 0.04));
        out.push(gOut(gEll(0.36, 0.36, 0.26, 0.36, 0, TAU, 20)), gDet(gEll(0.36, 0.36, 0.2, 0.29, 0, TAU, 16)), gDet([0.24, 0.36, 0.28, 0.24, 0.32, 0.32, 0.36, 0.2, 0.4, 0.32, 0.44, 0.24, 0.48, 0.36, 0.24, 0.36]), gDet([0.26, 0.44, 0.46, 0.44]), ...gShadeFine(gEll(0.38, 0.36, 0.24, 0.34, -Math.PI * 0.4, Math.PI * 0.4, 8), 0.05));
        out.push(gOut(smooth([0.6, 0.86, 0.56, 0.64, 0.66, 0.5, 0.72, 0.42, 0.84, 0.5, 0.94, 0.64, 0.9, 0.86, 0.6, 0.86], 3)), gDet([0.66, 0.46, 0.84, 0.46]), gDet(smooth([0.72, 0.44, 0.66, 0.34, 0.6, 0.36], 2)));
        // (two coins, not three specks: Luke 2026-10-25, round eight)
        for (const [x, y] of [[0.32, 0.88], [-0.84, 0.86]]) out.push(gDet(gEll(x, y, 0.1, 0.04, 0, TAU, 10)));
        return out;
    },
    // a chest, three-quarter on: its domed lid, iron bands and studs, corner brackets, a lock plate, coins spilt at its foot
    chest: () => {
        const F = [-0.7, 0.0, 0.34, 0.0, 0.34, 0.66, -0.7, 0.66], S = [0.34, 0.0, 0.66, -0.16, 0.66, 0.5, 0.34, 0.66];
        const out = [gOut([...F, -0.7, 0.0]), gOut([...S]), gOut([-0.7, 0.0, ...arcPts(-0.18, 0.0, 0.52, 0.36, Math.PI, TAU, 14)]), gOut([0.34, 0.0, ...arcPts(0.5, -0.08, 0.16, 0.3, Math.PI * 1.12, Math.PI * 1.98, 8)]), gDet(arcPts(-0.18, -0.36, 0.84, 0.1, Math.PI * 1.75, Math.PI * 1.9, 4).length ? [-0.18, -0.36, 0.5, -0.4] : [])];
        for (const x of [-0.5, 0.14]) out.push(gDet([x, 0.66, x, 0.0]), gDet(arcPts(-0.18, 0.0, 0.52, 0.36, Math.PI + Math.acos(Math.max(-1, Math.min(1, (x + 0.18) / 0.52))) * -1 + Math.PI * 2, Math.PI + Math.acos(Math.max(-1, Math.min(1, (x + 0.18) / 0.52))) * -1 + Math.PI * 2, 1)));
        for (const x of [-0.5, 0.14]) { const y = -Math.sqrt(Math.max(0, 1 - ((x + 0.18) / 0.52) ** 2)) * 0.36; out.push(gDet([x, 0.0, x, y])); for (const yy of [0.12, 0.32, 0.52]) out.push(gDet(circle(x, yy, 0.018, 4))); }
        out.push(gOut([-0.26, 0.0, -0.1, 0.0, -0.1, 0.24, -0.18, 0.3, -0.26, 0.24, -0.26, 0.0]), gDet(circle(-0.18, 0.1, 0.03, 5)), gDet([-0.18, 0.13, -0.18, 0.2]));
        out.push(gDet([-0.7, 0.12, -0.58, 0.0]), gDet([-0.7, 0.54, -0.58, 0.66]), gDet([0.22, 0.0, 0.34, 0.12]), gDet([0.22, 0.66, 0.34, 0.54]), ...gShade(S, 0.07), ...gShadeFine([0.34, 0.0, ...arcPts(0.5, -0.08, 0.16, 0.3, Math.PI * 1.12, Math.PI * 1.98, 8), 0.66, -0.16], 0.05));
        // (two coins, not four specks: Luke 2026-10-25, round eight)
        for (const [x, y] of [[0.7, 0.79], [-0.84, 0.8]]) out.push(gDet(gEll(x, y, 0.1, 0.05, 0, TAU, 10)));
        out.push(...gGround(-0.98, 0.98, 0.9));
        return out;
    },
    // a padlock: a shield of a body, its border engraved, a scrolled escutcheon, a heavy shackle, rivets
    padlock: () => {
        const body = [-0.58, -0.08, 0.58, -0.08, ...smooth([0.58, -0.08, 0.6, 0.42, 0.34, 0.76, 0, 0.92, -0.34, 0.76, -0.6, 0.42, -0.58, -0.08], 4)];
        const out = [gOut(body), gDet([-0.48, 0.0, 0.48, 0.0, ...smooth([0.48, 0.0, 0.5, 0.4, 0.28, 0.68, 0, 0.82, -0.28, 0.68, -0.5, 0.4, -0.48, 0.0], 4)])];
        out.push(gOut([-0.38, -0.08, -0.38, -0.4, ...arcPts(0, -0.4, 0.38, 0.44, Math.PI, TAU, 14), 0.38, -0.08]), gOut([-0.24, -0.08, -0.24, -0.4, ...arcPts(0, -0.4, 0.24, 0.3, Math.PI, TAU, 12), 0.24, -0.08]), ...gShadeFine([0.24, -0.4, ...arcPts(0, -0.4, 0.38, 0.44, Math.PI * 1.7, TAU, 6), 0.38, -0.08, 0.24, -0.08], 0.04));
        out.push(gOut(smooth([0, 0.14, 0.14, 0.2, 0.16, 0.36, 0.08, 0.5, 0.12, 0.62, 0, 0.66, -0.12, 0.62, -0.08, 0.5, -0.16, 0.36, -0.14, 0.2, 0, 0.14], 3)), gOut(circle(0, 0.32, 0.05, 6)), gOut([-0.03, 0.36, -0.05, 0.5, 0.05, 0.5, 0.03, 0.36]));
        for (const [x, y] of [[-0.4, 0.08], [0.4, 0.08], [-0.36, 0.5], [0.36, 0.5]]) out.push(gDet(circle(x, y, 0.025, 4)));
        out.push(gDet(smooth([-0.4, 0.26, -0.3, 0.2, -0.22, 0.28], 2)), gDet(smooth([0.4, 0.26, 0.3, 0.2, 0.22, 0.28], 2)), ...gShadeFine([0.3, -0.08, 0.58, -0.08, 0.6, 0.42, 0.34, 0.76, 0.22, 0.8], 0.06));
        return out;
    },
    // a cog of the Vermissian's works
    gear: () => {
        const p = [];
        for (let k = 0; k < 10; k++) { const a0 = (k / 10) * TAU, d = TAU / 10; for (const [f, r] of [[0, 0.68], [0.15, 0.68], [0.22, 0.92], [0.48, 0.92], [0.55, 0.68], [1, 0.68]]) { const a = a0 + f * d; p.push(Math.cos(a) * r, Math.sin(a) * r); } }
        return [gOut(p), gOut(circle(0, 0, 0.42, 20)), gOut(circle(0, 0, 0.14, 10)), ...[0, 1, 2, 3].map((k) => gDet([Math.cos(k * Math.PI / 2 + 0.4) * 0.16, Math.sin(k * Math.PI / 2 + 0.4) * 0.16, Math.cos(k * Math.PI / 2 + 0.4) * 0.42, Math.sin(k * Math.PI / 2 + 0.4) * 0.42])), ...gShadeFine(arcPts(0, 0, 0.62, 0.62, -Math.PI * 0.4, Math.PI * 0.4, 10).concat(arcPts(0, 0, 0.46, 0.46, Math.PI * 0.4, -Math.PI * 0.4, 8)), 0.08)];
    },
    // a flask, half full
    potion: () => [
        gOut([-0.14, -0.86, 0.14, -0.86, 0.14, -0.62, -0.14, -0.62, -0.14, -0.86]), gOut([-0.12, -0.62, -0.12, -0.3, ...arcPts(0, 0.28, 0.6, 0.6, Math.PI * 1.39, Math.PI * 3.61, 28), 0.12, -0.62]),
        gDet(arcPts(0, 0.28, 0.6, 0.6, Math.PI * 0.95, Math.PI * 0.05, 1).length ? [-0.56, 0.12, 0.56, 0.12] : []), ...gShadeFine(arcPts(0, 0.28, 0.56, 0.56, Math.PI * 0.05, Math.PI * 0.95, 14).concat([-0.54, 0.14, 0.54, 0.14]), 0.07, 1.57),
        gDet(circle(-0.16, -0.02, 0.05, 5)), gDet(circle(0.06, -0.16, 0.035, 4)), gDet(circle(-0.04, 0.0, 0.03, 4)), gDet(arcPts(0, 0.28, 0.42, 0.42, Math.PI * 1.15, Math.PI * 1.45, 5)),
    ],
    // an open book (Luke, round seven): its leaves fanned, a scrolled initial,
    // lines of writing, a page's corner turned, a ribbon hung from it
    book: () => {
        const L = [0, -0.5, ...smooth([0, -0.5, -0.4, -0.66, -0.9, -0.56], 3), -0.9, 0.5, ...smooth([-0.9, 0.5, -0.4, 0.42, 0, 0.56], 3)];
        const R = [0, -0.5, ...smooth([0, -0.5, 0.4, -0.66, 0.9, -0.56], 3), 0.9, 0.36, 0.76, 0.5, ...smooth([0.76, 0.5, 0.4, 0.42, 0, 0.56], 3)];
        const out = [gOut(L), gOut(R), gOut([0, -0.5, 0, 0.56]), gDet([0.9, 0.36, 0.78, 0.4, 0.76, 0.5])];
        out.push(gDet(smooth([-0.9, 0.56, -0.4, 0.48, 0, 0.62, 0.4, 0.48, 0.9, 0.56], 3)), gDet(smooth([-0.9, 0.62, -0.4, 0.54, 0, 0.68, 0.4, 0.54, 0.9, 0.62], 3)));
        out.push(gOut([-0.8, -0.42, -0.64, -0.44, -0.64, -0.24, -0.8, -0.22, -0.8, -0.42]), gDet(gCurl(-0.72, -0.33, 0.06, 0, 1.3, 1)));
        for (const [y, x0] of [[-0.38, -0.58], [-0.26, -0.58], [-0.12, -0.8], [0.02, -0.8], [0.16, -0.8], [0.3, -0.8]]) out.push(gDet(gCurve((t) => [x0 + (-0.12 - x0) * t, y - 0.02 * t + Math.sin(t * 18) * 0.012], 10)));
        for (const y of [-0.4, -0.26, -0.12, 0.02, 0.16]) out.push(gDet(gCurve((t) => [0.12 + 0.66 * t, y + 0.01 * t + Math.sin(t * 18) * 0.012], 10)));
        out.push(...gShadeFine([0.14, 0.24, 0.74, 0.22, 0.72, 0.42, 0.4, 0.42, 0.14, 0.5], 0.05));
        out.push(gOut([-0.04, 0.56, -0.04, 0.96, 0.02, 0.88, 0.08, 0.96, 0.08, 0.58]), gDet(smooth([-0.02, 0.62, 0.04, 0.7, 0.0, 0.8], 2)));
        return out;
    },
    // ---- flourishes
    // a compass rose: sixteen points, half of each shaded, a ring of degrees, its north a fleur
    compass: () => {
        const out = [gOut(circle(0, 0, 0.78, 36)), gDet(circle(0, 0, 0.7, 34))];
        for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; out.push(gDet([Math.cos(a) * 0.7, Math.sin(a) * 0.7, Math.cos(a) * (k % 4 ? 0.74 : 0.78), Math.sin(a) * (k % 4 ? 0.74 : 0.78)])); }
        for (let k = 0; k < 16; k++) {
            const a = -Math.PI / 2 + (k * Math.PI) / 8, R = k % 4 === 0 ? 0.96 : k % 2 === 0 ? 0.62 : 0.42, w = k % 2 ? 0.07 : 0.11;
            const tip = [Math.cos(a) * R, Math.sin(a) * R], l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w], r = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
            if (k % 2) { out.push(gDet([...l, ...tip, ...r])); continue; }
            out.push(gOut([...l, ...tip, ...r]), gDet([0, 0, ...tip]), ...gShadeFine([0, 0, ...tip, ...r], 0.045, a + 1.3));
        }
        out.push(gOut(circle(0, 0, 0.08, 8)));
        out.push(gOut(smooth([0, -1.0, 0.05, -1.08, 0, -1.2, -0.05, -1.08, 0, -1.0], 3)), gOut(smooth([-0.02, -1.02, -0.14, -1.06, -0.16, -1.16, -0.08, -1.12], 3)), gOut(smooth([0.02, -1.02, 0.14, -1.06, 0.16, -1.16, 0.08, -1.12], 3)), gDet([-0.08, -0.98, 0.08, -0.98]));
        return out;
    },
    // a corner scroll, for a map's corner
    corner: () => {
        const out = [gOut([-0.92, 0.92, -0.92, -0.92, 0.92, -0.92]), gDet([-0.82, 0.82, -0.82, -0.82, 0.82, -0.82])];
        out.push(gOut(smooth([-0.82, -0.82, -0.4, -0.66, -0.06, -0.7, 0.24, -0.58, 0.32, -0.42, 0.18, -0.34, 0.1, -0.46], 4)), gOut(smooth([-0.82, -0.82, -0.66, -0.4, -0.7, -0.06, -0.58, 0.24, -0.42, 0.32, -0.34, 0.18, -0.46, 0.1], 4)));
        out.push(gOut(gCurl(0.62, -0.72, 0.12, Math.PI, 1.3, -1)), gOut(gCurl(-0.72, 0.62, 0.12, -Math.PI / 2, 1.3, 1)), gDet([0.32, -0.82, 0.5, -0.72]), gDet([-0.82, 0.32, -0.72, 0.5]));
        out.push(gLeaf(-0.56, -0.56, -Math.PI / 4, 0.3, 0.1), gLeaf(-0.4, -0.66, -0.2, 0.18, 0.06), gLeaf(-0.66, -0.4, -Math.PI / 2 + 0.2, 0.18, 0.06), gOut(circle(-0.7, -0.7, 0.05, 6)));
        return out;
    },
    // a wax seal, a heart pressed into it
    seal: () => {
        const blob = []; for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, r = 0.78 + 0.07 * Math.sin(a * 7) + 0.04 * Math.sin(a * 13 + 1); blob.push(Math.cos(a) * r, Math.sin(a) * r); }
        return [gOut(blob), gDet(circle(0, 0, 0.6, 30)), gOut(gHeartPts(0, 0.02, 0.36)), ...gShadeFine(gHeartPts(0.06, 0.06, 0.24, 20), 0.05), ...gShadeFine(arcPts(0, 0, 0.74, 0.74, -Math.PI * 0.05, Math.PI * 0.6, 12).concat(arcPts(0, 0, 0.62, 0.62, Math.PI * 0.6, -Math.PI * 0.05, 10)), 0.06),
            gOut(smooth([0.5, 0.56, 0.62, 0.84, 0.54, 0.98, 0.44, 0.88, 0.42, 0.66], 3))];
    },
    // a guiding star, its rays shaded, sparks about it (round eight: three
    // sparks for its seven specks, Luke 2026-10-25)
    star: () => {
        const p = [];
        for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 8, r = k % 2 ? 0.16 : k % 4 === 0 ? 0.95 : 0.5; p.push(Math.cos(a) * r, Math.sin(a) * r); }
        return [gOut(p), ...gShadeFine([0, 0, 0, -0.95, 0.12, -0.12, 0.95, 0, 0.12, 0.12, 0, 0.95, 0, 0], 0.06, 0.6), ...gSpark(-0.62, -0.6, 0.11), ...gSpark(0.62, 0.62, 0.11), ...gSpark(0.68, -0.62, 0.08)];
    },
    // a heart in thorns (round eight: the thorns one fine stroke run along
    // under the vine, spiking out of it, Luke 2026-10-25)
    thorns: () => {
        const out = [gOut(gHeartPts(0, 0.0, 0.8)), ...gShadeFine(gHeartPts(0.1, 0.08, 0.5, 24), 0.08)];
        const vine = gCurve((t) => { const a = t * TAU * 1.5 + 0.5; return [Math.cos(a) * (0.6 + 0.12 * Math.sin(t * 9)), 0.0 + Math.sin(a) * 0.36 + (t - 0.5) * 0.7]; }, 40);
        const path = [];
        for (let i = 0; i <= 40; i++) {
            const x = vine[2 * i], y = vine[2 * i + 1];
            path.push(x, y);
            if (i < 2 || i >= 40 || (i - 2) % 3) continue;
            const a = Math.atan2(vine[2 * i + 3] - y, vine[2 * i + 2] - x) + (i % 2 ? 1 : -1) * Math.PI / 2;
            path.push(x + Math.cos(a - 0.4) * 0.08, y + Math.sin(a - 0.4) * 0.08, x, y);
        }
        out.push(gOut(vine), gDet(path));
        return out;
    },
};
// (the doodles window's tabs, in order; Yours is the user's own. Places and
// signs are the GM's, flourishes for their map; players see their own, and
// any the GM gives them, `given`: none yet. Luke 2026-10-25)
export const DOODLE_TABS = Object.freeze({ places: Object.freeze(['haven', 'palisade', 'hovel', 'tower', 'beacon', 'market', 'throne', 'shrine', 'idol', 'well', 'fountain', 'bell', 'gate', 'vault', 'bridge', 'ropebridge', 'ferry', 'signpost', 'cairn', 'descent', 'spiral', 'shaft', 'headframe', 'rails', 'mine', 'orecart', 'cave', 'cavern', 'ruin', 'rubble', 'chokedtunnel', 'camp', 'lantern', 'barricade', 'stake', 'cage', 'web', 'ribs', 'deadtree', 'fungi', 'crystals', 'lake']), signs: Object.freeze(['love', 'eye', 'sun', 'moon', 'skull', 'flame', 'candle', 'dagger', 'pentacle', 'crown', 'hand', 'tentacle', 'hourglass', 'spider', 'moth', 'rat', 'crow', 'coins', 'chest', 'padlock', 'gear', 'potion', 'book']), flourishes: Object.freeze(['compass', 'seal', 'star', 'thorns', 'corner']), given: Object.freeze([]) });
export const DOODLE_KINDS = [...DOODLE_TABS.places, ...DOODLE_TABS.signs, ...DOODLE_TABS.flourishes];
// the doodles window's tabs for a user: the GM's all; a player's their own,
// and what is given them
export const doodleTabsFor = (gm) => (gm ? ['places', 'signs', 'flourishes', 'yours'] : [...(DOODLE_TABS.given.length ? ['given'] : []), 'yours']);
// (their names, for a host without a language file: the editor)
export const DOODLE_NAMES = Object.freeze({ haven: 'Haven', palisade: 'Palisade', hovel: 'Cottage', tower: 'Watchtower', beacon: 'Beacon', market: 'Market', throne: 'Throne', shrine: 'Shrine', idol: 'Idol', well: 'Well', fountain: 'Fountain', bell: 'Alarm bell', gate: 'Gate', vault: 'Vault door', bridge: 'Bridge', ropebridge: 'Rope bridge', ferry: 'Ferry', signpost: 'Signpost', cairn: 'Cairn', descent: 'Way down', spiral: 'Spiral stair', shaft: 'Shaft', headframe: 'Headframe', rails: 'Vermissian line', mine: 'Mine', orecart: 'Ore cart', cave: 'Cave', cavern: 'Cavern', ruin: 'Ruin', rubble: 'Collapse', chokedtunnel: 'Choked tunnel', camp: 'Camp', lantern: 'Lantern', barricade: 'Barricade', stake: 'Warning pole', cage: 'Hanging cage', web: 'Web', ribs: 'Great ribs', deadtree: 'Dead tree', fungi: 'Fungi', crystals: 'Crystals', lake: 'Still water', love: 'Heart', eye: 'Eye', sun: 'Sun', moon: 'Moon', skull: 'Skull', flame: 'Flame', candle: 'Candlestick', dagger: 'Dagger', pentacle: 'Pentacle', crown: 'Crown', hand: 'Pointing hand', tentacle: 'Tentacle', hourglass: 'Hourglass', spider: 'Spider', moth: 'Moth', rat: 'Rat', crow: 'Crow', coins: 'Coins', chest: 'Chest', padlock: 'Padlock', gear: 'Gear', potion: 'Potion', book: 'Book', compass: 'Compass rose', seal: 'Wax seal', star: 'Guiding star', thorns: 'Heart in thorns', corner: 'Corner scroll' });
// (a surveyor's steady hand; places upright, only a hair of tilt)
for (const k of DOODLE_TABS.places) Object.assign(DOODLES[k], { steady: 0.45, upright: true });
for (const k of [...DOODLE_TABS.signs, ...DOODLE_TABS.flourishes]) DOODLES[k].steady = 0.45;

// A clean line drawn by a hand: walked along at an even pace, wavering
// slowly to either side, trembling a little, its end overshot
function humanize(pts, r, k = 1) {
    const out = [];
    const n = pts.length / 2;
    if (n < 2) return pts;
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
    if (total < 0.12) {
        // (a dot: a short dab)
        const x = pts[0];
        const y = pts[1];
        return [x - 0.03, y - 0.01, x + 0.02 + r() * 0.02, y + 0.03];
    }
    const step = 0.045;
    const f1 = 1.3 + r() * 1.4;
    const f2 = 4 + r() * 3;
    const p1 = r() * TAU;
    const p2 = r() * TAU;
    const amp = 0.035 * k;
    let run = 0;
    const over = 0.05 + r() * 0.05;
    for (let i = 1; i < n; i++) {
        const x0 = pts[2 * i - 2];
        const y0 = pts[2 * i - 1];
        const dx = pts[2 * i] - x0;
        const dy = pts[2 * i + 1] - y0;
        const len = Math.hypot(dx, dy) || 1e-6;
        const nx = -dy / len;
        const ny = dx / len;
        const last = i === n - 1;
        const reach = last ? len + over : len;
        for (let d = i === 1 ? 0 : step - (run % step); d <= reach; d += step) {
            const t = (run + d) / total;
            const w = amp * (0.6 * Math.sin(t * TAU * f1 + p1) + 0.4 * Math.sin(t * TAU * f2 + p2)) + (r() - 0.5) * 0.012 * k;
            out.push(x0 + (dx / len) * d + nx * w, y0 + (dy / len) * d + ny * w);
        }
        run += len;
    }
    return out;
}

// A doodle's strokes: its shapes humanized, turned a little, `size` across
// (a half-width), set at x, y (in whatever units those are: board px on the
// sheet, card units on a card)
// (every doodle fitted to the same box, its widest way across it, centred,
// so each comes out the same size at every size: Luke 2026-10-06)
// (a shape is a polyline, or { pts, k }: k its line's weight against the
// brush's width, an engraver's outline, detail, and hatching; Luke
// 2026-10-25)
function fitShapes(shapes) {
    const S = shapes.map((p) => (Array.isArray(p) ? { pts: p, k: 1 } : { pts: p.pts, k: p.k ?? 1 })).filter((p) => p.pts?.length >= 2);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { pts: p } of S) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const k = 0.95 / Math.max(0.05, (x1 - x0) / 2, (y1 - y0) / 2);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return S.map((p) => ({ k: p.k, pts: p.pts.map((v, i) => (v - (i % 2 ? cy : cx)) * k) }));
}

// Lines `gap` apart at `ang` (radians), inside the closed polygon `poly`: an
// engraver's shading, each a shape of weight `k` (Luke, 2026-10-25)
function hatchIn(poly, gap = 0.16, ang = 1, k = 0.4) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = [];
    for (let i = 0; i < poly.length; i += 2) P.push([poly[i] * c + poly[i + 1] * s, -poly[i] * s + poly[i + 1] * c]);
    const vs = P.map((p) => p[1]);
    const out = [];
    for (let v = Math.min(...vs) + gap / 2; v < Math.max(...vs); v += gap) {
        const xs = [];
        for (let i = 0; i < P.length; i++) {
            const a = P[i], b = P[(i + 1) % P.length];
            if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((m, n) => m - n);
        for (let j = 0; j + 1 < xs.length; j += 2) {
            const u0 = xs[j] + gap * 0.15, u1 = xs[j + 1] - gap * 0.15;
            if (u1 - u0 < gap * 0.5) continue;
            out.push({ k, pts: [u0 * c - v * s, u0 * s + v * c, u1 * c - v * s, u1 * s + v * c] });
        }
    }
    return out;
}

// The same hatching in as few strokes as it will go (Luke, 2026-10-25, round
// eight: fewer strokes paint faster): each line joined to the next one down
// where their ends lie close, the pen running on along the shading's edge,
// an engraver's zigzag; a lone line shorter than a hatch's gap (or 0.08)
// left out, no tiny fragments
function hatchRun(poly, gap, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const lines = hatchIn(poly, gap, ang, 0.4);
    if (!lines.length) return [];
    const vOf = (l) => -l.pts[0] * s + l.pts[1] * c;
    const v0 = vOf(lines[0]);
    const runs = [];
    for (const l of lines) {
        const row = Math.round((vOf(l) - v0) / gap);
        let best = null, bd = gap * 2.2, flip = false;
        for (const run of runs) {
            if (run.row !== row - 1) continue;
            const n = run.pts.length, ex = run.pts[n - 2], ey = run.pts[n - 1];
            const d0 = Math.hypot(l.pts[0] - ex, l.pts[1] - ey), d1 = Math.hypot(l.pts[2] - ex, l.pts[3] - ey);
            if (d0 < bd) { best = run; bd = d0; flip = false; }
            if (d1 < bd) { best = run; bd = d1; flip = true; }
        }
        const p = flip ? [l.pts[2], l.pts[3], l.pts[0], l.pts[1]] : l.pts;
        if (best) { best.pts.push(...p); best.row = row; } else runs.push({ k: l.k, row, pts: [...p] });
    }
    return runs.filter((run) => run.pts.length > 4 || Math.hypot(run.pts[2] - run.pts[0], run.pts[3] - run.pts[1]) >= Math.max(gap, 0.08)).map(({ k, pts }) => ({ k, pts }));
}

// A doodle's shapes tidied before they are drawn (Luke, 2026-10-25, round
// eight): specks under `speck` across left out, and shapes of one weight
// that meet end to end joined into one stroke
function tidyShapes(shapes, { eps = 0.025, speck = 0.07 } = {}) {
    const S = shapes.map((p) => (Array.isArray(p) ? { pts: p, k: 1 } : { pts: p.pts, k: p.k ?? 1 })).filter(({ pts }) => {
        if (!(pts?.length >= 4)) return false;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
        return Math.hypot(x1 - x0, y1 - y0) >= speck;
    });
    const rev = (p) => { const o = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]); return o; };
    const near = (a, i, b, j) => Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1]) < eps;
    for (let joined = true; joined;) {
        joined = false;
        for (let i = 0; i < S.length; i++) {
            for (let j = i + 1; j < S.length; j++) {
                if (S[i].k !== S[j].k) continue;
                const a = S[i].pts, b = S[j].pts, an = a.length - 2, bn = b.length - 2;
                const pts = near(a, an, b, 0) ? [...a, ...b.slice(2)] : near(a, an, b, bn) ? [...a, ...rev(b).slice(2)] : near(a, 0, b, bn) ? [...b, ...a.slice(2)] : near(a, 0, b, 0) ? [...rev(b), ...a.slice(2)] : null;
                if (!pts) continue;
                S[i] = { k: S[i].k, pts };
                S.splice(j, 1);
                j = i;
                joined = true;
            }
        }
    }
    return hiddenJoins(S);
}

// Shapes of one weight joined where the pen's way from one's end to the
// other's runs under a line already drawn, as heavy or heavier (an arch's
// blocks along its arches, ties along their rails): the joins hidden in what
// is drawn, the look kept (Luke, 2026-10-25, round eight). Nearest first,
// never into a loop.
function hiddenJoins(S, { reach = 0.6, tol = 0.03, step = 0.02 } = {}) {
    const n = S.length;
    if (n < 2) return S;
    const cell = 0.1, grid = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    S.forEach(({ pts, k }, o) => {
        for (let i = 2; i < pts.length; i += 2) {
            const seg = [pts[i - 2], pts[i - 1], pts[i], pts[i + 1], k, o];
            for (let cx = Math.floor((Math.min(seg[0], seg[2]) - tol) / cell); cx <= Math.floor((Math.max(seg[0], seg[2]) + tol) / cell); cx++) {
                for (let cy = Math.floor((Math.min(seg[1], seg[3]) - tol) / cell); cy <= Math.floor((Math.max(seg[1], seg[3]) + tol) / cell); cy++) {
                    const kk = key(cx, cy);
                    if (!grid.has(kk)) grid.set(kk, []);
                    grid.get(kk).push(seg);
                }
            }
        }
    });
    const off = (x, y, s) => {
        const dx = s[2] - s[0], dy = s[3] - s[1], L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / L)) : 0;
        return Math.hypot(x - s[0] - t * dx, y - s[1] - t * dy);
    };
    const covered = (x, y, k, a, b) => (grid.get(key(Math.floor(x / cell), Math.floor(y / cell))) ?? []).some((s) => s[5] !== a && s[5] !== b && s[4] >= k - 1e-9 && off(x, y, s) < tol);
    const end = (o, e) => { const p = S[o].pts; return e ? [p[p.length - 2], p[p.length - 1]] : [p[0], p[1]]; };
    const cands = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (S[a].k !== S[b].k) continue;
        for (const ea of [0, 1]) for (const eb of [0, 1]) {
            const [x0, y0] = end(a, ea), [x1, y1] = end(b, eb), d = Math.hypot(x1 - x0, y1 - y0);
            if (d >= reach) continue;
            let hidden = true;
            for (let s = step; s < d - step && hidden; s += step) hidden = covered(x0 + ((x1 - x0) * s) / d, y0 + ((y1 - y0) * s) / d, S[a].k, a, b);
            if (hidden) cands.push({ d, a, ea, b, eb });
        }
    }
    cands.sort((p, q) => p.d - q.d);
    const link = new Map(), root = [...Array(n).keys()];
    const find = (x) => (root[x] === x ? x : (root[x] = find(root[x])));
    for (const c of cands) {
        const ka = `${c.a}:${c.ea}`, kb = `${c.b}:${c.eb}`;
        if (link.has(ka) || link.has(kb) || find(c.a) === find(c.b)) continue;
        root[find(c.a)] = find(c.b);
        link.set(ka, [c.b, c.eb]);
        link.set(kb, [c.a, c.ea]);
    }
    const rev = (p) => { const o = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i], p[i + 1]); return o; };
    const done = new Array(n).fill(false), out = [];
    for (let o = 0; o < n; o++) {
        if (done[o]) continue;
        // (back to the chain's free end, then along it)
        let so = o, se = 0;
        while (link.has(`${so}:${se}`)) { const [po, pe] = link.get(`${so}:${se}`); so = po; se = 1 - pe; }
        const pts = [];
        for (let co = so, ce = se; ;) {
            done[co] = true;
            pts.push(...(ce === 0 ? S[co].pts : rev(S[co].pts)));
            const nx = link.get(`${co}:${1 - ce}`);
            if (!nx) break;
            [co, ce] = nx;
        }
        out.push({ k: S[o].k, pts });
    }
    return out;
}
const TIDIED = new WeakMap();
// (`rot`: the turn it is laid at, radians, over its own small tilt; Luke
// 2026-10-25, the doodles window's turn and Ctrl+wheel)
// (`flip`: mirrored across its upright axis, its turn kept; Luke 2026-10-25)
function doodlePaths(kind, seed, { x = 0, y = 0, size = 1, turn = null, rot = 0, flip = false } = {}) {
    const make = DOODLES[kind];
    if (!make) return [];
    const r = rng(`doodle:${seed}`);
    // (a drawing that stands upright, a place on a map: only a hair of tilt;
    // `steady`, a surveyor's hand, wavering less; Luke 2026-10-25)
    const a = (turn ?? (r() - 0.5) * 0.45 * (make.upright ? 0.25 : 1)) + (Number(rot) || 0);
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    // (a doodle's tidied shapes worked out once, kept: Luke 2026-10-25, round eight)
    if (!TIDIED.has(make)) TIDIED.set(make, fitShapes(tidyShapes(make(r))));
    return TIDIED.get(make).map(({ pts: poly, k }) => {
        const h = humanize(poly, r, make.steady ?? 1);
        const f = flip ? -1 : 1;
        const out = [];
        for (let i = 0; i < h.length; i += 2) out.push(x + (f * h[i] * cs - h[i + 1] * sn) * size, y + (f * h[i] * sn + h[i + 1] * cs) * size);
        return { pts: out, k };
    });
}

// A doodle laid on the sheet (board px): strokes { c, w, b, o, pts }. `w` is
// the brush's width at the palette's middle size (DOODLE_SIZE); the line
// thickens and thins with the doodle, so it reads the same small or large
// (Luke, 2026-10-06)
export const DOODLE_SIZE = 50;
const doodleWidth = (w, size) => Math.max(1.5, Math.round(w * (size / DOODLE_SIZE) * 10) / 10);
// (`saved`: a drawing a user kept, savedDoodleOf: laid as it was drawn, in
// its own paints and widths, sized and turned; Luke 2026-10-25)
export function doodleBoard(kind, seed, { x, y, size = DOODLE_SIZE, rot = 0, c = 1, w = 8, b = 1, o = 0.85, n = null, saved = null, flip = false } = {}) {
    if (saved) return savedDoodleBoard(saved, { x, y, size, rot, flip });
    const ww = doodleWidth(w, size);
    return doodlePaths(kind, seed, { x, y, size, rot, flip }).map(({ pts, k }) => cleanStroke({ c, w: Math.max(1, Math.round(ww * k * 10) / 10), b, o, n, pts: pts.map((v) => Math.round(v * 10) / 10) })).filter(Boolean);
}

/* -------------------------------------------- */
/*  Saved drawings (Luke, 2026-10-25)           */
/* -------------------------------------------- */

// A user's own doodles: strokes picked with Move, kept on their user (the
// host's) to lay again anywhere, each stroke in its own paint, brightness,
// opacity, and width. Kept as { strokes: [{ c, b?, o?, w, pts }] }, every
// point in the doodle's own frame (its widest half-width one, centred) and
// each width against that half-width.
export const SAVED_MAX = 24;
const SAVED_PTS = 6000;
export const isSavedKind = (kind) => String(kind ?? '').startsWith('saved:');

// strokes (board px: { c, b, o, w, pts }) as a drawing to keep, or null
export function savedDoodleOf(strokes) {
    const list = (strokes ?? []).filter((st) => Array.isArray(st?.pts) && st.pts.length >= 4);
    if (!list.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of list) for (let i = 0; i < st.pts.length; i += 2) { x0 = Math.min(x0, st.pts[i]); x1 = Math.max(x1, st.pts[i]); y0 = Math.min(y0, st.pts[i + 1]); y1 = Math.max(y1, st.pts[i + 1]); }
    const half = Math.max(4, (x1 - x0) / 2, (y1 - y0) / 2);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const k = 0.95 / half;
    let n = 0;
    const out = [];
    for (const st of list) {
        // (a long drawing thinned to every other point, within its budget)
        const step = st.pts.length / 2 > 400 ? 2 : 1;
        const pts = [];
        for (let i = 0; i < st.pts.length; i += 2 * step) pts.push(Math.round((st.pts[i] - cx) * k * 1000) / 1000, Math.round((st.pts[i + 1] - cy) * k * 1000) / 1000);
        if (pts.length < 4) continue;
        n += pts.length;
        if (n > SAVED_PTS) break;
        out.push({ c: st.c ?? 0, ...(st.b === undefined ? {} : { b: st.b }), ...(st.o === undefined ? {} : { o: st.o }), ...nibOf(st.n, st.fill), w: Math.round(Math.max(0.5, st.w ?? 6) * k * 10000) / 10000, pts });
    }
    return out.length ? cleanSavedDoodle({ strokes: out }) : null;
}

// a kept drawing as read back (a user's flag: anyone's to have written), or null
export function cleanSavedDoodle(d) {
    let n = 0;
    const strokes = [];
    for (const st of Array.isArray(d?.strokes) ? d.strokes : []) {
        const pts = (Array.isArray(st?.pts) ? st.pts : []).map(Number).filter(Number.isFinite).map((v) => clamp(v, -1.5, 1.5));
        if (pts.length < 4 || pts.length % 2 || n + pts.length > SAVED_PTS) continue;
        n += pts.length;
        strokes.push({
            c: clamp(Math.round(num(st.c, 0)), 0, MAX_INKS - 1), w: clamp(num(st.w, 0.1), 0.005, 1), pts,
            ...(st.o === undefined || st.o === null ? {} : { o: clamp(num(st.o, 0.85), 0.05, 1) }),
            ...(st.b === undefined || st.b === null ? {} : { b: clamp(Math.round(num(st.b, 1)), 0, BRIGHT_MAX) }),
            ...nibOf(st.n, st.fill),
        });
        if (strokes.length >= 200) break;
    }
    return strokes.length ? { strokes } : null;
}

// a user's kept drawings ({ id: drawing }), cleaned, at most SAVED_MAX
export function cleanSavedDoodles(all) {
    const out = {};
    for (const [id, d] of Object.entries(all && typeof all === 'object' ? all : {})) {
        if (!/^[a-z0-9]{1,16}$/i.test(id) || Object.keys(out).length >= SAVED_MAX) continue;
        const c = cleanSavedDoodle(d);
        if (c) out[id] = { ...c, ...(Number.isFinite(d?.at) ? { at: d.at } : {}) };
    }
    return out;
}

// a kept drawing laid at x, y, `size` its half-width, turned `rot`
function savedDoodleBoard(saved, { x, y, size = DOODLE_SIZE, rot = 0, flip = false }) {
    const cs = Math.cos(rot || 0);
    const sn = Math.sin(rot || 0);
    return (saved?.strokes ?? []).map((st) => {
        const pts = [];
        for (let i = 0; i < st.pts.length; i += 2) {
            const u = st.pts[i] * size * (flip ? -1 : 1);
            const v = st.pts[i + 1] * size;
            pts.push(Math.round((x + u * cs - v * sn) * 10) / 10, Math.round((y + u * sn + v * cs) * 10) / 10);
        }
        return cleanStroke({ c: st.c, w: Math.max(1, st.w * size), ...(st.b === undefined ? {} : { b: st.b }), o: st.o ?? 0.85, n: st.n, fill: st.fill, pts });
    }).filter(Boolean);
}

// A doodle laid on a card (card units: its width at size 1 is one), at
// (u, v), `size` across, in a paint, as its owner's strokes ({ id: stroke })
export function doodleStrokes(kind, seed, { u = 0, v = 0, size = 0.16, c = 1, w = 7, by = null, b = 1 } = {}) {
    const out = {};
    doodlePaths(kind, seed, { x: u, y: v, size }).forEach(({ pts, k }, i) => {
        const st = cleanStroke({ by, c, w: w * k, b, pts }, { card: true });
        if (st) out[`d${i + 1}`] = st;
    });
    return out;
}

// the signs a card may come seasoned with: the lighter ones, a few strokes
// each (the ornate are the GM's to lay by hand; Luke 2026-10-25)
const SEASON_SIGNS = ['love', 'sun', 'moon', 'flame', 'dagger', 'pentacle', 'crown', 'hand', 'spider', 'rat', 'crow', 'gear', 'potion', 'book'];
// the paints a doodle comes in on a card, clear on paper: blood, soot, rust, brown
const DOODLE_PAINTS = [1, 12, 1, 2, 13];

// Whether a card comes with a doodle, and which (Luke, 2026-10-06: seasoned
// onto notes and cards; his brush's own weight, about): about a card in four,
// by its key; its strokes, or {}
export function seasonMarks(key, { by = null, type = 'note' } = {}) {
    const r = rng(`season:${key}`);
    if (r() > (type === 'note' ? 0.3 : 0.2)) return {};
    // (a sign, not a place, and one of the lighter: Luke 2026-10-25)
    const kind = SEASON_SIGNS[Math.floor(r() * SEASON_SIGNS.length)];
    return doodleStrokes(kind, key, {
        u: (r() - 0.5) * 0.45, v: (r() - 0.5) * 0.45, size: 0.12 + r() * 0.1,
        c: DOODLE_PAINTS[Math.floor(r() * DOODLE_PAINTS.length)], w: 6 + r() * 2.5, by, b: r() < 0.5 ? 1 : 0,
    });
}

/* -------------------------------------------- */
/*  History (Luke, 2026-10-06)                  */
/* -------------------------------------------- */

// An edit kept as what it changed, path by path, so it can be undone (or
// done again) by itself: never a whole board put back over what others have
// done since. A record is { ops: [{ path, b?, a? }] }: each op a path into the
// board's JSON and its value before (b) and after (a), a missing key meaning
// it wasn't there. Values are whole only where one side had nothing there;
// otherwise the paths go down to plain values and arrays.
const BOARD_KEYS = ['scraps', 'links', 'pins', 'marks', 'bits', 'decor', 'bin', 'sheet'];
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// (a key no board holds, never followed: Luke, 2026-10-21, a record sent
// through the relay with a path through __proto__ wrote onto every object on
// the GM's client)
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
export const safePath = (path) => Array.isArray(path) && path.length > 0 && path.every((k) => typeof k === 'string' && k !== '' && !UNSAFE.has(k));
const getAt = (o, path) => path.reduce((v, k) => (v && typeof v === 'object' && Object.hasOwn(v, k) ? v[k] : undefined), o);
// (the collections whose items are whole things: a record's op inside one
// that is gone since, a card someone took off, is let go, never a blank one
// made: Luke, 2026-10-21)
const ITEMS = new Set(['scraps', 'links', 'pins', 'bits', 'bin']);
function setAt(o, path, has, v) {
    if (!safePath(path)) return;
    if (path.length > 2 && ITEMS.has(path[0]) && !isPlain(o?.[path[0]]?.[path[1]])) return;
    let at = o;
    for (const k of path.slice(0, -1)) {
        if (!isPlain(at[k])) {
            if (!has) return;
            at[k] = {};
        }
        at = at[k];
    }
    const last = path[path.length - 1];
    if (has) at[last] = copy(v);
    else delete at[last];
}

function diffInto(ops, path, a, b) {
    if (!safePath(path) || sameJSON(a, b)) return;
    if (isPlain(a) && isPlain(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffInto(ops, [...path, k], a[k], b[k]);
        return;
    }
    const op = { path };
    if (a !== undefined) op.b = copy(a);
    if (b !== undefined) op.a = copy(b);
    ops.push(op);
}

// What changed between two boards' JSON: everywhere, or only under `roots`
// (paths: what an edit touched)
export function diffBoard(before = {}, after = {}, roots = null) {
    const ops = [];
    const list = roots ? roots.filter((p, i) => !roots.some((q, j) => j !== i && q.length < p.length && q.every((k, n) => k === p[n])) && !roots.slice(0, i).some((q) => sameJSON(q, p))) : BOARD_KEYS.map((k) => [k]);
    for (const p of list) diffInto(ops, p, getAt(before, p), getAt(after, p));
    return { ops };
}

// Records one after another, as one
export const mergeRecords = (list) => ({ ops: (list ?? []).flatMap((r) => r?.ops ?? []) });

// A board as a record leaves it: undone ('before') or done ('after')
export function recordTarget(board, rec, side = 'before') {
    const out = copy(board ?? {});
    const key = side === 'before' ? 'b' : 'a';
    const ops = side === 'before' ? [...(rec?.ops ?? [])].reverse() : rec?.ops ?? [];
    for (const op of ops) setAt(out, op.path, key in op, op[key]);
    return out;
}

// The scene update that takes a board to where a record says (`prefix`: the
// board's place in the scene's data), one key per path: a value set, or
// '-=' taking a key away
export function recordUpdate(board, rec, side = 'before', prefix = 'flags.heart.board') {
    const target = recordTarget(board, rec, side);
    const { ops } = diffBoard(board ?? {}, target, (rec?.ops ?? []).map((o) => o.path));
    const data = {};
    for (const op of ops) {
        const head = [prefix, ...op.path.slice(0, -1)].join('.');
        if ('a' in op) data[`${head}.${op.path[op.path.length - 1]}`] = op.a;
        else data[`${head}.-=${op.path[op.path.length - 1]}`] = null;
    }
    return data;
}

// The roots an update's keys touch (each 'flags.heart.board.<coll>.<id>...'),
// or null when it replaces the whole board
export function updateRoots(data, prefix = 'flags.heart.board') {
    const roots = [];
    for (const k of Object.keys(data ?? {})) {
        if (k === prefix) return null;
        if (!k.startsWith(`${prefix}.`)) continue;
        const parts = k.slice(prefix.length + 1).split('.').map((s) => s.replace(/^-=/, ''));
        const deep = parts[0] === 'marks' ? 3 : parts[0] === 'decor' ? 1 : 2;
        roots.push(parts.slice(0, deep));
    }
    return roots;
}

/* -------------------------------------------- */
/*  The bin (Luke, 2026-10-06)                  */
/* -------------------------------------------- */

// Cards (text and pictures, irreplaceable) are never deleted outright: taken
// off the board they go to the board's bin with their pins and strings, the
// newest BIN_MAX kept, and can be put back. bin: { key: { at, by, scrap,
// pins, links } }.
// (200 since 2026-10-25, the map safety fixes: 60 let a busy campaign's
// oldest cards go; the GM is told when one is, binLetGo)
export const BIN_MAX = 200;
// the cards a bin patch lets go, the oldest, to make room
export const binLetGo = (patch) => Object.values(patch?.bin ?? {}).filter((e) => e === null).length;

// The patch taking cards off into the bin (with what goes with them)
export function binPatch(raw, keys, { at = Date.now(), by = null } = {}) {
    const r = removalOf(raw, { scraps: keys });
    if (!r.scraps.length) return null;
    const bin = {};
    const owner = (id) => r.scraps.find((k) => raw.pins?.[id]?.on === k);
    const placed = new Set();
    for (const k of r.scraps) bin[k] = { at, by, scrap: copy(raw.scraps[k]), pins: {}, links: {} };
    for (const id of r.pins) {
        const k = owner(id);
        if (k) bin[k].pins[id] = copy(raw.pins[id]);
    }
    for (const id of r.links) {
        const l = raw.links?.[id];
        if (!l) continue;
        const k = r.scraps.find((s) => l.a === s || l.b === s || bin[s].pins[l.aPin] || bin[s].pins[l.bPin]);
        if (k && !placed.has(id)) {
            bin[k].links[id] = copy(l);
            placed.add(id);
        }
    }
    // (other strings run through its pins lose those joints: each card keeps
    // the string's joints and pulls as they were, so putting it back puts them
    // back, unbinPatch; Luke, 2026-10-21)
    for (const id of Object.keys(r.edits)) {
        const l = raw.links?.[id];
        for (const j of l?.joints ?? []) {
            const k = j?.pin ? owner(j.pin) : null;
            if (k) (bin[k].joints ??= {})[id] = { was: copy(l.joints), pulls: copy(l.pulls ?? []) };
        }
    }
    // (the oldest let go past BIN_MAX; a card already in the bin under a key
    // going in now is replaced, never let go in place of the new one: Luke,
    // 2026-10-21, a full bin dropped the card just taken off)
    const all = Object.entries(raw.bin ?? {}).filter(([k]) => !bin[k]).sort((x, y) => (x[1]?.at ?? 0) - (y[1]?.at ?? 0));
    const over = all.length + r.scraps.length - BIN_MAX;
    for (let i = 0; i < over; i++) bin[all[i][0]] = null;
    return {
        scraps: Object.fromEntries(r.scraps.map((k) => [k, null])),
        pins: Object.fromEntries(r.pins.map((id) => [id, null])),
        links: { ...Object.fromEntries(r.links.map((id) => [id, null])), ...r.edits },
        bin,
    };
}

// Things taken off the board at once, as one patch (Luke, 2026-10-21: one
// copy for both hosts, one edit to undo): cards into the bin with their pins
// and strings (binPatch), then the pins and strings asked for, with what
// depends on them (removalOf: a pin's strings; joints it held let go). Null
// when nothing goes.
export function takeOffPatch(raw, { scraps = [], pins = [], links = [] } = {}, { at = Date.now(), by = null } = {}) {
    const binned = scraps.length ? binPatch(raw, scraps, { at, by }) : null;
    const after = binned ? applyPatch(copy(raw), binned) : raw;
    const r = removalOf(after, { pins, links });
    const out = {
        scraps: { ...(binned?.scraps ?? {}) },
        pins: { ...(binned?.pins ?? {}), ...Object.fromEntries(r.pins.map((id) => [id, null])) },
        links: { ...(binned?.links ?? {}), ...r.edits, ...Object.fromEntries(r.links.map((id) => [id, null])) },
        ...(binned ? { bin: binned.bin } : {}),
    };
    return Object.keys(out.scraps).length + Object.keys(out.pins).length + Object.keys(out.links).length ? out : null;
}

// A patch of new strokes alone (a stroke laid, a doodle), each given an id
// free on `board`, the board as it is when the patch is written (Luke,
// 2026-10-25: ids picked from a board behind it took strokes already there)
export function freshStrokeIds(board, patch) {
    const out = {};
    const give = (taken, strokes, put) => {
        for (const st of Object.values(strokes ?? {})) {
            if (!st) continue;
            const id = customKey('m', taken);
            taken[id] = 1;
            put(id, st);
        }
    };
    for (const [layer, strokes] of Object.entries(patch?.marks ?? {})) {
        give({ ...(board?.marks?.[layer] ?? {}) }, strokes, (id, st) => { ((out.marks ??= {})[layer] ??= {})[id] = st; });
    }
    for (const [key, sp] of Object.entries(patch?.scraps ?? {})) {
        give({ ...(board?.scraps?.[key]?.marks ?? {}) }, sp?.marks, (id, st) => { ((out.scraps ??= {})[key] ??= { marks: {} }).marks[id] = st; });
    }
    return out;
}

// A doodle laid down (Luke, 2026-10-06; one copy for both hosts, 2026-10-21):
// on the card under it (its own strokes, in its frame) or on the sheet in the
// layer of whoever placed it (`me`), in the brush's paint, brightness, width,
// and opacity (`brush`: { size, c, w, b, o }). Returns the patch.
// (`a.rot`: its turn; `a.saved`: a kept drawing, cleanSavedDoodle; Luke 2026-10-25)
export function doodlePatch(raw, view, a, brush, look, me) {
    const strokes = doodleBoard(a.kind, a.seed ?? `${a.kind}:${Date.now()}`, { x: a.at.x, y: a.at.y, size: brush.size, rot: a.rot ?? 0, flip: Boolean(a.flip), c: brush.c, w: Math.min(brush.w, markMax(look, brush.n)), b: brush.b, o: brush.o, n: brush.n, saved: a.saved ? cleanSavedDoodle(a.saved) : null });
    const card = a.on ? view?.scraps?.find((x) => x.key === a.on) ?? null : null;
    const have = { ...((card ? raw?.scraps?.[card.key]?.marks : raw?.marks?.[me]) ?? {}) };
    const marks = {};
    for (const st of strokes) {
        const id = customKey('m', have);
        have[id] = 1;
        marks[id] = card ? { ...strokeToCard(st, card, look), by: me } : st;
    }
    return card ? { scraps: { [card.key]: { marks } } } : { marks: { [me]: marks } };
}

// The brush's stroke through `pts` (board px), in its paint, width (never
// past markMax), opacity, and brightness (`brush`: { c, w, o, b }): the
// stroke being drawn and the one laid down alike
export const brushStroke = (brush, look, pts) => ({ c: brush?.c ?? 0, w: Math.min(brush?.w ?? 8, markMax(look, brush?.n)), o: brush?.o ?? 0.85, b: brush?.b ?? 1, ...nibOf(brush?.n, brush?.fill), pts });

// A brush stroke laid down (Luke, 2026-10-03; one copy for both hosts,
// 2026-10-21): begun on a card (a.on), the card's own, in its frame, by
// whoever drew it (`me`); else on the sheet in their layer. Returns
// { on, stroke, patch }: `on` the card it went on (null: the sheet), `stroke`
// as written (what a player sends the GM).
export function strokePatch(raw, view, a, brush, look, me) {
    const st = brushStroke(brush, look, a.pts);
    const card = a.on ? view?.scraps?.find((x) => x.key === a.on) ?? null : null;
    const onCard = card ? strokeToCard(st, card, look) : null;
    if (onCard) {
        const stroke = { ...onCard, by: me };
        return { on: card.key, stroke, patch: { scraps: { [card.key]: { marks: { [customKey('m', raw?.scraps?.[card.key]?.marks ?? {})]: stroke } } } } };
    }
    return { on: null, stroke: st, patch: { marks: { [me]: { [customKey('m', raw?.marks?.[me] ?? {})]: st } } } };
}

// Whole strokes rubbed out (`list`: [[layer or '@' + a card's key, id]]), as
// one patch, those not on the board passed over (Luke, 2026-10-25: one copy
// for both hosts, as strokePatch). Null when none is there.
export function unmarkPatch(raw, list) {
    const out = { marks: {}, scraps: {} };
    let any = false;
    for (const [layer, id] of list ?? []) {
        const where = String(layer);
        if (where.startsWith('@')) {
            const key = where.slice(1);
            if (!raw?.scraps?.[key]?.marks?.[id]) continue;
            ((out.scraps[key] ??= { marks: {} }).marks)[id] = null;
        } else {
            if (!raw?.marks?.[where]?.[id]) continue;
            (out.marks[where] ??= {})[id] = null;
        }
        any = true;
    }
    return any ? out : null;
}

// the word for what a card is, as Delete names it (Luke, 2026-10-25:
// "Delete note"): 'writing', 'note', 'place', or 'card'
export const cardWord = (type) => (type === 'scrawl' ? 'writing' : type === 'note' ? 'note' : type === 'landmark' ? 'place' : 'card');

// The patch putting a binned card back, with its pins and the strings whose
// other ends are still there (any of its ids now taken by something else
// given a new one)
export function unbinPatch(raw, key) {
    const e = raw.bin?.[key];
    if (!e?.scrap) return null;
    const scraps = { ...(raw.scraps ?? {}) };
    const pinsNow = { ...(raw.pins ?? {}) };
    const linksNow = { ...(raw.links ?? {}) };
    const k = scraps[key] ? customKey(e.scrap.type === 'note' ? 'n' : e.scrap.type === 'scrawl' ? 'w' : 'c', keysTaken(raw)) : key;
    const pinId = {};
    const newPins = {};
    // (a new id never one of the entry's own still to come back: Luke
    // 2026-10-25, pin3 given pin4 was overwritten by the entry's own pin4)
    for (const [id, p] of Object.entries(e.pins ?? {})) {
        const nid = pinsNow[id] ? customKey('pin', { ...pinsNow, ...newPins, ...e.pins }) : id;
        pinId[id] = nid;
        newPins[nid] = { ...p, ...(p.on === key ? { on: k } : {}) };
    }
    const there = (end, pin) => (pin ? Boolean(pinId[pin] || pinsNow[pin]) : end ? end === key || Boolean(scraps[end]) : true);
    const newLinks = {};
    const bin = { [key]: null };
    const fix = (v) => (v === key ? k : v);
    const pin = (v) => (v ? pinId[v] ?? v : v);
    // (a string to a card still in the bin waits in that card's entry, its
    // ends here as they are now: Luke, 2026-10-21, two cards binned together
    // lost the string between them when one came back first)
    const holder = (l) => Object.keys(raw.bin ?? {}).find((ok) => ok !== key && raw.bin[ok]?.scrap && ([l.a, l.b].includes(ok) || [l.aPin, l.bPin].some((p) => p && raw.bin[ok].pins?.[p])));
    for (const [id, l] of Object.entries(e.links ?? {})) {
        const moved = { ...l, a: fix(l.a ?? null), b: fix(l.b ?? null), aPin: pin(l.aPin ?? null), bPin: pin(l.bPin ?? null), joints: (l.joints ?? []).map((j) => (j?.pin ? { pin: pin(j.pin) } : j)) };
        if (!there(l.a, l.aPin) || !there(l.b, l.bPin)) {
            const ok = holder(l);
            if (ok) {
                const o = (bin[ok] ??= copy(raw.bin[ok]));
                o.links = { ...(o.links ?? {}), [id]: moved };
            }
            continue;
        }
        const nid = linksNow[id] ? customKey('l', { ...linksNow, ...newLinks, ...e.links }) : id;
        newLinks[nid] = { ...moved, joints: moved.joints.filter((j) => !j?.pin || newPins[j.pin] || pinsNow[j.pin]) };
    }
    // (the joints other strings ran through its pins, put back in those
    // strings where they still are, on the board or waiting in another card's
    // entry: Luke, 2026-10-21)
    const links = {};
    const mine = (pid) => Boolean(e.pins?.[pid]);
    for (const [id, kept] of Object.entries(e.joints ?? {})) {
        if (linksNow[id]) {
            const back = rejoin(linksNow[id], kept, mine, pin);
            if (back) links[id] = back;
            continue;
        }
        const ok = Object.keys(raw.bin ?? {}).find((o) => o !== key && (bin[o] ?? raw.bin[o])?.links?.[id]);
        if (!ok) continue;
        const o = (bin[ok] ??= copy(raw.bin[ok]));
        const back = rejoin(o.links[id], kept, mine, pin);
        if (back) o.links = { ...o.links, [id]: { ...o.links[id], ...back } };
    }
    return { newScraps: { [k]: copy(e.scrap) }, pins: newPins, newLinks, bin, ...(Object.keys(links).length ? { links } : {}) };
}

// A string's joints through a card's pins put back (unbinPatch): `kept` is
// { was, pulls }, its joints and pulls when the card came off; `mine` says
// whether a pin is the card's, `mapPin` its id now. Each joint goes back
// after the joint it followed (else at its old place), unless the string
// already runs through that pin; the pulls come back only when the string is
// whole as it was. Returns { joints, pulls }, or null when nothing changes.
function rejoin(l, kept, mine, mapPin) {
    const was = Array.isArray(kept?.was) ? kept.was : [];
    const as = (j) => (j?.pin && mine(j.pin) ? { ...j, pin: mapPin(j.pin) } : j);
    const out = [...(l?.joints ?? [])];
    let any = false;
    was.forEach((j, i) => {
        if (!j?.pin || !mine(j.pin) || out.some((x) => x?.pin === mapPin(j.pin))) return;
        let at = Math.min(i, out.length);
        for (let p = i - 1; p >= 0; p--) {
            const n = out.findIndex((x) => sameJSON(x, as(was[p])));
            if (n >= 0) {
                at = n + 1;
                break;
            }
        }
        out.splice(at, 0, as(j));
        any = true;
    });
    if (!any) return null;
    return { joints: out, pulls: sameJSON(out, was.map(as)) ? copy(kept.pulls ?? []) : [] };
}

// What the bin holds, newest first: [{ key, at, by, type, name }]
export function binList(raw, look = null) {
    return Object.entries(raw?.bin ?? {}).filter(([, e]) => e?.scrap).map(([key, e]) => ({
        key, at: e.at ?? 0, by: e.by ?? null, type: e.scrap.type ?? 'landmark',
        name: e.scrap.name || (e.scrap.lib ? look?.library?.[e.scrap.lib]?.name : '') || e.scrap.text || key,
    })).sort((a, b) => b.at - a.at);
}
