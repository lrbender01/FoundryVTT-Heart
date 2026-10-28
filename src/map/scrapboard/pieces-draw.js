// A scene's pieces drawn in Foundry (Luke, 2026-10-26: every element of a
// scene its own piece; monorepo docs/board-editor/pieces.md). Each frozen
// piece one sprite of its picture, in its layer, at its place, size, and
// turn; over the baked map, under the board's own drawing (cards, strings,
// pins, strokes) and every token. Only a board with pieces draws any: every
// other board is as it was. Thawed pieces (their own strokes) and people
// (tokens in Foundry) are the editor's.
//
// A hidden piece is the GM's: faint for the GM, never there for a player. A
// roof is lifted by the Map layers switch for its own id or its building's,
// as the baked roofs are. Selecting and moving pieces is Map Dreamer's for
// now; its board comes here in one step from Map Dreamer's published map
// (editor-link.js, 2026-10-28; File, Import still works), and each piece stands
// at its place, turn, and hiding for the scene's clock stage (`times`, as Map
// Dreamer's page resolves them).
import { normalizePieces, normalizeStages, pieceAt, stageOrFirst, PIECE_LAYERS, pieceHull, pointInPoly } from './model.js';
import { ROOF_FADE } from './backdrop.js';
import { roofAlpha, roofsOpened } from './roof-rule.js';
import { splitAnyPath, levelFile, chainFor, pickLevel, drawnPx, readManifest, acquireLevel, releaseLevel } from './token-mips.js';
import { ultraPicked } from './quality.js';

// (in Foundry's primary group: the baked map's base is at 40, its overlays
// 50, the board's own tiles 100, tokens 700; the roofs over the tokens, as
// the baked roofs are, and fading under the pointer: Luke 2026-10-26).
// Overhead (the bunting: Luke 2026-10-28) hangs over the tokens and under the
// roofs: 750, above every token (700) and under the baked roofs (800).
const SORT = { ground: 41, low: 42, standing: 43, overhead: 750, roof: 801, label: 802 };

// the roof pieces under the pointer fade: one listener for the page
let showing = null;
let hoverBound = false;
function bindHover() {
    if (hoverBound || !canvas?.app?.view) return;
    hoverBound = true;
    canvas.app.view.addEventListener('pointermove', (e) => {
        if (!showing?.layers || !canvas.ready) return;
        showing.hover(showing.r.toMap(canvas.canvasCoordinatesFromClient({ x: e.clientX, y: e.clientY })));
    }, { passive: true });
    canvas.app.view.addEventListener('pointerleave', () => showing?.hover(null), { passive: true });
}

// Mip levels (Luke, 2026-10-28): a piece whose folder has a version 2 manifest
// (token-mips.js) is drawn from the smallest baked level its size on screen
// needs, and moves to another level when the zoom settles (never per frame).
// One listener for the page, like the hover above.
let zoomBound = false;
let lastScale = 0;
let settle = 0;
function bindZoom() {
    if (zoomBound) return;
    zoomBound = true;
    Hooks.on('canvasPan', (cv, pos) => {
        const s = Number(pos?.scale ?? cv?.stage?.scale?.x) || 0;
        if (!s || Math.abs(s - lastScale) < 1e-4) return;
        lastScale = s;
        clearTimeout(settle);
        settle = setTimeout(() => showing?.refit(), 150);
    });
}

// The clock stage a scene stands at (2026-10-28): the toolkit's timeline writes it on the scene
// (flags.fvtt-heart-toolkit.timeline.stage; the older clock's flags.fvtt-heart-toolkit.stage).
// A piece's `times` are resolved at it (model.js pieceAt), as Map Dreamer's page resolves them:
// a lantern's lit twin is hidden by day and its unlit twin at dusk, a piece may move or turn.
// With none set, the board's first stage (model.js stageOrFirst). Pure but for the scene.
const TOOLKIT_FLAG = 'fvtt-heart-toolkit';
export const stageOf = (scene) => {
    const f = scene?.flags?.[TOOLKIT_FLAG];
    return f?.timeline?.stage ?? f?.stage ?? null;
};

