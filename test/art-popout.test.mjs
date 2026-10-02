import { describe, it, expect } from 'vitest';
import { popoutBox } from '../src/applications/character-options/popout.js';

// The Choose picker's hover popout (2026-10-01): the art as large as fits
// in the window beside, above, or below the hovered card, never over it.
const overlaps = (box, card) =>
    box.left < card.r && box.left + box.width > card.l && box.top < card.b && box.top + box.height > card.t;

describe('popoutBox', () => {
    const content = { W: 1445, H: 760 };

    it('takes the larger side and keeps the art proportions', () => {
        const card = { l: 12, t: 12, r: 289, b: 252 };      // first card, top left
        const box = popoutBox(content, card, 0.75);
        expect(box.left).toBeGreaterThanOrEqual(card.r);     // to the right of the card
        expect(overlaps(box, card)).toBe(false);
        expect((box.width - 12) / (box.height - 12)).toBeCloseTo(0.75, 2);
        expect(box.height).toBeCloseTo(content.H - 16, 0);   // as tall as the window allows
    });

    it('goes left of a card on the right edge, and stays inside the window', () => {
        const card = { l: 1156, t: 260, r: 1433, b: 500 };
        const box = popoutBox(content, card, 0.75);
        expect(box.left + box.width).toBeLessThanOrEqual(card.l);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.top + box.height).toBeLessThanOrEqual(content.H);
    });

    it('uses the space below a wide row of short cards for landscape art', () => {
        const wide = { W: 1168, H: 720 };
        const card = { l: 300, t: 12, r: 577, b: 252 };
        const box = popoutBox(wide, card, 1.4);
        expect(box.top).toBeGreaterThanOrEqual(card.b);
        expect(overlaps(box, card)).toBe(false);
    });

    it('returns null when nothing fits', () => {
        expect(popoutBox({ W: 300, H: 250 }, { l: 5, t: 5, r: 295, b: 245 }, 1)).toBeNull();
    });
});
