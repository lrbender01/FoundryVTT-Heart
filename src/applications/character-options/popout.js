// The hover popout (2026-10-01): the whole piece, as large as fits inside
// the window beside, above, or below the card, never over the card itself.
// Returns { left, top, width, height } in the window content's coordinates.
export function popoutBox(content, card, ar, { margin = 8, pad = 6, min = 90 } = {}) {
    const { W, H } = content;
    const { l, t, r, b } = card;
    const regions = [
        { side: 'right', x: r + margin, y: margin, w: W - r - 2 * margin, h: H - 2 * margin },
        { side: 'left', x: margin, y: margin, w: l - 2 * margin, h: H - 2 * margin },
        { side: 'below', x: margin, y: b + margin, w: W - 2 * margin, h: H - b - 2 * margin },
        { side: 'above', x: margin, y: margin, w: W - 2 * margin, h: t - 2 * margin },
    ];
    let best = null;
    for (const g of regions) {
        const iw0 = g.w - 2 * pad, ih0 = g.h - 2 * pad;
        if (iw0 < min || ih0 < min) continue;
        const iw = Math.min(iw0, ih0 * ar), ih = iw / ar;
        if (!best || iw * ih > best.iw * best.ih) best = { ...g, iw, ih };
    }
    if (!best) return null;
    const width = best.iw + 2 * pad, height = best.ih + 2 * pad;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (best.side === 'right' || best.side === 'left') {
        return { left: best.side === 'right' ? best.x : best.x + best.w - width, top: clamp((t + b) / 2 - height / 2, margin, H - margin - height), width, height };
    }
    return { left: clamp((l + r) / 2 - width / 2, margin, W - margin - width), top: best.side === 'below' ? best.y : best.y + best.h - height, width, height };
}
