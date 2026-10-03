// Character sheet decorations (2026-10-02, Luke): the same free decorations
// as the party sheet (common/decor.js), from the export of the Heart
// Character Sheet Art tool (docs/mocks/character-art/), which
// fvtt-heart-content ships as assets/art/character/character-art.json beside
// its pieces. One layout for every character sheet; the header's art band
// stays the character's own ancestry, calling, and class art.
//
// The boxes (data-anchor in sheet.html): the sheet, the header, each tab's
// whole page, and every titled section. A section on a tab that isn't
// showing has no box, so its pieces wait until that tab shows.
import { normalizeDecorArt, decorArtUrl } from '../../common/decor';
import { decorFile } from '../../common/decor-file';

export const CHARACTER_SECTIONS = [
    // Character tab
    'resistances', 'party', 'skills-domains', 'equipment', 'resources', 'items', 'bonds', 'inactive',
    'beats', 'fallout', 'abilities',
    // Biography tab
    'notes', 'calling', 'ancestry', 'class',
    // Skills & Domains tab
    'skill-list', 'domain-list',
];
export const CHARACTER_TABS = ['tab-character', 'tab-biography', 'tab-skills'];
export const CHARACTER_ANCHORS = ['sheet', 'header', ...CHARACTER_TABS, ...CHARACTER_SECTIONS];

export const CHARACTER_ART_DIR = 'modules/fvtt-heart-content/assets/art/character';
export const characterArtUrl = (img) => decorArtUrl(CHARACTER_ART_DIR, img);

// the character sheet has no banner of its own in the file (its art band is
// the character's), so only the decorations are kept
export function normalizeCharacterArt(json) {
    const art = normalizeDecorArt({ decor: json?.decor }, CHARACTER_ANCHORS);
    return art ? { decor: art.decor } : null;
}

const file = decorFile(`${CHARACTER_ART_DIR}/character-art.json`, normalizeCharacterArt);
export const loadCharacterArt = () => file.load();
export const characterArt = () => file.get();
