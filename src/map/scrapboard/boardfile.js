// A board as a file (Luke, 2026-10-21: the board is built over a campaign and
// never reset, so it can be downloaded and loaded back): its file's name, and
// a board read back from text (a downloaded file, or one pasted from the
// editor), checked by the model. Also the cards a renamed place's actor
// renames. Pure: no Foundry globals (Foundry only, never inlined into the
// editor), tested in test/scrapboard-file.test.mjs.
import { normalizeBoard } from './model.js';

// "Heart Map 2026-10-21.json": the scene's name (made safe for a file) and
// the day, in the user's own time
export function boardFileName(sceneName, date = new Date(), fallback = 'Heart Map') {
    const safe = String(sceneName ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
    const pad = (n) => String(n).padStart(2, '0');
    return `${safe} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// The board in a text (a board, or the editor's whole-file { look, board }),
// as written, minus what the model can't place: { board, scraps, links } or
// null when it isn't a board. Its loose pieces, its bin, and its pins' tidy
// mark come with it (a downloaded board loads back whole).
export function boardFromText(text) {
    let j;
    try {
        j = JSON.parse(String(text ?? ''));
    } catch {
        return null;
    }
    const raw = j?.board && !j.scraps ? j.board : j;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (!raw.scraps && !raw.links)) return null;
    const checked = normalizeBoard(raw);
    const keep = (part) => Object.fromEntries(Object.keys(checked[part]).map((k) => [k, raw[part][k]]));
    const board = {
        scraps: keep('scraps'),
        links: keep('links'),
        pins: keep('pins'),
        marks: Object.fromEntries(Object.entries(checked.marks).map(([layer, strokes]) => [layer, Object.fromEntries(Object.keys(strokes).map((id) => [id, raw.marks[layer][id]]))])),
        bits: keep('bits'),
        decor: Array.isArray(raw.decor) ? raw.decor : [],
    };
    if (raw.bin && typeof raw.bin === 'object' && !Array.isArray(raw.bin)) board.bin = Object.fromEntries(Object.entries(raw.bin).filter(([, e]) => e?.scrap && typeof e.scrap === 'object'));
    if (Number.isFinite(Number(raw.pinsEd)) && Number(raw.pinsEd) > 0) board.pinsEd = Number(raw.pinsEd);
    return { board, scraps: Object.keys(board.scraps).length, links: Object.keys(board.links).length };
}

// The cards of a place of the GM's own (its actor's uuid) whose stored name
// isn't its actor's name now: { key: { name } } (Luke, 2026-10-21: a card
// follows its actor's renames), empty when none
export function renamedCards(raw, uuid, name) {
    const out = {};
    if (!uuid || !name) return out;
    for (const [k, s] of Object.entries(raw?.scraps ?? {})) if (s?.uuid === uuid && s.name !== name) out[k] = { name };
    return out;
}
