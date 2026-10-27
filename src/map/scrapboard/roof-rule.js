// Who may see through a roof, and the reach of a door (Luke, 2026-10-27: "players must have an owned token near a door to open it even if it is visible
// from across the map; they must also have a token inside the bounds of a roof
// in order to see through it: if the token is selected the roof is gone, and if
// the roof is hovered over it goes away, but only when their token is inside
// that building"). Pure, no Foundry globals: backdrop.js and pieces-draw.js
// carry the decisions out, door-rule.js (hooks) asks the door question.

// how faint a roof goes under the pointer (backdrop.js ROOF_FADE is the same)
const FADE = 0.12;

// A roof's alpha for this viewer. The GM keeps the hover fade anywhere. A
// player's roof stays shut (1) unless one of their tokens is inside it: then a
// controlled token inside lifts it (0), else the pointer over it fades it.
// `inside`: an owned token's centre is under this roof; `lifted`: one of those
// is controlled; `hovered`: the pointer is over this roof.
export function roofAlpha({ isGM = false, inside = false, lifted = false, hovered = false, fade = FADE } = {}) {
    if (isGM) return hovered ? fade : 1;
    if (!inside) return 1;
    if (lifted) return 0;
    return hovered ? fade : 1;
}

// Which roofs a player's tokens are inside, and which of those a controlled
// token lifts. `tokens`: [{ id, x, y }] (owned, in the roofs' own space);
// `controlled`: ids selected; `roofsAt(x, y)`: the roof ids under a point.
// Returns { inside: Set, lifted: Set } of roof ids.
export function roofsOpened(tokens, controlled, roofsAt) {
    const inside = new Set();
    const lifted = new Set();
    const ctl = controlled instanceof Set ? controlled : new Set(controlled ?? []);
    for (const t of tokens ?? []) {
        for (const id of roofsAt(t.x, t.y)) {
            inside.add(id);
            if (ctl.has(t.id)) lifted.add(id);
        }
    }
    return { inside, lifted };
}

// The distance from a point to the nearest point of a segment `c`
// ([x0, y0, x1, y1])
export function distToSegment(p, c) {
    const [x0, y0, x1, y1] = c;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / len2)) : 0;
    return Math.hypot(p.x - (x0 + t * dx), p.y - (y0 + t * dy));
}

// whether any token (centres: [{ x, y }]) is within `reach` of the door's wall
export function doorInReach(tokens, c, reach) {
    return (tokens ?? []).some((t) => distToSegment(t, c) <= reach);
}
