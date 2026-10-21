// The Heart map (2026-10-02, monorepo docs/plans/heart-map.md): the
// scrapboard. Picked up by the './**/index.js' module glob in src/index.js,
// which calls initialise() at init. A scrapboard scene (flags.heart.board)
// shows the party's ledger: one enormous folded sheet with the delvers'
// journey pinned to it (landmarks on book paper, notes, pencil writing, red
// string, twine, and thread), drawn by the same model and painter as the
// Heart Map Board mock, the primary map editor (docs/mocks/heart-map/). The
// look comes from fvtt-heart-content's heart-board.json; a board round-trips
// between the mock and a scene (Export / Import). The delvers' tokens travel
// on it. game.heart.board is the API; the tools are the Heart Map scene
// control (scrapboard/layer.js). An earlier map scene (flags.heart.map, the
// v2 map) becomes a scrapboard scene the first time the GM views it.
import './map.sass';
import { ScrapboardLayer, boardControls } from './scrapboard/layer.js';
import { loadBoardLook, reloadBoardLook } from './scrapboard/look.js';
import {
    isBoardScene, boardOf, createBoardScene, setBoardScene, setScrap, setLink, addScrap, addLink, removeScrap,
    removeLink, exportBoard, importBoard, restoreBackup, undo, redo, isPlayersBoard, ownersOf, tidyBoardScene, followRename, downloadBoard, newPlace,
} from './scrapboard/api.js';
import { registerBoardSettings, registerBoardRelay, handOf, playersBoardDialog } from './scrapboard/notes.js';
import { registerRailSettings, syncRail } from './scrapboard/rail.js';
import { keepBackup } from './scrapboard/backups.js';

// (the scenes whose board was copied as this session found it)
const kept = new Set();

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const layer = () => canvas?.heartBoard;
const onBoard = () => Boolean(canvas?.ready && isBoardScene(canvas.scene));

// A landmark dropped on the board is pinned where it fell, hidden until the
// GM reveals it. A book landmark (from the compendium, or a world copy of
// one) is its library entry; dropping one already on the board moves it.
// Any other landmark is one of the GM's own. Never a token.
function onDrop(_canvas, data) {
    if (!onBoard() || data?.type !== 'Actor' || !game.user.isGM) return;
    const doc = data.uuid ? fromUuidSync(data.uuid, { strict: false }) : null;
    if (doc?.type !== 'landmark') return;
    (async () => {
        const scene = canvas.scene;
        const { look } = await loadBoardLook();
        const at = layer()?.renderer.toMap({ x: data.x, y: data.y }) ?? { x: data.x, y: data.y };
        const source = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
        const key = Object.keys(look.library).find((k) => [doc.uuid, source].includes(look.library[k].uuid));
        const scraps = boardOf(scene).scraps ?? {};
        const placed = key ? (scraps[key] ? key : null) : Object.keys(scraps).find((k) => scraps[k]?.uuid === doc.uuid);
        if (placed) return setScrap(scene, placed, { x: Math.round(at.x), y: Math.round(at.y) });
        await addScrap(scene, key ? { type: 'landmark', lib: key, x: at.x, y: at.y, state: 'hidden' } : { type: 'landmark', uuid: doc.uuid, name: doc.name, x: at.x, y: at.y, state: 'hidden' });
        ui.notifications.info(loc('heart.board.placed', { name: doc.name }));
    })();
    return false;
}

// An earlier map scene (flags.heart.map: placed landmarks and their links on
// a 2400 x 3600 map) becomes a scrapboard scene, its landmarks scraps and its
// links strings, rescaled to the look's sheet
async function convertOldMap(scene) {
    const old = scene?.flags?.heart?.map;
    if (!game.user.isGM || !old || isBoardScene(scene)) return;
    const { look } = await loadBoardLook();
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
    await scene.update({ width: look.w, height: look.h, 'flags.heart.board': { scraps, links, decor: [] }, 'flags.heart.-=map': null });
    ui.notifications.info(loc('heart.board.converted', { name: scene.name }));
}

