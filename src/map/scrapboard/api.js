// The scrapboard map's document half (2026-10-02; the fork's CLAUDE.md "The
// Heart map"): which scenes are scrapboard scenes, and the GM's
// edits to a scene's board (flags.heart.board: the same JSON the Heart Map
// Board mock edits, so a board round-trips between the two). Every write here
// is the GM's: players' writes come through the relay (notes.js), which runs
// these on the GM's client. A players' board (flags.heart.boardOwners: 'all'
// or user ids) is one its owners edit freely. Import replaces the board wholesale and keeps
// the one before it (flags.heart.boardBackup). Undo and redo (Luke,
// 2026-10-06) are each user's own: every write is kept as what it changed
// (model.js diffBoard), so undoing one never puts back what others did since;
// a player's edits come back to them from the GM's client, and their undo goes
// through it again (notes.js board.history). The GM's client also keeps
// rolling copies of each board (backups.js).
import { customKey, keysTaken, labelPatch, tidyBoard, newStringPatch, diffBoard, recordUpdate, updateRoots, binPatch, unbinPatch, takeOffPatch, pxPerInch, seasonMarks } from './model.js';
import { loadBoardLook } from './look.js';
import { relay, RelayTimeout } from '../../common/relay.js';
import { keepBackup } from './backups.js';
import { boardFromText, boardFileName, renamedCards, renamedBinned } from './boardfile.js';

export const BOARD_FLAG = 'board';
const PATH = `flags.heart.${BOARD_FLAG}`;
const BACKUP_PATH = 'flags.heart.boardBackup';

export const isBoardScene = (scene) => Boolean(scene?.flags?.heart?.[BOARD_FLAG]);
export const boardOf = (scene) => scene?.flags?.heart?.[BOARD_FLAG] ?? { scraps: {}, links: {}, pins: {}, marks: {}, decor: [] };

// A players' board (Luke, 2026-10-02): a canvas of their own, for one player,
// several, or the whole group ('all'), where they do anything but see what's
// hidden or bring in landmarks
export const ownersOf = (scene) => scene?.flags?.heart?.boardOwners ?? null;
export const isPlayersBoard = (scene) => Boolean(isBoardScene(scene) && ownersOf(scene));
export function ownsBoard(scene, userId) {
    const o = ownersOf(scene);
    if (!o || !isBoardScene(scene)) return false;
    const user = game.users?.get(userId);
    if (user?.isGM) return false;
    return o === 'all' || (Array.isArray(o) && o.includes(userId));
}

const gmOnly = () => {
    if (game.user.isGM) return true;
    ui.notifications.warn(game.i18n.localize('heart.board.gm-only'));
    return false;
};

/* -------------------------------------------- */
/*  Undo                                        */
/* -------------------------------------------- */

// this client's own edits, by scene: { undo: [record], redo: [record] }
const UNDO_MAX = 100;
const stacks = new Map();
const stackOf = (scene) => {
    let st = stacks.get(scene.id);
    if (!st) stacks.set(scene.id, (st = { undo: [], redo: [] }));
    return st;
};
// An edit of this user's kept (a new one: what could be redone is gone)
export function pushEdit(scene, rec) {
    if (!scene || !rec?.ops?.length) return;
    const st = stackOf(scene);
    st.undo.push(rec);
    if (st.undo.length > UNDO_MAX) st.undo.shift();
    st.redo = [];
}

// One board write at a time on this client, per scene (Luke, 2026-10-21: the
// GM's own edits and the relay's ran side by side, so a write's "before"
// could miss one landing in between, and its undo would take that one back
// too; an import's two steps could have a player's note land in between)
const writing = new Map();
function oneWrite(scene, fn) {
    const run = (writing.get(scene.id) ?? Promise.resolve()).then(fn, fn);
    writing.set(scene.id, run.catch(() => null));
    return run;
}

