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
// a palette: up to MAX_INKS colours (the defaults if none read)
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
        marker: ['#e9dfc8', '#d4483a', '#e07a3a', '#e3b54a', '#c9c75a', '#8fbf5a', '#4fb3a0', '#6aa6e0', '#7a78e0', '#b07ad8', '#e070a0', '#6f6a65', '#3a3431', '#9a6a40'],
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
    // (Luke, 2026-10-03: half again as thick, more prominent)
    string: { w: 6, slack: 100 },
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
    return {
        v: LOOK_VERSION, w, h, library, pinTune,
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
            paper: inks(j.ink?.paper, D.ink.paper), sheet: inks(j.ink?.sheet, D.ink.sheet), marker: inks(j.ink?.marker, D.ink.marker),
        },
        scrap: { w: clamp(num(j.scrap?.w, D.scrap.w), 120, 800) },
        grime: Object.fromEntries(['scraps', 'sheet', 'blood', 'stitches', 'mends', 'damp'].map((k) => [k, clamp(num(j.grime?.[k], D.grime[k]), 0, 100)])),
        pools: { papers: strList(p.papers, []), notes: strList(p.notes, []), pins: strList(p.pins, []), tapes: strList(p.tapes, []), stains: strList(p.stains, []), ends: Object.fromEntries(['delve', 'rail', 'path'].map(k => [k, strList(p.ends?.[k], [])])) },
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
export function tunePins(tune = {}) {
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
export const KIND_TINT = { delve: 0xc0442f, rail: 0x8f86da, path: null };
const PLAIN_PIN = (tex) => !/red_|violet_|brass_|bone_/.test(String(tex ?? ''));
export function pinTint(look, l, tex) {
    if (l?.color !== null && l?.color !== undefined) return look.ink.marker?.[l.color] ?? null;
    const t = KIND_TINT[l?.kind];
    return t !== null && t !== undefined && PLAIN_PIN(tex) && (look.pools.ends?.[l.kind] ?? []).includes(tex) ? t : null;
}
// A pin stands mostly upright (Luke, 2026-10-02): it turns only part of the
// way with the paper it is in, plus a little of its own tilt (radians)
export const UPRIGHT = 0.3;
export const pinTurn = (paperRot, own = 0) => paperRot * UPRIGHT + own;

// a landmark's clipping's area, against the card's unit squared (its shape the art's)
const CLIP_AREA = 0.42;

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
// 11 inches tall; board px per inch
export const pxPerInch = (look) => look.h / Math.max(1, look.sheet.folds.rows) / 11;

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
export const DEFAULT_SAFE = [0.06, 0.06, 0.94, 0.94];
// below this much solid paper (diagonal tears, notches), a paper isn't used
// for scraps or panels
export const MIN_COVER = 0.4;
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
        const base = { id, tex: String(p.tex), s: p.s === undefined || p.s === null ? null : Math.max(0.001, num(p.s, 1)), r: p.r === undefined || p.r === null ? null : num(p.r, 0), state: p.state === 'hidden' ? 'hidden' : 'known', author: p.author ? String(p.author) : null };
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
        bits[id] = { id, tex: String(b.tex), ...pointAt(b), w: clamp(num(b.w, 40), 4, 3000), r: num(b.r, 0), flip: Boolean(b.flip), alpha: clamp(num(b.alpha, 1), 0.05, 1) };
    }
    return { scraps, links, pins, marks, bits, decor: normalizeDecor(j.decor) };
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
        // its brightness (Luke, 2026-10-06): 0 dim (soaked in, as the brush
        // first was), 1 as it is (the default), 2 bright
        ...(m.b === undefined || m.b === null ? {} : { b: clamp(Math.round(num(m.b, 1)), 0, BRIGHT_MAX) }),
    };
}
export const BRIGHT_MAX = 2;
// the brush's paints in the palette's order: Bone, the greys, Brown, then the
// colours (Luke, 2026-10-06: named and sorted)
export const PAINT_ORDER = [0, 11, 12, 13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
export const PAINT_NAMES = ['Bone', 'Blood', 'Rust', 'Ochre', 'Moss', 'Leaf', 'Verdigris', 'Sky', 'Indigo', 'Violet', 'Rose', 'Iron', 'Soot', 'Brown'];
export const BRIGHT_MIX = [[0x000000, 0.42], null, [0xffffff, 0.16]];
export const brushColor = (c, b = 1) => { const m = BRIGHT_MIX[Math.max(0, Math.min(BRIGHT_MAX, b ?? 1))]; return m ? mixColor(c, m[0], m[1]) : c; };

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
    return { by: st.by ?? null, c: st.c, w: st.w * (vs.s ?? 1), ...(st.o === undefined ? {} : { o: st.o }), ...(st.b === undefined ? {} : { b: st.b }), pts };
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

export function scrapLayout(scrap, look, size, measure, libEntry = null) {
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
    // a name tag is a ticket stub, sized to its writing
    const tagged = scrap.type === 'note' && scrap.tag;
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
    const out = { key: scrap.key, seedKey: sk, depth, rumour, font, ink, paper: { tex: paperTex, cx: pc.x, cy: pc.y, w: PW, h: PH, rot, turn, flip }, box: { cx: scrap.x, cy: scrap.y, w: W, h: H, rot } };
    out.hull = place([-PW / 2, -PH / 2, PW / 2, -PH / 2, PW / 2, PH / 2, -PW / 2, PH / 2], pc.x, pc.y, rot);

    const handPx = tagged ? tagPx : Math.round((isNote ? notePx : unit * 0.15 * fk) * (parts.text?.s ?? 1));
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
        // (a note's writing in the middle of its paper, a little high: Luke
        // 2026-10-06, it hung from the top whatever the paper's shape)
        else if (!boxH) {
            const n = wrapText(scrap.text || '...', (t) => measure(t, handPx), textW).length;
            top = clamp(-(n * handPx * 0.95) / 2 - H * 0.05, -H / 2 + H * 0.07, H / 2 - H * 0.07 - n * handPx * 0.95);
        }
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
    return { viewer: gm ? 'gm' : 'player', scraps, links, pins: shown, marks: board.marks ?? {}, bits, decor: board.decor };
}

// The players' strings alone (Luke, 2026-10-06: a view of just theirs): every
// string a player made, with the threads their names hang by; the GM's
// strings gone, with their name tags, and the pins only those held
export function onlyPlayersStrings(view) {
    const keep = new Set(view.links.filter((l) => l.author).map((l) => l.id));
    for (const l of view.links) if (keep.has(l.id)) for (const t of l.threads ?? []) keep.add(t);
    const gone = view.links.filter((l) => !keep.has(l.id));
    const tags = new Set(gone.map((l) => l.nameNote).filter(Boolean));
    const links = view.links.filter((l) => keep.has(l.id));
    const used = new Set(links.flatMap((l) => [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j.shared)]).filter(Boolean));
    const held = new Set(gone.flatMap((l) => [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j.shared)]).filter(Boolean));
    return {
        ...view,
        links,
        scraps: view.scraps.filter((s) => !tags.has(s.key)),
        pins: (view.pins ?? []).filter((p) => used.has(p.id) || !held.has(p.id)),
    };
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
    // (a name tag lies over the strings)
    for (let i = view.scraps.length - 1; i >= 0; i--) if (view.scraps[i].tag && pointInPoly(pt, view.scraps[i].layout.hull)) return { kind: 'scrap', item: view.scraps[i] };
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
export const TAG_PAPER = 'tx/paper__strip__paper_ticket_stub_rose_strip';

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
export function labelPatch(raw, id, label, look, size, measure, { at = null, tag = null, author = null } = {}) {
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
    const by = author ? { author } : {};
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

// A new string: a pin at each end (one already there, or one made where the
// end was asked for: stuck in the scrap under it, else loose), and the string
// between them; `prep` first (a pin it shares, made). Returns { id, patch }.
export function newStringPatch(raw, act, kind, look, { color = null, author = null, state = 'known' } = {}) {
    const fam = look.pools.ends?.[kind]?.length ? look.pools.ends[kind] : look.pools.pins;
    const id = customKey('l', raw.links ?? {});
    const patch = { pins: { ...(act.prep?.pins ?? {}) }, links: { ...(act.prep?.links ?? {}) }, scraps: { ...(act.prep?.scraps ?? {}) } };
    const used = { ...(raw.pins ?? {}), ...patch.pins };
    // (one kind of pin a string, chosen when it is made; run on from a pin, that
    // pin's kind and size: Luke 2026-10-06)
    const from = used[act.aPin] ?? used[act.bPin] ?? null;
    const tex = from?.tex ?? pickFrom(fam, id) ?? 'tx/fixtures__fixture_grey_tack_small';
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
    patch.newLinks = { [id]: { kind, state: state === 'hidden' ? 'hidden' : 'known', aPin, bPin, ...(color === null || color === undefined ? {} : { color }), ...(author ? { author } : {}) } };
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
    return { board, changed };
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
const starPts = (r) => { const p = []; for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k % 5) * ((4 * Math.PI) / 5); p.push(Math.cos(a) * r, Math.sin(a) * r); } return p; };
export const DOODLES = {
    ring: (r) => { const a0 = r() * TAU; return [arcPts(0, 0, 1, 0.62, a0, a0 + TAU + 0.35 + r() * 0.3, 40)]; },
    loops: (r) => { const a0 = r() * TAU; return [[...arcPts(0, 0, 1, 0.6, a0, a0 + TAU, 36), ...arcPts(0.04, 0.03, 0.9, 0.52, a0, a0 + TAU * 0.85, 30)]]; },
    underline: () => [[-1, 0.05, -0.3, 0.1, 0.4, 0.06, 1, 0.12]],
    double: () => [[-1, -0.1, 0, -0.06, 1, -0.02], [-0.9, 0.16, 0, 0.2, 0.92, 0.22]],
    arrow: () => [[-1, 0.15, -0.2, 0.05, 0.85, -0.05], [0.45, -0.4, 0.88, -0.05, 0.42, 0.32]],
    // (an arc over and down, its head at its end along its last turn)
    swoop: () => [arcPts(0, 0.55, 0.95, 0.95, Math.PI * 1.05, Math.PI * 1.9, 20), [0.97, -0.08, 0.9, 0.26, 0.64, 0.03]],
    down: () => [[0.05, -1, 0, -0.2, 0.02, 0.85], [-0.35, 0.45, 0.02, 0.88, 0.38, 0.42]],
    question: () => [[...arcPts(0, -0.45, 0.5, 0.42, Math.PI * 1.1, Math.PI * 2.35, 16), 0.04, 0.25], circle(0.04, 0.72, 0.07, 8)],
    shout: () => [[0.02, -0.95, 0, -0.25, 0.04, 0.35], circle(0.04, 0.74, 0.07, 8)],
    cross: () => [[-0.8, -0.8, 0.82, 0.78], [0.78, -0.85, -0.8, 0.8]],
    tick: () => [[-0.85, 0.05, -0.32, 0.62, 0.9, -0.85]],
    star: () => { const p = []; for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k % 5) * ((4 * Math.PI) / 5); p.push(Math.cos(a) * 0.95, Math.sin(a) * 0.95); } return [p]; },
    spiral: () => { const p = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * TAU * 2.4, rr = 0.95 * (1 - t * 0.88); p.push(Math.cos(a) * rr, Math.sin(a) * rr * 0.82); } return [p]; },
    wave: () => { const p = []; for (let i = 0; i <= 24; i++) { const t = i / 24; p.push(-1 + 2 * t, Math.sin(t * TAU * 1.5) * 0.28); } return [p]; },
    bracket: () => [[0.35, -0.95, -0.2, -0.92, -0.28, 0, -0.22, 0.92, 0.36, 0.96]],
    box: () => [[-0.95, -0.7, 0.92, -0.74, 0.96, 0.68, -0.9, 0.72, -0.98, -0.78, -0.6, -0.72]],
    warning: () => [[0, -0.95, 0.95, 0.75, -0.95, 0.78, 0.04, -0.98], [0.02, -0.4, 0, 0.25], circle(0.03, 0.5, 0.06, 8)],
    // (the heart curve, one stroke from its cleft round and back)
    heart: () => { const p = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * TAU; p.push((16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17); } return [p]; },
    eye: () => [[...arcPts(0, 0.55, 1.05, 0.95, Math.PI * 1.17, Math.PI * 1.83, 16)], [...arcPts(0, -0.55, 1.05, 0.95, Math.PI * 0.17, Math.PI * 0.83, 16)], arcPts(0, 0, 0.24, 0.24, 0, TAU, 14)],
    skull: () => [arcPts(0, -0.15, 0.78, 0.72, Math.PI * 0.75, Math.PI * 2.25, 30), arcPts(-0.3, -0.18, 0.17, 0.17, 0, TAU, 10), arcPts(0.3, -0.18, 0.17, 0.17, 0, TAU, 10), [-0.32, 0.55, -0.3, 0.9], [0, 0.6, 0, 0.92], [0.3, 0.55, 0.3, 0.9], [-0.42, 0.62, 0.42, 0.62]],
    moon: () => [[...arcPts(0, 0, 0.92, 0.92, Math.PI * 0.35, Math.PI * 1.65, 24), ...arcPts(0.38, 0, 0.62, 0.7, Math.PI * 1.55, Math.PI * 0.45, 20)]],
    sun: () => { const out = [arcPts(0, 0, 0.45, 0.45, 0, TAU + 0.3, 20)]; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; out.push([Math.cos(a) * 0.62, Math.sin(a) * 0.62, Math.cos(a) * 0.98, Math.sin(a) * 0.98]); } return out; },
    scratch: () => { const p = []; for (let i = 0; i <= 9; i++) p.push(-0.95 + i * 0.21, i % 2 ? 0.55 : -0.55); return [p]; },
    asterisk: () => [[0, -0.95, 0, 0.95], [-0.82, -0.48, 0.82, 0.48], [-0.82, 0.48, 0.82, -0.48]],
    // (2026-10-06, the bank grown: Luke wanted more, and more kinds)
    key: () => [circle(-0.58, 0, 0.32), [-0.26, 0, 0.95, 0.02], [0.62, 0.01, 0.62, 0.32], [0.84, 0.02, 0.84, 0.26]],
    keyhole: () => [circle(0, -0.4, 0.36), [-0.12, -0.08, -0.32, 0.9, 0.32, 0.9, 0.12, -0.08]],
    door: () => [[-0.6, 0.95, -0.6, -0.25, ...arcPts(0, -0.25, 0.6, 0.65, Math.PI, TAU, 14), 0.6, 0.95], circle(0.33, 0.28, 0.06, 8)],
    stairs: () => [[-0.95, 0.9, -0.95, 0.45, -0.5, 0.45, -0.5, 0, -0.05, 0, -0.05, -0.45, 0.4, -0.45, 0.4, -0.9, 0.95, -0.9]],
    ladder: () => [[-0.42, -0.95, -0.38, 0.95], [0.4, -0.95, 0.43, 0.95], [-0.4, -0.55, 0.41, -0.55], [-0.39, -0.1, 0.42, -0.1], [-0.39, 0.35, 0.42, 0.35], [-0.38, 0.75, 0.43, 0.75]],
    flame: () => [smooth([0, -0.95, 0.3, -0.4, 0.55, 0.15, 0.4, 0.68, 0, 0.92, -0.4, 0.68, -0.55, 0.15, -0.28, -0.25, -0.12, 0, 0, -0.95]), smooth([0.02, 0.72, -0.18, 0.4, 0.04, 0.08, 0.18, 0.42, 0.02, 0.72])],
    drop: () => [smooth([0, -0.95, 0.28, -0.4, 0.5, 0.18, 0.42, 0.66, 0, 0.94, -0.42, 0.66, -0.5, 0.18, -0.28, -0.4, 0, -0.95])],
    tally: () => [[-0.62, -0.7, -0.64, 0.72], [-0.24, -0.72, -0.25, 0.7], [0.14, -0.7, 0.12, 0.72], [0.5, -0.72, 0.5, 0.7], [-0.9, 0.48, 0.8, -0.42]],
    hash: () => [[-0.32, -0.92, -0.5, 0.92], [0.42, -0.92, 0.26, 0.92], [-0.9, -0.32, 0.92, -0.36], [-0.95, 0.34, 0.86, 0.3]],
    dagger: () => [[0, -0.95, 0.15, -0.68, 0.12, 0.25, -0.12, 0.25, -0.15, -0.68, 0, -0.95], [-0.45, 0.3, 0.46, 0.28], [0, 0.32, 0.01, 0.78], circle(0.01, 0.86, 0.09, 10)],
    hook: () => [[0.1, -0.95, 0.1, 0.4, ...arcPts(-0.28, 0.4, 0.38, 0.5, 0, Math.PI, 14)], [-0.66, 0.4, -0.48, 0.18]],
    sigil: () => [[0, -0.92, 0.88, 0.72, -0.88, 0.72, 0, -0.92], [0, -0.3, 0, 0.95], [-0.42, 0.2, 0.42, 0.2]],
    crosshair: () => [circle(0, 0, 0.66, 22), [-0.98, 0, -0.42, 0], [0.42, 0, 0.98, 0], [0, -0.98, 0, -0.42], [0, 0.42, 0, 0.98]],
    marked: () => [circle(0, 0, 0.9, 24), [-0.5, -0.5, 0.52, 0.5], [0.5, -0.52, -0.5, 0.52]],
    bolt: () => [[0.32, -0.95, -0.3, -0.05, 0.24, 0.05, -0.32, 0.95]],
    water: () => [-0.55, 0, 0.55].map((y0) => { const p = []; for (let i = 0; i <= 16; i++) { const t = i / 16; p.push(-0.95 + 1.9 * t, y0 + Math.sin(t * TAU * 1.5) * 0.14); } return p; }),
    mountain: () => [[-0.95, 0.72, -0.4, -0.45, -0.05, 0.18, 0.42, -0.8, 0.95, 0.72]],
    tombstone: () => [[-0.6, 0.86, -0.6, -0.3, ...arcPts(0, -0.3, 0.6, 0.6, Math.PI, TAU, 14), 0.6, 0.86], [-0.95, 0.9, 0.95, 0.88], [0, -0.5, 0, 0.25], [-0.25, -0.22, 0.25, -0.22]],
    coffin: () => [[-0.22, -0.95, 0.22, -0.95, 0.52, -0.42, 0.3, 0.95, -0.3, 0.95, -0.52, -0.42, -0.22, -0.95]],
    crown: () => [[-0.86, 0.6, -0.92, -0.5, -0.45, 0.04, 0, -0.75, 0.45, 0.04, 0.92, -0.5, 0.86, 0.6, -0.86, 0.6]],
    bone: () => [[-0.55, -0.12, 0.55, -0.12], [-0.55, 0.12, 0.55, 0.12], circle(-0.72, -0.2, 0.2, 12), circle(-0.72, 0.2, 0.2, 12), circle(0.72, -0.2, 0.2, 12), circle(0.72, 0.2, 0.2, 12)],
    hourglass: () => [[-0.6, -0.92, 0.6, -0.92, -0.6, 0.92, 0.6, 0.92, -0.6, -0.92]],
    dots: () => [circle(-0.7, 0, 0.1, 8), circle(0, 0, 0.1, 8), circle(0.7, 0, 0.1, 8)],
    tentacle: () => [smooth([-0.85, 0.95, -0.6, 0.4, -0.66, -0.1, -0.3, -0.52, 0.2, -0.72, 0.6, -0.5, 0.55, -0.14, 0.25, -0.2, 0.3, -0.42])],
    pentacle: () => [circle(0, 0, 0.95, 28), starPts(0.9)],
    teeth: () => [[-0.95, -0.1, 0.95, -0.1], arcPts(0, -0.1, 0.95, 0.85, 0, Math.PI, 18), [-0.75, -0.1, -0.6, 0.22, -0.45, -0.08, -0.3, 0.3, -0.15, -0.08, 0, 0.34, 0.15, -0.08, 0.3, 0.3, 0.45, -0.08, 0.6, 0.22, 0.75, -0.1]],
    coil: () => { const p = []; for (let i = 0; i <= 64; i++) { const t = i / 64; p.push(-0.9 + 1.8 * t - 0.22 * Math.sin(t * TAU * 4), -0.3 * Math.cos(t * TAU * 4)); } return [p]; },
    north: () => [[0, 0.95, 0, -0.9], [-0.32, -0.5, 0, -0.95, 0.32, -0.5], [-0.3, 0.3, 0.3, 0.3]],
};
export const DOODLE_KINDS = Object.keys(DOODLES);

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
function fitShapes(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polys) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const k = 0.95 / Math.max(0.05, (x1 - x0) / 2, (y1 - y0) / 2);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return polys.map((p) => p.map((v, i) => (v - (i % 2 ? cy : cx)) * k));
}
function doodlePaths(kind, seed, { x = 0, y = 0, size = 1, turn = null } = {}) {
    const make = DOODLES[kind];
    if (!make) return [];
    const r = rng(`doodle:${seed}`);
    const a = turn ?? (r() - 0.5) * 0.45;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    return fitShapes(make(r)).map((poly) => {
        const h = humanize(poly, r);
        const out = [];
        for (let i = 0; i < h.length; i += 2) out.push(x + (h[i] * cs - h[i + 1] * sn) * size, y + (h[i] * sn + h[i + 1] * cs) * size);
        return out;
    });
}

