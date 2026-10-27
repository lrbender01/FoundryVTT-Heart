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
import { unmarkPatch, binLetGo, customKey, keysTaken, labelPatch, tidyBoard, newStringPatch, diffBoard, recordUpdate, updateRoots, binPatch, unbinPatch, takeOffPatch, pxPerInch, seasonMarks, sheetLook, boardSheet, normalizeBoard, boardView, contentBounds, resizeSheet, resizedBoard, pageOf, reshapeSheet, bareSheet, isBareBoard } from './model.js';
import { loadBoardLook, styleOf, DEFAULT_STYLE } from './look.js';
import { relay, RelayTimeout } from '../../common/relay.js';
import { keepBackup } from './backups.js';
import { manifestAt } from './backdrop.js';
import { SQUARES, metresPer } from './baked.js';
import { boardFromText, boardParts, boardFileName, renamedCards, renamedBinned, downloadDue, worldCopyName } from './boardfile.js';

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
        try {
            await oneWrite(scene, async () => {
                const data = recordUpdate(boardOf(scene), rec, side, PATH);
                if (Object.keys(data).length) await scene.update(data, { heartBoard: true });
            });
            ok = true;
            keepBackup(scene, boardOf(scene));
        } catch (err) {
            console.error(`heart | the board's ${dir} failed`, err);
            ui.notifications.warn(game.i18n.localize('heart.board.undo-failed'));
            ok = null;
        }
    } else ok = await askHistory(scene, rec, side);
    // (records the GM's client no longer knows: every one kept here is from
    // before its reload, so they all go, said once; Luke, 2026-10-21)
    if (ok === 'forgotten') {
        st.undo = [];
        st.redo = [];
        return false;
    }
    // (the write failed, or the GM's client didn't answer: the record is kept
    // to try again, never lost from both lists; Luke 2026-10-25, the health
    // audit)
    if (ok === null) {
        st[dir].push(rec);
        return false;
    }
    // (refused, it is let go: it can't be done)
    if (ok) st[dir === 'undo' ? 'redo' : 'undo'].push(rec);
    return ok;
}