export const undo = (scene) => step(scene, 'undo');
export const redo = (scene) => step(scene, 'redo');
async function step(scene, dir) {
    if (!scene) return false;
    const st = stackOf(scene);
    const rec = st[dir].pop();
    if (!rec) {
        ui.notifications.info(game.i18n.localize(dir === 'undo' ? 'heart.board.nothing-to-undo' : 'heart.board.nothing-to-redo'));
        return false;
    }
    const side = dir === 'undo' ? 'before' : 'after';
    let ok = false;
    if (game.user.isGM) {
        await oneWrite(scene, async () => {
            const data = recordUpdate(boardOf(scene), rec, side, PATH);
            if (Object.keys(data).length) await scene.update(data, { heartBoard: true });
        });
        ok = true;
        keepBackup(scene, boardOf(scene));
    } else ok = await askHistory(scene, rec, side);
    // (records the GM's client no longer knows: every one kept here is from
    // before its reload, so they all go, said once; Luke, 2026-10-21)
    if (ok === 'forgotten') {
        st.undo = [];
        st.redo = [];
        return false;
    }
    // (refused, it is let go: it can't be done)
    if (ok) st[dir === 'undo' ? 'redo' : 'undo'].push(rec);
    return ok;
}

// A player's undo or redo through the GM's client (notes.js board.history):
// true when done, 'forgotten' when the GM's client no longer knows the record
// (it reloaded since: Luke, 2026-10-21, "Undo doesn't need to survive
// reloading"; said as a note, not a refusal), else false (said as askGM says)
const HISTORY_SAYS = { 'not-allowed': 'heart.relay.not-allowed', missing: 'heart.relay.missing', 'needs-gm': 'heart.relay.needs-gm' };
async function askHistory(scene, rec, side) {
    let res;
    try {
        res = await relay('board.history', { sceneId: scene.id, record: rec, side });
    } catch (err) {
        console.error('heart | board.history failed', err);
        ui.notifications.warn(game.i18n.localize(err instanceof RelayTimeout ? 'heart.relay.no-answer' : 'heart.relay.failed'));
        return false;
    }
    if (res?.status === 'done') return true;
    if (res?.status === 'forgotten') {
        ui.notifications.info(game.i18n.localize('heart.board.undo-forgotten'));
        return 'forgotten';
    }
    ui.notifications.warn(game.i18n.localize(HISTORY_SAYS[res?.status] ?? 'heart.relay.failed'));
    return false;
}

// A board write. It is kept as this user's edit, or (`sink`, the relay's)
// handed back to the player who asked for it; the GM's client keeps a copy of
// the board now and then (`force`: now, as before cards come off)
function update(scene, data, { sink = null, record = true, force = false } = {}) {
    return oneWrite(scene, async () => {
        const roots = updateRoots(data, PATH);
        const before = foundry.utils.deepClone(boardOf(scene));
        if (force) await keepBackup(scene, before, { force: true, why: 'removed' });
        const out = await scene.update(data, { heartBoard: true });
        if (record) {
            const rec = diffBoard(before, boardOf(scene), roots);
            if (sink) sink.push(rec);
            else pushEdit(scene, rec);
        }
        keepBackup(scene, boardOf(scene));
        return out;
    });
}
export { update as writeBoard };

/* -------------------------------------------- */
/*  Edits                                       */
/* -------------------------------------------- */

export async function setScrap(scene, key, patch, opts = {}) {
    if (!gmOnly() || !scene || !key) return;
    return update(scene, { [`${PATH}.scraps.${key}`]: patch }, opts);
}

