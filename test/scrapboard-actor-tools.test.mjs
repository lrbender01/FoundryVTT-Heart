import { describe, it, expect } from 'vitest';
import { ACTOR_TOOLS, railControl, makeToolMemory, flip, keepTool } from '../src/map/scrapboard/actor-tools.js';

describe('actor tools on the rail', () => {
    it('names Foundry token tools with titles', () => {
        expect(ACTOR_TOOLS.map((t) => t.name)).toEqual(['select', 'ruler', 'target']);
        for (const t of ACTOR_TOOLS) expect(t.title).toMatch(/^heart\.board\.tool\.actors-/);
    });

    it('shows the rail for the board control and the token control only', () => {
        expect(railControl('heartBoard')).toBe(true);
        expect(railControl('token')).toBe(true);
        expect(railControl('walls')).toBe(false);
        expect(railControl(undefined)).toBe(false);
    });

    it('remembers the board tool last held', () => {
        const m = makeToolMemory('inspect');
        const names = ['inspect', 'move', 'mark', 'erase'];
        expect(m.recall(names)).toBe('inspect');
        m.hold('mark');
        m.hold(null);
        expect(m.recall(names)).toBe('mark');
        // a tool gone from the list (Player view) falls back to the first
        expect(m.recall(['inspect', 'move'])).toBe('inspect');
    });

    it('flips from the board to token Select, and back to the last tool', () => {
        const m = makeToolMemory();
        const tools = ['inspect', 'mark', 'erase'];
        m.hold('mark');
        expect(flip({ control: 'heartBoard', memory: m, tools })).toEqual({ control: 'token', tool: 'select' });
        expect(flip({ control: 'token', memory: m, tools })).toEqual({ control: 'heartBoard', tool: 'mark' });
    });

    it('keeps the tool in hand when the controls are rebuilt, if it is still there', () => {
        expect(keepTool('mark', ['inspect', 'mark'])).toBe('mark');
        expect(keepTool('reveal', ['inspect', 'mark'])).toBeUndefined();
    });
});
