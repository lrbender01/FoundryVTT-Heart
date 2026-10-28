// The board's statistics and its quality, under File (Luke, 2026-10-25):
// for everyone, a window of what is on the board as this user sees it (cards,
// strokes, pins, strings), what is moving (everyone else's live previews,
// what this user just laid down), and how this computer is doing (frame
// rate, tiles, memory), kept up to date while it is open; and the board's
// quality (the boardDetail setting) picked in one click.
//
// The counting (boardCounts, liveCounts, fmtBytes) is plain, no Foundry
// globals; the windows are Foundry's.
import { heartDialogOptions } from '../../common/dialog.js';

// the qualities past Auto (render.js DETAIL; Ultra, quality.js)
const QUALITIES = ['ultra', 'high', 'standard', 'light'];

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));

// The board's stored size in bytes (its JSON's length; 0 when it has none)
export function boardBytes(raw) {
    try {
        return raw ? JSON.stringify(raw).length : 0;
    } catch {
        return 0;
    }
}

// What is on the board as this user sees it (a board view, model.js
// boardView): its cards by kind, its strokes (on the sheet and on cards) by
// nib, their points, the pieces the eraser left and its bites, pins,
// strings, and set pieces
export function boardCounts(view) {
    const out = { cards: 0, places: 0, notes: 0, writing: 0, strokes: 0, onCards: 0, points: 0, brush: 0, pen: 0, wash: 0, filled: 0, pieces: 0, bites: 0, pins: 0, strings: 0, decor: 0 };
    const stroke = (st) => {
        if (!Array.isArray(st?.pts)) return;
        out.strokes++;
        out.points += Math.floor(st.pts.length / 2);
        if (st.n === 'wash' && st.fill) out.filled++;
        else if (st.n === 'wash') out.wash++;
        else if (st.n === 'pen') out.pen++;
        else out.brush++;
        if (st.span) out.pieces++;
        out.bites += Array.isArray(st.bites) ? st.bites.length : 0;
    };
    for (const s of view?.scraps ?? []) {
        out.cards++;
        if (s.type === 'note') out.notes++;
        else if (s.type === 'scrawl') out.writing++;
        else out.places++;
        for (const st of s.layout?.strokes ?? []) {
            stroke(st);
            out.onCards++;
        }
    }
    for (const layer of Object.values(view?.marks ?? {})) for (const st of Object.values(layer ?? {})) stroke(st);
    out.pins = (view?.pins ?? []).length;
    out.strings = (view?.links ?? []).length;
    out.decor = (view?.decor ?? []).length;
    return out;
}

// What everyone else is doing, from their live previews (live.js livePeer):
// how many are heard from, and how many are painting, tying a string,
// dragging, or moving strokes
export function liveCounts(peers) {
    const out = { peers: 0, painting: 0, tying: 0, dragging: 0, moving: 0 };
    for (const p of peers ?? []) {
        if (!p) continue;
        out.peers++;
        if (p.stroke) out.painting++;
        if (p.string) out.tying++;
        if (p.drag) out.dragging++;
        if (p.moving?.length) out.moving++;
    }
    return out;
}

