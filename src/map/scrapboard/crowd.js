// The crowd from afar (Luke, 2026-10-27: "the crowd could be hidden and
// instead represented with super inexpensive UI element symbols from afar; a
// different symbol for important or unimportant NPCs; unnamed all become the
// same anonymous thing, but named NPCs get a special icon each and always have
// their sigil appear through roofs, and larger than the anonymous ones when
// zoomed out"). Measured basis: the Plenty board's 454 tokens were about half
// the renderer's CPU and 80 percent of the GPU's at the zoomed-out view.
//
// WHAT HAPPENS: a token whose picture would be under SYMBOL_BELOW_PX screen
// pixels across is not drawn at all (HeartBoardToken.isVisible, fog.js, is
// false while the token is a symbol, so PIXI skips it in updateTransform and
// render); a sprite from one tiny atlas stands where it is, in a container
// above the roofs. An anonymous villager is the one neutral dot; a named one
// (flags.fvtt-heart-toolkit.npc.named, written by Place NPCs from the same rule
// that gives it a hover name) is its own sigil, glyph id in the same flag's
// `sigil`, drawn
// larger. Hovering a named sigil shows its name; an anonymous dot shows
// nothing.
//
// WHO SEES: nobody learns where a named villager hides. A player sees a mark
// only for a token that player could see anyway (HeartBoardToken.heartSeen:
// not hidden, not under fog, not under a closed roof). The GM sees every named
// sigil through roofs, and every anonymous mark of a token they could see; the
// GM in Player view is a player here. A player's own tokens are never turned
// into symbols, nor is a selected or dragged one.
//
// CHEAP: no per-frame walk. The switch is recomputed on canvasPan only when the
// zoom changed; a mark moves on the token's own refresh (refreshToken: moves,
// resizes, timeline playback, and visibility all come through it). Everything
// above the "pure" divider is plain functions, tested in node.

// ---- pure --------------------------------------------------------------

// A token becomes its symbol once its picture would be under this many screen
// pixels across. LUKE'S TO TUNE (2026-10-27: "about 16").
export const SYMBOL_BELOW_PX = 16;

// The marks' size on screen, px across. The named are drawn larger than the
// anonymous at every zoom (Luke, 2026-10-27). Also Luke's to tune.
export const MARK_PX = Object.freeze({ anon: 7, named: 22 });

// The atlas: square cells, `cols` to a row. Cell 0 is the anonymous dot, cell
// 1 the soft halo under a sigil, the sigils follow.
export const ATLAS = Object.freeze({ cell: 64, cols: 8 });

// where the sigils' glyphs are served (the system's own icon set; the sigil
// is "<folder>/<id>", e.g. "skills/hunt")
export const GLYPH_ROOT = 'systems/heart/assets/icons';
const SIGIL = /^[a-z0-9_-]+\/[a-z0-9_-]+$/;
export const glyphUrl = (sigil) => (SIGIL.test(String(sigil ?? '')) ? `${GLYPH_ROOT}/${sigil}.svg` : null);

// A token's width on screen (px): its larger side in grid squares, the grid's
// size in scene px, and the stage's scale
export function screenPx(token, gridSize, zoom) {
    const sq = Math.max(Number(token?.width) || 1, Number(token?.height) || 1);
    return sq * (Number(gridSize) || 100) * (Number(zoom) || 1);
}

// Whether a picture this small (screen px) is shown as its symbol instead
export const underSwitch = (px, limit = SYMBOL_BELOW_PX) => Number(px) < limit;

// 'named' or 'anon' for an NPC token's flags.heart.npc (null: not a Plenty
// NPC, never a symbol). `named` is written by Place NPCs from the toolkit's
// nameModeOf (board-place.mjs); a token placed before that carries only the
// hover name, which that same rule gave only the named, so it counts too.
export function kindOf(npcFlag, displayNameIsHover = false) {
    if (!npcFlag || typeof npcFlag !== 'object' || !npcFlag.id) return null;
    return npcFlag.named === true || (npcFlag.named === undefined && displayNameIsHover) ? 'named' : 'anon';
}

