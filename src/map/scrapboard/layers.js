// The GM's Map layers window (Luke, 2026-10-25: the Village of Plenty; any
// board on a baked map), under File: each overlay shown or not, each roof on
// or lifted (a roof in parts, each part too), every roof at once, and the
// NPC fog's distance. Each switch is one scene update; every client draws
// from the scene's flags (backdrop.js) and its fog follows (fog.js).
import { cleanBakedFlags, metresPer, squareIn } from './baked.js';
import { gmNotesShown } from './render.js';
import { heartDialogOptions } from '../../common/dialog.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));

// The scene measured in feet or in metres, the same squares (Luke,
// 2026-10-26: feet in play, metres a switch away): its grid's distance and
// units, and every light's reach (and every token's light and sight)
// converted, so nothing changes size
export async function measureIn(scene, units) {
    const from = scene.grid.units;
    const to = units === 'ft' ? 'ft' : 'm';
    if (from === to) return;
    const k = metresPer(from) / metresPer(to);
    const g = squareIn(scene, to);
    await scene.update({ 'grid.distance': g.distance, 'grid.units': g.units });
    const r = (v) => Math.round((Number(v) || 0) * k * 100) / 100;
    const lights = scene.lights.map((l) => ({ _id: l.id, 'config.dim': r(l.config.dim), 'config.bright': r(l.config.bright) }));
    if (lights.length) await scene.updateEmbeddedDocuments('AmbientLight', lights);
    const tokens = scene.tokens.filter((t) => t.light?.dim || t.light?.bright || t.sight?.range).map((t) => ({ _id: t.id, 'light.dim': r(t.light.dim), 'light.bright': r(t.light.bright), 'sight.range': r(t.sight.range) }));
    if (tokens.length) await scene.updateEmbeddedDocuments('Token', tokens);
}

// the window's body as the scene's flags stand (`units`: the scene's)
function bodyOf(m, f, units = 'm') {
    const per = metresPer(units);
    const shown = (metres) => Math.round(((Number(metres) || 0) / per) * 10) / 10;
    const box = (attr, on, label, extra = '') => `<label class="row"><input type="checkbox" ${attr} ${on ? 'checked' : ''}> <span>${esc(label)}</span>${extra}</label>`;
    const overlays = m.overlays.length
        ? m.overlays.map((o) => box(`data-ov="${esc(o.id)}"`, typeof f.overlays?.[o.id] === 'boolean' ? f.overlays[o.id] : o.shown, o.name, o.audience === 'gm' ? ` <small>${esc(loc('heart.board.layers.gm-only'))}</small>` : '')).join('')
        : `<p class="none">${esc(loc('heart.board.layers.none'))}</p>`;
    const roofs = m.roofs.length
        ? m.roofs.map((r) => {
            const parts = r.parts.length > 1 ? `<div class="parts">${r.parts.map((p) => box(`data-part="${esc(`${r.id}/${p.id}`)}"`, !f.roofs?.[`${r.id}/${p.id}`], p.id)).join('')}</div>` : '';
            return box(`data-roof="${esc(r.id)}"`, !f.roofs?.[r.id], r.name) + parts;
        }).join('')
        : `<p class="none">${esc(loc('heart.board.layers.none'))}</p>`;
    const ft = units === 'ft';
    return `<div class="heart-board-layers">
        <h3>${esc(loc('heart.board.layers.measure'))}</h3>
        <div class="all"><button type="button" data-units="ft" class="${ft ? 'on' : ''}" aria-pressed="${ft}">${esc(loc('heart.board.layers.feet'))}</button><button type="button" data-units="m" class="${ft ? '' : 'on'}" aria-pressed="${!ft}">${esc(loc('heart.board.layers.metres'))}</button></div>
        <h3>${esc(loc('heart.board.layers.overlays'))}</h3>${overlays}
        ${box('data-gmnotes', gmNotesShown(), loc('heart.board.layers.gm-notes'), ` <small>${esc(loc('heart.board.layers.gm-only'))}</small>`)}
        <h3>${esc(loc('heart.board.layers.fog'))}</h3>
        <label class="row"><input type="number" data-fog min="0" max="30000" step="1" value="${shown(f.fog)}"> <span>${esc(ft ? loc('heart.board.layers.ft') : loc('heart.board.layers.m'))}</span></label>
        <p class="hint">${esc(loc('heart.board.layers.fog-hint'))}</p>
        <label class="row"><input type="number" data-dark min="0" max="100" step="5" value="${Number.isFinite(Number(f.dark)) ? Number(f.dark) : 40}"> <span>${esc(loc('heart.board.layers.fog-dark'))}</span></label>
        <label class="row"><input type="checkbox" data-lit ${f.lit !== false ? 'checked' : ''}> <span>${esc(loc('heart.board.layers.fog-lit'))}</span></label>
        <p class="hint">${esc(loc('heart.board.layers.fog-night-hint'))}</p>
        <h3>${esc(loc('heart.board.layers.roofs'))}</h3>
        <div class="all"><button type="button" data-all="on">${esc(loc('heart.board.layers.cover-all'))}</button><button type="button" data-all="off">${esc(loc('heart.board.layers.lift-all'))}</button></div>
        <div class="roofs">${roofs}</div>
    </div>`;
}