// A doodle laid on the sheet (board px): strokes { c, w, b, o, pts }. `w` is
// the brush's width at the palette's middle size (DOODLE_SIZE); the line
// thickens and thins with the doodle, so it reads the same small or large
// (Luke, 2026-10-06)
export const DOODLE_SIZE = 50;
export const doodleWidth = (w, size) => Math.max(1.5, Math.round(w * (size / DOODLE_SIZE) * 10) / 10);
export function doodleBoard(kind, seed, { x, y, size = DOODLE_SIZE, c = 1, w = 8, b = 1, o = 0.85 } = {}) {
    const ww = doodleWidth(w, size);
    return doodlePaths(kind, seed, { x, y, size }).map((pts) => cleanStroke({ c, w: ww, b, o, pts: pts.map((v) => Math.round(v * 10) / 10) })).filter(Boolean);
}

// A doodle laid on a card (card units: its width at size 1 is one), at
// (u, v), `size` across, in a paint, as its owner's strokes ({ id: stroke })
export function doodleStrokes(kind, seed, { u = 0, v = 0, size = 0.16, c = 1, w = 7, by = null, b = 1 } = {}) {
    const out = {};
    doodlePaths(kind, seed, { x: u, y: v, size }).forEach((pts, i) => {
        const st = cleanStroke({ by, c, w, b, pts }, { card: true });
        if (st) out[`d${i + 1}`] = st;
    });
    return out;
}

