// Symbol detail: the GM's tool for finding people (Luke, 2026-10-28; first
// built 2026-10-27 as "the crowd from afar", a performance switch, which it no
// longer is: tokens are drawn at every zoom).
//
// THE MODE: a GM toggle, off or on, independent of zoom (game.heart.board.symbols
// .get() / .set(on) / .toggle(), the client setting heart.boardSymbols, the
// keybinding Shift+Y, the Hooks event heartSymbolsChanged). While it is on,
// every NPC token (flags.fvtt-heart-toolkit.npc, written by the toolkit's Bring
// in) gets its mark drawn over the board, above the roofs: one neutral dot for
// the crowd, its own sigil (glyph id in the same flag's `sigil`) for each
// named character. Off: nothing but the tokens.
//
// WHO SEES: the GM, and only the GM outside Player view. A player never sees a
// mark, and nobody learns more than the tokens show them.
//
// SIZES: constant in screen px at every zoom, one table (MARK_PX) for Luke to
// tune. Hovering a crowd mark shows nothing; hovering a named sigil shows its
// name; clicking a named sigil selects its token and pans to it. A crowd mark
// takes no pointer at all (the board's tools work through it).
//
// THE NAMED, whatever the mode (Luke, 2026-10-28): their names are always
// shown to the GM (to a player, on hover: Foundry's own hover name, which the
// toolkit gives the named), and the GM sees the named drawn above the roofs at
// every zoom (a copy of the token's face; a player still has roofs hide them).
//
// CHEAP: no per-frame walk. Everything is recomputed on canvasPan only when
// the zoom changed; a mark moves on the token's own refresh (refreshToken:
// moves, resizes, timeline playback, and visibility all come through it).
// Everything above the "runtime" divider is plain functions, tested in node.

import { metrePx } from './baked.js';

// ---- pure --------------------------------------------------------------

