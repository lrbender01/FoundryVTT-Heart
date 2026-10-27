// Session scripting (Luke, 2026-10-27): a GM-only group of tools on the top
// toolbar, for running the session as it goes. It is a scene control on every
// scene and, on a board scene, a group on the board's rail (map/scrapboard/
// rail.js). It is meant to grow (the timeline joins it): to add a button, add
// one line to SESSION_TOOLS.
import { sendView, onView } from './relay.js';
import { pullDuration } from './pull-view.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export const SESSION_CONTROL = 'heartSession';

// A scene's view as this client has it: the scene point at the centre, and the zoom
function viewOf() {
    const v = canvas?.scene?._viewPosition;
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y, scale: v.scale > 0 ? v.scale : 1 };
    return { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, scale: canvas.stage.scale.x || 1 };
}

// Pull views to mine: every player on this scene slides to this view
export function pullViews() {
    if (!game.user?.isGM || !canvas?.ready) return;
    const scene = canvas.scene;
    const at = viewOf();
    const here = game.users.filter((u) => u.active && !u.isGM && u.viewedScene === scene.id).length;
    if (!here) return ui.notifications.info(loc('heart.session.pull-none'));
    sendView({ what: 'pull', sceneId: scene.id, ...at });
    ui.notifications.info(loc('heart.session.pull-sent', { n: here }));
}

// A pull heard on a player's client (the relay passes only a GM's): this view
// slides there, through the player's own sight, unless they are on another scene
export function followPull(msg) {
    if (msg?.what !== 'pull' || !canvas?.ready || canvas.scene?.id !== msg.sceneId) return;
    if (![msg.x, msg.y, msg.scale].every(Number.isFinite) || msg.scale <= 0) return;
    const to = { x: msg.x, y: msg.y, scale: msg.scale };
    const duration = pullDuration(viewOf(), to, { w: canvas.app.screen.width, h: canvas.app.screen.height });
    canvas.animatePan({ ...to, duration });
}

// the group's buttons: name, icon, lang key of the title, what it does
export const SESSION_TOOLS = [
    { name: 'pull-views', icon: 'fa-solid fa-people-pulling', title: 'heart.session.pull', run: pullViews },
];

// The scene control (GM only, every scene). Button tools, never toggles.
export function sessionControls(controls) {
    if (!game.user?.isGM) return;
    controls.push({
        name: SESSION_CONTROL,
        title: loc('heart.session.control'),
        icon: 'fa-solid fa-clapperboard',
        layer: 'tokens',
        visible: true,
        activeTool: '',
        tools: SESSION_TOOLS.map((t) => ({ name: t.name, title: loc(t.title), icon: t.icon, button: true, onClick: t.run })),
    });
}

export function registerSessionTools() {
    onView(followPull);
}
