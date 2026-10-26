// Board styles in a scene's settings (Luke, 2026-10-25): a Board tab in
// Foundry's Configure Scene, and the Create Board dialog. A board is drawn in
// a style (look.js boardStyles: a whole look, Heart's first) on the style's
// sheet, cols x rows pages of pw x ph board px (the page size its tiling;
// none, the style's own), or on the scene's own background, keeping the
// scene's picture, size, and grid (any scene a board). The tab's fields have
// no form names: Foundry saves the scene's own, then api.js configureBoard
// makes the board as the tab left it.
import { boardStyles, styleOf, loadBoardLook, DEFAULT_STYLE } from './look.js';
import { isBoardScene, boardOf, configureBoard } from './api.js';
import { boardSheet, isBareBoard, pageOf, PAGE_MIN, PAGE_MAX } from './model.js';
import { askBoard } from './notes.js';
import { SQUARES } from './baked.js';
import { keepBackup } from './backups.js';
import { heartDialogOptions } from '../../common/dialog.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
// (the style last chosen, this client's)
const LAST_STYLE = 'heartBoard.lastStyle';
const TAB = 'heart-board';

function lastStyle() {
    try {
        return localStorage.getItem(LAST_STYLE) || DEFAULT_STYLE;
    } catch {
        return DEFAULT_STYLE;
    }
}

function keepStyle(id) {
    try {
        localStorage.setItem(LAST_STYLE, id);
    } catch {
        // (a private window: not kept)
    }
}

const styleOptions = (list, pick) => list.map((s) => `<option value="${esc(s.id)}" ${s.id === pick ? 'selected' : ''}>${esc(s.id === DEFAULT_STYLE ? loc('heart.board.style-heart') : s.name)}</option>`).join('');

// Create Board: its name and style. { name, style } or null.
export async function createBoardDialog() {
    const list = await boardStyles();
    const pick = list.some((s) => s.id === lastStyle()) ? lastStyle() : DEFAULT_STYLE;
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.create'),
            content: `<p>${esc(loc('heart.board.create-hint'))}</p>
                <div class="form-group"><label>${esc(loc('heart.board.create-name'))}</label><input type="text" name="name" value="${esc(loc('heart.board.scene-name'))}"></div>
                <div class="form-group"><label>${esc(loc('heart.board.style'))}</label><select name="style">${styleOptions(list, pick)}</select></div>`,
            buttons: {
                ok: {
                    label: loc('heart.board.create-make'),
                    callback: (html) => {
                        const style = String(html.find('[name=style]').val() || DEFAULT_STYLE);
                        keepStyle(style);
                        resolve({ name: String(html.find('[name=name]').val() ?? '').trim() || loc('heart.board.scene-name'), style });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 400 })).render(true);
    });
}

// The tab as it stands: { board, style, bare, baked, square, cols, rows, pw,
// ph } (`baked`: a baked map's manifest, its board bare; `square`: its grid
// square, baked.js SQUARES)
function readTab(root) {
    const q = (k) => root.querySelector(`[data-hb="${k}"]`);
    if (!q('board')) return null;
    const n = (k) => {
        const v = String(q(k)?.value ?? '').trim();
        return v === '' ? 0 : Math.round(Number(v)) || 0;
    };
    const bg = q('bg').value;
    const baked = bg === 'baked' ? String(q('baked')?.value ?? '').trim() : '';
    return { board: q('board').checked, style: q('style').value, bare: bg !== 'sheet', baked: baked || null, square: q('square')?.value || '5ft', cols: n('cols'), rows: n('rows'), pw: n('pw'), ph: n('ph') };
}

// The board's size as the tab would make it, beside the fields
function showSize(root, look) {
    const t = readTab(root);
    if (!t) return;
    const sheet = root.querySelector('[data-hb-sheet]');
    for (const el of root.querySelectorAll('[data-hb]:not([data-hb="board"])')) el.disabled = !t.board;
    if (sheet) sheet.disabled = !t.board || t.bare;
    // (a baked map's fields with its choice alone)
    const bakedSet = root.querySelector('[data-hb-baked]');
    if (bakedSet) bakedSet.hidden = !t.board || root.querySelector('[data-hb="bg"]').value !== 'baked';
    const out = root.querySelector('[data-hb-size]');
    if (!out) return;
    const pw = t.pw >= PAGE_MIN ? Math.min(PAGE_MAX, t.pw) : look.page.w;
    const ph = t.ph >= PAGE_MIN ? Math.min(PAGE_MAX, t.ph) : look.page.h;
    out.textContent = t.baked ? loc('heart.board.tab-size-baked') : t.bare ? loc('heart.board.tab-size-scene') : loc('heart.board.tab-size', { w: Math.round(Math.max(1, t.cols) * pw), h: Math.round(Math.max(1, t.rows) * ph) });
}

