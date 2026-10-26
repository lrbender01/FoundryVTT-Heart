// The Heart Map's own toolbar (Luke, 2026-10-03): the Heart Map's tools on
// frosted glass with Foundry's own icons and spacing, in place of Foundry's
// column of buttons (a client setting picks which). It stands up the left of the screen or runs along the top (its
// last button turns it). The tools are the same ones Foundry's buttons have
// (layer.js boardTools); a rarely used few (a picture, export, import, the
// backup, the look reloaded) are under one File button.
import { boardTools } from './tools.js';
import { respotToolWindows } from './windows.js';
import { isBoardScene } from './api.js';

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
            ui.controls?.render(true);
            syncRail();
            setTimeout(respotToolWindows, 50);
        },
    });
    game.settings.register('heart', 'boardToolbarDir', { scope: 'client', config: false, type: String, default: 'vertical' });
}

export function railOn() {
    try {
        return game.settings.get('heart', 'boardToolbar') !== 'foundry';
    } catch {
        return false;
    }
}

let menuOpen = false;

// Whether a click on `tool` puts it down for Look (Luke, 2026-10-25: the tool
// in hand clicked again; Look, the board's resting state, stays)
export function againToLook(tool) {
    return Boolean(tool) && tool !== 'inspect' && ui.controls?.activeControl === 'heartBoard' && game.activeTool === tool && boardTools().tools.some((t) => t.name === 'inspect');
}

// The rail as things stand: shown on a board scene (with the setting on),
// its tool lit while the Heart Map's tools are in hand
export function syncRail() {
    let el = document.getElementById('heart-board-rail');
    // (only while the Heart Map's control is the one in hand: Luke 2026-10-06)
    const on = railOn() && canvas?.ready && isBoardScene(canvas.scene) && ui.controls?.activeControl === 'heartBoard';
    document.body.classList.toggle('heart-board-rail-on', Boolean(on));
    if (!on) {
        el?.remove();
        return;
    }
    if (!el) {
        // (a new rail, its File menu shut: Luke 2026-10-25, it reopened
        // already open on the next board)
        menuOpen = false;
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
    const lit = ui.controls?.activeControl === 'heartBoard' ? game.activeTool : null;
    const icon = (cls) => `<i class="${cls}" aria-hidden="true"></i>`;
    const button = (attr, cls, title, on = false) => `<button type="button" ${attr} class="${on ? 'on' : ''}" data-tooltip="${esc(title)}" aria-label="${esc(title)}">${icon(cls)}</button>`;
    // (in the one order boardTools gives, Luke 2026-10-24: File where its
    // first item falls; no lines between the groups, every button the same
    // step apart, as Foundry's column is)
    const file = T.list.filter((b) => FILE.includes(b.name));
    let html = '';
    let filed = false;
    for (const t of T.list) {
        if (FILE.includes(t.name)) {
            if (filed) continue;
            filed = true;
            // (Luke, 2026-10-25: tiles, an icon and a word or two, the whole
            // title its tooltip; kept on screen, above the macro bar)
            const short = (b) => (game.i18n.has(`heart.board.fileshort.${b.name}`) ? loc(`heart.board.fileshort.${b.name}`) : b.title);
            html += `<span class="file">${button('data-file', FA.file, loc('heart.board.tool.file'), menuOpen)}${menuOpen ? `<span class="menu">${file.map((b) => `<button type="button" data-button="${b.name}" class="tile ${b.toggle && b.active ? 'on' : ''}" data-tooltip="${esc(b.title)}" aria-label="${esc(b.title)}">${icon(b.icon)}<span>${esc(short(b))}</span></button>`).join('')}</span>` : ''}</span>`;
            continue;
        }
        html += t.button || t.toggle ? button(`data-button="${t.name}"`, t.icon, t.title, t.toggle && t.active) : button(`data-tool="${t.name}"`, t.icon, t.title, t.name === lit);
    }
    html += button('data-turn', FA.turn, loc('heart.board.toolbar-turn'));
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
    if (b.dataset.tool) {
        menuOpen = false;
        ui.controls?.initialize({ control: 'heartBoard', tool: againToLook(b.dataset.tool) ? 'inspect' : b.dataset.tool });
        return syncRail();
    }
    if (b.dataset.file !== undefined) {
        menuOpen = !menuOpen;
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
        const t = boardTools().buttons.find((x) => x.name === b.dataset.button);
        if (!t) return syncRail();
        await t.onClick?.(t.toggle ? !t.active : undefined);
        // (a toggle's state, or the tools it brings, may have changed)
        ui.controls?.initialize({ control: 'heartBoard' });
        return syncRail();
    }
}