// The marks' size on screen, px across, and the names' text size. The named
// are drawn larger than the crowd at every zoom. LUKE'S TO TUNE (2026-10-28:
// sigils 36, the crowd 12).
export const MARK_PX = Object.freeze({ anon: 12, named: 36 });
export const NAME_PX = 18;
// Names of the named, decluttered as Map Dreamer's page does (2026-10-28, board-parity): far out
// (under about 33 screen px a metre, Map Dreamer's "1.5 board px a screen px") the type is 14 px; the
// names nearest the centre of the view are laid first, and one that would sit on a name already laid
// is left out, so a whole-village view shows a readable set and zooming in brings the rest.
export const FAR_NAME_PX = 14;
export const FAR_PX_PER_M = 50 / 1.5;
export const namePx = (pxPerMetre) => (pxPerMetre < FAR_PX_PER_M ? FAR_NAME_PX : NAME_PX);
// `boxes`: [{ id, d (distance from the centre), x0, y0, x1, y1 }] in any order -> the Set of ids kept
export function keepNames(boxes) {
    const laid = [];
    const keep = new Set();
    for (const b of [...boxes].sort((p, q) => p.d - q.d)) {
        if (laid.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
        laid.push(b);
        keep.add(b.id);
    }
    return keep;
}

// The crowd container's z in the interface group: above the board layer (260,
// see layer.js), so a named sigil is hit before the board's catch-all. Only a
// named sigil takes the pointer; the container, the crowd marks, and the names
// take none, so everywhere else the pointer falls through to the board's tools.
export const CROWD_Z = 270;
export const markEventMode = (kind) => (kind === 'named' ? 'static' : 'none');

// The atlas: square cells, `cols` to a row. Cell 0 is the anonymous dot, cell
// 1 the soft halo under a sigil, the sigils follow.
export const ATLAS = Object.freeze({ cell: 64, cols: 8 });

// where the sigils' glyphs are served (the system's own icon set; the sigil
// is "<folder>/<id>", e.g. "skills/hunt")
export const GLYPH_ROOT = 'systems/heart/assets/icons';
const SIGIL = /^[a-z0-9_-]+\/[a-z0-9_-]+$/;
export const glyphUrl = (sigil) => (SIGIL.test(String(sigil ?? '')) ? `${GLYPH_ROOT}/${sigil}.svg` : null);

// 'named' or 'anon' for an NPC token's flags.heart.npc (null: not a Plenty
// NPC, never marked). `named` is written by Place NPCs from the toolkit's
// nameModeOf (board-place.mjs); a token placed before that carries only the
// hover name, which that same rule gave only the named, so it counts too.
export function kindOf(npcFlag, displayNameIsHover = false) {
    if (!npcFlag || typeof npcFlag !== 'object' || !npcFlag.id) return null;
    return npcFlag.named === true || (npcFlag.named === undefined && displayNameIsHover) ? 'named' : 'anon';
}

// Whether this client is the GM looking as the GM (a GM in Player view is a
// player)
export const asGM = ({ gm = false, preview = false } = {}) => Boolean(gm) && !preview;

// Whether this client is shown the mark of an NPC token: the GM, with the
// mode on, for every NPC, named or not, seen or not (through roofs)
export function markShown({ gm = false, preview = false, kind, on = false }) {
    return Boolean(kind) && Boolean(on) && asGM({ gm, preview });
}

// Whether the GM sees this token drawn above the roofs: the named, at every
// zoom, mode or no mode. A player is not shown them there.
export const aboveRoofs = ({ gm = false, preview = false, kind }) => kind === 'named' && asGM({ gm, preview });

// Whether a name is shown now: the named only; the GM always, anyone else
// while hovering
export function nameShown({ gm = false, preview = false, kind, hovered = false }) {
    if (kind !== 'named') return false;
    return asGM({ gm, preview }) ? true : Boolean(hovered);
}

// Whether hovering a mark shows anything: a named sigil's name; a crowd mark
// nothing
export const hoverNames = (kind) => kind === 'named';

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

// the client setting that remembers the mode (registered in notes.js)
export const SYMBOLS_SETTING = 'boardSymbols';
export const SYMBOLS_EVENT = 'heartSymbolsChanged';

let mode = false;
function readMode() {
    try {
        mode = Boolean(game.settings.get('heart', SYMBOLS_SETTING));
    } catch {
        mode = false;
    }
    return mode;
}

// game.heart.board.symbols: the GM's symbol detail mode
export const symbols = {
    get: () => readMode(),
    // (only the GM's; a player's call changes nothing)
    set: async (on = true) => {
        if (!game.user?.isGM) return false;
        await game.settings.set('heart', SYMBOLS_SETTING, Boolean(on));
        return readMode();
    },
    toggle: () => symbols.set(!readMode()),
};

let layer = null; // { box, faceBox, markBox, nameBox, label, marks: Map<tokenId, mark>, extras: Map<tokenId, {face, name}>, atlas, zoom, sigils }

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

function nameText() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = NAME_PX;
    const t = new PIXI.Text('', style);
    t.anchor.set(0.5, 1);
    t.eventMode = 'none';
    return t;
}

function ensureLayer() {
    if (layer) return layer;
    const box = new PIXI.Container();
    box.eventMode = 'passive';
    box.sortableChildren = false;
    // (above the board layer, whose catch-all hit area would take the pointer
    // before a sigil; the box has no hit area of its own, so only a sigil hits)
    box.zIndex = CROWD_Z;
    // (named, so the Foundry check can find the container and read its state
    // through `box.heartCrowd`)
    box.name = 'heartCrowd';
    // (above the roofs and the weather: the interface group)
    canvas.interface.addChild(box);
    // (from the bottom: the named faces, the marks, the names, the hover name)
    const faceBox = new PIXI.Container();
    const markBox = new PIXI.Container();
    const nameBox = new PIXI.Container();
    faceBox.eventMode = 'none';
    nameBox.eventMode = 'none';
    markBox.eventMode = 'passive';
    const label = nameText();
    label.visible = false;
    box.addChild(faceBox, markBox, nameBox, label);
    // (every sigil the scene's tokens carry, found once: one atlas)
    const sigils = new Set();
    for (const t of canvas.tokens?.placeables ?? []) {
        const s = npcOf(t)?.sigil;
        if (glyphUrl(s)) sigils.add(s);
    }
    layer = { box, faceBox, markBox, nameBox, label, marks: new Map(), extras: new Map(), atlas: null, zoom: null, sigils };
    box.heartCrowd = layer;
    return layer;
}

function dropLayer() {
    if (!layer) return;
    try {
        layer.box.destroy({ children: true });
        layer.atlas?.base.destroy();
    } catch (err) {
        console.warn('Heart | the symbol marks could not be let go', err);
    }
    layer = null;
}

