// Party sheet decorations (2026-10-02, docs/plans/heart-party-art.md): the
// party sheet's boxes and art folder for the shared decoration maths
// (common/decor.js), which the export of Luke's Heart Party Sheet Art tool
// (docs/mocks/party-art/) runs through. Tested in test/party-decor.test.mjs;
// the DOM half is common/decor-dom.js.
import {
    normalizeDecorArt, decorLayout as layout, decorArtUrl,
    anchorPoint, decorStyle, decorUV, POINTS, LAYERS, HOVERS, BLENDS, DEFAULT_HOVER,
} from '../../common/decor';

export { anchorPoint, decorStyle, decorUV, POINTS, LAYERS, HOVERS, BLENDS, DEFAULT_HOVER };

export const SECTION_ANCHORS = ['members', 'companions', 'fallouts', 'provisions', 'items', 'notes', 'beats'];
export const ANCHORS = ['sheet', 'header', ...SECTION_ANCHORS];

export const normalizeArt = (json) => normalizeDecorArt(json, ANCHORS);
export const decorLayout = (art, boxes) => layout(art, boxes, SECTION_ANCHORS);

export const PARTY_ART_DIR = 'modules/fvtt-heart-content/assets/art/party';
export const partyArtUrl = (img) => decorArtUrl(PARTY_ART_DIR, img);
