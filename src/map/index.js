// The Heart map (2026-10-02; the fork's CLAUDE.md "The Heart map", the
// CHANGELOG, and the monorepo's HEART.md): the
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
import { ScrapboardLayer } from './scrapboard/layer.js';
import { boardControls } from './scrapboard/tools.js';
import { loadBoardLook, reloadBoardLook, boardStyles } from './scrapboard/look.js';
import { addBoardTab, createBoardDialog } from './scrapboard/scene-tab.js';
import {
    isBoardScene, boardOf, createBoardScene, setBoardScene, setScrap, setLink, addScrap, addLink, removeScrap,
    removeLink, exportBoard, importBoard, restoreBackup, undo, redo, isPlayersBoard, ownersOf, tidyBoardScene, syncBoardScene, followRename, downloadBoard, newPlace,
    configureBoard, followSceneSize, remindDownload, keepWorldCopy, applyBoardPatch,
} from './scrapboard/api.js';
import { registerBoardSettings, registerBoardRelay, handOf, playersBoardDialog, askBoard, freeGMHands } from './scrapboard/notes.js';
import { registerRailSettings, syncRail, againToLook, flipActorTools } from './scrapboard/rail.js';
import { keepBackup } from './scrapboard/backups.js';
import { registerBoardFog } from './scrapboard/fog.js';

// (the scenes whose board was copied as this session found it)
const kept = new Set();

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const layer = () => canvas?.heartBoard;
const onBoard = () => Boolean(canvas?.ready && isBoardScene(canvas.scene));

