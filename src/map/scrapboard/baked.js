// Baked backgrounds (2026-10-25; Luke: the Village of Plenty, and any board
// on a baked map). A bake paints a map once into a tile pyramid and writes a
// manifest (format 'heart-board-tiles', version 1: monorepo
// docs/plans/plenty-requests.md); the board draws those tiles as its
// background, under its own live drawing, and stores none of the map's
// strokes. Here: the manifest checked and made whole, the level a zoom
// needs, the tiles a view needs, the tiles loaded kept within a memory
// budget, the overlays and roofs shown or not, and the NPC fog's rule.
// Plain: no Foundry, no PIXI (backdrop.js draws it). Design: monorepo
// docs/plans/board-baked-backgrounds.md.

export const BAKED_FORMAT = 'heart-board-tiles';
export const BAKED_VERSION = 1;

const finite = (v) => Number.isFinite(Number(v));
const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(v);
// a path inside the manifest's own folder: no way out of it, no scheme, no
// leading slash
const pathOk = (p) => typeof p === 'string' && p.length <= 300 && !/(^|\/)\.\.(\/|$)/.test(p) && !/^[a-z]+:|^\//i.test(p) && !p.includes('\\');
const rectOf = (r) => {
    if (!Array.isArray(r) || r.length !== 4 || !r.every(finite)) return null;
    const [x0, y0, x1, y1] = r.map(Number);
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
};

// A manifest's levels, coarse to fine: each { pxPerUnit, path } with the
// path holding {x} and {y}; one per pxPerUnit. Empty when none is good.
function levelsOf(list) {
    const out = [];
    for (const L of Array.isArray(list) ? list : []) {
        const ppu = Number(L?.pxPerUnit);
        if (!(ppu > 0) || !pathOk(L?.path) || !L.path.includes('{x}') || !L.path.includes('{y}')) continue;
        if (out.some((o) => o.pxPerUnit === ppu)) continue;
        out.push({ pxPerUnit: ppu, path: L.path });
    }
    return out.sort((a, b) => a.pxPerUnit - b.pxPerUnit);
}

// The manifest a bake wrote, checked and made whole, or null. `base`: the
// URL of its folder (ending '/'); every path is joined to it, with ?v=<rev>
// so a new bake is never shown from a browser's old copy.
export function cleanManifest(j, base = '') {
    if (!j || typeof j !== 'object' || j.format !== BAKED_FORMAT || Number(j.version) !== BAKED_VERSION) return null;
    const rev = typeof j.rev === 'string' ? j.rev.trim().slice(0, 64) : '';
    const size = Array.isArray(j.size) && j.size.length === 2 && j.size.every((v) => Number(v) > 0) ? { w: Number(j.size[0]), h: Number(j.size[1]) } : null;
    const tilePx = Math.round(Number(j.tilePx));
    const levels = levelsOf(j.levels);
    if (!rev || !size || !(tilePx >= 64 && tilePx <= 4096) || !levels.length) return null;
    const folder = base && !base.endsWith('/') ? `${base}/` : base;
    const url = (p) => `${folder}${p}${p.includes('?') ? '&' : '?'}v=${encodeURIComponent(rev)}`;
    const withUrls = (L) => L.map((l) => ({ ...l, url: url(l.path) }));
    const overlays = [];
    for (const o of Array.isArray(j.overlays) ? j.overlays : []) {
        const rect = rectOf(o?.rect);
        const ol = levelsOf(o?.levels);
        if (!idOk(o?.id) || !rect || !ol.length || overlays.some((x) => x.id === o.id)) continue;
        overlays.push({ id: o.id, name: String(o.name ?? o.id).slice(0, 120), audience: o.audience === 'gm' ? 'gm' : 'all', shown: o.shown !== false, under: o.under === 'pieces' ? 'pieces' : null, rect, levels: withUrls(ol) });
    }
    const roofs = [];
    for (const r of Array.isArray(j.roofs) ? j.roofs : []) {
        if (!idOk(r?.id) || roofs.some((x) => x.id === r.id)) continue;
        // (one image, or parts that come off one at a time: the art session's
        // addition 5)
        const list = Array.isArray(r.parts) && r.parts.length ? r.parts : [{ id: r.id, rect: r.rect, image: r.image }];
        const parts = [];
        for (const p of list) {
            const rect = rectOf(p?.rect);
            if (!idOk(p?.id) || !rect || !pathOk(p?.image) || parts.some((x) => x.id === p.id)) continue;
            parts.push({ id: p.id, rect, image: url(p.image) });
        }
        if (parts.length) roofs.push({ id: r.id, name: String(r.name ?? r.id).slice(0, 120), building: typeof r.building === 'string' ? r.building.slice(0, 120) : null, parts });
    }
    return {
        id: idOk(j.id) ? j.id : 'baked',
        name: String(j.name ?? j.id ?? '').slice(0, 120),
        rev,
        unit: typeof j.unit === 'string' ? j.unit.slice(0, 12) : 'm',
        size,
        tilePx,
        levels: withUrls(levels),
        overview: pathOk(j.overview) ? url(j.overview) : null,
        overlays,
        roofs,
    };
}

