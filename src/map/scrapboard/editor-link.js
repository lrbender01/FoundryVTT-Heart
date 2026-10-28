// Map Dreamer's map in a Foundry scene (2026-10-28; Luke: "what's drawn in the
// MapDreamer is actually what's drawn in Foundry"). Map Dreamer's map file is the
// one source of truth. Its server publishes the board into the content module
// after every save (apps/map-dreamer/server/publish.mjs: board.json,
// board.meta.json, and board.pictures.json under assets/boards/<map id>/), which
// Foundry serves like any module file. Here, in Foundry:
//
//   bringInFromEditor(scene)   one step: the published board comes into the scene's board through
//                              importBoard (so the board there now is kept in File, Earlier boards and
//                              as the backup board), the scene remembers which revision it took and
//                              which ids it put there (flags.heart.editorLink), and the pictures'
//                              versions are set so a picture rewritten in place shows. GM only.
//                              Two ways (Luke, 2026-10-27, "build anytime"):
//                                merge  a scene whose link has ids: only what Map Dreamer drew is
//                                       replaced (boardfile.js mergePublished); everything made at
//                                       the table is kept; the notification says what was replaced
//                                       and what was kept.
//                                whole  a scene with no link (brought in by hand, or never), or a link
//                                       from before ids were kept: the whole board is replaced, asked
//                                       first, and the notification says so.
//   checkEditorLink(scene)     as a board scene is viewed (the GM's client): when Map Dreamer has
//                              moved on, or the scene's board was brought in by hand, one question
//                              (Bring it in / Not now, asked once per revision per computer); and a
//                              baked map rebuilt on disk since the scene loaded it is loaded again.
//   editorState(scene)         where the scene stands: the pure rule is boardfile.js linkState
//   watchOnce()                every 30 seconds on the GM's client: the meta is read again; a scene
//                              whose link says `auto` (OFF unless setAutoBringIn turned it on) and
//                              has ids takes a newer revision by itself, by the merge, and a GM-only
//                              whisper names the counts replaced and kept.
//   the banner                 editor-banner.js: a small GM-only strip saying which revision the scene
//                              holds against the newest, repainted whenever a new meta is read and
//                              after a bring-in. File has the same bring-in as a button (tools.js).
//
// A scene with no `editorLink` is "unlinked": its board was brought in by hand. Nothing here
// changes a scene that is not a board scene or whose baked map has no published board.
import { importBoard, isBoardScene, boardOf } from './api.js';
import { askBoard } from './notes.js';
import { cleanLink, cleanPublished, linkState, publishedUrls, boardFromText, mergePublished, countTotal, bannerInfo, boardScaleCheck } from './boardfile.js';
import { cleanManifest, metrePx, metresPer } from './baked.js';
import { paintBanner } from './editor-banner.js';
import { forgetManifest } from './backdrop.js';
import { setPictureVersions } from './pieces-draw.js';
import { clearManifests } from './token-mips.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const ASKED = 'heartBoard.editorAsked';

// the baked map a scene sits on: the id in its manifest path, which is also the published map's id
// for Plenty's pieces map
const bakedPath = (scene) => scene?.flags?.heart?.baked?.manifest ?? null;
export const bakedIdOf = (scene) => /\/boards\/([A-Za-z0-9_-]+)\/manifest\.json/.exec(bakedPath(scene) ?? '')?.[1] ?? null;
// the map a scene follows: the one it was brought in from, else the one its baked map is named for
export const editorMapOf = (scene) => cleanLink(scene?.flags?.heart?.editorLink)?.map ?? bakedIdOf(scene);

async function getJson(url) {
    try {
        const r = await fetch(url, { cache: 'no-cache' });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    }
}
async function getText(url) {
    try {
        const r = await fetch(url, { cache: 'no-cache' });
        return r.ok ? await r.text() : null;
    } catch {
        return null;
    }
}

// What this page last read of each map's published meta (null: nothing published), so the rail can
// tell, without waiting, whether its File entry belongs on a scene. When a map turns out to be
// published (or not any more), the rail is told by the hook "heartEditorPublished".
const known = new Map();
export const hasPublished = (scene) => {
    const map = editorMapOf(scene);
    return Boolean(map && known.get(map));
};

// the published meta of a map, cleaned (null: nothing is published)
export async function readPublishedMeta(map) {
    if (!map) return null;
    const meta = cleanPublished(await getJson(publishedUrls(map).meta));
    const had = known.has(map) ? Boolean(known.get(map)) : null;
    known.set(map, meta);
    if (had !== Boolean(meta) && (had !== null || meta)) Hooks.callAll('heartEditorPublished', map);
    return meta;
}