// An edit from the shared controls (controls.js patch: scraps' fields, one
// string's fields, the board's pins set or taken out), written at once
export function patchData(scene, patch) {
    const board = boardOf(scene);
    const data = {};
    // (new scraps and strings: a name tag and its thread)
    for (const [k, p] of Object.entries(patch?.newScraps ?? {})) if (!board.scraps?.[k]) data[`${PATH}.scraps.${k}`] = p;
    for (const [k, p] of Object.entries(patch?.newLinks ?? {})) if (!board.links?.[k]) data[`${PATH}.links.${k}`] = p;
    for (const [key, p] of Object.entries(patch?.scraps ?? {})) {
        if (!board.scraps?.[key]) continue;
        // (a card taken off: binPatch)
        if (p === null) {
            data[`${PATH}.scraps.-=${key}`] = null;
            continue;
        }
        for (const [k, v] of Object.entries(p)) {
            // (its marker strokes one by one: a null takes one off)
            if (k === 'marks' && v && typeof v === 'object') {
                for (const [id, st] of Object.entries(v)) {
                    if (st === null) data[`${PATH}.scraps.${key}.marks.-=${id}`] = null;
                    else data[`${PATH}.scraps.${key}.marks.${id}`] = st;
                }
                continue;
            }
            data[`${PATH}.scraps.${key}.${k}`] = v;
        }
    }
    for (const [layer, strokes] of Object.entries(patch?.marks ?? {})) {
        for (const [id, st] of Object.entries(strokes ?? {})) {
            if (st === null) { if (board.marks?.[layer]?.[id]) data[`${PATH}.marks.${layer}.-=${id}`] = null; }
            else data[`${PATH}.marks.${layer}.${id}`] = st;
        }
    }
    if (patch?.link && board.links?.[patch.link[0]]) {
        for (const [k, v] of Object.entries(patch.link[1])) data[`${PATH}.links.${patch.link[0]}.${k}`] = v;
    }
    for (const [id, p] of Object.entries(patch?.links ?? {})) {
        if (!board.links?.[id]) continue;
        if (p === null) {
            data[`${PATH}.links.-=${id}`] = null;
            continue;
        }
        for (const [k, v] of Object.entries(p)) data[PATH + '.links.' + id + '.' + k] = v;
    }
    for (const [id, p] of Object.entries(patch?.bits ?? {})) {
        if (p === null) { if (board.bits?.[id]) data[`${PATH}.bits.-=${id}`] = null; }
        else if (board.bits?.[id]) for (const [k, v] of Object.entries(p)) data[`${PATH}.bits.${id}.${k}`] = v;
        else data[`${PATH}.bits.${id}`] = p;
    }
    for (const [id, p] of Object.entries(patch?.pins ?? {})) {
        if (p === null) { if (board.pins?.[id]) data[`${PATH}.pins.-=${id}`] = null; }
        else if (board.pins?.[id]) for (const [k, v] of Object.entries(p)) data[`${PATH}.pins.${id}.${k}`] = v;
        else data[`${PATH}.pins.${id}`] = p;
    }
    // (the bin: a card taken off, or put back)
    for (const [k, e] of Object.entries(patch?.bin ?? {})) {
        if (e === null) { if (board.bin?.[k]) data[`${PATH}.bin.-=${k}`] = null; }
        // (an entry there already is replaced, never merged into: Luke,
        // 2026-10-21, a place taken off twice mixed the two cards' pieces)
        else if (board.bin?.[k]) Object.assign(data, recordUpdate(board, { ops: [{ path: ['bin', k], b: board.bin[k], a: e }] }, 'after', PATH));
        else data[`${PATH}.bin.${k}`] = e;
    }
    return data;
}
export async function applyBoardPatch(scene, patch, opts = {}) {
    if (!gmOnly() || !scene) return;
    const data = patchData(scene, patch);
    if (Object.keys(data).length) return update(scene, data, opts);
}

// A pin of the board's own: { tex, on, at } in a scrap, or { tex, x, y } loose
export async function addPin(scene, data, opts = {}) {
    if (!gmOnly() || !scene || !data?.tex) return null;
    const id = customKey('pin', boardOf(scene).pins ?? {});
    await update(scene, { [`${PATH}.pins.${id}`]: data }, opts);
    return id;
}