// A level's tile's URL
export const tileUrl = (level, x, y) => level.url.replace('{x}', String(x)).replace('{y}', String(y));

// The level a zoom needs: the coarsest at least as fine as `need` (bitmap px
// per unit on the screen), else the finest there is
export function levelFor(levels, need) {
    for (const L of levels ?? []) if (L.pxPerUnit >= need) return L;
    return levels?.[levels.length - 1] ?? null;
}

// How many tiles a level has across and down, over an area `size` units
export const tileGrid = (level, tilePx, size) => ({ cols: Math.max(1, Math.ceil((size.w * level.pxPerUnit) / tilePx)), rows: Math.max(1, Math.ceil((size.h * level.pxPerUnit) / tilePx)) });

// The tiles of a level a view needs (`view`: units { x0, y0, x1, y1 }, and
// `margin` units round it), over an area at `origin` (units) `size` units
// big: each { x, y, rect } (its units, cropped to the area's edge), nearest
// the view's middle first
export function tilesIn(level, tilePx, view, size, { margin = 0, origin = { x: 0, y: 0 } } = {}) {
    const tu = tilePx / level.pxPerUnit;
    const { cols, rows } = tileGrid(level, tilePx, size);
    const a = Math.max(0, Math.floor((view.x0 - margin - origin.x) / tu));
    const b = Math.min(cols - 1, Math.floor((view.x1 + margin - origin.x) / tu));
    const c = Math.max(0, Math.floor((view.y0 - margin - origin.y) / tu));
    const d = Math.min(rows - 1, Math.floor((view.y1 + margin - origin.y) / tu));
    const out = [];
    for (let y = c; y <= d; y++) {
        for (let x = a; x <= b; x++) {
            const x0 = origin.x + x * tu;
            const y0 = origin.y + y * tu;
            out.push({ x, y, rect: { x0, y0, x1: Math.min(origin.x + size.w, x0 + tu), y1: Math.min(origin.y + size.h, y0 + tu) } });
        }
    }
    const cx = (view.x0 + view.x1) / 2;
    const cy = (view.y0 + view.y1) / 2;
    const far = (t) => Math.hypot((t.rect.x0 + t.rect.x1) / 2 - cx, (t.rect.y0 + t.rect.y1) / 2 - cy);
    return out.sort((p, q) => far(p) - far(q));
}

// The tiles loaded, by key, each with its bytes: the least recently used go
// first once past the budget, never one still wanted (`keep`). Returns what
// went, for the caller to let go of (a texture's memory is the caller's).
export class TileCache {
    constructor(budget) {
        this.budget = budget;
        this.items = new Map();
        this.bytes = 0;
    }

    get(key) {
        const e = this.items.get(key);
        if (!e) return null;
        this.items.delete(key);
        this.items.set(key, e);
        return e.value;
    }

    has(key) {
        return this.items.has(key);
    }

    put(key, value, bytes) {
        const had = this.items.get(key);
        if (had) this.bytes -= had.bytes;
        this.items.delete(key);
        this.items.set(key, { value, bytes });
        this.bytes += bytes;
    }

    // past the budget: the oldest not kept, out
    prune(keep = new Set()) {
        const gone = [];
        for (const [key, e] of this.items) {
            if (this.bytes <= this.budget) break;
            if (keep.has(key)) continue;
            this.items.delete(key);
            this.bytes -= e.bytes;
            gone.push(e.value);
        }
        return gone;
    }

    clear() {
        const gone = [...this.items.values()].map((e) => e.value);
        this.items.clear();
        this.bytes = 0;
        return gone;
    }
}

// A scene's px per one of its own units (feet, for a board measured in
// feet): its grid's size over its distance
export const unitPx = (scene) => (Number(scene?.grid?.size) || 100) / (Number(scene?.grid?.distance) || 1);

