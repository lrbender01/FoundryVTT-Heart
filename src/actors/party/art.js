// The party sheet's art (2026-10-02, docs/plans/heart-party-art.md): the
// export of Luke's Heart Party Sheet Art tool, which fvtt-heart-content
// ships as assets/art/party/party-art.json beside its pieces (read once,
// common/decor-file.js). The layout maths is in decor.js.
import { normalizeArt, partyArtUrl, PARTY_ART_DIR } from './decor';
import { decorFile } from '../../common/decor-file';

function imageRatio(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5);
        img.onerror = () => resolve(1.5);
        img.src = src;
    });
}

const file = decorFile(`${PARTY_ART_DIR}/party-art.json`, normalizeArt, async art => {
    // the banner's framing needs the piece's width / height
    if (art.banner && !art.banner.ar) art.banner.ar = await imageRatio(partyArtUrl(art.banner.img));
    return art;
});

// Resolves the normalized art ({ banner, decor }) or null; fetched once
export const loadPartyArt = () => file.load();

// What loadPartyArt resolved, once it has
export const partyArt = () => file.get();

// The banner as common/art.js frames art ({ src, ar, banner }), for
// {{{heartArt art "banner"}}}
export function partyBanner(art = partyArt()) {
    const b = art?.banner;
    if (!b) return null;
    return { src: partyArtUrl(b.img), ar: b.ar ?? 1.5, banner: { z: b.z, x: b.x, y: b.y } };
}