// The marker: a stroke on a user's own layer; strokes rubbed out ([[layer,
// id]]); a whole layer (or every one) cleared
export async function addMark(scene, layer, stroke, opts = {}) {
    if (!gmOnly() || !scene || !layer) return null;
    const id = customKey('m', boardOf(scene).marks?.[layer] ?? {});
    await update(scene, { [`${PATH}.marks.${layer}.${id}`]: stroke }, opts);
    return id;
}
export async function removeMarks(scene, list, opts = {}) {
    if (!gmOnly() || !scene) return;
    const marks = boardOf(scene).marks ?? {};
    const data = {};
    const scraps = boardOf(scene).scraps ?? {};
    for (const [layer, id] of list ?? []) {
        if (String(layer).startsWith('@')) {
            const key = String(layer).slice(1);
            if (scraps[key]?.marks?.[id]) data[`${PATH}.scraps.${key}.marks.-=${id}`] = null;
        } else if (marks[layer]?.[id]) data[`${PATH}.marks.${layer}.-=${id}`] = null;
    }
    if (Object.keys(data).length) return update(scene, data, opts);
}
// Every brush stroke on the board, the sheet's and the cards' (Luke,
// 2026-10-06: Reset all brushes, the GM's), as one edit Undo takes back
export async function clearAllBrushes(scene) {
    if (!gmOnly() || !scene) return;
    const b = boardOf(scene);
    const data = {};
    if (b.marks) data[`${PATH}.-=marks`] = null;
    for (const [k, s] of Object.entries(b.scraps ?? {})) if (s?.marks && Object.keys(s.marks).length) data[`${PATH}.scraps.${k}.-=marks`] = null;
    if (Object.keys(data).length) return update(scene, data, { force: true });
}

export async function setLink(scene, id, patch) {
    if (!gmOnly() || !scene || !id) return;
    return update(scene, { [`${PATH}.links.${id}`]: patch });
}

// A new scrap: a book landmark (lib: its library key), a landmark of the
// GM's own (uuid, name), a note (text), or pencil writing (scrawl: text)
export async function addScrap(scene, data) {
    if (!gmOnly() || !scene) return null;
    const scraps = boardOf(scene).scraps ?? {};
    const key = data.lib && !scraps[data.lib] ? data.lib : customKey(data.type === 'note' ? 'n' : data.type === 'scrawl' ? 'w' : 'c', keysTaken(boardOf(scene)));
    // (a card may come with a doodle of its owner's: Luke 2026-10-06)
    const doodle = data.type === 'scrawl' || data.tag || data.marks ? {} : seasonMarks(`${scene.id}:${key}`, { by: data.author ?? game.user.id, type: data.type ?? 'landmark' });
    await update(scene, { [`${PATH}.scraps.${key}`]: { state: 'known', ...data, ...(Object.keys(doodle).length ? { marks: doodle } : {}), x: Math.round(data.x), y: Math.round(data.y) } });
    return key;
}

// A place invented mid-campaign (Luke, 2026-10-21: File, New place): a
// landmark actor of that name and picture in the Heart Map places actor
// folder (made the first time; found again by its flag, renamed or not), its
// card put on the board at `at` (board px), hidden or known. { actor, key }.
const PLACES_FLAG = 'mapPlaces';
async function placesFolder() {
    const have = game.folders?.find((f) => f.type === 'Actor' && f.flags?.heart?.[PLACES_FLAG]);
    if (have) return have;
    return Folder.create({ name: game.i18n.localize('heart.board.places-folder'), type: 'Actor', flags: { heart: { [PLACES_FLAG]: true } } });
}
export async function newPlace(scene, { name, img = null, state = 'hidden', at } = {}) {
    if (!gmOnly() || !scene || !at || !String(name ?? '').trim()) return null;
    const folder = await placesFolder();
    const actor = await Actor.create({ name: String(name).trim(), type: 'landmark', folder: folder?.id ?? null, ...(img ? { img } : {}) });
    if (!actor) return null;
    const key = await addScrap(scene, { type: 'landmark', uuid: actor.uuid, name: actor.name, x: at.x, y: at.y, state: state === 'known' ? 'known' : 'hidden' });
    return { actor, key };
}

// A place's cards follow its actor's renames (Luke, 2026-10-21), on every
// board: an edit of the GM's like any other, so Undo takes it back
export async function followRename(actor) {
    if (!game.user.isGM || actor?.type !== 'landmark') return;
    for (const scene of game.scenes ?? []) {
        if (!isBoardScene(scene)) continue;
        const patches = renamedCards(boardOf(scene), actor.uuid, actor.name);
        // (and its cards in the bin, so one put back has its name now: Luke,
        // 2026-10-21)
        const binned = renamedBinned(boardOf(scene), actor.uuid, actor.name);
        const data = {};
        for (const [key, p] of Object.entries(patches)) data[`${PATH}.scraps.${key}.name`] = p.name;
        for (const key of binned) data[`${PATH}.bin.${key}.scrap.name`] = actor.name;
        if (Object.keys(data).length) await update(scene, data);
    }
}

