// A board's baked background, drawn (2026-10-25: the Village of Plenty, and
// any board on a baked map). The manifest's tiles under the board's own
// drawing: the overview always, then the level the zoom needs, loaded as the
// view moves (fetched and decoded off the page's thread), coarser tiles left
// under finer ones until those come, the least recently used let go past the
// quality setting's memory; its overlays and its roofs as the GM switched
// them. The rules are baked.js's; this is the drawing. Design: monorepo
// docs/plans/board-baked-backgrounds.md.
import { cleanManifest, cleanBakedFlags, levelFor, tilesIn, tileUrl, TileCache, overlayShown, overlaySort, shownParts, metrePx, metresPer } from './baked.js';
import { refreshFog } from './fog.js';
import { roofPiecesAt } from './pieces-draw.js';
import { roofAlpha, roofsOpened } from './roof-rule.js';

// (in Foundry's primary group, under the board's own tiles at 100; tokens
// at 700. The roofs over the tokens, under the weather at 1000: Luke
// 2026-10-26, a roof covers the people inside and fades away when the
// pointer is over it)
const SORT = { base: 40, overlays: 50, roofs: 800 };
// how faint a roof goes under the pointer, and how fast it gets there (a
// frame's share of the way)
export const ROOF_FADE = 0.12;
const FADE_STEP = 0.25;

// The roof under the pointer fades (Luke, 2026-10-26: NPCs are hard to
// reach under a roof). One listener for the page, on Foundry's canvas
// element, for whichever board's baked map is showing.
let showing = null;
let hoverBound = false;
function bindHover() {
    if (hoverBound || !canvas?.app?.view) return;
    hoverBound = true;
    const at = (e) => {
        if (!showing?.m || !canvas.ready) return;
        const p = canvas.canvasCoordinatesFromClient({ x: e.clientX, y: e.clientY });
        const d = canvas.dimensions;
        showing.hover(p.x - d.sceneX, p.y - d.sceneY);
    };
    canvas.app.view.addEventListener('pointermove', at, { passive: true });
    canvas.app.view.addEventListener('pointerleave', () => showing?.hover(null, null), { passive: true });
}
// (tiles fetched at once)
const LOADS = 6;
// (a roof's alpha kept this many px across at most, to know what it covers)
const MASK_PX = 96;

export const bakedFlags = (scene) => cleanBakedFlags(scene?.flags?.heart?.baked);

// Which tiles are drawn, which let go (Luke, 2026-10-27: detail follows the
// zoom; near detail when zoomed in, nothing heavy for what covers a few px
// zoomed out). Pure, so the node tests reach it. A piece here is { key, group,
// lvl, rect, pin }: `group` names a stack of levels ('base', or 'o:<overlay
// id>'; null: not in a stack, the overview and the roofs), `lvl` the level's
// index in it (0: the coarsest). `current`: a Map of group to the level the
// zoom needs now.

// whether tiles' rects, which never overlap, cover all of `rect` (to a hair)
export function covers(rect, tiles) {
    const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    if (area <= 0) return true;
    let got = 0;
    for (const t of tiles) {
        const w = Math.min(rect.x1, t.x1) - Math.max(rect.x0, t.x0);
        const h = Math.min(rect.y1, t.y1) - Math.max(rect.y0, t.y0);
        if (w > 0 && h > 0) got += w * h;
    }
    return got >= area * (1 - 1e-6);
}

// The keys the level rule lets be drawn: the current level's tiles; a
// coarser tile only while a finer one over its (in view) area has not all
// arrived (no hole, no overdraw once it has); a finer tile never. `near`:
// the view and its margin, map units.
export function tilesToShow(pieces, current, near) {
    const out = new Set();
    const byLevel = new Map();
    for (const p of pieces) {
        if (p.group === null || !current.has(p.group)) continue;
        const k = `${p.group}|${p.lvl}`;
        if (!byLevel.has(k)) byLevel.set(k, []);
        byLevel.get(k).push(p.rect);
    }
    for (const p of pieces) {
        const cur = current.get(p.group);
        if (p.group === null || cur === undefined || p.lvl === cur) {
            out.add(p.key);
            continue;
        }
        if (p.lvl > cur) continue;
        const r = { x0: Math.max(p.rect.x0, near.x0), y0: Math.max(p.rect.y0, near.y0), x1: Math.min(p.rect.x1, near.x1), y1: Math.min(p.rect.y1, near.y1) };
        let done = false;
        for (let l = p.lvl + 1; l <= cur && !done; l++) done = covers(r, byLevel.get(`${p.group}|${l}`) ?? []);
        if (!done) out.add(p.key);
    }
    return out;
}