// The level file's address for a picture in `dir` (the top is the picture itself).
// `v` (2026-10-28): the picture's version, a file time Map Dreamer's publish step
// stamps (board.pictures.json); it goes on every address as ?v=, so a picture
// rewritten in place at the same path is fetched again and never served from a
// browser's cache of the old one. Without one the address is as it was.
export const withVersion = (url, v) => (v ? `${url}${url.includes('?') ? '&' : '?'}v=${v}` : url);
export const pieceLevelUrl = (url, split, level, top, v = null) => (level < top ? withVersion(`${split.dir}/${levelFile(split.name, level, top)}`, v) : withVersion(url, v));

// pictures loaded at once when a board's pieces are first drawn
const LOADS_AT_ONCE = 16;

// Level files that would not load (a mips.json may list a file a bake never wrote): never asked for twice
const missingLevels = new Set();

// The pictures' versions ({ url: stamp }) of the board showing, set when it is brought
// in from Map Dreamer (editor-link.js). Empty for a scene never brought in that way.
let versions = {};
// (true when they are not the ones held: the pieces then need drawing again)
export const setPictureVersions = (map) => {
    const next = map && typeof map === 'object' ? map : {};
    const same = Object.keys(next).length === Object.keys(versions).length && Object.keys(next).every((k) => versions[k] === next[k]);
    versions = next;
    return !same;
};
const versionOf = (url) => versions[url] || null;

// The roof pieces as the Map layers window lists them (Luke, 2026-10-28):
// `pieces` is [{ id, name, building }]; pieces naming the same building
// (`src.id`) group under it, the rest stand alone. Pure.
export function groupRoofPieces(pieces) {
    const groups = new Map();
    const loose = [];
    for (const p of pieces) {
        if (!p.building) {
            loose.push({ id: p.id, name: p.name || p.id });
            continue;
        }
        if (!groups.has(p.building)) groups.set(p.building, []);
        groups.get(p.building).push({ id: p.id, name: p.name || p.id });
    }
    // (a building of one piece is that piece alone)
    const out = [];
    for (const [id, list] of groups) {
        if (list.length > 1) out.push({ id, pieces: list });
        else loose.push(list[0]);
    }
    return { groups: out, loose };
}

// Whether a roof piece is lifted: by its own id or its building's
export const roofLifted = (lifted, id, building) => Boolean(lifted?.[id] || (building && lifted?.[building]));

// The ids of the roof pieces whose hull holds a point and that are not
// lifted. `entries`: [{ id, building, hull }]. Pure.
export function roofPiecesHit(entries, pt, lifted) {
    const out = [];
    for (const e of entries) if (!roofLifted(lifted, e.id, e.building) && pointInPoly(pt, e.hull)) out.push(e.id);
    return out;
}

// The roof pieces drawn now, for the Map layers window: [{ id, name,
// building }] (empty when no board with pieces is showing)
export function drawnRoofPieces() {
    const out = [];
    for (const [id, e] of showing?.items ?? []) if (e.layer === 'roof') out.push({ id, name: e.piece.name, building: e.piece.src?.id ?? null });
    return out;
}

// The roof pieces over a point in scene px from the scene's top-left (the
// NPC fog's and the roofs-open rule's way in); lifted ones hold no one
export function roofPiecesAt(x, y) {
    if (!showing?.scene || !canvas.ready) return [];
    const d = canvas.dimensions;
    const pt = showing.r.toMap({ x: x + d.sceneX, y: y + d.sceneY });
    const entries = [];
    for (const [id, e] of showing.items) if (e.layer === 'roof') entries.push({ id, building: e.piece.src?.id ?? null, hull: pieceHull(e.piece) });
    return roofPiecesHit(entries, pt, showing.scene.flags?.heart?.baked?.roofs ?? {});
}

