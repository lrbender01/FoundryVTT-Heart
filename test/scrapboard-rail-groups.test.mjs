import { describe, it, expect, vi } from 'vitest';
import { normaliseGroup, normaliseTool, createRailGroups } from '../src/map/scrapboard/rail-groups.js';

const tool = (name, extra = {}) => ({ name, icon: 'fa-solid fa-star', title: `${name} does a thing`, run: () => name, ...extra });
const group = (id, extra = {}) => ({ id, icon: 'fa-solid fa-book', title: 'Story', tools: [tool('setup'), tool('notes')], ...extra });

describe('rail groups: a tool', () => {
    it('keeps its parts and takes the title as its label when it has none', () => {
        const t = normaliseTool(tool('setup'));
        expect(t.name).toBe('setup');
        expect(t.label).toBe('setup does a thing');
        expect(t.on).toBeNull();
        expect(normaliseTool(tool('setup', { label: 'Setup' })).label).toBe('Setup');
    });

    it('refuses a tool that could not run or be told apart', () => {
        expect(() => normaliseTool(null)).toThrow();
        expect(() => normaliseTool(tool('', {}))).toThrow(/tool name/);
        expect(() => normaliseTool(tool('a b'))).toThrow(/letters/);
        expect(() => normaliseTool(tool('x', { run: null }))).toThrow(/run function/);
        expect(() => normaliseTool(tool('x', { on: true }))).toThrow(/on that is not a function/);
        expect(() => normaliseTool(tool('x', { icon: '' }))).toThrow(/icon/);
        expect(() => normaliseTool(tool('x', { title: '  ' }))).toThrow(/title/);
    });
});

describe('rail groups: a group', () => {
    it('is the GM\'s and a board\'s unless said otherwise', () => {
        const g = normaliseGroup(group('story'));
        expect(g.gmOnly).toBe(true);
        expect(g.boardOnly).toBe(true);
        expect(g.fold).toBe(false);
        expect(normaliseGroup(group('story', { gmOnly: false, boardOnly: false, fold: true }))).toMatchObject({ gmOnly: false, boardOnly: false, fold: true });
    });

    it('refuses a group with no way in or two tools of one name', () => {
        expect(() => normaliseGroup(group('story', { tools: [] }))).toThrow(/at least one tool/);
        expect(() => normaliseGroup(group('story', { tools: undefined }))).toThrow(/at least one tool/);
        expect(() => normaliseGroup(group('story', { tools: [tool('a'), tool('a')] }))).toThrow(/two tools/);
        expect(() => normaliseGroup(group('1story'))).toThrow(/letters/);
        expect(() => normaliseGroup(group(''))).toThrow(/group id/);
        expect(() => normaliseGroup(undefined)).toThrow();
    });
});

describe('rail groups: the registry', () => {
    it('lists groups in the order first registered, a repeat replacing in place', () => {
        const r = createRailGroups();
        r.register(group('a', { gmOnly: false }));
        r.register(group('b', { gmOnly: false }));
        r.register(group('a', { gmOnly: false, title: 'Again' }));
        expect(r.list({ gm: true }).map((g) => g.id)).toEqual(['a', 'b']);
        expect(r.get('a').title).toBe('Again');
    });

    it('shows a player only the groups that are not the GM\'s', () => {
        const r = createRailGroups();
        r.register(group('gm'));
        r.register(group('all', { gmOnly: false }));
        expect(r.list().map((g) => g.id)).toEqual(['all']);
        expect(r.list({ gm: true }).map((g) => g.id)).toEqual(['gm', 'all']);
    });

    it('never hands a player a GM group\'s tool', () => {
        const r = createRailGroups();
        r.register(group('gm'));
        r.register(group('all', { gmOnly: false }));
        expect(r.tool('gm', 'setup')).toBeNull();
        expect(r.tool('gm', 'setup', { gm: true }).name).toBe('setup');
        expect(r.tool('all', 'setup').name).toBe('setup');
        expect(r.tool('all', 'nope')).toBeNull();
        expect(r.tool('nope', 'setup', { gm: true })).toBeNull();
    });

    it('tells its listeners when a group comes, goes, or is refreshed, and a listener that throws does not stop the rest', () => {
        const r = createRailGroups();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const bad = vi.fn(() => {
            throw new Error('x');
        });
        const good = vi.fn();
        r.onChange(bad);
        const off = r.onChange(good);
        r.register(group('a'));
        r.refresh();
        expect(r.unregister('a')).toBe(true);
        expect(r.unregister('a')).toBe(false);
        expect(good).toHaveBeenCalledTimes(3);
        off();
        r.register(group('b'));
        expect(good).toHaveBeenCalledTimes(3);
        warn.mockRestore();
    });

    it('does not register a bad group or tell anyone', () => {
        const r = createRailGroups();
        const fn = vi.fn();
        r.onChange(fn);
        expect(() => r.register({ id: 'x' })).toThrow();
        expect(r.list({ gm: true })).toEqual([]);
        expect(fn).not.toHaveBeenCalled();
    });
});
