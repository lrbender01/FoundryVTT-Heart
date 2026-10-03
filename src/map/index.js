// The Heart map (2026-10-02, monorepo docs/plans/heart-map.md). Picked up by
// the './**/index.js' module glob in src/index.js, which calls initialise()
// at init. A map scene (flags.heart.map) draws the descent from
// fvtt-heart-content's layout plus the scene's own state; the delvers'
// tokens travel on it. game.heart.map is the API (create the scene, reveal,
// link, ...); the GM's tools are the Heart Map scene control (layer.js).
import './map.sass';
import { HeartMapLayer, mapControls } from './layer';
import { loadMapLayout, reloadMapLayout } from './layout';
import {
    isMapScene, mapState, createMapScene, setMapScene, setNodeState, setLinkState, setNode, addNode, addLink,
    removeNode, removeLink, placeNode, worldCopy, sceneView,
} from './api';
import { libraryKeyFor } from './model';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const REDRAW_ACTORS = new Set(['landmark', 'delve']);

const layer = () => canvas?.heartMap;
const onMap = () => Boolean(canvas?.ready && isMapScene(canvas.scene));

// A landmark dropped on the map is placed where it fell, hidden until the
// GM reveals it (the map starts empty; Luke places landmarks himself,
// 2026-10-02). A book landmark (from the compendium, or a world copy of
// one) takes its library entry's art framing, and a world copy is pinned
// to it; dropping one already on the map moves it there. Any other landmark
// becomes one of the GM's own. Never a token.
function onDrop(_canvas, data) {
    if (!onMap() || data?.type !== 'Actor' || !game.user.isGM) return;
    const doc = data.uuid ? fromUuidSync(data.uuid, { strict: false }) : null;
    if (doc?.type !== 'landmark') return;
    (async () => {
        const scene = canvas.scene;
        const { layout } = await sceneView(scene, 'gm');
        const at = layer()?.renderer.toMap({ x: data.x, y: data.y }) ?? { x: data.x, y: data.y };
        const source = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
        const key = libraryKeyFor(layout, { uuid: doc.uuid, source, name: doc.name });
        if (key) {
            const was = mapState(scene).nodes?.[key];
            const actor = doc.pack ? (was?.actor ?? null) : doc.uuid;
            await placeNode(scene, key, { x: at.x, y: at.y, state: was?.state ?? 'hidden', actor });
            if (!was) ui.notifications.info(loc('heart.map.placed', { name: doc.name }));
            return;
        }
        // the GM's own landmark: dropped again, it moves
        const own = Object.entries(mapState(scene).nodes ?? {}).find(([, n]) => n?.uuid === doc.uuid);
        if (own) return setNode(scene, own[0], { x: Math.round(at.x), y: Math.round(at.y) });
        await addNode(scene, { uuid: doc.uuid, name: doc.name, x: at.x, y: at.y });
        ui.notifications.info(loc('heart.map.placed', { name: doc.name }));
    })();
    return false;
}

function registerHooks() {
    Hooks.on('getSceneControlButtons', mapControls);

    Hooks.on('canvasReady', () => {
        layer()?.refresh();
        // the Heart Map control shows on map scenes only
        ui.controls?.initialize();
    });

    Hooks.on('updateScene', (scene, changes) => {
        if (scene.id !== canvas?.scene?.id || !foundry.utils.hasProperty(changes, 'flags.heart')) return;
        layer()?.queueRefresh();
        ui.controls?.initialize();
    });

    for (const hook of ['createActor', 'updateActor', 'deleteActor']) {
        Hooks.on(hook, (actor) => {
            if (REDRAW_ACTORS.has(actor.type) && onMap()) layer()?.queueRefresh();
        });
    }

    Hooks.on('dropCanvasData', onDrop);

    // the Scenes sidebar: Create Heart Map (GM)
    Hooks.on('renderSceneDirectory', (app, html) => {
        if (!game.user.isGM) return;
        const root = html instanceof HTMLElement ? html : html[0];
        const actions = root?.querySelector('.header-actions');
        if (!actions || actions.querySelector('.heart-map-create')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'heart-map-create';
        button.innerHTML = `<i class="fa-solid fa-stairs"></i> ${Handlebars.escapeExpression(loc('heart.map.create'))}`;
        button.addEventListener('click', () => createMapScene());
        actions.append(button);
    });

    Hooks.on('getSceneDirectoryEntryContext', (_html, options) => {
        const sceneOf = (li) => game.scenes.get(li.data('documentId') ?? li.data('entityId'));
        options.push({
            name: 'heart.map.make-map',
            icon: '<i class="fa-solid fa-stairs"></i>',
            condition: li => game.user.isGM && !isMapScene(sceneOf(li)),
            callback: li => setMapScene(sceneOf(li), true),
        }, {
            name: 'heart.map.unmake-map',
            icon: '<i class="fa-solid fa-stairs"></i>',
            condition: li => game.user.isGM && isMapScene(sceneOf(li)),
            callback: li => setMapScene(sceneOf(li), false),
        });
    });
}

registerHooks();

export function initialise() {
    CONFIG.Canvas.layers.heartMap = { layerClass: HeartMapLayer, group: 'interface' };
    game.heart.map = {
        create: createMapScene,
        setMapScene,
        isMapScene,
        state: mapState,
        layout: loadMapLayout,
        reload: async () => {
            await reloadMapLayout();
            return layer()?.refresh();
        },
        setNodeState,
        setLinkState,
        setNode,
        addNode,
        addLink,
        removeNode,
        removeLink,
        placeNode,
        worldCopy,
        // the GM sees the map as players do (also the Player view tool)
        preview: (on = true) => layer()?.setPreview(on),
    };
}
