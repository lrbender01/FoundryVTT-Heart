// The scrapboard map on the canvas (2026-10-02; the map's story is in the
// monorepo's HEART.md and this fork's CHANGELOG): the shared painter
// (paint.js, the same drawing code the Heart Map Board mock runs) paints the
// look and a viewer's board
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
//   big board never stalls the page. A tile's sheet is painted a band at a
//   time, within the frame's budget (Luke, 2026-10-21: a year's board froze
//   the page for seconds a tile).
// - Images come small first (previews) and whole later; where a tile was
//   painted without a whole image, that part of it is painted again when it
//   comes (the painter notes where each image was drawn short).
// - The painter keeps each brush stroke's painted layer (paint.js), so a
//   repaint never builds a stroke again.
// - Zoomed in, the view is painted again at the screen's own resolution (a
//   second, finer set of tiles over it), so writing is sharp at any zoom.
import { normalizeBoard, boardView, sheetLook, withoutGmNotes } from './model.js';
import { createPainter, sheetGeometry, arrivalAreas, sheetBands } from './paint.js';
import { meets, grow, piecesOf, changes, anyMeets } from './changes.js';
import { loadBoardLook, textureUrl, previewUrl } from './look.js';
import { boardOf } from './api.js';

// above the scene background (SCENE = 0), below tiles (500)
const SORT_LAYER = 100;

// A place's actor's own picture as its clipping's art (Luke, 2026-10-21: a
// place made at the table, or a book place the library has no art for): an
// art id of its own, never stored on the board, only in the view
const ACTOR_ART = 'actor-img:';
// (icons, the system's landmark default among them, are no clipping)
const plainIcon = (src) => !src || src === CONST.DEFAULT_TOKEN || /\.svg(\?|$)/i.test(src);
// a place's actor, as far as it can be had at once: its own (uuid), else a
// world copy of the book's entry, else the entry itself (the pack's index)
function placeActor(s, look) {
    if (s.uuid) return fromUuidSync(s.uuid, { strict: false });
    const entry = s.lib ? look.library?.[s.lib] : null;
    if (!entry?.uuid) return null;
    return game.actors?.find((x) => x.type === 'landmark' && (x._stats?.compendiumSource ?? x.flags?.core?.sourceId) === entry.uuid) ?? fromUuidSync(entry.uuid, { strict: false });
}
// an image from elsewhere asked for as one a canvas may still be read from
// (the map's picture)
const fromAfar = (im, url) => {
    try {
        if (new URL(url, window.location.href).origin !== window.location.origin) im.crossOrigin = 'anonymous';
    } catch {
        // (not a url: left as it is)
    }
};
// whether this client shows the GM's own notes (the boardGmNotes setting)
export function gmNotesShown() {
    try {
        return game.settings.get('heart', 'boardGmNotes') !== false;
    } catch {
        return true;
    }
}

