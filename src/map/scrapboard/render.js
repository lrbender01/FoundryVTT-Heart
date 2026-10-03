// The scrapboard map on the canvas (2026-10-02, monorepo
// docs/plans/heart-map.md): the shared painter (paint.js, the same drawing
// code the Heart Map Board mock runs) paints the look and a viewer's board
// into tiles, shown as sprites in the primary canvas group, above the scene's
// background and below tiles and tokens, so the delvers' tokens walk on it.
// Nothing here is interactive: the tools are the ScrapboardLayer (layer.js).
//
// How it paints (Luke, 2026-10-03: quality first, then every machine and
// connection):
// - The board is cut into tiles. Each keeps its own part of the sheet (the
//   paper, the marker, and the grime over it) and the board painted over it.
// - A change repaints only the tiles it touches: each draw compares the view
//   with the last, piece by piece (cards, strings, pins, decorations, marker
//   strokes), and only those tiles are painted and sent to the GPU again.
// - What is on screen is painted at once; the rest a few tiles a frame, so a
//   big board never stalls the page.
// - Images come small first (previews) and whole later; a tile painted
//   without a whole image is painted again when it comes.
// - Zoomed in, the view is painted again at the screen's own resolution (a
//   second, finer set of tiles over it), so writing is sharp at any zoom.
import { normalizeBoard, boardView } from './model.js';
import { createPainter, sheetGeometry } from './paint.js';
import { loadBoardLook, textureUrl, previewUrl } from './look.js';
import { boardOf } from './api.js';

// above the scene background (SCENE = 0), below tiles (500)
const SORT_LAYER = 100;
// How finely a client paints (the boardDetail setting): bitmap px per board
// px, the longest side an image is kept at once loaded (the books' art is
// far bigger than anything the map draws), and whether a drag repaints the
// board as it goes. Auto is high for the GM, standard for players, and light
// on a device short of memory.
export const DETAIL = {
    high: { scale: 1.25, cap: 1600, live: true },
    standard: { scale: 1, cap: 1100, live: true },
    light: { scale: 0.7, cap: 700, live: false },
};
export function detailOf() {
    let d = 'auto';
    try {
        d = game.settings.get('heart', 'boardDetail') ?? 'auto';
    } catch {
        d = 'auto';
    }
    if (d === 'auto') d = game.user?.isGM ? 'high' : (navigator.deviceMemory && navigator.deviceMemory <= 4 ? 'light' : 'standard');
    return DETAIL[d] ?? DETAIL.standard;
}

// The largest single bitmap this client can hold: the GPU's texture limit,
// and on Safari (iPads among the players) its canvas area limit. (A picture
// of the whole board is one bitmap; the board on screen is tiles.)
function bitmapLimits() {
    let side = 4096;
    try {
        const gl = canvas.app?.renderer?.gl;
        if (gl) side = gl.getParameter(gl.MAX_TEXTURE_SIZE) || side;
    } catch {
        side = 4096;
    }
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent ?? '');
    return { side: Math.min(side, 16384), area: safari ? 16777216 : 268435456 };
}

// the board's total bitmap at most (px): its tiles' memory, on any machine
const MAX_BOARD_PX = 48e6;
// painting's share of a frame (ms) once what is on screen is done
const FRAME_BUDGET = 8;
// the finest the sheet's own scans are worth (bitmap px per board px)
const SHEET_FINEST = 2.5;

const meets = (a, b) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1;
const grow = (b, p) => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });
// the box round a flat list of points
function boxOf(pts, pad = 0) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]);
        x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]);
        y1 = Math.max(y1, pts[i + 1]);
    }
    return x0 === Infinity ? null : grow({ x0, y0, x1, y1 }, pad);
}
// a piece as it is drawn, as a string to compare (numbers to a tenth;
// nothing twice)
function sigOf(x) {
    const seen = new WeakSet();
    return JSON.stringify(x, (_k, v) => {
        if (typeof v === 'number') return Math.round(v * 10) / 10;
        if (typeof v === 'function') return undefined;
        if (v && typeof v === 'object') {
            if (seen.has(v)) return undefined;
            seen.add(v);
        }
        return v;
    });
}

