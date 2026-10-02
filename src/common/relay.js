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

// Run one handler in this client's queue: each waits for the one before it,
// and a failure never blocks the next
export function runQueued(op, data, userId) {
    const fn = handlers.get(op);
    if (!fn) return Promise.reject(new Error(`heart | no relay handler "${op}"`));
    const run = queue.then(() => fn(data ?? {}, userId));
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

export async function onRelayMessage(message) {
    if (!message || typeof message !== 'object' || message.to !== game.user.id) return;
    if (message.kind === 'request') {
        let result = null;
        let error = null;
        try {
            result = await runQueued(message.op, message.data, message.from);
        } catch (err) {
            console.error(`heart | relay "${message.op}" failed`, err);
            error = String(err?.message ?? err);
        }
        game.socket.emit(RELAY_CHANNEL, { kind: 'response', id: message.id, to: message.from, result: result ?? null, error });
        return;
    }
    if (message.kind === 'response') {
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