// the pictures' versions of a published board ({ url: stamp }); empty when there is no file
export async function readPictureVersions(map) {
    const j = await getJson(`${publishedUrls(map).meta.replace(/board\.meta\.json$/, 'board.pictures.json')}`);
    return j && j.format === 'heart-board-pictures' && j.versions && typeof j.versions === 'object' ? j.versions : {};
}

// The baked manifest's rev as the scene loaded it and as it is on disk now (either may be null)
async function bakedRevs(scene) {
    const path = bakedPath(scene);
    if (!path) return { now: null, disk: null };
    const disk = (await getJson(path))?.rev;
    const loaded = canvas?.scene === scene ? canvas.heartBoard?.backdrop?.m?.rev : null;
    return { now: loaded ?? null, disk: typeof disk === 'string' ? disk : null };
}

// Where the scene stands against what Map Dreamer published: { map, meta, link, state, bakeStale? }
export async function editorState(scene) {
    const map = editorMapOf(scene);
    const link = cleanLink(scene?.flags?.heart?.editorLink);
    const meta = await readPublishedMeta(map);
    const rev = await bakedRevs(scene);
    return { map, meta, link, ...linkState({ link, meta, bakedNow: rev.now, bakedDisk: rev.disk }) };
}

// The banner for the scene in view, as things stand (the button brings the map in; a scene brought in
// by hand is asked first, as bringInFromEditor does). Nothing for a scene that is not in view.
function paint(scene, link, meta) {
    if (!game.user.isGM || canvas?.scene !== scene) return;
    paintBanner(bannerInfo({ link, meta }), { onBring: () => bringInFromEditor(scene, { map: meta?.map }) });
}

// The baked map loaded again from disk (a bake rebuilt it since the scene loaded it)
async function reloadBaked(scene) {
    const path = bakedPath(scene);
    if (!path || canvas?.scene !== scene) return false;
    forgetManifest(path);
    canvas.heartBoard?.backdrop?.clear();
    await canvas.heartBoard?.backdrop?.sync(scene);
    return true;
}

// "3 pieces, 2 cards, and 1 brush stroke" (only the kinds there are; "nothing" when none)
const COUNT_KINDS = ['pieces', 'cards', 'strings', 'pins', 'bits', 'strokes'];
export function describeCounts(c) {
    const parts = COUNT_KINDS.filter((k) => Number(c?.[k]) > 0).map((k) => loc(`heart.board.editor-n-${k}`, { n: c[k] }));
    if (!parts.length) return loc('heart.board.editor-n-nothing');
    try {
        return new Intl.ListFormat(game.i18n.lang || 'en', { style: 'long', type: 'conjunction' }).format(parts);
    } catch {
        return parts.join(', ');
    }
}
// what was kept, and the ids that stayed the table's
const keptLine = (kept) => (kept.collided ? `${describeCounts(kept)}; ${loc('heart.board.editor-collided', { n: kept.collided })}` : describeCounts(kept));

// the GM-only whisper after a bring-in the watcher made by itself
async function whisperAuto(id, meta, merged) {
    const text = loc('heart.board.editor-whisper', { map: id, rev: meta.rev, replaced: describeCounts(merged.replaced), kept: keptLine(merged.kept) });
    await ChatMessage.create({ content: `<p>${Handlebars.escapeExpression(text)}</p>`, whisper: game.users.filter((u) => u.isGM).map((u) => u.id) });
}

// the scenes being brought in right now (a second request, the watcher's or a click, waits its turn by being refused)
const bringing = new Set();

// Bring Map Dreamer's published map into the scene, in one step. `asked`: the question was already
// asked (checkEditorLink's); `auto`: the watcher's own bring-in (quiet, and whispered to the GMs).
// Returns { ok: true, map, rev, pieces, mode, replaced, kept } (mode "merge" or "whole"; the counts
// only for a merge) or { ok: false, reason } (the reason also shown, unless quiet).
export async function bringInFromEditor(scene = canvas?.scene, { map = null, quiet = false, asked = false, auto = false } = {}) {
    const fail = (key, data) => {
        const reason = loc(key, data);
        if (!quiet) ui.notifications.warn(reason);
        return { ok: false, reason };
    };
    if (!game.user.isGM) return fail('heart.board.editor-gm');
    if (!scene || !isBoardScene(scene)) return fail('heart.board.editor-not-board', { scene: scene?.name ?? '' });
    if (bringing.has(scene.id)) return fail('heart.board.editor-busy');
    bringing.add(scene.id);
    try {
        return await bringIn(scene, map ?? editorMapOf(scene), { quiet, asked, auto, fail });
    } finally {
        bringing.delete(scene.id);
    }
}