// a token's centre in scene px (from its document, so a token being moved by
// the timeline is where it is going to be drawn)
const centreOf = (token) => {
    const d = token.document;
    return d ? { x: d.x + (d.width * canvas.grid.size) / 2, y: d.y + (d.height * canvas.grid.size) / 2 } : token.center;
};

// click: the token selected and the view brought to it (useful under roofs)
function findToken(id) {
    const t = canvas.tokens?.get(id);
    if (!t) return;
    t.control({ releaseOthers: true });
    const c = centreOf(t);
    canvas.animatePan({ x: c.x, y: c.y, duration: 400 });
}

// the mark for a token made, or fetched
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
    const id = token.id;
    if (kind === 'named') {
        m.halo = new PIXI.Sprite(L.atlas.halo);
        m.glyph = new PIXI.Sprite(want ? L.atlas.glyphs.get(want) : L.atlas.dot);
        for (const s of [m.halo, m.glyph]) s.anchor.set(0.5);
        m.halo.eventMode = 'none';
        // (the name on hover; a name already shown is not shown twice)
        m.glyph.on('pointerover', () => showName(id));
        m.glyph.on('pointerout', () => hideName());
        L.markBox.addChild(m.halo, m.glyph);
    } else {
        // (a crowd mark: drawn only, it takes no pointer)
        m.glyph = new PIXI.Sprite(L.atlas.dot);
        m.glyph.anchor.set(0.5);
        L.markBox.addChild(m.glyph);
    }
    // (a named sigil takes the pointer and finds its person on a click; a crowd
    // mark takes none, so the board's tools work right through it)
    m.glyph.eventMode = markEventMode(kind);
    if (kind === 'named') {
        m.glyph.cursor = 'pointer';
        m.glyph.on('pointerdown', (ev) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            findToken(id);
        });
    }
    L.marks.set(token.id, m);
    return m;
}

function placeMark(token, m) {
    const z = layer.zoom ?? canvas.stage.scale.x;
    const c = centreOf(token);
    const px = MARK_PX[m.kind];
    m.glyph.position.set(c.x, c.y);
    m.glyph.scale.set(markScale(px, z));
    if (m.halo) {
        m.halo.position.set(c.x, c.y);
        m.halo.scale.set(markScale(px * 1.5, z));
    }
}

// the GM's named character above the roofs: a copy of its face and its name
function extrasFor(token) {
    const L = ensureLayer();
    let e = L.extras.get(token.id);
    if (e) return e;
    e = { face: new PIXI.Sprite(), name: nameText() };
    e.face.anchor.set(0.5);
    e.face.eventMode = 'none';
    L.faceBox.addChild(e.face);
    L.nameBox.addChild(e.name);
    L.extras.set(token.id, e);
    return e;
}

function placeExtras(token, e, markOn) {
    const z = layer.zoom ?? canvas.stage.scale.x;
    const d = token.document;
    const gs = canvas.grid.size;
    const c = centreOf(token);
    const w = d.width * gs * Math.abs(d.texture?.scaleX ?? 1);
    const h = d.height * gs * Math.abs(d.texture?.scaleY ?? 1);
    const tex = token.texture ?? token.mesh?.texture ?? null;
    if (tex && e.face.texture !== tex) e.face.texture = tex;
    e.face.visible = Boolean(tex?.valid) && !d.hidden;
    if (e.face.visible) {
        e.face.position.set(c.x, c.y);
        e.face.scale.set(w / tex.width, h / tex.height);
    }
    if (e.name.text !== d.name) e.name.text = d.name;
    e.name.scale.set(namePx(z * metrePx(canvas.scene)) / NAME_PX / z);
    // (above the face, or above the sigil when that is the larger)
    const up = Math.max(h / 2, markOn ? MARK_PX.named / 2 / z : 0) + 4 / z;
    e.name.position.set(c.x, c.y - up);
}

