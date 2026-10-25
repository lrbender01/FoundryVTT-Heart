// One writer for the state several clients could race on (2026-10-02, Luke:
// two players marking Provisions at once, or a stress card applied twice,
// "guard against that and expect it").
//
// A player's client names an operation and asks over the system socket; the
// active GM's client runs that operation's handler, one request at a time,
// and answers. The GM's own calls join the same queue. With no GM connected
// the caller runs the handler itself (same queue, same checks), which only
// races another player doing the same thing at the same moment.
//
// Rules for handlers:
//   - they run with the GM's permissions, so each checks who asked
//     (`userId`) and whether the thing was already done, inside the queue,
//     against the GM's current documents
//   - they never call relay() themselves: they would wait behind their own
//     slot in the queue
//   - they answer with plain JSON, and never show a notification (that would
//     appear on the GM's screen); the caller reports the answer
//
// Needs "socket": true in src/manifest.json (Foundry restart once).

export const RELAY_CHANNEL = 'system.heart';
const TIMEOUT_MS = 15000;
// (Luke, 2026-10-21: one handler that never settled stalled every later
// request for the session) each handler gets a little less than the asking
// client waits, then the queue moves on without it
export const HANDLER_LIMIT_MS = 12000;
// (Luke, 2026-10-25, the health audit: a request queued behind others timed
// out for the asker and was still written, as the handler's time began only
// when it started) a request's time counts from when it was sent, on the
// clock of Foundry's server, which the asker's and the GM's clients share
const now = () => game.time?.serverTime ?? Date.now();
// the requests the GM's client answered lately, by sender and id: one asked
// again under the same id is answered as before, never done twice
const ANSWERED_MAX = 200;
const answered = new Map();
// (a live message past this size is dropped unread: a preview never needs
// more; Luke 2026-10-25)
export const LIVE_MAX = 256 * 1024;

const handlers = new Map();
const pending = new Map();

// Live messages (Luke, 2026-10-25: the Heart map's previews of what each user
// is doing, map/scrapboard/live.js): broadcast to every other client on the
// same channel, never queued or answered, never written anywhere
let liveHandler = null;
export function onLive(fn) {
    liveHandler = fn;
}
export function sendLive(data) {
    game.socket?.emit(RELAY_CHANNEL, { ...data, kind: 'live', from: game.user.id });
}
let queue = Promise.resolve();

export class RelayTimeout extends Error {
    constructor(op) {
        super(`heart | no answer from the GM's client for "${op}"`);
        this.name = 'RelayTimeout';
    }
}

export function registerRelayHandler(op, fn) {
    handlers.set(op, fn);
}

// A handler's answer, or a RelayTimeout once `ms` have passed
function withinLimit(op, work, ms) {
    let timer;
    const limit = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new RelayTimeout(op)), ms);
    });
    return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Work in this client's queue: each waits for the one before it, and a
// failure (or work that never ends) never blocks the next. `deadline` (server
// time): past it the asker has given up, so it is let go unrun; else it has
// what is left of it, HANDLER_LIMIT_MS at most.
function inQueue(op, fn, deadline = null) {
    const run = queue.then(() => {
        const left = deadline === null ? HANDLER_LIMIT_MS : Math.min(HANDLER_LIMIT_MS, deadline - now());
        if (left <= 0) throw new RelayTimeout(op);
        return withinLimit(op, Promise.resolve().then(fn), left);
    });
    queue = run.catch(() => null);
    return run;
}

// Run one handler in this client's queue
export function runQueued(op, data, userId, { deadline = null } = {}) {
    const fn = handlers.get(op);
    if (!fn) return Promise.reject(new Error(`heart | no relay handler "${op}"`));
    return inQueue(op, () => fn(data ?? {}, userId), deadline);
}

// This client's own work in the handlers' queue, so it never runs between a
// handler's reading and its write (Luke, 2026-10-25: the GM letting a hand go
// as a player claimed one lost one of the two)
export function runLocal(op, fn) {
    return inQueue(op, fn);
}

