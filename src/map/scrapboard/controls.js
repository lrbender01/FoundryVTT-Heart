// The Heart map's editing controls (2026-10-02, Luke: "the controls must
// flow from Foundry"): what a click, a Ctrl+click, a box, a drag, a wheel,
// and a double-click do on the board, with each tool. The one copy both
// editors run: the system's map scene (layer.js) and the Heart Map Board
// mock (which inlines it and adds its expanded menus). Pure: no DOM, no
// Foundry. A host feeds it board points and modifiers, and gets back what to
// do: an action (`{ do: ... }`, which the host carries out with its own
// dialogs and writes), or a patch to apply (`{ scraps: { key: patch },
// link: [id, patch], links: { id: patch }, pins: { id: pin | null } }`).
//
// The host: {
//   view()     the board view (model.js boardView)
//   painter()  the painter (paint.js: a tag's place)
//   size       a texture's size (model.js)
//   user()     { id, isGM, owner } (owner: one of a players' board's owners)
//   px()       board px per screen px (the pointer's reach, the handles' size)
//   raw()      the board JSON (a scrap's added pins, a string's joints)
// }
//
// Move: a press selects (Ctrl adds or takes away; a press on anything
// selected keeps the selection, so a drag moves all of it; a press on the
// empty board clears). The GM and a players' board's owners select cards,
// the board's own pins, and strings; a box takes in the cards and pins
// inside it, and every string whose pins all are. A drag takes hold of, in
// order: the turn handle (the circle at the selection's top-right corner) or
// size handle (the square at its bottom-right), a piece of the one selected
// card (its clipping, tape, pins, writing), a string with Shift (reshape it:
// its taut or slack, and where it pulls) or Ctrl (pin a new joint into it), a
// pin with Ctrl (a new string from it), the selection, a pin, string end,
// joint, junction, or tag, a string (its loose ends and joints), a card this
// user may move, else the empty board (a box). Near a pin or a string, a
// white dot shows what a press would take, and a ring when it has caught it
// (a press within reach takes that). The wheel over a selection turns it
// (Ctrl) or sizes it (Shift). Other players may select and move only their
// own notes and writing, and draw with the marker on their own layer.
import { hitAt, onPaper, onTagAt } from './hits.js';
import { viaFrom, pointInPoly, nearestOnPath, customKey, revealOf, applyPatch, strokeToCard } from './model.js';

// (the patch rule lives with the model; here for the hosts and tests)
export { applyPatch };

export const GM_TOOLS = ['move', 'reveal', 'string', 'pin', 'note', 'write', 'mark', 'erase'];
// (Luke, 2026-10-03: players make strings too, in the sheet's paints, and
// edit their own)
export const PLAYER_TOOLS = ['inspect', 'move', 'note', 'write', 'mark', 'string'];
// a players' board (Luke, 2026-10-02): its owners do anything but reveal
// (nothing on it is hidden from them) or bring in landmarks
export const OWNER_TOOLS = ['move', 'string', 'pin', 'note', 'write', 'mark', 'erase'];
export const toolsFor = (user) => (user?.isGM ? GM_TOOLS : user?.owner ? OWNER_TOOLS : PLAYER_TOOLS);
const DEGREE = Math.PI / 180;
// the reticle: how near (screen px) a pin or string is caught, and how soon
// (ms) the ring shows it is held
export const SNAP = 18;
export const LOCK_MS = 90;
// how near (screen px) a dragged string pin must come to another to join it
export const JOIN = 12;
// the reticle dot's radius, and how far out the corner handles sit (screen px)
export const DOT = 3.5;
export const HANDLE_OFF = DOT * 3;
// (Luke, 2026-10-02) Nothing on the board has a largest size; the least is
// two reticles across (screen px) at the closest zoom, so it can always be
// picked up
export const GRAB = DOT * 4;
const clampS = (s, min = 0.001) => Number(Math.max(min, s).toPrecision(4));
const leastSide = (pts) => {
    if (!pts?.length) return 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]);
        x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]);
        y1 = Math.max(y1, pts[i + 1]);
    }
    return Math.min(x1 - x0, y1 - y0);
};
const round3 = (v) => Math.round(v * 1000) / 1000;
const pt0 = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });

// Whether a user may move a scrap: the GM any; a players' board's owners
// any note or writing; other players only their own
export const mayMove = (s, user) => Boolean(s && user) && (user.isGM || ((s.type === 'note' || s.type === 'scrawl') && (user.owner || s.author === user.id)));

// Whether a user may rub out a marker layer's strokes: an editor any, a
// player their own
export const mayRubOut = (layer, user) => Boolean(user) && (user.isGM || user.owner || layer === user.id);

// A scrap's turn now, in degrees (its own, or the one its seed gave it)
export const turnOf = (s) => (s.r ?? Math.round(((s.layout?.paper?.rot ?? 0) * 180) / Math.PI));

const PIECES = new Set(['end', 'joint', 'join', 'tagPin', 'pin', 'scrapPin', 'tag']);
// the pieces a new string can be run from (Ctrl+drag)
const PINS = new Set(['end', 'joint', 'join', 'tagPin', 'pin', 'scrapPin']);

// The span of a string a path vertex lies in
const spanAt = (l, i) => Math.max(0, l.spans.findIndex((s) => i >= s.from && i < s.to));

// A string's pulls with one span split in two (a new joint) or two merged
// (a joint taken out); the spans either side keep theirs
function pullsSplit(pulls, span) {
    const out = [];
    (pulls ?? []).forEach((p, k) => {
        if (k < span) out[k] = p;
        else if (k > span) out[k + 1] = p;
    });
    return Array.from(out, (p) => p ?? null);
}
function pullsMerge(pulls, w) {
    const out = [];
    (pulls ?? []).forEach((p, k) => {
        if (k < w - 1) out[k] = p;
        else if (k > w) out[k - 1] = p;
    });
    return Array.from(out, (p) => p ?? null);
}

// Whether a point is within `r` of a stroke
// a stroke's box (with half its width round it)
function strokeBox(pts, w) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]);
        x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]);
        y1 = Math.max(y1, pts[i + 1]);
    }
    const p = w / 2;
    return { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p };
}
// Whether a stroke (its points, its width) touches a box anywhere: a point
// in it, or a stretch crossing it
export function strokeMeets(pts, w, B) {
    const p = w / 2;
    const X0 = B.x0 - p;
    const Y0 = B.y0 - p;
    const X1 = B.x1 + p;
    const Y1 = B.y1 + p;
    const inside = (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
    for (let i = 0; i < pts.length; i += 2) {
        if (inside(pts[i], pts[i + 1])) return true;
        if (i + 3 >= pts.length) continue;
        // (Liang-Barsky: the stretch to the next point, clipped to the box)
        const x = pts[i];
        const y = pts[i + 1];
        const dx = pts[i + 2] - x;
        const dy = pts[i + 3] - y;
        let t0 = 0;
        let t1 = 1;
        let hit = true;
        for (const [q, d] of [[x - X0, -dx], [X1 - x, dx], [y - Y0, -dy], [Y1 - y, dy]]) {
            if (d === 0) {
                if (q < 0) { hit = false; break; }
                continue;
            }
            const t = q / d;
            if (d < 0) t0 = Math.max(t0, t);
            else t1 = Math.min(t1, t);
            if (t0 > t1) { hit = false; break; }
        }
        if (hit) return true;
    }
    return false;
}

// a sheet's stroke keeps no author (its layer is who drew it)
const stripBy = ({ by, ...st }) => (void by, st);

function nearStroke(pts, pt, r) {
    for (let i = 0; i < pts.length; i += 2) {
        const x0 = pts[i];
        const y0 = pts[i + 1];
        const x1 = pts[i + 2] ?? x0;
        const y1 = pts[i + 3] ?? y0;
        const sx = x1 - x0;
        const sy = y1 - y0;
        const l2 = sx * sx + sy * sy || 1;
        const u = Math.max(0, Math.min(1, ((pt.x - x0) * sx + (pt.y - y0) * sy) / l2));
        if (Math.hypot(pt.x - (x0 + u * sx), pt.y - (y0 + u * sy)) < r) return true;
    }
    return false;
}

// The corners of a piece's box ({ x, y, w, h, rot }), as a polygon
export function frameOf(p) {
    const c = Math.cos(p.rot ?? 0);
    const s = Math.sin(p.rot ?? 0);
    const out = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = (u * p.w) / 2;
        const ly = (v * p.h) / 2;
        out.push(p.x + lx * c - ly * s, p.y + lx * s + ly * c);
    }
    return out;
}

// Every pin a string is held by (its ends, its joints, its junction)
const pinsOf = (l) => [...(l.ends ?? []), ...(l.joints ?? []), ...(l.junction ? [l.junction] : [])];

export class BoardControls {
    constructor(host) {
        this.host = host;
        // what is selected: cards (their keys), the board's own pins, and
        // strings (ids); `link` is the one string shown in the inspector
        this.selection = new Set();
        // the marker's own select mode (Luke, 2026-10-03): 'draw' or 'select',
        // and the strokes selected (each JSON [where, id]: where a user's
        // layer on the sheet, or '@' and a card's key)
        this.markMode = 'draw';
        this.markSel = new Set();
        // the brush's doodle in hand (a kind of model.js DOODLES), or null
        this.doodle = null;
        // (its wobble: the ghost under the pointer is the very doodle a click
        // lays, then the next is drawn afresh)
        this.doodleN = Math.floor(Math.random() * 1e6);
        this.pins = new Set();
        this.links = new Set();
        this.link = null;
        // one piece of a card, selected alone: { key, id } (Luke, 2026-10-02:
        // then it moves, turns, and sizes by itself)
        this.part = null;
        // where a new string starts (String): { key, at, pt } a point on a
        // scrap, or { pt } a spot on the board
        this.from = null;
        this.drag = null;
        // the grab reticle: { x, y, key, since } what a press would take
        this.grab = null;
    }

    get gm() {
        return Boolean(this.host.user()?.isGM);
    }

    // the GM, or one of a players' board's owners
    get editor() {
        const u = this.host.user();
        return Boolean(u?.isGM || u?.owner);
    }

    may(s) {
        return mayMove(s, this.host.user());
    }

    // A string this user may edit: an editor any, a player their own
    mine(l) {
        if (this.editor) return true;
        const me = this.host.user()?.id;
        return Boolean(me && l?.author && l.author === me);
    }

    // A pin this user may move: an editor any; a player one of theirs (theirs,
    // or held only by strings of theirs)
    minePin(id) {
        if (this.editor) return true;
        const me = this.host.user()?.id;
        const p = this.host.raw()?.pins?.[id];
        const refs = this.#refsOf(id);
        if (refs.length) return refs.every((r) => this.mine(r.link));
        return Boolean(me && p?.author === me);
    }