// A set of tiles over a part of the board (x0..x1, y0..y1 board px) at k
// bitmap px per board px: each a canvas `size` px square (a power of two, so
// it can be mipmapped) with a gutter of its neighbours' painting round it (no
// seams), its own part of the sheet, and a sprite.
const GUTTER = 8;
class TileGrid {
    constructor(r, { x0, y0, x1, y1, k, size, sort, mipmap }) {
        Object.assign(this, { r, x0, y0, x1, y1, k, size, sort, mipmap });
        this.kb = Math.min(k, SHEET_FINEST);
        const step = (size - GUTTER * 2) / k;
        this.tiles = [];
        for (let by = y0; by < y1; by += step) {
            for (let bx = x0; bx < x1; bx += step) {
                this.tiles.push({ bx0: bx, by0: by, bx1: Math.min(x1, bx + step), by1: Math.min(y1, by + step), canvas: null, bg: null, sprite: null, dirty: true, bgDirty: true, short: false, bgShort: false });
            }
        }
    }

    // the tile's own reach on the board (with its gutter)
    reach(t) {
        const g = GUTTER / this.k;
        return { x0: t.bx0 - g, y0: t.by0 - g, x1: t.bx0 - g + this.size / this.k, y1: t.by0 - g + this.size / this.k };
    }

    mark(box, { sheet = false } = {}) {
        for (const t of this.tiles) {
            if (!meets(box, this.reach(t))) continue;
            t.dirty = true;
            if (sheet) (t.bgAreas ??= []).push(box);
        }
    }

    markAll({ sheet = false } = {}) {
        for (const t of this.tiles) {
            t.dirty = true;
            if (sheet) t.bgDirty = true;
        }
    }

    get done() {
        return this.tiles.every((t) => !t.dirty);
    }

