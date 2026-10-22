// The scrapboard map's look in Foundry (2026-10-02; the fork's CLAUDE.md "The
// Heart map"): fvtt-heart-content ships it as
// assets/art/map/heart-board.json, exported from the Heart Map Board mock
// (the primary map editor; the look is edited there only). Read once and
// kept: the look (normalized by model.js), the landmark library, the pools,
// and every texture's size, solid region, tone, and path in the module.
import { normalizeLook } from './model.js';

export const CONTENT = 'fvtt-heart-content';
const FILE = `modules/${CONTENT}/assets/art/map/heart-board.json`;
// small previews of the textures and art (fvtt-heart-content's
// tools/map_previews.py): the board shows with them at once on a slow
// connection, each replaced as its whole image comes (Luke, 2026-10-03)
const PREVIEWS = `modules/${CONTENT}/assets/art/_previews/index.json`;
let loading = null;

// { look, textures, ok } (ok: false without the module or its file; the
// map then draws an empty default sheet)
export function loadBoardLook() {
    loading ??= (async () => {
        const empty = { look: normalizeLook({}), textures: {}, ok: false };
        if (!game.modules?.get(CONTENT)?.active) return empty;
        try {
            const res = await fetch(foundry.utils.getRoute(FILE), { cache: 'no-cache' });
            if (!res.ok) return empty;
            const j = await res.json();
            const look = normalizeLook({ ...(j.look ?? {}), library: j.library ?? {}, pools: j.pools ?? {} });
            const textures = j.textures ?? {};
            // (which paths have a preview; none, without the previews built)
            try {
                const pv = await fetch(foundry.utils.getRoute(PREVIEWS), { cache: 'no-cache' });
                const have = new Set(pv.ok ? (await pv.json()).paths ?? [] : []);
                for (const t of Object.values(textures)) if (t?.path && have.has(t.path)) t.preview = `assets/art/_previews/${t.path}`;
            } catch {
                // (no previews: whole images only)
            }
            return { look, textures, ok: true };
        } catch (err) {
            console.warn('heart | the map look could not be read', err);
            return empty;
        }
    })();
    return loading;
}

// Forget the cached look (after a new export from the mock)
export function reloadBoardLook() {
    loading = null;
    return loadBoardLook();
}

// A texture or art id's url in the module (null if the look doesn't ship it)
export function textureUrl(textures, id) {
    const t = textures[id];
    return t?.path ? foundry.utils.getRoute(`modules/${CONTENT}/${t.path}`) : null;
}

// Its small preview's url (null when it has none)
export function previewUrl(textures, id) {
    const t = textures[id];
    return t?.preview ? foundry.utils.getRoute(`modules/${CONTENT}/${t.preview}`) : null;
}
