// What is under the pointer on a scrapboard (2026-10-02): the same tests the
// Heart Map Board mock runs (its pins, junctions, tags, scraps, and strings),
// on a board view (model.js boardView) and the painter (paint.js: a tag's
// place). Points are board px; `tol` is board px (the pointer's reach).
import { hitTest, uvOn } from './model.js';

const near = (pt, p, tol) => p && Math.hypot(pt.x - p.x, pt.y - p.y) < Math.max(tol, (p.w ?? 30) * 0.55);

// The topmost thing under a point, pins first (they sit over everything):
//   { kind: 'end', link, side }      a string's end pin (side 0: a, 1: b)
//   { kind: 'joint', link, idx }     a pin a string is pulled through
//   { kind: 'join', link }           a named string's junction pin
//   { kind: 'tagPin', link }         the pin through a string's tag
//   { kind: 'pin', pin }             a pin of the board's own (in a scrap or loose)
//   { kind: 'scrapPin', scrap, idx } a scrap's own pin (-1) or an added one
//   { kind: 'tag', link }            a string's tag
//   { kind: 'scrap' | 'link' | 'decor', item }  (model.js hitTest)
export function hitAt(view, painter, size, pt, tol = 10) {
    const links = [...view.links].reverse();
    for (const l of links) {
        for (const side of [0, 1]) if (!l.ends?.[side]?.shared && near(pt, l.ends?.[side], tol)) return { kind: 'end', link: l, side };
    }
    for (const l of links) {
        const j = (l.joints ?? []).find((p) => !p.shared && near(pt, p, tol));
        // (idx: its place in the string's list of joints)
        if (j) return { kind: 'joint', link: l, idx: j.idx };
    }
    for (const l of links) {
        const T = painter.tagOf(l);
        if (T && near(pt, l.junction, tol)) return { kind: 'join', link: l };
        if (T && !T.over && near(pt, T.pin, tol)) return { kind: 'tagPin', link: l };
    }
    for (const p of [...(view.pins ?? [])].reverse()) if (!p.hidden && near(pt, p, tol)) return { kind: 'pin', pin: p };
    for (const b of [...(view.bits ?? [])].reverse()) if (onBit(b, pt)) return { kind: 'bit', item: b };
    for (const s of [...view.scraps].reverse()) {
        if (s.layout.bare) continue;
        const added = (s.layout.pins ?? []).findIndex((p) => near(pt, p, tol));
        if (added >= 0) return { kind: 'scrapPin', scrap: s, idx: added };
        if (!s.layout.pinOff && (!s.tied || s.pinShow) && near(pt, s.layout.pin, tol)) return { kind: 'scrapPin', scrap: s, idx: -1 };
    }
    for (const l of links) {
        const T = painter.tagOf(l);
        if (T && painter.onTag(T, pt)) return { kind: 'tag', link: l };
    }
    const h = hitTest(view, pt, size, { tol });
    return h ? { kind: h.kind, item: h.item } : null;
}

// (a point on a loose piece: within its turned box)
function onBit(b, pt) {
    const c = Math.cos(-b.rot);
    const s = Math.sin(-b.rot);
    const dx = pt.x - b.x;
    const dy = pt.y - b.y;
    return Math.abs(dx * c - dy * s) <= b.w / 2 && Math.abs(dx * s + dy * c) <= b.h / 2;
}

// A point as a place on a scrap: { u, v } against its text box, kept on the
// paper itself (where its pins and string ends are stored)
// (the model's uvOn, on a scrap of the view)
export const onPaper = (scrap, pt) => uvOn(scrap.layout, pt);

// A point as a place on a tag ({ u, v } against the tag, kept on it)
export function onTagAt(T, pt) {
    const c = Math.cos(-T.rot);
    const s = Math.sin(-T.rot);
    const dx = pt.x - T.x;
    const dy = pt.y - T.y;
    return {
        u: +Math.max(-0.5, Math.min(0.5, (dx * c - dy * s) / T.w)).toFixed(3),
        v: +Math.max(-0.5, Math.min(0.5, (dx * s + dy * c) / T.h)).toFixed(3),
    };
}