// Whether a token is turned into a symbol at this size: a Plenty NPC under the
// switch that is not the viewer's own, selected, or being dragged
export function isSymbol({ kind, px, own = false, controlled = false, preview = false, limit = SYMBOL_BELOW_PX }) {
    if (!kind || own || controlled || preview) return false;
    return underSwitch(px, limit);
}

// Whether this client is shown the mark of a symbol token. `seen`: the token
// would be visible to this client anyway (fog, roof, hidden all weighed).
export function markShown({ gm = false, preview = false, kind, seen }) {
    if (!kind) return false;
    // (the GM sees every named sigil, through roofs; Player view is a player's)
    if (gm && !preview) return kind === 'named' ? true : Boolean(seen);
    return Boolean(seen);
}

// The atlas cells: the dot, the halo, then each sigil (a map of sigil to cell
// index, unique, in order given). Pure, so the layout is testable.
export function atlasLayout(sigils) {
    const index = new Map();
    for (const s of sigils) if (glyphUrl(s) && !index.has(s)) index.set(s, 2 + index.size);
    const count = 2 + index.size;
    const rect = (i) => ({ x: (i % ATLAS.cols) * ATLAS.cell, y: Math.floor(i / ATLAS.cols) * ATLAS.cell, w: ATLAS.cell, h: ATLAS.cell });
    return { index, count, rect, width: ATLAS.cols * ATLAS.cell, height: Math.max(1, Math.ceil(count / ATLAS.cols)) * ATLAS.cell };
}

// A mark's scale for a zoom: `px` on screen, from a cell of ATLAS.cell
export const markScale = (px, zoom) => px / ATLAS.cell / (Number(zoom) || 1);

// ---- runtime -----------------------------------------------------------

// (the toolkit's Place NPCs writes the token's npc flag under its own module id,
// not under "heart": found by the Foundry check, 2026-10-27, when no real token
// was a crowd token. "heart" is read second, for a token made by hand)
export const NPC_FLAG = 'fvtt-heart-toolkit';
const npcOf = (token) => token.document?.flags?.[NPC_FLAG]?.npc ?? token.document?.flags?.heart?.npc;
const isBoard = (scene) => Boolean(scene?.flags?.heart?.board);

let layer = null; // { box, label, marks: Map<tokenId, {halo, glyph, kind}>, atlas, zoom }

function ownToken(t) {
    if (t.actor?.hasPlayerOwner) return true;
    return !game.user.isGM && Boolean(t.isOwner);
}

