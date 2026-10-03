// The scrapboard map's document half (2026-10-02, monorepo
// docs/plans/heart-map.md): which scenes are scrapboard scenes, and the GM's
// edits to a scene's board (flags.heart.board: the same JSON the Heart Map
// Board mock edits, so a board round-trips between the two). Every write here
// is the GM's: players' writes come through the relay (notes.js), which runs
// these on the GM's client. A players' board (flags.heart.boardOwners: 'all'
// or user ids) is one its owners edit freely. Import replaces the board wholesale and keeps
// the one before it (flags.heart.boardBackup). Undo is the GM client's own
// stack of the scene's boards before each edit.
import { normalizeBoard, customKey, removalOf, labelPatch, tidyBoard, newStringPatch } from './model.js';
import { loadBoardLook } from './look.js';

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

const history = new Map();
function remember(scene) {
    const stack = history.get(scene.id) ?? [];
    stack.push(foundry.utils.deepClone(boardOf(scene)));
    if (stack.length > 50) stack.shift();
    history.set(scene.id, stack);
}
export const canUndo = (scene) => Boolean(history.get(scene?.id)?.length);

export async function undo(scene) {
    if (!gmOnly() || !scene) return;
    const prev = history.get(scene.id)?.pop();
    if (!prev) return ui.notifications.info(game.i18n.localize('heart.board.nothing-to-undo'));
    return replaceBoard(scene, prev, { remember: false });
}

const update = (scene, data) => {
    remember(scene);
    return scene.update(data, { heartBoard: true });
};

/* -------------------------------------------- */
/*  Edits                                       */
/* -------------------------------------------- */

export async function setScrap(scene, key, patch) {
    if (!gmOnly() || !scene || !key) return;
    return update(scene, { [`${PATH}.scraps.${key}`]: patch });
}

// Several scraps at once ({ key: patch }: a selection moved or resized)
export async function setScraps(scene, patches) {
    if (!gmOnly() || !scene) return;
    const data = {};
    for (const [key, patch] of Object.entries(patches ?? {})) {
        if (!boardOf(scene).scraps?.[key]) continue;
        for (const [k, v] of Object.entries(patch)) data[`${PATH}.scraps.${key}.${k}`] = v;
    }
    if (Object.keys(data).length) return update(scene, data);
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
    for (const [id, p] of Object.entries(patch?.pins ?? {})) {
        if (p === null) { if (board.pins?.[id]) data[`${PATH}.pins.-=${id}`] = null; }
        else if (board.pins?.[id]) for (const [k, v] of Object.entries(p)) data[`${PATH}.pins.${id}.${k}`] = v;
        else data[`${PATH}.pins.${id}`] = p;
    }
    return data;
}
export async function applyBoardPatch(scene, patch) {
    if (!gmOnly() || !scene) return;
    const data = patchData(scene, patch);
    if (Object.keys(data).length) return update(scene, data);
}

// A pin of the board's own: { tex, on, at } in a scrap, or { tex, x, y } loose
export async function addPin(scene, data) {
    if (!gmOnly() || !scene || !data?.tex) return null;
    const id = customKey('pin', boardOf(scene).pins ?? {});
    await update(scene, { [`${PATH}.pins.${id}`]: data });
    return id;
}

// The marker: a stroke on a user's own layer; strokes rubbed out ([[layer,
// id]]); a whole layer (or every one) cleared
export async function addMark(scene, layer, stroke) {
    if (!gmOnly() || !scene || !layer) return null;
    const id = customKey('m', boardOf(scene).marks?.[layer] ?? {});
    await update(scene, { [`${PATH}.marks.${layer}.${id}`]: stroke });
    return id;
}
export async function removeMarks(scene, list) {
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
    if (Object.keys(data).length) return update(scene, data);
}
export async function clearMarks(scene, layer = null) {
    if (!gmOnly() || !scene) return;
    if (layer) return update(scene, { [`${PATH}.marks.-=${layer}`]: null });
    return update(scene, { [`${PATH}.-=marks`]: null });
}

// a scrap's field removed (an override back to its default)
export async function unsetScrap(scene, key, field) {
    if (!gmOnly() || !scene || !key) return;
    return update(scene, { [`${PATH}.scraps.${key}.-=${field}`]: null });
}

export async function setLink(scene, id, patch) {
    if (!gmOnly() || !scene || !id) return;
    return update(scene, { [`${PATH}.links.${id}`]: patch });
}

