// Live previews on the Heart map (Luke, 2026-10-25): what each user is doing
// shown to everyone else as it happens, never written anywhere. A stroke as
// it is painted, a string being tied, and whatever is being dragged (cards,
// pins, strings, strokes). Sent on the relay's channel (common/relay.js
// sendLive, onLive), ten times a second at most; each client shows them by
// its own detail (layer.js): the light one as lines and outlines, the others
// with the board's own brush, and a drag by painting the board as it would
// be. (A doodle in hand is no longer sent: Luke 2026-10-25, its ghost
// repainted on every client at every move of the pointer.)
//
// The parts here are plain (no Foundry globals): a peer's state as messages
// come (livePeer), what is let go once the board has changed or time has
// passed (livePeerAfterUpdate, livePeerAt), the sender (LiveSender), which
// gathers what changed and sends it at its own pace, and what this user just
// laid down (landingOf, landedOn), held on screen until the board shows it.

import { WASH_MAX, nibOf, LINK_KINDS } from './model.js';

export const LIVE_MS = 100;
// (a preview kept after its user let go, until the board shows the real
// thing; and a user heard from no more)
export const END_HOLD_MS = 2000;
export const STALE_MS = 6000;
const MAX_PTS = 6000;

const finite = (v) => Number.isFinite(Number(v));
const nums = (a) => (Array.isArray(a) ? a.map(Number).filter(Number.isFinite) : []);
const pointOf = (p) => (p && finite(p.x) && finite(p.y) ? { x: Number(p.x), y: Number(p.y) } : null);
const brushOf = (b) => ({
    c: Math.max(0, Math.round(Number(b?.c) || 0)),
    w: Math.max(0.5, Math.min(b?.n === 'wash' ? WASH_MAX : 60, Number(b?.w) || 6)),
    b: Math.max(0, Math.min(2, Math.round(Number(b?.b ?? 1)))),
    o: Math.max(0.05, Math.min(1, Number(b?.o ?? 0.85))),
    ...nibOf(b?.n, b?.fill),
});

// A peer's state after one of its messages (a new peer: null). Kept: the
// stroke it is painting ({ pts, brush, on }), the string it is tying ({ from,
// to, kind, color }), what it is dragging (a board patch), the strokes it is
// moving, and when it let go (`ended`).
export function livePeer(peer, msg, now = Date.now()) {
    if (!msg || typeof msg !== 'object') return peer;
    const fresh = !peer || peer.scene !== msg.scene;
    const p = fresh ? { user: msg.from, scene: msg.scene, seq: -1, at: now, stroke: null, string: null, drag: null, moving: null, ended: null } : { ...peer };
    // (an old message, after a newer one: passed over)
    if (finite(msg.seq) && Number(msg.seq) <= p.seq) return p;
    if (finite(msg.seq)) p.seq = Number(msg.seq);
    p.at = now;
    switch (msg.t) {
        case 'stroke': {
            const base = Math.max(0, Math.round(Number(msg.base) || 0));
            const had = base === 0 ? [] : p.stroke?.pts ?? [];
            // (a part missed: wait for the stroke's next whole)
            if (base !== had.length) break;
            const pts = had.concat(nums(msg.pts)).slice(0, MAX_PTS);
            p.stroke = { pts, brush: brushOf(msg.brush), on: msg.on ? String(msg.on) : null };
            p.ended = null;
            break;
        }
        case 'string': {
            const s = msg.string;
            const from = pointOf(s?.from);
            const to = pointOf(s?.to);
            p.string = from && to ? { from, to, kind: LINK_KINDS.includes(s.kind) ? s.kind : 'plain', color: finite(s.color) ? Math.round(Number(s.color)) : null, pin: typeof s.pin === 'string' ? s.pin.slice(0, 200) : null, plainPins: Boolean(s.plainPins) } : null;
            break;
        }
        case 'drag':
            p.drag = msg.patch && typeof msg.patch === 'object' && !Array.isArray(msg.patch) ? msg.patch : null;
            p.ended = null;
            break;
        case 'moving':
            p.moving = Array.isArray(msg.strokes) ? msg.strokes.slice(0, 200).filter((st) => nums(st?.pts).length >= 4).map((st) => ({ ...brushOf(st), pts: nums(st.pts).slice(0, MAX_PTS) })) : null;
            p.ended = null;
            break;
        case 'end':
            p.ended = now;
            break;
        case 'idle':
            p.string = null;
            break;
        default:
    }
    return p;
}

// a peer once the board has changed: what it let go of is on the board now
export function livePeerAfterUpdate(p) {
    if (!p?.ended) return p;
    return { ...p, stroke: null, drag: null, moving: null, ended: null };
}