// Ask the active GM's client to run `op`; resolves with its answer
export function relay(op, data = {}) {
    const gm = game.users?.activeGM;
    if (!gm || gm.isSelf || !game.socket) return runQueued(op, data, game.user.id);
    const id = foundry.utils.randomID();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new RelayTimeout(op));
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        // (`sent`: when, so the GM's client lets it go once this one has
        // stopped waiting; both sides ship in one build, and a request
        // without it counts from when it arrives)
        game.socket.emit(RELAY_CHANNEL, { kind: 'request', id, op, data, from: game.user.id, to: gm.id, sent: now() });
    });
}

// relay() for a button: the answer when it was done, else null after telling
// this user why (already done, not theirs, gone, no answer). Handlers answer
// { status: 'done', ... } or one of these statuses.
const STATUS_WARNINGS = {
    already: 'heart.relay.already',
    'not-allowed': 'heart.relay.not-allowed',
    missing: 'heart.relay.missing',
    'no-party': 'heart.party.no-party',
    'needs-gm': 'heart.relay.needs-gm',
};

// (`seen`: given every answer, done or not, as a request that wrote part of
// what it asked and then failed hands back what it wrote; Luke 2026-10-25)
export async function askGM(op, data = {}, { seen = null } = {}) {
    let answer;
    try {
        answer = await relay(op, data);
    } catch (err) {
        console.error(`heart | ${op} failed`, err);
        ui.notifications?.warn(game.i18n.localize(err instanceof RelayTimeout ? 'heart.relay.no-answer' : 'heart.relay.failed'));
        return null;
    }
    seen?.(answer);
    if (answer?.status === 'done') return answer;
    ui.notifications?.warn(game.i18n.localize(STATUS_WARNINGS[answer?.status] ?? 'heart.relay.failed'));
    return null;
}

// senderId: the user Foundry's server says sent the message (it passes the
// sender's id as the listener's second argument, server sockets.mjs
// handleCustomSocket in 12.343). Every handler's permission check rests on
// who asked, so that id wins over the `from` the asking client wrote
// (Luke, 2026-10-21: any client could write the GM's id into `from`).
export async function onRelayMessage(message, senderId) {
    // (a live message: everyone's, in the sender's own name only)
    if (message?.kind === 'live') {
        if (senderId && senderId !== message.from) return;
        try {
            if (JSON.stringify(message).length > LIVE_MAX) return;
            liveHandler?.(message, senderId ?? message.from);
        } catch (err) {
            console.warn('heart | a live message could not be shown', err);
        }
        return;
    }
    if (!message || typeof message !== 'object' || message.to !== game.user.id) return;
    if (message.kind === 'request') {
        if (senderId && senderId !== message.from) {
            console.warn(`heart | relay "${message.op}" refused: sent by ${senderId} in the name of ${message.from}`);
            game.socket.emit(RELAY_CHANNEL, { kind: 'response', id: message.id, to: senderId, result: { status: 'not-allowed' }, error: null });
            return;
        }
        const from = senderId ?? message.from;
        const seen = `${from}:${message.id}`;
        let answer = answered.get(seen);
        if (!answer) {
            const sent = Number.isFinite(message.sent) ? Math.min(message.sent, now()) : now();
            answer = runQueued(message.op, message.data, from, { deadline: sent + HANDLER_LIMIT_MS }).then(
                (result) => ({ result: result ?? null, error: null }),
                (err) => {
                    console.error(`heart | relay "${message.op}" failed`, err);
                    return { result: null, error: String(err?.message ?? err) };
                },
            );
            answered.set(seen, answer);
            while (answered.size > ANSWERED_MAX) answered.delete(answered.keys().next().value);
        }
        const { result, error } = await answer;
        game.socket.emit(RELAY_CHANNEL, { kind: 'response', id: message.id, to: from, result, error });
        return;
    }
    if (message.kind === 'response') {
        // only a GM's client answers requests
        if (senderId && !game.users?.get(senderId)?.isGM) return;
        const waiting = pending.get(message.id);
        if (!waiting) return;
        clearTimeout(waiting.timer);
        pending.delete(message.id);
        if (message.error) waiting.reject(new Error(message.error));
        else waiting.resolve(message.result);
    }
}

// init: game.socket exists before init, and a GM must hear requests from
// the moment its world is up
export function registerRelay() {
    game.socket?.on(RELAY_CHANNEL, onRelayMessage);
}
