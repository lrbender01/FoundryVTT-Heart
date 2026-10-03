// Gear row art, clickable everywhere (2026-10-02, Luke: lift and click to
// open the gallery wherever art is shown). A gear row (items/base/
// preview.html) carries its book art behind the text; hovered, it lifts
// (preview.sass), and a click on the art, with nothing clickable between
// the pointer and the row, opens the gallery at that piece: the window's
// own gallery where it has one (_showGalleryAt: character, party, item
// sheets), else every row's art in that window. The pointer turns to a
// magnifier where a click would open it.
import { plainPiece, showGallery, startAtSrc } from './art';
import { artShown } from './art-toggle';

const ROW = '.item.preview.has-art';
// what takes a click itself (so a click there never opens the gallery)
const CLICKABLE = 'a, button, input, select, textarea, label, summary, [data-action], [contenteditable=""], [contenteditable="true"], .clickable, .actionbar';

// The art the pointer is on in a row: its <img>, or null (off the art, on
// something clickable, or art switched off)
function artAt(ev) {
    if (!artShown()) return null;
    const row = ev.target?.closest?.(ROW);
    if (!row) return null;
    for (let el = ev.target; el && el !== row; el = el.parentElement) {
        if (el.matches(CLICKABLE) || getComputedStyle(el).cursor === 'pointer') return null;
    }
    const img = row.querySelector(':scope > .row-art img');
    if (!img) return null;
    const a = img.getBoundingClientRect(), r = row.getBoundingClientRect();
    const x = ev.clientX, y = ev.clientY;
    const inside = x >= Math.max(a.left, r.left) && x <= Math.min(a.right, r.right) && y >= Math.max(a.top, r.top) && y <= Math.min(a.bottom, r.bottom);
    return inside ? img : null;
}

const rowName = (row) => (row.querySelector('.item-name, .name')?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function openRowArt(img) {
    const row = img.closest(ROW);
    const src = img.getAttribute('src');
    const appEl = row.closest('.app');
    const app = appEl ? ui.windows?.[appEl.dataset.appid] : null;
    if (typeof app?._showGalleryAt === 'function') return app._showGalleryAt(src);
    // no gallery of its own (a chat card, a companion sheet): every row's
    // art in the same window, at this piece
    const scope = appEl ?? row.parentElement ?? row;
    const pieces = [...scope.querySelectorAll(`${ROW} > .row-art img`)]
        .map(i => plainPiece(i.getAttribute('src'), rowName(i.closest(ROW))));
    showGallery(pieces, { title: rowName(row), start: startAtSrc(pieces, src) });
}

export function registerRowArt() {
    // the capture phase, so a row's own click handlers don't also run
    document.addEventListener('click', ev => {
        if (ev.button !== 0) return;
        const img = artAt(ev);
        if (!img) return;
        ev.preventDefault();
        ev.stopPropagation();
        openRowArt(img);
    }, true);
    // a magnifier over the art where a click would open it
    let last = null, frame = 0;
    document.addEventListener('mousemove', ev => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            const img = artAt(ev);
            const row = img?.closest(ROW) ?? null;
            if (last && last !== row) last.classList.remove('art-pointer');
            if (row) row.classList.add('art-pointer');
            last = row;
        });
    });
}