// the scene controls made to match the scene: off a board the Heart Map's
// layer is never the one in hand (its control is gone, and Foundry's controls
// throw on a control they cannot find), so the Token layer takes it
function syncControls() {
    if (!onBoard() && canvas?.activeLayer && canvas.activeLayer === layer()) canvas.tokens?.activate();
    else ui.controls?.initialize();
}

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
        const { look } = await loadBoardLook(scene);
        const at = layer()?.renderer.toMap({ x: data.x, y: data.y }) ?? { x: data.x, y: data.y };
        const source = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
        // (a library entry with no uuid never matches a landmark with no
        // source: Luke, 2026-10-21)
        const key = Object.keys(look.library).find((k) => look.library[k]?.uuid && [doc.uuid, source].includes(look.library[k].uuid));
        const scraps = boardOf(scene).scraps ?? {};
        const placed = key ? (scraps[key] ? key : null) : Object.keys(scraps).find((k) => scraps[k]?.uuid === doc.uuid);
        if (placed) return setScrap(scene, placed, { x: Math.round(at.x), y: Math.round(at.y) });
        await addScrap(scene, key ? { type: 'landmark', lib: key, x: at.x, y: at.y, state: 'hidden' } : { type: 'landmark', uuid: doc.uuid, name: doc.name, x: at.x, y: at.y, state: 'hidden' });
        ui.notifications.info(loc('heart.board.placed', { name: doc.name }));
    })().catch((err) => console.error('heart | the landmark could not be placed', err));
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
        const scene = canvas.scene;
        try {
            await convertOldMap(scene);
        } catch (err) {
            console.warn('heart | the old map could not be converted', err);
        }
        // The board shown and in hand first, then the GM's copy and tidy
        // (Luke, 2026-10-25: the first paint waited for both writes, and a
        // throw in either left the board blank); a tidy that changes the
        // board is drawn again by its own scene update
        layer()?.refresh();
        // the Heart Map control shows on scrapboard scenes only, and is the
        // one in hand when such a scene is viewed (GM and players alike)
        // (Foundry hands a player their own token before this hook; on the map
        // only the Heart Map control is in hand)
        if (onBoard()) {
            canvas.tokens?.releaseAll();
            layer()?.activate();
        } else syncControls();
        // (the Heart Map's own toolbar, when it is the one in use)
        syncRail();
        try {
            // (a copy of the board as the session found it: the GM's, once a scene)
            if (game.user.isGM && isBoardScene(scene) && !kept.has(scene.id)) {
                kept.add(scene.id);
                await keepBackup(scene, foundry.utils.deepClone(boardOf(scene)), { force: true, why: 'start' });
                // (and, the active GM's, a dated copy in the world's folder
                // and the Download reminder: Luke 2026-10-25, the map safety
                // fixes)
                if (!game.users.activeGM || game.users.activeGM.id === game.user.id) {
                    remindDownload(scene);
                    await keepWorldCopy(scene).catch((err) => console.warn('heart | the board could not be copied to the world', err));
                }
            }
            await tidyBoardScene(scene);
        } catch (err) {
            console.warn('heart | the board could not be copied or tidied', err);
        }
    });
    Hooks.on('canvasTearDown', () => document.getElementById('heart-board-rail')?.remove());

    Hooks.on('updateScene', (scene, changes, options) => {
        // (the scene the size of its board's sheet, after an undo, a redo, an
        // import, or a restore changed it: the active GM's; Luke 2026-10-24)
        if (foundry.utils.hasProperty(changes, 'flags.heart.board')) syncBoardScene(scene).catch((err) => console.warn('heart | the scene could not follow its sheet', err));
        // (a board on its scene's own background the scene's size: Luke 2026-10-25)
        if (('width' in changes || 'height' in changes) && !options?.heartBoard) followSceneSize(scene).catch((err) => console.warn('heart | the board could not follow its scene', err));
        if (scene.id !== canvas?.scene?.id || !foundry.utils.hasProperty(changes, 'flags.heart')) return;
        // (a new style: drawn again in it at once, never twice)
        if (foundry.utils.hasProperty(changes, 'flags.heart.boardStyle')) {
            layer()?.refresh();
            return syncControls();
        }
        layer()?.queueRefresh();
        // (a scene that stops being a board drops the Heart Map control)
        syncControls();
    });

    // a claimed hand changes how that player's notes write
    Hooks.on('updateSetting', (setting) => {
        if (setting.key === 'heart.boardHands' && onBoard()) layer()?.queueRefresh();
    });

    Hooks.on('dropCanvasData', onDrop);

    // a user gone: what they were doing on the map with them (Luke, 2026-10-25)
    Hooks.on('userConnected', (user, connected) => {
        if (!connected) layer()?.dropPeer?.(user.id);
    });

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
        // (the active GM's alone: two GMs tidied every board twice; Luke,
        // 2026-10-21)
        if (!game.user.isGM || (game.users.activeGM && game.users.activeGM.id !== game.user.id)) return;
        for (const scene of game.scenes) if (isBoardScene(scene)) await tidyBoardScene(scene).catch((err) => console.warn('heart | a board could not be tidied', scene.name, err));
        // (no GM holds a hand: Luke 2026-10-25)
        await freeGMHands().catch((err) => console.warn('heart | a GM hand could not be let go', err));
    });

    // the marker's palette shows while the Marker is in hand
    Hooks.on('renderSceneControls', (app, html) => {
        // (the toolbar first: a tool's window opens beside it; Luke
        // 2026-10-25, made first it opened by Foundry's, to the right)
        syncRail();
        if (onBoard()) layer()?.syncPalette();
        // (the tool in hand clicked again puts it down: Look, Luke 2026-10-25)
        const el = html?.[0] ?? html;
        if (el?.addEventListener && !el.dataset.heartAgain) {
            el.dataset.heartAgain = '1';
            el.addEventListener('click', (ev) => {
                const li = ev.target.closest?.('.control-tool[data-tool]');
                if (!li || ui.controls?.activeControl !== 'heartBoard') return;
                if (againToLook(li.dataset.tool)) setTimeout(() => ui.controls?.initialize({ control: 'heartBoard', tool: 'inspect' }), 0);
            }, true);
        }
    });

    // the selection's marks keep their width on screen
    Hooks.on('canvasPan', () => {
        if (!onBoard()) return;
        // (what the pointer rested on let go: its caption never stuck through
        // a pan; Luke 2026-10-25)
        layer()?.panned();
        layer()?.drawMarks();
        // (what is on the screen painted sharp again once the view settles;
        // on a bare board, its own tiles shown at once where the sharp ones
        // no longer cover the view)
        layer()?.renderer.syncBase();
        layer()?.renderer.queueFocus();
        // (a baked map's tiles for the view)
        layer()?.backdrop?.update();
    });

    // a scene's settings: its Board tab (Luke, 2026-10-25)
    Hooks.on('renderSceneConfig', (app, html) => {
        addBoardTab(app, html).catch((err) => console.warn('heart | the Board tab could not be added', err));
    });

    // the Scenes sidebar: Create Board (GM)
    Hooks.on('renderSceneDirectory', (app, html) => {
        if (!game.user.isGM) return;
        const root = html instanceof HTMLElement ? html : html[0];
        const actions = root?.querySelector('.header-actions');
        if (!actions || actions.querySelector('.heart-map-create')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'heart-map-create';
        button.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${Handlebars.escapeExpression(loc('heart.board.create'))}`;
        // (its name and style asked first: Luke 2026-10-25)
        button.addEventListener('click', async () => {
            const answer = await createBoardDialog();
            if (answer) await createBoardScene(answer);
        });
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
            // (a scene with a picture keeps it, and its size, as the board's
            // background; the Board tab of its settings changes it: Luke
            // 2026-10-25)
            callback: (li) => setBoardScene(sceneOf(li), true, { bare: Boolean(sceneOf(li)?.background?.src) }),
        }, {
            name: 'heart.board.unmake',
            icon: '<i class="fa-solid fa-thumbtack"></i>',
            condition: (li) => game.user.isGM && isBoardScene(sceneOf(li)),
            // (it deletes the whole board: asked first, and a copy kept in
            // File, Earlier boards; Luke 2026-10-23, the board safety audit)
            callback: async (li) => {
                const scene = sceneOf(li);
                const board = boardOf(scene);
                const ok = await askBoard({
                    title: loc('heart.board.unmake'),
                    content: loc('heart.board.unmake-ask', { scene: scene.name, cards: Object.keys(board?.scraps ?? {}).length, strings: Object.keys(board?.links ?? {}).length }),
                    yes: loc('heart.board.unmake-yes'),
                    no: loc('heart.board.unmake-no'),
                });
                if (!ok) return;
                await keepBackup(scene, foundry.utils.deepClone(board), { force: true, why: 'replaced' });
                return setBoardScene(scene, false);
            },
        }, {
            name: 'heart.board.players-make-scene',
            icon: '<i class="fa-solid fa-users"></i>',
            condition: (li) => game.user.isGM && isBoardScene(sceneOf(li)) && !isPlayersBoard(sceneOf(li)),
            callback: async (li) => {
                const answer = await playersBoardDialog();
                if (!answer) return;
                // (its owners may view it, as a new players' board's may:
                // Luke, 2026-10-21, chosen players were never given the scene)
                const { OBSERVER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
                const scene = sceneOf(li);
                const see = answer.owners === 'all'
                    ? { 'ownership.default': Math.max(OBSERVER, scene.ownership.default ?? 0) }
                    : Object.fromEntries(answer.owners.map((id) => [`ownership.${id}`, Math.max(OBSERVER, scene.ownership[id] ?? 0)]));
                await scene.update({ 'flags.heart.boardOwners': answer.owners, ...see });
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
    let style;
    try {
        style = localStorage.getItem('heartBoard.lastStyle') || undefined;
    } catch {
        // (a private window: Heart's)
    }
    return createBoardScene({ name: answer.name, owners: answer.owners, style });
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
    // the selection made public, or its maker's again (Luke, 2026-10-24:
    // Shift+P), anyone's, only while the board's tools are in hand
    game.keybindings.register('heart', 'boardShare', {
        name: 'heart.board.key-share',
        editable: [{ key: 'KeyP', modifiers: [SHIFT] }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: (ctx) => (ctx?.event?.target?.closest?.('input, textarea, select, [contenteditable]') ? false : Boolean(layer()?.share())),
    });
    // the flip between the board tool last held and Foundry's token Select
    // (Plenty finish item 1a, 2026-10-26: Q, free in Foundry's defaults; anyone's,
    // players move their familiars too; never while typing in a field)
    game.keybindings.register('heart', 'boardFlipActors', {
        name: 'heart.board.key-flip',
        hint: 'heart.board.key-flip-hint',
        editable: [{ key: 'KeyQ' }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        onDown: (ctx) => (ctx?.event?.target?.closest?.('input, textarea, select, [contenteditable]') ? false : flipActorTools()),
    });
    registerBoardSettings();
    registerRailSettings();
    registerBoardRelay();
    // (the NPC fog on a board with a baked map: Luke 2026-10-25)
    registerBoardFog();
    game.heart.board = {
        create: createBoardScene,
        createPlayersBoard,
        ownersOf,
        setBoardScene,
        // (a scene's board as its Board tab would leave it, and the styles
        // there are: Luke 2026-10-25)
        configure: configureBoard,
        styles: boardStyles,
        isBoardScene,
        board: boardOf,
        look: loadBoardLook,
        reload: async () => {
            await reloadBoardLook();
            return layer()?.refresh();
        },
        setScrap,
        setLink,
        // (a board patch written in its turn, one edit to undo; a function of
        // the board, made then: Luke 2026-10-26, for macros)
        patch: applyBoardPatch,
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
