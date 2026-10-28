// The Heart Map's own toolbar (Luke, 2026-10-03): the Heart Map's tools on
// frosted glass with Foundry's own icons and spacing, in place of Foundry's
// column of buttons (a client setting picks which). It stands up the left of the screen or runs along the top (its
// last button turns it). The tools are the same ones Foundry's buttons have
// (layer.js boardTools); a rarely used few (a picture, export, import, the
// backup, the look reloaded) are under one File button.
import { boardTools } from './tools.js';
import { respotToolWindows } from './windows.js';
import { isBoardScene } from './api.js';
import { SESSION_TOOLS } from '../../common/session-tools.js';
import { railGroups, railBuckets } from './rail-groups.js';
import { ACTOR_TOOLS, BOARD_CONTROL, TOKEN_CONTROL, railControl, makeToolMemory, flip, keepTool } from './actor-tools.js';

// the board tool last held, for the flip back from the token tools
const memory = makeToolMemory();

const loc = (key) => game.i18n.localize(key);
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));

// (the few under File)
// (Luke, 2026-10-21: New place and Reshuffle first, Download beside Export)
// (and the picture and the players' strings, everyone's: Luke 2026-10-24)
// (and the GM's switch for showing their doing live: Luke 2026-10-25)
// (and everyone's statistics and quality: Luke 2026-10-25)
// (and a baked map's layers, the GM's: Luke 2026-10-25)
const FILE = ['snapshot', 'stats', 'quality', 'place', 'reshuffle', 'sheet', 'layers', 'live', 'bin', 'history', 'download', 'export', 'import', 'restore', 'reload'];
// Foundry's own icons (Luke, 2026-10-03: Foundry's icons and spacing, the
// glass kept): a tool's or button's own, and the rail's few
const FA = { file: 'fa-solid fa-folder-open', turn: 'fa-solid fa-arrows-rotate' };

export function registerRailSettings() {
    game.settings.register('heart', 'boardToolbar', {
        name: 'heart.board.toolbar',
        hint: 'heart.board.toolbar-hint',
        scope: 'client',
        config: true,
        type: String,
        choices: { heart: 'heart.board.toolbar-heart', foundry: 'heart.board.toolbar-foundry' },
        default: 'heart',
        onChange: () => {
            // (initialize, not render: the controls' own list is built by the
            // getSceneControlButtons hooks, and the rail's groups (Story,
            // Session scripting) go into Foundry's column only when the
            // toolbar is off, so a render alone left them out until the next
            // scene; Luke 2026-10-28)
            ui.controls?.initialize();
            syncRail();
            setTimeout(respotToolWindows, 50);
        },
    });
    // (the symbol detail switch lit or not, whoever changed it: Shift+Y, Setup,
    // or the rail's own button)
    Hooks.on('heartSymbolsChanged', () => syncRail());
    // (horizontal unless a client set otherwise: the Actors group sits first
    // and a long column runs into the macro bar; Plenty finish, 2026-10-26)
    game.settings.register('heart', 'boardToolbarDir', { scope: 'client', config: false, type: String, default: 'horizontal' });
}

// The flip between the board tool last held and token Select (the "Board:
// flip to the token tools" key, everyone's; Plenty finish item 1a)
export function flipActorTools() {
    if (!canvas?.ready || !isBoardScene(canvas.scene) || !railControl(ui.controls?.activeControl)) return false;
    const control = ui.controls.activeControl;
    if (control === BOARD_CONTROL) memory.hold(game.activeTool);
    const to = flip({ control, memory, tools: boardTools().list.map((t) => t.name) });
    takeControl(to.control, to.tool);
    return true;
}

// A control and its tool taken as a click on Foundry's own button takes
// them: its canvas layer activated (which lights the controls too), never
// the buttons lit alone. (Luke, 2026-10-26: after Q or the rail's Select,
// tokens could not be hovered, named, previewed, or selected: Foundry's
// SceneControls.initialize lights a control without handing its layer the
// pointer, so the board's layer kept every event.)
export function takeControl(control, tool) {
    const set = ui.controls?.controls?.find((c) => c.name === control);
    const layer = set?.layer && canvas?.ready ? canvas[set.layer] : null;
    if (layer?.activate) return layer.activate({ tool });
    return ui.controls?.initialize({ control, tool });
}