function registerHooks() {
    Hooks.on('getSceneControlButtons', boardControls);

    Hooks.on('canvasReady', async () => {
        await convertOldMap(canvas.scene);
        // (a copy of the board as the session found it: the GM's, once a scene)
        if (game.user.isGM && isBoardScene(canvas.scene) && !kept.has(canvas.scene.id)) {
            kept.add(canvas.scene.id);
            await keepBackup(canvas.scene, foundry.utils.deepClone(boardOf(canvas.scene)), { force: true, why: 'start' });
        }
        await tidyBoardScene(canvas.scene);
        layer()?.refresh();
        // the Heart Map control shows on scrapboard scenes only, and is the
        // one in hand when such a scene is viewed (GM and players alike)
        // (Foundry hands a player their own token before this hook; on the map
        // only the Heart Map control is in hand)
        if (onBoard()) {
            canvas.tokens?.releaseAll();
            layer()?.activate();
        } else ui.controls?.initialize();
        // (the Heart Map's own toolbar, when it is the one in use)
        syncRail();
    });
    Hooks.on('canvasTearDown', () => document.getElementById('heart-board-rail')?.remove());

    Hooks.on('updateScene', (scene, changes) => {
        if (scene.id !== canvas?.scene?.id || !foundry.utils.hasProperty(changes, 'flags.heart')) return;
        layer()?.queueRefresh();
        ui.controls?.initialize();
    });

    // a claimed hand changes how that player's notes write
    Hooks.on('updateSetting', (setting) => {
        if (setting.key === 'heart.boardHands' && onBoard()) layer()?.queueRefresh();
    });

    Hooks.on('dropCanvasData', onDrop);

    // a place's cards follow its actor (Luke, 2026-10-21): a rename is
    // written to every board's cards by the one active GM (an edit Undo takes
    // back); a new picture is drawn again on everyone's screen
    Hooks.on('updateActor', (actor, changes) => {
        if (actor.type !== 'landmark') return;
        if ('img' in changes && onBoard()) layer()?.queueRefresh();
        if ('name' in changes && game.user.isGM && game.users.activeGM?.id === game.user.id) followRename(actor);
    });

    // every board scene made whole once the world is up (the GM's client)
    Hooks.once('ready', async () => {
        if (!game.user.isGM) return;
        for (const scene of game.scenes) if (isBoardScene(scene)) await tidyBoardScene(scene).catch((err) => console.warn('heart | a board could not be tidied', scene.name, err));
    });

    // the marker's palette shows while the Marker is in hand
    Hooks.on('renderSceneControls', () => {
        if (onBoard()) layer()?.syncPalette();
        syncRail();
    });

    // the selection's marks keep their width on screen
    Hooks.on('canvasPan', () => {
        if (!onBoard()) return;
        layer()?.drawMarks();
        // (what is on the screen painted sharp again once the view settles)
        layer()?.renderer.queueFocus();
    });

    // the Scenes sidebar: Create Heart Map (GM)
    Hooks.on('renderSceneDirectory', (app, html) => {
        if (!game.user.isGM) return;
        const root = html instanceof HTMLElement ? html : html[0];
        const actions = root?.querySelector('.header-actions');
        if (!actions || actions.querySelector('.heart-map-create')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'heart-map-create';
        button.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${Handlebars.escapeExpression(loc('heart.board.create'))}`;
        button.addEventListener('click', () => createBoardScene());
        actions.append(button);
        // a players' board: a canvas of their own (Luke, 2026-10-02)
        const players = document.createElement('button');
        players.type = 'button';
        players.className = 'heart-map-create';
        players.innerHTML = `<i class="fa-solid fa-users"></i> ${Handlebars.escapeExpression(loc('heart.board.players-board'))}`;
        players.addEventListener('click', createPlayersBoard);
        actions.append(players);
    });

    Hooks.on('getSceneDirectoryEntryContext', (_html, options) => {
        const sceneOf = (li) => game.scenes.get(li.data('documentId') ?? li.data('entityId'));
        options.push({
            name: 'heart.board.make',
            icon: '<i class="fa-solid fa-thumbtack"></i>',
            condition: (li) => game.user.isGM && !isBoardScene(sceneOf(li)),
            callback: (li) => setBoardScene(sceneOf(li), true),
        }, {
            name: 'heart.board.unmake',
            icon: '<i class="fa-solid fa-thumbtack"></i>',
            condition: (li) => game.user.isGM && isBoardScene(sceneOf(li)),
            callback: (li) => setBoardScene(sceneOf(li), false),
        }, {
            name: 'heart.board.players-make-scene',
            icon: '<i class="fa-solid fa-users"></i>',
            condition: (li) => game.user.isGM && isBoardScene(sceneOf(li)) && !isPlayersBoard(sceneOf(li)),
            callback: async (li) => {
                const answer = await playersBoardDialog();
                if (answer) await sceneOf(li).update({ 'flags.heart.boardOwners': answer.owners, 'ownership.default': answer.owners === 'all' ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : sceneOf(li).ownership.default });
            },
        }, {
            name: 'heart.board.players-unmake',
            icon: '<i class="fa-solid fa-users-slash"></i>',
            condition: (li) => game.user.isGM && isPlayersBoard(sceneOf(li)),
            callback: (li) => sceneOf(li).update({ 'flags.heart.-=boardOwners': null }),
        });
    });
}

// A players' board: a scrapboard scene its owners (every player, or some)
// edit freely, but for what's hidden and the book's places
async function createPlayersBoard() {
    if (!game.user.isGM) return null;
    const answer = await playersBoardDialog();
    if (!answer) return null;
    return createBoardScene({ name: answer.name, owners: answer.owners });
}

registerHooks();

export function initialise() {
    CONFIG.Canvas.layers.heartBoard = { layerClass: ScrapboardLayer, group: 'interface' };
    // undo and redo on the board (Luke, 2026-10-06): each user's own edits,
    // only while the board's tools are in hand (else Foundry's own)
    const { CONTROL, SHIFT } = KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register('heart', 'boardUndo', {
        name: 'heart.board.key-undo',
        editable: [{ key: 'KeyZ', modifiers: [CONTROL] }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: () => { const l = layer(); if (!l?.active || !l.isBoard) return false; l.history('undo'); return true; },
    });
    game.keybindings.register('heart', 'boardRedo', {
        name: 'heart.board.key-redo',
        editable: [{ key: 'KeyZ', modifiers: [CONTROL, SHIFT] }, { key: 'KeyY', modifiers: [CONTROL] }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: () => { const l = layer(); if (!l?.active || !l.isBoard) return false; l.history('redo'); return true; },
    });
    // the selected cards put together afresh (Luke, 2026-10-21: Shift+R, as
    // in the editor), the GM's, only while the board's tools are in hand
    game.keybindings.register('heart', 'boardReshuffle', {
        name: 'heart.board.key-reshuffle',
        editable: [{ key: 'KeyR', modifiers: [SHIFT] }],
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: () => Boolean(layer()?.reshuffle()),
    });
    registerBoardSettings();
    registerRailSettings();
    registerBoardRelay();
    game.heart.board = {
        create: createBoardScene,
        createPlayersBoard,
        ownersOf,
        setBoardScene,
        isBoardScene,
        board: boardOf,
        look: loadBoardLook,
        reload: async () => {
            await reloadBoardLook();
            return layer()?.refresh();
        },
        setScrap,
        setLink,
        addScrap,
        addLink,
        removeScrap,
        removeLink,
        export: exportBoard,
        download: downloadBoard,
        import: importBoard,
        newPlace,
        restoreBackup,
        undo,
        redo,
        handOf,
        // the GM sees the board as players do (also the Player view tool)
        preview: (on = true) => layer()?.setPreview(on),
    };
}