// (each end a scrap's key, a loose point, or a pin of the board's own: aPin, bPin)
export async function addLink(scene, { a = null, b = null, aPt = null, bPt = null, aAt = null, bAt = null, aPin = null, bPin = null, kind = 'delve', label = '', state = 'known' }, opts = {}) {
    if (!gmOnly() || !scene || !(a || aPt || aPin) || !(b || bPt || bPin) || (a && a === b)) return null;
    const id = customKey('l', boardOf(scene).links ?? {});
    const data = { kind, state };
    if (aPin) data.aPin = aPin; else if (a) data.a = a; else data.aPt = { x: Math.round(aPt.x), y: Math.round(aPt.y) };
    if (bPin) data.bPin = bPin; else if (b) data.b = b; else data.bPt = { x: Math.round(bPt.x), y: Math.round(bPt.y) };
    // (a tied end where it was put on its scrap)
    if (a && aAt) data.aAt = aAt;
    if (b && bAt) data.bAt = bAt;
    if (label) data.label = label;
    await update(scene, { [`${PATH}.links.${id}`]: data }, opts);
    return id;
}

// Take a card off the board, into the bin (Luke, 2026-10-06: never deleted
// outright), with its pins and every string tied to it
export async function removeScrap(scene, key, opts = {}) {
    return binCards(scene, [key], opts);
}

// Cards into the board's bin (model.js binPatch), a copy of the board kept first
export async function binCards(scene, keys, opts = {}) {
    if (!gmOnly() || !scene || !keys?.length) return;
    const patch = binPatch(boardOf(scene), keys, { at: Date.now(), by: opts.by ?? game.user.id });
    if (!patch) return;
    const data = patchData(scene, patch);
    if (Object.keys(data).length) return update(scene, data, { ...opts, force: true });
}

// A card out of the bin, back where it was (model.js unbinPatch)
export async function unbinCard(scene, key, opts = {}) {
    if (!gmOnly() || !scene) return;
    const patch = unbinPatch(boardOf(scene), key);
    if (patch) return applyBoardPatch(scene, patch, opts);
}

// The bin emptied (the GM's)
export async function emptyBin(scene) {
    if (!gmOnly() || !scene || !boardOf(scene).bin) return;
    return update(scene, { [`${PATH}.-=bin`]: null }, { force: true });
}

// Things taken off the board at once, with what depends on them (model.js
// takeOffPatch): cards into the bin, never gone (their pins, and every string
// tied to them), the board's pins (every string they hold; joints they hold
// let go), and strings. One write, so one edit to undo (Luke, 2026-10-21:
// cards and pins taken off together took two Ctrl+Z to come back).
export async function removeMany(scene, what = {}, opts = {}) {
    if (!gmOnly() || !scene) return;
    const patch = takeOffPatch(boardOf(scene), what, { at: Date.now(), by: opts.by ?? game.user.id });
    if (!patch) return;
    const data = patchData(scene, patch);
    if (Object.keys(data).length) return update(scene, data, { ...opts, force: opts.force || Object.keys(patch.scraps).length > 0 });
}

// What the model needs to lay a board out here: the look, a texture's size,
// and a text measure
let measurer = null;
async function layoutTools() {
    const { look, textures, ok } = await loadBoardLook();
    const size = (id) => { const t = textures[id]; return t ? { w: t.w, h: t.h, safe: t.safe, cover: t.cover } : null; };
    measurer ??= document.createElement('canvas').getContext('2d');
    const measure = (text, px, font) => {
        measurer.font = `${px}px "${font}"`;
        return measurer.measureText(text).width;
    };
    return { look, size, measure, ok };
}

// A name for a string: a pin in it, a name tag (a note), and a thread
// between them, ordinary pieces from then on (model.js labelPatch)
export async function labelString(scene, id, text, opts = {}) {
    if (!gmOnly() || !scene || !text) return;
    const { look, size, measure } = await layoutTools();
    // (a player's own string's name: theirs, `author`)
    const { author = null, ...o } = opts;
    const patch = labelPatch(boardOf(scene), id, text, look, size, measure, { author });
    if (patch) return applyBoardPatch(scene, patch, o);
}