// Metres in one of a unit (Luke, 2026-10-26: squares of 5 ft, the tabletop
// standard, measured in feet in play, metres a switch away). A unit this
// doesn't know counts as metres.
const UNIT_M = { m: 1, metre: 1, meter: 1, metres: 1, meters: 1, ft: 0.3048, feet: 0.3048, foot: 0.3048, yd: 0.9144, yard: 0.9144, yards: 0.9144 };
export const metresPer = (units) => UNIT_M[String(units ?? 'm').trim().toLowerCase()] ?? 1;
// A scene's px per metre (the map's data is all in metres: positions, the
// fog's distance)
export const metrePx = (scene) => unitPx(scene) / metresPer(scene?.grid?.units);
// The square sizes a baked board's scene may have: its grid's distance and
// units, the same square measured either way
export const SQUARES = {
    '5ft': { distance: 5, units: 'ft' },
    '5ft-m': { distance: 1.524, units: 'm' },
    '1m': { distance: 1, units: 'm' },
    '2m': { distance: 2, units: 'm' },
};
// The same square measured in feet or in metres: the grid that gives it
export function squareIn(scene, units) {
    const m = (Number(scene?.grid?.distance) || 1) * metresPer(scene?.grid?.units);
    const d = units === 'ft' ? m / metresPer('ft') : m;
    return { distance: Math.round(d * 1000) / 1000, units: units === 'ft' ? 'ft' : 'm' };
}

// A board's baked background as its scene's flags hold it (flags.heart.baked):
// { manifest, fog, overlays: { id: shown }, roofs: { key: true (lifted) } },
// or null. `fog`: the NPC fog's distance in units (0, off).
export function cleanBakedFlags(f) {
    if (!f || typeof f !== 'object' || typeof f.manifest !== 'string' || !f.manifest.trim() || f.manifest.length > 400) return null;
    const bools = (o, keyOk) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => keyOk(k) && typeof v === 'boolean'));
    const roofKey = (k) => k.split('/').length <= 2 && k.split('/').every(idOk);
    return {
        manifest: f.manifest.trim(),
        fog: finite(f.fog) ? Math.max(0, Math.min(10000, Number(f.fog))) : 0,
        // (the fog at night, Luke 2026-10-26: at full darkness players see
        // NPCs within `dark` % of the distance; an NPC in light, the whole
        // distance when `lit`)
        dark: finite(f.dark) ? Math.max(0, Math.min(100, Number(f.dark))) : 40,
        lit: f.lit !== false,
        overlays: bools(f.overlays, idOk),
        roofs: Object.fromEntries(Object.entries(bools(f.roofs, roofKey)).filter(([, v]) => v)),
    };
}

// Where an overlay sorts in the primary group: `"under": "pieces"` puts it
// between the base (40) and the ground pieces (41), as ground beneath the
// pieces (Luke, 2026-10-28); any other overlay stays at 50
export const OVERLAY_SORT = 50;
export const OVERLAY_UNDER_SORT = 40.5;
export const overlaySort = (o) => (o?.under === 'pieces' ? OVERLAY_UNDER_SORT : OVERLAY_SORT);

// Whether an overlay is drawn for this viewer: never a GM's one for a
// player; else the GM's switch, else how the bake started it
export function overlayShown(o, flags, gm) {
    if (o.audience === 'gm' && !gm) return false;
    const f = flags?.overlays?.[o.id];
    return typeof f === 'boolean' ? f : o.shown;
}

// Whether a roof's part is on (a roof is lifted whole by its id, or a part
// by `id/part`)
export function partShown(roof, part, flags) {
    const L = flags?.roofs ?? {};
    return !(L[roof.id] || L[`${roof.id}/${part.id}`]);
}

// The roofs' parts shown, each { roof, part }
export const shownParts = (m, flags) => (m?.roofs ?? []).flatMap((roof) => roof.parts.filter((part) => partShown(roof, part, flags)).map((part) => ({ roof, part })));

// How far players see an NPC (units; 0, no limit): the fog's distance,
// shortened toward `dark` % of it as the scene darkens (`darkness` 0 to 1,
// Foundry's), the whole distance again for an NPC standing in light when
// `lit` (Luke, 2026-10-26: Foundry's darkness and lights, our fog)
export function fogDistance(flags, { darkness = 0, inLight = false } = {}) {
    const fog = Number(flags?.fog) || 0;
    if (!(fog > 0)) return 0;
    if (inLight && flags?.lit !== false) return fog;
    const d = Math.max(0, Math.min(1, Number(darkness) || 0));
    const keep = (finite(flags?.dark) ? Number(flags.dark) : 40) / 100;
    return fog * (1 - (1 - keep) * d);
}

// The NPC fog (Luke, 2026-10-25): whether a player is kept from seeing a
// token. Never one with a player owner (the party always sees each other);
// an NPC under a shown roof (`underRoof`), or farther than `dist` (scene px;
// 0, no limit) from every player's token on the scene (`party`: their
// centres), is hidden. With no party token there, every NPC past the limit.
// (`seen`: the GM's "always seen" on this NPC: never hidden)
export function fogHides({ npc, at, party = [], dist = 0, underRoof = false, seen = false }) {
    if (!npc || seen) return false;
    if (underRoof) return true;
    if (!(dist > 0)) return false;
    return !party.some((p) => Math.hypot(p.x - at.x, p.y - at.y) <= dist);
}
