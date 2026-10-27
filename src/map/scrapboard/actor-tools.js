// Foundry's own token tools, reached from the board's rail (Plenty finish,
// item 1a, 2026-10-26). On a board scene the board's layer takes every pointer
// event, so tokens could not be selected, moved, turned, or measured until the
// GM switched to Foundry's Token control and back. The rail now carries the
// token control's tools (Select, Measure, Target) and one key flips between the
// board tool last held and token Select. Pure: no Foundry globals, so it is
// tested in test/scrapboard-actor-tools.test.mjs.

// the token control's tools the rail shows: name, Foundry's own tool name,
// icon, and the lang key of its title
export const ACTOR_TOOLS = [
    { name: 'select', icon: 'fa-solid fa-expand', title: 'heart.board.tool.actors-select' },
    { name: 'ruler', icon: 'fa-solid fa-ruler', title: 'heart.board.tool.actors-ruler' },
    { name: 'target', icon: 'fa-solid fa-bullseye', title: 'heart.board.tool.actors-target' },
];

// Foundry's control names
export const BOARD_CONTROL = 'heartBoard';
export const TOKEN_CONTROL = 'token';

// whether the rail shows: while the board's control or the token control is in
// hand on a board scene
export function railControl(active) {
    return active === BOARD_CONTROL || active === TOKEN_CONTROL;
}

// The board tool last held, kept for the flip back (the board's control is
// rebuilt with its first tool in hand, tools.js, so the tool is passed back
// by name)
export function makeToolMemory(first = 'inspect') {
    let last = first;
    return {
        // a board tool taken (anything but nothing)
        hold(name) {
            if (name) last = name;
        },
        // the last board tool, or the first if it is gone from `names`
        recall(names) {
            return names?.includes(last) ? last : names?.[0] ?? first;
        },
    };
}

// What the flip key does: from the board's control to token Select, and from
// the token control back to the board tool last held. `tools` are the board
// control's tool names now.
export function flip({ control, memory, tools }) {
    if (control === TOKEN_CONTROL) return { control: BOARD_CONTROL, tool: memory.recall(tools) };
    return { control: TOKEN_CONTROL, tool: 'select' };
}

// The tool to keep when the board's controls are rebuilt in place (a toggle
// pressed, the Player view): the tool in hand if the new list still has it
export function keepTool(current, tools) {
    return tools?.includes(current) ? current : undefined;
}