// One window at a time (File again brings it to the front)
let open = null;
export function layersDialog(scene, backdrop) {
    const m = backdrop?.m;
    if (!game.user.isGM || !m || !scene) return;
    if (open?.rendered) return open.bringToTop();
    const flags = () => cleanBakedFlags(scene.flags?.heart?.baked) ?? {};
    const set = (data) => scene.update(data);
    const body = () => bodyOf(m, flags(), scene.grid.units);
    const again = () => {
        d.data.content = body();
        d.render();
    };
    const d = new Dialog({
        title: loc('heart.board.layers.title', { name: m.name || m.id }),
        content: body(),
        buttons: { close: { label: loc('Close') } },
        default: 'close',
        render: (html) => {
            const root = html[0]?.closest?.('.app') ?? html[0];
            // (bound once: the window's frame outlives each render of it;
            // bound at every render, one click was heard twice)
            if (!root || root.dataset.heartLayers) return;
            root.dataset.heartLayers = '1';
            root.addEventListener('change', async (ev) => {
                const el = ev.target;
                if (el.dataset.ov) await set({ [`flags.heart.baked.overlays.${el.dataset.ov}`]: el.checked });
                // (a roof unticked is lifted)
                else if (el.dataset.roof) await set({ [`flags.heart.baked.roofs.${el.dataset.roof}`]: !el.checked });
                else if (el.dataset.part) await set({ [`flags.heart.baked.roofs.${el.dataset.part}`]: !el.checked });
                // (typed in the scene's units, kept in metres)
                else if (el.dataset.fog !== undefined) await set({ 'flags.heart.baked.fog': Math.max(0, Number(el.value) || 0) * metresPer(scene.grid.units) });
                else if (el.dataset.dark !== undefined) await set({ 'flags.heart.baked.dark': Math.max(0, Math.min(100, Number(el.value) || 0)) });
                else if (el.dataset.lit !== undefined) await set({ 'flags.heart.baked.lit': el.checked });
                // (this client's, not the scene's: Plenty finish item 2)
                else if (el.dataset.gmnotes !== undefined) await game.settings.set('heart', 'boardGmNotes', el.checked);
            });
            root.addEventListener('click', async (ev) => {
                const u = ev.target.closest('[data-units]');
                if (u) {
                    await measureIn(scene, u.dataset.units);
                    return again();
                }
                const b = ev.target.closest('[data-all]');
                if (!b) return;
                // (every roof and part on, or every roof lifted)
                const on = b.dataset.all === 'on';
                const roofs = {};
                for (const r of m.roofs) {
                    roofs[r.id] = !on;
                    for (const p of r.parts) if (r.parts.length > 1) roofs[`${r.id}/${p.id}`] = false;
                }
                await set({ 'flags.heart.baked.roofs': roofs });
                again();
            });
        },
        close: () => {
            open = null;
        },
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 360, height: 'auto' }));
    open = d;
    d.render(true);
}
