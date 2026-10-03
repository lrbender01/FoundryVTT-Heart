// Notes on the scrapboard map, and the dialogs its tools ask through
// (2026-10-02, Luke). Players may pin notes and edit the text, paper, and
// ink of their own (not their size, not their pins), and draw with the
// marker on a layer of their own. Each player writes in a hand of their own:
// they pick one of the map's handwriting faces with their first note, and it
// is theirs from then on (no one else may take it, and they may not pick
// again), their "visual voice" on the board. On a players' board its owners
// do anything but see what's hidden or bring in places. The GM has full
// control and, in the player view, can try the picker without claiming a
// hand. Players' writes go through the GM's relay (one queue on the GM's
// client; each request checked against who asked).
import { HAND_SCALE, pinChoices, pickFrom, ALIGNS, TEXT_STYLES, textStyleOf, markMax, cleanStroke, customKey } from './model.js';
import { askGM, registerRelayHandler } from '../../common/relay.js';
import { heartDialogOptions } from '../../common/dialog.js';
import { mayMove, mayRubOut } from './controls.js';

// (the move rule lives with the shared controls; re-exported for the tests)
export { mayMove };
import {
    boardOf, isBoardScene, ownsBoard, setScrap, applyBoardPatch, addLink, addPin, addMark, removeMarks, removeScrap, removeLink, removeMany, labelString, addString,
} from './api.js';
import { loadBoardLook, textureUrl } from './look.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
const hex = (c) => `#${(Number(c) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
export const HANDS = Object.keys(HAND_SCALE);
const MAX_TEXT = 300;

/* -------------------------------------------- */
/*  Hands                                       */
/* -------------------------------------------- */

// init: who writes in which hand ({ userId: face }), the GM's to keep
export function registerBoardSettings() {
    game.settings.register('heart', 'boardHands', { scope: 'world', config: false, type: Object, default: {} });
    // how finely this client paints the map (render.js DETAIL): auto is high
    // for the GM, standard for players, light on a device short of memory
    game.settings.register('heart', 'boardDetail', {
        name: 'heart.board.detail',
        hint: 'heart.board.detail-hint',
        scope: 'client',
        config: true,
        type: String,
        choices: { auto: 'heart.board.detail-auto', high: 'heart.board.detail-high', standard: 'heart.board.detail-standard', light: 'heart.board.detail-light' },
        default: 'auto',
        onChange: () => canvas?.heartBoard?.reset?.(),
    });
}

const hands = () => game.settings.get('heart', 'boardHands') ?? {};
export const handOf = (userId = game.user.id) => hands()[userId] ?? null;
const takenBy = (face) => Object.entries(hands()).find(([, f]) => f === face)?.[0] ?? null;

// The hand picker: every face not taken by another player, each shown in its
// own hand. `preview`: the GM trying it (nothing is claimed).
export function pickHand({ preview = false } = {}) {
    const mine = game.user.id;
    const free = HANDS.filter((f) => !takenBy(f) || takenBy(f) === mine);
    const sample = loc('heart.board.hand-sample');
    const cards = free.map((f, i) => `<label class="heart-board-hand">
        <input type="radio" name="hand" value="${esc(f)}" ${i ? '' : 'checked'}>
        <span style="font-family: '${esc(f)}'; font-size: ${Math.round(26 * (HAND_SCALE[f] ?? 1))}px">${esc(sample)}</span>
        <small>${esc(f)}</small></label>`).join('');
    const content = `<p>${esc(loc(preview ? 'heart.board.hand-preview' : 'heart.board.hand-pick'))}</p><div class="heart-board-hands">${cards}</div>`;
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.hand-title'),
            content,
            buttons: {
                ok: { label: loc(preview ? 'heart.board.hand-try' : 'heart.board.hand-claim'), callback: (html) => resolve(html.find('input[name=hand]:checked').val() ?? null) },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 })).render(true);
    });
}

// This player's hand, asking them to pick one first (null if they didn't)
export async function ensureHand() {
    const have = handOf();
    if (have) return have;
    if (!HANDS.some((f) => !takenBy(f))) {
        ui.notifications.warn(loc('heart.board.hands-gone'));
        return null;
    }
    const face = await pickHand();
    if (!face) return null;
    const answer = await askGM('board.claimHand', { face });
    return answer ? answer.face : null;
}

/* -------------------------------------------- */
/*  Notes                                       */
/* -------------------------------------------- */

// A note's text, and how it looks (Luke, 2026-10-02): its paper (a note's)
// and its ink, anyone's to choose from the look's few presets; its hand, the
// GM's (`chooseHand`), shown as the card writes now. Resolves { text, hand,
// paper, ink } (hand, paper, ink null: the board's choice), or null.
export async function noteDialog({ text = '', hand = null, paper = null, ink = null, type = 'note', chooseHand = false, title = 'heart.board.note-title', style = {} } = {}) {
    const st = textStyleOf(style);
    // (Luke, 2026-10-03: how the writing is set: align, bold, italic,
    // underline, strike through)
    const ICON = { left: 'fa-align-left', center: 'fa-align-center', right: 'fa-align-right', bold: 'fa-bold', italic: 'fa-italic', underline: 'fa-underline', strike: 'fa-strikethrough' };
    const styleRow = `<div class="heart-board-style">${ALIGNS.map((a) => `<label title="${esc(loc(`heart.board.align-${a}`))}"><input type="radio" name="align" value="${a}" ${(st.align ?? 'center') === a ? 'checked' : ''}><i class="fa-solid ${ICON[a]}"></i></label>`).join('')}<span class="sep"></span>${TEXT_STYLES.map((k) => `<label title="${esc(loc(`heart.board.style-${k}`))}"><input type="checkbox" name="${k}" ${st[k] ? 'checked' : ''}><i class="fa-solid ${ICON[k]}"></i></label>`).join('')}</div>`;
    const { look, textures } = await loadBoardLook();
    const papers = type === 'note' ? look.pools.notes.filter((id) => textureUrl(textures, id)) : [];
    const inks = type === 'scrawl' ? look.ink.sheet : look.ink.paper;
    const face = hand ?? look.fonts.hands[0];
    const handRow = chooseHand
        ? `<div class="form-group"><label>${esc(loc('heart.board.hand'))}</label><select name="hand">${HANDS.map((f) => `<option value="${esc(f)}" ${f === face ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>`
        : '';
    const inkRow = `<div class="heart-board-inks" title="${esc(loc('heart.board.ink'))}">${inks.map((c, i) => `<label><input type="radio" name="ink" value="${i}" ${i === ink ? 'checked' : ''}><span style="background:${hex(c)}"></span></label>`).join('')}
        <label class="any"><input type="radio" name="ink" value="" ${ink === null || ink === undefined ? 'checked' : ''}><span>${esc(loc('heart.board.any'))}</span></label></div>`;
    const paperRow = papers.length
        ? `<div class="heart-board-papers" title="${esc(loc('heart.board.paper'))}"><label class="any"><input type="radio" name="paper" value="" ${paper ? '' : 'checked'}><span>${esc(loc('heart.board.any'))}</span></label>${papers.map((id) => `<label><input type="radio" name="paper" value="${esc(id)}" ${paper === id ? 'checked' : ''}><img src="${textureUrl(textures, id)}" alt=""></label>`).join('')}</div>`
        : '';
    const shown = ink !== null && inks[ink] !== undefined ? hex(inks[ink]) : '';
    return new Promise((resolve) => {
        new Dialog({
            title: loc(title),
            content: `<textarea name="text" class="${type === 'scrawl' ? 'sheet' : ''}" rows="4" maxlength="${MAX_TEXT}" style="font-family: '${esc(face)}'; ${shown ? `color: ${shown};` : ''}">${esc(text)}</textarea>${styleRow}${handRow}${inkRow}${paperRow}`,
            buttons: {
                ok: {
                    label: loc('heart.board.write'),
                    callback: (html) => {
                        const n = html.find('[name=ink]:checked').val();
                        resolve({
                            text: String(html.find('[name=text]').val() ?? '').trim(),
                            hand: chooseHand ? html.find('[name=hand]').val() || null : hand,
                            paper: html.find('[name=paper]:checked').val() || null,
                            ink: n === '' || n === undefined ? null : Number(n),
                            style: textStyleOf({
                                align: html.find('[name=align]:checked').val(),
                                ...Object.fromEntries(TEXT_STYLES.map((k) => [k, html.find(`[name=${k}]`).is(':checked')])),
                            }),
                        });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => {
                const ta = html.find('textarea');
                ta.trigger('focus');
                // the text shows the hand and ink as they are picked
                html.find('[name=hand]').on('change', (ev) => ta.css('font-family', `'${ev.currentTarget.value}'`));
                html.find('[name=ink]').on('change', (ev) => ta.css('color', ev.currentTarget.value === '' ? '' : hex(inks[Number(ev.currentTarget.value)])));
                // (and as it is set)
                const look = () => {
                    const on = (k) => html.find(`[name=${k}]`).is(':checked');
                    ta.css({ 'text-align': html.find('[name=align]:checked').val() ?? 'center', 'font-weight': on('bold') ? 'bold' : '', 'font-style': on('italic') ? 'italic' : '', 'text-decoration': [on('underline') ? 'underline' : '', on('strike') ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' });
                };
                html.find('.heart-board-style input').on('change', look);
                look();
            },
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 440 })).render(true);
    });
}

// A player pins a note (type 'note') or writes straight on the sheet
// ('scrawl') at a board point, in their hand
export async function playerAddNote(scene, at, type = 'note') {
    const hand = await ensureHand();
    if (!hand) return;
    const answer = await noteDialog({ hand, type, title: type === 'scrawl' ? 'heart.board.write-title' : 'heart.board.note-title' });
    if (!answer?.text) return;
    return askGM('board.addNote', { sceneId: scene.id, type, x: Math.round(at.x), y: Math.round(at.y), text: answer.text, paper: answer.paper, ink: answer.ink, style: answer.style });
}

// A player moves their own notes and writing ({ key: { x, y } })
export async function playerMove(scene, moves) {
    if (!Object.keys(moves ?? {}).length) return;
    return askGM('board.moveOwn', { sceneId: scene.id, moves });
}

// A note's text, paper, and ink edited; the GM may change its hand too (the
// dialog opens on the hand it writes in now)
export async function editNote(scene, key) {
    const s = boardOf(scene).scraps?.[key];
    if (!s) return;
    const gm = game.user.isGM;
    if (!gm && s.author !== game.user.id && !ownsBoard(scene, game.user.id)) return ui.notifications.warn(loc('heart.board.not-yours'));
    const { look } = await loadBoardLook();
    const face = s.hand ?? pickFrom(look.fonts.hands, `hand:${key}`) ?? look.fonts.hands[0];
    const answer = await noteDialog({ text: s.text ?? '', hand: face, paper: s.paper ?? null, ink: s.ink ?? null, type: s.type, chooseHand: gm, title: 'heart.board.note-edit', style: s });
    if (!answer?.text) return;
    if (gm) return setScrap(scene, key, { text: answer.text, hand: answer.hand === face && !s.hand ? null : answer.hand, paper: answer.paper, ink: answer.ink, ...answer.style });
    return askGM('board.editNote', { sceneId: scene.id, key, text: answer.text, paper: answer.paper, ink: answer.ink, style: answer.style });
}
// (the earlier name)
export const editNoteText = editNote;

// A players' board owner's edit, or anyone's marker stroke, through the GM
export function boardEdit(scene, request) {
    return askGM('board.edit', { sceneId: scene.id, ...request });
}

const cleanInk = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(15, Math.round(Number(v)))));

// The relay's handlers (run on the GM's client, inside its queue)
export function registerBoardRelay() {
    registerRelayHandler('board.claimHand', async ({ face }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        if (!HANDS.includes(face)) return { status: 'not-allowed' };
        const all = { ...hands() };
        if (all[userId]) return { status: 'already' };
        if (Object.values(all).includes(face)) return { status: 'already' };
        all[userId] = face;
        await game.settings.set('heart', 'boardHands', all);
        return { status: 'done', face };
    });
    registerRelayHandler('board.addNote', async ({ sceneId, type = 'note', x, y, text, paper = null, ink = null, style = {} }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        const hand = hands()[userId];
        if (!isBoardScene(scene) || !hand || !['note', 'scrawl'].includes(type)) return { status: 'not-allowed' };
        const clean = String(text ?? '').slice(0, MAX_TEXT).trim();
        if (!clean || !Number.isFinite(x) || !Number.isFinite(y)) return { status: 'not-allowed' };
        const { look } = await loadBoardLook();
        const scraps = boardOf(scene).scraps ?? {};
        let i = 1;
        while (scraps[`p${i}`]) i++;
        const data = { type, text: clean, x, y, hand, author: userId, state: 'known', ...textStyleOf(style) };
        if (type === 'note' && paper && look.pools.notes.includes(paper)) data.paper = paper;
        if (cleanInk(ink) !== null) data.ink = cleanInk(ink);
        await scene.update({ [`flags.heart.board.scraps.p${i}`]: data }, { heartBoard: true });
        return { status: 'done', key: `p${i}` };
    });
    // a player moves their own notes and writing (an owner any), nothing else
    registerRelayHandler('board.moveOwn', async ({ sceneId, moves }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        if (!isBoardScene(scene)) return { status: 'missing' };
        const user = game.users.get(userId);
        const who = user ? { id: userId, isGM: user.isGM, owner: ownsBoard(scene, userId) } : null;
        const scraps = boardOf(scene).scraps ?? {};
        const data = {};
        for (const [key, at] of Object.entries(moves ?? {})) {
            const s = scraps[key];
            if (!s || !who || !mayMove(s, who)) return { status: 'not-allowed' };
            if (!Number.isFinite(at?.x) || !Number.isFinite(at?.y)) return { status: 'not-allowed' };
            data[`flags.heart.board.scraps.${key}.x`] = Math.round(at.x);
            data[`flags.heart.board.scraps.${key}.y`] = Math.round(at.y);
        }
        if (Object.keys(data).length) await scene.update(data, { heartBoard: true });
        return { status: 'done' };
    });
    registerRelayHandler('board.editNote', async ({ sceneId, key, text, paper, ink, style = {} }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        const s = boardOf(scene).scraps?.[key];
        if (!s) return { status: 'missing' };
        const user = game.users.get(userId);
        if (!user?.isGM && s.author !== userId && !(ownsBoard(scene, userId) && (s.type === 'note' || s.type === 'scrawl'))) return { status: 'not-allowed' };
        const clean = String(text ?? '').slice(0, MAX_TEXT).trim();
        if (!clean) return { status: 'not-allowed' };
        const { look } = await loadBoardLook();
        const data = { [`flags.heart.board.scraps.${key}.text`]: clean, [`flags.heart.board.scraps.${key}.ink`]: cleanInk(ink) };
        for (const [k, v] of Object.entries(textStyleOf(style))) data[`flags.heart.board.scraps.${key}.${k}`] = v;
        if (paper === null || look.pools.notes.includes(paper)) data[`flags.heart.board.scraps.${key}.paper`] = paper ?? null;
        await scene.update(data, { heartBoard: true });
        return { status: 'done' };
    });
    // the marker (anyone, on their own layer; an owner or the GM rubs out
    // any), and a players' board's owners' edits: an edit from the shared
    // controls, a string, a pin, a note or writing or string taken off
    registerRelayHandler('board.edit', async (req, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(req.sceneId);
        if (!isBoardScene(scene)) return { status: 'missing' };
        const user = game.users.get(userId);
        if (!user) return { status: 'not-allowed' };
        const who = { id: userId, isGM: user.isGM, owner: ownsBoard(scene, userId) };
        const board = boardOf(scene);
        // a stroke on a card (Luke, 2026-10-03): the card's, in its own frame,
        // its author the one who drew it
        if (req.mark?.on) {
            const s = board.scraps?.[req.mark.on];
            const st = cleanStroke({ ...req.mark, by: userId }, { card: true });
            if (!s || !st) return { status: 'not-allowed' };
            const { look } = await loadBoardLook();
            st.w = Math.min(st.w, markMax(look));
            await applyBoardPatch(scene, { scraps: { [req.mark.on]: { marks: { [customKey('m', s.marks ?? {})]: st } } } });
            return { status: 'done' };
        }
        // strokes moved, sized, or turned (the marker's select mode): each the
        // asker's to move (an owner or the GM, any), a new one theirs
        if (req.remark) {
            const marks = {};
            const scraps = {};
            for (const [layer, strokes] of Object.entries(req.remark.marks ?? {})) {
                for (const [id, st] of Object.entries(strokes ?? {})) {
                    const had = board.marks?.[layer]?.[id];
                    if (had ? !mayRubOut(layer, who) : layer !== userId && !who.isGM && !who.owner) return { status: 'not-allowed' };
                    const clean = st === null ? null : cleanStroke(st);
                    if (st !== null && !clean) return { status: 'not-allowed' };
                    (marks[layer] ??= {})[id] = clean;
                }
            }
            for (const [key, sp] of Object.entries(req.remark.scraps ?? {})) {
                if (!board.scraps?.[key] || Object.keys(sp ?? {}).some((k) => k !== 'marks')) return { status: 'not-allowed' };
                for (const [id, st] of Object.entries(sp.marks ?? {})) {
                    const had = board.scraps[key].marks?.[id];
                    if (had ? !mayRubOut(had.by, who) : (st?.by ?? userId) !== userId && !who.isGM && !who.owner) return { status: 'not-allowed' };
                    const clean = st === null ? null : cleanStroke({ ...st, by: had?.by ?? st.by ?? userId }, { card: true });
                    if (st !== null && !clean) return { status: 'not-allowed' };
                    ((scraps[key] ??= { marks: {} }).marks)[id] = clean;
                }
            }
            await applyBoardPatch(scene, { marks, scraps });
            return { status: 'done' };
        }
        if (req.mark) {
            const pts = (Array.isArray(req.mark.pts) ? req.mark.pts : []).map((v) => Math.round(Number(v))).filter(Number.isFinite).slice(0, 6000);
            if (pts.length < 4 || pts.length % 2) return { status: 'not-allowed' };
            const { look } = await loadBoardLook();
            const o = Number(req.mark.o);
            await addMark(scene, userId, { c: cleanInk(req.mark.c) ?? 0, w: Math.max(1, Math.min(markMax(look), Number(req.mark.w) || 6)), ...(Number.isFinite(o) ? { o: Math.max(0.05, Math.min(1, o)) } : {}), pts });
            return { status: 'done' };
        }
        if (req.unmark) {
            const mayGo = (e) => (String(e[0]).startsWith('@') ? mayRubOut(board.scraps?.[String(e[0]).slice(1)]?.marks?.[e[1]]?.by, who) : mayRubOut(e[0], who));
            await removeMarks(scene, (Array.isArray(req.unmark) ? req.unmark : []).filter((e) => Array.isArray(e) && mayGo(e)));
            return { status: 'done' };
        }
        if (!who.isGM && !who.owner) return { status: 'not-allowed' };
        const ownable = (key) => board.scraps?.[key] && mayMove(board.scraps[key], who);
        if (req.patch) {
            if (Object.keys(req.patch.scraps ?? {}).some((k) => !ownable(k))) return { status: 'not-allowed' };
            // (new pieces of a players' board are notes and writing only)
            if (Object.values(req.patch.newScraps ?? {}).some((s) => !['note', 'scrawl'].includes(s?.type))) return { status: 'not-allowed' };
            await applyBoardPatch(scene, req.patch);
        }
        let id = null;
        if (req.addLink) id = await addLink(scene, req.addLink);
        // (a new string from the shared controls' ends, pins made as needed)
        if (req.addString) id = await addString(scene, req.addString.act, req.addString.kind, { color: cleanInk(req.addString.color) });
        // a name for the new string (or one named by req.label.id)
        if (req.label?.text && (id || req.label.id)) await labelString(scene, id ?? req.label.id, String(req.label.text).slice(0, MAX_TEXT));
        if (req.addPin?.tex) await addPin(scene, req.addPin);
        if (req.removeScrap) {
            if (!ownable(req.removeScrap)) return { status: 'not-allowed' };
            await removeScrap(scene, req.removeScrap);
        }
        if (req.removeLink) await removeLink(scene, req.removeLink);
        if (req.remove) {
            const scraps = (req.remove.scraps ?? []).filter(ownable);
            await removeMany(scene, { scraps, pins: req.remove.pins ?? [], links: req.remove.links ?? [] });
        }
        return { status: 'done' };
    });
}

/* -------------------------------------------- */
/*  The tools' dialogs                          */
/* -------------------------------------------- */

// A new string's kind and name (or an existing one's)
export async function stringDialog({ kind = 'delve', label = '', color = null } = {}) {
    const opt = (k) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(loc(`heart.board.kind-${k}`))}</option>`;
    // (any string in any colour: the sheet's paints, the marker's)
    const { look } = await loadBoardLook();
    const colors = `<div class="heart-board-inks" title="${esc(loc('heart.board.string-color'))}"><label class="any"><input type="radio" name="color" value="" ${color === null || color === undefined ? 'checked' : ''}><span>${esc(loc('heart.board.string-color-own'))}</span></label>${look.ink.sheet.map((c, i) => `<label><input type="radio" name="color" value="${i}" ${i === color ? 'checked' : ''}><span style="background:${hex(c)}"></span></label>`).join('')}</div>`;
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.string-title'),
            content: `<div class="form-group"><label>${esc(loc('heart.board.kind'))}</label><select name="kind">${['delve', 'rail', 'path'].map(opt).join('')}</select></div>
                <div class="form-group"><label>${esc(loc('heart.board.string-name'))}</label><input type="text" name="label" value="${esc(label)}" placeholder="${esc(loc('heart.board.string-name-hint'))}"></div>${colors}`,
            buttons: {
                ok: {
                    label: loc('heart.board.tie'),
                    callback: (html) => {
                        const c = html.find('[name=color]:checked').val();
                        resolve({ kind: html.find('[name=kind]').val(), label: String(html.find('[name=label]').val() ?? '').trim(), color: c === '' || c === undefined ? null : Number(c) });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 380 })).render(true);
    });
}

// Which pin to put in (the Pin tool): every pin the look offers, as pictures
export async function pinDialog() {
    const { look, textures } = await loadBoardLook();
    const ids = pinChoices(look, Object.keys(textures)).filter((id) => textureUrl(textures, id));
    const name = (id) => id.split('__').pop().replace(/^fixture_/, '').replace(/_/g, ' ');
    let picked = null;
    return new Promise((resolve) => {
        const d = new Dialog({
            title: loc('heart.board.pin-title'),
            content: `<p>${esc(loc('heart.board.pin-hint'))}</p><div class="heart-board-pins">${ids.map((id) => `<button type="button" data-pin="${esc(id)}" title="${esc(name(id))}"><img src="${textureUrl(textures, id)}" alt=""></button>`).join('')}</div>`,
            buttons: { cancel: { label: loc('Cancel') } },
            default: 'cancel',
            render: (html) => html.find('[data-pin]').on('click', (ev) => {
                picked = ev.currentTarget.dataset.pin;
                d.close();
            }),
            close: () => resolve(picked),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 420 }));
        d.render(true);
    });
}

// A players' board: its name and whose it is (every player, or some)
export function playersBoardDialog() {
    const players = game.users.filter((u) => !u.isGM);
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.players-title'),
            content: `<p>${esc(loc('heart.board.players-hint'))}</p>
                <div class="form-group"><label>${esc(loc('heart.board.players-name'))}</label><input type="text" name="name" value="${esc(loc('heart.board.players-default'))}"></div>
                <label class="heart-board-owner"><input type="checkbox" name="all" checked> ${esc(loc('heart.board.players-all'))}</label>
                ${players.map((u) => `<label class="heart-board-owner"><input type="checkbox" name="owner" value="${u.id}"> ${esc(u.name)}</label>`).join('')}`,
            buttons: {
                ok: {
                    label: loc('heart.board.players-make'),
                    callback: (html) => {
                        const all = html.find('[name=all]').is(':checked');
                        const ids = html.find('[name=owner]:checked').map((_, el) => el.value).get();
                        resolve({ name: String(html.find('[name=name]').val() ?? '').trim() || loc('heart.board.players-default'), owners: all || !ids.length ? 'all' : ids });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 400 })).render(true);
    });
}

// The board as JSON, to copy into the editor (File: Paste a board)
export function exportDialog(json) {
    new Dialog({
        title: loc('heart.board.export-title'),
        content: `<p>${esc(loc('heart.board.export-hint'))}</p><textarea name="json" rows="14" readonly>${esc(json)}</textarea>`,
        buttons: {
            copy: {
                label: loc('heart.board.copy'),
                callback: async () => {
                    await game.clipboard.copyPlainText(json);
                    ui.notifications.info(loc('heart.board.copied'));
                },
            },
            close: { label: loc('Close') },
        },
        default: 'copy',
        render: (html) => html.find('textarea').trigger('select'),
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 560 })).render(true);
}

// A board pasted from the editor
export function importDialog() {
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.import-title'),
            content: `<p>${esc(loc('heart.board.import-hint'))}</p><textarea name="json" rows="14" placeholder="{ &quot;scraps&quot;: ... }"></textarea>`,
            buttons: {
                ok: { label: loc('heart.board.import'), callback: (html) => resolve(String(html.find('[name=json]').val() ?? '')) },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 560 })).render(true);
    });
}
