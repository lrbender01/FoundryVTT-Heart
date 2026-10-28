// Heart's plug-in for the board (2026-10-28; the monorepo's
// docs/plans/dreamer/foundry.md, "How the fork consumes it"). The board
// itself (the scrapboard scenes: the layer, its tools, keybindings,
// settings, relay handlers, session tools, hooks, and api) lives in the
// Dream Board module, fvtt-dream-board, which the system's manifest
// requires. This file is what is Heart's alone, done through the module's
// api (game.modules.get('fvtt-dream-board').api):
//
//   - the look: Heart's board look and styles from fvtt-heart-content,
//     registered as the 'heart' plug-in when the module calls the
//     dreamBoardReady hook at its init;
//   - game.heart.board: a getter that answers the module's api, so the
//     toolkit and macros keep working (never a plain object: the module
//     stands down when it finds one, thinking an older Heart carries its
//     own board);
//   - a landmark actor dropped on a board, pinned where it fell, hidden;
//   - an earlier map scene (flags.heart.map, the v2 map) made a board the
//     first time the GM views it;
//   - a landmark actor's rename followed onto its cards, and a new picture
//     drawn again;
//   - a word to the GM at ready when the module is missing or switched off.
//
// Picked up by the './**/index.js' module glob in src/index.js, which calls
// initialise() at the system's init (before the module's: Foundry runs a
// system's scripts first). The old board code under ./scrapboard/ stays in
// the tree for Map Dreamer and the tools that import it by path, but
// webpack keeps it out of the bundle (webpack.config.cjs): never import it
// here.

export const BOARD_MODULE = 'fvtt-dream-board';
export const READY_HOOK = 'dreamBoardReady';

// Heart's look, from the content module
export const HEART_PLUGIN = Object.freeze({
    id: 'heart',
    look: Object.freeze({
        module: 'fvtt-heart-content',
        file: 'assets/art/map/heart-board.json',
        styles: 'assets/art/map/styles.json',
        previews: 'assets/art/_previews/index.json',
    }),
});

// the module's api (undefined: the module is missing, off, or not yet at its init)
const api = () => game.modules?.get?.(BOARD_MODULE)?.api;

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const layer = () => globalThis.canvas?.heartBoard;
const onBoard = () => Boolean(globalThis.canvas?.ready && api()?.isBoardScene(canvas.scene));

// A landmark dropped on the board is pinned where it fell, hidden until the
// GM reveals it. A book landmark (from the compendium, or a world copy of
// one) is its library entry; dropping one already on the board moves it.
// Any other landmark is one of the GM's own. Never a token.
function onDrop(_canvas, data) {
    const board = api();
    if (!board || !onBoard() || data?.type !== 'Actor' || !game.user.isGM) return;
    const doc = data.uuid ? fromUuidSync(data.uuid, { strict: false }) : null;
    if (doc?.type !== 'landmark') return;
    (async () => {
        const scene = canvas.scene;
        const { look } = await board.look(scene);
        const at = layer()?.renderer.toMap({ x: data.x, y: data.y }) ?? { x: data.x, y: data.y };
        const source = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
        // (a library entry with no uuid never matches a landmark with no
        // source: Luke, 2026-10-21)
        const key = Object.keys(look.library).find((k) => look.library[k]?.uuid && [doc.uuid, source].includes(look.library[k].uuid));
        const scraps = board.boardOf(scene).scraps ?? {};
        const placed = key ? (scraps[key] ? key : null) : Object.keys(scraps).find((k) => scraps[k]?.uuid === doc.uuid);
        if (placed) return board.setScrap(scene, placed, { x: Math.round(at.x), y: Math.round(at.y) });
        await board.addScrap(scene, key ? { type: 'landmark', lib: key, x: at.x, y: at.y, state: 'hidden' } : { type: 'landmark', uuid: doc.uuid, name: doc.name, x: at.x, y: at.y, state: 'hidden' });
        ui.notifications.info(loc('heart.board.placed', { name: doc.name }));
    })().catch((err) => console.error('heart | the landmark could not be placed', err));
    return false;
}

// An earlier map scene (flags.heart.map: placed landmarks and their links on
// a 2400 x 3600 map) becomes a board scene, its landmarks cards and its
// links strings, rescaled to the look's sheet. The board goes where the
// module writes a board (its flags.path); only flags.heart.map comes off.
async function convertOldMap(scene) {
    const board = api();
    const old = scene?.flags?.heart?.map;
    if (!board || !game.user.isGM || !old || board.isBoardScene(scene)) return;
    const { look } = await board.look();
    const kx = look.w / 2400;
    const ky = look.h / 3600;
    const scraps = {};
    for (const [key, n] of Object.entries(old.nodes ?? {})) {
        if (!n || !Number.isFinite(n.x)) continue;
        const base = { type: 'landmark', x: Math.round(n.x * kx), y: Math.round(n.y * ky), state: n.state ?? 'hidden' };
        scraps[key] = n.uuid && !look.library[key] ? { ...base, uuid: n.uuid, name: n.name ?? '' } : { ...base, lib: key };
    }
    const links = {};
    for (const [id, l] of Object.entries(old.links ?? {})) {
        if (!l?.a || !l?.b || !scraps[l.a] || !scraps[l.b]) continue;
        links[id] = { a: l.a, b: l.b, kind: l.kind ?? 'delve', state: l.state ?? 'known', ...(l.delve ? { delve: l.delve } : {}) };
    }
    await scene.update({ width: look.w, height: look.h, [board.flags.path(scene, 'board')]: { scraps, links, decor: [] }, 'flags.heart.-=map': null });
    ui.notifications.info(loc('heart.board.converted', { name: scene.name }));
    // (the module's own canvasReady ran before the scene was a board: the
    // board drawn and its tools put in hand now, as they were before the move)
    if (scene.id === globalThis.canvas?.scene?.id) {
        layer()?.refresh?.();
        layer()?.activate?.();
    }
}

// the GM told once, at ready, when the board's module is missing or off
function warnMissing() {
    if (game.modules?.get?.(BOARD_MODULE)?.active) return;
    console.warn(`heart | the board lives in the ${BOARD_MODULE} module now, which is missing or not enabled: board scenes will not draw`);
    if (game.user?.isGM) ui.notifications?.warn(loc('heart.board.module-missing'), { permanent: true });
}

function registerHooks() {
    // Heart's look, handed to the module at its init
    Hooks.once(READY_HOOK, (board) => board?.registerPlugin?.(HEART_PLUGIN));

    Hooks.on('canvasReady', async () => {
        try {
            await convertOldMap(canvas.scene);
        } catch (err) {
            console.warn('heart | the old map could not be converted', err);
        }
    });

    Hooks.on('dropCanvasData', onDrop);

    // a place's cards follow its actor (Luke, 2026-10-21): a rename is
    // written to every board's cards by the one active GM (an edit Undo takes
    // back); a new picture is drawn again on everyone's screen
    Hooks.on('updateActor', (actor, changes) => {
        if (actor.type !== 'landmark') return;
        if ('img' in changes && onBoard()) layer()?.queueRefresh();
        if ('name' in changes && game.user.isGM && game.users.activeGM?.id === game.user.id) api()?.followRename(actor);
    });

    Hooks.once('ready', warnMissing);
}

registerHooks();

export function initialise() {
    // game.heart.board: the module's api, read each time (it is set at the
    // module's init, which runs after this)
    Object.defineProperty(game.heart, 'board', { get: () => api(), configurable: true, enumerable: true });
}
