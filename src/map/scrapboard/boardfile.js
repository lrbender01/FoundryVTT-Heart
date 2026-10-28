// A board as a file (Luke, 2026-10-21: the board is built over a campaign and
// never reset, so it can be downloaded and loaded back): its file's name, and
// a board read back from text (a downloaded file, or one pasted from the
// editor), checked by the model. Also the cards a renamed place's actor
// renames. 2026-10-27: boardParts and boardFromText are derived from model.js
// BOARD_PARTS, not written out by hand. Pure: no Foundry globals (Foundry only, never inlined into the
// editor), tested in test/scrapboard-file.test.mjs.
import { normalizeBoard, BOARD_PARTS, PART_NAMES, boardPartsOf, unknownParts, safePath } from './model.js';

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

// The table layer (Luke, 2026-10-27, 19:13 PDT: "When I'm running a session and
// I move something, I want it to be saved in Foundry and picked up"): where the
// GM's hand moves at the table come out of Foundry, one file for each scene and
// day, beside the daily copy above. Its name is the daily copy's, ending
// ".table.json". The toolkit builds the edges (it reads its own flags; the fork
// never does); the fork gives the name and the document, so the bytes are
// steady from one write to the next. Read later by Map Dreamer and the
// resolver; contract: docs/board-editor/contract.md, Changes.
export const TABLE_FORMAT = 'heart-table-layer';
export const TABLE_VERSION = 1;
export function tableLayerName(sceneName, sceneId, date = new Date()) {
    return worldCopyName(sceneName, sceneId, date).replace(/\.json$/, '.table.json');
}

// One edge cleaned to the "at" edge the Dream's graph names (schema/graph.json),
// on the table layer; null when it is not one (no id, no person, no point, no stage)
const metre = (n) => Math.round(Number(n) * 100) / 100;
function cleanTableEdge(e) {
    if (!e || typeof e !== 'object' || e.type !== 'at' || (e.layer !== undefined && e.layer !== 'table')) return null;
    const id = typeof e.id === 'string' ? e.id.trim() : '';
    const from = typeof e.from === 'string' ? e.from.trim() : '';
    const when = typeof e.when === 'string' ? e.when.trim() : '';
    const to = Array.isArray(e.to) && e.to.length === 2 ? e.to.map(Number) : null;
    if (!id || !from || !when || !to || !to.every(Number.isFinite)) return null;
    const prov = e.prov && typeof e.prov === 'object' && !Array.isArray(e.prov) ? e.prov : {};
    return {
        id,
        type: 'at',
        from,
        to: [metre(to[0]), metre(to[1])],
        when,
        layer: 'table',
        ...(e.hidden === true ? { hidden: true } : {}),
        ...(e.flip === true ? { flip: true } : {}),
        prov: { by: String(prov.by ?? ''), at: String(prov.at ?? ''), origin: 'table', provisional: false },
    };
}

