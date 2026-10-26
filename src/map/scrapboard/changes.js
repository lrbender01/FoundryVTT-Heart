// What changed on the board between two paints, and where (2026-10-25, out
// of render.js so it can be tested: the audit's last test gap). The renderer
// keeps each piece it drew as [what it is, where it reaches]; after an edit,
// the parts of the board whose pieces changed are painted again, and only
// those. A piece missed here is a change that never shows until something
// else repaints there. Plain: no Foundry, no PIXI.
import { pointsHash } from './paint.js';

export const meets = (a, b) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1;
export const grow = (b, p) => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });

// the box round a flat list of points, `pad` wider all round (null for none)
export function boxOf(pts, pad = 0) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]);
        x1 = Math.max(x1, pts[i]);
        y0 = Math.min(y0, pts[i + 1]);
        y1 = Math.max(y1, pts[i + 1]);
    }
    return x0 === Infinity ? null : grow({ x0, y0, x1, y1 }, pad);
}

// a piece as it is drawn, as a string to compare (numbers to a tenth;
// nothing twice). A run of numbers (a card's strokes, a string's points) is
// its hash (paint.js pointsHash, to a tenth, kept with the points), never
// written out number by number (Luke, 2026-10-21: every change wrote out
// every card's strokes)
export function sigOf(x) {
    const seen = new WeakSet();
    return JSON.stringify(x, (_k, v) => {
        if (typeof v === 'number') return Math.round(v * 10) / 10;
        if (typeof v === 'function') return undefined;
        if (v && typeof v === 'object') {
            if (seen.has(v)) return undefined;
            seen.add(v);
            if (Array.isArray(v) && v.length >= 16 && v.every((n) => typeof n === 'number')) return `#${v.length}:${pointsHash(v, { round: true })}`;
        }
        return v;
    });
}

// Every piece a board view draws, as id -> { sig, box | boxes, sheet? }:
// cards (their tapes, extras, and pins in their box), strings (a box for
// each stretch of a long one, and its tag), the board's pins, loose bits,
// decorations, and the brush's strokes on the sheet (`sheet`: a change
// repaints the sheet there). `painter`: its tagOf(link) and markState().
export function piecesOf(view, painter) {
    const out = new Map();
    for (const s of view?.scraps ?? []) {
        const L = s.layout ?? {};
        const pts = [...(L.hull ?? [])];
        for (const t of [...(L.tapes ?? []), ...(L.extras ?? [])]) { const m = Math.max(t.w, t.h ?? 0); pts.push(t.cx - m, t.cy - m, t.cx + m, t.cy + m); }
        for (const p of [...(L.clipPins ?? []), ...(L.pins ?? []), ...(L.pin ? [L.pin] : [])]) pts.push(p.x - p.w, p.y - p.w, p.x + p.w, p.y + p.w);
        out.set(`s:${s.key}`, { sig: sigOf(s), box: boxOf(pts, 50) });
    }
    for (const l of view?.links ?? []) {
        // (a long string: a box for each stretch of it, not one round it all)
        const P0 = l.points ?? [];
        const boxes = [];
        for (let i = 0; i < P0.length; i += 16) boxes.push(boxOf(P0.slice(i, i + 18), 60));
        const T = l.label ? painter.tagOf(l) : null;
        if (T) boxes.push(boxOf([T.x - T.w, T.y - T.w, T.x + T.w, T.y + T.w, T.mid.x, T.mid.y], 60));
        out.set(`l:${l.id}`, { sig: sigOf(l), boxes: boxes.filter(Boolean) });
    }
    for (const p of view?.pins ?? []) out.set(`p:${p.id}`, { sig: sigOf(p), box: boxOf([p.x, p.y], (p.w ?? 40) + 20) });
    // (the board's loose pieces: tape and webs off their cards)
    for (const b of view?.bits ?? []) out.set(`b:${b.id}`, { sig: sigOf(b), box: boxOf([b.x, b.y], Math.max(b.w, b.h ?? 0) + 30) });
    (view?.decor ?? []).forEach((d, i) => out.set(`d:${i}`, { sig: sigOf(d), box: boxOf([d.x, d.y], (d.w ?? 100) * 1.5 + 20) }));
    // the marker's strokes are the sheet's: a change repaints the sheet there
    for (const [id, m] of painter.markState()) out.set(`m:${id}`, { sig: m.sig, box: m.box, sheet: true });
    return out;
}

// The parts of the board a change of pieces touches ([{ box, sheet }]):
// where a piece was and where it is, for each one gone, new, or different
export function changes(was, now) {
    const out = [];
    const take = (e) => {
        for (const box of e?.boxes ?? (e?.box ? [e.box] : [])) out.push({ box, sheet: Boolean(e.sheet) });
    };
    for (const [id, a] of was) {
        const b = now.get(id);
        if (!b || b.sig !== a.sig) take(a);
    }
    for (const [id, b] of now) {
        const a = was.get(id);
        if (!a || a.sig !== b.sig) take(b);
    }
    return out;
}