export function railOn() {
    try {
        return game.settings.get('heart', 'boardToolbar') !== 'foundry';
    } catch {
        return false;
    }
}

let menuOpen = false;
// the folded group whose sub-rail is open (its id), if any: a module's group
// (rail-groups.js), opened as File is, one menu at a time
let openGroup = null;

// Groups other modules added are drawn again when one comes, goes, or
// changes which tool is lit
railGroups.onChange(() => syncRail());

// A group's buttons for the rail (Luke, 2026-10-27: the Story group). Not
// folded: a button each, as Session scripting. Folded: one button and, open,
// its tools as tiles beside it.
function groupHtml(g, button, icon) {
    const lit = (t) => {
        try {
            return Boolean(t.on?.());
        } catch {
            return false;
        }
    };
    if (!g.fold) return g.tools.map((t) => button(`data-group-tool="${esc(g.id)}:${esc(t.name)}"`, t.icon, loc(t.title), lit(t))).join('');
    const open = openGroup === g.id;
    const tiles = g.tools
        .map((t) => `<button type="button" data-group-tool="${esc(g.id)}:${esc(t.name)}" class="tile ${lit(t) ? 'on' : ''}" data-tooltip="${esc(loc(t.title))}" aria-label="${esc(loc(t.title))}">${icon(t.icon)}<span>${esc(loc(t.label))}</span></button>`)
        .join('');
    return `<span class="group">${button(`data-group="${esc(g.id)}"`, g.icon, loc(g.title), open)}${open ? `<span class="menu" style="grid-template-columns: repeat(${Math.min(g.tools.length, 4)}, 78px)">${tiles}</span>` : ''}</span>`;
}

// One group of the rail (Luke, 2026-10-28): its buttons and a tiny label under
// them. Nothing is drawn when the group has no buttons for this person.
function grp(id, label, inner) {
    if (!inner) return '';
    return `<span class="grp grp-${esc(id)}" role="group" aria-label="${esc(label)}">${inner}<i class="glab" aria-hidden="true">${esc(label)}</i></span>`;
}

// Foundry's own column's version of the groups, for when the board's toolbar
// is switched off (the rail has them otherwise): one control a group, a board's
// only unless its maker said otherwise
export function railGroupControls(controls) {
    if (railOn()) return;
    const gm = Boolean(game.user?.isGM);
    for (const g of railGroups.list({ gm })) {
        if (g.boardOnly && !isBoardScene(canvas?.scene)) continue;
        controls.push({
            name: `heartGroup-${g.id}`,
            title: loc(g.title),
            icon: g.icon,
            layer: 'tokens',
            visible: true,
            activeTool: '',
            tools: g.tools.map((t) => ({ name: t.name, title: loc(t.title), icon: t.icon, button: true, onClick: () => t.run() })),
        });
    }
}

// Whether a click on `tool` puts it down for Look (Luke, 2026-10-25: the tool
// in hand clicked again; Look, the board's resting state, stays)
export function againToLook(tool) {
    return Boolean(tool) && tool !== 'inspect' && ui.controls?.activeControl === 'heartBoard' && game.activeTool === tool && boardTools().tools.some((t) => t.name === 'inspect');
}