// The names shown: those that miss every name nearer the centre of the view (screen px boxes)
let declutterTimer = 0;
export function queueDeclutter() {
    if (declutterTimer) return;
    declutterTimer = setTimeout(() => {
        declutterTimer = 0;
        declutterNames();
    }, 0);
}
function declutterNames() {
    if (!layer || !canvas?.ready) return;
    const z = layer.zoom ?? canvas.stage.scale.x;
    const pivot = canvas.stage.pivot;
    const boxes = [];
    for (const [id, e] of layer.extras) {
        const t = canvas.tokens?.get(id);
        if (!t || e.name.destroyed) continue;
        const w = e.name.width * z;
        const h = e.name.height * z;
        const sx = e.name.position.x * z;
        const sy = e.name.position.y * z;
        boxes.push({ id, d: Math.hypot(e.name.position.x - pivot.x, e.name.position.y - pivot.y), x0: sx - w / 2, x1: sx + w / 2, y0: sy - h, y1: sy });
    }
    const keep = keepNames(boxes);
    for (const [id, e] of layer.extras) if (!e.name.destroyed) e.name.visible = keep.has(id) || !boxes.some((b) => b.id === id);
}

function showName(id) {
    const t = canvas.tokens?.get(id);
    const m = layer?.marks.get(id);
    if (!t || !m || layer.extras.has(id)) return;
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
function letGoExtras(id) {
    const e = layer?.extras.get(id);
    if (!e) return;
    e.face.destroy();
    e.name.destroy();
    layer.extras.delete(id);
}

// One token looked at again: its mark shown or not, and the GM's named copy
// above the roofs. Idempotent.
export function syncToken(token) {
    if (!token?.document || token.isPreview || !isBoard(canvas.scene)) return;
    const kind = kindOf(npcOf(token), token.document.displayName === CONST.TOKEN_DISPLAY_MODES.HOVER);
    const who = { gm: game.user.isGM, preview: Boolean(canvas.heartBoard?.preview), kind };
    const marked = markShown({ ...who, on: mode });
    if (marked) placeMark(token, markFor(token, kind));
    else letGoMark(token.id);
    if (aboveRoofs(who) && nameShown(who)) placeExtras(token, extrasFor(token), marked);
    else letGoExtras(token.id);
    // (a name added, moved, or let go: the names laid again once, after the others)
    queueDeclutter();
}

// Every token again, but only when the zoom changed since last time
function zoomed() {
    if (!isBoard(canvas.scene) || !canvas.ready) return;
    const z = canvas.stage.scale.x;
    if (layer && layer.zoom === z) return;
    ensureLayer().zoom = z;
    for (const t of canvas.tokens.placeables) syncToken(t);
}

// init: the hooks and the key
export function registerCrowd() {
    Hooks.on('canvasReady', () => {
        dropLayer();
        readMode();
        if (!isBoard(canvas.scene)) return;
        ensureLayer().zoom = null;
        zoomed();
    });
    Hooks.on('canvasTearDown', dropLayer);
    Hooks.on('canvasPan', zoomed);
    // (the mode turned on or off, here or by the toolkit's checkbox)
    Hooks.on(SYMBOLS_EVENT, (on) => {
        mode = Boolean(on);
        if (!layer) return;
        layer.zoom = null;
        zoomed();
    });
    // (a move, a resize, timeline playback, a fog or roof change: all come
    // through the token's own refresh)
    Hooks.on('refreshToken', (token, flags) => {
        if (!layer || !flags || !(flags.refreshPosition || flags.refreshSize || flags.refreshVisibility || flags.refreshState)) return;
        syncToken(token);
    });
    // (a new token's first draw sets every refresh flag: it comes through
    // refreshToken too)
    Hooks.on('deleteToken', (doc) => {
        letGoMark(doc.id);
        letGoExtras(doc.id);
    });
    Hooks.on('updateToken', (doc, changes) => {
        if (foundry.utils.hasProperty(changes, `flags.${NPC_FLAG}.npc`) || foundry.utils.hasProperty(changes, 'flags.heart.npc') || 'displayName' in changes || 'name' in changes) syncToken(canvas.tokens?.get(doc.id));
    });
    // Shift+Y: the GM's symbol detail, on or off (Luke, 2026-10-28)
    const { SHIFT } = KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register('heart', 'boardSymbols', {
        name: 'heart.board.key-symbols',
        hint: 'heart.board.key-symbols-hint',
        editable: [{ key: 'KeyY', modifiers: [SHIFT] }],
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: (ctx) => {
            if (ctx?.event?.target?.closest?.('input, textarea, select, [contenteditable]')) return false;
            symbols.toggle().then((on) => ui.notifications?.info(game.i18n.localize(on ? 'heart.board.symbols-on' : 'heart.board.symbols-off')));
            return true;
        },
    });
}
