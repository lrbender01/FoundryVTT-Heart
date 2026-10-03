// The Heart map's document half (2026-10-02): which scenes are map scenes,
// the GM's edits to a scene's state (flags.heart.map), and the lookups the
// pure model (model.js) takes. Every write is the GM's: players only see
// the map, so no relay is needed (a scene's flags are GM-write anyway).
import { buildMap, viewFor, customKey, hasLink, MAP_FLAG, STATES } from './model';
import { loadMapLayout, hasBookLayout } from './layout';

const STATE_PATH = `flags.heart.${MAP_FLAG}`;

export function isMapScene(scene) {
    return Boolean(scene?.flags?.heart?.[MAP_FLAG]);
}

export function mapState(scene) {
    return scene?.flags?.heart?.[MAP_FLAG] ?? {};
}

// The world's own copy of a book landmark: an actor imported from that
// compendium entry (or, for copies made before Foundry recorded sources, a
// landmark of the same name)
export function worldCopy(bookUuid, name) {
    if (!bookUuid) return null;
    const landmarks = game.actors?.filter(a => a.type === 'landmark') ?? [];
    return landmarks.find(a => (a._stats?.compendiumSource ?? a.flags?.core?.sourceId) === bookUuid)
        ?? (name ? landmarks.find(a => a.name === name) : null)
        ?? null;
}

// A uuid as the model needs it: a name, and for a delve its resistance
export function resolveUuid(uuid) {
    const doc = fromUuidSync(uuid, { strict: false });
    if (!doc) return null;
    if (doc.type === 'delve') {
        return { name: doc.name, resistance: Number(doc.system?.resistance ?? 0), max: Number(doc.system?.resistanceMax ?? 0) };
    }
    return { name: doc.name };
}

// The document a node stands for: the pinned or world copy first, else the
// book's compendium entry (an index entry, which carries the art flag)
export function nodeDoc(node) {
    if (!node) return null;
    if (node.uuid && node.uuid !== node.bookUuid) return fromUuidSync(node.uuid, { strict: false });
    return worldCopy(node.bookUuid, node.name) ?? fromUuidSync(node.uuid, { strict: false });
}

// The map a viewer sees on a scene: 'gm' or 'player'
export async function sceneView(scene, viewer) {
    const layout = await loadMapLayout();
    const map = buildMap(layout, mapState(scene), resolveUuid);
    // a world copy found by its source names the node too
    for (const n of Object.values(map.nodes)) {
        const doc = !n.custom && n.uuid === n.bookUuid ? worldCopy(n.bookUuid, n.name) : null;
        if (doc) n.name = doc.name;
    }
    return { layout, map, view: viewFor(map, viewer) };
}

/* -------------------------------------------- */
/*  The GM's edits                              */
/* -------------------------------------------- */

const gmOnly = () => {
    if (game.user.isGM) return true;
    ui.notifications.warn(game.i18n.localize('heart.map.gm-only'));
    return false;
};

const update = (scene, data) => scene.update(data, { heartMap: true });

export async function setNode(scene, key, patch) {
    if (!gmOnly() || !scene || !key) return;
    return update(scene, { [`${STATE_PATH}.nodes.${key}`]: patch });
}

export async function setLink(scene, id, patch) {
    if (!gmOnly() || !scene || !id) return;
    return update(scene, { [`${STATE_PATH}.links.${id}`]: patch });
}

export async function setNodeState(scene, key, state) {
    if (!STATES.includes(state)) return;
    return setNode(scene, key, { state });
}

export async function setLinkState(scene, id, state) {
    if (!STATES.includes(state)) return;
    return setLink(scene, id, { state });
}

// Put a book landmark on the map (its library key), or move it there.
// Placed hidden by default: the GM reveals it (Luke's map starts empty and
// grows as the delvers go, 2026-10-02).
export async function placeNode(scene, key, { x, y, state = 'hidden', actor = null }) {
    if (!gmOnly() || !scene || !key) return null;
    const data = { x: Math.round(x), y: Math.round(y), state };
    if (actor) data.actor = actor;
    await update(scene, { [`${STATE_PATH}.nodes.${key}`]: data });
    return key;
}

// A landmark of the GM's own (one the book's library doesn't have)
export async function addNode(scene, { uuid, name, x, y, state = 'hidden' }) {
    if (!gmOnly() || !scene || !uuid) return null;
    const key = customKey('c', mapState(scene).nodes ?? {});
    await update(scene, { [`${STATE_PATH}.nodes.${key}`]: { uuid, name: name ?? '', x: Math.round(x), y: Math.round(y), state } });
    return key;
}

export async function addLink(scene, { a, b, kind = 'delve', delve = null, state = 'known' }) {
    if (!gmOnly() || !scene || !a || !b || a === b) return null;
    const { map } = await sceneView(scene, 'gm');
    if (hasLink(map, a, b)) {
        ui.notifications.warn(game.i18n.localize('heart.map.already-linked'));
        return null;
    }
    const id = customKey('c', mapState(scene).links ?? {});
    await update(scene, { [`${STATE_PATH}.links.${id}`]: { a, b, kind, delve, state, bend: 0 } });
    return id;
}

// Take a landmark off the map (a book one can be placed again; the GM's
// own is gone from the map, its actor kept), with every link to it
export async function removeNode(scene, key) {
    if (!gmOnly() || !scene) return;
    const state = mapState(scene);
    if (!state.nodes?.[key]) return;
    const data = { [`${STATE_PATH}.nodes.-=${key}`]: null };
    for (const [id, l] of Object.entries(state.links ?? {})) {
        if (l?.a === key || l?.b === key) data[`${STATE_PATH}.links.-=${id}`] = null;
    }
    return update(scene, data);
}

export async function removeLink(scene, id) {
    if (!gmOnly() || !scene) return;
    if (!mapState(scene).links?.[id]?.a) return;
    return update(scene, { [`${STATE_PATH}.links.-=${id}`]: null });
}

/* -------------------------------------------- */
/*  The scene                                   */
/* -------------------------------------------- */

// Make the map scene, sized to the layout, and view it. Gridless; tokens
// see everything (the map is a picture, not a dungeon).
export async function createMapScene({ name } = {}) {
    if (!gmOnly()) return null;
    const layout = await loadMapLayout();
    if (!hasBookLayout(layout)) ui.notifications.warn(game.i18n.localize('heart.map.no-layout'));
    const scene = await Scene.create({
        name: name ?? game.i18n.localize('heart.map.scene-name'),
        width: layout.w,
        height: layout.h,
        padding: 0.05,
        backgroundColor: '#140d0b',
        grid: { type: CONST.GRID_TYPES.GRIDLESS, size: 150 },
        tokenVision: false,
        fog: { exploration: false },
        navigation: true,
        flags: { heart: { [MAP_FLAG]: { nodes: {}, links: {} } } },
    });
    await scene?.view();
    return scene;
}

// Turn an existing scene into a map scene (or back)
export async function setMapScene(scene, on = true) {
    if (!gmOnly() || !scene) return;
    if (on) return scene.update({ [STATE_PATH]: mapState(scene).nodes ? mapState(scene) : { nodes: {}, links: {} } });
    return scene.update({ 'flags.heart.-=map': null });
}