export async function unsetLink(scene, id, fields) {
    if (!gmOnly() || !scene || !id) return;
    const data = {};
    for (const f of [].concat(fields)) data[`${PATH}.links.${id}.-=${f}`] = null;
    return update(scene, data);
}

// A new scrap: a book landmark (lib: its library key), a landmark of the
// GM's own (uuid, name), a note (text), or pencil writing (scrawl: text)
export async function addScrap(scene, data) {
    if (!gmOnly() || !scene) return null;
    const scraps = boardOf(scene).scraps ?? {};
    const key = data.lib && !scraps[data.lib] ? data.lib : customKey(data.type === 'note' ? 'n' : data.type === 'scrawl' ? 'w' : 'c', scraps);
    await update(scene, { [`${PATH}.scraps.${key}`]: { state: 'known', ...data, x: Math.round(data.x), y: Math.round(data.y) } });
    return key;
}

// (each end a scrap's key, or a loose point on the board: aPt, bPt)
// (each end a scrap's key, a loose point, or a pin of the board's own: aPin, bPin)
export async function addLink(scene, { a = null, b = null, aPt = null, bPt = null, aAt = null, bAt = null, aPin = null, bPin = null, kind = 'delve', label = '', state = 'known' }) {
    if (!gmOnly() || !scene || !(a || aPt || aPin) || !(b || bPt || bPin) || (a && a === b)) return null;
    const id = customKey('l', boardOf(scene).links ?? {});
    const data = { kind, state };
    if (aPin) data.aPin = aPin; else if (a) data.a = a; else data.aPt = { x: Math.round(aPt.x), y: Math.round(aPt.y) };
    if (bPin) data.bPin = bPin; else if (b) data.b = b; else data.bPt = { x: Math.round(bPt.x), y: Math.round(bPt.y) };
    // (a tied end where it was put on its scrap)
    if (a && aAt) data.aAt = aAt;
    if (b && bAt) data.bAt = bAt;
    if (label) data.label = label;
    await update(scene, { [`${PATH}.links.${id}`]: data });
    return id;
}

// Take a scrap off the board, with every string tied to it
export async function removeScrap(scene, key) {
    return removeMany(scene, { scraps: [key] });
}

// Things taken off the board at once, with what depends on them (model.js
// removalOf): cards (their pins, and every string tied to them), the board's
// pins (every string they hold; joints they hold let go), and strings
export async function removeMany(scene, what = {}) {
    if (!gmOnly() || !scene) return;
    const r = removalOf(boardOf(scene), what);
    const data = {};
    for (const k of r.scraps) data[`${PATH}.scraps.-=${k}`] = null;
    for (const id of r.links) data[`${PATH}.links.-=${id}`] = null;
    for (const id of r.pins) data[`${PATH}.pins.-=${id}`] = null;
    for (const [id, p] of Object.entries(r.edits)) for (const [k, v] of Object.entries(p)) data[`${PATH}.links.${id}.${k}`] = v;
    if (Object.keys(data).length) return update(scene, data);
}

// What the model needs to lay a board out here: the look, a texture's size,
// and a text measure
let measurer = null;
async function layoutTools() {
    const { look, textures } = await loadBoardLook();
    const size = (id) => { const t = textures[id]; return t ? { w: t.w, h: t.h, safe: t.safe, cover: t.cover } : null; };
    measurer ??= document.createElement('canvas').getContext('2d');
    const measure = (text, px, font) => {
        measurer.font = `${px}px "${font}"`;
        return measurer.measureText(text).width;
    };
    return { look, size, measure };
}

// A name for a string: a pin in it, a name tag (a note), and a thread
// between them, ordinary pieces from then on (model.js labelPatch)
export async function labelString(scene, id, text) {
    if (!gmOnly() || !scene || !text) return;
    const { look, size, measure } = await layoutTools();
    const patch = labelPatch(boardOf(scene), id, text, look, size, measure);
    if (patch) return applyBoardPatch(scene, patch);
}

// An older board made whole, once (model.js tidyBoard: name tags made notes,
// every string's ends and joints made pins, loose pins on cards stuck in
// them): the GM's client, when the world loads and when the scene is viewed
export async function tidyBoardScene(scene) {
    if (!game.user.isGM || !isBoardScene(scene)) return;
    const { look, size, measure } = await layoutTools();
    const { board, changed } = tidyBoard(boardOf(scene), look, size, measure);
    if (changed) await replaceBoard(scene, board, { remember: false });
    // (once: an older board scene's tokens brought down to the board's size)
    if ((scene.flags?.heart?.boardGrid ?? 0) < BOARD_GRID_EDITION) {
        await scene.update({ 'grid.size': BOARD_GRID, 'flags.heart.boardGrid': BOARD_GRID_EDITION });
    }
}

