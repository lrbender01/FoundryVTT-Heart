// The Heart map's own windows over the board (2026-10-25, split out of
// layer.js): each tool's window dragged by its head, sized by its corner,
// kept where and as large as this client left it, put back by the toolbar,
// carried across a scene change, and its contents written only when they
// change. The layer builds what each window holds; this places and keeps it.
const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));

// where each tool window is kept once moved by hand (this client's; the
// brush window's, dragged anywhere and never closed, since Luke 2026-10-06)
export const PALETTE_AT = 'heart.board.paletteAt';
export const DOODLES_AT = 'heartBoard.doodlesAt';
export const STRING_AT = 'heartBoard.stringAt';
export const PINWIN_AT = 'heartBoard.pinAt';
export const ERASEWIN_AT = 'heartBoard.eraseAt';

// this client's own memory of its windows (none in a private window)
export const kept = {
    get(k, d = null) {
        try {
            const v = localStorage.getItem(k);
            return v === null ? d : JSON.parse(v);
        } catch {
            return d;
        }
    },
    set(k, v) {
        try {
            if (v === null || v === undefined) localStorage.removeItem(k);
            else localStorage.setItem(k, JSON.stringify(v));
        } catch {
            // (a private window: not kept)
        }
    },
};

// A window of the map's own over the board (Luke, 2026-10-25): dragged by
// its head, sized by its corner, kept where and as large as this client left
// it; a double-click on its head steps through its views (`views`, the first
// the whole of it). `moved(why)`: after a drag ('drag', 'dropped'), a size
// ('size'), or a new view ('view').
export function floating(id, cls, { at, view, views, size = null, moved = null }) {
    const el = document.createElement('div');
    el.id = id;
    el.className = cls;
    const v = kept.get(view);
    el.dataset.view = views.includes(v) ? v : views[0];
    document.body.append(el);
    // (each time its tool is taken, by the toolbar at the top left; moved
    // while it is open: Luke 2026-10-25)
    // (but where it was moved to, its tool still in hand, when the scene
    // changed under it)
    const c = carried.get(id);
    carried.delete(id);
    if (c && c.scene !== (canvas?.scene?.id ?? null) && Date.now() - c.t < 60000) {
        kept.set(at, c.at);
        Object.assign(el.style, { left: `${c.at.x}px`, top: `${c.at.y}px`, bottom: 'auto', right: 'auto', transform: 'none' });
    } else {
        kept.set(at, null);
        const spot = toolWindowSpot();
        Object.assign(el.style, { left: `${spot.x}px`, top: `${spot.y}px`, bottom: 'auto', right: 'auto', transform: 'none' });
    }
    const sizeNow = () => (size ? kept.get(size) : null);
    const fit = () => {
        const sz = sizeNow();
        if (sz?.w > 120) el.style.width = `${sz.w}px`;
        el.style.height = el.dataset.view !== views[0] || !(sz?.h > 60) ? '' : `${sz.h}px`;
    };
    fit();
    new ResizeObserver(() => {
        if (!el.isConnected || !el.offsetWidth) return;
        moved?.('size');
    }).observe(el);
    // (a size kept only when set by hand, by its corner: what it holds
    // changing never keeps one, so it always opens tall enough; Luke
    // 2026-10-25)
    el.addEventListener('pointerdown', (ev) => {
        const r0 = el.getBoundingClientRect();
        if (ev.clientX < r0.right - 22 || ev.clientY < r0.bottom - 22) return;
        const up = () => {
            window.removeEventListener('pointerup', up);
            if (!el.isConnected) return;
            const w1 = Math.round(el.offsetWidth);
            const h1 = Math.round(el.offsetHeight);
            if (Math.abs(w1 - r0.width) < 2 && Math.abs(h1 - r0.height) < 2) return;
            if (size && el.dataset.view === views[0]) kept.set(size, { w: w1, h: h1 });
        };
        window.addEventListener('pointerup', up);
    });
    el.addEventListener('pointerdown', (ev) => {
        if (!ev.target.closest('[data-grip]') || ev.target.closest('button, input')) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        const dx = ev.clientX - r.left;
        const dy = ev.clientY - r.top;
        // (kept only once it has really moved: a press on its head is no move)
        let went = false;
        const move = (e) => {
            if (!went && Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) < 4) return;
            went = true;
            placeLoose(el, e.clientX - dx, e.clientY - dy);
            moved?.('drag');
        };
        // (let go, or the pointer lost: a pen or touch can end in a cancel)
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            if (!went) return;
            fitOnScreen(el);
            if (el.style.left) kept.set(at, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
            moved?.('dropped');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', (ev) => {
        if (!ev.target.closest('[data-grip]') || ev.target.closest('button, input')) return;
        el.dataset.view = views[(views.indexOf(el.dataset.view) + 1) % views.length];
        kept.set(view, el.dataset.view);
        fit();
        moved?.('view');
    });
    return el;
}

