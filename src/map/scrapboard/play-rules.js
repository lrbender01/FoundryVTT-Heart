// The hooks of two play rules on a board scene (Luke, 2026-10-27; the rules
// are roof-rule.js's, the drawing backdrop.js's and pieces-draw.js's):
//
// Roofs open from inside only: a player's roofs look again whenever a token
// comes, goes, moves, or is selected or let go, and when the canvas is ready.
//
// Doors need a token nearby: a player's click on a door (a change to the wall's
// `ds`) goes through only with a token they own within a square and a half of
// the door. The GM is never limited; a locked door stays Foundry's. Only
// scenes with a board or a baked map are held to it, so every other scene's
// doors are as they were.
import { doorInReach } from './roof-rule.js';
import { refreshFog } from './fog.js';

// (squares)
export const DOOR_REACH = 1.5;

const loc = (key) => game.i18n.localize(key);

const onBoard = (scene) => Boolean(scene?.flags?.heart?.baked || scene?.flags?.heart?.board);

// every roof drawing looked at again (the baked map's and the pieces')
function roofsAgain() {
    const layer = canvas.heartBoard;
    if (!layer || !canvas.ready) return;
    layer.backdrop?.retarget();
    layer.pieces?.retarget();
    // (a lifted roof stops hiding NPCs: the fog looked at again)
    if (layer.backdrop?.on) refreshFog();
}

export function registerPlayRules() {
    for (const h of ['controlToken', 'createToken', 'deleteToken']) Hooks.on(h, roofsAgain);
    Hooks.on('updateToken', (doc, changes) => {
        if ('x' in changes || 'y' in changes || 'width' in changes || 'height' in changes || 'ownership' in changes) roofsAgain();
    });
    Hooks.on('canvasReady', roofsAgain);

    // (on the clicking client only: false stops the update before it is sent)
    Hooks.on('preUpdateWall', (wall, changes, options, userId) => {
        if (userId !== game.user.id || game.user.isGM || !('ds' in changes)) return;
        if (!onBoard(wall.parent) || wall.parent !== canvas.scene || !canvas.ready) return;
        const tokens = (canvas.tokens?.placeables ?? []).filter((t) => t.isOwner).map((t) => t.center);
        if (doorInReach(tokens, wall.c, DOOR_REACH * canvas.grid.size)) return;
        ui.notifications.warn(loc('heart.board.door-too-far'));
        return false;
    });
}