// The table layer's document: { format, version, world, scene: { id, name }, board, day, written,
// edges }, with the edges cleaned and sorted by id (a later edge of an id wins)
export function tableLayerDoc({ world, scene, board, day, written, edges = [] } = {}) {
    const byId = new Map();
    for (const e of Array.isArray(edges) ? edges : []) {
        const c = cleanTableEdge(e);
        if (c) byId.set(c.id, c);
    }
    return {
        format: TABLE_FORMAT,
        version: TABLE_VERSION,
        world: String(world ?? ''),
        scene: { id: String(scene?.id ?? ''), name: String(scene?.name ?? '') },
        board: String(board ?? ''),
        day: String(day ?? ''),
        written: String(written ?? ''),
        edges: [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    };
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

// ---------------------------------------------------------------- Map Dreamer's map, published for Foundry
// (2026-10-28, Luke: "what's drawn in the MapDreamer is actually what's drawn in
// Foundry"). Map Dreamer's map file is the one source of truth. Its server
// writes the map's board, in this Download format, beside a small meta file into
// the content module (assets/boards/<map id>/board.json and board.meta.json),
// which Foundry serves like any other module file; a Foundry scene brings it in
// in one step (editor-link.js) and compares the meta's rev with the rev it
// brought in, to say when it is behind. The shapes and the pure rules are here
// (tested in test/scrapboard-file.test.mjs); the files, the dialog, and the
// import are the two hosts'. Contract: docs/board-editor/contract.md, Changes.
export const PUBLISH_FORMAT = 'heart-board-published';
export const PUBLISH_VERSION = 1;
// where Foundry reads the published files (the content module's assets)
export const PUBLISHED_ROOT = 'modules/fvtt-heart-content/assets/boards';
export const MAP_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const publishedUrls = (map) => ({ board: `${PUBLISHED_ROOT}/${map}/board.json`, meta: `${PUBLISHED_ROOT}/${map}/board.meta.json` });

// What the meta file says about a published board: which map, the map's rev
// (an integer that only grows), when, how many bytes board.json is (so a half
// read file is told from a whole one), how many pieces, and the baked map it
// sits on ({ id, rev } of its manifest at the time). Pure.
export function publishedMeta({ map, name = '', rev, at, bytes, pieces = 0, baked = null }) {
    return { format: PUBLISH_FORMAT, version: PUBLISH_VERSION, map, name: String(name ?? ''), rev: Math.round(Number(rev) || 0), at, bytes: Math.round(Number(bytes) || 0), pieces: Math.round(Number(pieces) || 0), baked: baked && baked.id ? { id: String(baked.id), rev: String(baked.rev ?? '') } : null };
}

// A meta file read back, or null when it is not one (wrong format, no map, no rev)
export function cleanPublished(j) {
    if (!j || typeof j !== 'object' || j.format !== PUBLISH_FORMAT || Number(j.version) !== PUBLISH_VERSION) return null;
    if (!MAP_ID.test(String(j.map ?? '')) || !Number.isFinite(Number(j.rev)) || Number(j.rev) < 0) return null;
    return {
        map: j.map,
        name: String(j.name ?? '').slice(0, 120),
        rev: Math.round(Number(j.rev)),
        at: typeof j.at === 'string' ? j.at.slice(0, 40) : '',
        bytes: Math.max(0, Math.round(Number(j.bytes) || 0)),
        pieces: Math.max(0, Math.round(Number(j.pieces) || 0)),
        baked: j.baked && typeof j.baked === 'object' && j.baked.id ? { id: String(j.baked.id).slice(0, 60), rev: String(j.baked.rev ?? '').slice(0, 64) } : null,
    };
}

// What a scene keeps of the last bring-in (flags.heart.editorLink): the map, the
// rev brought in, when it was published and when it was brought in. null when
// there is none or it is not one.
export function cleanLink(l) {
    if (!l || typeof l !== 'object' || !MAP_ID.test(String(l.map ?? '')) || !Number.isFinite(Number(l.rev))) return null;
    // (`auto`: the GM asked this scene to take each new revision by itself, with no question;
    // `ids`: what the last bring-in put on the board, kept only when the link has them)
    const ids = cleanLinkIds(l.ids);
    return { map: l.map, rev: Math.round(Number(l.rev)), at: typeof l.at === 'string' ? l.at.slice(0, 40) : '', broughtIn: typeof l.broughtIn === 'string' ? l.broughtIn.slice(0, 40) : '', auto: l.auto === true, ...(ids ? { ids } : {}) };
}

// The ids the last bring-in put on a scene's board (flags.heart.editorLink.ids), compact: a list of
// ids for each keyed collection, and "layer/id" for each brush stroke. All six lists are always
// there, so a scene update (which merges objects but replaces lists) never leaves an old list behind.
// null when `i` is not one.
export const LINK_IDS = Object.freeze(['scraps', 'links', 'pins', 'bits', 'pieces', 'marks']);
export function cleanLinkIds(i) {
    if (!i || typeof i !== 'object' || Array.isArray(i)) return null;
    return Object.fromEntries(LINK_IDS.map((k) => [k, Array.isArray(i[k]) ? i[k].filter((s) => typeof s === 'string' && s.length > 0 && s.length <= 200) : []]));
}

// Map Dreamer's board brought into a scene without costing the table what it made there (Luke,
// 2026-10-27: "replaces only prep items ... never a table-made item"). Pure.
//   sceneBoard      the scene's board now
//   publishedBoard  the published board (boardFromText(...).board)
//   link            the scene's cleaned link (its `ids`: what the last bring-in put on the board)
// A PREP item is a piece with origin "prep", or any item whose id the last bring-in recorded. Prep
// items are replaced by the published ones; every other item on the scene's board was made at the
// table and is KEPT. A published item whose id a kept item already has is not brought in (the table's
// stays) and is counted in kept.collided. The sheet, the clock stages, and the decor come from the
// published board; the bin and the tidy editions stay the scene's; any key the description does not
// name comes from the published board, else stays.
// Returns { board, replaced, kept, ids }: the merged board (boardParts), the counts of what was
// replaced and kept (cards, strings, pins, bits, pieces, strokes; kept also collided), and the ids
// to record on the link for the next bring-in.
const MERGE_RECORDS = Object.freeze([['scraps', 'cards'], ['links', 'strings'], ['pins', 'pins'], ['bits', 'bits'], ['pieces', 'pieces']]);
const zeroCounts = () => ({ cards: 0, strings: 0, pins: 0, bits: 0, pieces: 0, strokes: 0 });
const isRec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function mergePublished(sceneBoard, publishedBoard, link = null) {
    const had = isRec(sceneBoard) ? sceneBoard : {};
    const pub = isRec(publishedBoard) ? publishedBoard : {};
    const recorded = cleanLinkIds(link?.ids) ?? cleanLinkIds({});
    const replaced = zeroCounts();
    const kept = { ...zeroCounts(), collided: 0 };
    const ids = Object.fromEntries(LINK_IDS.map((k) => [k, []]));
    const board = {};
    for (const [part, name] of MERGE_RECORDS) {
        const brought = new Set(recorded[part]);
        const out = {};
        for (const [id, item] of Object.entries(isRec(had[part]) ? had[part] : {})) {
            if (!safePath([id])) continue;
            if (brought.has(id) || (part === 'pieces' && item?.origin === 'prep')) replaced[name]++;
            else {
                out[id] = item;
                kept[name]++;
            }
        }
        for (const [id, item] of Object.entries(isRec(pub[part]) ? pub[part] : {})) {
            if (!safePath([id])) continue;
            if (Object.hasOwn(out, id)) kept.collided++;
            else {
                out[id] = item;
                ids[part].push(id);
            }
        }
        board[part] = out;
    }
    // (brush strokes, by layer: each stroke is a thing of its own)
    const struck = new Set(recorded.marks);
    const marks = {};
    for (const [layer, strokes] of Object.entries(isRec(had.marks) ? had.marks : {})) {
        if (!safePath([layer]) || !isRec(strokes)) continue;
        for (const [id, st] of Object.entries(strokes)) {
            if (!safePath([id])) continue;
            if (struck.has(`${layer}/${id}`)) replaced.strokes++;
            else {
                (marks[layer] ??= {})[id] = st;
                kept.strokes++;
            }
        }
    }
    for (const [layer, strokes] of Object.entries(isRec(pub.marks) ? pub.marks : {})) {
        if (!safePath([layer]) || !isRec(strokes)) continue;
        for (const [id, st] of Object.entries(strokes)) {
            if (!safePath([id])) continue;
            if (Object.hasOwn(marks[layer] ?? {}, id)) kept.collided++;
            else {
                (marks[layer] ??= {})[id] = st;
                ids.marks.push(`${layer}/${id}`);
            }
        }
    }
    board.marks = marks;
    board.decor = Array.isArray(pub.decor) ? pub.decor : [];
    if (pub.sheet !== undefined) board.sheet = pub.sheet;
    if (Array.isArray(pub.stages)) board.stages = pub.stages;
    for (const k of ['bin', 'pinsEd', 'notesEd']) {
        const v = had[k] ?? pub[k];
        if (v !== undefined) board[k] = v;
    }
    for (const k of unknownParts(pub)) board[k] = pub[k];
    for (const k of unknownParts(had)) if (!(k in board)) board[k] = had[k];
    return { board: boardParts(board), replaced, kept, ids };
}

// The sum of a merge's counts (collided is not a thing on the board, so it is not counted)
export const countTotal = (c) => Object.entries(c ?? {}).reduce((n, [k, v]) => (k === 'collided' ? n : n + (Number(v) || 0)), 0);

// What the banner on a board scene says: null when nothing is published (no banner), else
// { kind: "current" | "behind" | "unlinked", have, now, merges }. `have`: the revision the scene holds,
// `now`: the newest published, `merges`: whether a bring-in keeps the table's items (the link has ids).
export function bannerInfo({ link, meta }) {
    const st = linkState({ link, meta }).state;
    if (st === 'none') return null;
    return { kind: st, have: link?.rev ?? null, now: meta.rev, merges: Boolean(link?.ids) };
}

// Whether a published board is drawn at the scene's scale (2026-10-27; Luke's copy scene had a 5 ft
// square, 32.8 px a metre, and the board is drawn at 50 px a metre, so every piece sat at 1.52 times
// the ground's scale). Pieces are never scaled silently, so a bring-in refuses when the two differ.
// `board`: the published board (its bare sheet's w is the board's width in px); `mapSize`: the baked
// map's size { w, h } in its own unit; `mapUnitMetres`: metres in one of that unit; `scenePxPerMetre`:
// the scene's. Null when they agree within 1 percent, or when there is nothing to compare (no bare
// sheet, no map size); else { boardPxPerMetre, scenePxPerMetre }, each to one decimal.
export function boardScaleCheck({ board, mapSize, mapUnitMetres = 1, scenePxPerMetre } = {}) {
    const sheetW = Number(board?.sheet?.bare ? board.sheet.w : 0);
    const mapW = Number(mapSize?.w) * (Number(mapUnitMetres) || 1);
    const scene = Number(scenePxPerMetre);
    if (!(sheetW > 0) || !(mapW > 0) || !(scene > 0)) return null;
    const boardPx = sheetW / mapW;
    if (Math.abs(boardPx - scene) / scene <= 0.01) return null;
    const one = (n) => Math.round(n * 10) / 10;
    return { boardPxPerMetre: one(boardPx), scenePxPerMetre: one(scene) };
}

// Where a scene stands against the published map. `link`: the scene's cleaned
// link (or null); `meta`: the published meta (or null); `bakedNow`: the baked
// manifest's rev the scene has loaded, `bakedDisk`: the rev on disk now (either
// may be null). One of:
//   { state: "none" }       nothing is published for this map (Map Dreamer has not run since)
//   { state: "unlinked" }   the scene's board was brought in by hand: how old it is cannot be told
//   { state: "current" }    the scene has the published rev
//   { state: "behind" }     the published rev is another: Map Dreamer has moved on
// plus `bakeStale: true` when the manifest on disk is another bake than the one loaded.
export function linkState({ link, meta, bakedNow = null, bakedDisk = null }) {
    const bakeStale = Boolean(bakedNow && bakedDisk && bakedNow !== bakedDisk);
    const out = !meta ? { state: 'none' } : !link ? { state: 'unlinked' } : link.map !== meta.map || link.rev !== meta.rev ? { state: 'behind' } : { state: 'current' };
    return bakeStale ? { ...out, bakeStale } : out;
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
