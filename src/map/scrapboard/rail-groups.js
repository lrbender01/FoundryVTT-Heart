// Groups other modules add to the board's rail (Luke, 2026-10-27: Heart Board
// Tools leaves its macro and joins the board's controls, as a GM group named
// Story). A module registers a group at ready:
//
//   game.heart.board.railGroups.register({
//       id: 'story', icon: 'fa-solid fa-book-open', title: 'Story',
//       gmOnly: true, fold: true,
//       tools: [{ name: 'setup', icon: 'fa-solid fa-sliders', title: 'Setup: ...', label: 'Setup', run, on }],
//   });
//
// The rail (rail.js) draws every group it may show on a board scene, after the
// Session scripting buttons and before the turn button, in the rail's glass and
// in both layouts. `fold` puts the tools under one button that opens a sub-rail
// beside it (as File does); otherwise each tool is a button of its own.
// `on()` says whether a tool is lit (a window of it open); call `refresh()`
// when that changes by other means. This file is plain (no Foundry globals) so
// the rules are tested (test/rail-groups.test.mjs).

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

const text = (v, what) => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`rail group: ${what} must be a non-empty string`);
    return v;
};

// A tool as the rail keeps it. `title` is the tooltip (a lang key or plain
// text), `label` the few words on a folded group's tile (the title if none).
export function normaliseTool(def, seen = new Set()) {
    if (!def || typeof def !== 'object') throw new Error('rail group: a tool must be an object');
    const name = text(def.name, 'a tool name');
    if (!ID.test(name)) throw new Error(`rail group: the tool name "${name}" may hold only letters, digits, - and _`);
    if (seen.has(name)) throw new Error(`rail group: two tools are named "${name}"`);
    seen.add(name);
    if (typeof def.run !== 'function') throw new Error(`rail group: the tool "${name}" needs a run function`);
    if (def.on !== undefined && typeof def.on !== 'function') throw new Error(`rail group: the tool "${name}" has an on that is not a function`);
    const title = text(def.title, `the tool "${name}" title`);
    return {
        name,
        icon: text(def.icon, `the tool "${name}" icon`),
        title,
        label: typeof def.label === 'string' && def.label.trim() ? def.label : title,
        run: def.run,
        on: def.on ?? null,
    };
}

// A group as the rail keeps it. gmOnly defaults to true: a group is the GM's
// unless its maker says otherwise. boardOnly defaults to true: the rail is
// only ever drawn on a board, but Foundry's own column (the fallback when the
// board's toolbar is switched off) is told the same.
export function normaliseGroup(def) {
    if (!def || typeof def !== 'object') throw new Error('rail group: a group must be an object');
    const id = text(def.id, 'the group id');
    if (!ID.test(id)) throw new Error(`rail group: the id "${id}" may hold only letters, digits, - and _`);
    if (!Array.isArray(def.tools) || !def.tools.length) throw new Error(`rail group "${id}": it needs at least one tool`);
    const seen = new Set();
    return {
        id,
        icon: text(def.icon, `the group "${id}" icon`),
        title: text(def.title, `the group "${id}" title`),
        gmOnly: def.gmOnly !== false,
        fold: Boolean(def.fold),
        boardOnly: def.boardOnly !== false,
        tools: def.tools.map((t) => normaliseTool(t, seen)),
    };
}

// The registry. A group registered again under its id is replaced in its
// place (a module reloaded keeps its spot); order is order of first
// registration.
export function createRailGroups() {
    const groups = new Map();
    const listeners = new Set();
    const notify = () => {
        for (const fn of [...listeners]) {
            try {
                fn();
            } catch (err) {
                console.warn('heart | a rail group listener failed', err);
            }
        }
    };
    return {
        register(def) {
            const g = normaliseGroup(def);
            groups.set(g.id, g);
            notify();
            return g.id;
        },
        unregister(id) {
            const had = groups.delete(id);
            if (had) notify();
            return had;
        },
        get: (id) => groups.get(id) ?? null,
        // the groups this person may see
        list({ gm = false } = {}) {
            return [...groups.values()].filter((g) => gm || !g.gmOnly);
        },
        // one tool, or null: a player never gets a GM group's tool
        tool(groupId, name, { gm = false } = {}) {
            const g = groups.get(groupId);
            if (!g || (g.gmOnly && !gm)) return null;
            return g.tools.find((t) => t.name === name) ?? null;
        },
        // the rail drawn again (a tool's lit state changed by other means)
        refresh: notify,
        onChange(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
}

// the one registry the board uses
export const railGroups = createRailGroups();