// The rail as things stand: shown on a board scene (with the setting on),
// its tool lit while the Heart Map's tools are in hand
export function syncRail() {
    let el = document.getElementById('heart-board-rail');
    // (only while the Heart Map's control is the one in hand: Luke 2026-10-06;
    // or the token control, whose Select, Measure, and Target the rail carries:
    // Plenty finish item 1a)
    const control = ui.controls?.activeControl;
    const on = railOn() && canvas?.ready && isBoardScene(canvas.scene) && railControl(control);
    if (on && control === BOARD_CONTROL) memory.hold(game.activeTool);
    document.body.classList.toggle('heart-board-rail-on', Boolean(on));
    if (!on) {
        el?.remove();
        return;
    }
    if (!el) {
        // (a new rail, its File menu shut: Luke 2026-10-25, it reopened
        // already open on the next board)
        menuOpen = false;
        openGroup = null;
        el = document.createElement('nav');
        el.id = 'heart-board-rail';
        el.addEventListener('click', onClick);
        document.body.append(el);
    }
    let dir = 'vertical';
    try {
        dir = game.settings.get('heart', 'boardToolbarDir') === 'horizontal' ? 'horizontal' : 'vertical';
    } catch {
        dir = 'vertical';
    }
    el.className = `heart-board-rail ${dir}`;
    // (Foundry's own buttons' size, as this client draws them: Luke 2026-10-06)
    const fli = document.querySelector('#controls .scene-control');
    const fb = fli?.getBoundingClientRect();
    if (fb?.width > 8) {
        const cs = getComputedStyle(fli);
        el.style.setProperty('--rail-btn', `${Math.round(fb.width)}px`);
        // (its icons' size and the gap between its buttons: Foundry's 24px and 10px)
        el.style.setProperty('--rail-icon', cs.fontSize || '24px');
        el.style.setProperty('--rail-gap', cs.marginBottom && cs.marginBottom !== '0px' ? cs.marginBottom : '10px');
        el.style.setProperty('--rail-left', `${Math.round(fb.right + 8)}px`);
        el.style.setProperty('--rail-top', `${Math.round(fb.top)}px`);
    }
    const T = boardTools();
    const lit = control === BOARD_CONTROL ? game.activeTool : null;
    const litActor = control === TOKEN_CONTROL ? game.activeTool : null;
    const icon = (cls) => `<i class="${cls}" aria-hidden="true"></i>`;
    const button = (attr, cls, title, on = false) => `<button type="button" ${attr} class="${on ? 'on' : ''}" data-tooltip="${esc(title)}" aria-label="${esc(title)}">${icon(cls)}</button>`;
    // (grouped by purpose as Map Dreamer's rail is, Luke 2026-10-28: Map,
    // Users, the modules' groups, App; a thin rule between groups and a tiny
    // label under each, in the space below the rail so its height holds; a
    // group with no buttons for this person is not drawn, so no label either)
    const file = T.list.filter((b) => FILE.includes(b.name));
    const { map, users, app } = railBuckets(T.list, FILE);
    const one = (t) => (t.button || t.toggle ? button(`data-button="${t.name}"`, t.icon, t.title, t.toggle && t.active) : button(`data-tool="${t.name}"`, t.icon, t.title, t.name === lit));
    // (the Actors' Foundry token tools lead the Map group, for everyone)
    const actors = ACTOR_TOOLS.map((a) => button(`data-actor-tool="${a.name}"`, a.icon, loc(a.title), a.name === litActor)).join('');
    let html = grp('map', loc('heart.board.rail-group.map'), actors + map.map(one).join(''));
    html += grp('users', loc('heart.board.rail-group.users'), users.map(one).join(''));
    // (the Session scripting group, the GM's)
    if (game.user.isGM) html += grp('session', loc('heart.board.rail-group.session'), SESSION_TOOLS.map((s) => button(`data-session="${s.name}"`, s.icon, loc(s.title))).join(''));
    // (the groups other modules added, the GM's and everyone's: Story, 2026-10-27;
    // each labelled with its own title)
    const groups = railGroups.list({ gm: game.user.isGM });
    if (openGroup && !groups.some((g) => g.id === openGroup)) openGroup = null;
    // (a group's tiny label is its short `label`, its title the tooltip: the
    // whole sentence under the group ran past the rail, 2026-10-28)
    for (const g of groups) html += grp(`mod-${g.id}`, loc(g.label), groupHtml(g, button, icon));
    // (App: File's few as tiles, Help, then the turn; Luke, 2026-10-25: tiles,
    // an icon and a word or two, the whole title its tooltip; kept on screen,
    // above the macro bar)
    const short = (b) => (game.i18n.has(`heart.board.fileshort.${b.name}`) ? loc(`heart.board.fileshort.${b.name}`) : b.title);
    const fileHtml = file.length ? `<span class="file">${button('data-file', FA.file, loc('heart.board.tool.file'), menuOpen)}${menuOpen ? `<span class="menu">${file.map((b) => `<button type="button" data-button="${b.name}" class="tile ${b.toggle && b.active ? 'on' : ''}" data-tooltip="${esc(b.title)}" aria-label="${esc(b.title)}">${icon(b.icon)}<span>${esc(short(b))}</span></button>`).join('')}</span>` : ''}</span>` : '';
    html += grp('app', loc('heart.board.rail-group.app'), fileHtml + app.map(one).join('') + button('data-turn', FA.turn, loc('heart.board.toolbar-turn')));
    el.innerHTML = html;
    fitMenu(el);
    // (the tool windows never moved by hand by it, now it is there)
    respotToolWindows(false);
}