    // its part of the sheet, painted (all of it, or the areas a stroke changed)
    #sheet(t, P) {
        const R = this.reach(t);
        const kb = this.kb;
        const side = Math.ceil((this.size * kb) / this.k);
        if (!t.bg || t.bgDirty) {
            t.bg ??= document.createElement('canvas');
            t.bg.width = t.bg.height = side;
            P.resetMissing();
            this.r.short = false;
            P.paintSheet(t.bg, kb, -R.x0 * kb, -R.y0 * kb, R);
            t.bgShort = P.missing || this.r.short;
            t.bgDirty = false;
            t.bgAreas = null;
            return;
        }
        for (const a of t.bgAreas ?? []) {
            const A = { x0: Math.max(a.x0, R.x0), y0: Math.max(a.y0, R.y0), x1: Math.min(a.x1, R.x1), y1: Math.min(a.y1, R.y1) };
            if (A.x1 > A.x0 && A.y1 > A.y0) P.paintSheet(t.bg, kb, -R.x0 * kb, -R.y0 * kb, A);
        }
        t.bgAreas = null;
    }

    paint(t, P, { marksOnly }) {
        this.#sheet(t, P);
        const k = this.k;
        const R = this.reach(t);
        t.canvas ??= Object.assign(document.createElement('canvas'), { width: this.size, height: this.size });
        const g = t.canvas.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.size, this.size);
        g.setTransform(k, 0, 0, k, -R.x0 * k, -R.y0 * k);
        P.resetMissing();
        this.r.short = false;
        P.drawTable(g);
        g.save();
        g.imageSmoothingQuality = 'high';
        g.drawImage(t.bg, R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
        g.restore();
        P.drawForeground(g, { marksOnly });
        P.drawLight(g);
        t.short = t.bgShort || P.missing || this.r.short;
        t.dirty = false;
        this.#upload(t);
    }

    #upload(t) {
        const k = this.k;
        if (!t.sprite || t.sprite.destroyed) {
            const base = PIXI.BaseTexture.from(t.canvas, { mipmap: this.mipmap ? PIXI.MIPMAP_MODES.ON : PIXI.MIPMAP_MODES.OFF });
            const frame = new PIXI.Rectangle(GUTTER, GUTTER, Math.max(1, Math.round((t.bx1 - t.bx0) * k)), Math.max(1, Math.round((t.by1 - t.by0) * k)));
            const s = new PIXI.Sprite(new PIXI.Texture(base, frame));
            s.elevation = 0;
            s.sortLayer = SORT_LAYER;
            s.sort = this.sort;
            s.eventMode = 'none';
            s.visible = !this.hidden;
            t.sprite = s;
        } else t.sprite.texture.baseTexture.update();
        this.place(t);
    }

    place(t) {
        const s = t.sprite;
        if (!s || s.destroyed) return;
        if (s.parent !== canvas.primary) {
            canvas.primary.addChild(s);
            canvas.primary.sortDirty = true;
        }
        const at = this.r.toCanvas({ x: t.bx0, y: t.by0 });
        s.position.set(at.x, at.y);
        s.width = (t.bx1 - t.bx0) * this.r.scale;
        s.height = (t.by1 - t.by0) * this.r.scale;
    }

    show(on = true) {
        this.hidden = !on;
        for (const t of this.tiles) if (t.sprite && !t.sprite.destroyed) t.sprite.visible = on;
    }

    destroy() {
        for (const t of this.tiles) {
            if (t.sprite && !t.sprite.destroyed) {
                t.sprite.parent?.removeChild(t.sprite);
                t.sprite.destroy({ texture: true, baseTexture: true });
            }
            t.sprite = null;
            t.canvas = null;
            t.bg = null;
        }
        this.tiles = [];
    }
}

export class ScrapboardRenderer {
    #ticket = 0;
    #images = new Map();
    #painter = null;
    #textures = {};
    // the tiles of the whole board, the finer ones over the view (and new
    // finer ones being painted), what each piece was when last painted, and
    // what was true of the whole board then
    #base = null;
    #focus = null;
    #nextFocus = null;
    #sigs = new Map();
    #whole = '';
    #epoch = 0;
    #pumping = false;
    // (set when a preview stood in for an image: the tile is painted again)
    short = false;
    look = null;
    view = null;
    geo = null;
    lookKey = '';

