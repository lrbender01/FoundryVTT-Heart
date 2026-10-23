// Every Heart track's click rule, once (Luke, 2026-10-21; it was written out
// six times): a click marks up to the clicked box; a click on the last
// marked box again clears it. Boxes are the ordered-checkable helper's
// <a data-index class="ordered-checkable-box [checked]">.

// The track's new value after a click on box `index` (0-based), given the
// value now and whether that box shows marked
export function nextMark(current, index, checked) {
    const value = Number(current) || 0;
    const i = Number(index) || 0;
    return checked && i + 1 === value ? i : i + 1;
}

// Wire the boxes `selector` finds: `read(box)` gives the track's value now
// (null or undefined: not a track this handler owns, the click is left
// alone), `write(box, next)` stores the new one. A sheet that cannot be
// edited binds nothing, so a viewer's click no longer reaches update() and
// Foundry's "lacks permission" error (2026-10-21).
export function bindTrack(html, selector, { editable = true, read, write }) {
    if (!editable) return;
    html.find(selector).on('click', async (ev) => {
        const box = ev.currentTarget;
        const current = await read(box);
        if (current === null || current === undefined) return;
        ev.preventDefault();
        const index = Number.parseInt(box.dataset.index, 10) || 0;
        return write(box, nextMark(current, index, box.classList.contains('checked')));
    });
}

// A stress track's boxes (Luke, 2026-10-23: twelve boxes, never capped):
// `max` ordered-checkable boxes marked up to the value, then a "+N" after
// the last box for stress past it (a doubled roll can add up to 24). The
// +N is no box, so a click never lands on it; a click on a box still sets
// the value to that box, which is the user's own choice. overTip: the +N's
// tooltip, already escaped. Pure (the {{{stress-track}}} helper's body).
export function stressTrackHtml(value, max, overTip = '') {
    const v = Math.max(0, Number(value) || 0);
    const n = Math.max(0, Math.floor(Number(max) || 0));
    let out = '';
    for (let i = 0; i < n; i++) {
        out += `<a data-index="${i}" class="ordered-checkable-box${i < v ? ' checked' : ''}"></a>`;
    }
    const over = v - n;
    if (over > 0) out += `<span class="track-over"${overTip ? ` data-tooltip="${overTip}"` : ''}>+${over}</span>`;
    return out;
}