// How finely a client paints (the boardDetail setting): bitmap px per board
// px, the longest side an image is kept at once loaded (the books' art is
// far bigger than anything the map draws), and whether a drag repaints the
// board as it goes. Auto is high for the GM, standard for players, and light
// on a device short of memory.
// (and how much of a baked background's tiles a client keeps, MB decoded,
// each held on the GPU too: backdrop.js; Luke 2026-10-25. A screen at the
// finest level needs about 20 tiles of 1 MB; the rest is for panning back)
// (Ultra, Luke 2026-10-26: the GM's strong graphics card; experimental for
// players. Twice the board's paint, images kept far larger, a gigabyte of
// baked tiles, a finer baked level sooner and more of it round the view, the
// board's tiles allowed four times the memory, and the sheet's scans used as
// fine as they go: quality.js for the rest)
export const DETAIL = {
    ultra: { scale: 2, cap: 4096, live: true, bakedMB: 1024, boardPx: 192e6, sheetFinest: 4, bakedNeed: 1.5, bakedMargin: 0.5, bakedGrace: true },
    high: { scale: 1.25, cap: 1600, live: true, bakedMB: 192 },
    standard: { scale: 1, cap: 1100, live: true, bakedMB: 128 },
    light: { scale: 0.7, cap: 700, live: false, bakedMB: 64 },
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

// A set of tiles over a part of the board (x0..x1, y0..y1 board px) at k
// bitmap px per board px: each a canvas `size` px square (a power of two, so
// it can be mipmapped) with a gutter of its neighbours' painting round it (no
// seams), its own part of the sheet, and a sprite.
const GUTTER = 8;
class TileGrid {
    constructor(r, { x0, y0, x1, y1, k, size, sort, mipmap }) {
        Object.assign(this, { r, x0, y0, x1, y1, k, size, sort, mipmap });
        this.kb = Math.min(k, r.detail?.sheetFinest ?? SHEET_FINEST);
        const step = (size - GUTTER * 2) / k;
        this.tiles = [];
        for (let by = y0; by < y1; by += step) {
            for (let bx = x0; bx < x1; bx += step) {
                this.tiles.push({ bx0: bx, by0: by, bx1: Math.min(x1, bx + step), by1: Math.min(y1, by + step), canvas: null, bg: null, sprite: null, dirty: true, bgDirty: true });
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

    get done() {
        return this.tiles.every((t) => !t.dirty);
    }

    // Its part of the sheet, painted: all of it, a band at a time (Luke,
    // 2026-10-21: one tile's sheet froze the page for seconds), then the parts
    // a stroke changed or an image that came covers. `until` (a
    // performance.now() time): stop at a band's end once past it; false while
    // bands are left (the next frame goes on with them). Every image drawn
    // short of itself is noted with where it lies (`bgUses`).
    #sheet(t, P, until = null) {
        const R = this.reach(t);
        if (!t.bg || t.bgDirty) {
            const side = Math.ceil((this.size * this.kb) / this.k);
            t.bg ??= document.createElement('canvas');
            t.bg.width = t.bg.height = side;
            t.bands = sheetBands(R, this.kb);
            t.bgUses = [];
            t.bgDirty = false;
            t.bgAreas = null;
        }
        while (t.bands?.length) {
            this.#sheetPart(t, P, t.bands.shift());
            if (until !== null && t.bands.length && performance.now() > until) return false;
        }
        t.bands = null;
        for (const a of t.bgAreas ?? []) {
            const A = { x0: Math.max(a.x0, R.x0), y0: Math.max(a.y0, R.y0), x1: Math.min(a.x1, R.x1), y1: Math.min(a.y1, R.y1) };
            if (A.x1 > A.x0 && A.y1 > A.y0) this.#sheetPart(t, P, A);
        }
        t.bgAreas = null;
        return true;
    }

    // a part of its sheet (board px, within its reach), painted
    #sheetPart(t, P, A) {
        const R = this.reach(t);
        const kb = this.kb;
        P.watch();
        try {
            P.paintSheet(t.bg, kb, -R.x0 * kb, -R.y0 * kb, A);
        } finally {
            t.bgUses ??= [];
            // (each once: an image that never came was noted again by every
            // repaint of a part it lies in; Luke, 2026-10-21)
            const had = new Set(t.bgUses.map((u) => `${u.id}|${JSON.stringify(u.box)}`));
            for (const u of P.unwatch()) {
                const key = `${u.id}|${JSON.stringify(u.box)}`;
                if (had.has(key)) continue;
                had.add(key);
                t.bgUses.push(u);
            }
        }
    }

    // Paint a tile: its sheet (see #sheet), then the board over it, sent to
    // the GPU. False while its sheet isn't done (or `until` is spent before
    // the board goes over it): a later frame goes on with it.
    paint(t, P, { marksOnly, until = null }) {
        if (!this.#sheet(t, P, until)) return false;
        if (until !== null && performance.now() > until) return false;
        const k = this.k;
        const R = this.reach(t);
        t.canvas ??= Object.assign(document.createElement('canvas'), { width: this.size, height: this.size });
        const g = t.canvas.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.size, this.size);
        g.setTransform(k, 0, 0, k, -R.x0 * k, -R.y0 * k);
        P.resetMissing();
        this.r.short = false;
        // (the images the board over it was drawn short of: it is painted
        // again only when one of them comes)
        P.watch();
        try {
            P.drawTable(g);
            g.save();
            g.imageSmoothingQuality = 'high';
            // (at its own scale: its side is rounded up to whole px, so a
            // finer tile's sheet drawn to the reach was stretched by up to a
            // px; Luke, 2026-10-21)
            g.drawImage(t.bg, R.x0, R.y0, t.bg.width / this.kb, t.bg.height / this.kb);
            g.restore();
            P.drawForeground(g, { marksOnly });
            P.drawLight(g);
        } finally {
            t.fgIds = new Set(P.unwatch().map((u) => u.id));
        }
        t.dirty = false;
        this.#upload(t);
        return true;
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

    // a tile with nothing in it let go of: no canvases, no sprite (a bare
    // board's empty tiles)
    release(t) {
        if (t.sprite && !t.sprite.destroyed) {
            t.sprite.parent?.removeChild(t.sprite);
            t.sprite.destroy({ texture: true, baseTexture: true });
        }
        t.sprite = null;
        t.canvas = null;
        t.bg = null;
        t.bands = null;
        t.bgAreas = null;
        t.bgDirty = true;
        t.dirty = false;
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
    #lookSeen = null;
    #lookGen = 0;
    // (the tiles painted, the time it took, and the slowest: File's
    // Statistics, Luke 2026-10-25)
    #painted = 0;
    #paintMs = 0;
    #slowest = 0;
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
            // (an actor's picture: its size once it has loaded)
            if (String(id).startsWith(ACTOR_ART)) {
                const z = this.#actorSizes.get(String(id).slice(ACTOR_ART.length));
                return z && !(z instanceof Promise) ? z : null;
            }
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

    // What this client holds and has done (File's Statistics, Luke
    // 2026-10-25): its tiles and how many wait to be painted, their bitmaps'
    // memory, the images loaded and theirs, whether the view has its own
    // sharper tiles, and the tiles painted since the board was drawn
    stats() {
        let tiles = 0;
        let waiting = 0;
        let bytes = 0;
        for (const g of [this.#base, this.#focus, this.#nextFocus]) {
            for (const t of g?.tiles ?? []) {
                tiles++;
                if (t.dirty) waiting++;
                if (t.canvas) bytes += t.canvas.width * t.canvas.height * 4;
                if (t.bg) bytes += t.bg.width * t.bg.height * 4;
            }
        }
        let images = 0;
        let imageBytes = 0;
        for (const e of this.#images.values()) {
            if (!e.full?.ready || !e.full.im) continue;
            images++;
            imageBytes += (e.full.im.width || 0) * (e.full.im.height || 0) * 4;
        }
        return { tiles, waiting, bytes, images, imageBytes, sharp: Boolean(this.#focus && !this.#focus.hidden), painted: this.#painted, paintMs: this.#paintMs, slowest: this.#slowest };
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
            const own = String(id).startsWith(ACTOR_ART);
            const url = own ? String(id).slice(ACTOR_ART.length) : textureUrl(this.#textures, id);
            if (!url) return null;
            e = { full: this.#load(url, true, id), prev: null };
            const pv = own ? null : previewUrl(this.#textures, id);
            if (pv) e.prev = this.#load(pv, false, id);
            this.#images.set(id, e);
        }
        if (e.full.ready) return e.full.im;
        if (e.prev?.ready && e.prev.im) {
            this.short = true;
            return e.prev.im;
        }
        return null;
    }

    #load(url, whole, id) {
        const im = new Image();
        const e = { im: null, ready: false, done: null };
        e.done = new Promise((resolve) => {
            im.onload = () => {
                e.im = whole ? this.#shrunk(im) : Object.assign(im, { preview: true });
                e.ready = true;
                this.#came.add(id);
                this.#arrived();
                resolve();
            };
            im.onerror = () => {
                // (a preview that isn't there: the whole one only)
                e.ready = !whole;
                // (a whole one that can't come is waited for no longer:
                // Luke, 2026-10-21, a picture of the board ran every round)
                e.failed = whole;
                resolve();
            };
        });
        fromAfar(im, url);
        im.src = url;
        return e;
    }

    // An actor's picture's size, { w, h } once loaded (null if it can't be):
    // a moment's wait at most, then the board goes on without it and has it
    // the next time it is drawn
    #actorSizes = new Map();
    #actorSize(src) {
        let z = this.#actorSizes.get(src);
        if (z === undefined) {
            z = new Promise((resolve) => {
                const im = new Image();
                im.onload = () => resolve(im.naturalWidth && im.naturalHeight ? { w: im.naturalWidth, h: im.naturalHeight } : null);
                im.onerror = () => resolve(null);
                fromAfar(im, src);
                im.src = src;
            }).then((size) => {
                this.#actorSizes.set(src, size);
                return size;
            });
            this.#actorSizes.set(src, z);
        }
        if (!(z instanceof Promise)) return z;
        return Promise.race([z, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
    }

    // An image came: where tiles were painted without it, again (a little
    // later, so a burst of arrivals is one repaint). Only the parts of a
    // tile's sheet it lies in (Luke, 2026-10-21: every arrival repainted
    // whole sheets), and the board over a tile only when that was drawn
    // without one of them.
    #came = new Set();
    #arrived = foundry.utils.debounce(() => {
        this.#epoch++;
        const came = this.#came;
        this.#came = new Set();
        for (const grid of [this.#base, this.#focus, this.#nextFocus]) {
            for (const t of grid?.tiles ?? []) {
                if (t.bgUses?.length) {
                    const a = arrivalAreas(t.bgUses, came);
                    t.bgUses = a.rest;
                    if (a.whole) t.bgDirty = true;
                    else for (const box of a.areas) (t.bgAreas ??= []).push(box);
                    if (a.whole || a.areas.length) t.dirty = true;
                }
                if (t.fgIds) for (const id of t.fgIds) if (came.has(id)) t.dirty = true;
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
        // (the painter reads an image's natural size, and keys its ropes and
        // tints by its src: Luke, 2026-10-21, every shrunk image shared one
        // key, so at light detail one rope drew as another)
        c.naturalWidth = c.width;
        c.naturalHeight = c.height;
        c.src = im.src;
        return c;
    }

    // the whole images still coming
    #loading() {
        return [...this.#images.values()].filter((e) => !e.full.ready && !e.full.failed).map((e) => e.full.done);
    }

    clear() {
        this.#ticket++;
        for (const grid of [this.#base, this.#focus, this.#nextFocus]) grid?.destroy();
        this.#base = this.#focus = this.#nextFocus = null;
        this.#sigs = new Map();
        this.#whole = '';
        this.#painter.dropBake();
        // (the strokes' kept layers let go with the board)
        this.#painter.dropLayers();
        this.view = null;
    }

    // The view a viewer ('gm' or 'player') sees of a board (the scene's, or
    // one being edited before it is written)
    async viewOf(scene, viewer, boardJ = boardOf(scene)) {
        const { look: base, textures } = await loadBoardLook(scene);
        this.#textures = textures;
        // (the hands loaded before a note is laid out: writing fitted with
        // the fallback face was kept that size; Luke 2026-10-25, notes
        // resizing themselves every launch)
        await this.#fonts(base);
        // (the board's own sheet: its size and pages, Luke 2026-10-24)
        const look = sheetLook(base, boardJ);
        this.look = look;
        const board = normalizeBoard(boardJ);
        // a landmark of the GM's own takes its actor's name (before its layout
        // writes it); a place the library has no art for takes its actor's
        // picture as its clipping (Luke, 2026-10-21: the library's art first)
        for (const s of Object.values(board.scraps)) {
            if (s.type !== 'landmark') continue;
            const doc = s.uuid || (s.lib && !s.art && !look.library?.[s.lib]?.art) ? placeActor(s, look) : null;
            if (s.uuid && !s.name) s.name = doc?.name ?? '';
            if (s.art || look.library?.[s.lib]?.art || plainIcon(doc?.img)) continue;
            if (await this.#actorSize(doc.img)) s.art = ACTOR_ART + doc.img;
        }
        let view = boardView(look, board, viewer, this.size, this.measure);
        // (the GM's own notes switched off on this client: Plenty finish item 2)
        if (viewer === 'gm' && !gmNotesShown()) view = withoutGmNotes(view);
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
        return Math.min(this.detail.scale, Math.sqrt((this.detail.boardPx ?? MAX_BOARD_PX) / (look.w * look.h)));
    }

    // Paint the scene's board for a viewer and show it: only what changed
    async draw(scene, viewer, boardJ) {
        const ticket = ++this.#ticket;
        const view = await this.viewOf(scene, viewer, boardJ);
        const look = this.look;
        await this.#fonts(look, view);
        if (ticket !== this.#ticket || !canvas.primary || canvas.scene !== scene) return null;
        this.view = view;
        // (a look read again, File, Reload the look, is a new one even when
        // its sheet is the same: Luke, 2026-10-21, new grime or pools never
        // showed until the page was reloaded)
        if (look !== this.#lookSeen) {
            this.#lookSeen = look;
            this.#lookGen++;
        }
        const key = `${JSON.stringify(look.sheet)}${JSON.stringify(look.page)}${look.w}${look.h}#${this.#lookGen}`;
        if (key !== this.lookKey) {
            this.geo = sheetGeometry(look, (id) => this.#textures[id]?.tone ?? null, (id) => this.#textures[id]?.safe ?? null);
            this.lookKey = key;
        }
        this.#painter.set({ look, view, geo: this.geo });
        const k = this.#boardScale(look);
        const whole = JSON.stringify([this.lookKey, k, this.marksOnly, canvas.dimensions.sceneWidth, canvas.dimensions.sceneHeight]);
        const sigs = piecesOf(view, this.#painter);
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
            for (const { box, sheet } of changes(this.#sigs, sigs)) {
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
        // (a bare board's tile nothing reaches: let go, never painted)
        const bare = Boolean(look.bare);
        for (let i = 0; i < queue.length; i++) {
            const { grid, t, rank } = queue[i];
            if (bare && !anyMeets(this.#sigs, grid.reach(t))) {
                grid.release(t);
                continue;
            }
            if (now ? rank !== 0 : i > 0 && performance.now() - start > FRAME_BUDGET) break;
            // (a sheet to paint whole goes a band at a time even for an edit:
            // the frame's budget, at least one band a frame)
            const whole = !t.bg || t.bgDirty || t.bands?.length;
            const until = now && !whole ? null : start + FRAME_BUDGET;
            let done;
            this.#pxs = grid.k;
            const t0 = performance.now();
            try {
                done = grid.paint(t, P, { ...opts, until });
            } finally {
                this.#pxs = null;
                const ms = performance.now() - t0;
                this.#paintMs += ms;
                if (done) {
                    this.#painted++;
                    this.#slowest = Math.max(this.#slowest, ms);
                }
            }
            if (!done && !now) break;
        }
        this.#swapFocus();
        if (queue.some(({ t }) => t.dirty) && !this.#pumping) {
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
            this.syncBase();
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
        this.syncBase();
    }

    // On a bare board (no sheet: a scene's background, or a baked map) the
    // tiles are see-through, so the board's own under the finer ones showed
    // every stroke twice, darker zoomed in (Luke, 2026-10-26: "my color gets
    // lighter when I zoom out"). Never both at once there: the finer ones
    // while they cover the whole view, else the board's own alone (a moment
    // soft, until finer ones are made for the new view). Showing the board's
    // own again under finer ones left in place had flashed a dark rectangle
    // as the view zoomed out (Luke, 2026-10-26). An opaque board's are left
    // as they were: the finer ones over the board's, covered, unseen.
    syncBase() {
        const B = this.#base;
        if (!B) return;
        const F = this.#focus;
        if (!this.look?.bare) {
            if (B.hidden) B.show(true);
            return;
        }
        const v = F ? this.#inView() : null;
        const covered = Boolean(v) && F.x0 <= Math.max(0, v.x0) && F.y0 <= Math.max(0, v.y0) && F.x1 >= Math.min(this.look.w, v.x1) && F.y1 >= Math.min(this.look.h, v.y1);
        if (F && F.hidden === covered) F.show(covered);
        if (B.hidden !== covered) B.show(!covered);
    }

    async #fonts(look, view = null) {
        const faces = [...new Set([...look.fonts.hands, look.fonts.display, ...this.#usedHands(), ...(view?.scraps ?? []).map((s) => s.layout.font)])];
        await Promise.all(faces.map((f) => document.fonts.load(`40px "${f}"`).catch((err) => {
            // (said once a face: writing laid out in the fallback face is
            // sized for it; Luke 2026-10-25, it once resized notes unseen)
            if (!this.#fontsFailed.has(f)) {
                this.#fontsFailed.add(f);
                console.warn(`heart | the hand "${f}" could not be loaded`, err);
            }
            return null;
        })));
    }

    #fontsFailed = new Set();

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
    // (Luke, 2026-10-25: `type` 'webp' or 'png'; { blob, type }, a WebP too
    // large for the format a PNG)
    async snapshot(scene, viewer, scale = 1.5, type = 'png') {
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
                // (the sheet baked without them is painted again; the
                // arrivals' own repaint comes a moment later: Luke, 2026-10-21)
                P.dropBake();
            }
        } finally {
            // (the picture's bake let go; the board on screen is its tiles)
            P.dropBake();
            P.set({ look, view: this.view ?? view, geo: this.geo });
        }
        const webp = type === 'webp' && c.width <= 16383 && c.height <= 16383;
        const blob = await new Promise((resolve) => (webp ? c.toBlob(resolve, 'image/webp', 0.92) : c.toBlob(resolve, 'image/png')));
        return { blob, type: blob?.type || (webp ? 'image/webp' : 'image/png') };
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