// A new string between two ends (a pin each: one there, or one made where it
// was asked for), returning its id
export async function addString(scene, act, kind, { color = null } = {}) {
    if (!gmOnly() || !scene) return null;
    const { look } = await layoutTools();
    const { id, patch } = newStringPatch(boardOf(scene), act, kind, look, { color });
    await applyBoardPatch(scene, patch);
    return id;
}

export async function removeLink(scene, id) {
    if (!gmOnly() || !scene || !boardOf(scene).links?.[id]) return;
    return update(scene, { [`${PATH}.links.-=${id}`]: null });
}

/* -------------------------------------------- */
/*  Import, export, backup                      */
/* -------------------------------------------- */

// The board as the mock's File tab takes it
export function exportBoard(scene) {
    const b = boardOf(scene);
    return JSON.stringify({ scraps: b.scraps ?? {}, links: b.links ?? {}, pins: b.pins ?? {}, marks: b.marks ?? {}, decor: b.decor ?? [] }, null, 1);
}

// Replace the whole board (an import, an undo, or the backup restored)
async function replaceBoard(scene, board, { remember: keep = true, backup = false } = {}) {
    const clean = { scraps: board.scraps ?? {}, links: board.links ?? {}, pins: board.pins ?? {}, marks: board.marks ?? {}, decor: board.decor ?? [] };
    if (keep) remember(scene);
    // (a nested object update merges; the board is cleared first so it is replaced)
    const data = { [`${PATH}.-=scraps`]: null, [`${PATH}.-=links`]: null, [`${PATH}.-=pins`]: null, [`${PATH}.-=marks`]: null, [`${PATH}.-=decor`]: null };
    if (backup) data[BACKUP_PATH] = foundry.utils.deepClone(boardOf(scene));
    await scene.update(data, { heartBoard: true });
    return scene.update({ [PATH]: clean }, { heartBoard: true });
}

// A board pasted from the mock (or another scene's export). Checked by the
// model first: anything it can't place is dropped.
export async function importBoard(scene, text) {
    if (!gmOnly() || !scene) return false;
    let j;
    try {
        j = JSON.parse(text);
    } catch {
        ui.notifications.error(game.i18n.localize('heart.board.import-bad'));
        return false;
    }
    // (the mock's whole-file export holds { look, board })
    const raw = j?.board && !j.scraps ? j.board : j;
    if (!raw || typeof raw !== 'object' || (!raw.scraps && !raw.links)) {
        ui.notifications.error(game.i18n.localize('heart.board.import-bad'));
        return false;
    }
    const checked = normalizeBoard(raw);
    // keep the JSON as written (the model fills defaults when it reads it),
    // minus what it dropped
    const scraps = Object.fromEntries(Object.keys(checked.scraps).map((k) => [k, raw.scraps[k]]));
    const links = Object.fromEntries(Object.keys(checked.links).map((k) => [k, raw.links[k]]));
    const pins = Object.fromEntries(Object.keys(checked.pins).map((k) => [k, raw.pins[k]]));
    const marks = Object.fromEntries(Object.entries(checked.marks).map(([layer, strokes]) => [layer, Object.fromEntries(Object.keys(strokes).map((id) => [id, raw.marks[layer][id]]))]));
    await replaceBoard(scene, { scraps, links, pins, marks, decor: Array.isArray(raw.decor) ? raw.decor : [] }, { backup: true });
    ui.notifications.info(game.i18n.format('heart.board.imported', { scraps: Object.keys(scraps).length, links: Object.keys(links).length }));
    return true;
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
// would muddy the board; 0.2x of that to start.) The edition makes an older
// board scene's grid this size once, on the GM's client.
export const BOARD_GRID = 30;
const BOARD_GRID_EDITION = 1;

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
        grid: { type: CONST.GRID_TYPES.GRIDLESS, size: BOARD_GRID },
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
    return scene.update({ width: look.w, height: look.h, 'grid.size': BOARD_GRID, 'flags.heart.boardGrid': BOARD_GRID_EDITION, [PATH]: isBoardScene(scene) ? boardOf(scene) : { scraps: {}, links: {}, decor: [] } });
}