// a peer as time passes: what it let go of dropped after END_HOLD_MS, the
// peer itself after STALE_MS unheard (null)
export function livePeerAt(p, now = Date.now()) {
    if (!p) return null;
    if (now - p.at > STALE_MS) return null;
    if (p.ended && now - p.ended > END_HOLD_MS) return livePeerAfterUpdate(p);
    return p;
}

// whether a peer has anything to show
export const liveShows = (p) => Boolean(p && (p.stroke || p.string || p.drag || p.moving));

// What a patch lays down, to know it once the board shows it (Luke,
// 2026-10-25: a stroke flashed off and back on as it ended, its preview
// hidden before the board was painted with it): each new stroke's place, a
// layer or '@' and a card's key, and its points. A player's stroke is given
// its id by the GM, so a stroke is known by its points, never its id.
export function landingOf(patch) {
    const out = [];
    for (const [layer, strokes] of Object.entries(patch?.marks ?? {})) {
        for (const st of Object.values(strokes ?? {})) if (Array.isArray(st?.pts)) out.push({ where: layer, pts: st.pts });
    }
    for (const [key, s] of Object.entries(patch?.scraps ?? {})) {
        for (const st of Object.values(s?.marks ?? {})) if (Array.isArray(st?.pts)) out.push({ where: `@${key}`, pts: st.pts });
    }
    return out;
}

// the same points, as the GM writes them (rounded as they already are: a
// sheet stroke's to whole board px, a card's to its units' ten-thousandths)
const samePts = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-3);

// Whether a board shows every stroke a landing waits for: one with its
// points in its place (a card's on that card; a sheet stroke on any layer,
// the GM writing a player's into theirs)
export function landedOn(board, want) {
    return want.every((w) => {
        const pools = w.where.startsWith('@') ? [board?.scraps?.[w.where.slice(1)]?.marks] : Object.values(board?.marks ?? {});
        return pools.some((strokes) => Object.values(strokes ?? {}).some((st) => samePts(st?.pts, w.pts)));
    });
}

// The sender: what changed, gathered and sent at most every LIVE_MS (a
// stroke's new points since the last send, the rest as they are now).
// `emit(msg)` sends; `scene()` the scene viewed; `on()` whether to send at all.
export class LiveSender {
    constructor({ emit, scene, on = () => true, every = LIVE_MS, timers = globalThis }) {
        this.emit = emit;
        this.scene = scene;
        this.on = on;
        this.every = every;
        this.timers = timers;
        this.seq = 0;
        this.queue = new Map();
        this.timer = null;
        // how many of the stroke's numbers were sent; whether a string was
        // shown (to let it go)
        this.sent = 0;
        this.showing = false;
    }

    #put(t, msg) {
        if (!this.on()) return;
        this.queue.set(t, { t, ...msg });
        if (!this.timer) this.timer = this.timers.setTimeout(() => this.flush(), this.every);
    }

    flush() {
        if (this.timer) this.timers.clearTimeout(this.timer);
        this.timer = null;
        const scene = this.scene();
        for (const msg of this.queue.values()) this.emit({ ...msg, scene, seq: this.seq++ });
        this.queue.clear();
    }

    // the stroke being painted (all its points so far): only the new ones go
    stroke(pts, brush, on = null) {
        if (pts.length < this.sent) this.sent = 0;
        const had = this.queue.get('stroke');
        const base = had ? had.base : this.sent;
        this.#put('stroke', { base, pts: pts.slice(base), brush, on });
        this.sent = pts.length;
    }

    string(s) {
        this.showing = true;
        this.#put('string', { string: s });
    }

    drag(patch) {
        this.#put('drag', { patch });
    }

    moving(strokes) {
        this.#put('moving', { strokes });
    }

    // let go: what is queued goes first, then the end
    end() {
        if (!this.on()) return;
        this.flush();
        this.sent = 0;
        this.emit({ t: 'end', scene: this.scene(), seq: this.seq++ });
    }

    // everything queued let go, unsent (the scene left: Luke 2026-10-25, a
    // queued message went out stamped with the next scene)
    drop() {
        if (this.timer) this.timers.clearTimeout(this.timer);
        this.timer = null;
        this.queue.clear();
        this.sent = 0;
        this.showing = false;
    }

    // the string put down (the pointer gone, the tool changed)
    idle() {
        if (!this.showing || !this.on()) return;
        this.showing = false;
        this.queue.delete('string');
        this.flush();
        this.emit({ t: 'idle', scene: this.scene(), seq: this.seq++ });
    }
}
