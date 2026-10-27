import { describe, it, expect } from 'vitest';
import { roofAlpha, roofsOpened, distToSegment, doorInReach } from '../src/map/scrapboard/roof-rule.js';

describe('roofAlpha', () => {
    it('the GM fades a hovered roof anywhere', () => {
        expect(roofAlpha({ isGM: true, hovered: true })).toBe(0.12);
        expect(roofAlpha({ isGM: true })).toBe(1);
    });
    it('a player with no token inside keeps the roof shut, hovered or not', () => {
        expect(roofAlpha({ hovered: true })).toBe(1);
        expect(roofAlpha({ lifted: true, hovered: true })).toBe(1);
    });
    it('a token inside lets the pointer fade the roof', () => {
        expect(roofAlpha({ inside: true, hovered: true })).toBe(0.12);
        expect(roofAlpha({ inside: true })).toBe(1);
    });
    it('a selected token inside lifts the roof away', () => {
        expect(roofAlpha({ inside: true, lifted: true })).toBe(0);
        expect(roofAlpha({ inside: true, lifted: true, hovered: true })).toBe(0);
    });
});

describe('roofsOpened', () => {
    // two roofs: a covers x 0..10, b covers x 20..30
    const at = (x) => (x <= 10 ? ['a'] : x >= 20 && x <= 30 ? ['b'] : []);
    const tokens = [{ id: 't1', x: 5, y: 0 }, { id: 't2', x: 25, y: 0 }, { id: 't3', x: 50, y: 0 }];
    it('finds the roofs the tokens are inside', () => {
        const r = roofsOpened(tokens, new Set(), at);
        expect([...r.inside].sort()).toEqual(['a', 'b']);
        expect(r.lifted.size).toBe(0);
    });
    it('lifts only the roof of a controlled token', () => {
        const r = roofsOpened(tokens, ['t2'], at);
        expect([...r.lifted]).toEqual(['b']);
    });
    it('a token only standing inside lifts nothing, so the roof still hides NPCs (fog reads lifted)', () => {
        const r = roofsOpened([tokens[0]], new Set(), at);
        expect(r.inside.has('a')).toBe(true);
        expect(r.lifted.has('a')).toBe(false);
    });
    it('a token outside every roof, or none at all, opens nothing', () => {
        expect(roofsOpened([tokens[2]], ['t3'], at).inside.size).toBe(0);
        expect(roofsOpened([], [], at).inside.size).toBe(0);
    });
});

describe('door reach', () => {
    const wall = [0, 0, 100, 0];
    it('measures to the nearest point of the segment', () => {
        expect(distToSegment({ x: 50, y: 30 }, wall)).toBe(30);
        expect(distToSegment({ x: 130, y: 40 }, wall)).toBe(50);
        expect(distToSegment({ x: -30, y: -40 }, wall)).toBe(50);
    });
    it('handles a zero-length wall', () => {
        expect(distToSegment({ x: 3, y: 4 }, [0, 0, 0, 0])).toBe(5);
    });
    it('a token within reach counts, one beyond does not', () => {
        expect(doorInReach([{ x: 50, y: 150 }], wall, 150)).toBe(true);
        expect(doorInReach([{ x: 50, y: 151 }], wall, 150)).toBe(false);
        expect(doorInReach([{ x: 50, y: 500 }, { x: 10, y: 20 }], wall, 150)).toBe(true);
        expect(doorInReach([], wall, 150)).toBe(false);
    });
});