// The Board tab, added to Configure Scene as it renders (the GM's)
export async function addBoardTab(app, html) {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const scene = app.document ?? app.object;
    const nav = root?.querySelector('nav.sheet-tabs[data-group="main"]');
    const form = root?.querySelector('form') ?? (root?.tagName === 'FORM' ? root : null);
    if (!scene || !nav || !form || nav.querySelector(`[data-tab="${TAB}"]`)) return;
    const list = await boardStyles();
    const on = isBoardScene(scene);
    const style = on ? styleOf(scene) : list.some((s) => s.id === lastStyle()) ? lastStyle() : DEFAULT_STYLE;
    const { look } = await loadBoardLook(style);
    const raw = on ? boardOf(scene) : null;
    const bare = on ? isBareBoard(raw) : Boolean(scene.background?.src);
    // (a baked map, Luke 2026-10-25: its manifest, and its square: 5 ft, the
    // tabletop standard, measured in feet or in metres; Luke 2026-10-26)
    const baked = on ? scene.flags?.heart?.baked?.manifest ?? '' : '';
    const square = Object.entries(SQUARES).find(([, s]) => Math.abs(s.distance - Number(scene.grid?.distance)) < 0.01 && s.units === scene.grid?.units)?.[0] ?? '5ft';
    const S = on && !bare ? boardSheet(look, raw) : { cols: look.sheet.folds.cols, rows: look.sheet.folds.rows };
    const P = on && !bare ? pageOf(look, raw) : look.page;
    // (rendered again while it waited: the newer render adds it)
    if (nav.querySelector(`[data-tab="${TAB}"]`) || !root.isConnected) return;
    const own = (v, d) => (Math.round(v) === Math.round(d) ? '' : Math.round(v));
    const item = document.createElement('a');
    item.className = 'item';
    item.dataset.tab = TAB;
    item.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${esc(loc('heart.board.tab'))}`;
    nav.append(item);
    const tab = document.createElement('div');
    tab.className = 'tab heart-board-tab';
    tab.dataset.group = 'main';
    tab.dataset.tab = TAB;
    tab.innerHTML = `<p class="notes">${esc(loc('heart.board.tab-hint'))}</p>
        <div class="form-group"><label>${esc(loc('heart.board.tab-on'))}</label><div class="form-fields"><input type="checkbox" data-hb="board" ${on ? 'checked' : ''}></div></div>
        <div class="form-group"><label>${esc(loc('heart.board.style'))}</label><div class="form-fields"><select data-hb="style">${styleOptions(list, style)}</select></div>
            <p class="notes">${esc(loc('heart.board.style-hint'))}</p></div>
        <div class="form-group"><label>${esc(loc('heart.board.tab-bg'))}</label><div class="form-fields"><select data-hb="bg">
            <option value="sheet" ${bare ? '' : 'selected'}>${esc(loc('heart.board.tab-bg-sheet'))}</option>
            <option value="scene" ${bare && !baked ? 'selected' : ''}>${esc(loc('heart.board.tab-bg-scene'))}</option>
            <option value="baked" ${baked ? 'selected' : ''}>${esc(loc('heart.board.tab-bg-baked'))}</option></select></div>
            <p class="notes">${esc(loc('heart.board.tab-bg-hint'))}</p></div>
        <fieldset data-hb-baked><legend>${esc(loc('heart.board.tab-baked'))}</legend>
            <div class="form-group"><label>${esc(loc('heart.board.tab-baked-manifest'))}</label><div class="form-fields">
                <input type="text" data-hb="baked" value="${esc(baked)}" placeholder="modules/fvtt-heart-content/assets/art/map/boards/plenty/manifest.json">
                <button type="button" data-hb-pick title="${esc(loc('heart.board.tab-baked-pick'))}"><i class="fa-solid fa-file-import"></i></button></div>
                <p class="notes">${esc(loc('heart.board.tab-baked-hint'))}</p></div>
            <div class="form-group"><label>${esc(loc('heart.board.tab-baked-square'))}</label><div class="form-fields">
                <select data-hb="square">${Object.keys(SQUARES).map((k) => `<option value="${k}" ${k === square ? 'selected' : ''}>${esc(loc(`heart.board.square-${k}`))}</option>`).join('')}</select></div>
                <p class="notes">${esc(loc('heart.board.tab-baked-square-hint'))}</p></div>
        </fieldset>
        <fieldset data-hb-sheet><legend>${esc(loc('heart.board.tab-sheet'))}</legend>
            <div class="form-group"><label>${esc(loc('heart.board.tab-pages'))}</label><div class="form-fields">
                <input type="number" data-hb="cols" min="1" max="60" step="1" value="${S.cols}"><span class="sep">x</span><input type="number" data-hb="rows" min="1" max="60" step="1" value="${S.rows}"></div>
                <p class="notes">${esc(loc('heart.board.tab-pages-hint'))}</p></div>
            <div class="form-group"><label>${esc(loc('heart.board.tab-page'))}</label><div class="form-fields">
                <input type="number" data-hb="pw" min="${PAGE_MIN}" max="${PAGE_MAX}" step="10" placeholder="${Math.round(look.page.w)}" value="${own(P.w, look.page.w)}"><span class="sep">x</span><input type="number" data-hb="ph" min="${PAGE_MIN}" max="${PAGE_MAX}" step="10" placeholder="${Math.round(look.page.h)}" value="${own(P.h, look.page.h)}"></div>
                <p class="notes">${esc(loc('heart.board.tab-page-hint', { w: Math.round(look.page.w), h: Math.round(look.page.h) }))}</p></div>
        </fieldset>
        <p class="notes heart-board-tab-size" data-hb-size></p>`;
    const footer = form.querySelector(':scope > footer.sheet-footer') ?? form.querySelector('footer');
    if (footer) footer.before(tab);
    else form.append(tab);
    tab.dataset.start = JSON.stringify(readTab(tab));
    // (a new style: its own page in the placeholders)
    let shown = look;
    tab.addEventListener('change', async (ev) => {
        if (ev.target.matches('[data-hb="style"]')) {
            shown = (await loadBoardLook(ev.target.value)).look;
            tab.querySelector('[data-hb="pw"]').placeholder = Math.round(shown.page.w);
            tab.querySelector('[data-hb="ph"]').placeholder = Math.round(shown.page.h);
        }
        showSize(tab, shown);
    });
    tab.addEventListener('input', () => showSize(tab, shown));
    // (the manifest picked from the server's files)
    tab.querySelector('[data-hb-pick]')?.addEventListener('click', () => {
        const input = tab.querySelector('[data-hb="baked"]');
        new FilePicker({ type: 'any', current: input.value, callback: (path) => {
            input.value = path;
            showSize(tab, shown);
        } }).browse(input.value);
    });
    showSize(tab, shown);
    // (Foundry's tabs bound before it was here: the one last open opened)
    const tabs = app._tabs?.find((t) => t._navSelector?.includes('main')) ?? app._tabs?.[0];
    if (tabs?.active === TAB) tabs.activate(TAB);
    app.setPosition?.({ height: 'auto' });
    // Saved with the scene: Foundry's fields first, then the board as the
    // tab left it (once per window)
    if (app._heartBoardTab) return;
    app._heartBoardTab = true;
    const save = app._updateObject.bind(app);
    app._updateObject = async (event, formData) => {
        const el = app.form?.querySelector(`.tab[data-tab="${TAB}"]`);
        const want = el ? readTab(el) : null;
        const changed = want && JSON.stringify(want) !== el.dataset.start;
        const out = await save(event, formData);
        if (changed) await applyTab(app.document ?? app.object, want);
        return out;
    };
}

// the board made as the tab left it
async function applyTab(scene, want) {
    if (!want.board && isBoardScene(scene)) {
        // (it deletes the whole board: asked first, a copy kept in File,
        // Earlier boards; as the scene's own menu does)
        const board = boardOf(scene);
        const ok = await askBoard({
            title: loc('heart.board.unmake'),
            content: loc('heart.board.unmake-ask', { scene: scene.name, cards: Object.keys(board?.scraps ?? {}).length, strings: Object.keys(board?.links ?? {}).length }),
            yes: loc('heart.board.unmake-yes'),
            no: loc('heart.board.unmake-no'),
        });
        if (!ok) return;
        await keepBackup(scene, foundry.utils.deepClone(board), { force: true, why: 'replaced' });
    }
    if (want.board) keepStyle(want.style);
    const r = await configureBoard(scene, want);
    if (r?.refused) ui.notifications.warn(loc('heart.board.tab-refused', { w: r.w, h: r.h }));
}