    constructor() {
        const mctx = document.createElement('canvas').getContext('2d');
        this.measure = (text, px, font, style = '') => {
            mctx.font = `${style ? `${style} ` : ''}${px}px "${font}"`;
            return mctx.measureText(text).width;
        };
        this.size = (id) => {
            const t = this.#textures[id];
            return t ? { w: t.w, h: t.h, safe: t.safe, cover: t.cover } : null;
        };
        this.#painter = createPainter({
            img: (id) => this.#image(id),
            piece: (id) => this.#textures[id] ?? null,
            measure: this.measure,
            pxs: () => this.#pxs ?? this.detail.scale,
            epoch: () => this.#epoch,
        });
    }

    detail = detailOf();

    // a new detail (the setting changed): images and every tile again
    reset() {
        this.detail = detailOf();
        this.#images.clear();
        this.lookKey = '';
        this.#whole = '';
    }

    get painter() {
        return this.#painter;
    }

    /* -------------------------------------------- */
    /*  Images: small first, whole later            */
    /* -------------------------------------------- */

    // An image for a texture or art id: the whole one once loaded, its preview
    // until then (marked, so what it is drawn into is done again), or null
    #image(id) {
        if (!id) return null;
        let e = this.#images.get(id);
        if (!e) {
            const url = textureUrl(this.#textures, id);
            if (!url) return null;
            e = { full: this.#load(url, true), prev: null };
            const pv = previewUrl(this.#textures, id);
            if (pv) e.prev = this.#load(pv, false);
            this.#images.set(id, e);
        }
        if (e.full.ready) return e.full.im;
        if (e.prev?.ready && e.prev.im) {
            this.short = true;
            return e.prev.im;
        }
        return null;
    }

    #load(url, whole) {
        const im = new Image();
        const e = { im: null, ready: false, done: null };
        e.done = new Promise((resolve) => {
            im.onload = () => {
                e.im = whole ? this.#shrunk(im) : Object.assign(im, { preview: true });
                e.ready = true;
                this.#arrived();
                resolve();
            };
            im.onerror = () => {
                // (a preview that isn't there: the whole one only)
                e.ready = !whole;
                resolve();
            };
        });
        im.src = url;
        return e;
    }

    // an image came: the tiles painted without it, again (a little later, so
    // a burst of arrivals is one repaint)
    #arrived = foundry.utils.debounce(() => {
        this.#epoch++;
        for (const grid of [this.#base, this.#focus, this.#nextFocus]) {
            for (const t of grid?.tiles ?? []) {
                if (t.bgShort) t.bgDirty = true;
                if (t.short || t.bgShort) t.dirty = true;
            }
        }
        this.#pump();
    }, 120);

    // an image kept at no more than the detail's cap (its longest side)
    #shrunk(im) {
        const cap = this.detail.cap;
        const w = im.naturalWidth;
        const h = im.naturalHeight;
        if (Math.max(w, h) <= cap) return im;
        const k = cap / Math.max(w, h);
        const c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, 0, 0, c.width, c.height);
        // (the painter reads an image's natural size)
        c.naturalWidth = c.width;
        c.naturalHeight = c.height;
        return c;
    }

    // the whole images still coming
    #loading() {
        return [...this.#images.values()].filter((e) => !e.full.ready).map((e) => e.full.done);
    }

    clear() {
        this.#ticket++;
        for (const grid of [this.#base, this.#focus, this.#nextFocus]) grid?.destroy();
        this.#base = this.#focus = this.#nextFocus = null;
        this.#sigs = new Map();
        this.#whole = '';
        this.#painter.dropBake();
        this.view = null;
    }

    // The view a viewer ('gm' or 'player') sees of a board (the scene's, or
    // one being edited before it is written)
    async viewOf(scene, viewer, boardJ = boardOf(scene)) {
        const { look, textures } = await loadBoardLook();
        this.#textures = textures;
        this.look = look;
        const board = normalizeBoard(boardJ);
        // a landmark of the GM's own takes its actor's name (before its layout
        // writes it)
        for (const s of Object.values(board.scraps)) {
            if (s.uuid && !s.name) s.name = fromUuidSync(s.uuid, { strict: false })?.name ?? '';
        }
        const view = boardView(look, board, viewer, this.size, this.measure);
        // marker layers this client has hidden (the GM's view of each one)
        if (this.hiddenMarks.size) view.marks = Object.fromEntries(Object.entries(view.marks).filter(([k]) => !this.hiddenMarks.has(k)));
        return view;
    }

    // the marker layers (user ids) this client doesn't show
    hiddenMarks = new Set();
    // the drawing alone, without the board's pieces (this client's)
    marksOnly = false;

    /* -------------------------------------------- */
    /*  Drawing                                     */
    /* -------------------------------------------- */

    // the board's tiles' scale: the detail's, within the memory a board may take
    #boardScale(look) {
        return Math.min(this.detail.scale, Math.sqrt(MAX_BOARD_PX / (look.w * look.h)));
    }

    // Paint the scene's board for a viewer and show it: only what changed
    async draw(scene, viewer, boardJ) {
        const ticket = ++this.#ticket;
        const view = await this.viewOf(scene, viewer, boardJ);
        const look = this.look;
        await this.#fonts(look, view);
        if (ticket !== this.#ticket || !canvas.primary || canvas.scene !== scene) return null;
        this.view = view;
        const key = JSON.stringify(look.sheet) + look.w + look.h;
        if (key !== this.lookKey) {
            this.geo = sheetGeometry(look, (id) => this.#textures[id]?.tone ?? null, (id) => this.#textures[id]?.safe ?? null);
            this.lookKey = key;
        }
        this.#painter.set({ look, view, geo: this.geo });
        const k = this.#boardScale(look);
        const whole = JSON.stringify([this.lookKey, k, this.marksOnly, canvas.dimensions.sceneWidth, canvas.dimensions.sceneHeight]);
        const sigs = this.#piecesOf(view);
        const fresh = whole !== this.#whole || !this.#base;
        if (fresh) {
            // (a new look, scale, or scene: every tile, from the sheet up)
            this.#base?.destroy();
            this.#focus?.destroy();
            this.#nextFocus?.destroy();
            this.#focus = this.#nextFocus = null;
            this.#base = new TileGrid(this, { x0: 0, y0: 0, x1: look.w, y1: look.h, k, size: 1024, sort: 0, mipmap: true });
            this.#whole = whole;
        } else {
            for (const { box, sheet } of this.#changes(this.#sigs, sigs)) {
                for (const grid of [this.#base, this.#focus, this.#nextFocus]) grid?.mark(box, { sheet });
            }
        }
        this.#sigs = sigs;
        // an edit: what is on screen now (it shows at once), the rest as frames
        // allow; a new board fills in over a few frames (the page never stalls)
        this.#pump({ now: !fresh });
        this.queueFocus();
        return view;
    }

    // every piece drawn, as [what it is, where it reaches]
    #piecesOf(view) {
        const P = this.#painter;
        const out = new Map();
        for (const s of view.scraps ?? []) {
            const L = s.layout ?? {};
            const pts = [...(L.hull ?? [])];
            for (const t of [...(L.tapes ?? []), ...(L.extras ?? [])]) { const m = Math.max(t.w, t.h ?? 0); pts.push(t.cx - m, t.cy - m, t.cx + m, t.cy + m); }
            for (const p of [...(L.clipPins ?? []), ...(L.pins ?? []), ...(L.pin ? [L.pin] : [])]) pts.push(p.x - p.w, p.y - p.w, p.x + p.w, p.y + p.w);
            out.set(`s:${s.key}`, { sig: sigOf(s), box: boxOf(pts, 50) });
        }
        for (const l of view.links ?? []) {
            const pts = [...(l.points ?? [])];
            const T = l.label ? P.tagOf(l) : null;
            if (T) pts.push(T.x - T.w, T.y - T.w, T.x + T.w, T.y + T.w, T.mid.x, T.mid.y);
            out.set(`l:${l.id}`, { sig: sigOf(l), box: boxOf(pts, 60) });
        }
        for (const p of view.pins ?? []) out.set(`p:${p.id}`, { sig: sigOf(p), box: boxOf([p.x, p.y], (p.w ?? 40) + 20) });
        (view.decor ?? []).forEach((d, i) => out.set(`d:${i}`, { sig: sigOf(d), box: boxOf([d.x, d.y], (d.w ?? 100) * 1.5 + 20) }));
        // the marker's strokes are the sheet's: a change repaints the sheet there
        for (const [id, m] of P.markState()) out.set(`m:${id}`, { sig: m.sig, box: m.box, sheet: true });
        return out;
    }

    // the parts of the board a change of pieces touches
    #changes(was, now) {
        const out = [];
        const take = (e) => e?.box && out.push({ box: e.box, sheet: Boolean(e.sheet) });
        for (const [id, a] of was) {
            const b = now.get(id);
            if (!b || b.sig !== a.sig) take(a);
        }
        for (const [id, b] of now) {
            const a = was.get(id);
            if (!a || a.sig !== b.sig) take(b);
        }
        return out;
    }

    // the board px on screen (null before the canvas is up)
    #inView(pad = 0) {
        if (!canvas.ready || !this.look) return null;
        const scr = canvas.app.renderer.screen;
        const tl = this.toMap(canvas.stage.toLocal(new PIXI.Point(0, 0)));
        const br = this.toMap(canvas.stage.toLocal(new PIXI.Point(scr.width, scr.height)));
        return grow({ x0: tl.x, y0: tl.y, x1: br.x, y1: br.y }, pad);
    }

    // Paint the tiles that need it: with `now`, those on screen at once; the
    // rest a few a frame, nearest the view first
    #pump({ now = false } = {}) {
        const view = this.#inView(40);
        const P = this.#painter;
        const look = this.look;
        if (!look || !this.view) return;
        const opts = { marksOnly: this.marksOnly };
        const covered = this.#focus && !this.#focus.hidden && view && this.#focus.x0 <= view.x0 && this.#focus.y0 <= view.y0 && this.#focus.x1 >= view.x1 && this.#focus.y1 >= view.y1;
        const queue = [];
        for (const grid of [this.#focus, this.#nextFocus, this.#base]) {
            for (const t of grid?.tiles ?? []) {
                if (!t.dirty) continue;
                const seen = !view || meets(view, grid.reach(t));
                // (what is under the finer tiles can wait)
                const rank = grid === this.#base ? (seen ? (covered ? 2 : 0) : 3) : seen ? 0 : 1;
                queue.push({ grid, t, rank });
            }
        }
        if (!queue.length) return this.#swapFocus();
        queue.sort((a, b) => a.rank - b.rank);
        P.set({ look, view: this.view, geo: this.geo });
        const start = performance.now();
        let i = 0;
        for (; i < queue.length; i++) {
            const { grid, t, rank } = queue[i];
            if (now ? rank !== 0 : i > 0 && performance.now() - start > FRAME_BUDGET) break;
            this.#pxs = grid.k;
            try {
                grid.paint(t, P, opts);
            } finally {
                this.#pxs = null;
            }
        }
        this.#swapFocus();
        if (i < queue.length && !this.#pumping) {
            this.#pumping = true;
            requestAnimationFrame(() => {
                this.#pumping = false;
                this.#pump();
            });
        }
    }

    /* -------------------------------------------- */
    /*  The view, sharp                             */
    /* -------------------------------------------- */

    // (Luke, 2026-10-02: the writing always sharp, at every detail, in every
    // browser) The board's tiles are at the detail's scale; zoomed in, that is
    // soft. Once the view settles, what is on the screen (and a margin) gets
    // finer tiles of its own, at the screen's own resolution, over the board's.
    #pxs = null;
    queueFocus = foundry.utils.debounce(() => this.#refocus(), 150);

    #refocus() {
        const look = this.look;
        if (!look || !this.view || !this.#base || !canvas.ready) return;
        // (the canvas's own px per screen px: Foundry's, not the window's)
        const res = canvas.app.renderer.resolution || window.devicePixelRatio || 1;
        const k = canvas.stage.scale.x * this.scale * res;
        if (k <= this.#base.k * 1.05) {
            // (the board's own tiles are sharp enough at this zoom)
            this.#focus?.destroy();
            this.#nextFocus?.destroy();
            this.#focus = this.#nextFocus = null;
            return;
        }
        const v = this.#inView();
        const mx = (v.x1 - v.x0) * 0.15;
        const my = (v.y1 - v.y0) * 0.15;
        const A = { x0: Math.max(0, Math.floor(v.x0 - mx)), y0: Math.max(0, Math.floor(v.y0 - my)), x1: Math.min(look.w, Math.ceil(v.x1 + mx)), y1: Math.min(look.h, Math.ceil(v.y1 + my)) };
        if (A.x1 - A.x0 < 2 || A.y1 - A.y0 < 2) return;
        const F = this.#focus;
        const same = (G) => G && Math.abs(G.k - k) < k * 0.05 && G.x0 <= Math.max(0, v.x0) && G.y0 <= Math.max(0, v.y0) && G.x1 >= Math.min(look.w, v.x1) && G.y1 >= Math.min(look.h, v.y1);
        if (same(F) || same(this.#nextFocus)) return this.#pump();
        this.#nextFocus?.destroy();
        // (hidden until every tile of it is painted, then it takes the old one's place)
        this.#nextFocus = new TileGrid(this, { ...A, k, size: 512, sort: 1, mipmap: false });
        this.#nextFocus.hidden = true;
        this.#pump();
    }

    #swapFocus() {
        const N = this.#nextFocus;
        if (!N || !N.done) return;
        this.#focus?.destroy();
        this.#focus = N;
        this.#nextFocus = null;
        N.show(true);
    }

    async #fonts(look, view = null) {
        const faces = [...new Set([...look.fonts.hands, look.fonts.display, ...this.#usedHands(), ...(view?.scraps ?? []).map((s) => s.layout.font)])];
        await Promise.all(faces.map((f) => document.fonts.load(`40px "${f}"`).catch(() => null)));
    }

    // hands chosen per scrap (a player's note writes in their own)
    #usedHands() {
        return Object.values(game.settings.get('heart', 'boardHands') ?? {});
    }

    /* -------------------------------------------- */
    /*  A picture                                   */
    /* -------------------------------------------- */

    // The whole board as a viewer sees it, painted afresh at `scale` bitmap
    // px per board px once every whole image has loaded: a PNG (the Heart Map
    // tools' Save a picture; Luke, 2026-10-02)
    async snapshot(scene, viewer, scale = 1.5) {
        const view = await this.viewOf(scene, viewer);
        const look = this.look;
        await this.#fonts(look, view);
        this.geo ??= sheetGeometry(look, (id) => this.#textures[id]?.tone ?? null, (id) => this.#textures[id]?.safe ?? null);
        const lim = bitmapLimits();
        const k = Math.min(scale, Math.sqrt(lim.area / (look.w * look.h)));
        const c = document.createElement('canvas');
        const P = this.#painter;
        try {
            for (let round = 0; round < 6; round++) {
                this.#paintWhole(view, c, k);
                const waiting = this.#loading();
                if (!waiting.length && !this.short) break;
                await Promise.all(waiting);
            }
        } finally {
            // (the picture's bake let go; the board on screen is its tiles)
            P.dropBake();
            P.set({ look, view: this.view ?? view, geo: this.geo });
        }
        return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    }

    #paintWhole(view, c, k) {
        const look = this.look;
        c.width = Math.round(look.w * k);
        c.height = Math.round(look.h * k);
        const g = c.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        const P = this.#painter;
        this.#pxs = k;
        this.short = false;
        try {
            P.set({ look, view, geo: this.geo });
            P.drawBackground(g, { key: `${this.lookKey}:picture`, scale: k, sharp: false });
            P.drawForeground(g, { marksOnly: this.marksOnly });
            P.drawLight(g);
        } finally {
            this.#pxs = null;
        }
    }

    // board px <-> canvas px
    toMap(pt) {
        const d = canvas.dimensions;
        const k = this.look ? this.look.w / d.sceneWidth : 1;
        return { x: (pt.x - d.sceneX) * k, y: (pt.y - d.sceneY) * k };
    }

    toCanvas(pt) {
        const d = canvas.dimensions;
        const k = this.look ? d.sceneWidth / this.look.w : 1;
        return { x: d.sceneX + pt.x * k, y: d.sceneY + pt.y * k };
    }

    get scale() {
        return this.look ? canvas.dimensions.sceneWidth / this.look.w : 1;
    }
}