// An older board made whole, once (model.js tidyBoard: name tags made notes,
// every string's ends and joints made pins, loose pins on cards stuck in
// them): the GM's client, when the world loads and when the scene is viewed
export async function tidyBoardScene(scene) {
    if (!game.user.isGM || !isBoardScene(scene)) return;
    const { look, size, measure, ok } = await layoutTools();
    // (never on the default look: without the content module's look the tidy
    // would resize the scene and re-lay pins by the wrong cards; Luke
    // 2026-10-23, the board safety audit)
    if (!ok) return;
    const { board, changed } = tidyBoard(boardOf(scene), look, size, measure);
    if (changed) await replaceBoard(scene, board, { record: false });
    // (once: an older board scene's tokens brought down to the board's size)
    // (the scene the look's size: a new sheet, 4 papers by 5 since 2026-10-03)
    if (scene.width !== look.w || scene.height !== look.h) await scene.update({ width: look.w, height: look.h });
    if ((scene.flags?.heart?.boardGrid ?? 0) < BOARD_GRID_EDITION) {
        await scene.update({ ...gridOf(look), 'flags.heart.boardGrid': BOARD_GRID_EDITION });
    }
}

// A new string between two ends (a pin each: one there, or one made where it
// was asked for), returning its id
export async function addString(scene, act, kind, { color = null, state = 'known' } = {}, opts = {}) {
    if (!gmOnly() || !scene) return null;
    const { look } = await layoutTools();
    const { id, patch } = newStringPatch(boardOf(scene), act, kind, look, { color, state });
    await applyBoardPatch(scene, patch, opts);
    return id;
}

export async function removeLink(scene, id, opts = {}) {
    if (!gmOnly() || !scene || !boardOf(scene).links?.[id]) return;
    return update(scene, { [`${PATH}.links.-=${id}`]: null }, opts);
}

/* -------------------------------------------- */
/*  Import, export, backup                      */
/* -------------------------------------------- */

// What a board is, whole (Luke, 2026-10-21: the loose pieces and the pins'
// tidy mark were being dropped by export and replace, so every load tidied
// the pins again)
const BOARD_PARTS = ['scraps', 'links', 'pins', 'marks', 'bits', 'decor'];
function boardParts(b) {
    return {
        scraps: b.scraps ?? {}, links: b.links ?? {}, pins: b.pins ?? {}, marks: b.marks ?? {}, bits: b.bits ?? {}, decor: b.decor ?? [],
        ...(b.bin ? { bin: b.bin } : {}), ...(b.pinsEd ? { pinsEd: b.pinsEd } : {}),
    };
}

// The board as the mock's File tab takes it
export function exportBoard(scene) {
    const b = boardOf(scene);
    return JSON.stringify(boardParts(b), null, 1);
}

// Replace the whole board (an import, an earlier board, or the backup
// restored): one edit of the GM's, undone like any other
export function replaceBoard(scene, board, { record = true, backup = false } = {}) {
    // (a copy: the backup restored is the scene's own data, which the first
    // update below writes over; Luke, 2026-10-21)
    const clean = foundry.utils.deepClone(boardParts(board));
    return oneWrite(scene, async () => {
        const before = foundry.utils.deepClone(boardOf(scene));
        await keepBackup(scene, before, { force: true, why: 'replaced' });
        // (a nested object update merges; the board is cleared first so it is replaced)
        // (the backup too: written over, it merged with the one before it)
        const data = Object.fromEntries([...BOARD_PARTS, 'bin', 'pinsEd'].map((k) => [`${PATH}.-=${k}`, null]));
        if (backup) data['flags.heart.-=boardBackup'] = null;
        await scene.update(data, { heartBoard: true });
        const out = await scene.update({ [PATH]: clean, ...(backup ? { [BACKUP_PATH]: before } : {}) }, { heartBoard: true });
        if (record) pushEdit(scene, diffBoard(before, boardOf(scene)));
        return out;
    });
}

