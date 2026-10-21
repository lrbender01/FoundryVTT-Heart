// The Heart Map's own toolbar (Luke, 2026-10-03): the Heart Map's tools on
// frosted glass with Foundry's own icons and spacing, in place of Foundry's
// column of buttons (a client setting picks which). It stands up the left of the screen or runs along the top (its
// last button turns it). The tools are the same ones Foundry's buttons have
// (layer.js boardTools); a rarely used few (a picture, export, import, the
// backup, the look reloaded) are under one File button.
import { boardTools } from './layer.js';
import { isBoardScene } from './api.js';

const loc = (key) => game.i18n.localize(key);
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));

// (the few under File)
// (Luke, 2026-10-21: New place and Reshuffle first, Download beside Export)
const FILE = ['place', 'reshuffle', 'snapshot', 'bin', 'history', 'download', 'export', 'import', 'restore', 'reload'];
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
    let html = T.tools.map((t) => button(`data-tool="${t.name}"`, t.icon, t.title, t.name === lit)).join('');
    const extra = new Map(T.buttons.map((b) => [b.name, b]));
    // (no lines between the groups: every button the same step apart, as
    // Foundry's column is; Luke 2026-10-06)
    const now = [extra.get('preview'), extra.get('undo'), extra.get('redo'), extra.get('theirs')].filter(Boolean);
    if (now.length) html += `${now.map((b) => button(`data-button="${b.name}"`, b.icon, b.title, b.toggle && b.active)).join('')}`;
    const file = FILE.map((n) => extra.get(n)).filter(Boolean);
    if (file.length) {
        html += `<span class="file">${button('data-file', FA.file, loc('heart.board.tool.file'), menuOpen)}${menuOpen ? `<span class="menu">${file.map((b) => `<button type="button" data-button="${b.name}">${icon(b.icon)}<span>${esc(b.title)}</span></button>`).join('')}</span>` : ''}</span>`;
    }
    html += `${extra.get('help') ? button('data-button="help"', extra.get('help').icon, extra.get('help').title) : ''}${button('data-turn', FA.turn, loc(dir === 'vertical' ? 'heart.board.toolbar-across' : 'heart.board.toolbar-down'))}`;
    el.innerHTML = html;
}

async function onClick(event) {
    const b = event.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) {
        menuOpen = false;
        ui.controls?.initialize({ control: 'heartBoard', tool: b.dataset.tool });
        return syncRail();
    }
    if (b.dataset.file !== undefined) {
        menuOpen = !menuOpen;
        return syncRail();
    }
    if (b.dataset.turn !== undefined) {
        const dir = game.settings.get('heart', 'boardToolbarDir') === 'horizontal' ? 'vertical' : 'horizontal';
        await game.settings.set('heart', 'boardToolbarDir', dir);
        return syncRail();
    }
    if (b.dataset.button) {
        menuOpen = false;
        const t = boardTools().buttons.find((x) => x.name === b.dataset.button);
        if (!t) return syncRail();
        await t.onClick?.(t.toggle ? !t.active : undefined);
        // (a toggle's state, or the tools it brings, may have changed)
        ui.controls?.initialize({ control: 'heartBoard' });
        return syncRail();
    }
}