function makeAtlas(sigils) {
    const L = atlasLayout(sigils);
    const c = document.createElement('canvas');
    c.width = L.width;
    c.height = L.height;
    const g = c.getContext('2d');
    const r0 = L.rect(0);
    // the anonymous dot: pale, with a dark rim so it reads on any ground
    g.beginPath();
    g.arc(r0.x + 32, r0.y + 32, 22, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,14,10,0.9)';
    g.fill();
    g.beginPath();
    g.arc(r0.x + 32, r0.y + 32, 16, 0, Math.PI * 2);
    g.fillStyle = '#d9cdb4';
    g.fill();
    // the halo: a soft dark glow behind a glyph (Luke's glyph style)
    const r1 = L.rect(1);
    const grad = g.createRadialGradient(r1.x + 32, r1.y + 32, 4, r1.x + 32, r1.y + 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(r1.x, r1.y, 64, 64);
    const base = new PIXI.BaseTexture(c, { mipmap: PIXI.MIPMAP_MODES.OFF });
    const tex = (i) => {
        const r = L.rect(i);
        return new PIXI.Texture(base, new PIXI.Rectangle(r.x, r.y, r.w, r.h));
    };
    const out = { L, base, c, g, dot: tex(0), halo: tex(1), glyphs: new Map(), pending: new Map() };
    for (const [s, i] of L.index) out.glyphs.set(s, tex(i));
    // (the glyphs drawn in as their pictures arrive, unmodified, white)
    for (const [s, i] of L.index) {
        const img = new Image();
        img.onload = () => {
            const r = L.rect(i);
            g.drawImage(img, r.x + 8, r.y + 8, 48, 48);
            base.update();
        };
        img.src = glyphUrl(s);
    }
    return out;
}

function ensureLayer() {
    if (layer) return layer;
    const box = new PIXI.Container();
    box.eventMode = 'passive';
    box.sortableChildren = false;
    // (named, so the Foundry check can find the container and read its state
    // through `box.heartCrowd`)
    box.name = 'heartCrowd';
    // (above the roofs and the weather: the interface group)
    canvas.interface.addChild(box);
    const label = new PIXI.Text('', CONFIG.canvasTextStyle.clone());
    label.anchor.set(0.5, 1);
    label.visible = false;
    label.eventMode = 'none';
    // (every sigil the scene's tokens carry, found once: one atlas)
    const sigils = new Set();
    for (const t of canvas.tokens?.placeables ?? []) {
        const s = npcOf(t)?.sigil;
        if (glyphUrl(s)) sigils.add(s);
    }
    layer = { box, label, marks: new Map(), atlas: null, zoom: null, sigils };
    box.heartCrowd = layer;
    box.addChild(label);
    return layer;
}

function dropLayer() {
    if (!layer) return;
    try {
        layer.box.destroy({ children: true });
        layer.atlas?.base.destroy();
    } catch (err) {
        console.warn('Heart | the crowd marks could not be let go', err);
    }
    layer = null;
}

// the mark for a token made, or fetched; null while its atlas is not ready
function markFor(token, kind) {
    const L = ensureLayer();
    const sigil = npcOf(token)?.sigil;
    const want = kind === 'named' && glyphUrl(sigil) ? sigil : null;
    // (a sigil set at the table after the scene drew: the atlas made again
    // with it and every mark looked at again, a rare event)
    if (want && !L.sigils.has(want)) {
        L.sigils.add(want);
        L.atlas?.base.destroy();
        L.atlas = null;
        for (const id of [...L.marks.keys()]) letGoMark(id);
        L.zoom = null;
        setTimeout(zoomed, 0);
    }
    L.atlas ??= makeAtlas([...L.sigils]);
    let m = L.marks.get(token.id);
    if (m && m.sigil === want && m.kind === kind) return m;
    if (m) {
        m.glyph?.destroy();
        m.halo?.destroy();
    }
    m = { kind, sigil: want };
    if (kind === 'named') {
        m.halo = new PIXI.Sprite(L.atlas.halo);
        m.glyph = new PIXI.Sprite(want ? L.atlas.glyphs.get(want) : L.atlas.dot);
        for (const s of [m.halo, m.glyph]) s.anchor.set(0.5);
        // (the name on hover, as the named people's tokens show it)
        m.glyph.eventMode = 'static';
        m.glyph.on('pointerover', () => showName(token.id));
        m.glyph.on('pointerout', () => hideName());
        L.box.addChild(m.halo, m.glyph);
    } else {
        m.glyph = new PIXI.Sprite(L.atlas.dot);
        m.glyph.anchor.set(0.5);
        m.glyph.eventMode = 'none';
        L.box.addChild(m.glyph);
    }
    L.marks.set(token.id, m);
    placeMark(token, m);
    return m;
}

function placeMark(token, m) {
    const z = layer.zoom ?? canvas.stage.scale.x;
    const c = token.document ? { x: token.document.x + (token.document.width * canvas.grid.size) / 2, y: token.document.y + (token.document.height * canvas.grid.size) / 2 } : token.center;
    const px = MARK_PX[m.kind];
    m.glyph.position.set(c.x, c.y);
    m.glyph.scale.set(markScale(px, z));
    if (m.halo) {
        m.halo.position.set(c.x, c.y);
        m.halo.scale.set(markScale(px * 1.5, z));
    }
}

function showName(id) {
    const t = canvas.tokens?.get(id);
    const m = layer?.marks.get(id);
    if (!t || !m) return;
    layer.label.text = t.document.name;
    const z = layer.zoom ?? canvas.stage.scale.x;
    layer.label.scale.set(1 / z);
    layer.label.position.set(m.glyph.x, m.glyph.y - (MARK_PX.named / 2 + 4) / z);
    layer.label.visible = true;
    layer.box.setChildIndex(layer.label, layer.box.children.length - 1);
}
function hideName() {
    if (layer) layer.label.visible = false;
}

function letGoMark(id) {
    const m = layer?.marks.get(id);
    if (!m) return;
    m.glyph?.destroy();
    m.halo?.destroy();
    layer.marks.delete(id);
}

// One token looked at again: symbol or not at this zoom, and its mark shown or
// not. Idempotent; a change of symbol sets the token's visibility to be redone.
export function syncToken(token) {
    if (!token?.document || token.isPreview || !isBoard(canvas.scene)) return;
    const kind = kindOf(npcOf(token), token.document.displayName === CONST.TOKEN_DISPLAY_MODES.HOVER);
    const zoom = canvas.stage.scale.x;
    const px = screenPx(token.document, canvas.grid.size, zoom);
    const sym = isSymbol({ kind, px, own: ownToken(token), controlled: Boolean(token.controlled) });
    if (Boolean(token._heartSymbol) !== sym) {
        token._heartSymbol = sym;
        token.renderFlags?.set({ refreshVisibility: true });
    }
    if (!sym) return letGoMark(token.id);
    const shown = markShown({ gm: game.user.isGM, preview: Boolean(canvas.heartBoard?.preview), kind, seen: Boolean(token.heartSeen) });
    if (!shown) return letGoMark(token.id);
    const m = markFor(token, kind);
    placeMark(token, m);
}

// Every token again, but only when the zoom changed since last time
function zoomed() {
    if (!isBoard(canvas.scene) || !canvas.ready) return;
    const z = canvas.stage.scale.x;
    if (layer && layer.zoom === z) return;
    ensureLayer().zoom = z;
    for (const t of canvas.tokens.placeables) syncToken(t);
    for (const [id, m] of layer.marks) {
        const t = canvas.tokens.get(id);
        if (t) placeMark(t, m);
    }
}

// init: the hooks
export function registerCrowd() {
    Hooks.on('canvasReady', () => {
        dropLayer();
        if (!isBoard(canvas.scene)) return;
        ensureLayer().zoom = null;
        zoomed();
    });
    Hooks.on('canvasTearDown', dropLayer);
    Hooks.on('canvasPan', zoomed);
    // (a move, a resize, timeline playback, a fog or roof change: all come
    // through the token's own refresh)
    Hooks.on('refreshToken', (token, flags) => {
        if (!layer || !flags || !(flags.refreshPosition || flags.refreshSize || flags.refreshVisibility || flags.refreshState)) return;
        syncToken(token);
    });
    // (a new token's first draw sets every refresh flag: it comes through
    // refreshToken too)
    Hooks.on('deleteToken', (doc) => letGoMark(doc.id));
    Hooks.on('updateToken', (doc, changes) => {
        if (foundry.utils.hasProperty(changes, `flags.${NPC_FLAG}.npc`) || foundry.utils.hasProperty(changes, 'flags.heart.npc') || 'displayName' in changes) syncToken(canvas.tokens?.get(doc.id));
    });
    // (a token let go of or picked: its symbol undone or redone)
    Hooks.on('controlToken', (token) => syncToken(token));
}