// A board pasted from the mock, another scene's export, or a downloaded file
// (boardfile.js boardFromText). Checked by the model first: anything it can't
// place is dropped; the JSON is kept as written (the model fills defaults
// when it reads it). (Luke, 2026-10-21: its loose pieces, bin, and pins' tidy
// mark come too, so a downloaded board loads back whole.)
export async function importBoard(scene, text) {
    if (!gmOnly() || !scene) return false;
    const read = boardFromText(text);
    if (!read) {
        ui.notifications.error(game.i18n.localize('heart.board.import-bad'));
        return false;
    }
    await replaceBoard(scene, read.board, { backup: true });
    ui.notifications.info(game.i18n.format('heart.board.imported', { scraps: read.scraps, links: read.links }));
    return true;
}

// The board saved as a .json file, named from the scene and the day (Luke,
// 2026-10-21: File, Download the board); Import loads it back
export function downloadBoard(scene) {
    if (!gmOnly() || !scene) return;
    saveDataToFile(exportBoard(scene), 'application/json', boardFileName(scene.name, new Date(), game.i18n.localize('heart.board.snapshot-file')));
}

export const hasBackup = (scene) => Boolean(scene?.flags?.heart?.boardBackup);

// Swap the board and its backup (so a restore can itself be undone)
export async function restoreBackup(scene) {
    if (!gmOnly() || !scene || !hasBackup(scene)) return;
    return replaceBoard(scene, scene.flags.heart.boardBackup, { backup: true });
}

/* -------------------------------------------- */
/*  The scene                                   */
/* -------------------------------------------- */

// A token's size on the board (canvas px, one board px each; a card is 200
// across): its grid. (Luke, 2026-10-03: the tokens at 150 were enormous and
// would muddy the board; 0.2x of that to start, then 0.25x.) The edition
// makes an older board scene's grid this size once, on the GM's client.
export const BOARD_GRID = 38;
// (3, 2026-10-06: measured in inches, the board's own: each fold panel is a
// printer's page, 11 inches tall)
const BOARD_GRID_EDITION = 3;
const gridOf = (look) => ({ 'grid.size': BOARD_GRID, 'grid.distance': Math.round((BOARD_GRID / pxPerInch(look)) * 1000) / 1000, 'grid.units': 'in' });

// Make a scrapboard scene, sized to the look, and view it. Gridless; tokens
// see everything (the map is a picture, not a dungeon).
// owners: a players' board's ('all', or user ids), whose players may view it
export async function createBoardScene({ name, owners = null } = {}) {
    if (!gmOnly()) return null;
    const { look, ok } = await loadBoardLook();
    if (!ok) ui.notifications.warn(game.i18n.localize('heart.board.no-look'));
    const scene = await Scene.create({
        name: name ?? game.i18n.localize('heart.board.scene-name'),
        width: look.w,
        height: look.h,
        padding: 0.05,
        backgroundColor: '#0b0705',
        grid: { type: CONST.GRID_TYPES.GRIDLESS, size: BOARD_GRID, distance: gridOf(look)['grid.distance'], units: 'in' },
        tokenVision: false,
        fog: { exploration: false },
        navigation: true,
        flags: { heart: { [BOARD_FLAG]: { scraps: {}, links: {}, pins: {}, marks: {}, decor: [] }, boardGrid: BOARD_GRID_EDITION, ...(owners ? { boardOwners: owners } : {}) } },
        ...(owners ? { ownership: owners === 'all' ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } : Object.fromEntries(owners.map((id) => [id, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER])) } : {}),
    });
    await scene?.view();
    return scene;
}

// Turn an existing scene into a scrapboard scene (or back), sized to the look
export async function setBoardScene(scene, on = true) {
    if (!gmOnly() || !scene) return;
    if (!on) return scene.update({ 'flags.heart.-=board': null });
    const { look } = await loadBoardLook();
    return scene.update({ width: look.w, height: look.h, ...gridOf(look), 'flags.heart.boardGrid': BOARD_GRID_EDITION, [PATH]: isBoardScene(scene) ? boardOf(scene) : { scraps: {}, links: {}, decor: [] } });
}