// A sprite's size and mirror from its piece, whatever texture it holds now
// (the size on the board is the piece's; the level's pixels only set the
// scale). Mirrored: Luke 2026-10-26.
function shape(sprite, p, k) {
    const t = sprite.texture.orig;
    const sx = (p.w * k) / (t.width || 1);
    sprite.scale.set(p.flip ? -sx : sx, (p.h * k) / (t.height || 1));
}

// Let go of the level file an item holds (its sprite is gone or has another)
function dropMip(e) {
    if (e?.mip?.url) releaseLevel(e.mip.url, ultraPicked());
    if (e?.mip) e.mip = null;
}

export class PieceSprites {
    // `r`: the board's renderer (its board-to-canvas mapping and scale)
    constructor(r) {
        this.r = r;
        this.scene = null;
        this.layers = null;
        // id -> { sig, sprite }
        this.items = new Map();
        this.ticket = 0;
    }

    clear() {
        this.ticket++;
        cancelAnimationFrame(this.fading ?? 0);
        this.fading = 0;
        if (showing === this) showing = null;
        clearTimeout(settle);
        for (const e of this.items.values()) {
            if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
            dropMip(e);
        }
        this.items.clear();
        if (this.layers) for (const c of Object.values(this.layers)) if (!c.destroyed) c.destroy({ children: true });
        this.layers = null;
        this.scene = null;
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
        this.layers = Object.fromEntries(Object.entries(SORT).map(([k, s]) => [k, make(s)]));
        canvas.primary.sortDirty = true;
        showing = this;
        lastScale = 0;
        bindHover();
        bindZoom();
    }

