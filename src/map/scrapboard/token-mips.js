// Token mip chains (Luke, 2026-10-28): every token picture of the three Plenty
// folders (plenty-looks, plenty-named, plenty-tokens; the named's folder was
// plenty-main until 2026-10-28) is baked as `<name>.webp` (512 px, the path the token documents use)
// plus `<name>@256.webp`, `@128`, `@64`, and `@32` beside it, and each folder
// has a `mips.json` manifest Foundry reads once:
//   { format: "heart-mips", version: 1, levels: [256, 128, 64, 32],
//     files: { "<name>.webp": [256, 128, 64, 32] } }
// Pieces (pieces-draw.js) use the same files with a version 2 manifest, whose
// entries carry their own top: { "<name>.webp": { w, h, levels: [px, ...] } },
// each level named by the longer side of that picture.
// A picture with no entry (a face re-rolled inside Foundry, a portrait) has no
// chain: its own file is used. fog.js swaps a token's texture to the level
// its on-screen size needs, on the client only; the token document, and so
// the image path every client shares, is never changed.
//
// The first half of this file is pure (the rules, tested); the second half
// holds the textures the swap loads (PIXI), counted per level file.

// the picture's own size, the top of every chain
export const TOP = 512;

// the folders that hold baked token pictures
export const FOLDERS = Object.freeze(['plenty-looks', 'plenty-named', 'plenty-tokens']);

// the qualities (the boardDetail setting; Auto is whichever the device gets)
export const QUALITIES = Object.freeze(['auto', 'light', 'standard', 'high', 'ultra']);

