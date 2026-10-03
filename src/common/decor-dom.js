// Sheet decorations, the DOM half (2026-10-02; the party sheet's since
// 2026-10-02, shared with the character sheet the same day): places a tool
// export's decorations on a rendered sheet (decor.js does the maths), keeps
// them placed as the sheet changes size or tab, plays each one's hover
// behaviour while the pointer is over its anchor, and opens the sheet's
// gallery at a piece when it is clicked.
//
// A click opens the gallery only when nothing that takes clicks sits between
// the pointer and the art (Luke, 2026-10-02): no link, button, field, row,
// or anything with a pointer cursor, no opaque box over it (a row, a title),
// and the pixel under the pointer isn't transparent in the image. The
// pointer turns to a magnifier where a click would open it.
//
//   this._decor = new SheetDecor({
//       art: () => normalizedArt,        // { decor: [...] } or null
//       url: (img) => src,               // an export's image name as a path
//       anchors: [...], sections: [...], // the sheet's boxes; titled sections
//       hidden: () => bool,              // the Art button's per-player off
//       open: (index) => {},             // gallery at art.decor[index]
//   });
//   activateListeners: this._decor.attach(SheetDecor.formOf(html));
//   close: this._decor.stop();
import './decor.sass';
import { decorLayout, decorUV } from './decor';

// what takes a click itself (so a click there never opens the gallery)
const CLICKABLE = 'a, button, input, select, textarea, label, summary, option, [data-action], [contenteditable=""], [contenteditable="true"], .editor, .ProseMirror, .item, .clickable, [draggable="true"]';
// how see-through a pixel may be and still count as the art (of 255)
const SOLID = 24;

// the image's alpha channel, sampled small, per source (null: unreadable,
// treated as solid)
const alphaCache = new Map();
function alphaOf(img) {
    if (alphaCache.has(img.src)) return alphaCache.get(img.src);
    if (!img.complete || !img.naturalWidth) return null;
    let sample = null;
    try {
        const w = Math.min(256, img.naturalWidth);
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        sample = { w, h, data: ctx.getImageData(0, 0, w, h).data };
    } catch (err) {
        sample = null;
    }
    alphaCache.set(img.src, sample);
    return sample;
}

function solidAt(img, { u, v }) {
    const a = alphaOf(img);
    if (!a) return true;
    const x = Math.min(a.w - 1, Math.floor(u * a.w));
    const y = Math.min(a.h - 1, Math.floor(v * a.h));
    return a.data[(y * a.w + x) * 4 + 3] > SOLID;
}

// a box that hides what is behind it: a fill or a background picture
function opaque(el) {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    return alpha > 0.5;
}

export class SheetDecor {
    constructor({ art, url, anchors, sections, hidden = () => false, open = null }) {
        this.art = art;
        this.url = url;
        this.anchors = anchors;
        this.sections = sections;
        this.hidden = hidden;
        this.open = open;
        this.observer = null;
    }

    // the form a render's html holds
    static formOf(html) {
        const root = html?.[0] ?? html;
        if (!root) return null;
        return root.closest?.('form') ?? root.querySelector?.('form') ?? root;
    }

