// Rolling copies of each board (Luke, 2026-10-06: a deletion he couldn't get
// back), kept on the GM's client in this browser's IndexedDB: a copy every few
// minutes while the board is being edited, and always just before cards come
// off it or the whole board is replaced. The newest KEEP of each scene are
// kept; File: Earlier boards puts one back (as an edit, so it can itself be
// undone). Never anything a player's client keeps, and never a failure: a
// browser without IndexedDB (a private window) just keeps none.
const DB = 'heart-board-backups';
const STORE = 'boards';
const KEEP = 40;
// (a copy at most this often while edits go on, ms)
const EVERY = 3 * 60 * 1000;

let opening = null;
function open() {
    if (opening) return opening;
    opening = new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB, 1);
            req.onupgradeneeded = () => {
                const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('scene', 'scene');
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

// how many of each thing a board holds (the list's summary)
export const countsOf = (b) => ({
    cards: Object.keys(b?.scraps ?? {}).length,
    strings: Object.keys(b?.links ?? {}).length,
    pins: Object.keys(b?.pins ?? {}).length,
    strokes: Object.values(b?.marks ?? {}).reduce((n, l) => n + Object.keys(l ?? {}).length, 0),
    binned: Object.keys(b?.bin ?? {}).length,
});

const last = new Map();
const lastJSON = new Map();

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
        // (each step its own transaction: none is held open across an await)
        await done(db.transaction(STORE, 'readwrite').objectStore(STORE).add({ scene: scene.id, name: scene.name, at: now, why, counts: countsOf(board), board: JSON.parse(json) }));
        // (the oldest let go)
        const keys = (await done(db.transaction(STORE).objectStore(STORE).index('scene').getAllKeys(scene.id))) ?? [];
        const old = keys.slice(0, Math.max(0, keys.length - KEEP));
        if (old.length) {
            const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
            for (const k of old) store.delete(k);
        }
    } catch (err) {
        console.warn('heart | a copy of the board could not be kept', err);
    }
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