// The File menu kept on screen: above the macro bar, inside the window's
// edges; scrolled if it is taller than the room there (Luke, 2026-10-25)
function fitMenu(el) {
    const menu = el.querySelector('.menu');
    if (!menu) return;
    const hot = document.getElementById('hotbar')?.getBoundingClientRect();
    const floor = (hot?.height && hot.top > 120 ? hot.top : window.innerHeight) - 8;
    const at = (side) => parseFloat(getComputedStyle(menu)[side]) || 0;
    let r = menu.getBoundingClientRect();
    if (r.bottom > floor) menu.style.top = `${Math.round(at('top') - (r.bottom - floor))}px`;
    r = menu.getBoundingClientRect();
    if (r.top < 8) {
        menu.style.top = `${Math.round(at('top') + (8 - r.top))}px`;
        menu.style.maxHeight = `${Math.max(120, Math.round(floor - 8))}px`;
        menu.style.overflowY = 'auto';
    }
    r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) menu.style.left = `${Math.round(at('left') - (r.right - window.innerWidth + 8))}px`;
}

async function onClick(event) {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.actorTool) {
        menuOpen = false;
        openGroup = null;
        if (ui.controls?.activeControl === BOARD_CONTROL) memory.hold(game.activeTool);
        takeControl(TOKEN_CONTROL, b.dataset.actorTool);
        return syncRail();
    }
    if (b.dataset.session) {
        menuOpen = false;
        openGroup = null;
        await SESSION_TOOLS.find((s) => s.name === b.dataset.session)?.run();
        return syncRail();
    }
    // a module's group (rail-groups.js): its one button opens or shuts its
    // sub-rail; a tool of it runs (the sub-rail stays, as File's does). The
    // registry never hands a player a GM group's tool.
    if (b.dataset.group !== undefined) {
        menuOpen = false;
        openGroup = openGroup === b.dataset.group ? null : b.dataset.group;
        return syncRail();
    }
    if (b.dataset.groupTool) {
        const at = b.dataset.groupTool.indexOf(':');
        const group = b.dataset.groupTool.slice(0, at);
        const t = railGroups.tool(group, b.dataset.groupTool.slice(at + 1), { gm: game.user.isGM });
        if (!t) return syncRail();
        if (!railGroups.get(group)?.fold) {
            menuOpen = false;
            openGroup = null;
        }
        try {
            await t.run();
        } catch (err) {
            console.error('heart | a rail group tool failed', group, t.name, err);
            ui.notifications?.error(String(err?.message ?? err));
        }
        return syncRail();
    }
    if (b.dataset.tool) {
        menuOpen = false;
        openGroup = null;
        takeControl(BOARD_CONTROL, againToLook(b.dataset.tool) ? 'inspect' : b.dataset.tool);
        return syncRail();
    }
    if (b.dataset.file !== undefined) {
        menuOpen = !menuOpen;
        openGroup = null;
        return syncRail();
    }
    if (b.dataset.turn !== undefined) {
        const dir = game.settings.get('heart', 'boardToolbarDir') === 'horizontal' ? 'vertical' : 'horizontal';
        await game.settings.set('heart', 'boardToolbarDir', dir);
        syncRail();
        // (the tool windows open follow it: Luke 2026-10-25)
        return respotToolWindows();
    }
    if (b.dataset.button) {
        // (File's items keep it open: File again, or a tool, shuts it; Luke 2026-10-25)
        if (!FILE.includes(b.dataset.button)) menuOpen = false;
        openGroup = null;
        const t = boardTools().buttons.find((x) => x.name === b.dataset.button);
        if (!t) return syncRail();
        await t.onClick?.(t.toggle ? !t.active : undefined);
        // (a toggle's state, or the tools it brings, may have changed; the
        // board's control is rebuilt only if it was in hand, with the tool
        // kept, so a button never pulls the GM off the tokens)
        if (ui.controls?.activeControl === BOARD_CONTROL) {
            const tool = keepTool(game.activeTool, boardTools().list.map((x) => x.name));
            ui.controls.initialize({ control: BOARD_CONTROL, ...(tool ? { tool } : {}) });
        }
        return syncRail();
    }
}