// null when the board and the scene agree on px a metre (or there is nothing to compare: no baked map,
// no manifest read), else { boardPxPerMetre, scenePxPerMetre }; the rule is boardfile.js boardScaleCheck
async function sceneScaleOff(scene, board) {
    const path = bakedPath(scene);
    if (!path) return null;
    const manifest = cleanManifest(await getJson(path));
    if (!manifest) return null;
    return boardScaleCheck({ board, mapSize: manifest.size, mapUnitMetres: metresPer(manifest.unit), scenePxPerMetre: metrePx(scene) });
}

async function bringIn(scene, id, { quiet, asked, auto, fail }) {
    const meta = await readPublishedMeta(id);
    if (!meta) return fail('heart.board.editor-nothing', { map: id ?? '' });
    // (the board and the meta are written one after the other, the meta last: a board shorter than the meta says is still being written)
    let text = await getText(publishedUrls(id).board);
    if (text && new Blob([text]).size < meta.bytes) {
        await new Promise((r) => setTimeout(r, 1500));
        text = await getText(publishedUrls(id).board);
    }
    if (!text || new Blob([text]).size < meta.bytes) return fail('heart.board.editor-torn');
    const read = boardFromText(text);
    if (!read) return fail('heart.board.import-bad');
    // (the board is drawn at the ground's scale: pieces are never scaled silently, so a scene whose
    // square differs is refused in words, before anything is asked or written; by hand, asked, and
    // automatic bring-ins alike)
    const off = await sceneScaleOff(scene, read.board);
    if (off) {
        const g = scene.grid ?? {};
        const square = `${Math.round((Number(g.distance) || 1) * 1000) / 1000} ${g.units || 'm'}`;
        return fail('heart.board.editor-scale', { map: id, board: off.boardPxPerMetre, scene: off.scenePxPerMetre, square });
    }
    // (a scene whose link has ids keeps what was made at the table; any other has its whole board
    // replaced, and is asked first unless the question was just asked)
    const link = cleanLink(scene.flags?.heart?.editorLink);
    const merging = Boolean(link?.ids) && link.map === id;
    if (!merging && !asked) {
        if (quiet) return fail('heart.board.editor-whole-asks');
        const yes = await askBoard({ title: loc('heart.board.editor-title'), content: loc('heart.board.editor-whole-confirm', { scene: scene.name, map: id }), yes: loc('heart.board.editor-yes'), no: loc('heart.board.editor-no'), width: 460 });
        if (!yes) return { ok: false, reason: loc('heart.board.editor-no') };
    }
    setPictureVersions(await readPictureVersions(id));
    // (the mip lists of the pictures' folders are read again too: a bake may have changed them)
    clearManifests();
    const merged = merging ? mergePublished(boardOf(scene), read.board, link) : null;
    if (!(await importBoard(scene, merged ? JSON.stringify(merged.board) : text))) return { ok: false, reason: loc('heart.board.import-bad') };
    // (the ids this bring-in put there, for the next one; `auto` is kept as the GM set it)
    const ids = (merged ?? mergePublished({}, read.board, null)).ids;
    await scene.update({ 'flags.heart.editorLink': { map: id, rev: meta.rev, at: meta.at, broughtIn: new Date().toISOString(), auto: link?.auto === true, ids } });
    const rev = await bakedRevs(scene);
    if (rev.now && rev.disk && rev.now !== rev.disk) {
        await reloadBaked(scene);
        if (!quiet) ui.notifications.info(loc('heart.board.editor-bake'));
    }
    await canvas.heartBoard?.refresh();
    paint(scene, cleanLink(scene.flags?.heart?.editorLink), meta);
    if (!quiet) {
        ui.notifications.info(merged ? loc('heart.board.editor-done-merge', { map: id, rev: meta.rev, replaced: describeCounts(merged.replaced), kept: keptLine(merged.kept) }) : loc('heart.board.editor-done-whole', { map: id, rev: meta.rev, pieces: meta.pieces }));
    }
    if (auto && merged) await whisperAuto(id, meta, merged).catch((err) => console.warn('heart | the bring-in could not be whispered', err));
    return { ok: true, map: id, rev: meta.rev, pieces: meta.pieces, mode: merged ? 'merge' : 'whole', replaced: merged?.replaced ?? null, kept: merged?.kept ?? null, total: merged ? countTotal(merged.replaced) : null };
}

