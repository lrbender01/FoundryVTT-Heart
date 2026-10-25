// Rolling copies of each board (Luke, 2026-10-06: a deletion he couldn't get
// back), kept on the GM's client in this browser's IndexedDB: a copy every few
// minutes while the board is being edited, and always just before cards come
// off it or the whole board is replaced. The newest KEEP of each scene are
// kept; File: Earlier boards puts one back (as an edit, so it can itself be
// undone). Never anything a player's client keeps, and never a failure: a
// browser without IndexedDB (a private window) just keeps none.
// (Luke, 2026-10-25, the health audit) The copies made at a session's start
// and before a board is replaced are a small pool of their own, so a run of
// cards taken off never pushes them out; copies of this world's scenes
// deleted since are let go once a session.
const DB = 'heart-board-backups';
const STORE = 'boards';
const KEEP = 40;
// (the copies kept apart, and how many of them per scene)
const KEPT_WHY = new Set(['start', 'replaced']);
const KEEP_KEPT = 10;
// (a copy at most this often while edits go on, ms)
const EVERY = 3 * 60 * 1000;

let opening = null;
function open() {
    if (opening) return opening;
    opening = new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB, 2);
            req.onupgradeneeded = (ev) => {
                const store = ev.oldVersion < 1 ? req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }) : req.transaction.objectStore(STORE);
                if (ev.oldVersion < 1) store.createIndex('scene', 'scene');
                // (each copy's scene and why, and its world and scene, read
                // without its board: 2; every world on this server shares the
                // store, and a copy from before has no world)
                if (ev.oldVersion < 2) {
                    store.createIndex('sceneWhy', ['scene', 'why']);
                    store.createIndex('worldScene', ['world', 'scene']);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return opening;
}

const done = (req) => new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
});

// an index's keys and their copies' ids, [[key, id]], without the boards
const keyPairs = (index, range = null) => new Promise((resolve) => {
    const out = [];
    const req = index.openKeyCursor(range);
    req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.push([c.key, c.primaryKey]);
        c.continue();
    };
    req.onerror = () => resolve(out);
});

// how many of each thing a board holds (the list's summary)
export const countsOf = (b) => ({
    cards: Object.keys(b?.scraps ?? {}).length,
    strings: Object.keys(b?.links ?? {}).length,
    pins: Object.keys(b?.pins ?? {}).length,
    strokes: Object.values(b?.marks ?? {}).reduce((n, l) => n + Object.keys(l ?? {}).length, 0),
    binned: Object.keys(b?.bin ?? {}).length,
});

// The copies of one scene to let go ([{ id, why }], ids rising with time):
// past the newest KEEP_KEPT of the start and replaced ones, and past the
// newest KEEP of the rest
export function backupsToDrop(list) {
    const ids = [...(list ?? [])].sort((a, b) => a.id - b.id);
    const kept = ids.filter((e) => KEPT_WHY.has(e.why));
    const rest = ids.filter((e) => !KEPT_WHY.has(e.why));
    return [...kept.slice(0, Math.max(0, kept.length - KEEP_KEPT)), ...rest.slice(0, Math.max(0, rest.length - KEEP))].map((e) => e.id);
}

const last = new Map();
const lastJSON = new Map();
let pruned = false;

// A copy of a scene's board, when it is time (or `force`); the GM's client only
export async function keepBackup(scene, board, { force = false, why = 'edits' } = {}) {
    try {
        if (!game.user?.isGM || !scene || !board) return;
        const now = Date.now();
        if (!force && now - (last.get(scene.id) ?? 0) < EVERY) return;
        const json = JSON.stringify(board);
        if (json === lastJSON.get(scene.id)) return;
        last.set(scene.id, now);
        lastJSON.set(scene.id, json);
        const db = await open();
        if (!db) return;
        // (once a session, the first time one is kept)
        if (!pruned) {
            pruned = true;
            await pruneGoneScenes(db);
        }
        // (each step its own transaction: none is held open across an await)
        await done(db.transaction(STORE, 'readwrite').objectStore(STORE).add({ world: game.world?.id ?? null, scene: scene.id, name: scene.name, at: now, why, counts: countsOf(board), board: JSON.parse(json) }));
        // (the oldest of each pool let go)
        const index = db.transaction(STORE).objectStore(STORE).index('sceneWhy');
        const list = (await keyPairs(index, IDBKeyRange.bound([scene.id], [scene.id, []]))).map(([key, id]) => ({ id, why: key[1] }));
        const old = backupsToDrop(list);
        if (old.length) {
            const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
            for (const k of old) store.delete(k);
        }
    } catch (err) {
        console.warn('heart | a copy of the board could not be kept', err);
    }
}

// The copies of this world's scenes deleted since let go (another world's,
// or one from before copies named their world, are never touched)
async function pruneGoneScenes(db) {
    const world = game.world?.id;
    if (!world || !game.scenes) return;
    const pairs = await keyPairs(db.transaction(STORE).objectStore(STORE).index('worldScene'), IDBKeyRange.bound([world], [world, []]));
    const gone = pairs.filter(([key]) => !game.scenes.get(key[1])).map(([, id]) => id);
    if (!gone.length) return;
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    for (const k of gone) store.delete(k);
}

// A scene's copies, newest first (without their boards): [{ id, at, why, counts }]
export async function listBackups(sceneId) {
    try {
        const db = await open();
        if (!db) return [];
        const all = await done(db.transaction(STORE).objectStore(STORE).index('scene').getAll(sceneId));
        return (all ?? []).map(({ id, at, why, counts }) => ({ id, at, why, counts })).sort((a, b) => b.at - a.at);
    } catch {
        return [];
    }
}

// One copy's board
export async function readBackup(id) {
    try {
        const db = await open();
        if (!db) return null;
        return (await done(db.transaction(STORE).objectStore(STORE).get(id)))?.board ?? null;
    } catch {
        return null;
    }
}