// The tool windows open now put back by the toolbar (it was turned, or
// swapped for Foundry's: Luke 2026-10-25, they were left under it). `all`
// false: only those never moved by hand (the toolbar drawn again, as after
// a scene change: a window made before it was there sat by Foundry's)
export function respotToolWindows(all = true) {
    const spot = toolWindowSpot();
    for (const [id, at] of TOOL_WINDOWS) {
        const el = document.getElementById(id);
        if (!el || (!all && kept.get(at))) continue;
        kept.set(at, null);
        el.style.right = 'auto';
        placePalette(el, spot.x, spot.y);
    }
    canvas?.heartBoard?.dockDoodles?.();
}

// the tool windows, and where each is kept once moved by hand
const TOOL_WINDOWS = [['heart-board-palette', PALETTE_AT], ['heart-board-string', STRING_AT], ['heart-board-pinwin', PINWIN_AT], ['heart-board-erasewin', ERASEWIN_AT]];

// A window of another module's (the Story group's, 2026-10-27) joined to them:
// put back by the toolbar when it turns, and carried across a scene change.
// `at` is the localStorage key the window keeps its place under (floating's).
export function registerToolWindow(id, at) {
    if (!TOOL_WINDOWS.some(([i]) => i === id)) TOOL_WINDOWS.push([id, at]);
}

// Windows moved by hand, put away as their scene was left ({ id: { scene,
// at, t } }): one opened again on the next board, its tool still in hand,
// opens where it was (Luke 2026-10-25: they jumped back by the toolbar)
export const carried = new Map();
export function carryWindows() {
    const scene = canvas?.scene?.id ?? null;
    for (const [id, at] of [...TOOL_WINDOWS, ['heart-board-doodles', DOODLES_AT]]) {
        const p = kept.get(at);
        if (document.getElementById(id) && Number.isFinite(p?.x)) carried.set(id, { scene, at: p, t: Date.now() });
    }
}

// Where a tool's window opens (Luke, 2026-10-25): just right of the board's
// toolbar, level with its top; under it when it runs along the top; else
// right of Foundry's own controls
function toolWindowSpot() {
    const rail = document.getElementById('heart-board-rail');
    const r = rail?.getBoundingClientRect();
    if (r?.width) return rail.classList.contains('horizontal') ? { x: Math.round(r.left), y: Math.round(r.bottom + 8) } : { x: Math.round(r.right + 8), y: Math.round(r.top) };
    const c = document.getElementById('controls')?.getBoundingClientRect();
    return c?.width ? { x: Math.round(c.right + 8), y: Math.round(c.top) } : { x: 120, y: 80 };
}

// A window being dragged: anywhere, its head kept on screen (Luke,
// 2026-10-25: one taller than the room below stuck where it was)
function placeLoose(el, x, y) {
    const r = el.getBoundingClientRect();
    const px = Math.max(4, Math.min(window.innerWidth - r.width - 4, x));
    const py = Math.max(4, Math.min(window.innerHeight - 44, y));
    Object.assign(el.style, { left: `${px}px`, top: `${py}px`, bottom: 'auto', transform: 'none' });
}

// a window let go: as tall as fits on the screen below where it sits
function fitOnScreen(el) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= window.innerHeight - 4) return;
    el.style.height = `${Math.max(120, Math.round(window.innerHeight - 4 - r.top))}px`;
}

// a window put where this client left it (`at`), kept in the window
export function placeKept(el, at) {
    const p = kept.get(at);
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) placePalette(el, p.x, p.y);
    else if (el.style.left) placePalette(el, parseFloat(el.style.left), parseFloat(el.style.top));
}
// The palette kept in the window, at x, y (px)
export function placePalette(el, x, y) {
    const r = el.getBoundingClientRect();
    const px = Math.max(4, Math.min(window.innerWidth - r.width - 4, x));
    const py = Math.max(4, Math.min(window.innerHeight - r.height - 4, y));
    Object.assign(el.style, { left: `${px}px`, top: `${py}px`, bottom: 'auto', transform: 'none' });
}

// A tool window's contents written only when they change (Luke, 2026-10-25:
// every board update rewrote the windows, and a slider dragged or a button
// pressed as someone's stroke landed lost the press), and never while the
// pointer is held down in it: then once it is let go (`again`). True when
// written.
export function writeWindow(el, html, again) {
    if (el.heartHtml === html) return false;
    if (el.matches(':active')) {
        if (!el.heartWaiting) {
            el.heartWaiting = true;
            window.addEventListener('pointerup', () => {
                el.heartWaiting = false;
                if (el.isConnected) again();
            }, { once: true });
        }
        return false;
    }
    el.heartHtml = html;
    el.innerHTML = html;
    return true;
}

// a tool window's x (Luke, 2026-10-25)
export const shutButton = () => `<button type="button" data-wclose class="wclose" data-tooltip="${esc(loc('heart.board.window-close'))}" aria-label="${esc(loc('heart.board.window-close'))}"><i class="fa-solid fa-xmark"></i></button>`;
