// A board as a file (Luke, 2026-10-21: the board is built over a campaign and
// never reset, so it can be downloaded and loaded back): its file's name, and
// a board read back from text (a downloaded file, or one pasted from the
// editor), checked by the model. Also the cards a renamed place's actor
// renames. 2026-10-27: boardParts and boardFromText are derived from model.js
// BOARD_PARTS, not written out by hand. Pure: no Foundry globals (Foundry only, never inlined into the
// editor), tested in test/scrapboard-file.test.mjs.
import { normalizeBoard, BOARD_PARTS, PART_NAMES, boardPartsOf, unknownParts } from './model.js';

// "Heart Map 2026-10-21.json": the scene's name (made safe for a file) and
// the day, in the user's own time
export function boardFileName(sceneName, date = new Date(), fallback = 'Heart Map') {
    const safe = String(sceneName ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
    const pad = (n) => String(n).padStart(2, '0');
    return `${safe} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// The map safety fixes (Luke, 2026-10-25): the GM reminded to download a
// board not downloaded on their computer for DOWNLOAD_DAYS (or ever), and a
// dated copy of each board kept in the world's own folder, one a day, named
// for the scene and its id so two boards of one name never share a file
export const DOWNLOAD_DAYS = 7;
export const downloadDue = (last, now = Date.now(), days = DOWNLOAD_DAYS) => !(Number(last) > 0) || now - Number(last) > days * 864e5;
export function worldCopyName(sceneName, sceneId, date = new Date()) {
    return boardFileName(sceneName, date).replace(/\.json$/, ` ${String(sceneId ?? '').replace(/[^\w-]/g, '')}.json`);
}

// How each part of a board is read back from a file: (raw, checked) => the
// value to keep, or undefined to leave the part out. `raw` is the file's board
// as written; `checked` is it through the model (normalizeBoard). One loader
// per part of model.js BOARD_PARTS: the check below stops the module loading
// when a part has none (or a loader has no part), so a part added to the
// description and forgotten here fails at once, not by dropping data
// (2026-10-27, the ecosystem audit).
const keepIds = (part) => (raw, checked) => Object.fromEntries(Object.keys(checked[part]).map((k) => [k, raw[part][k]]));
const editionOf = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
const LOADERS = {
    scraps: keepIds('scraps'),
    links: keepIds('links'),
    pins: keepIds('pins'),
    marks: (raw, checked) => Object.fromEntries(Object.entries(checked.marks).map(([layer, strokes]) => [layer, Object.fromEntries(Object.keys(strokes).map((id) => [id, raw.marks[layer][id]]))])),
    bits: keepIds('bits'),
    decor: (raw) => (Array.isArray(raw.decor) ? raw.decor : []),
    // its bin: the entries that hold a card
    bin: (raw) => (raw.bin && typeof raw.bin === 'object' && !Array.isArray(raw.bin) ? Object.fromEntries(Object.entries(raw.bin).filter(([, e]) => e?.scrap && typeof e.scrap === 'object')) : undefined),
    // the pins' tidy mark, and its notes' layout edition (Luke, 2026-10-24)
    pinsEd: (raw) => editionOf(raw.pinsEd),
    notesEd: (raw) => editionOf(raw.notesEd),
    // its own sheet, its size in pages (Luke, 2026-10-24)
    sheet: (raw, checked) => checked.sheet || undefined,
    // its pieces and clock stages, as the model reads them; an older file
    // without them loads as before (2026-10-27)
    pieces: (raw, checked) => (Object.keys(checked.pieces).length ? Object.fromEntries(Object.keys(checked.pieces).map((k) => [k, raw.pieces[k]])) : undefined),
    stages: (raw, checked) => (checked.stages.length ? raw.stages.filter((s) => checked.stages.some((c) => c.id === (typeof s === 'string' ? s : s?.id))) : undefined),
};
for (const p of BOARD_PARTS) if (typeof LOADERS[p.name] !== 'function') throw new Error(`boardfile.js: the board part "${p.name}" has no loader`);
for (const k of Object.keys(LOADERS)) if (!PART_NAMES.includes(k)) throw new Error(`boardfile.js: a loader for "${k}", which is not a board part`);

// The board in a text (a board, or the editor's whole-file { look, board }),
// as written, minus what the model can't place: { board, scraps, links,
// unknown } or null when it isn't a board. Its loose pieces, its bin, and its
// pins' tidy mark come with it (a downloaded board loads back whole).
// `unknown`: the file's keys the description doesn't name; they are left out
// of `board` (they would not reach the scene) and named here, never dropped
// silently.
export function boardFromText(text) {
    let j;
    try {
        j = JSON.parse(String(text ?? ''));
    } catch {
        return null;
    }
    const raw = j?.board && !j.scraps ? j.board : j;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (!raw.scraps && !raw.links)) return null;
    const checked = normalizeBoard(raw);
    const board = {};
    for (const p of BOARD_PARTS) {
        const v = LOADERS[p.name](raw, checked);
        if (v !== undefined) board[p.name] = v;
    }
    return { board, scraps: Object.keys(board.scraps).length, links: Object.keys(board.links).length, unknown: unknownParts(raw) };
}

// What a board is, whole, as it is written out or copied (a download, a
// replace, the world's daily copy, Map Dreamer's snapshot): every part of
// model.js BOARD_PARTS (the always-there ones, and the others once the board
// needs them), plus any key the description doesn't name, carried through as
// it is. Derived from the description; see model.js.
export function boardParts(b) {
    return boardPartsOf(b);
}

// The cards of a place of the GM's own (its actor's uuid) whose stored name
// isn't its actor's name now: { key: { name } } (Luke, 2026-10-21: a card
// follows its actor's renames), empty when none
export function renamedCards(raw, uuid, name) {
    const out = {};
    if (!uuid || !name) return out;
    for (const [k, s] of Object.entries(raw?.scraps ?? {})) if (s?.uuid === uuid && s.name !== name) out[k] = { name };
    return out;
}

// The same place's cards in the bin whose stored name isn't its actor's now:
// their bin keys (Luke, 2026-10-21: one put back came back under its old name)
export function renamedBinned(raw, uuid, name) {
    if (!uuid || !name) return [];
    return Object.entries(raw?.bin ?? {}).filter(([, e]) => e?.scrap?.uuid === uuid && e.scrap.name !== name).map(([k]) => k);
}