// Split a token picture's path into its folder and file name, or null when
// the picture is not one of the baked token pictures (then it is left alone).
// A query string or hash is dropped. Pure.
export function splitPath(src) {
    if (typeof src !== 'string') return null;
    const clean = src.split(/[?#]/)[0];
    const m = /^(.*\/boards\/(?:plenty-looks|plenty-named|plenty-tokens))\/([^/]+\.webp)$/i.exec(clean);
    return m ? { dir: m[1], name: m[2] } : null;
}

// The file name of one level of a picture: the picture itself at the top,
// `<name>@<level>.webp` below it. Pure.
export function levelFile(name, level, top = TOP) {
    if (!(level < top)) return name;
    return name.replace(/\.webp$/i, `@${level}.webp`);
}

// Split any `.webp` picture's path into its folder and file name (pieces
// live in many folders; a token picture uses splitPath above). A query string
// or hash is dropped; null for anything that is not a `.webp`. Pure.
export function splitAnyPath(src) {
    if (typeof src !== 'string') return null;
    const clean = src.split(/[?#]/)[0];
    const m = /^(.*)\/([^/]+\.webp)$/i.exec(clean);
    return m ? { dir: m[1], name: m[2] } : null;
}

// The path of the manifest for a folder. Pure.
export const manifestUrl = (dir) => `${dir}/mips.json`;

// The levels a picture has, ascending and with the top added, from a manifest
// already read; null when it has no chain. Names are looked up as written and
// decoded (a path may carry %20). Pure.
// `side` is the picture's real longer side in px (the loaded texture's width
// or height), for a version 1 entry, which does not carry its top: the top is
// then `side` (a 192 px crowd face tops its chain at 192, not 512), and a
// listed level at or above it is dropped. Without `side` a version 1 top is
// TOP, as before. A version 2 entry names its own top and ignores `side`.
export function chainFor(manifest, name, side) {
    if (!manifest || manifest.format !== 'heart-mips' || typeof manifest.files !== 'object' || !manifest.files) return null;
    let entry = manifest.files[name];
    if (entry === undefined) {
        try {
            entry = manifest.files[decodeURIComponent(name)];
        } catch {
            entry = undefined;
        }
    }
    // (version 1: the entry is a list and the top is TOP; version 2: the entry
    // is { w, h, levels } and the top is the longer side of the picture)
    let top = Number(side) > 0 ? Math.round(Number(side)) : TOP;
    let list = entry;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        top = Math.max(Number(entry.w) || 0, Number(entry.h) || 0);
        if (!(top > 0)) return null;
        list = entry.levels;
    }
    if (!Array.isArray(list)) return null;
    const levels = [...new Set(list.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < top))].sort((a, b) => a - b);
    return levels.length ? [...levels, top] : null;
}

// The on-screen longer side of a picture drawn `w` by `h` board units, in
// canvas px at zoom `stageScale` (`boardScale`: canvas px per board unit). Pure.
export function drawnPx(w, h, boardScale, stageScale = 1) {
    return Math.max(Number(w) || 0, Number(h) || 0) * (Number(boardScale) || 0) * (Number(stageScale) || 1);
}

// The pixels a token needs: its size on screen times the canvas's pixel
// ratio, rounded up. Pure.
export function neededPx(sizePx, dpr = 1) {
    const s = Number(sizePx) > 0 ? Number(sizePx) : 0;
    const r = Number(dpr) > 0 ? Number(dpr) : 1;
    return Math.ceil(s * r);
}

// The level to show: the smallest level (of those the picture has, the top
// included) at least the pixels needed; Ultra, "no compromise", one level
// finer than that, never above the top (the last of `levels`, the picture's
// own longer side; TOP when no chain is given). Pure.
export function pickLevel({ sizePx, dpr = 1, quality = 'auto', levels }) {
    const all = Array.isArray(levels) && levels.length ? [...levels].sort((a, b) => a - b) : [TOP];
    const need = neededPx(sizePx, dpr);
    let i = all.findIndex((l) => l >= need);
    if (i < 0) i = all.length - 1;
    if (quality === 'ultra') i = Math.min(i + 1, all.length - 1);
    return all[i];
}

// The scale that shows a texture at the size the mesh showed before, whatever
// the texture setter did to the scale meanwhile: the size on the board is
// |scale| times the texture's pixels, kept; the sign (a mirrored token) stays.
// `before` is the scale and the texture's pixel size read BEFORE the swap
// ({ scale: {x, y}, w, h }); `after` is the new texture's pixel size. Absolute,
// never relative to the scale found after the swap (the setter may already have
// compensated, and compensating twice made the faces 8 times too large). Pure.
export function sizedScale(before, after) {
    const keep = (s, from, to) => (Math.sign(s) || 1) * ((Math.abs(s) * from) / (to || from || 1));
    return { x: keep(before.scale.x, before.w, after.w), y: keep(before.scale.y, before.h, after.h) };
}

// ---- the manifests: read once a folder, kept ----

const manifests = new Map();

// The manifest of a folder, fetched once and kept; any failure (no file, bad
// JSON, a network error) means "no chain" (null), kept too so the folder is
// not asked again. `fetchFn` is injectable for the tests.
export function readManifest(dir, fetchFn = (u) => fetch(u)) {
    if (!manifests.has(dir)) {
        manifests.set(
            dir,
            (async () => {
                try {
                    const res = await fetchFn(manifestUrl(dir));
                    if (!res?.ok) return null;
                    const json = await res.json();
                    // (version 1: tokens; version 2: pieces; none named: as 1)
                    return json?.format === 'heart-mips' && (json.version === undefined || json.version === 1 || json.version === 2) ? json : null;
                } catch {
                    return null;
                }
            })(),
        );
    }
    return manifests.get(dir);
}

// forget the kept manifests (tests, and a changed world)
export const clearManifests = () => manifests.clear();

// ---- the level textures: loaded once a file, counted by the tokens using it ----

const held = new Map(); // url -> { texture: Promise, count }
const spare = new Map(); // url -> Promise<texture>, no token using it (Ultra keeps these)
const SPARE_MAX = 1500;

// Load a level file and count one more token using it
export function acquireLevel(url) {
    let h = held.get(url);
    if (!h) {
        const kept = spare.get(url);
        spare.delete(url);
        h = { texture: kept ?? PIXI.Texture.fromURL(url), count: 0 };
        held.set(url, h);
        // (a failed load is forgotten, so a later zoom may try again)
        Promise.resolve(h.texture).catch(() => {
            if (held.get(url) === h) held.delete(url);
        });
    }
    h.count += 1;
    return h.texture;
}

// One token fewer uses a level file; when none is left the texture is
// destroyed, except under Ultra, which keeps up to a few hundred spare (the
// zoom back in is instant). A failed load is dropped at once.
export function releaseLevel(url, keep = false) {
    const h = held.get(url);
    if (!h) return;
    h.count -= 1;
    if (h.count > 0) return;
    held.delete(url);
    if (keep) {
        spare.set(url, h.texture);
        for (const old of spare.keys()) {
            if (spare.size <= SPARE_MAX) break;
            dropTexture(spare.get(old));
            spare.delete(old);
        }
        return;
    }
    dropTexture(h.texture);
}

// destroy a texture still loading or loaded, quietly
function dropTexture(promise) {
    Promise.resolve(promise)
        .then((t) => {
            if (t && t !== PIXI.Texture.EMPTY) t.destroy(true);
        })
        .catch(() => {});
}