// bytes as a person reads them: 812 B, 41 KB, 3.2 MB
export function fmtBytes(n) {
    const b = Math.max(0, Number(n) || 0);
    if (b < 1024) return `${Math.round(b)} B`;
    if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const num = (n) => Number(n || 0).toLocaleString();

// what Auto comes to on this computer (render.js detailOf)
const autoKey = () => (game.user?.isGM ? 'high' : navigator.deviceMemory && navigator.deviceMemory <= 4 ? 'light' : 'standard');
// the quality picked, and the one in use
function qualityNow() {
    let d = 'auto';
    try {
        d = game.settings.get('heart', 'boardDetail') ?? 'auto';
    } catch {
        d = 'auto';
    }
    return { picked: d, used: d === 'auto' ? autoKey() : QUALITIES.includes(d) ? d : 'standard' };
}
const qualityName = (d) => loc(`heart.board.detail-${d}`).replace(/\s*\(.*\)$/, '');

// The statistics as HTML: three tables (the board, what is moving, this
// computer)
function statsHtml(layer) {
    const S = layer?.stats?.() ?? null;
    if (!S) return `<p>${esc(loc('heart.board.stats.none'))}</p>`;
    const B = S.board;
    const L = S.live;
    const R = S.render;
    const Q = qualityNow();
    const row = (key, value, data) => `<tr><th>${esc(loc(`heart.board.stats.${key}`, data))}</th><td>${esc(value)}</td></tr>`;
    const table = (head, rows) => `<h3>${esc(loc(`heart.board.stats.${head}`))}</h3><table>${rows.join('')}</table>`;
    const fps = Math.round(S.fps || 0);
    const quality = Q.picked === 'auto' ? `${qualityName('auto')} (${qualityName(Q.used)})` : qualityName(Q.used);
    return [
        table('board-head', [
            row('cards', loc('heart.board.stats.cards-value', { all: num(B.cards), places: num(B.places), notes: num(B.notes), writing: num(B.writing) })),
            row('strokes', loc('heart.board.stats.strokes-value', { all: num(B.strokes), cards: num(B.onCards), points: num(B.points) })),
            row('nibs', loc('heart.board.stats.nibs-value', { brush: num(B.brush), pen: num(B.pen), wash: num(B.wash), filled: num(B.filled) })),
            row('erased', loc('heart.board.stats.erased-value', { pieces: num(B.pieces), bites: num(B.bites) })),
            row('pins', loc('heart.board.stats.pins-value', { pins: num(B.pins), strings: num(B.strings) })),
            row('decor', num(B.decor)),
            row('size', loc('heart.board.stats.size-value', { w: num(Math.round(S.w)), h: num(Math.round(S.h)) })),
            ...(S.bytes ? [row('bytes', fmtBytes(S.bytes))] : []),
        ]),
        table('live-head', [
            row('users', loc('heart.board.stats.users-value', { here: num(S.here), heard: num(L.peers) })),
            row('doing', loc('heart.board.stats.doing-value', { painting: num(L.painting), tying: num(L.tying), dragging: num(L.dragging), moving: num(L.moving) })),
            row('messages', loc('heart.board.stats.messages-value', { got: num(S.liveIn), sent: num(S.liveOut) })),
            row('landing', num(S.landings)),
            row('sprites', num(S.sprites)),
        ]),
        table('machine-head', [
            row('fps', loc('heart.board.stats.fps-value', { fps, ms: (S.frameMs || 0).toFixed(1) })),
            row('quality', quality),
            row('tiles', loc('heart.board.stats.tiles-value', { all: num(R.tiles), waiting: num(R.waiting) })),
            row('sharp', loc(R.sharp ? 'heart.board.stats.on' : 'heart.board.stats.off')),
            row('painted', loc('heart.board.stats.painted-value', { tiles: num(R.painted), avg: R.painted ? (R.paintMs / R.painted).toFixed(1) : '0', slow: (R.slowest || 0).toFixed(0) })),
            row('tile-memory', fmtBytes(R.bytes)),
            row('images', loc('heart.board.stats.images-value', { n: num(R.images), size: fmtBytes(R.imageBytes) })),
            ...(S.baked ? [
                row('baked', loc('heart.board.stats.baked-value', { level: S.baked.level ?? '-', pieces: num(S.baked.pieces), loading: num(S.baked.loading) })),
                row('baked-memory', loc('heart.board.stats.baked-memory-value', { used: fmtBytes(S.baked.bytes), budget: fmtBytes(S.baked.budget) })),
            ] : []),
            ...(S.heap ? [row('heap', fmtBytes(S.heap))] : []),
            ...(S.gpuSide ? [row('gpu', loc('heart.board.stats.gpu-value', { px: num(S.gpuSide) }))] : []),
        ]),
    ].join('');
}

// The statistics window, kept up to date every second while it is open; one
// at a time (File again brings it to the front)
let statsOpen = null;
export function statsDialog() {
    if (statsOpen?.rendered) return statsOpen.bringToTop();
    const body = () => `<div class="heart-board-stats">${statsHtml(canvas.heartBoard)}</div>`;
    let timer = 0;
    const d = new Dialog({
        title: loc('heart.board.stats.title'),
        content: body(),
        buttons: { close: { label: loc('Close') } },
        default: 'close',
        render: (html) => {
            const root = html[0]?.closest?.('.app') ?? null;
            clearInterval(timer);
            timer = setInterval(() => {
                const el = root?.querySelector('.heart-board-stats');
                if (!el || !d.rendered) return clearInterval(timer);
                el.innerHTML = statsHtml(canvas.heartBoard);
            }, 1000);
        },
        close: () => {
            clearInterval(timer);
            statsOpen = null;
        },
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 420 }));
    statsOpen = d;
    d.render(true);
}

// The board's quality, picked in one click: Auto, High, Standard, Light, the
// one in use marked (the same setting as in Configure Settings)
export function qualityDialog() {
    const Q = qualityNow();
    const choice = (d) => ({
        icon: Q.picked === d ? '<i class="fa-solid fa-check"></i>' : '',
        label: d === 'auto' ? `${qualityName('auto')} (${qualityName(autoKey())})` : qualityName(d),
        callback: () => (Q.picked === d ? null : d === 'ultra' ? askUltra() : game.settings.set('heart', 'boardDetail', d)),
    });
    // (Ultra asked first: no compromise, with its measured costs; the player
    // paragraph is added for non-GMs; the setting's own change offers the reload)
    const askUltra = () =>
        Dialog.confirm({
            title: qualityName('ultra'),
            content: `<p>${esc(loc('heart.board.detail-ultra-warn'))}</p>${game.user?.isGM ? '' : `<p><strong>${esc(loc('heart.board.detail-ultra-player'))}</strong></p>`}`,
            yes: () => game.settings.set('heart', 'boardDetail', 'ultra'),
            no: () => null,
            defaultYes: false,
            options: heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 }),
        });
    const content = `<p>${esc(loc('heart.board.detail-hint'))}</p>`;
    new Dialog({
        title: loc('heart.board.detail'),
        content,
        buttons: Object.fromEntries(['auto', ...QUALITIES].map((d) => [d, choice(d)])),
        default: Q.picked,
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 })).render(true);
}
