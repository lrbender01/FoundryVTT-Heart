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
// now; its board comes here by File, Import (or Sync, once built).
import { normalizePieces, PIECE_LAYERS, pieceHull, pointInPoly } from './model.js';
import { ROOF_FADE } from './backdrop.js';
import { roofAlpha, roofsOpened } from './roof-rule.js';

// (in Foundry's primary group: the baked map's base is at 40, its overlays
// 50, the board's own tiles 100, tokens 700; the roofs over the tokens, as
// the baked roofs are, and fading under the pointer: Luke 2026-10-26)
const SORT = { ground: 41, low: 42, standing: 43, roof: 801, label: 802 };

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
        for (const e of this.items.values()) if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
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
        bindHover();
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
    async sync(scene, raw) {
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
        const keep = new Set();
        for (const id of ids) {
            const p = pieces[id];
            if (!p.img || p.layer === 'people' || !SORT[p.layer]) continue;
            if (p.state === 'hidden' && !gm) continue;
            keep.add(id);
            const sig = JSON.stringify([p.img.url, p.x, p.y, p.w, p.h, p.r, p.z, p.layer, p.state, p.flip]);
            const had = this.items.get(id);
            if (had?.sig === sig) {
                had.sprite.visible = !(p.layer === 'roof' && (lifted[id] || (p.src?.id && lifted[p.src.id])));
                continue;
            }
            const tex = await loadTexture(p.img.url).catch(() => null);
            if (ticket !== this.ticket) return;
            if (!tex) continue;
            let sprite = had?.sprite;
            if (!sprite || sprite.destroyed) {
                sprite = new PIXI.Sprite(tex);
                sprite.eventMode = 'none';
                sprite.anchor.set(0.5, 0.5);
            } else sprite.texture = tex;
            const at = this.r.toCanvas({ x: p.x, y: p.y });
            sprite.position.set(at.x, at.y);
            sprite.width = p.w * this.r.scale;
            sprite.height = p.h * this.r.scale;
            // (mirrored: Luke 2026-10-26)
            if (p.flip) sprite.scale.x = -Math.abs(sprite.scale.x);
            sprite.rotation = ((p.r ?? 0) * Math.PI) / 180;
            sprite.alpha = p.state === 'hidden' ? 0.35 : 1;
            sprite.zIndex = p.z ?? 0;
            sprite.visible = !(p.layer === 'roof' && (lifted[id] || (p.src?.id && lifted[p.src.id])));
            if (sprite.parent !== this.layers[p.layer]) this.layers[p.layer].addChild(sprite);
            this.items.set(id, { sig, sprite, layer: p.layer, piece: p, base: sprite.alpha });
        }
        for (const [id, e] of this.items) {
            if (keep.has(id)) continue;
            if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
            this.items.delete(id);
        }
        this.retarget();
    }

    // how many it draws (File's Statistics)
    stats() {
        return { pieces: this.items.size, layers: PIECE_LAYERS.length };
    }
}