// the paints a doodle comes in on a card, clear on paper: blood, soot, rust, brown
const DOODLE_PAINTS = [1, 12, 1, 2, 13];

// Whether a card comes with a doodle, and which (Luke, 2026-10-06: seasoned
// onto notes and cards; his brush's own weight, about): about a card in four,
// by its key; its strokes, or {}
export function seasonMarks(key, { by = null, type = 'note' } = {}) {
    const r = rng(`season:${key}`);
    if (r() > (type === 'note' ? 0.3 : 0.2)) return {};
    const kind = DOODLE_KINDS[Math.floor(r() * DOODLE_KINDS.length)];
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
const BOARD_KEYS = ['scraps', 'links', 'pins', 'marks', 'bits', 'decor', 'bin'];
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
export const BIN_MAX = 60;

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

// A doodle laid down (Luke, 2026-10-06; one copy for both hosts, 2026-10-21):
// on the card under it (its own strokes, in its frame) or on the sheet in the
// layer of whoever placed it (`me`), in the brush's paint, brightness, width,
// and opacity (`brush`: { size, c, w, b, o }). Returns the patch.
export function doodlePatch(raw, view, a, brush, look, me) {
    const strokes = doodleBoard(a.kind, a.seed ?? `${a.kind}:${Date.now()}`, { x: a.at.x, y: a.at.y, size: brush.size, c: brush.c, w: Math.min(brush.w, markMax(look)), b: brush.b, o: brush.o });
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
export const brushStroke = (brush, look, pts) => ({ c: brush?.c ?? 0, w: Math.min(brush?.w ?? 8, markMax(look)), o: brush?.o ?? 0.85, b: brush?.b ?? 1, pts });

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
    for (const [id, p] of Object.entries(e.pins ?? {})) {
        const nid = pinsNow[id] ? customKey('pin', { ...pinsNow, ...newPins }) : id;
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
        const nid = linksNow[id] ? customKey('l', { ...linksNow, ...newLinks }) : id;
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
