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

const handlers = new Map();
const pending = new Map();
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

// A handler's answer, or a RelayTimeout once HANDLER_LIMIT_MS has passed
function withinLimit(op, work) {
    let timer;
    const limit = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new RelayTimeout(op)), HANDLER_LIMIT_MS);
    });
    return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Run one handler in this client's queue: each waits for the one before it,
// and a failure (or a handler that never answers) never blocks the next
export function runQueued(op, data, userId) {
    const fn = handlers.get(op);
    if (!fn) return Promise.reject(new Error(`heart | no relay handler "${op}"`));
    const run = queue.then(() => withinLimit(op, Promise.resolve().then(() => fn(data ?? {}, userId))));
    queue = run.catch(() => null);
    return run;
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
        game.socket.emit(RELAY_CHANNEL, { kind: 'request', id, op, data, from: game.user.id, to: gm.id });
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

export async function askGM(op, data = {}) {
    let answer;
    try {
        answer = await relay(op, data);
    } catch (err) {
        console.error(`heart | ${op} failed`, err);
        ui.notifications?.warn(game.i18n.localize(err instanceof RelayTimeout ? 'heart.relay.no-answer' : 'heart.relay.failed'));
        return null;
    }
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
    if (!message || typeof message !== 'object' || message.to !== game.user.id) return;
    if (message.kind === 'request') {
        if (senderId && senderId !== message.from) {
            console.warn(`heart | relay "${message.op}" refused: sent by ${senderId} in the name of ${message.from}`);
            game.socket.emit(RELAY_CHANNEL, { kind: 'response', id: message.id, to: senderId, result: { status: 'not-allowed' }, error: null });
            return;
        }
        const from = senderId ?? message.from;
        let result = null;
        let error = null;
        try {
            result = await runQueued(message.op, message.data, from);
        } catch (err) {
            console.error(`heart | relay "${message.op}" failed`, err);
            error = String(err?.message ?? err);
        }
        game.socket.emit(RELAY_CHANNEL, { kind: 'response', id: message.id, to: from, result: result ?? null, error });
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
