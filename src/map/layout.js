// The Heart map's layout (2026-10-02): fvtt-heart-content ships it as
// assets/art/map/heart-map.json (the Heart Map tuner's export) beside the
// map's paper and backdrop pieces. Read once and kept; without the module
// there is no book layout, and a map scene shows only the GM's own nodes.
import { normalizeLayout } from './model';

const CONTENT = 'fvtt-heart-content';
export const MAP_ART_DIR = `modules/${CONTENT}/assets/art/map`;
let loading = null;

// An image name from the layout as a path ("paper" or "paper.webp" in the
// map art folder; a name with a slash is a path inside the module)
export function mapArtUrl(img) {
    const name = String(img ?? '');
    if (!name) return '';
    if (/^(https?:|data:|modules\/|systems\/|worlds\/)/.test(name)) return name;
    if (name.includes('/')) return `modules/${CONTENT}/${name.replace(/^\/+/, '')}`;
    return `${MAP_ART_DIR}/${/\.[a-z0-9]+$/i.test(name) ? name : `${name}.webp`}`;
}

// Resolves the normalized layout; with no module or no file, an empty one
// (the default size and no bands) so a map scene still draws
export function loadMapLayout() {
    loading ??= (async () => {
        if (!game.modules?.get(CONTENT)?.active) return normalizeLayout({});
        try {
            const res = await fetch(foundry.utils.getRoute(`${MAP_ART_DIR}/heart-map.json`), { cache: 'no-cache' });
            if (!res.ok) return normalizeLayout({});
            return normalizeLayout(await res.json()) ?? normalizeLayout({});
        } catch (err) {
            console.warn('heart | the map layout could not be read', err);
            return normalizeLayout({});
        }
    })();
    return loading;
}

// Forget the cached layout (after Luke pastes a new tuner export, the GM's
// "Reload layout" button)
export function reloadMapLayout() {
    loading = null;
    return loadMapLayout();
}

export function hasBookLayout(layout) {
    return Object.keys(layout?.nodes ?? {}).length > 0;
}