    // a hit this user may take hold of (a string's, or a pin)
    #mineHit(h) {
        if (!h) return false;
        if (this.editor) return true;
        if (h.kind === 'link') return this.mine(h.item);
        if (h.kind === 'pin') return this.minePin(h.pin.id);
        if (h.kind === 'end' || h.kind === 'joint') {
            if (!this.mine(h.link)) return false;
            const pinId = h.kind === 'end' ? (h.side ? h.link.bPin : h.link.aPin) : h.link.joints?.find((j) => j.idx === h.idx)?.pin;
            return !pinId || this.minePin(pinId);
        }
        return false;
    }

    hit(pt) {
        const view = this.host.view();
        if (!view || !pt) return null;
        return hitAt(view, this.host.painter(), this.host.size, pt, 10 * this.host.px());
    }

    selected() {
        return this.host.view()?.scraps.filter((s) => this.selection.has(s.key)) ?? [];
    }

    // how many things are selected (cards, pins, strings)
    get count() {
        return this.selection.size + this.pins.size + this.links.size + (this.part ? 1 : 0) + (this.bit ? 1 : 0);
    }

    clear() {
        this.markSel?.clear();
        this.selection.clear();
        this.pins.clear();
        this.links.clear();
        this.link = null;
        this.part = null;
        this.bit = null;
    }

    // the card whose pieces show their handles: the one selected, or the one
    // a selected piece belongs to
    // The pins stuck in a card, for its white dots: its own (when shown) and
    // the board's pins in it
    #pinsIn(s) {
        if (!s || s.layout.bare) return [];
        const out = [];
        if (s.layout.pin && !s.layout.pinOff && (!s.tied || s.pinShow)) out.push(s.layout.pin);
        out.push(...(s.layout.pins ?? []));
        for (const p of this.host.view()?.pins ?? []) if (p.on === s.key && !p.hidden) out.push(p);
        return out.map((p) => ({ x: p.x, y: p.y, on: false }));
    }

    #partsCard() {
        if (!this.editor) return null;
        const view = this.host.view();
        if (this.part) return view?.scraps.find((s) => s.key === this.part.key) ?? null;
        return this.selection.size === 1 && !this.pins.size && !this.links.size ? this.selected()[0] ?? null : null;
    }

    // what the corner handles and the wheel act on: a selected piece of a
    // card, one pin of the board's own, or the selected cards
    #target() {
        const view = this.host.view();
        if (this.bit) {
            const b = view?.bits?.find((q) => q.id === this.bit);
            return b ? { type: 'bit', bit: b } : null;
        }
        if (this.part) {
            const s = view?.scraps.find((x) => x.key === this.part.key);
            const p = s?.layout.parts?.find((q) => q.id === this.part.id);
            return p ? { type: 'part', scrap: s, part: p } : null;
        }
        if (this.pins.size === 1 && this.count === 1) {
            const p = view?.pins?.find((q) => this.pins.has(q.id));
            return p ? { type: 'pin', pin: p } : null;
        }
        return this.selection.size ? { type: 'cards' } : null;
    }

    // One string, alone (after it is made, or picked in a list)
    selectLink(id) {
        this.clear();
        if (!id) return;
        this.links.add(id);
        this.link = id;
    }

    // What is no longer on the board (or no longer this user's) drops out
    prune() {
        const view = this.host.view();
        if (this.part && !view?.scraps.some((s) => s.key === this.part.key)) this.part = null;
        if (this.bit && (!this.gm || !view?.bits?.some((b) => b.id === this.bit))) this.bit = null;
        const keys = new Set(view?.scraps.filter((s) => this.may(s)).map((s) => s.key));
        for (const k of [...this.selection]) if (!keys.has(k)) this.selection.delete(k);
        const pins = new Set(this.editor ? view?.pins?.map((p) => p.id) : []);
        for (const id of [...this.pins]) if (!pins.has(id)) this.pins.delete(id);
        const links = new Set(this.editor ? view?.links.map((l) => l.id) : []);
        for (const id of [...this.links]) if (!links.has(id)) this.links.delete(id);
        if (this.link && !links.has(this.link)) this.link = null;
    }

    // The selection's bounds (board px), its size handle (bottom-right) and
    // turn handle (top-right)
    bounds() {
        if (this.markMode === 'select' && this.markSel.size) return this.#strokeBounds();
        const t = this.#target();
        if (!t) return null;
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        const take = (h) => {
            for (let i = 0; i < h.length; i += 2) {
                x0 = Math.min(x0, h[i]);
                x1 = Math.max(x1, h[i]);
                y0 = Math.min(y0, h[i + 1]);
                y1 = Math.max(y1, h[i + 1]);
            }
        };
        if (t.type === 'part') take(frameOf(t.part));
        else if (t.type === 'bit') take(frameOf({ x: t.bit.x, y: t.bit.y, w: t.bit.w, h: t.bit.h, rot: t.bit.rot }));
        else if (t.type === 'pin') take(frameOf({ x: t.pin.x, y: t.pin.y, w: t.pin.w, h: t.pin.w, rot: 0 }));
        else {
            const free = this.selected().filter((s) => !s.locked);
            if (!free.length) return null;
            for (const s of free) take(s.layout.hull);
        }
        // (a small thing's handles stand further off, clear of the thing itself)
        // (Luke, 2026-10-02: compact, 3x the reticle dot's radius out)
        const o = HANDLE_OFF * this.host.px();
        return { x0, y0, x1, y1, c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, handle: { x: x1 + o, y: y1 + o }, rotor: { x: x1 + o, y: y0 - o } };
    }

    #near(pt, p) {
        // (a compact handle takes a press only on itself, never the pin by it)
        const r = 8 * this.host.px();
        return Boolean(p && pt && Math.abs(pt.x - p.x) < r && Math.abs(pt.y - p.y) < r);
    }

    onHandle(pt) {
        const b = this.editor ? this.bounds() : null;
        return this.#near(pt, b?.handle);
    }

    onRotor(pt) {
        const b = this.editor ? this.bounds() : null;
        return this.#near(pt, b?.rotor);
    }

    /* -------------------------------------------- */
    /*  The reticle                                 */
    /* -------------------------------------------- */

    // The grab reticle (Luke, 2026-10-02): the pin (or, failing one, the
    // point on a string) nearest the pointer, within reach; it is held once
    // the pointer has stayed on it LOCK_MS. Returns whether it moved (redraw;
    // the host redraws again after LOCK_MS for the ring).
    hover(pt, tool) {
        // (Move: the editors'; String: anyone's, on the pins a string may tie
        // to, Luke 2026-10-06)
        const g = !pt ? null
            : tool === 'move' && this.editor && !this.onHandle(pt) && !this.onRotor(pt) ? this.#grabAt(pt)
                : tool === 'string' ? this.#grabAt(pt, { pinsOnly: true }) : null;
        const moved = JSON.stringify(g && [g.x, g.y]) !== JSON.stringify(this.grab && [this.grab.x, this.grab.y]);
        if (g) g.since = this.grab?.key === g.key ? this.grab.since : Date.now();
        this.grabTool = tool;
        this.grab = g;
        return moved;
    }

    #grabAt(pt, { pinsOnly = false } = {}) {
        const view = this.host.view();
        if (!view) return null;
        const reach = SNAP * this.host.px();
        let best = null;
        const take = (p, key) => {
            if (!p) return;
            const d = Math.hypot(pt.x - p.x, pt.y - p.y);
            if (d <= reach && (!best || d < best.d)) best = { d, x: p.x, y: p.y, key };
        };
        // (a string's end: the board's own pins this user may tie to)
        if (pinsOnly) {
            for (const p of view.pins ?? []) if (!p.hidden && this.minePin(p.id)) take(p, `pin:${p.id}`);
            if (this.editor) for (const l of view.links) (l.ends ?? []).forEach((p, i) => { if (!p.shared) take(p, `end:${l.id}:${i}`); });
            return best ? { x: best.x, y: best.y, key: best.key } : null;
        }
        // the one selected card's pieces, then every pin (a landmark's pins
        // through its clipping too: Luke 2026-10-06, they showed no reticle)
        for (const p of this.#partsCard()?.layout.parts ?? []) take(p, `part:${p.id}`);
        for (const s of view.scraps) for (const p of s.layout.clipPins ?? []) take(p, `part:${p.id}`);
        const painter = this.host.painter();
        for (const l of view.links) {
            (l.ends ?? []).forEach((p, i) => take(p, `end:${l.id}:${i}`));
            (l.joints ?? []).forEach((p, i) => take(p, `joint:${l.id}:${i}`));
            const T = painter.tagOf(l);
            if (T) {
                take(l.junction, `join:${l.id}`);
                if (!T.over) take(T.pin, `tagPin:${l.id}`);
            }
        }
        for (const p of view.pins ?? []) take(p, `pin:${p.id}`);
        for (const s of view.scraps) {
            if (s.layout.bare) continue;
            if (!s.layout.pinOff && (!s.tied || s.pinShow)) take(s.layout.pin, `scrapPin:${s.key}`);
            (s.layout.pins ?? []).forEach((p, i) => take(p, `scrapPin:${s.key}:${i}`));
        }
        if (best) return { x: best.x, y: best.y, key: best.key };
        // no pin near: the nearest string
        for (const l of view.links) {
            const n = nearestOnPath(l.points, pt);
            if (n.d <= reach && (!best || n.d < best.d)) best = { d: n.d, x: n.x, y: n.y, key: `link:${l.id}` };
        }
        return best ? { x: best.x, y: best.y, key: best.key } : null;
    }

    // What a press does on what the reticle caught (Luke, 2026-10-02: clear
    // directions for the pins)
    #caption(key) {
        const [kind, id] = String(key).split(':');
        if (kind === 'part') return 'click: this alone (then turn, size) · drag: move it on the card';
        if (kind === 'link') return 'drag: move · ctrl+drag: pin a joint in · shift+drag: break it · alt+drag: reshape';
        if (kind === 'scrapPin') return 'drag: move on the card, or off it · ctrl+drag: a new string';
        if (kind === 'pin') {
            const p = this.host.view()?.pins?.find((q) => q.id === id);
            const n = p ? this.#refsOf(p.id).length : 0;
            if (n > 1) return 'drag: move · onto a string pin: join · shift+drag: pull a string off · ctrl+drag: new string · click: turn, size';
            if (n === 1 && this.#refsOf(p.id)[0] && 'idx' in this.#refsOf(p.id)[0]) return 'drag: move · shift+drag: break the string here · onto a string pin: join · ctrl+drag: new string · click: turn, size';
            if (n === 1) return 'drag: move, on a card or off · onto a string pin: join · ctrl+drag: new string · click: turn, size';
            return 'drag: move, on a card or off · ctrl+drag: new string · click: turn, size';
        }
        return 'drag: move · onto a string pin: join · ctrl+drag: new string';
    }

    // a press within reach of the reticle, once its ring shows, takes what it
    // caught (a quick press goes where it lands: a card near a pin stays easy
    // to grab)
    #snap(pt) {
        const g = this.grab;
        if (!g || !pt || Date.now() - g.since < LOCK_MS) return pt;
        return Math.hypot(pt.x - g.x, pt.y - g.y) <= SNAP * this.host.px() ? { x: g.x, y: g.y } : pt;
    }

    // A piece of the one selected card (its clipping, a strip of tape, a pin
    // through the clipping, its writing): only then do they take a press
    // (Luke, 2026-10-02: rearrange a card's pieces by their handles)
    #partAt(pt) {
        const s = this.#partsCard();
        if (!s) return null;
        const r = 9 * this.host.px();
        // (the nearest, where two handles overlap)
        let p = null;
        for (const q of s?.layout.parts ?? []) if (Math.abs(pt.x - q.x) < r && Math.abs(pt.y - q.y) < r && (!p || Math.hypot(pt.x - q.x, pt.y - q.y) < Math.hypot(pt.x - p.x, pt.y - p.y))) p = q;
        return p ? { scrap: s, id: p.id, x: p.x, y: p.y } : null;
    }

    // a pin through a landmark's clipping, on any card (an editor's): a piece
    // of its card, taken by itself
    #clipPinAt(pt) {
        if (!this.editor || !pt) return null;
        const scraps = this.host.view()?.scraps ?? [];
        // (on its head only: a press near it takes the card; the reticle, once
        // it has caught the pin, puts a press right on it)
        for (let i = scraps.length - 1; i >= 0; i--) {
            const s = scraps[i];
            const p = (s.layout.clipPins ?? []).find((q) => Math.hypot(pt.x - q.x, pt.y - q.y) < Math.max(1.5, q.w * 0.3));
            if (p) return { scrap: s, id: p.id, x: p.x, y: p.y };
        }
        return null;
    }

    /* -------------------------------------------- */
    /*  The marks                                   */
    /* -------------------------------------------- */

    // What to draw for the tools (board px): the selected cards' outlines,
    // the selected strings and pins, the handles, a box being dragged, where
    // a new string starts (from: its scrap's outline; fromPt: the point) and
    // the line to where it would end, a stroke being drawn, the eraser, the
    // selected card's pieces' handles, and the grab reticle (locked: its ring).
    // `pointer`: where the pointer is (String, between clicks).
    marks({ pointer = null } = {}) {
        const view = this.host.view();
        const b = this.bounds();
        const d = this.drag;
        const box = (d?.kind === 'box' || d?.kind === 'mbox') && d.to ? d : null;
        const to = d?.kind === 'string' ? d.to ?? null : this.from ? pointer : null;
        const fromPt = this.from?.pt ?? null;
        const strings = new Set([...this.links, ...(this.link ? [this.link] : [])]);
        return {
            hulls: this.selected().map((s) => s.layout.hull),
            // a padlock by each selected card locked to the sheet
            locks: this.selected().filter((s) => s.locked).map((s) => ({ x: s.layout.hull[0], y: s.layout.hull[1] })),
            link: this.link ? view?.links.find((l) => l.id === this.link)?.points ?? null : null,
            strings: [...strings].filter((id) => id !== this.link).map((id) => view?.links.find((l) => l.id === id)?.points).filter(Boolean),
            // (each a small orange dot where the grab dot would be)
            pins: (view?.pins ?? []).filter((p) => this.pins.has(p.id)).map((p) => ({ x: p.x, y: p.y })),
            handle: (this.editor || (this.markMode === 'select' && this.markSel.size)) && b ? b.handle : null,
            rotor: (this.editor || (this.markMode === 'select' && this.markSel.size)) && b ? b.rotor : null,
            box: box ? { x0: Math.min(box.start.x, box.to.x), y0: Math.min(box.start.y, box.to.y), x1: Math.max(box.start.x, box.to.x), y1: Math.max(box.start.y, box.to.y) } : null,
            from: this.from?.key ? view?.scraps.find((s) => s.key === this.from.key)?.layout.hull ?? null : null,
            fromPt,
            line: to && fromPt ? [fromPt, to] : null,
            stroke: d?.kind === 'mark' ? d.pts : null,
            // (begun on a card, it stays on the card: its outline, to keep the
            // stroke being drawn to it; Luke 2026-10-06)
            strokeHull: d?.kind === 'mark' && d.on ? view?.scraps.find((s) => s.key === d.on)?.layout.hull ?? null : null,
            // the marker's selected strokes (select mode), each { pts, w }
            strokes: this.markMode === 'select' && !d?.lifted ? this.#strokes().filter((st) => this.markSel.has(st.key)).map((st) => ({ pts: st.pts, w: st.w })) : [],
            // the strokes being moved, where they are going (drawn as they are)
            moving: d?.lifted ? d.preview ?? [] : [],
            eraser: d?.kind === 'unmark' && d.to ? { ...d.to, r: d.r } : null,
            rubbed: d?.kind === 'unmark' ? [...d.hits].map((k) => JSON.parse(k)) : [],
            // (and the pins in it, a note's as a landmark's: Luke 2026-10-06)
            parts: [...(this.#partsCard()?.layout.parts ?? []).map((p) => ({ ...p, on: this.part?.id === p.id })), ...this.#pinsIn(this.#partsCard())],
            // a selected piece's box
            partBox: (() => { const t = this.#target(); return t?.type === 'part' ? frameOf(t.part) : t?.type === 'bit' ? frameOf({ x: t.bit.x, y: t.bit.y, w: t.bit.w, h: t.bit.h, rot: t.bit.rot }) : null; })(),
            grab: d?.kind === 'string' && d.snap ? { x: d.snap.x, y: d.snap.y, locked: true } : d || !this.grab ? null : { x: this.grab.x, y: this.grab.y, locked: Date.now() - this.grab.since >= LOCK_MS },
            // a few words by the reticle, once it has caught something
            caption: d || !this.grab || Date.now() - this.grab.since < LOCK_MS || this.from || this.grabTool !== 'move' ? null : this.#caption(this.grab.key),
            // a string's pin dragged over another's: where they would join
            join: d?.joinTo ? { x: d.joinTo.x, y: d.joinTo.y } : null,
            // the doodle in hand, where a click would lay it (Luke 2026-10-06)
            doodle: pointer && this.doodle && this.markMode !== 'select' && !d ? { kind: this.doodle, seed: this.doodle + ':' + this.doodleN, at: pt0(pointer) } : null,
        };
    }

    /* -------------------------------------------- */
    /*  Presses                                     */
    /* -------------------------------------------- */

    // A press (mouse down) with a tool. Returns what to do:
    //   { do: 'select' }                     the selection changed (redraw)
    //   { do: 'reveal', scrap | link, to }   its new state
    //   { do: 'refuse', why }                'hidden-place': a string to a hidden place stays hidden
    //   { do: 'string', a, aAt, aPt, b, bAt, bPt, quick, kind }
    //                                        a new string (each end a scrap's
    //                                        key and the point on it, or a
    //                                        point on the board); quick: no
    //                                        asking (a Ctrl+drag from a pin)
    //   { do: 'pin', at, on, uv, quick }     a new pin (ask which, or quick: the last one)
    //   { do: 'add', type, at }              a note or writing ('note'|'scrawl')
    //   { do: 'edit', key }                  a note's or writing's text
    //   { do: 'erase', scrap | link | decor }
    //   { do: 'patch', patch }               an edit to write (a joint or a pin taken out)
    //   { do: 'inspect', scrap }             a player opens a place
    //   { do: 'decor', item }                a decoration was pressed (the mock's)
    press(tool, pt, { ctrl = false, right = false } = {}) {
        // (the corner handles are taken where the pointer is, never snapped away)
        if (tool === 'move' && this.from && this.chaining && ctrl) {
            const end = this.#endAt(pt, this.hit(pt));
            const f = this.from;
            this.from = null;
            if ((f.key && f.key === end.key) || (f.pin && f.pin === end.pin)) return { do: 'select' };
            return this.#stringAction(f, end, { quick: true, chain: true, kind: this.chainKind ?? null, color: this.chainColor ?? null, state: this.chainState ?? null });
        }
        // (Luke, 2026-10-06: right-click locks a card, or lets it go; no menu)
        if (tool === 'move' && right) return this.#lockAt(pt);
        if (tool === 'move') return this.#pressMove(this.onHandle(pt) || this.onRotor(pt) ? pt : this.#snap(pt), ctrl);
        // (a doodle in hand: a click lays it down there, on the card under it
        // or the sheet; Luke 2026-10-06)
        // (never on a right-click: Luke 2026-10-06)
        if (tool === 'mark' && this.doodle && this.markMode !== 'select') {
            if (right) return null;
            const seed = this.doodle + ':' + this.doodleN++;
            return { do: 'doodle', kind: this.doodle, seed, at: pt0(pt), on: this.#cardUnder(pt)?.key ?? null };
        }
        if (tool === 'mark') return this.markMode === 'select' ? this.#pressStroke(pt, ctrl) : null;
        // (String: on the pin the reticle has caught)
        if (tool === 'string') pt = this.#snap(pt);
        const h = this.hit(pt);
        const scrap = h?.kind === 'scrap' ? h.item : null;
        const link = h?.kind === 'link' ? h.item : h?.link ?? null;
        const texty = scrap && (scrap.type === 'note' || scrap.type === 'scrawl');
        if (!this.editor) {
            // (a player's string: ends on their own pins, or anywhere else as
            // new ones; never on another's)
            if (tool === 'string') return this.#pressString(pt, this.#mineHit(h) || h?.kind === 'scrap' ? h : null, { ctrl, right });
            if (tool === 'note' || tool === 'write') {
                if (texty && this.may(scrap)) return { do: 'edit', key: scrap.key };
                return h ? null : { do: 'add', type: tool === 'write' ? 'scrawl' : 'note', at: pt0(pt) };
            }
            return scrap ? { do: 'inspect', scrap } : null;
        }
        if (tool === 'reveal') {
            if (!this.gm) return null;
            if (scrap) return { do: 'reveal', scrap, dir: right ? -1 : 1, to: revealOf(scrap, right ? -1 : 1) };
            if (h?.kind === 'pin') return { do: 'reveal', pin: h.pin, to: h.pin.state === 'hidden' ? 'known' : 'hidden' };
            // a string is drawn or not (two states), and only between places
            // the players may see
            if (link) {
                // (Luke, 2026-10-06: the whole run of strings joined end to end
                // with it, up to where it branches or ends; name tags' threads
                // aren't breaks, and come with their strings)
                const run = this.sectionOf(link);
                const to = link.state === 'hidden' ? 'known' : 'hidden';
                if (to === 'known' && run.some((l) => this.#hiddenEnd(l))) return { do: 'refuse', why: 'hidden-place' };
                const others = run.filter((l) => l.id !== link.id);
                return {
                    do: 'reveal', link, dir: 1, to,
                    also: { links: [...new Set([...others.map((l) => l.id), ...run.flatMap((l) => l.threads ?? [])])], scraps: run.map((l) => l.nameNote).filter(Boolean) },
                };
            }
            return null;
        }
        if (tool === 'string') return this.#pressString(pt, h, { ctrl, right });
        return this.#pressRest(tool, pt, h, { ctrl, right, scrap, link, texty });
    }

    // the String tool: from where the first press was to the second (or to
    // where a drag lets go): on a scrap the end ties on just there, anywhere
    // else it hangs loose; the same scrap twice, or a right-click, lets go
    #pressString(pt, h, { ctrl = false, right = false } = {}) {
        if (right) {
            this.from = null;
            return { do: 'select' };
        }
        const end = this.#endAt(pt, h);
        if (!this.from) {
            this.from = end;
            return { do: 'select' };
        }
        const f = this.from;
        this.from = null;
        if ((f.key && f.key === end.key) || (f.pin && f.pin === end.pin)) return { do: 'select' };
        if (ctrl) this.chaining = true;
        return this.#stringAction(f, end, ctrl ? { quick: true, chain: true } : {});
    }

    #pressRest(tool, pt, h, { ctrl, right, scrap, link, texty }) {
        if (tool === 'pin') {
            if (right) return null;
            const under = this.#scrapUnder(pt);
            return { do: 'pin', at: pt0(pt), on: under?.key ?? null, uv: under ? onPaper(under, pt) : null, quick: ctrl };
        }
        if (tool === 'note' || tool === 'write') {
            if (texty && this.may(scrap)) return { do: 'edit', key: scrap.key };
            return h ? null : { do: 'add', type: tool === 'write' ? 'scrawl' : 'note', at: pt0(pt) };
        }
        if (tool === 'erase') {
            if (h?.kind === 'bit') return this.gm ? { do: 'patch', patch: { bits: { [h.item.id]: null } } } : null;
            if (h?.kind === 'joint') return { do: 'patch', patch: this.#jointOut(h.link, h.idx) };
            // (one of a card's own pieces: a strip of tape, a pin through its
            // clipping, a ring, a web; never its picture or its writing)
            const piece = PIECES.has(h?.kind) || h?.kind === 'link' ? null : this.#pieceAt(pt);
            if (piece) return { do: 'patch', patch: this.dropPatch(piece.scrap.key, piece.id) };
            if (h?.kind === 'pin') return { do: 'remove', what: { scraps: [], pins: [h.pin.id], links: [] } };
            if (h?.kind === 'scrapPin' && this.may(h.scrap)) {
                if (h.idx < 0) return { do: 'patch', patch: { scraps: { [h.scrap.key]: { pinOff: true } } } };
                const pins = [...(this.host.raw()?.scraps?.[h.scrap.key]?.pins ?? [])];
                pins.splice(h.idx, 1);
                return { do: 'patch', patch: { scraps: { [h.scrap.key]: { pins } } } };
            }
            if (scrap && this.may(scrap)) return { do: 'erase', scrap };
            if (link) return { do: 'remove', what: { scraps: [], pins: [], links: [link.id] } };
            if (h?.kind === 'decor' && this.gm) return { do: 'erase', decor: h.item };
        }
        return null;
    }

    #stringAction(f, end, extra = {}) {
        const prep = f.prep || end.prep ? applyPatch(JSON.parse(JSON.stringify(f.prep ?? {})), end.prep ?? {}) : null;
        return {
            do: 'string',
            a: f.pin ? null : f.key ?? null, aAt: !f.pin && f.key ? f.at ?? null : null, aPt: f.pin || f.key ? null : f.pt, aPin: f.pin ?? null,
            b: end.pin ? null : end.key ?? null, bAt: !end.pin && end.key ? end.at ?? null : null, bPt: end.pin || end.key ? null : end.pt, bPin: end.pin ?? null,
            quick: false, kind: null, prep, endPt: end.pt ?? null, ...extra,
        };
    }

    // (Luke, 2026-10-03: Ctrl held, string after string) carry on from a new
    // string's end pin: the next Ctrl+click runs the next string from it
    chainFrom(pin, pt) {
        if (!pin) return;
        this.from = { pin, pt: pt ?? null };
    }

    // Ctrl let go: the chain ends
    endChain() {
        if (!this.chaining) return false;
        this.chaining = false;
        this.chainState = null;
        this.from = null;
        return true;
    }

    // where a string's end goes at a point: on a pin of the board's own
    // (shared), on the scrap under it (just there), or loose
    #endAt(pt, h = this.hit(pt), not = null) {
        if (h?.kind === 'pin') return { pin: h.pin.id, pt: pt0(h.pin) };
        const under = this.#scrapUnder(pt, not);
        return under ? { key: under.key, at: onPaper(under, pt), pt: pt0(pt) } : { pt: pt0(pt) };
    }

    // whether a string runs to a place hidden from the players (tied to it, or
    // held by a pin stuck in it)
    #hiddenEnd(l) {
        const view = this.host.view();
        const scraps = view?.scraps ?? [];
        const onOf = (pin) => (pin ? view?.pins?.find((p) => p.id === pin)?.on ?? null : null);
        return [l.a ?? onOf(l.aPin), l.b ?? onOf(l.bPin)].some((k) => k && scraps.find((s) => s.key === k)?.state === 'hidden');
    }

    // A string's run (Luke, 2026-10-06): it and every string joined to it end
    // to end, pin to pin, until the run branches (a pin holding more), ends,
    // or comes apart (broken); the threads name tags hang by aren't strings
    // of the run
    sectionOf(link) {
        const view = this.host.view();
        const links = (view?.links ?? []).filter((l) => !l.thread);
        const refs = new Map();
        const add = (pin, ref) => { if (pin) (refs.get(pin) ?? refs.set(pin, []).get(pin)).push(ref); };
        for (const l of links) {
            add(l.aPin, { l, end: true });
            add(l.bPin, { l, end: true });
            for (const j of l.joints ?? []) add(j.shared, { l, end: false });
        }
        const out = new Map([[link.id, link]]);
        const todo = [link];
        while (todo.length) {
            const l = todo.pop();
            for (const pin of [l.aPin, l.bPin]) {
                const rs = refs.get(pin) ?? [];
                if (rs.length !== 2 || rs.some((r) => !r.end)) continue;
                const next = rs.find((r) => r.l.id !== l.id)?.l;
                if (next && !out.has(next.id)) {
                    out.set(next.id, next);
                    todo.push(next);
                }
            }
        }
        return [...out.values()];
    }

    #jointOut(l, idx) {
        const raw = this.host.raw()?.links?.[l.id] ?? {};
        const joints = [...(raw.joints ?? [])];
        const [gone] = joints.splice(idx, 1);
        const w = l.waypoints.findIndex((p) => p.kind === 'joint' && p.idx === idx);
        const patch = { link: [l.id, { joints, pulls: pullsMerge(raw.pulls, w) }] };
        // (its pin goes with it, unless another string runs through it)
        if (gone?.pin && this.#refsOf(gone.pin).length <= 1) patch.pins = { [gone.pin]: null };
        return patch;
    }

    #pressMove(pt, ctrl) {
        if (this.onHandle(pt) || this.onRotor(pt)) return null;
        // a card's piece: it alone is selected
        const part = this.#partAt(pt) ?? this.#clipPinAt(pt);
        if (part) {
            this.clear();
            this.part = { key: part.scrap.key, id: part.id };
            return { do: 'select' };
        }
        const h = this.hit(pt);
        if (h?.kind === 'bit') {
            if (!this.gm) return this.#pick(this.#ownCardUnder(pt, null), ctrl);
            this.clear();
            this.bit = h.item.id;
            return { do: 'select' };
        }
        if (h && h.kind !== 'scrapPin' && !this.editor && this.#mineHit(h)) {
            if (h.kind === 'pin') return this.#toggle(this.pins, h.pin.id, ctrl);
            const id = h.kind === 'link' ? h.item.id : h.link.id;
            const r = this.#toggle(this.links, id, ctrl);
            this.link = this.links.has(id) ? id : this.links.size === 1 ? [...this.links][0] : null;
            return r;
        }
        if (this.editor && h) {
            if (h.kind === 'scrapPin') return this.#pick(h.scrap, ctrl);
            if (h.kind === 'pin') return this.#toggle(this.pins, h.pin.id, ctrl);
            if (PIECES.has(h.kind) || h.kind === 'link') {
                const id = h.kind === 'link' ? h.item.id : h.link.id;
                const r = this.#toggle(this.links, id, ctrl);
                this.link = this.links.has(id) ? id : this.links.size === 1 ? [...this.links][0] : null;
                return r;
            }
        }
        if (h?.kind === 'decor') return this.gm ? { do: 'decor', item: h.item } : this.#pick(null, ctrl);
        return this.#pick(h?.kind === 'scrap' ? h.item : this.#ownCardUnder(pt, h), ctrl);
    }

    // a pin or string pressed: Ctrl adds or takes it away; a press on one
    // already selected keeps the rest; otherwise it alone
    #toggle(set, id, ctrl) {
        if (ctrl) {
            if (set.has(id)) set.delete(id);
            else set.add(id);
        } else if (!set.has(id)) {
            this.clear();
            set.add(id);
        }
        return { do: 'select' };
    }

    #pick(scrap, ctrl) {
        if (scrap && this.may(scrap)) {
            if (ctrl) {
                if (this.selection.has(scrap.key)) this.selection.delete(scrap.key);
                else this.selection.add(scrap.key);
            } else if (!this.selection.has(scrap.key)) {
                // (a press on one already selected keeps the rest: a drag moves them all)
                this.clear();
                this.selection.add(scrap.key);
            }
        } else if (!ctrl) this.clear();
        if (!this.links.has(this.link)) this.link = null;
        return { do: 'select' };
    }

    // A double-click with Move: edit a note's or writing's text, open a
    // place (GM) or look at it (a player), or (an editor) a string's kind and
    // name:
    //   { do: 'edit', key } | { do: 'open', scrap } | { do: 'inspect', scrap } | { do: 'editString', link }
    double(tool, pt) {
        if (tool !== 'move') return null;
        const h = this.hit(this.#snap(pt));
        // (a card's own pin, or one of its pieces, opens the card too)
        const part = this.#partAt(pt);
        const card = h?.kind === 'scrap' ? h.item : h?.kind === 'scrapPin' ? h.scrap : part?.scrap ?? null;
        if (card) {
            const s = card;
            if (s.type === 'note' || s.type === 'scrawl') return this.may(s) ? { do: 'edit', key: s.key } : null;
            return { do: this.gm ? 'open' : 'inspect', scrap: s };
        }
        const link = h?.kind === 'link' ? h.item : h?.kind === 'tag' ? h.link : null;
        return link && this.mine(link) ? { do: 'editString', link } : null;
    }

    /* -------------------------------------------- */
    /*  Dragging                                    */
    /* -------------------------------------------- */

    // Take hold at a point (after a press there), with the tool in hand.
    // Returns the kind of drag: 'string' (String, or a Ctrl+drag from a pin:
    // to where it lets go) | 'mark' | 'unmark' (the marker, and rubbing out:
    // `erase`) | 'turn' | 'size' | 'part' | 'pull' | 'joint' | 'piece' |
    // 'move' | 'box' | 'decor' (a decoration: the mock's own) | null
    dragStart(pt, { ctrl = false, shift = false, alt = false, erase = false, tool = 'move' } = {}) {
        this.drag = null;
        if (!pt) return null;
        if (tool === 'string') {
            if (!this.from) return null;
            this.drag = { kind: 'string', start: pt };
            return 'string';
        }
        if (tool === 'mark') {
            // (a doodle in hand: no stroke)
            if (this.doodle && !erase && !shift && this.markMode !== 'select') return null;
            if (!erase && !shift && this.markMode === 'select') return this.#strokeDragStart(pt, ctrl);
            // (a stroke begun on a card is the card's, kept to it; Luke 2026-10-03)
            this.drag = erase || shift
                ? { kind: 'unmark', start: pt, to: pt, r: 14 * this.host.px(), hits: new Set() }
                : { kind: 'mark', start: pt, pts: [Math.round(pt.x), Math.round(pt.y)], on: this.#cardUnder(pt)?.key ?? null };
            if (this.drag.kind === 'unmark') this.#rubOut(pt);
            return this.drag.kind;
        }
        if (tool !== 'move') return null;
        // (Ctrl on a pin is a new string, even where the pin's own handles
        // lie: the heads are small and their handles close)
        // (a pin within the reticle's reach counts at once: over a handle
        // the reticle doesn't show)
        const g = ctrl ? this.#grabAt(pt) : null;
        const caught = g && !/^(part|link):/.test(g.key) ? { x: g.x, y: g.y } : null;
        const snapped = caught ?? this.#snap(pt);
        const h0 = ctrl ? this.hit(snapped) : null;
        const pinFirst = Boolean(h0 && PINS.has(h0.kind) && this.#mineHit(h0));
        if (pinFirst || (!this.onHandle(pt) && !this.onRotor(pt))) pt = snapped;
        // (the reticle is spent: after the drag it must catch again)
        this.grab = null;
        // (the board as the drag found it: each move is worked out from it,
        // never from the move before)
        const raw = JSON.parse(JSON.stringify(this.host.raw() ?? {}));
        if (!pinFirst && (this.onRotor(pt) || this.onHandle(pt))) {
            const b = this.bounds();
            const t = this.#target();
            const turn = this.onRotor(pt);
            const base = { start: pt, c: b.c, a0: Math.atan2(pt.y - b.c.y, pt.x - b.c.x), d0: Math.max(1, Math.hypot(pt.x - b.c.x, pt.y - b.c.y)), target: t, raw };
            // (a card's writing: its box's top-left corner stays, the bottom-right
            // follows the pointer)
            if (!turn && t.type === 'part' && t.part.id === 'text') {
                const f = frameOf(t.part);
                base.anchor = onPaper(t.scrap, { x: f[0], y: f[1] });
            }
            if (t.type === 'cards') {
                if (turn) this.drag = { ...base, kind: 'turn', turns: Object.fromEntries(this.selected().filter((s) => !s.locked).map((s) => [s.key, turnOf(s)])) };
                else this.drag = { ...base, kind: 'size', sizes: Object.fromEntries(this.selected().filter((s) => !s.locked).map((s) => [s.key, s.s ?? 1])) };
            } else this.drag = { ...base, kind: turn ? 'turn' : 'size' };
            return this.drag.kind;
        }
        const part = this.#partAt(pt) ?? this.#clipPinAt(pt);
        if (part) {
            this.clear();
            this.part = { key: part.scrap.key, id: part.id };
            this.drag = { kind: 'part', start: pt, part, raw };
            return 'part';
        }
        const h = this.hit(pt);
        if (h?.kind === 'bit' && this.gm) {
            this.clear();
            this.bit = h.item.id;
            this.drag = { kind: 'bit', start: pt, bit: h.item, raw };
            return 'bit';
        }
        // a string itself (Luke, 2026-10-02): Ctrl pins a new joint into it,
        // Shift breaks it there (the new end comes away with the pointer),
        // Alt reshapes it (where it was grabbed goes where the pointer goes,
        // gravity letting go of that span)
        if (h?.kind === 'link' && this.mine(h.item) && (ctrl || shift || alt)) {
            const l = h.item;
            const near = nearestOnPath(l.points, pt);
            const span = spanAt(l, near.i);
            this.link = l.id;
            if (shift) {
                this.drag = { kind: 'break', start: pt, link: l, span, at: { x: near.x, y: near.y }, raw, ids: this.#freshIds(raw) };
                return 'break';
            }
            if (alt) {
                const S = l.spans[span];
                const along = (from, to) => {
                    let s = 0;
                    for (let i = from; i < to; i++) s += Math.hypot(l.points[2 * i + 2] - l.points[2 * i], l.points[2 * i + 3] - l.points[2 * i + 1]);
                    return s;
                };
                const total = along(S.from, S.to) || 1;
                const done = along(S.from, near.i) + Math.hypot(near.x - l.points[2 * near.i], near.y - l.points[2 * near.i + 1]);
                this.drag = { kind: 'pull', link: l, span, t: Math.max(0.1, Math.min(0.9, done / total)), raw };
                return 'pull';
            }
            const ji = l.waypoints.slice(1, span + 1).filter((w) => w.kind === 'joint').length;
            // (the joint a pin of its own, as every joint is)
            this.drag = { kind: 'joint', link: l, span, ji, raw, pinId: customKey('pin', raw.pins ?? {}) };
            return 'joint';
        }
        // Ctrl+drag a pin: a new string from it to where it lets go, and
        // nothing else moves
        if (ctrl && h && PINS.has(h.kind) && this.#mineHit(h)) {
            this.from = this.#shared(h, raw);
            // (the kind of a string through the pin; a pin holding none, the
            // last kind chosen. Luke, 2026-10-03: every end being a pin, it
            // had always been the default, a delve)
            const through = h.link ?? (h.kind === 'pin' ? this.#refsOf(h.pin.id)[0]?.link : null);
            // (and shown or hidden as it is: Luke 2026-10-06)
            this.drag = { kind: 'string', start: pt, quick: true, linkKind: through?.kind ?? null, linkColor: through?.color ?? null, linkState: through?.state ?? null, raw };
            return 'string';
        }
        // the selection, when the press was on any of it and there is more
        // than the one thing
        const inSel = (h?.kind === 'scrap' && this.selection.has(h.item.key)) || (h?.kind === 'pin' && this.pins.has(h.pin.id))
            || ((h?.kind === 'link' || (h && PIECES.has(h.kind) && h.link)) && this.links.has(h.kind === 'link' ? h.item.id : h.link.id));
        if (this.editor && inSel && this.count > 1) return this.#moveStart(pt, raw);
        if (shift && h?.kind === 'pin' && this.#mineHit(h)) {
            const refs = this.#refsOf(h.pin.id);
            // pins where strings meet: one comes away
            if (refs.length > 1) {
                this.drag = { kind: 'split', start: pt, pin: h.pin, refs, raw, newId: customKey('pin', raw.pins ?? {}) };
                return 'split';
            }
            // a joint of one string: the string breaks there
            if (refs.length === 1 && 'idx' in refs[0]) {
                this.drag = { kind: 'break', start: pt, link: refs[0].link, joint: refs[0].idx, pinId: h.pin.id, raw, ids: this.#freshIds(raw) };
                return 'break';
            }
        }
        // (Luke, 2026-10-02: grab a card and it moves with every pin stuck in
        // it; grab a pin and only the pin moves, on its card or off it)
        if (h && PIECES.has(h.kind) && (this.editor || (h.kind !== 'scrapPin' && this.#mineHit(h)))) {
            this.drag = { kind: 'piece', h, start: pt, T: h.link ? this.host.painter().tagOf(h.link) : null, raw, src: this.#sourceOf(h) };
            // a scrap's own (or added) pin dragged off its paper becomes a
            // pin of the board's own
            if (h.kind === 'scrapPin') this.drag.pinId = customKey('pin', this.host.raw()?.pins ?? {});
            return 'piece';
        }
        // a string by itself: its loose ends and joints go with the pointer
        if (h?.kind === 'link' && this.mine(h.item)) {
            if (!this.links.has(h.item.id)) this.selectLink(h.item.id);
            return this.#moveStart(pt, raw);
        }
        if (h?.kind === 'decor' && this.gm) {
            this.drag = { kind: 'decor', item: h.item, start: pt };
            return 'decor';
        }
        // (a player pressing on their own card's pin takes the card: they may
        // not move pins; Luke 2026-10-03, a note that wouldn't move)
        const held = this.#ownCardUnder(pt, h);
        const scrap = h?.kind === 'scrap' && this.may(h.item) ? h.item : held;
        if (scrap && !scrap.locked) {
            if (!this.selection.has(scrap.key)) {
                if (!ctrl) this.clear();
                this.selection.add(scrap.key);
            }
            return this.#moveStart(pt, raw);
        }
        this.drag = { kind: 'box', start: pt, ctrl };
        return 'box';
    }

    // the whole selection taken hold of: its cards, its loose pins, and its
    // strings' loose ends and joints
    #moveStart(pt, raw) {
        const from = Object.fromEntries(this.selected().filter((s) => !s.locked).map((s) => [s.key, { x: s.x, y: s.y }]));
        const pins = Object.fromEntries([...this.pins].map((id) => [id, raw.pins?.[id]]).filter(([, p]) => p && !p.on && Number.isFinite(p.x)).map(([id, p]) => [id, { x: p.x, y: p.y }]));
        const links = Object.fromEntries([...this.links].map((id) => [id, raw.links?.[id]]).filter(([, l]) => l).map(([id, l]) => [id, { aPt: l.a ? null : l.aPt ?? null, bPt: l.b ? null : l.bPt ?? null, joints: l.joints ?? [] }]));
        this.drag = { kind: 'move', start: pt, from, pins, links };
        return 'move';
    }

    // where a new string from a pin starts: on the scrap it is in (just
    // there), or the pin's own point
    #anchorOf(h) {
        const view = this.host.view();
        const onScrap = (key, p) => {
            const s = view?.scraps.find((x) => x.key === key);
            return s ? { key, at: onPaper(s, p), pt: pt0(p) } : { pt: pt0(p) };
        };
        switch (h.kind) {
            case 'end': {
                const p = h.link.ends[h.side];
                const key = h.side ? h.link.b : h.link.a;
                return key ? onScrap(key, p) : { pt: pt0(p) };
            }
            case 'joint': return { pt: pt0(h.link.joints.find((j) => j.idx === h.idx)) };
            case 'join': return { pt: pt0(h.link.junction) };
            case 'tagPin': return { pt: pt0(this.host.painter().tagOf(h.link)?.pin ?? h.link.junction) };
            case 'pin': return h.pin.on ? onScrap(h.pin.on, h.pin) : { pt: pt0(h.pin) };
            case 'scrapPin': return onScrap(h.scrap.key, h.idx < 0 ? h.scrap.layout.pin : h.scrap.layout.pins[h.idx]);
            default: return null;
        }
    }

    // the marker strokes the eraser touches (on the layers shown, that this
    // user may rub out)
    #rubOut(pt) {
        const d = this.drag;
        const user = this.host.user();
        for (const st of this.#strokes()) if (mayRubOut(st.by, user) && nearStroke(st.pts, pt, d.r + st.w / 2)) d.hits.add(st.key);
    }

    // The board as the drag would leave it (a patch), or { marks: true } when
    // only the tools' marks change (a box, a string's line, a stroke)
    dragMove(pt) {
        const d = this.drag;
        if (!d || !pt) return null;
        if (d.kind === 'box' || d.kind === 'string') {
            d.to = pt;
            // (a new string's end: the pin within reach, shown by the reticle)
            if (d.kind === 'string') d.snap = this.#grabAt(pt, { pinsOnly: true });
            return { marks: true };
        }
        if (d.kind === 'mbox') {
            d.to = pt;
            return { marks: true };
        }
        if (d.kind === 'mmove' || d.kind === 'msize' || d.kind === 'mturn') {
            // (Luke, 2026-10-03: shown as it goes) the strokes taken off where
            // they were, once; then drawn over the board where they are going
            // (marks().moving), the board left as it is until they are let go
            d.patch = this.#strokesPatch(d, pt);
            if (!d.lifted) {
                d.lifted = true;
                const off = { marks: {}, scraps: {} };
                for (const st of d.chosen) {
                    if (st.where.startsWith('@')) (off.scraps[st.where.slice(1)] ??= { marks: {} }).marks[st.id] = null;
                    else (off.marks[st.where] ??= {})[st.id] = null;
                }
                return off;
            }
            return { marks: true };
        }
        if (d.kind === 'mark') {
            const n = d.pts.length;
            if (Math.hypot(pt.x - d.pts[n - 2], pt.y - d.pts[n - 1]) >= 3 * this.host.px()) d.pts.push(Math.round(pt.x), Math.round(pt.y));
            return { marks: true };
        }
        if (d.kind === 'unmark') {
            // (everything the eraser passed over since the last move)
            const from = d.to ?? pt;
            const n = Math.max(1, Math.ceil(Math.hypot(pt.x - from.x, pt.y - from.y) / (d.r / 2)));
            for (let i = 1; i <= n; i++) this.#rubOut({ x: from.x + ((pt.x - from.x) * i) / n, y: from.y + ((pt.y - from.y) * i) / n });
            d.to = pt;
            return { marks: true };
        }
        if (d.kind === 'decor') return null;
        if (d.kind === 'break') {
            d.patch = this.#breakPatch(pt);
            return d.patch;
        }
        if (d.kind === 'split') {
            d.patch = this.#splitPatch(pt);
            return d.patch;
        }
        d.patch = this.#patchFor(pt);
        // over another string's pin: they would join there
        d.joinTo = d.src ? this.#joinTarget(pt, d.src) : null;
        return d.patch;
    }

    // Let go: the patch to write, { select: true } after a box, or an action
    // (String: the new string; the marker: { do: 'mark', pts } a stroke, or
    // { do: 'unmark', strokes: [[layer, id]] } those rubbed out)
    dragEnd() {
        const d = this.drag;
        this.drag = null;
        this.grab = null;
        if (!d) return null;
        if (d.kind === 'mark') return d.pts.length >= 4 ? { do: 'mark', pts: d.pts, on: d.on, patch: d.on ? this.#cardStrokePatch(d.on, d.pts) : null } : null;
        if (d.kind === 'mbox') {
            if (!d.to) return { select: true };
            const B = { x0: Math.min(d.start.x, d.to.x), y0: Math.min(d.start.y, d.to.y), x1: Math.max(d.start.x, d.to.x), y1: Math.max(d.start.y, d.to.y) };
            // (any stroke it touches, not only those wholly in it: Luke 2026-10-06)
            for (const st of this.#strokes()) {
                if (!mayRubOut(st.by, this.host.user())) continue;
                if (strokeMeets(st.pts, st.w, B)) this.markSel.add(st.key);
            }
            return { select: true };
        }
        if (d.kind === 'mmove' || d.kind === 'msize' || d.kind === 'mturn') {
            if (d.nextSel) this.markSel = d.nextSel;
            return d.patch ?? null;
        }
        if (d.kind === 'unmark') return d.hits.size ? { do: 'unmark', strokes: [...d.hits].map((k) => JSON.parse(k)) } : null;
        if (d.kind === 'string') {
            const f = this.from;
            this.from = null;
            if (!d.to || !f) return { select: true };
            if (d.snap) d.to = { x: d.snap.x, y: d.snap.y };
            const h = this.hit(d.to);
            const end = h && PINS.has(h.kind) && h.kind !== 'pin' && d.quick ? this.#shared(h, d.raw ?? JSON.parse(JSON.stringify(this.host.raw() ?? {}))) : this.#endAt(d.to, h, f.key);
            if ((f.pin && f.pin === end.pin) || (f.key && f.key === end.key && !end.pin)) return { select: true };
            if (d.quick) {
                this.chaining = true;
                this.chainKind = d.linkKind ?? null;
                this.chainColor = d.linkColor ?? null;
                this.chainState = d.linkState ?? null;
            }
            return this.#stringAction(f, end, d.quick ? { quick: true, chain: true, kind: d.linkKind, color: d.linkColor ?? null, state: d.linkState ?? null } : {});
        }
        if (d.kind === 'box') {
            if (!d.to) return { select: true };
            const x0 = Math.min(d.start.x, d.to.x);
            const x1 = Math.max(d.start.x, d.to.x);
            const y0 = Math.min(d.start.y, d.to.y);
            const y1 = Math.max(d.start.y, d.to.y);
            const inside = (p) => p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
            if (!d.ctrl) this.clear();
            const view = this.host.view();
            for (const s of view?.scraps ?? []) {
                const c = s.layout.box ?? s.layout.paper;
                if (this.may(s) && inside({ x: c.cx, y: c.cy })) this.selection.add(s.key);
            }
            // the board's own pins, and each string whose pins are all inside
            if (this.editor) {
                for (const p of view?.pins ?? []) if (inside(p)) this.pins.add(p.id);
                for (const l of view?.links ?? []) if (pinsOf(l).every(inside)) this.links.add(l.id);
                this.link = this.links.size === 1 ? [...this.links][0] : null;
            }
            return { select: true };
        }
        if (d.joinTo) return this.#joinPatch(d.src, d.joinTo, d.raw);
        return d.patch ?? null;
    }

    cancel() {
        this.drag = null;
    }

    #patchFor(pt) {
        const d = this.drag;
        const raw = d.raw ?? this.host.raw() ?? {};
        const rawLink = (id) => raw.links?.[id] ?? {};
        const dx = pt.x - (d.start?.x ?? pt.x);
        const dy = pt.y - (d.start?.y ?? pt.y);
        const by = (p) => (p ? { x: Math.round(p.x + dx), y: Math.round(p.y + dy) } : p);
        if (d.kind === 'move') {
            const out = { scraps: Object.fromEntries(Object.entries(d.from).map(([k, p]) => [k, by(p)])) };
            if (Object.keys(d.pins ?? {}).length) out.pins = Object.fromEntries(Object.entries(d.pins).map(([id, p]) => [id, by(p)]));
            const links = Object.entries(d.links ?? {}).filter(([, l]) => l.aPt || l.bPt || l.joints.length);
            if (links.length) {
                out.links = Object.fromEntries(links.map(([id, l]) => [id, {
                    ...(l.aPt ? { aPt: by(l.aPt) } : {}), ...(l.bPt ? { bPt: by(l.bPt) } : {}), ...(l.joints.length ? { joints: l.joints.map(by) } : {}),
                }]));
            }
            return out;
        }
        if (d.kind === 'size' || d.kind === 'turn') {
            const f = Math.hypot(pt.x - d.c.x, pt.y - d.c.y) / d.d0;
            const delta = (Math.atan2(pt.y - d.c.y, pt.x - d.c.x) - d.a0) / DEGREE;
            const t = d.target;
            if (t?.type === 'part' && d.anchor) return this.#textBoxPatch(t, raw, pt, d.anchor);
            if (t?.type === 'part') return this.#partPatch(t, raw, d.kind === 'size' ? { f } : { delta });
            if (t?.type === 'bit') return { bits: { [t.bit.id]: d.kind === 'size' ? { w: Math.max(6, Math.round(t.bit.w * f)) } : { r: Math.round(t.bit.r + delta) } } };
            if (t?.type === 'pin') {
                const p = raw.pins?.[t.pin.id] ?? {};
                // (no pin grown past three times itself: a head's handles lie
                // close, and a short pull was making it thirteen times)
                const s0 = p.s ?? t.pin.sEff ?? 1;
                return { pins: { [t.pin.id]: d.kind === 'size' ? { s: clampS(Math.min(Math.max(3, s0), s0 * f), this.#pinFloor(t.pin)) } : { r: Math.round((p.r ?? (t.pin.rot / DEGREE)) + delta) } } };
            }
            if (d.kind === 'size') return { scraps: Object.fromEntries(Object.entries(d.sizes).map(([k, s]) => [k, { s: clampS(s * f, this.#scrapFloor(k)) }])) };
            return { scraps: Object.fromEntries(Object.entries(d.turns).map(([k, r]) => [k, { r: Math.round(r + delta) }])) };
        }
        if (d.kind === 'bit') return { bits: { [d.bit.id]: { x: Math.round(d.bit.x + dx), y: Math.round(d.bit.y + dy) } } };
        if (d.kind === 'part') {
            const { scrap, id } = d.part;
            const had = raw.scraps?.[scrap.key]?.parts ?? {};
            // (a strip of tape or a web dragged off its card is the board's
            // own from then on: Luke 2026-10-06; the picture and the writing
            // stay on the card)
            const off = this.gm && !pointInPoly(pt, scrap.layout.hull) ? this.#offCard(scrap, id, pt, raw) : null;
            if (off) return off;
            const parts = { ...had, [id]: { ...(had[id] ?? {}), ...onPaper(scrap, pt) } };
            return { scraps: { [scrap.key]: { parts } } };
        }
        if (d.kind === 'pull') {
            // the grabbed point of the span goes to the pointer: u, v span
            // lengths along and across its straight line
            const l = d.link;
            const A = l.waypoints[d.span];
            const B = l.waypoints[d.span + 1];
            const ex = B.x - A.x;
            const ey = B.y - A.y;
            const l2 = Math.max(1, ex * ex + ey * ey);
            const ox = pt.x - (A.x + ex * d.t);
            const oy = pt.y - (A.y + ey * d.t);
            const pulls = Array.from({ length: l.spans.length }, (_, k) => rawLink(l.id).pulls?.[k] ?? null);
            pulls[d.span] = { t: round3(d.t), u: round3((ox * ex + oy * ey) / l2), v: round3((-ox * ey + oy * ex) / l2) };
            return { link: [l.id, { pulls }] };
        }
        if (d.kind === 'joint') {
            const rl = rawLink(d.link.id);
            const joints = [...(rl.joints ?? [])];
            joints.splice(d.ji, 0, { pin: d.pinId });
            // (the string's own kind of pin and size; stuck in a note or writing it lands on)
            const tex = d.link.pinTex ?? d.link.ends[0]?.tex;
            const sz = d.link.pinS ? { s: d.link.pinS } : {};
            const under = this.#scrapUnder(pt);
            const on = under && (under.type === 'note' || under.type === 'scrawl') ? under : null;
            const pin = on ? { tex, ...sz, on: on.key, at: onPaper(on, pt) } : { tex, ...sz, ...pt0(pt) };
            return { link: [d.link.id, { joints, pulls: pullsSplit(rl.pulls, d.span) }], pins: { [d.pinId]: pin } };
        }
        const { h, T } = d;
        switch (h.kind) {
            case 'scrapPin': {
                const s = h.scrap;
                const rs = raw.scraps?.[s.key] ?? {};
                const added = [...(rs.pins ?? [])];
                // on its own paper it moves over it; off it, it is the board's
                if (pointInPoly(pt, s.layout.hull)) {
                    const at = onPaper(s, pt);
                    if (h.idx < 0) return { scraps: { [s.key]: { pinAt: at, pinOff: false } }, pins: { [d.pinId]: null } };
                    added[h.idx] = at;
                    return { scraps: { [s.key]: { pins: added } }, pins: { [d.pinId]: null } };
                }
                const tex = (h.idx < 0 ? s.layout.pin : s.layout.pins[h.idx])?.tex;
                const keep = h.idx < 0 ? { pinOff: true } : { pins: added.filter((_, i) => i !== h.idx) };
                return { scraps: { [s.key]: keep }, pins: { [d.pinId]: this.#pinAt(pt, { tex }, s.key) } };
            }
            case 'pin':
                return { pins: { [h.pin.id]: this.#pinAt(pt, raw.pins?.[h.pin.id] ?? h.pin) } };
            case 'end': {
                // dropped on a scrap, the end ties on there (and goes with it
                // from then on); anywhere else it comes loose and stays put
                const side = h.side ? 'b' : 'a';
                const under = this.#scrapUnder(pt, h.side ? h.link.a : h.link.b);
                if (under) return { link: [h.link.id, { [side]: under.key, [`${side}At`]: onPaper(under, pt), [`${side}Pt`]: null }] };
                return { link: [h.link.id, { [side]: null, [`${side}At`]: null, [`${side}Pt`]: pt0(pt) }] };
            }
            case 'joint': {
                const joints = [...(rawLink(h.link.id).joints ?? [])];
                joints[h.idx] = pt0(pt);
                return { link: [h.link.id, { joints }] };
            }
            case 'join': {
                // the junction goes where it's dragged and the string runs
                // through it; its tag comes with it (the tag moves by itself)
                const [a, b] = h.link.ends;
                const v = viaFrom(a, b, pt);
                return { link: [h.link.id, { via: { t: +v.t.toFixed(4), off: Math.round(v.off) } }] };
            }
            case 'tagPin':
                return { link: [h.link.id, { tagPinAt: onTagAt(T, pt) }] };
            case 'tag':
                return { link: [h.link.id, { tagDx: Math.round(T.x + dx - T.mid.x), tagDy: Math.round(T.y + dy - T.mid.y) }] };
            default:
                return null;
        }
    }

    // A card's writing's box shaped by its corner (Luke, 2026-10-02: freely, any
    // width and height within the paper; the writing wraps and shrinks to it)
    #textBoxPatch(t, raw, pt, a) {
        const { scrap } = t;
        const q = onPaper(scrap, pt);
        const had = raw.scraps?.[scrap.key]?.parts ?? {};
        const next = {
            ...(had.text ?? {}),
            u: round3((a.u + q.u) / 2), v: round3((a.v + q.v) / 2),
            w: round3(Math.max(0.15, Math.abs(q.u - a.u))), h: round3(Math.max(0.06, Math.abs(q.v - a.v))),
        };
        return { scraps: { [scrap.key]: { parts: { ...had, text: next } } } };
    }

    // A piece of a card sized (f: by its box, or for its writing, its wrap
    // width) or turned (delta degrees), kept on the card
    #partPatch(t, raw, { f = null, delta = null }) {
        const { scrap, part } = t;
        const cur = raw.scraps?.[scrap.key]?.parts?.[part.id];
        const at = cur ?? onPaper(scrap, part);
        const next = { ...at };
        if (f !== null) {
            if (part.id === 'text') {
                const B = scrap.layout.box ?? scrap.layout.paper;
                next.w = Math.max(0.15, Math.min(2.5, +(((cur?.w ?? part.w / B.w)) * f).toFixed(3)));
            } else {
                const s0 = cur?.s ?? 1;
                next.s = clampS(s0 * f, this.#floor(Math.min(part.w, part.h), s0));
            }
        }
        if (delta !== null) {
            const B = scrap.layout.box ?? scrap.layout.paper;
            next.r = Math.round((cur?.r ?? (part.rot - B.rot) / DEGREE) + delta);
        }
        return { scraps: { [scrap.key]: { parts: { ...(raw.scraps?.[scrap.key]?.parts ?? {}), [part.id]: next } } } };
    }

    // A pin to share (Ctrl+drag from it, Luke 2026-10-02: a new string through
    // the same pin, not a second one on top): a pin of the board's own as it
    // is; else one is made where the pin was (in the scrap it was in, if any)
    // and the string or scrap it belonged to is held by it from then on.
    // Returns { pin, pt, prep } (prep: the patch that makes it so).
    // Which strings a board pin holds: [{ link, side } | { link, idx }]
    #refsOf(pinId) {
        const out = [];
        for (const l of this.host.view()?.links ?? []) {
            if (l.aPin === pinId) out.push({ link: l, side: 0 });
            if (l.bPin === pinId) out.push({ link: l, side: 1 });
            for (const j of l.joints ?? []) if (j.shared === pinId) out.push({ link: l, idx: j.idx });
        }
        return out;
    }

    // A string's pin being dragged, as something that can join another: an
    // end or joint of its own, or a board pin holding strings (null: not a
    // string's pin)
    #sourceOf(h) {
        if (h.kind === 'end') return { kind: 'end', link: h.link, side: h.side };
        if (h.kind === 'joint') return { kind: 'joint', link: h.link, idx: h.idx };
        if (h.kind === 'pin' && this.#refsOf(h.pin.id).length) return { kind: 'pin', pinId: h.pin.id };
        return null;
    }

    // The string's pin within reach of a point that the dragged one could join
    // (Luke, 2026-10-02: drag pins together to join them): another string's
    // end or joint, or a board pin holding strings; never one of its own
    #joinTarget(pt, src) {
        const view = this.host.view();
        // (tighter than the reticle: a join is never an accident)
        const reach = JOIN * this.host.px();
        const mine = new Set(src.kind === 'pin' ? this.#refsOf(src.pinId).map((r) => r.link.id) : [src.link.id]);
        const minePins = new Set(src.kind === 'pin' ? [src.pinId] : [src.link.aPin, src.link.bPin, ...(src.link.joints ?? []).map((j) => j.shared)].filter(Boolean));
        let best = null;
        const take = (p, t) => {
            const d = Math.hypot(pt.x - p.x, pt.y - p.y);
            if (d <= reach && (!best || d < best.d)) best = { d, x: p.x, y: p.y, ...t };
        };
        for (const p of view?.pins ?? []) if (p.pulls?.length && !minePins.has(p.id) && this.minePin(p.id)) take(p, { kind: 'pin', pinId: p.id });
        for (const l of view?.links ?? []) {
            if (mine.has(l.id) || !this.mine(l)) continue;
            (l.ends ?? []).forEach((e, side) => { if (!e.shared) take(e, { kind: 'end', link: l, side }); });
            for (const j of l.joints ?? []) if (!j.shared) take(j, { kind: 'joint', link: l, idx: j.idx });
        }
        return best;
    }

    // Two strings' pins made one: the target becomes (or is) a board pin, and
    // the dragged end, joint, or pin is held by it
    #joinPatch(src, tgt, raw) {
        let pinId = tgt.pinId;
        let patch = { pins: {}, links: {}, scraps: {} };
        if (tgt.kind !== 'pin') {
            const sh = this.#shared(tgt.kind === 'end' ? { kind: 'end', link: tgt.link, side: tgt.side } : { kind: 'joint', link: tgt.link, idx: tgt.idx }, raw);
            pinId = sh.pin;
            patch = { pins: {}, links: {}, scraps: {}, ...JSON.parse(JSON.stringify(sh.prep)) };
        }
        const holdBy = (linkId, edit) => {
            patch.links[linkId] = { ...(patch.links[linkId] ?? {}), ...edit(patch.links[linkId]?.joints ?? raw.links?.[linkId]?.joints ?? []) };
        };
        const end = (side) => (side ? { b: null, bAt: null, bPt: null, bPin: pinId } : { a: null, aAt: null, aPt: null, aPin: pinId });
        if (src.kind === 'end') holdBy(src.link.id, () => end(src.side));
        else if (src.kind === 'joint') holdBy(src.link.id, (joints) => ({ joints: joints.map((j, i) => (i === src.idx ? { pin: pinId } : j)) }));
        else {
            // (a board pin joined to another: its strings move over, it goes)
            for (const r of this.#refsOf(src.pinId)) {
                if ('side' in r) holdBy(r.link.id, () => end(r.side));
                else holdBy(r.link.id, (joints) => ({ joints: joints.map((j, i) => (i === r.idx ? { pin: pinId } : j)) }));
            }
            patch.pins[src.pinId] = null;
        }
        return patch;
    }

    // Shift+drag a shared pin: the string pulling most the way the pointer
    // goes comes away on a pin of its own
    // ids a break makes: a pin at each new end and the second string
    #freshIds(raw) {
        const pins = { ...(raw.pins ?? {}) };
        const p1 = customKey('pin', pins);
        pins[p1] = 1;
        return { p1, p2: customKey('pin', pins), link: customKey('l', raw.links ?? {}) };
    }

    // A string broken (Shift+drag, Luke 2026-10-02): where it was grabbed (a
    // point on it, or one of its joint pins) it comes apart in two, the near
    // half ending where it broke and the far half's new end at the pointer
    #breakPatch(pt) {
        const d = this.drag;
        const raw = d.raw;
        const rl = raw.links?.[d.link.id];
        if (!rl) return null;
        const joints = rl.joints ?? [];
        const pulls = rl.pulls ?? [];
        let ji;
        let endPin;
        let spanCut;
        const pins = {};
        if (d.joint !== undefined) {
            // at a joint: it ends the near half; the far half starts at the pointer
            ji = d.joint;
            endPin = d.pinId;
            spanCut = d.link.waypoints.findIndex((w) => w.kind === 'joint' && w.idx === d.joint);
        } else {
            ji = d.link.waypoints.slice(1, d.span + 1).filter((w) => w.kind === 'joint').length;
            endPin = d.ids.p1;
            spanCut = d.span + 1;
            pins[d.ids.p1] = { tex: d.link.pinTex ?? d.link.ends[0]?.tex, ...(d.link.pinS ? { s: d.link.pinS } : {}), ...pt0(d.at) };
        }
        const far = this.#pinAt(pt, { tex: d.link.pinTex ?? d.link.ends[0]?.tex, s: d.link.pinS });
        pins[d.ids.p2] = far;
        const before = joints.slice(0, ji);
        const after = joints.slice(d.joint !== undefined ? ji + 1 : ji);
        const bSide = Object.fromEntries(['b', 'bAt', 'bPt', 'bPin'].filter((k) => rl[k] !== undefined && rl[k] !== null).map((k) => [k, rl[k]]));
        return {
            pins,
            links: { [d.link.id]: { b: null, bAt: null, bPt: null, bPin: endPin, joints: before, pulls: pulls.slice(0, Math.max(0, spanCut - 1)) } },
            newLinks: { [d.ids.link]: { kind: rl.kind ?? 'delve', state: rl.state ?? 'known', aPin: d.ids.p2, ...bSide, joints: after, pulls: pulls.slice(spanCut).length ? [null, ...pulls.slice(spanCut + 1)] : [] } },
        };
    }

    #splitPatch(pt) {
        const d = this.drag;
        const dx = pt.x - d.start.x;
        const dy = pt.y - d.start.y;
        if (!d.chosen) {
            if (Math.hypot(dx, dy) < 4 * this.host.px()) return null;
            const P = d.pin;
            const dirs = (r) => {
                const l = r.link;
                const n = l.points.length / 2;
                const at = (i) => ({ x: l.points[2 * Math.max(0, Math.min(n - 1, i))], y: l.points[2 * Math.max(0, Math.min(n - 1, i)) + 1] });
                if ('side' in r) return [r.side ? at(n - 7) : at(6)];
                const i = nearestOnPath(l.points, P).i;
                return [at(i - 6), at(i + 6)];
            };
            let best = -Infinity;
            for (const r of d.refs) {
                for (const q of dirs(r)) {
                    const ux = q.x - P.x;
                    const uy = q.y - P.y;
                    const k = (ux * dx + uy * dy) / ((Math.hypot(ux, uy) || 1) * (Math.hypot(dx, dy) || 1));
                    if (k > best) { best = k; d.chosen = r; }
                }
            }
        }
        const r = d.chosen;
        const pinData = this.#pinAt(pt, { tex: d.pin.tex });
        const raw = d.raw;
        const edit = 'side' in r
            ? (r.side ? { b: null, bAt: null, bPt: null, bPin: d.newId } : { a: null, aAt: null, aPt: null, aPin: d.newId })
            : { joints: (raw.links?.[r.link.id]?.joints ?? []).map((j, i) => (i === r.idx ? { pin: d.newId } : j)) };
        return { pins: { [d.newId]: pinData }, links: { [r.link.id]: edit } };
    }

    #shared(h, raw) {
        if (h.kind === 'pin') return { pin: h.pin.id, pt: pt0(h.pin) };
        const view = this.host.view();
        const id = customKey('pin', raw.pins ?? {});
        const make = (p, tex, onKey) => {
            const s = onKey ? view?.scraps.find((x) => x.key === onKey) : null;
            return s ? { tex, on: onKey, at: onPaper(s, p) } : { tex, ...pt0(p) };
        };
        const prep = { pins: {}, links: {}, scraps: {} };
        let p = null;
        if (h.kind === 'joint') {
            p = h.link.joints.find((j) => j.idx === h.idx);
            const under = this.#scrapUnder(p);
            prep.pins[id] = make(p, p.tex, under && (under.type === 'note' || under.type === 'scrawl') ? under.key : null);
            const joints = [...(raw.links?.[h.link.id]?.joints ?? [])];
            joints[h.idx] = { pin: id };
            prep.links[h.link.id] = { joints };
        } else if (h.kind === 'end') {
            p = h.link.ends[h.side];
            const key = h.side ? h.link.b : h.link.a;
            const side = h.side ? 'b' : 'a';
            prep.pins[id] = make(p, p.tex, key);
            prep.links[h.link.id] = { [side]: null, [`${side}At`]: null, [`${side}Pt`]: null, [`${side}Pin`]: id };
        } else if (h.kind === 'scrapPin') {
            p = h.idx < 0 ? h.scrap.layout.pin : h.scrap.layout.pins[h.idx];
            prep.pins[id] = make(p, p.tex, h.scrap.key);
            const added = [...(raw.scraps?.[h.scrap.key]?.pins ?? [])];
            prep.scraps[h.scrap.key] = h.idx < 0 ? { pinOff: true } : { pins: added.filter((_, i) => i !== h.idx) };
        } else {
            // (an older board's junction or tag pin: a loose point)
            const a = this.#anchorOf(h);
            return a;
        }
        return { pin: id, pt: pt0(p), prep };
    }

    // A pin at a point: in the scrap under it (not `not`), else loose
    #pinAt(pt, pin, not = null) {
        const under = this.#scrapUnder(pt, not);
        const keep = { tex: pin.tex, ...(pin.s && pin.s !== 1 ? { s: pin.s } : {}), ...(pin.r !== undefined && pin.r !== null ? { r: pin.r } : {}) };
        if (under) return { ...keep, on: under.key, at: onPaper(under, pt), x: null, y: null };
        return { ...keep, on: null, at: null, ...pt0(pt) };
    }

    // The topmost scrap under a point, but not `not` (a string's other end)
    /* -------------------------------------------- */
    /*  The marker's strokes (Luke, 2026-10-03)     */
    /* -------------------------------------------- */

    // the card a point lies on (writing on the sheet is not a card)
    #cardUnder(pt) {
        const scraps = this.host.view()?.scraps ?? [];
        for (let i = scraps.length - 1; i >= 0; i--) {
            const s = scraps[i];
            if (!s.layout.bare && pointInPoly(pt, s.layout.hull)) return s;
        }
        return null;
    }

    // every stroke shown, the sheet's and the cards', on the board: { key,
    // where (a layer, or '@' + a card's key), id, by, c, w, o, pts }
    #strokes() {
        const view = this.host.view();
        const out = [];
        for (const [layer, strokes] of Object.entries(view?.marks ?? {})) {
            for (const [id, st] of Object.entries(strokes)) out.push({ ...st, key: JSON.stringify([layer, id]), where: layer, id, by: layer });
        }
        for (const s of view?.scraps ?? []) {
            for (const st of s.layout.strokes ?? []) out.push({ ...st, key: JSON.stringify([`@${s.key}`, st.id]), where: `@${s.key}`, card: s.key });
        }
        return out;
    }

    // the stroke under a point this user may take hold of (the topmost)
    #strokeAt(pt) {
        const user = this.host.user();
        const px = this.host.px();
        const all = this.#strokes();
        for (let i = all.length - 1; i >= 0; i--) {
            const st = all[i];
            if (mayRubOut(st.by, user) && nearStroke(st.pts, pt, st.w / 2 + 6 * px)) return st;
        }
        return null;
    }

    #strokeBounds() {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const st of this.#strokes()) {
            if (!this.markSel.has(st.key)) continue;
            const b = strokeBox(st.pts, st.w);
            x0 = Math.min(x0, b.x0);
            y0 = Math.min(y0, b.y0);
            x1 = Math.max(x1, b.x1);
            y1 = Math.max(y1, b.y1);
        }
        if (x0 === Infinity) return null;
        const o = HANDLE_OFF * this.host.px();
        return { x0, y0, x1, y1, c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, handle: { x: x1 + o, y: y1 + o }, rotor: { x: x1 + o, y: y0 - o } };
    }

    // a press in the marker's select mode: a stroke selected (Ctrl: added or
    // taken away), or the selection let go
    #pressStroke(pt, ctrl) {
        if (this.onHandle(pt) || this.onRotor(pt)) return null;
        const st = this.#strokeAt(pt);
        if (!st) {
            if (!ctrl) this.markSel.clear();
            return { do: 'select' };
        }
        if (ctrl) {
            if (this.markSel.has(st.key)) this.markSel.delete(st.key);
            else this.markSel.add(st.key);
        } else if (!this.markSel.has(st.key)) {
            this.markSel.clear();
            this.markSel.add(st.key);
        }
        return { do: 'select' };
    }

    #strokeDragStart(pt, ctrl) {
        const raw = JSON.parse(JSON.stringify(this.host.raw() ?? {}));
        const b = this.#strokeBounds();
        const base = { start: pt, raw, chosen: this.#strokes().filter((st) => this.markSel.has(st.key)) };
        if (b && this.onHandle(pt)) {
            this.drag = { kind: 'msize', ...base, c: b.c, d0: Math.max(1, Math.hypot(pt.x - b.c.x, pt.y - b.c.y)) };
            return 'msize';
        }
        if (b && this.onRotor(pt)) {
            this.drag = { kind: 'mturn', ...base, c: b.c, a0: Math.atan2(pt.y - b.c.y, pt.x - b.c.x) };
            return 'mturn';
        }
        const st = this.#strokeAt(pt);
        if (st) {
            if (!this.markSel.has(st.key)) {
                if (!ctrl) this.markSel.clear();
                this.markSel.add(st.key);
            }
            this.drag = { kind: 'mmove', ...base, chosen: this.#strokes().filter((x) => this.markSel.has(x.key)) };
            return 'mmove';
        }
        if (!ctrl) this.markSel.clear();
        this.drag = { kind: 'mbox', start: pt };
        return 'mbox';
    }

    // The selected strokes moved, sized, or turned to a point: each where it
    // was, unless the whole of it has left its card (it is the sheet's) or
    // the whole of a sheet's stroke lies on one card (it is the card's)
    #strokesPatch(d, pt) {
        const raw = d.raw;
        const view = this.host.view();
        const patch = { marks: {}, scraps: {} };
        d.preview = [];
        const f = d.kind === 'msize' ? Math.max(0.05, Math.hypot(pt.x - d.c.x, pt.y - d.c.y) / d.d0) : 1;
        const turn = d.kind === 'mturn' ? Math.atan2(pt.y - d.c.y, pt.x - d.c.x) - d.a0 : 0;
        const cs = Math.cos(turn);
        const sn = Math.sin(turn);
        const dx = d.kind === 'mmove' ? pt.x - d.start.x : 0;
        const dy = d.kind === 'mmove' ? pt.y - d.start.y : 0;
        const keep = new Set();
        const sel = new Set();
        for (const st of d.chosen) {
            const pts = [];
            for (let i = 0; i < st.pts.length; i += 2) {
                let x = st.pts[i];
                let y = st.pts[i + 1];
                if (d.kind === 'mmove') {
                    x += dx;
                    y += dy;
                } else {
                    const ox = (x - d.c.x) * f;
                    const oy = (y - d.c.y) * f;
                    x = d.c.x + ox * cs - oy * sn;
                    y = d.c.y + ox * sn + oy * cs;
                }
                pts.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
            }
            const moved = { by: st.by, c: st.c, w: Math.max(0.5, st.w * f), ...(st.o === undefined ? {} : { o: st.o }), ...(st.b === undefined ? {} : { b: st.b }), pts };
            (d.preview ??= []).push(moved);
            // where it goes now
            const vs = st.card ? view.scraps.find((s) => s.key === st.card) : null;
            let to = st.where;
            if (vs && !pts.some((_, i) => i % 2 === 0 && pointInPoly({ x: pts[i], y: pts[i + 1] }, vs.layout.hull))) to = st.by ?? this.host.user()?.id;
            if (!vs) {
                const card = this.#cardHolding(pts);
                if (card) to = `@${card.key}`;
            }
            const card = to.startsWith('@') ? view.scraps.find((s) => s.key === to.slice(1)) : null;
            const set = (where, id, value) => {
                if (where.startsWith('@')) {
                    const key = where.slice(1);
                    (patch.scraps[key] ??= { marks: {} }).marks[id] = value;
                } else (patch.marks[where] ??= {})[id] = value;
            };
            if (to === st.where) {
                set(to, st.id, card ? strokeToCard(moved, card, this.host.look?.() ?? this.#look()) : stripBy(moved));
                keep.add(JSON.stringify([to, st.id]));
                sel.add(JSON.stringify([to, st.id]));
            } else {
                set(st.where, st.id, null);
                const pool = to.startsWith('@') ? raw.scraps?.[to.slice(1)]?.marks ?? {} : raw.marks?.[to] ?? {};
                const taken = { ...pool, ...(to.startsWith('@') ? patch.scraps[to.slice(1)]?.marks : patch.marks[to]) };
                const id = customKey('m', taken);
                set(to, id, card ? strokeToCard(moved, card, this.host.look?.() ?? this.#look()) : stripBy(moved));
                sel.add(JSON.stringify([to, id]));
            }
        }
        void keep;
        d.nextSel = sel;
        return patch;
    }

    // the card that holds the whole of a stroke (the topmost), or null
    #cardHolding(pts) {
        const scraps = this.host.view()?.scraps ?? [];
        for (let i = scraps.length - 1; i >= 0; i--) {
            const s = scraps[i];
            if (s.layout.bare) continue;
            let all = true;
            for (let k = 0; k < pts.length && all; k += 2) all = pointInPoly({ x: pts[k], y: pts[k + 1] }, s.layout.hull);
            if (all) return s;
        }
        return null;
    }

    // a stroke drawn on a card: the card's (its own new id), as a patch
    #cardStrokePatch(key, pts) {
        const vs = this.host.view()?.scraps.find((s) => s.key === key);
        if (!vs) return null;
        const raw = this.host.raw() ?? {};
        const id = customKey('m', raw.scraps?.[key]?.marks ?? {});
        return { key, id, stroke: (st) => strokeToCard({ ...st, pts }, vs, this.host.look?.() ?? this.#look()) };
    }

    // the look the cards were laid out with (a card's unit: look.scrap.w)
    #look() {
        const s = this.host.view()?.scraps.find((x) => !x.layout.bare);
        // (a card's frame needs only look.scrap.w: its box's width over its size
        // is that, for a landmark; the host's look is used when it has one)
        return { scrap: { w: s ? (s.layout.box?.w ?? 200) / (s.s ?? 1) : 200 } };
    }

    // (a player's press on a string, a pin, or anything else of no use to them
    // lying over a card of their own takes the card; Luke 2026-10-03, a note
    // with a string across it wouldn't move)
    #ownCardUnder(pt, h) {
        if (this.editor || h?.kind === 'scrap') return null;
        const s = this.#scrapUnder(pt);
        return s && this.may(s) ? s : null;
    }

    // An editor's right-click on a card: locked to the sheet, or let go
    #lockAt(pt) {
        if (!this.editor) return null;
        const h = this.hit(pt);
        const card = h?.kind === 'scrap' ? h.item : h?.kind === 'scrapPin' ? h.scrap : this.#scrapUnder(pt);
        return card ? { do: 'patch', patch: this.lockPatch(card.key) } : null;
    }

    // a card locked to the sheet, or let go
    lockPatch(key) {
        const s = this.host.view()?.scraps.find((x) => x.key === key);
        return s ? { scraps: { [key]: { locked: !s.locked } } } : null;
    }

    // A card's own piece taken off (Luke, 2026-10-06): its picture and its
    // writing never (they can't be made again)
    dropPatch(key, id) {
        const rs = this.host.raw()?.scraps?.[key];
        if (!rs || !id || id === 'clip' || id === 'text') return null;
        return { scraps: { [key]: { drop: [...new Set([...(rs.drop ?? []), id])] } } };
    }

    // A card's strip of tape or web off it, the board's own (a loose piece
    // where it was dropped, as it lay), its card without it; null for
    // anything else (its picture, its writing, a pin through its clipping)
    #offCard(scrap, id, pt, raw) {
        const L = scrap.layout;
        const t = (L.tapes ?? []).find((x) => x.id === id);
        const e = t ? null : (L.extras ?? []).find((x) => x.id === id && x.thing);
        const piece = t ? { tex: t.tex, w: t.w, rot: t.rot, flip: false, alpha: 0.92 } : e ? { tex: e.tex, w: e.w, rot: e.rot, flip: Boolean(e.flip), alpha: e.alpha ?? 1 } : null;
        if (!piece) return null;
        const rs = raw.scraps?.[scrap.key] ?? {};
        const parts = { ...(rs.parts ?? {}) };
        delete parts[id];
        const bitId = customKey('bit', raw.bits ?? {});
        return {
            scraps: { [scrap.key]: { drop: [...new Set([...(rs.drop ?? []), id])], parts } },
            bits: { [bitId]: { tex: piece.tex, x: Math.round(pt.x), y: Math.round(pt.y), w: Math.round(piece.w), r: Math.round(piece.rot / DEGREE), flip: piece.flip, alpha: piece.alpha } },
        };
    }

    // the selected piece of a card taken off (Delete), or a loose piece of
    // the board's own; null for anything else
    pieceOut() {
        if (this.editor && this.bit && this.gm) {
            const patch = { bits: { [this.bit]: null } };
            this.bit = null;
            return patch;
        }
        if (!this.editor || !this.part) return null;
        const patch = this.dropPatch(this.part.key, this.part.id);
        if (patch) this.part = null;
        return patch;
    }

    // the card's piece under a point (the topmost card's first: a card over
    // another hides its pieces), never its picture or its writing
    #pieceAt(pt) {
        if (!this.editor) return null;
        const scraps = this.host.view()?.scraps ?? [];
        for (let i = scraps.length - 1; i >= 0; i--) {
            const s = scraps[i];
            if (s.layout.bare) continue;
            for (const p of s.layout.parts ?? []) if (p.id !== 'clip' && p.id !== 'text' && pointInPoly(pt, frameOf(p))) return { scrap: s, id: p.id };
            // (rings, ink frames, and the paper under it are the card's own:
            // never taken off; Luke 2026-10-06)
            const onCard = pointInPoly(pt, s.layout.hull);
            if (onCard) return null;
        }
        return null;
    }

    #scrapUnder(pt, not) {
        const scraps = this.host.view()?.scraps ?? [];
        for (let i = scraps.length - 1; i >= 0; i--) {
            const s = scraps[i];
            if (s.key !== not && pointInPoly(pt, s.layout.hull)) return s;
        }
        return null;
    }

    // The selected cards a layer up (dir 1) or down (-1): each past the next
    // card it overlaps (else the next card at all), the layers renumbered
    // (Luke, 2026-10-02: pins always on top, writing and the marker always
    // underneath). Returns a patch, or null.
    layer(dir) {
        if (!this.editor) return null;
        const view = this.host.view();
        const order = (view?.scraps ?? []).filter((s) => !s.layout.bare);
        const keys = order.map((s) => s.key);
        const box = (s) => {
            const h = s.layout.hull;
            const xs = h.filter((_, i) => i % 2 === 0);
            const ys = h.filter((_, i) => i % 2 === 1);
            return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        };
        const meets = (a, b) => { const p = box(a); const q = box(b); return p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3]; };
        const sel = order.filter((s) => this.selection.has(s.key));
        if (!sel.length) return null;
        for (const s of dir > 0 ? [...sel].reverse() : sel) {
            const i = keys.indexOf(s.key);
            const rest = (dir > 0 ? keys.slice(i + 1) : keys.slice(0, i).reverse()).filter((k) => !this.selection.has(k)).map((k) => order.find((o) => o.key === k));
            const next = rest.find((o) => meets(s, o)) ?? rest[0];
            if (!next) continue;
            keys.splice(i, 1);
            const j = keys.indexOf(next.key);
            keys.splice(dir > 0 ? j + 1 : j, 0, s.key);
        }
        const out = {};
        keys.forEach((k, z) => { if (order.find((o) => o.key === k).z !== z) out[k] = { z }; });
        return Object.keys(out).length ? { scraps: out } : null;
    }

    // What Delete takes off the board: its pins and its strings. Cards never
    // (Luke, 2026-10-06: text and pictures can't be made again): they come
    // off by their right-click menu, into the bin; `cards` says which were
    // left on.
    removal() {
        if (!this.editor) {
            const links = this.host.view()?.links ?? [];
            return { scraps: [], pins: [...this.pins].filter((id) => this.minePin(id)), links: [...this.links].filter((id) => this.mine(links.find((l) => l.id === id))), cards: [] };
        }
        // (a card's picture or writing picked: the card itself, asked first,
        // as they never come off alone; Luke 2026-10-06)
        const whole = this.part && (this.part.id === 'clip' || this.part.id === 'text') ? [this.part.key] : [];
        return { scraps: [], pins: [...this.pins], links: [...this.links], cards: [...new Set([...this.selection, ...whole])] };
    }

    /* -------------------------------------------- */
    /*  The wheel                                   */
    /* -------------------------------------------- */

    // Whether the wheel turns or sizes (an editor, over a selection, with
    // Ctrl or Shift); otherwise it zooms
    wantsWheel({ ctrl = false, shift = false } = {}) {
        return this.editor && Boolean(this.#target()) && (ctrl || shift);
    }

    // A selected pin smoothed away (Luke, 2026-10-03: Enter): a joint of one
    // string goes, the string running on between its neighbours; a pin where
    // two strings meet end to end goes, the two made one. Null when it is
    // neither (a pin holding more, or nothing).
    smooth() {
        if (this.pins.size !== 1) return null;
        const pinId = [...this.pins][0];
        if (!this.minePin(pinId)) return null;
        const raw = this.host.raw() ?? {};
        const refs = this.#refsOf(pinId);
        if (refs.length === 1 && !('side' in refs[0])) {
            const l = refs[0].link;
            const rl = raw.links?.[l.id];
            if (!rl) return null;
            const joints = (rl.joints ?? []).filter((j) => j?.pin !== pinId);
            this.pins.clear();
            return { links: { [l.id]: { joints, pulls: [] } }, pins: { [pinId]: null } };
        }
        const ends = refs.filter((x) => 'side' in x);
        if (refs.length !== 2 || ends.length !== 2 || ends[0].link.id === ends[1].link.id) return null;
        const [A, B] = ends.map((x) => ({ id: x.link.id, side: x.side, rl: raw.links?.[x.link.id] }));
        if (!A.rl || !B.rl) return null;
        // (each string turned so it runs into the pin, then on out of it)
        const flip = (rl) => {
            const out = { ...rl, joints: [...(rl.joints ?? [])].reverse() };
            for (const k of ['', 'At', 'Pt', 'Pin']) [out[`a${k}`], out[`b${k}`]] = [rl[`b${k}`] ?? null, rl[`a${k}`] ?? null];
            return out;
        };
        const into = A.side === 1 ? A.rl : flip(A.rl);
        const from = B.side === 0 ? B.rl : flip(B.rl);
        const one = {
            a: into.a ?? null, aAt: into.aAt ?? null, aPt: into.aPt ?? null, aPin: into.aPin ?? null,
            b: from.b ?? null, bAt: from.bAt ?? null, bPt: from.bPt ?? null, bPin: from.bPin ?? null,
            joints: [...(into.joints ?? []), ...(from.joints ?? [])], pulls: [],
        };
        this.pins.clear();
        return { links: { [A.id]: one, [B.id]: null }, pins: { [pinId]: null } };
    }

    // Ctrl turns the selection 5 degrees a notch; Shift sizes it 5% a notch
    // (a selected piece of a card, or one pin, by itself)
    wheel(dy, { ctrl = false, shift = false } = {}) {
        if (!this.wantsWheel({ ctrl, shift }) || !dy) return null;
        const step = Math.sign(dy);
        const t = this.#target();
        const raw = this.host.raw() ?? {};
        if (t.type === 'part') return this.#partPatch(t, raw, ctrl ? { delta: step * 5 } : { f: step > 0 ? 0.95 : 1.05 });
        if (t.type === 'bit') return { bits: { [t.bit.id]: ctrl ? { r: Math.round(t.bit.r + step * 5) } : { w: Math.max(6, Math.round(t.bit.w * (step > 0 ? 0.95 : 1.05))) } } };
        if (t.type === 'pin') {
            const p = raw.pins?.[t.pin.id] ?? {};
            return { pins: { [t.pin.id]: ctrl ? { r: Math.round((p.r ?? (t.pin.rot / DEGREE)) + step * 5) } : { s: clampS((p.s ?? t.pin.sEff ?? 1) * (step > 0 ? 0.95 : 1.05), this.#pinFloor(t.pin)) } } };
        }
        const sel = this.selected().filter((s) => !s.locked);
        if (ctrl) return { scraps: Object.fromEntries(sel.map((s) => [s.key, { r: turnOf(s) + step * 5 }])) };
        return { scraps: Object.fromEntries(sel.map((s) => [s.key, { s: clampS((s.s ?? 1) * (step > 0 ? 0.95 : 1.05), this.#scrapFloor(s.key)) }])) };
    }

    // The least size (s) a thing drawn `side` board px across at size `s` may
    // be: GRAB screen px at the host's closest zoom
    #floor(side, s) {
        const finest = this.host.finest?.() ?? 1 / 3;
        if (!(side > 0) || !(s > 0)) return 0.001;
        return (GRAB * finest) / (side / s);
    }

    #scrapFloor(key) {
        const sc = this.host.view()?.scraps?.find((s) => s.key === key);
        if (!sc) return 0.001;
        const P = sc.layout?.paper;
        return this.#floor(P ? Math.min(P.w, P.h) : leastSide(sc.layout?.hull), sc.s ?? 1);
    }

    #pinFloor(pin) {
        return this.#floor(pin.w, pin.sEff ?? 1);
    }
}