    // The level a piece's size on screen needs now, from its chain (the
    // levels ascending, the picture itself last)
    #levelFor(p, chain, split = null, v = null) {
        const res = canvas.app?.renderer?.resolution || window.devicePixelRatio || 1;
        const sizePx = drawnPx(p.w, p.h, this.r.scale, canvas.stage?.scale?.x || 1);
        const quality = ultraPicked() ? 'ultra' : 'auto';
        // (a level file known not to be there is never picked: the next finer one is, so a
        // mips.json that lists a file a bake did not write costs one asked-for file, not a
        // blurry picture at every zoom; 2026-10-28)
        const top = chain[chain.length - 1];
        let levels = chain;
        for (;;) {
            const level = pickLevel({ sizePx, dpr: res, quality, levels });
            if (!split || level >= top || !missingLevels.has(pieceLevelUrl(p.img.url, split, level, top, v))) return level;
            levels = levels.filter((l) => l !== level);
        }
    }

    // The texture a piece starts from: the level it needs (never the full
    // picture unless needed), or its own picture when its folder has no chain
    // for it. Returns { tex, mip } where mip is null with no chain.
    async #texture(p) {
        const split = splitAnyPath(p.img.url);
        const v = versionOf(p.img.url);
        let chain = null;
        try {
            if (split) chain = chainFor(await readManifest(split.dir), split.name);
        } catch {
            chain = null;
        }
        for (let tries = 0; chain && tries < 4; tries++) {
            const level = this.#levelFor(p, chain, split, v);
            const top = chain[chain.length - 1];
            const url = pieceLevelUrl(p.img.url, split, level, top, v);
            try {
                const tex = await acquireLevel(url);
                if (tex?.valid) return { tex, mip: { url, level, want: level, chain, split, top, v } };
                releaseLevel(url, false);
            } catch {
                // (the level would not load)
            }
            // (remembered as missing; the next finer level is tried, the picture's own file at the last)
            if (level >= top) break;
            missingLevels.add(url);
        }
        return { tex: await loadTexture(withVersion(p.img.url, v)), mip: null };
    }

    // Move every piece to the level its size on screen needs now (the zoom
    // settled); the sprite's size, place, and turn do not change
    refit() {
        for (const e of this.items.values()) this.#fit(e);
    }

    async #fit(e, again = 0) {
        const m = e.mip;
        if (!m || !e.sprite || e.sprite.destroyed) return;
        const level = this.#levelFor(e.piece, m.chain, m.split, m.v);
        if (level === m.want) return;
        m.want = level;
        const url = pieceLevelUrl(e.piece.img.url, m.split, level, m.top, m.v);
        let tex = null;
        try {
            tex = await acquireLevel(url);
        } catch {
            tex = null;
        }
        // (a newer zoom wanted another level meanwhile, or the piece went)
        if (!tex?.valid || this.items.get(e.id) !== e || e.sprite.destroyed || e.mip !== m || m.want !== level) {
            if (tex) releaseLevel(url, ultraPicked());
            // (a level that would not load is remembered as missing, and the next finer one is asked for)
            const mine = this.items.get(e.id) === e && e.mip === m && m.want === level;
            if (mine && !tex?.valid && level < m.top) missingLevels.add(url);
            if (mine) m.want = m.level;
            if (mine && !tex?.valid && again < 3) return this.#fit(e, again + 1);
            return;
        }
        e.sprite.texture = tex;
        shape(e.sprite, e.piece, this.r.scale);
        releaseLevel(m.url, ultraPicked());
        m.url = url;
        m.level = level;
    }

    // The roof pieces under a board point fade (null: the pointer gone), the
    // rest come back
    hover(pt) {
        this.pt = pt;
        this.retarget();
    }

    // The roof pieces' alphas worked out again (Luke, 2026-10-27, roofs open
    // from inside only: for a player a roof piece fades or lifts only with one
    // of their tokens inside its hull; roof-rule.js). Called on the pointer
    // and whenever a token moves, is selected or let go, comes or goes.
    retarget() {
        const gm = game.user.isGM;
        const pt = this.pt ?? null;
        // (the player's tokens' centres, in board points)
        const tokens = [];
        const ctl = new Set();
        if (!gm && canvas.ready) {
            for (const t of canvas.tokens?.placeables ?? []) {
                if (!t.isOwner) continue;
                const at = this.r.toMap(t.center);
                tokens.push({ id: t.id, x: at.x, y: at.y });
            }
            for (const t of canvas.tokens?.controlled ?? []) ctl.add(t.id);
        }
        let any = false;
        for (const [id, e] of this.items) {
            if (e.layer !== 'roof' || !e.sprite || e.sprite.destroyed) continue;
            const hull = pieceHull(e.piece);
            const open = roofsOpened(tokens, ctl, (x, y) => (pointInPoly({ x, y }, hull) ? [id] : []));
            const a = roofAlpha({ isGM: gm, inside: open.inside.has(id), lifted: open.lifted.has(id), hovered: Boolean(pt && pointInPoly(pt, hull)), fade: ROOF_FADE });
            const want = a >= 1 ? e.base : a;
            if (Math.abs(e.sprite.alpha - want) > 0.02) any = true;
            e.want = want;
        }
        if (any && !this.fading) this.fading = requestAnimationFrame(() => this.#fade());
    }

    #fade() {
        this.fading = 0;
        let more = false;
        for (const e of this.items.values()) {
            if (e.want === undefined || !e.sprite || e.sprite.destroyed) continue;
            const a = e.sprite.alpha;
            if (Math.abs(a - e.want) < 0.02) e.sprite.alpha = e.want;
            else {
                e.sprite.alpha = a + (e.want - a) * 0.25;
                more = true;
            }
        }
        if (more) this.fading = requestAnimationFrame(() => this.#fade());
    }

    // The scene's pieces as its board has them now: new ones made, changed
    // ones placed again, gone ones let go. `raw`: the board's JSON.
    // (one run at a time; a call made while one runs is run after it, the newest only: two
    // runs at once would each make a sprite for a piece the other had not yet placed)
    sync(scene, raw) {
        this.waiting = [scene, raw];
        if (this.running) return this.running;
        this.running = (async () => {
            try {
                while (this.waiting) {
                    const [s, r] = this.waiting;
                    this.waiting = null;
                    await this.#sync(s, r);
                }
            } finally {
                this.running = null;
            }
        })();
        return this.running;
    }

    async #sync(scene, raw) {
        const pieces = normalizePieces(raw?.pieces);
        const ids = Object.keys(pieces);
        if (!ids.length) return this.clear();
        if (this.scene !== scene || !this.layers) {
            this.clear();
            this.scene = scene;
            this.#build();
        }
        const ticket = this.ticket;
        const gm = game.user.isGM;
        const lifted = scene.flags?.heart?.baked?.roofs ?? {};
        // (the clock: each piece at its place, turn, and hiding at the scene's stage; 2026-10-28)
        const stages = normalizeStages(raw?.stages);
        const stage = stageOrFirst(stageOf(scene), stages);
        const keep = new Set();
        const todo = [];
        let order = 0;
        for (const id of ids) {
            const p = pieces[id];
            order++;
            if (!p.img || p.layer === 'people' || !SORT[p.layer]) continue;
            const now = pieceAt(p, stage, stages);
            if (now.hidden && !gm) continue;
            keep.add(id);
            // (the picture, apart from the place: a stage that only moves or hides a piece keeps its texture)
            const pic = JSON.stringify([p.img.url, versionOf(p.img.url)]);
            const sig = JSON.stringify([pic, now.x, now.y, p.w, p.h, now.r, p.z, p.layer, now.hidden, p.flip]);
            const had = this.items.get(id);
            if (had?.sig === sig) {
                had.sprite.visible = !(p.layer === 'roof' && (lifted[id] || (p.src?.id && lifted[p.src.id])));
                continue;
            }
            todo.push({ id, p, now, pic, sig, had, order });
        }
        // (the pictures load a few at a time, not one after another: a whole map of a thousand
        // pieces came up piece by piece, minutes after the board; 2026-10-28. Sprites are given
        // their order in the board, so the draw order of equal z never depends on which picture
        // came first.)
        let cancelled = false;
        const place = async ({ id, p, now, pic, sig, had, order: n }) => {
            if (cancelled) return;
            let tex = null;
            let mip = null;
            if (had?.pic === pic && had.sprite && !had.sprite.destroyed) {
                // (the same picture: placed again, its texture and level kept)
                mip = had.mip;
            } else {
                const got = await this.#texture(p).catch(() => null);
                if (ticket !== this.ticket) {
                    cancelled = true;
                    if (got?.mip) releaseLevel(got.mip.url, ultraPicked());
                    return;
                }
                if (!got?.tex) return;
                ({ tex, mip } = got);
            }
            let sprite = had?.sprite;
            if (!sprite || sprite.destroyed) {
                sprite = new PIXI.Sprite(tex);
                sprite.eventMode = 'none';
                sprite.anchor.set(0.5, 0.5);
            } else if (tex) {
                sprite.texture = tex;
                // (the level the sprite had before is let go; the new one holds)
                if (had) dropMip(had);
            }
            const at = this.r.toCanvas({ x: now.x, y: now.y });
            sprite.position.set(at.x, at.y);
            shape(sprite, p, this.r.scale);
            sprite.rotation = ((now.r ?? 0) * Math.PI) / 180;
            sprite.alpha = now.hidden ? 0.35 : 1;
            sprite.zIndex = (p.z ?? 0) + n * 1e-6;
            sprite.visible = !(p.layer === 'roof' && (lifted[id] || (p.src?.id && lifted[p.src.id])));
            if (sprite.parent !== this.layers[p.layer]) this.layers[p.layer].addChild(sprite);
            this.items.set(id, { id, sig, pic, sprite, layer: p.layer, piece: p, base: sprite.alpha, mip });
        };
        let next = 0;
        const worker = async () => {
            while (next < todo.length && !cancelled) await place(todo[next++]);
        };
        await Promise.all(Array.from({ length: Math.min(LOADS_AT_ONCE, todo.length) }, worker));
        if (cancelled || ticket !== this.ticket) return;
        for (const [id, e] of this.items) {
            if (keep.has(id)) continue;
            if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
            dropMip(e);
            this.items.delete(id);
        }
        this.retarget();
    }

    // how many it draws (File's Statistics)
    stats() {
        return { pieces: this.items.size, layers: PIECE_LAYERS.length };
    }
}