// A player's undo or redo through the GM's client (notes.js board.history):
// true when done, 'forgotten' when the GM's client no longer knows the record
// (it reloaded since: Luke, 2026-10-21, "Undo doesn't need to survive
// reloading"; said as a note, not a refusal), null when it never got there
// (no answer, or a failure), else false (said as askGM says)
const HISTORY_SAYS = { 'not-allowed': 'heart.relay.not-allowed', missing: 'heart.relay.missing', 'needs-gm': 'heart.relay.needs-gm' };
async function askHistory(scene, rec, side) {
    let res;
    try {
        res = await relay('board.history', { sceneId: scene.id, record: rec, side });
    } catch (err) {
        console.error('heart | board.history failed', err);
        ui.notifications.warn(game.i18n.localize(err instanceof RelayTimeout ? 'heart.relay.no-answer' : 'heart.relay.failed'));
        return null;
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
// the board now and then (`force`: now, as before cards come off).
// (`data` a function: the update made when the write's turn comes, from the
// board as it is then, so the new ids it picks are free. Luke 2026-10-25:
// ids picked before an earlier write had landed took its pin or stroke,
// two quick pins making one)
function update(scene, data0, { sink = null, record = true, force = false } = {}) {
    return oneWrite(scene, async () => {
        const data = typeof data0 === 'function' ? data0() : data0;
        if (!data || !Object.keys(data).length) return null;
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
// (a stroke written whole is merged into the one stored, so a key it no
// longer has would stay: a lock let go, or public taken back, is written
// false, never left out. Luke, 2026-10-25: strokes could be locked but never
// unlocked)
export const strokeOver = (had, st) => {
    if (!had || !st) return st;
    const out = { ...st };
    for (const k of ['locked', 'open']) if (had[k] && !st[k]) out[k] = false;
    return out;
};

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
                    else data[`${PATH}.scraps.${key}.marks.${id}`] = strokeOver(board.scraps[key].marks?.[id], st);
                }
                continue;
            }
            data[`${PATH}.scraps.${key}.${k}`] = v;
        }
    }
    for (const [layer, strokes] of Object.entries(patch?.marks ?? {})) {
        for (const [id, st] of Object.entries(strokes ?? {})) {
            if (st === null) { if (board.marks?.[layer]?.[id]) data[`${PATH}.marks.${layer}.-=${id}`] = null; }
            else data[`${PATH}.marks.${layer}.${id}`] = strokeOver(board.marks?.[layer]?.[id], st);
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
    // (the scene's pieces, pieces.md, Luke 2026-10-26: a new one whole; one
    // there field by field, a null taking a field off, a field holding an
    // object (its settings, its strokes, its places by stage) set as it is,
    // never merged into what was; a null piece taken off)
    for (const [id, p] of Object.entries(patch?.pieces ?? {})) {
        const had = board.pieces?.[id];
        if (p === null) { if (had) data[`${PATH}.pieces.-=${id}`] = null; }
        else if (!had) data[`${PATH}.pieces.${id}`] = p;
        else {
            for (const [k, v] of Object.entries(p)) {
                if (v === null) { if (k in had) data[`${PATH}.pieces.${id}.-=${k}`] = null; }
                else if (v && typeof v === 'object' && had[k] && typeof had[k] === 'object') Object.assign(data, recordUpdate(board, { ops: [{ path: ['pieces', id, k], b: had[k], a: v }] }, 'after', PATH));
                else data[`${PATH}.pieces.${id}.${k}`] = v;
            }
        }
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
// (`patch` a function of the board: made when the write's turn comes, as
// update's)
export async function applyBoardPatch(scene, patch, opts = {}) {
    if (!gmOnly() || !scene) return;
    if (typeof patch === 'function') return update(scene, () => patchData(scene, patch(boardOf(scene))), opts);
    const data = patchData(scene, patch);
    if (Object.keys(data).length) return update(scene, data, opts);
}

// A pin of the board's own: { tex, on, at } in a scrap, or { tex, x, y } loose
// (its id picked when the write's turn comes: two quick pins, two pins)
export async function addPin(scene, data, opts = {}) {
    if (!gmOnly() || !scene || !data?.tex) return null;
    let id = null;
    await update(scene, () => {
        id = customKey('pin', boardOf(scene).pins ?? {});
        return { [`${PATH}.pins.${id}`]: data };
    }, opts);
    return id;
}

// The marker: a stroke on a user's own layer; strokes rubbed out ([[layer,
// id]]); a whole layer (or every one) cleared
export async function addMark(scene, layer, stroke, opts = {}) {
    if (!gmOnly() || !scene || !layer) return null;
    let id = null;
    await update(scene, () => {
        id = customKey('m', boardOf(scene).marks?.[layer] ?? {});
        return { [`${PATH}.marks.${layer}.${id}`]: stroke };
    }, opts);
    return id;
}
export async function removeMarks(scene, list, opts = {}) {
    if (!gmOnly() || !scene) return;
    // (model.js unmarkPatch: the editor's own copy too)
    const patch = unmarkPatch(boardOf(scene), list);
    if (patch) return applyBoardPatch(scene, patch, opts);
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
    let key = null;
    // (its key picked when the write's turn comes)
    await update(scene, () => {
        const scraps = boardOf(scene).scraps ?? {};
        key = data.lib && !scraps[data.lib] ? data.lib : customKey(data.type === 'note' ? 'n' : data.type === 'scrawl' ? 'w' : 'c', keysTaken(boardOf(scene)));
        // (a card may come with a doodle of its owner's: Luke 2026-10-06; a
        // place only, never a note, Luke 2026-10-24)
        const doodle = data.type === 'scrawl' || data.type === 'note' || data.tag || data.marks ? {} : seasonMarks(`${scene.id}:${key}`, { by: data.author ?? game.user.id, type: data.type ?? 'landmark' });
        return { [`${PATH}.scraps.${key}`]: { state: 'known', ...data, ...(Object.keys(doodle).length ? { marks: doodle } : {}), x: Math.round(data.x), y: Math.round(data.y) } };
    });
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
    binFull(patch);
    if (Object.keys(data).length) return update(scene, data, { ...opts, force: true });
}

// the GM told when a full bin let its oldest cards go (Luke, 2026-10-25, the
// map safety fixes): the copy of the board kept before (force) still has them
function binFull(patch) {
    const n = binLetGo(patch);
    if (n) ui.notifications?.warn(game.i18n.format('heart.board.bin-full', { n }));
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
    binFull(patch);
    if (Object.keys(data).length) return update(scene, data, { ...opts, force: opts.force || Object.keys(patch.scraps).length > 0 });
}

// What the model needs to lay a board out here: the look (a scene's style,
// or a style by its id; default the scene viewed), a texture's size, and a
// text measure
let measurer = null;
async function loadHands(look) {
    const fonts = globalThis.document?.fonts;
    if (!fonts) return;
    let used = [];
    try {
        used = Object.values(game.settings.get('heart', 'boardHands') ?? {});
    } catch {
        // (no hands claimed yet)
    }
    const faces = [...new Set([...(look.fonts?.hands ?? []), look.fonts?.display, ...used].filter(Boolean))];
    await Promise.all(faces.map((f) => fonts.load(`40px "${f}"`).catch(() => null)));
}
export async function layoutTools(src = globalThis.canvas?.scene) {
    const { look, textures, ok } = await loadBoardLook(src);
    // (the hands loaded first: a fit made with the fallback face is kept;
    // Luke 2026-10-25)
    await loadHands(look);
    const size = (id) => { const t = textures[id]; return t ? { w: t.w, h: t.h, safe: t.safe, cover: t.cover } : null; };
    const measure = (text, px, font) => {
        // (made when first wanted: a board with nothing to measure needs no page)
        measurer ??= document.createElement('canvas').getContext('2d');
        measurer.font = `${px}px "${font}"`;
        return measurer.measureText(text).width;
    };
    return { look, size, measure, ok, textures };
}

// A name for a string: a pin in it, a name tag (a note), and a thread
// between them, ordinary pieces from then on (model.js labelPatch)
export async function labelString(scene, id, text, opts = {}) {
    if (!gmOnly() || !scene || !text) return;
    const { look, size, measure } = await layoutTools(scene);
    // (a player's own string's name: theirs, `author`; a public one's public)
    const { author = null, open = false, ...o } = opts;
    const patch = labelPatch(boardOf(scene), id, text, look, size, measure, { author, open });
    if (patch) return applyBoardPatch(scene, patch, o);
}

// An older board made whole, once (model.js tidyBoard: name tags made notes,
// every string's ends and joints made pins, loose pins on cards stuck in
// them): the GM's client, when the world loads and when the scene is viewed
export async function tidyBoardScene(scene) {
    if (!game.user.isGM || !isBoardScene(scene)) return;
    const { look, size, measure, ok } = await layoutTools(scene);
    // (never on the default look: without the content module's look the tidy
    // would resize the scene and re-lay pins by the wrong cards; Luke
    // 2026-10-23, the board safety audit)
    if (!ok) return;
    // (tidied when the write's turn comes, on the board as it is then)
    await replaceBoard(scene, (now) => {
        const { board, changed } = tidyBoard(now, sheetLook(look, now), size, measure);
        return changed ? board : null;
    }, { record: false });
    // (the scene the board's sheet's size: the look's, or its own since
    // 2026-10-24)
    await syncBoardScene(scene);
    // (a board on its scene's own background keeps the scene's grid)
    if ((scene.flags?.heart?.boardGrid ?? 0) < BOARD_GRID_EDITION && !isBareBoard(boardOf(scene))) {
        await scene.update({ ...gridOf(look), 'flags.heart.boardGrid': BOARD_GRID_EDITION });
    }
}

// The scene the size of its board's sheet (Luke, 2026-10-24: a map grows
// and shrinks a page at a time), the active GM's: after a resize, and after
// an undo, a redo, an import, or a restore that changes the sheet. Pages come
// or go on its left or top: the tokens, tiles, drawings, notes, lights,
// sounds, templates, and walls move with the board, as they lay on it. The
// sheet last matched is kept on the scene (flags.heart.boardSheetAt).
export async function syncBoardScene(scene) {
    if (!game.user.isGM || !isBoardScene(scene)) return;
    if (game.users.activeGM && game.users.activeGM.id !== game.user.id) return;
    const { look, ok } = await loadBoardLook(scene);
    if (!ok || !look.page) return;
    const raw = boardOf(scene);
    // (a board on its scene's own background: the scene's size is its own)
    if (isBareBoard(raw)) return;
    const S = boardSheet(look, raw);
    const L = sheetLook(look, raw);
    const P = pageOf(look, raw);
    const was = scene.flags?.heart?.boardSheetAt ?? { left: 0, top: 0 };
    const dx = Math.round((S.left - (Number(was.left) || 0)) * P.w);
    const dy = Math.round((S.top - (Number(was.top) || 0)) * P.h);
    const same = scene.width === L.w && scene.height === L.h && !dx && !dy && scene.flags?.heart?.boardSheetAt;
    if (same) return;
    const d0 = scene.dimensions;
    await scene.update({ width: L.w, height: L.h, 'flags.heart.boardSheetAt': { left: S.left, top: S.top } }, { heartBoard: true });
    const d1 = scene.dimensions;
    const mx = Math.round((d1?.sceneX ?? 0) - (d0?.sceneX ?? 0) + dx);
    const my = Math.round((d1?.sceneY ?? 0) - (d0?.sceneY ?? 0) + dy);
    if (mx || my) await shiftPlaceables(scene, mx, my);
}

// Everything Foundry has on a scene moved by (dx, dy) canvas px
async function shiftPlaceables(scene, dx, dy) {
    const at = (d) => ({ _id: d.id, x: d.x + dx, y: d.y + dy });
    for (const [coll, type] of [['tokens', 'Token'], ['tiles', 'Tile'], ['drawings', 'Drawing'], ['notes', 'Note'], ['lights', 'AmbientLight'], ['sounds', 'AmbientSound'], ['templates', 'MeasuredTemplate']]) {
        const list = scene[coll];
        if (list?.size) await scene.updateEmbeddedDocuments(type, list.map(at), { animate: false });
    }
    if (scene.walls?.size) await scene.updateEmbeddedDocuments('Wall', scene.walls.map((w) => ({ _id: w.id, c: [w.c[0] + dx, w.c[1] + dy, w.c[2] + dx, w.c[3] + dy] })));
}

// How far a board's sheet may come in on each side, in whole pages, before
// it would cut through something placed on it (Luke, 2026-10-24: never
// smaller than anything placed): { left, right, top, bottom, cols, rows }
export async function sheetRoom(scene) {
    const { look, size, measure } = await layoutTools(scene);
    const raw = boardOf(scene);
    const S = boardSheet(look, raw);
    if (S.bare) return { bare: true, left: 0, right: 0, top: 0, bottom: 0, cols: 1, rows: 1 };
    const L = sheetLook(look, raw);
    const B = contentBounds(boardView(L, normalizeBoard(raw), 'gm', size, measure), size);
    const P = pageOf(look, raw);
    if (!B) return { left: S.cols - 1, right: S.cols - 1, top: S.rows - 1, bottom: S.rows - 1, cols: S.cols, rows: S.rows, empty: true };
    return {
        left: Math.max(0, Math.floor(B.x0 / P.w)), right: Math.max(0, Math.floor((L.w - B.x1) / P.w)),
        top: Math.max(0, Math.floor(B.y0 / P.h)), bottom: Math.max(0, Math.floor((L.h - B.y1) / P.h)),
        cols: S.cols, rows: S.rows,
    };
}

// A board's sheet grown or cut by pages on each side ({ left, right, top,
// bottom }: more to add, fewer to take away), as one edit Undo takes back;
// never past what is placed on it (model.js resizeSheet). Returns the result
// ({ sheet } or { refused: side }).
export async function resizeBoardSheet(scene, by = {}) {
    if (!gmOnly() || !scene) return null;
    const { look, size, measure, ok } = await layoutTools(scene);
    if (!ok) {
        ui.notifications.warn(game.i18n.localize('heart.board.no-look'));
        return null;
    }
    const raw = boardOf(scene);
    const L = sheetLook(look, raw);
    const bounds = contentBounds(boardView(L, normalizeBoard(raw), 'gm', size, measure), size);
    const r = resizeSheet(look, raw, by, bounds);
    if (!r.sheet) return r;
    const next = resizedBoard(look, raw, by, bounds);
    await replaceBoard(scene, next);
    await syncBoardScene(scene);
    return r;
}

// A board brought up to date before it is put in (an import, an earlier
// board, the backup: Luke, 2026-10-24, an older board's notes fitted as it
// comes in, not at the next load); as it is without the content module's look
// (against the look of the scene it goes into, and its own sheet, never the
// scene viewed: Luke 2026-10-25, the health audit)
export async function tidiedBoard(board, scene) {
    const { look, size, measure, ok } = await layoutTools(scene);
    if (!ok) return board;
    return tidyBoard(board, sheetLook(look, board), size, measure).board;
}

// A new string between two ends (a pin each: one there, or one made where it
// was asked for), returning its id
// (`pin`: its ends' pin, the String window's pick; Luke 2026-10-25)
export async function addString(scene, act, kind, { color = null, state = 'known', pin = null, plainPins = false } = {}, opts = {}) {
    if (!gmOnly() || !scene) return null;
    const { look } = await layoutTools(scene);
    // (its ids picked when the write's turn comes)
    let id = null;
    await applyBoardPatch(scene, (board) => {
        const made = newStringPatch(board, act, kind, look, { color, state, pin, plainPins });
        id = made.id;
        return made.patch;
    }, opts);
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
// (and the parts a board has only once it needs them)
// (its own sheet, once it has one: Luke 2026-10-24; and its pieces and clock
// stages, which every export, replace, and copy was dropping: 2026-10-27)
const ALL_PARTS = [...BOARD_PARTS, 'bin', 'pinsEd', 'notesEd', 'sheet', 'pieces', 'stages'];
// (boardParts lives in boardfile.js, pure and tested there)

// The board as the mock's File tab takes it
export function exportBoard(scene) {
    const b = boardOf(scene);
    return JSON.stringify(boardParts(b), null, 1);
}

// The scene update that makes the board at `prefix` (`from`, as it is now)
// the board `to`, part by part: what changed set, what is gone taken away,
// nothing merged into what was there (Foundry v12 has no key that replaces
// an object whole). One write, never an empty board between two (Luke,
// 2026-10-25, the health audit).
function replacing(from, to, prefix) {
    const whole = (k) => ({ path: [k], ...(from?.[k] === undefined ? {} : { b: from[k] }), ...(to?.[k] === undefined ? {} : { a: to[k] }) });
    return recordUpdate(from ?? {}, { ops: ALL_PARTS.map(whole) }, 'after', prefix);
}

// Replace the whole board (an import, an earlier board, or the backup
// restored): one edit of the GM's, undone like any other.
// (`board` a function of the board: the new one made when the write's turn
// comes, from the board as it is then, null for no write. Luke 2026-10-26:
// the tidy read the board, waited on the look, and wrote its copy back over
// strokes laid in between, the Plenty sketch's all of them)
export function replaceBoard(scene, board, { record = true, backup = false } = {}) {
    // (a copy: the backup restored is the scene's own data, which the update
    // below writes over; Luke, 2026-10-21)
    const given = typeof board === 'function' ? null : foundry.utils.deepClone(boardParts(board));
    return oneWrite(scene, async () => {
        const made = typeof board === 'function' ? board(boardOf(scene)) : null;
        if (typeof board === 'function' && !made) return scene;
        const clean = given ?? foundry.utils.deepClone(boardParts(made));
        const before = foundry.utils.deepClone(boardOf(scene));
        await keepBackup(scene, before, { force: true, why: 'replaced' });
        // (the backup too, written over whole: never merged with the one before it)
        const data = { ...replacing(before, clean, PATH), ...(backup ? replacing(scene.flags?.heart?.boardBackup, boardParts(before), BACKUP_PATH) : {}) };
        const out = Object.keys(data).length ? await scene.update(data, { heartBoard: true }) : scene;
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
    // (an older board's notes fitted as it comes in: Luke 2026-10-24)
    await replaceBoard(scene, await tidiedBoard(read.board, scene), { backup: true });
    ui.notifications.info(game.i18n.format('heart.board.imported', { scraps: read.scraps, links: read.links }));
    return true;
}

// The board saved as a .json file, named from the scene and the day (Luke,
// 2026-10-21: File, Download the board); Import loads it back
export function downloadBoard(scene) {
    if (!gmOnly() || !scene) return;
    saveDataToFile(exportBoard(scene), 'application/json', boardFileName(scene.name, new Date(), game.i18n.localize('heart.board.snapshot-file')));
    // (when, for the reminder: this computer's)
    try {
        localStorage.setItem(DOWNLOADED, JSON.stringify({ ...downloads(), [scene.id]: Date.now() }));
    } catch {
        // (a private window: no reminder kept)
    }
}

// The map safety fixes (Luke, 2026-10-25). When this computer last
// downloaded each board ({ sceneId: time }), and the GM reminded, at the
// session's first view of a board with cards on it, when that was over
// DOWNLOAD_DAYS ago or never
const DOWNLOADED = 'heartBoard.downloaded';
const downloads = () => {
    try {
        return JSON.parse(localStorage.getItem(DOWNLOADED) ?? '{}') ?? {};
    } catch {
        return {};
    }
};
export function remindDownload(scene) {
    if (!gmOnly() || !scene || !Object.keys(boardOf(scene).scraps ?? {}).length) return;
    const last = downloads()[scene.id];
    if (!downloadDue(last)) return;
    const days = Math.floor((Date.now() - Number(last)) / 864e5);
    ui.notifications.info(game.i18n.format(last ? 'heart.board.download-remind' : 'heart.board.download-never', { scene: scene.name, days }));
}

// A dated copy of a board in the world's own folder (worlds/<world>/
// heart-boards/), one a day for each board, kept outside any browser: the
// board's file as Download writes it, so Import loads it back. True once
// written.
export async function keepWorldCopy(scene) {
    if (!gmOnly() || !scene || !isBoardScene(scene)) return false;
    const dir = `worlds/${game.world.id}/heart-boards`;
    try {
        await FilePicker.createDirectory('data', dir);
    } catch {
        // (there already)
    }
    const file = new File([exportBoard(scene)], worldCopyName(scene.name, scene.id), { type: 'application/json' });
    return Boolean(await FilePicker.upload('data', dir, file, {}, { notify: false }));
}

export const hasBackup = (scene) => Boolean(scene?.flags?.heart?.boardBackup);

// Swap the board and its backup (so a restore can itself be undone)
export async function restoreBackup(scene) {
    if (!gmOnly() || !scene || !hasBackup(scene)) return;
    return replaceBoard(scene, await tidiedBoard(foundry.utils.deepClone(scene.flags.heart.boardBackup), scene), { backup: true });
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
// style: its board style (look.js boardStyles; Luke 2026-10-25)
export async function createBoardScene({ name, owners = null, style = DEFAULT_STYLE } = {}) {
    if (!gmOnly()) return null;
    const { look, ok } = await loadBoardLook(style);
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
        flags: { heart: { [BOARD_FLAG]: { scraps: {}, links: {}, pins: {}, marks: {}, decor: [] }, boardStyle: style, boardGrid: BOARD_GRID_EDITION, ...(owners ? { boardOwners: owners } : {}) } },
        ...(owners ? { ownership: owners === 'all' ? { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } : Object.fromEntries(owners.map((id) => [id, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER])) } : {}),
    });
    await scene?.view();
    return scene;
}

// Turn an existing scene into a scrapboard scene (or back), sized to the look
// (Luke, 2026-10-25) in a style; `bare`: on the scene's own background, its
// size and grid kept (any scene a board); cols, rows, pw, ph: its sheet's
// pages (model.js reshapeSheet)
export async function setBoardScene(scene, on = true, { style = null, bare = false, cols, rows, pw, ph } = {}) {
    if (!gmOnly() || !scene) return;
    // (and what went with it, its owners, backup, sheet, grid, and style, so
    // made a board again it starts clean: Luke 2026-10-25, the health audit)
    if (!on) return scene.update(Object.fromEntries(['board', 'boardOwners', 'boardBackup', 'boardSheetAt', 'boardGrid', 'boardStyle'].map((k) => [`flags.heart.-=${k}`, null])));
    const st = style ?? styleOf(scene);
    const { look: base } = await loadBoardLook(st);
    const had = isBoardScene(scene) ? boardOf(scene) : { scraps: {}, links: {}, decor: [] };
    if (bare) return scene.update({ 'flags.heart.boardStyle': st, 'flags.heart.-=boardSheetAt': null, [PATH]: { ...had, sheet: bareSheet(scene.width, scene.height) } });
    const sized = [cols, rows, pw, ph].some((v) => v !== undefined && v !== null && v !== '');
    // (a board's own sheet, when it has one: Luke 2026-10-24)
    const sheet = sized ? reshapeSheet(base, null, { cols, rows, pw, ph }).sheet : null;
    const board = sheet ? { ...had, sheet } : had;
    const look = sheetLook(base, board);
    return scene.update({ width: look.w, height: look.h, ...gridOf(look), 'flags.heart.boardStyle': st, 'flags.heart.boardGrid': BOARD_GRID_EDITION, [PATH]: board });
}

// A scene's board as its settings' Board tab leaves it (Luke, 2026-10-25):
// { board, style, bare, cols, rows, pw, ph }. Made a board, or no longer one
// (the tab asks first); its style; on its scene's own background, or a
// sheet of cols x rows pages of pw x ph (0: the style's page). One edit Undo
// takes back; never smaller than what is placed on it. Returns { done },
// or { refused: side, w, h } (the size it would need).
// A board's baked map (Luke, 2026-10-25: the Village of Plenty; any board on
// a baked map): its manifest named, the scene made the map's size at `ppu`
// px per the map's unit (Foundry's smallest grid, 50, at least), its grid
// one unit, token vision and fog exploration off; the switches already made
// for that manifest kept. None wanted: the flags let go.
async function setBaked(scene, want) {
    const had = scene.flags?.heart?.baked ?? null;
    if (!want.baked) return had ? scene.update({ 'flags.heart.-=baked': null }) : null;
    const m = await manifestAt(want.baked);
    if (!m) {
        ui.notifications.warn(game.i18n.format('heart.board.baked-missing', { path: want.baked }));
        return null;
    }
    // (its square: 5 ft by default, the tabletop standard, measured in feet
    // or in metres (Luke, 2026-10-26); a square of 50 px, Foundry's smallest
    // grid. An older call's `ppu`: that many px a metre, a square a metre)
    const sq = SQUARES[want.square] ?? (want.ppu ? null : SQUARES['5ft']);
    const grid = sq ? { size: 50, distance: sq.distance, units: sq.units } : { size: Math.max(50, Math.min(1000, Math.round(Number(want.ppu) || 50))), distance: 1, units: 'm' };
    // (scene px a unit of the map's: metres a unit over metres a square, in squares of px)
    const ppu = (grid.size / (grid.distance * metresPer(grid.units))) * metresPer(m.unit);
    const keep = had?.manifest === want.baked ? had : {};
    const w = Math.round(m.size.w * ppu);
    const h = Math.round(m.size.h * ppu);
    return scene.update({
        width: w,
        height: h,
        // (the bare board the scene's new size in the same write: the
        // scene-size hook caught up only later)
        [`${PATH}.sheet`]: bareSheet(w, h),
        'grid.size': grid.size,
        'grid.distance': grid.distance,
        'grid.units': grid.units,
        tokenVision: false,
        'fog.exploration': false,
        'flags.heart.baked': { manifest: want.baked, fog: Number(keep.fog) || 0, ...(keep.dark === undefined ? {} : { dark: keep.dark }), ...(keep.lit === undefined ? {} : { lit: keep.lit }), overlays: keep.overlays ?? {}, roofs: keep.roofs ?? {} },
    });
}

export async function configureBoard(scene, want = {}) {
    if (!gmOnly() || !scene) return null;
    const style = String(want.style || styleOf(scene));
    if (!want.board) {
        if (!isBoardScene(scene)) return null;
        await setBoardScene(scene, false);
        await setBaked(scene, {});
        return { done: true };
    }
    if (!isBoardScene(scene)) {
        await setBoardScene(scene, true, { style, bare: Boolean(want.bare), cols: want.cols, rows: want.rows, pw: want.pw, ph: want.ph });
        if (want.bare) await setBaked(scene, want);
        return { done: true };
    }
    if (style !== styleOf(scene)) await scene.update({ 'flags.heart.boardStyle': style });
    const { look, size, measure, ok } = await layoutTools(style);
    if (!ok) {
        ui.notifications.warn(game.i18n.localize('heart.board.no-look'));
        return null;
    }
    const raw = boardOf(scene);
    const wasBare = isBareBoard(raw);
    if (want.bare) {
        if (!wasBare) {
            await scene.update({ 'flags.heart.-=boardSheetAt': null });
            await replaceBoard(scene, (now) => ({ ...now, sheet: bareSheet(scene.width, scene.height) }));
        }
        // (and its baked map, or none: the scene's own background)
        await setBaked(scene, want);
        return { done: true };
    }
    // (on its own sheet: no baked map)
    await setBaked(scene, {});
    const bounds = contentBounds(boardView(sheetLook(look, raw), normalizeBoard(raw), 'gm', size, measure), size);
    const r = reshapeSheet(look, raw, want, bounds);
    if (!r.sheet) return r;
    if (!wasBare && JSON.stringify(r.sheet) === JSON.stringify(boardSheet(look, raw))) return { done: true };
    await replaceBoard(scene, (now) => ({ ...now, sheet: r.sheet }));
    // (off the scene's own background: the board's grid)
    if (wasBare) await scene.update({ ...gridOf(look), 'flags.heart.boardGrid': BOARD_GRID_EDITION });
    await syncBoardScene(scene);
    return { done: true };
}

// A board on its scene's own background follows the scene's size (the
// scene's Grid tab; the active GM's)
export async function followSceneSize(scene) {
    if (!game.user.isGM || !isBoardScene(scene)) return;
    if (game.users.activeGM && game.users.activeGM.id !== game.user.id) return;
    const S = boardOf(scene).sheet;
    if (!isBareBoard(boardOf(scene)) || (S.w === scene.width && S.h === scene.height)) return;
    return scene.update({ [`${PATH}.sheet`]: bareSheet(scene.width, scene.height) }, { heartBoard: true });
}