    // Draw, then keep drawn: call on every render
    attach(form) {
        this.stop();
        if (!form) return;
        requestAnimationFrame(() => this.draw(form));
        if (!this.art()?.decor?.length) return;

        // redraw when the form or any box changes size (a resized window, a
        // section that grew, a tab shown or hidden)
        if (typeof ResizeObserver !== 'undefined') {
            let pending = false;
            this.observer = new ResizeObserver(() => {
                if (pending) return;
                pending = true;
                requestAnimationFrame(() => { pending = false; this.draw(form); });
            });
            this.observer.observe(form);
            for (const el of form.querySelectorAll('[data-anchor]')) this.observer.observe(el);
        }

        // hover behaviour: while the pointer is inside a decoration's anchor
        form.addEventListener('mouseover', ev => {
            const keys = new Set();
            for (let el = ev.target; el && el !== form.parentElement; el = el.parentElement) {
                if (el.dataset?.anchor) keys.add(el.dataset.anchor);
            }
            form.querySelectorAll('.heart-decor').forEach(img => img.classList.toggle('hov', keys.has(img.dataset.anchorOf)));
        });
        form.addEventListener('mouseleave', () => {
            form.querySelectorAll('.heart-decor.hov').forEach(img => img.classList.remove('hov'));
            form.classList.remove('decor-pointer');
        });

        if (!this.open) return;
        // a magnifier where a click would open the gallery
        let frame = 0;
        form.addEventListener('mousemove', ev => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                form.classList.toggle('decor-pointer', this.hitAt(form, ev) !== null);
            });
        });
        form.addEventListener('click', ev => {
            if (ev.defaultPrevented || ev.button !== 0) return;
            if (String(window.getSelection?.() ?? '')) return;
            const index = this.hitAt(form, ev);
            if (index === null) return;
            ev.preventDefault();
            this.open(index);
        });
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
    }

    // Places the decorations from the boxes as drawn. Sheet-level ones go in
    // a layer under or over everything; an "in" one inside its section,
    // behind the content.
    draw(form) {
        if (!form?.isConnected) return;
        form.querySelectorAll('.heart-decor-layer, .heart-decor-clip, .heart-decor').forEach(el => el.remove());
        form.querySelectorAll('.heart-decor-host').forEach(el => el.classList.remove('heart-decor-host'));
        form.classList.remove('has-decor', 'decor-pointer');
        const art = this.art();
        if (!art?.decor?.length || this.hidden()) return;

        // every box relative to the form, in its own (unscaled) pixels; a box
        // that isn't showing (another tab) is left out, and so are its pieces
        const origin = form.getBoundingClientRect();
        const scale = form.offsetWidth ? origin.width / form.offsetWidth : 1;
        const boxes = {};
        for (const key of this.anchors) {
            const el = key === 'sheet' ? form : form.querySelector(`[data-anchor="${key}"]`);
            if (!el || !el.getClientRects().length) continue;
            const r = el.getBoundingClientRect();
            boxes[key] = { left: (r.left - origin.left) / scale, top: (r.top - origin.top) / scale, width: r.width / scale, height: r.height / scale };
        }
        const placed = decorLayout(art, boxes, this.sections);
        if (!placed.length) return;
        form.classList.add('has-decor');

        const layer = (name) => {
            let el = form.querySelector(`:scope > .heart-decor-layer.${name}`);
            if (!el) {
                el = document.createElement('div');
                el.className = `heart-decor-layer ${name}`;
                el.setAttribute('aria-hidden', 'true');
                if (name === 'behind') form.prepend(el);
                else form.append(el);
            }
            return el;
        };
        for (const d of placed) {
            let host;
            if (d.layer === 'in' || d.layer === 'above') {
                const section = form.querySelector(`[data-anchor="${d.host}"]`);
                section.classList.add('heart-decor-host');
                if (d.clip) {
                    // one clip box per layer: under the content, or over it
                    host = section.querySelector(`:scope > .heart-decor-clip.${d.layer}`);
                    if (!host) {
                        host = document.createElement('div');
                        host.className = `heart-decor-clip ${d.layer}`;
                        host.setAttribute('aria-hidden', 'true');
                        if (d.layer === 'in') section.prepend(host);
                        else section.append(host);
                    }
                } else host = section;
            } else host = layer(d.layer);
            const img = document.createElement('img');
            img.className = `heart-decor h-${d.hover}${d.layer === 'above' ? ' above' : ''}`;
            img.dataset.anchorOf = d.anchor;
            img.dataset.index = String(d.index);
            img.src = this.url(d.img);
            img.alt = '';
            img.draggable = false;
            img.setAttribute('style', `${d.style};left:${d.left}px;top:${d.top}px`);
            host.append(img);
        }
    }

    // The index (in art.decor) of the piece a click at this event's point
    // would open, or null: the topmost piece showing there, if nothing that
    // takes clicks is in the way
    hitAt(form, ev) {
        if (!form.classList.contains('has-decor')) return null;
        const target = ev.target;
        if (!(target instanceof Element) || !form.contains(target)) return null;

        // anything clickable between the pointer and the form: no
        for (let el = target; el && el !== form; el = el.parentElement) {
            if (el.matches(CLICKABLE) || getComputedStyle(el).cursor === 'pointer') return null;
        }

        // what shows at the point, top first: the over layer; the pieces
        // above the section under the pointer (not under its title); the
        // pieces in it, unless a
        // box inside it covers them; the behind layer, unless any box covers
        // it (a button under an above piece already stopped the click)
        const host = target.closest('.heart-decor-host');
        // an opaque box from the pointer up to (not including) `stop`
        const coveredWithin = (stop) => {
            for (let el = target; el && el !== stop; el = el.parentElement) {
                if (opaque(el)) return true;
            }
            return false;
        };
        const candidates = [...form.querySelectorAll(':scope > .heart-decor-layer.over > .heart-decor')].reverse();
        if (host && form.contains(host)) {
            const pieces = [...host.querySelectorAll(':scope > .heart-decor, :scope > .heart-decor-clip > .heart-decor')].reverse();
            // the section's title sits over its above pieces
            if (!target.closest('.container-title')) candidates.push(...pieces.filter(img => img.classList.contains('above')));
            if (!coveredWithin(host)) candidates.push(...pieces.filter(img => !img.classList.contains('above')));
        }
        if (!coveredWithin(form)) {
            candidates.push(...[...form.querySelectorAll(':scope > .heart-decor-layer.behind > .heart-decor')].reverse());
        }

        const origin = form.getBoundingClientRect();
        const scale = form.offsetWidth ? origin.width / form.offsetWidth : 1;
        const point = { x: ev.clientX, y: ev.clientY };
        for (const img of candidates) {
            if (this.hits(img, point, scale)) return Number(img.dataset.index);
        }
        return null;
    }

    hits(img, point, scale) {
        if (Number(getComputedStyle(img).opacity) < 0.05) return false;
        // a clipped piece only shows inside its clip box or layer
        const clip = img.parentElement?.closest('.heart-decor-clip, .heart-decor-layer');
        if (clip) {
            const c = clip.getBoundingClientRect();
            if (point.x < c.left || point.x > c.right || point.y < c.top || point.y > c.bottom) return false;
        }
        const r = img.getBoundingClientRect();
        const lifted = img.classList.contains('hov') && img.classList.contains('h-lift');
        const uv = decorUV(point, {
            center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
            width: img.offsetWidth * scale,
            height: img.offsetHeight * scale,
            r: parseFloat(img.style.getPropertyValue('--r')) || 0,
            flip: img.style.getPropertyValue('--fx').trim() === '-1',
            scale: lifted ? parseFloat(img.style.getPropertyValue('--lift')) || 1 : 1,
        });
        return Boolean(uv) && solidAt(img, uv);
    }
}
