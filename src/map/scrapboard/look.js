// The scrapboard map's look in Foundry (2026-10-02; the fork's CLAUDE.md "The
// Heart map"): fvtt-heart-content ships it as
// assets/art/map/heart-board.json, exported from the Heart Map Board mock
// (the primary map editor; the look is edited there only). Read once and
// kept: the look (normalized by model.js), the landmark library, the pools,
// and every texture's size, solid region, tone, and path in the module.
import { normalizeLook } from './model.js';

export const CONTENT = 'fvtt-heart-content';
const FILE = `modules/${CONTENT}/assets/art/map/heart-board.json`;
// The board styles (Luke, 2026-10-25): each a whole look (the sheet, its
// light and grime, the cards' papers, pins, ropes, and paints), chosen per
// scene (flags.heart.boardStyle, the Board tab of its settings). Listed in
// the content module's styles.json, { styles: [{ id, name, file }] } (`file`
// within the module, or a Foundry data path); without it, Heart's alone.
// Every style's textures are the content module's.
export const DEFAULT_STYLE = 'heart';
const STYLES = `modules/${CONTENT}/assets/art/map/styles.json`;
const HEART = { id: DEFAULT_STYLE, name: 'Heart', file: FILE };
// small previews of the textures and art (fvtt-heart-content's
// tools/map_previews.py): the board shows with them at once on a slow
// connection, each replaced as its whole image comes (Luke, 2026-10-03)
const PREVIEWS = `modules/${CONTENT}/assets/art/_previews/index.json`;
const looks = new Map();
let styles = null;

// the styles there are: [{ id, name, file }], Heart's first
export function boardStyles() {
    styles ??= (async () => {
        const out = [HEART];
        if (!game.modules?.get(CONTENT)?.active) return out;
        try {
            const res = await fetch(foundry.utils.getRoute(STYLES), { cache: 'no-cache' });
            // (none shipped: Heart's alone, and that is the answer)
            if (res.status === 404) return out;
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const j = await res.json();
            for (const s of Array.isArray(j?.styles) ? j.styles : []) {
                const id = String(s?.id ?? '').trim();
                // (a file within the data folders: never up out of them)
                if (!/^[\w-]{1,40}$/.test(id) || !s.file || typeof s.file !== 'string' || s.file.split(/[\\/]/).includes('..')) continue;
                const file = /^(modules|worlds|systems)\//.test(s.file) ? s.file : `modules/${CONTENT}/${s.file.replace(/^\/+/, '')}`;
                const st = { id, name: String(s.name ?? id).slice(0, 80), file };
                const at = out.findIndex((x) => x.id === id);
                if (at >= 0) out[at] = st;
                else out.push(st);
            }
        } catch (err) {
            // (the list there but unread: Heart's alone for now, asked for
            // again next time; Luke 2026-10-25, a failure was kept all session)
            console.warn('heart | the board styles could not be read', err);
            styles = null;
        }
        return out;
    })();
    return styles;
}

// the style a scene's board is drawn in
export const styleOf = (scene) => String(scene?.flags?.heart?.boardStyle || DEFAULT_STYLE);

// { look, textures, ok, style } for a scene's style, or a style by its id
// (default: the scene viewed). ok: false without the module or its file; the
// map then draws an empty default sheet.
export function loadBoardLook(src = globalThis.canvas?.scene) {
    const id = typeof src === 'string' ? src : styleOf(src);
    if (!looks.has(id)) {
        const p = readLook(id);
        looks.set(id, p);
        // (a look that failed to come is asked for again next time, never
        // kept: Luke 2026-10-25, one failed fetch left a player on the bare
        // default sheet until they reloaded)
        p.then((r) => {
            if (r.failed && looks.get(id) === p) looks.delete(id);
        });
    }
    return looks.get(id);
}

async function readLook(id) {
    const empty = { look: normalizeLook({}), textures: {}, ok: false, style: id };
    if (!game.modules?.get(CONTENT)?.active) return empty;
    const list = await boardStyles();
    // (a style gone from the list: Heart's)
    const style = list.find((s) => s.id === id) ?? list[0];
    try {
        const res = await fetch(foundry.utils.getRoute(style.file), { cache: 'no-cache' });
        if (!res.ok) {
            console.warn('heart | the map look could not be read', style.file, res.status);
            return { ...empty, failed: true };
        }
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
        return { look, textures, ok: true, style: style.id };
    } catch (err) {
        console.warn('heart | the map look could not be read', style.file, err);
        return { ...empty, failed: true };
    }
}

// Forget the cached looks and styles (after a new export from the mock)
export function reloadBoardLook(src) {
    looks.clear();
    styles = null;
    return loadBoardLook(src);
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
