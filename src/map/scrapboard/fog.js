// The NPC fog on a board with a baked map (Luke, 2026-10-25: token vision
// off; the players see the whole map, as they know the village, but not an
// NPC farther than the GM's distance from every one of their tokens, nor one
// under a roof still on). The rule is baked.js's fogHides; here, Foundry's
// tokens follow it: the token class extended in init, and every token looked
// at again when a token moves, comes, or goes, when a roof or the distance
// changes (backdrop.js calls refreshFog), when the scene darkens, and when a
// light changes. The GM sees everything, but in Player view sees what the
// players see; every other scene is untouched.
//
// (Luke, 2026-10-26, the GM's own controls over it: an NPC marked "always
// seen" on its token's HUD is never hidden; Foundry's darkness shortens the
// distance, and an NPC standing in a lit light is seen from the whole of it
// (Map layers sets both); a player's token being dragged moves the fog with
// it, not only where it is let go)
import { fogHides, fogDistance, unitPx, metrePx } from './baked.js';

const loc = (key) => game.i18n.localize(key);

// a point in scene px from the scene's top-left
const fromScene = (p) => {
    const d = canvas.dimensions;
    return { x: p.x - d.sceneX, y: p.y - d.sceneY };
};
// whether a token is a player's (its actor has a player owner)
const theirs = (t) => Boolean(t.actor?.hasPlayerOwner);
// whether this client sees the fog: a player, or the GM in Player view
const fogged = () => !game.user.isGM || Boolean(canvas.heartBoard?.preview);
// the scene's darkness, 0 to 1 (Foundry's)
const darknessOf = (scene) => Number(scene?.environment?.darknessLevel ?? scene?.darkness ?? 0) || 0;

// the players' tokens' centres, found once a pass (Plenty has some 430
// tokens: never every token against every other); a token being dragged
// counts where its preview is
let party = null;
function partyNow() {
    if (party) return party;
    const previews = new Map((canvas.tokens?.preview?.children ?? []).filter((c) => c.isPreview).map((c) => [c.id, c]));
    party = (canvas.tokens?.placeables ?? []).filter(theirs).map((t) => fromScene((previews.get(t.id) ?? t).center));
    return party;
}

// the lit lights, their centres and dim radii in scene px, found once a pass
let lights = null;
function lightsNow() {
    if (lights) return lights;
    // (a light's reach is Foundry's, in the scene's own units)
    const ppu = unitPx(canvas.scene);
    lights =(canvas.lighting?.placeables ?? []).filter((l) => !l.document.hidden && Number(l.document.config?.dim) > 0).map((l) => ({ ...fromScene({ x: l.document.x, y: l.document.y }), r: Number(l.document.config.dim) * ppu }));
    return lights;
}
// whether a point stands in a lit light, a light of its own included
function inLight(token, at) {
    if (Number(token.document.light?.dim) > 0) return true;
    return lightsNow().some((l) => Math.hypot(l.x - at.x, l.y - at.y) <= l.r);
}

// Whether the fog keeps this client from seeing a token
export function hiddenByFog(token) {
    if (!fogged()) return false;
    const b = canvas.heartBoard?.backdrop;
    if (!b?.on || theirs(token) || token.isPreview) return false;
    const at = fromScene(token.center);
    const flags = b.flags ?? {};
    const units = fogDistance(flags, { darkness: darknessOf(canvas.scene), inLight: (Number(flags.fog) || 0) > 0 && inLight(token, at) });
    // (the distance kept in metres, whatever the scene measures in)
    return fogHides({ npc: true, at, party: partyNow(), dist: units * metrePx(canvas.scene), underRoof: b.underRoof(at.x, at.y), seen: Boolean(token.document.flags?.heart?.fogSeen) });
}

// every token's visibility looked at again (the party and lights found afresh)
export function refreshFog() {
    party = null;
    lights = null;
    if (!fogged()) return;
    for (const t of canvas.tokens?.placeables ?? []) t.renderFlags?.set({ refreshVisibility: true });
}

// the GM's: the fog shown or not as Player view comes and goes
export function refreshFogAll() {
    party = null;
    lights = null;
    for (const t of canvas.tokens?.placeables ?? []) t.renderFlags?.set({ refreshVisibility: true });
}

// init: the token class extended, the HUD's switch, and the hooks that move the fog
export function registerBoardFog() {
    const Base = CONFIG.Token.objectClass;
    class HeartBoardToken extends Base {
        get isVisible() {
            return super.isVisible && !hiddenByFog(this);
        }
    }
    CONFIG.Token.objectClass = HeartBoardToken;
    const again = () => {
        if (canvas.heartBoard?.backdrop?.on) refreshFog();
    };
    Hooks.on('updateToken', (doc, changes) => {
        if ('x' in changes || 'y' in changes || 'width' in changes || 'height' in changes || 'light' in changes || foundry.utils.hasProperty(changes, 'flags.heart.fogSeen')) again();
    });
    Hooks.on('createToken', again);
    Hooks.on('deleteToken', again);
    // (a player's token dragged: the fog follows it, a frame at most)
    let frame = 0;
    Hooks.on('refreshToken', (token, flags) => {
        if (!flags?.refreshPosition || !token.isPreview || !theirs(token) || frame || !canvas.heartBoard?.backdrop?.on) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            refreshFog();
        });
    });
    // (the dark and the lights)
    Hooks.on('updateScene', (scene, changes) => {
        if (scene.id === canvas.scene?.id && (foundry.utils.hasProperty(changes, 'environment.darknessLevel') || 'darkness' in changes)) again();
    });
    for (const h of ['createAmbientLight', 'updateAmbientLight', 'deleteAmbientLight']) Hooks.on(h, again);
    Hooks.on('canvasReady', () => {
        party = null;
        lights = null;
    });
    // (the GM's switch on an NPC's HUD: always seen by players, or the fog's)
    Hooks.on('renderTokenHUD', (hud, html) => {
        const token = hud.object;
        if (!game.user.isGM || !canvas.heartBoard?.backdrop?.on || theirs(token)) return;
        const root = html?.[0] ?? html;
        const col = root?.querySelector?.('.col.right');
        if (!col) return;
        const seen = Boolean(token.document.flags?.heart?.fogSeen);
        const el = document.createElement('div');
        el.className = `control-icon heart-fog-seen ${seen ? 'active' : ''}`;
        el.dataset.tooltip = loc(seen ? 'heart.board.fog-seen-on' : 'heart.board.fog-seen-off');
        el.innerHTML = `<i class="fa-solid ${seen ? 'fa-eye' : 'fa-eye-low-vision'}"></i>`;
        el.addEventListener('click', async (ev) => {
            ev.preventDefault();
            await token.document.update({ 'flags.heart.fogSeen': !seen });
            hud.render();
        });
        col.append(el);
    });
}