// what this computer was already asked, and said Not now to: { sceneId: rev }
const askedBefore = () => {
    try {
        return JSON.parse(localStorage.getItem(ASKED) ?? '{}') ?? {};
    } catch {
        return {};
    }
};
const rememberAsked = (scene, rev) => {
    try {
        localStorage.setItem(ASKED, JSON.stringify({ ...askedBefore(), [scene.id]: rev }));
    } catch {
        // (a private window: asked again next time)
    }
};

// Foundry watches what Map Dreamer published (the revision in board.meta.json, as the timeline
// bar watches its own): every WATCH_MS, while a board scene is in view on the GM's client, the
// meta is read again and the banner repainted. A scene whose link says `auto` (OFF by default; only
// setAutoBringIn turns it on) and has ids takes a newer revision by itself, by the merge, on the
// active GM's client only, and a whisper to the GMs says what was replaced and kept; any other
// scene that is behind is told once per revision, in a notification (the question itself is asked
// as the scene is viewed). The pictures' versions are read again too (Map Dreamer rewrites them
// when a picture is rewritten in place), and a picture whose version changed is drawn again. One
// timer for the page.
export const WATCH_MS = 30000;
let watching = 0;
const told = new Set();
export async function watchOnce() {
    const scene = canvas?.scene;
    if (!game.user.isGM || !canvas?.ready || !scene || !isBoardScene(scene) || !bakedPath(scene)) return null;
    const map = editorMapOf(scene);
    if (!map) return null;
    if (setPictureVersions(await readPictureVersions(map))) await canvas.heartBoard?.refresh();
    const link = cleanLink(scene.flags?.heart?.editorLink);
    const meta = await readPublishedMeta(map);
    paint(scene, link, meta);
    if (!meta || !link || (link.map === meta.map && link.rev === meta.rev)) return null;
    if (link.auto && link.ids && link.map === meta.map) {
        // (one GM's client does it, not every GM's)
        if (game.users.activeGM && game.users.activeGM.id !== game.user.id) return null;
        return bringInFromEditor(scene, { map: meta.map, quiet: true, auto: true });
    }
    const key = `${scene.id}:${meta.rev}`;
    if (!told.has(key)) {
        told.add(key);
        ui.notifications.info(loc('heart.board.editor-newer', { map: meta.map, now: meta.rev, have: link.rev }));
    }
    return null;
}
function watchVersions() {
    if (watching) return;
    watching = setInterval(() => watchOnce().catch((err) => console.warn('heart | Map Dreamer\'s map could not be watched', err)), WATCH_MS);
}

// Take each new revision by itself (or stop): a switch on the scene's link. A scene never brought in has no link, so none.
export async function setAutoBringIn(scene = canvas?.scene, on = true) {
    const link = cleanLink(scene?.flags?.heart?.editorLink);
    if (!game.user.isGM || !link) return false;
    await scene.update({ 'flags.heart.editorLink.auto': Boolean(on) });
    return Boolean(on);
}

// The GM's client, as a board scene is viewed. Returns the state it found (or null).
export async function checkEditorLink(scene = canvas?.scene) {
    if (!game.user.isGM || !scene || !isBoardScene(scene) || !bakedPath(scene)) return null;
    watchVersions();
    // (the pictures' versions for this page, so a picture rewritten in place shows; the pieces
    // already drawn from the old ones are drawn again when they differ)
    const map = editorMapOf(scene);
    if (map && setPictureVersions(await readPictureVersions(map))) await canvas.heartBoard?.refresh();
    const st = await editorState(scene);
    paint(scene, st.link, st.meta);
    if (st.bakeStale) {
        await reloadBaked(scene);
        ui.notifications.info(loc('heart.board.editor-bake'));
    }
    if ((st.state === 'behind' || st.state === 'unlinked') && st.meta) {
        if (askedBefore()[scene.id] === st.meta.rev) return st;
        // (the question says what the bring-in will do: the merge for a link with ids of this map, else the whole board)
        const key = st.state === 'unlinked' ? 'heart.board.editor-unlinked' : st.link?.ids && st.link.map === st.meta.map ? 'heart.board.editor-behind' : 'heart.board.editor-behind-whole';
        const yes = await askBoard({
            title: loc('heart.board.editor-title'),
            content: loc(key, { map: st.meta.map, have: st.link?.rev ?? '', now: st.meta.rev, at: st.meta.at.replace('T', ' ').slice(0, 16) }),
            yes: loc('heart.board.editor-yes'),
            no: loc('heart.board.editor-no'),
            width: 460,
        });
        if (yes) await bringInFromEditor(scene, { map: st.meta.map, asked: true });
        else rememberAsked(scene, st.meta.rev);
    }
    return st;
}
