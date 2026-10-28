// Map Dreamer's map in a Foundry scene (2026-10-28; Luke: "what's drawn in the
// MapDreamer is actually what's drawn in Foundry"). Map Dreamer's map file is the
// one source of truth. Its server publishes the board into the content module
// after every save (apps/map-dreamer/server/publish.mjs: board.json,
// board.meta.json, and board.pictures.json under assets/boards/<map id>/), which
// Foundry serves like any module file. Here, in Foundry:
//
//   bringInFromEditor(scene)   one step: the published board replaces the scene's board (the board
//                              there now is kept in File, Earlier boards and as the backup board),
//                              the scene remembers which revision it took (flags.heart.editorLink),
//                              and the pictures' versions are set so a picture rewritten in place
//                              shows. GM only.
//   checkEditorLink(scene)     as a board scene is viewed (the GM's client): when Map Dreamer has
//                              moved on, or the scene's board was brought in by hand, one question
//                              (Bring it in / Not now, asked once per revision per computer); and a
//                              baked map rebuilt on disk since the scene loaded it is loaded again.
//   editorState(scene)         where the scene stands: the pure rule is boardfile.js linkState
//
// A scene with no `editorLink` is "unlinked": its board was brought in by hand. Nothing here
// changes a scene that is not a board scene or whose baked map has no published board.
import { importBoard, isBoardScene } from './api.js';
import { askBoard } from './notes.js';
import { cleanLink, cleanPublished, linkState, publishedUrls } from './boardfile.js';
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

// the published meta of a map, cleaned (null: nothing is published)
export async function readPublishedMeta(map) {
    return map ? cleanPublished(await getJson(publishedUrls(map).meta)) : null;
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

// The baked map loaded again from disk (a bake rebuilt it since the scene loaded it)
async function reloadBaked(scene) {
    const path = bakedPath(scene);
    if (!path || canvas?.scene !== scene) return false;
    forgetManifest(path);
    canvas.heartBoard?.backdrop?.clear();
    await canvas.heartBoard?.backdrop?.sync(scene);
    return true;
}

// Bring Map Dreamer's published map into the scene, in one step. Returns
// { ok: true, map, rev, pieces } or { ok: false, reason } (the reason also shown).
export async function bringInFromEditor(scene = canvas?.scene, { map = null, quiet = false } = {}) {
    const fail = (key, data) => {
        const reason = loc(key, data);
        if (!quiet) ui.notifications.warn(reason);
        return { ok: false, reason };
    };
    if (!game.user.isGM) return fail('heart.board.editor-gm');
    if (!scene || !isBoardScene(scene)) return fail('heart.board.editor-not-board', { scene: scene?.name ?? '' });
    const id = map ?? editorMapOf(scene);
    const meta = await readPublishedMeta(id);
    if (!meta) return fail('heart.board.editor-nothing', { map: id ?? '' });
    // (the board and the meta are written one after the other, the meta last: a board shorter than the meta says is still being written)
    let text = await getText(publishedUrls(id).board);
    if (text && new Blob([text]).size < meta.bytes) {
        await new Promise((r) => setTimeout(r, 1500));
        text = await getText(publishedUrls(id).board);
    }
    if (!text || new Blob([text]).size < meta.bytes) return fail('heart.board.editor-torn');
    setPictureVersions(await readPictureVersions(id));
    // (the mip lists of the pictures' folders are read again too: a bake may have changed them)
    clearManifests();
    if (!(await importBoard(scene, text))) return { ok: false, reason: loc('heart.board.import-bad') };
    // (`auto` is kept as the GM set it)
    const auto = cleanLink(scene.flags?.heart?.editorLink)?.auto === true;
    await scene.update({ 'flags.heart.editorLink': { map: id, rev: meta.rev, at: meta.at, broughtIn: new Date().toISOString(), auto } });
    const rev = await bakedRevs(scene);
    if (rev.now && rev.disk && rev.now !== rev.disk) {
        await reloadBaked(scene);
        if (!quiet) ui.notifications.info(loc('heart.board.editor-bake'));
    }
    await canvas.heartBoard?.refresh();
    if (!quiet) ui.notifications.info(loc('heart.board.editor-done', { map: id, rev: meta.rev, pieces: meta.pieces }));
    return { ok: true, map: id, rev: meta.rev, pieces: meta.pieces };
}

// what this computer was already asked, and said Not now to: { sceneId: rev }
const asked = () => {
    try {
        return JSON.parse(localStorage.getItem(ASKED) ?? '{}') ?? {};
    } catch {
        return {};
    }
};
const rememberAsked = (scene, rev) => {
    try {
        localStorage.setItem(ASKED, JSON.stringify({ ...asked(), [scene.id]: rev }));
    } catch {
        // (a private window: asked again next time)
    }
};

// Foundry watches what Map Dreamer published (the revision in board.meta.json, as the timeline
// bar watches its own): every WATCH_MS, while a board scene is in view on the GM's client, the
// meta is read again. A scene whose link says `auto` takes a newer revision by itself (bringIn,
// quietly: the board before is kept in Earlier boards); any other scene that is behind is told
// once per revision, in a notification (the question itself is asked as the scene is viewed).
// The pictures' versions are read again too (Map Dreamer rewrites them when a picture is
// rewritten in place), and a picture whose version changed is drawn again. One timer for the page.
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
    if (!meta || !link || (link.map === meta.map && link.rev === meta.rev)) return null;
    if (link.auto) return bringInFromEditor(scene, { map: meta.map, quiet: true });
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
    if (st.bakeStale) {
        await reloadBaked(scene);
        ui.notifications.info(loc('heart.board.editor-bake'));
    }
    if ((st.state === 'behind' || st.state === 'unlinked') && st.meta) {
        if (asked()[scene.id] === st.meta.rev) return st;
        const yes = await askBoard({
            title: loc('heart.board.editor-title'),
            content: loc(st.state === 'behind' ? 'heart.board.editor-behind' : 'heart.board.editor-unlinked', { map: st.meta.map, have: st.link?.rev ?? '', now: st.meta.rev, at: st.meta.at.replace('T', ' ').slice(0, 16) }),
            yes: loc('heart.board.editor-yes'),
            no: loc('heart.board.editor-no'),
            width: 460,
        });
        if (yes) await bringInFromEditor(scene, { map: st.meta.map });
        else rememberAsked(scene, st.meta.rev);
    }
    return st;
}