// The keys to let go for a zoom: a tile finer than the zoom needs always (it
// is never drawn); with `coarse`, as the level has just changed, a tile that
// is neither the current level nor the next coarser one and is out of view
// at its own level (`inView(rect)`). A pinned piece, and a stack the zoom
// names no level for (an overlay switched off), stays.
// `grace` (Ultra, no compromise; Luke 2026-10-28): one finer level than the
// zoom needs is kept too (never drawn, only not let go), so zooming back in
// is instant; the budget still bounds it.
export function tilesToRelease(pieces, current, inView, coarse, grace = false) {
    const out = [];
    const keepFiner = grace ? 1 : 0;
    for (const p of pieces) {
        if (p.pin || p.group === null) continue;
        const cur = current.get(p.group);
        if (cur === undefined) continue;
        if (p.lvl > cur + keepFiner) out.push(p.key);
        else if (coarse && p.lvl < cur - 1 && !inView(p.rect)) out.push(p.key);
    }
    return out;
}

// manifests by path, each fetched once a page (a failed one asked again)
const manifests = new Map();
export function manifestAt(path) {
    if (!manifests.has(path)) {
        const folder = path.slice(0, path.lastIndexOf('/') + 1);
        const p = fetch(path, { cache: 'no-cache' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => cleanManifest(j, folder))
            .catch(() => null)
            .then((m) => {
                if (!m) manifests.delete(path);
                return m;
            });
        manifests.set(path, p);
    }
    return manifests.get(path);
}

// A manifest read again next time (2026-10-28: a bake rebuilt it on disk since this page
// loaded it; editor-link.js finds that out and loads the baked map again)
export const forgetManifest = (path) => manifests.delete(path);

// a roof's alpha, small: { w, h, a } (a: 0..255 a px)
function alphaMask(bmp) {
    const k = Math.min(1, MASK_PX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return { w, h, a };
}

export class Backdrop {
    // `r`: the board's renderer (its scale and its board-to-canvas mapping)
    constructor(r) {
        this.r = r;
        this.scene = null;
        this.m = null;
        this.flags = null;
        this.cache = null;
        this.layers = null;
        this.items = new Map();
        this.loading = new Set();
        this.failed = new Set();
        this.queue = [];
        this.ticket = 0;
        this.level = null;
        this.current = null;
        this.levelKey = null;
        this.warned = false;
        this.frame = 0;
    }

    get on() {
        return Boolean(this.m);
    }

    // The scene's baked background as its flags name it now: the manifest
    // read again when it is another, the overlays and roofs as switched
    async sync(scene) {
        const flags = bakedFlags(scene);
        if (!flags) return this.clear();
        if (this.scene !== scene || this.flags?.manifest !== flags.manifest || !this.m) {
            this.clear();
            const ticket = this.ticket;
            const m = await manifestAt(flags.manifest);
            if (ticket !== this.ticket || canvas.scene !== scene) return;
            if (!m) {
                if (!this.warned) ui.notifications.warn(game.i18n.format('heart.board.baked-missing', { path: flags.manifest }));
                this.warned = true;
                return;
            }
            this.scene = scene;
            this.m = m;
            this.flags = flags;
            this.cache = new TileCache((this.r.detail?.bakedMB ?? 256) * 1024 * 1024);
            this.#build();
        }
        this.flags = flags;
        this.update();
        // (a roof or the distance switched: the NPC fog looked at again)
        this.retarget();
        refreshFog();
    }

    #build() {
        const make = (sortLayer) => {
            const c = new PIXI.Container();
            c.elevation = 0;
            c.sortLayer = sortLayer;
            c.sort = 0;
            c.sortableChildren = true;
            c.eventMode = 'none';
            canvas.primary.addChild(c);
            return c;
        };
        // (overlaysUnder: an overlay that says "under": "pieces", ground beneath the pieces)
        this.layers = { base: make(SORT.base), overlaysUnder: make(overlaySort({ under: 'pieces' })), overlays: make(overlaySort({})), roofs: make(SORT.roofs) };
        canvas.primary.sortDirty = true;
        // (the roof under the pointer fades: this board's)
        showing = this;
        bindHover();
        const all = { x0: 0, y0: 0, x1: this.m.size.w, y1: this.m.size.h };
        // (the whole map at once, kept: the overview, else level 0's tiles)
        if (this.m.overview) this.#want({ key: 'overview', url: this.m.overview, rect: all, layer: 'base', z: -1, pin: true });
        else for (const t of tilesIn(this.m.levels[0], this.m.tilePx, all, this.m.size)) this.#want({ key: `b:0:${t.x}_${t.y}`, url: tileUrl(this.m.levels[0], t.x, t.y), rect: t.rect, layer: 'base', z: 0, pin: true, group: 'base', lvl: 0 });
        // (every roof at once: small, and the fog needs what each covers)
        for (const roof of this.m.roofs) for (const part of roof.parts) this.#want({ key: `r:${roof.id}/${part.id}`, url: part.image, rect: part.rect, layer: 'roofs', z: 0, pin: true, roof: roof.id, part: part.id, mask: true });
        this.#pump();
    }

    // the view in map units
    #view(u) {
        const scr = canvas.app.renderer.screen;
        const tl = this.r.toMap(canvas.stage.toLocal(new PIXI.Point(0, 0)));
        const br = this.r.toMap(canvas.stage.toLocal(new PIXI.Point(scr.width, scr.height)));
        return { x0: tl.x / u, y0: tl.y / u, x1: br.x / u, y1: br.y / u };
    }

    // On a pan or zoom (a frame at most): the level the zoom needs, its tiles
    // in view wanted, what is shown set, the rest let go past the budget
    update() {
        if (!this.m || this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.#update();
        });
    }

    #update() {
        if (!this.m || !canvas.ready || canvas.scene !== this.scene) return;
        const u = this.#mapPx();
        const view = this.#view(u);
        const res = canvas.app.renderer.resolution || window.devicePixelRatio || 1;
        // (Ultra: a finer level sooner, and more of it round the view: render.js DETAIL)
        const need = canvas.stage.scale.x * this.r.scale * u * res * (this.r.detail?.bakedNeed ?? 1);
        const margin = Math.max(view.x1 - view.x0, view.y1 - view.y0) * (this.r.detail?.bakedMargin ?? 0.25);
        const { tilePx } = this.m;
        const wanted = new Set();
        const L = levelFor(this.m.levels, need);
        this.level = L;
        const li = this.m.levels.indexOf(L);
        for (const t of tilesIn(L, tilePx, view, this.m.size, { margin })) {
            const key = `b:${li}:${t.x}_${t.y}`;
            wanted.add(key);
            this.#want({ key, url: tileUrl(L, t.x, t.y), rect: t.rect, layer: 'base', z: li, group: 'base', lvl: li });
        }
        const current = new Map([['base', li]]);
        const gm = game.user.isGM;
        this.m.overlays.forEach((o, oi) => {
            if (!overlayShown(o, this.flags, gm)) return;
            const ol = levelFor(o.levels, need);
            const oli = o.levels.indexOf(ol);
            current.set(`o:${o.id}`, oli);
            const origin = { x: o.rect.x0, y: o.rect.y0 };
            const size = { w: o.rect.x1 - o.rect.x0, h: o.rect.y1 - o.rect.y0 };
            for (const t of tilesIn(ol, tilePx, view, size, { margin, origin })) {
                const key = `o:${o.id}:${oli}:${t.x}_${t.y}`;
                wanted.add(key);
                this.#want({ key, url: tileUrl(ol, t.x, t.y), rect: t.rect, layer: o.under === 'pieces' ? 'overlaysUnder' : 'overlays', z: oi * 32 + oli, overlay: o.id, group: `o:${o.id}`, lvl: oli });
            }
        });
        // (only what is wanted now waits to load: a view left behind is not fetched)
        this.queue = this.queue.filter((it) => it.pin || wanted.has(it.key));
        // (Luke, 2026-10-27: detail follows the zoom. A finer tile than the
        // zoom needs is let go at once, a far coarser one out of view when the
        // level changed; the budget below is the ceiling on top. A tile's
        // ImageBitmap is closed only with its texture, not before: it may be
        // wanted again if the GPU context is lost.)
        const levelKey = JSON.stringify([...current]);
        const changed = levelKey !== this.levelKey;
        this.levelKey = levelKey;
        const near = { x0: view.x0 - margin, y0: view.y0 - margin, x1: view.x1 + margin, y1: view.y1 + margin };
        const inView = (r) => r.x1 >= near.x0 && r.x0 <= near.x1 && r.y1 >= near.y0 && r.y0 <= near.y1;
        const pieces = [...this.items.values()].map((e) => ({ key: e.key, group: e.group ?? null, lvl: e.lvl ?? 0, rect: e.rect, pin: Boolean(e.pin) }));
        const d = this.r.detail;
        const grace = Boolean(d?.bakedGrace ?? (d?.bakedMB ?? 0) >= 1024);
        for (const key of tilesToRelease(pieces, current, inView, changed, grace)) {
            const e = this.items.get(key);
            if (!e) continue;
            const c = this.cache.items.get(key);
            if (c) {
                this.cache.bytes -= c.bytes;
                this.cache.items.delete(key);
            }
            this.#drop(e);
        }
        this.current = current;
        this.#show(view, margin);
        for (const e of this.cache.prune(new Set([...wanted, ...[...this.items.keys()].filter((k) => this.items.get(k).shownNow)]))) this.#drop(e);
        this.#pump();
    }

    // what is drawn: each piece in view (and a margin) in a layer shown;
    // roofs as switched
    #show(view, margin) {
        const gm = game.user.isGM;
        const near = { x0: view.x0 - margin, y0: view.y0 - margin, x1: view.x1 + margin, y1: view.y1 + margin };
        const meets = (r) => r.x1 >= near.x0 && r.x0 <= near.x1 && r.y1 >= near.y0 && r.y0 <= near.y1;
        const roofsOn = new Set(shownParts(this.m, this.flags).map(({ roof, part }) => `r:${roof.id}/${part.id}`));
        const overlaysOn = new Set(this.m.overlays.filter((o) => overlayShown(o, this.flags, gm)).map((o) => o.id));
        // (the level rule: the zoom's level, a coarser tile only until the
        // finer one over it has come, never a finer one)
        const pieces = [...this.items.values()].map((e) => ({ key: e.key, group: e.group ?? null, lvl: e.lvl ?? 0, rect: e.rect }));
        const drawn = tilesToShow(pieces, this.current ?? new Map(), { x0: near.x0, y0: near.y0, x1: near.x1, y1: near.y1 });
        for (const [key, e] of this.items) {
            let on = e.key === 'overview' || (meets(e.rect) && drawn.has(key));
            if (e.overlay) on &&= overlaysOn.has(e.overlay);
            if (e.roof) on &&= roofsOn.has(key);
            e.shownNow = on;
            if (e.sprite && !e.sprite.destroyed) e.sprite.visible = on;
        }
    }

    // a piece to load (once: a failed one never asked for again this scene)
    #want(it) {
        if (this.items.has(it.key)) {
            this.cache.get(it.key);
            return;
        }
        if (this.loading.has(it.key) || this.failed.has(it.key) || this.queue.some((q) => q.key === it.key)) return;
        this.queue.push(it);
    }

    #pump() {
        while (this.loading.size < LOADS && this.queue.length) this.#load(this.queue.shift());
    }

    async #load(it) {
        const ticket = this.ticket;
        this.loading.add(it.key);
        try {
            const res = await fetch(it.url);
            if (!res.ok) throw new Error(`${res.status}`);
            // (premultiplied: PIXI takes a bitmap's pixels as they are and blends them as premultiplied, so a
            // tile's see-through pixels, which a bake leaves with colour in them, must come with that colour
            // multiplied by their alpha. Without it the painted centre's see-through parts drew as an opaque
            // tan block with a hard edge, and its shadows as dark blocks; 2026-10-28, the parity check)
            const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'premultiply' });
            if (ticket !== this.ticket) {
                bmp.close();
                return;
            }
            const sprite = new PIXI.Sprite(PIXI.Texture.from(bmp));
            sprite.eventMode = 'none';
            sprite.zIndex = it.z;
            this.layers[it.layer].addChild(sprite);
            const e = { ...it, sprite, bmp, bytes: bmp.width * bmp.height * 4, shownNow: false };
            if (it.mask) e.alpha = alphaMask(bmp);
            this.#place(e);
            this.items.set(it.key, e);
            // (a roof's own shape known now: the fog follows it, not its box)
            if (it.mask) {
                this.retarget();
                refreshFog();
            }
            if (!it.pin) this.cache.put(it.key, e, e.bytes);
            // (shown as the next frame sets what is in view)
            this.update();
        } catch {
            // (missing: transparent, as the manifest says; never asked again)
            if (ticket === this.ticket) this.failed.add(it.key);
        } finally {
            this.loading.delete(it.key);
            if (ticket === this.ticket) this.#pump();
        }
    }

    // scene px per one of the map's units (its manifest's: metres), whatever
    // the scene measures in (feet for a 5 ft square; Luke 2026-10-26)
    #mapPx() {
        return metrePx(this.scene) * metresPer(this.m?.unit);
    }

    // a piece where its rect lies on the canvas
    #place(e) {
        const u = this.#mapPx();
        const a = this.r.toCanvas({ x: e.rect.x0 * u, y: e.rect.y0 * u });
        e.sprite.position.set(a.x, a.y);
        e.sprite.width = (e.rect.x1 - e.rect.x0) * u * this.r.scale;
        e.sprite.height = (e.rect.y1 - e.rect.y0) * u * this.r.scale;
    }

    #drop(e) {
        this.items.delete(e.key);
        if (e.sprite && !e.sprite.destroyed) {
            e.sprite.parent?.removeChild(e.sprite);
            e.sprite.destroy({ texture: true, baseTexture: true });
        }
        e.bmp?.close?.();
    }

    // (the map's unit in scene px, for others: the fog)
    get mapPx() {
        return this.m ? this.#mapPx() : 0;
    }

    // Whether a point (scene px, from the scene's top-left) lies under a
    // roof shown: its rect, then its own alpha (the whole rect while its
    // picture is still coming)
    underRoof(x, y) {
        if (!this.m) return false;
        const u = this.#mapPx();
        const mx = x / u;
        const my = y / u;
        // (a roof a player has lifted, a selected token of theirs inside, hides
        // no one; one only stood in, still drawn shut, hides as before)
        const open = this.roofsOpen().lifted;
        for (const { roof, part } of shownParts(this.m, this.flags)) {
            if (open.has(roof.id)) continue;
            const R = part.rect;
            if (mx < R.x0 || mx > R.x1 || my < R.y0 || my > R.y1) continue;
            const A = this.items.get(`r:${roof.id}/${part.id}`)?.alpha;
            if (!A) return true;
            const i = Math.min(A.w - 1, Math.floor(((mx - R.x0) / (R.x1 - R.x0)) * A.w));
            const j = Math.min(A.h - 1, Math.floor(((my - R.y0) / (R.y1 - R.y0)) * A.h));
            if (A.a[j * A.w + i] > 40) return true;
        }
        // (the scene's roof pieces too, by their hulls; Luke 2026-10-28)
        return roofPiecesAt(x, y).some((id) => !open.has(id));
    }

    // what it holds (File's Statistics)
    stats() {
        let bytes = 0;
        for (const e of this.items.values()) bytes += e.bytes;
        return this.m ? { id: this.m.id, rev: this.m.rev, level: this.level?.pxPerUnit ?? null, pieces: this.items.size, loading: this.loading.size + this.queue.length, failed: this.failed.size, bytes, budget: this.cache?.budget ?? 0 } : null;
    }

    // let go of everything (another scene, or none)
    // The roof parts under a point (scene px from the scene's top-left; null:
    // the pointer gone) fade, the rest come back, a little each frame
    hover(x, y) {
        if (!this.m) return;
        const u = this.#mapPx();
        const under = new Set(x === null ? [] : this.#roofsAt(x / u, y / u).map((h) => h.key));
        if (JSON.stringify([...under]) === JSON.stringify([...(this.under ?? [])])) return;
        this.under = under;
        if (!this.fading) this.fading = requestAnimationFrame(() => this.#fade());
    }

    // The player's tokens moved, were selected or let go, came or went (Luke,
    // 2026-10-27: roofs open from inside only): the roofs looked at again
    retarget() {
        this.opened = null;
        if (!this.m) return;
        if (!this.fading) this.fading = requestAnimationFrame(() => this.#fade());
    }

    // For a player, the roofs their tokens are inside ({ inside, lifted }, roof
    // ids; roof-rule.js), found once until a token changes. The GM: none.
    // Selecting a token must clear it too (controlToken calls retarget).
    roofsOpen() {
        if (this.opened) return this.opened;
        const none = { inside: new Set(), lifted: new Set() };
        if (!this.m || game.user.isGM || !canvas.ready) return (this.opened = none);
        const u = this.#mapPx();
        const d = canvas.dimensions;
        const tokens = (canvas.tokens?.placeables ?? []).filter((t) => t.isOwner).map((t) => ({ id: t.id, x: (t.center.x - d.sceneX) / u, y: (t.center.y - d.sceneY) / u }));
        const ctl = new Set((canvas.tokens?.controlled ?? []).map((t) => t.id));
        return (this.opened = roofsOpened(tokens, ctl, (x, y) => [...this.#roofsAt(x, y).map((h) => h.id), ...roofPiecesAt(x * u, y * u)]));
    }

    #fade() {
        this.fading = 0;
        let more = false;
        const gm = game.user.isGM;
        const open = this.roofsOpen();
        for (const [key, e] of this.items) {
            if (!e.roof || !e.sprite || e.sprite.destroyed) continue;
            const want = roofAlpha({ isGM: gm, inside: open.inside.has(e.roof), lifted: open.lifted.has(e.roof), hovered: Boolean(this.under?.has(key)), fade: ROOF_FADE });
            const a = e.sprite.alpha;
            if (Math.abs(a - want) < 0.02) {
                e.sprite.alpha = want;
                continue;
            }
            e.sprite.alpha = a + (want - a) * FADE_STEP;
            more = true;
        }
        if (more) this.fading = requestAnimationFrame(() => this.#fade());
    }

    // the shown roof parts at a map point ({ key, id }: the part's key and its
    // roof's id; its rect, then its own alpha)
    #roofsAt(mx, my) {
        const out = [];
        for (const { roof, part } of shownParts(this.m, this.flags)) {
            const R = part.rect;
            if (mx < R.x0 || mx > R.x1 || my < R.y0 || my > R.y1) continue;
            const key = `r:${roof.id}/${part.id}`;
            const A = this.items.get(key)?.alpha;
            if (A) {
                const i = Math.min(A.w - 1, Math.floor(((mx - R.x0) / (R.x1 - R.x0)) * A.w));
                const j = Math.min(A.h - 1, Math.floor(((my - R.y0) / (R.y1 - R.y0)) * A.h));
                if (A.a[j * A.w + i] <= 40) continue;
            }
            out.push({ key, id: roof.id });
        }
        return out;
    }

    clear() {
        this.opened = null;
        this.ticket++;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        cancelAnimationFrame(this.fading ?? 0);
        this.fading = 0;
        this.under = null;
        if (showing === this) showing = null;
        for (const e of [...this.items.values()]) this.#drop(e);
        this.items.clear();
        for (const c of Object.values(this.layers ?? {})) {
            c.parent?.removeChild(c);
            c.destroy({ children: true });
        }
        this.layers = null;
        this.loading.clear();
        this.failed.clear();
        this.queue = [];
        this.cache = null;
        this.scene = null;
        this.m = null;
        this.flags = null;
        this.level = null;
        this.current = null;
        this.levelKey = null;
    }
}
