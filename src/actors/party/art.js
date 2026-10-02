// The party sheet's art (2026-10-02, docs/plans/heart-party-art.md): the
// export of Luke's Heart Party Sheet Art tool, which fvtt-heart-content
// ships as assets/art/party/party-art.json beside its pieces. Read once and
// kept; with the module off, or no file, there is no party art and the
// sheet renders as it always did. The layout maths is in decor.js.
import { normalizeArt, partyArtUrl, PARTY_ART_DIR } from './decor';

const CONTENT = 'fvtt-heart-content';
let loading = null;
let loaded = null;

function imageRatio(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5);
        img.onerror = () => resolve(1.5);
        img.src = src;
    });
}

// Resolves the normalized art ({ banner, decor }) or null; fetched once
export function loadPartyArt() {
    if (!game.modules?.get(CONTENT)?.active) return Promise.resolve(null);
    loading ??= (async () => {
        try {
            const res = await fetch(foundry.utils.getRoute(`${PARTY_ART_DIR}/party-art.json`), { cache: 'no-cache' });
            if (!res.ok) return null;
            const art = normalizeArt(await res.json());
            // the banner's framing needs the piece's width / height
            if (art?.banner && !art.banner.ar) art.banner.ar = await imageRatio(partyArtUrl(art.banner.img));
            return art;
        } catch (err) {
            console.warn('heart | the party art could not be read', err);
            return null;
        }
    })().then(art => (loaded = art));
    return loading;
}

// What loadPartyArt resolved, once it has
export function partyArt() {
    return loaded;
}

// The banner as common/art.js frames art ({ src, ar, banner }), for
// {{{heartArt art "banner"}}}
export function partyBanner(art = loaded) {
    const b = art?.banner;
    if (!b) return null;
    return { src: partyArtUrl(b.img), ar: b.ar ?? 1.5, banner: { z: b.z, x: b.x, y: b.y } };
}
