// Notes on the scrapboard map, and the dialogs its tools ask through
// (2026-10-02, Luke). Players may pin notes and edit the text, paper, and
// ink of their own (not their size, not their pins), and draw with the
// brush on a layer of their own. Each player writes in a hand of their own:
// they pick one of the map's handwriting faces with their first note, and it
// is theirs from then on (no one else may take it, and they may not pick
// again), their "visual voice" on the board. On a players' board its owners
// do anything but see what's hidden or bring in places. The GM has full
// control and, in the player view, can try the picker without claiming a
// hand. Players' writes go through the GM's relay (one queue on the GM's
// client; each request checked against who asked).
import { HAND_SCALE, pinChoices, pickFrom, ALIGNS, TEXT_STYLES, textStyleOf, markMax, cleanStroke, customKey, keysTaken, safePath, TYPEWRITER, newStringPatch, mergeRecords, recordTarget, recordUpdate, binList, removalOf, seasonMarks, brushColor, PAINT_NAMES, PAINT_ORDER, noteFields } from './model.js';
import { listBackups, readBackup } from './backups.js';
import { askGM, registerRelayHandler } from '../../common/relay.js';
import { heartDialogOptions } from '../../common/dialog.js';
import { mayMove, mayRubOut } from './controls.js';

// (the move rule lives with the shared controls; re-exported for the tests)
export { mayMove };
import {
    boardOf, isBoardScene, ownsBoard, setScrap, applyBoardPatch, addLink, addPin, addMark, removeMarks, removeScrap, removeLink, removeMany, labelString, addString,
    writeBoard, pushEdit, binCards, unbinCard, emptyBin, replaceBoard,
} from './api.js';
import { loadBoardLook, textureUrl } from './look.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
const hex = (c) => `#${(Number(c) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
export const HANDS = Object.keys(HAND_SCALE);
const MAX_TEXT = 300;
// the brightnesses, dim to bright (model.js BRIGHT_MIX)
const BRIGHTS = ['dim', 'as-is', 'bright'];

// The brush's paints in the palette's order (PAINT_ORDER, then any more the
// look has): every paint row's, the brush's, a note's, and a string's
export const paintOrder = (n) => [...PAINT_ORDER.filter((i) => i < n), ...Array.from({ length: n }, (_, i) => i).filter((i) => !PAINT_ORDER.includes(i))];

// A paint's name in this language (model.js PAINT_NAMES is the English, the
// editor's); one past the names is "Paint 15"
export function paintName(i) {
    const en = PAINT_NAMES[i];
    if (!en) return loc('heart.board.paint-n', { n: Number(i) + 1 });
    const key = `heart.board.paint.${en.toLowerCase()}`;
    return game.i18n.has?.(key) ? loc(key) : en;
}

// A pin's name (the pin picker's tooltips): its own key, else its file's
export function pinName(id) {
    const stem = String(id ?? '').split('__').pop().replace(/^fixture_/, '');
    const key = `heart.board.pin.${stem}`;
    return game.i18n.has?.(key) ? loc(key) : stem.replace(/_/g, ' ');
}

// A labelled row of a map dialog: a label, then its choices
const row = (label, body, cls = '') => `<div class="heart-board-row ${cls}"><span class="lab">${esc(label)}</span>${body}</div>`;

// The brightness, as the brush's palette has it: Dim, Medium, Bright, a
// segmented control (Luke, 2026-10-21: one control style in both)
const brightRow = (lit) => row(loc('heart.board.brush-light'), `<span class="heart-board-seg">${BRIGHTS.map((k, i) => `<label data-tooltip="${esc(loc(`heart.board.brush-${k}-hint`))}"><input type="radio" name="bright" value="${i}" ${i === lit ? 'checked' : ''}><span>${esc(loc(`heart.board.brush-${k}`))}</span></label>`).join('')}</span>`);

// One hand as a tile, writing the sample in its own face: the hand picker's
// and the note dialog's alike (Luke, 2026-10-21: one look for hands)
const faceSize = (f) => Math.round(25 * (f === TYPEWRITER ? 0.82 : HAND_SCALE[f] ?? 1));
function faceTile(f, { name, on = false, label = f, whose = '', claimed = false }) {
    return `<label class="face ${on ? 'on' : ''} ${claimed ? 'claimed' : ''}"><input type="radio" name="${name}" value="${esc(f)}" ${on ? 'checked' : ''}><span class="smp" style="font-family: '${esc(f)}'; font-size: ${faceSize(f)}px">${esc(loc('heart.board.face-sample'))}</span><small><b>${esc(label)}</b> ${esc(whose)}</small></label>`;
}

// A question before an edit (Luke, 2026-10-21: confirms say what they do):
// its two buttons named for the action and for leaving things be. Resolves
// true or false.
export function askBoard({ title, content, yes, no, width = 400 }) {
    return new Promise((resolve) => {
        new Dialog({
            title,
            content: `<p>${esc(content)}</p>`,
            buttons: {
                yes: { label: yes, callback: () => resolve(true) },
                no: { label: no, callback: () => resolve(false) },
            },
            default: 'yes',
            close: () => resolve(false),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width })).render(true);
    });
}

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

// Who may type on the board (Luke, 2026-10-03): the GM, and a player who
// owns a Witness
export function mayType(userId = game.user.id) {
    const user = game.users.get(userId);
    if (!user) return false;
    if (user.isGM) return true;
    return game.actors.some((a) => a.type === 'character' && a.testUserPermission(user, 'OWNER')
        && a.items.some((i) => i.type === 'class' && /witness/i.test(i.name ?? '')));
}
export const handOf = (userId = game.user.id) => hands()[userId] ?? null;
const takenBy = (face) => Object.entries(hands()).find(([, f]) => f === face)?.[0] ?? null;

// The hand picker: every face not taken by another player, each shown in its
// own hand. `preview`: the GM trying it (nothing is claimed).
export function pickHand({ preview = false } = {}) {
    const mine = game.user.id;
    const free = HANDS.filter((f) => !takenBy(f) || takenBy(f) === mine);
    // (the note dialog's tiles and sample: Luke, 2026-10-21)
    const tiles = free.map((f, i) => faceTile(f, { name: 'hand', on: !i })).join('');
    const content = `<p>${esc(loc(preview ? 'heart.board.hand-preview' : 'heart.board.hand-pick'))}</p><div class="heart-board-faces">${tiles}</div>`;
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.hand-title'),
            content,
            buttons: {
                ok: { label: loc(preview ? 'heart.board.hand-try' : 'heart.board.hand-claim'), callback: (html) => resolve(html.find('input[name=hand]:checked').val() ?? null) },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => html.find('[name=hand]').on('change', (ev) => {
                html.find('.heart-board-faces .face').removeClass('on');
                $(ev.currentTarget).closest('.face').addClass('on');
            }),
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 520 })).render(true);
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
export async function noteDialog({ text = '', hand = null, paper = null, ink = null, type = 'note', chooseHand = false, title = 'heart.board.note-title', style = {}, typed = false, shownPaper = null, paint = null, bright = null, pturn = 0, flip = false, turn = 0, textAt = null } = {}) {
    const canType = mayType();
    const st = textStyleOf(style);
    // (Luke, 2026-10-03: how the writing is set: align, bold, italic,
    // underline, strike through)
    const ICON = { left: 'fa-align-left', center: 'fa-align-center', right: 'fa-align-right', bold: 'fa-bold', italic: 'fa-italic', underline: 'fa-underline', strike: 'fa-strikethrough' };
    const styleRow = `<div class="heart-board-style">${ALIGNS.map((a) => `<label data-tooltip="${esc(loc(`heart.board.align-${a}`))}"><input type="radio" name="align" value="${a}" ${(st.align ?? 'center') === a ? 'checked' : ''}><span><i class="fa-solid ${ICON[a]}"></i></span></label>`).join('')}<span class="sep"></span>${TEXT_STYLES.map((k) => `<label data-tooltip="${esc(loc(`heart.board.style-${k}`))}"><input type="checkbox" name="${k}" ${st[k] ? 'checked' : ''}><span><i class="fa-solid ${ICON[k]}"></i></span></label>`).join('')}</div>`;
    const { look, textures } = await loadBoardLook();
    const papers = type === 'note' ? look.pools.notes.filter((id) => textureUrl(textures, id)) : [];
    const face = hand ?? look.fonts.hands[0];
    // (Luke, 2026-10-06) the hands, and the typewriter, as tiles each
    // writing in its own face: the GM's every hand; a player's own (and the
    // typewriter, a Witness's)
    const faces = [...(chooseHand ? HANDS : [face]), ...(canType ? [TYPEWRITER] : [])];
    const now = typed && canType ? TYPEWRITER : face;
    // (Luke, 2026-10-06: fewer at a time, each sample large enough to read,
    // and whose each hand is: a player's claimed one, with their character;
    // the GM's own)
    const claimed = Object.entries(hands());
    const whose = (f) => {
        if (f === TYPEWRITER) return loc('heart.board.typed');
        const by = claimed.filter(([, h]) => h === f).map(([uid]) => {
            const u = game.users.get(uid);
            return u ? `${u.name}${u.character ? ` (${u.character.name})` : ''}` : null;
        }).filter(Boolean);
        if (by.length) return by.join(', ');
        return look.fonts.hands.includes(f) ? loc('heart.board.hand-gms') : loc('heart.board.hand-free');
    };
    const faceRow = faces.length > 1
        ? `<div class="heart-board-faces">${faces.map((f) => faceTile(f, { name: 'face', on: f === now, label: f === TYPEWRITER ? '' : f, whose: whose(f), claimed: claimed.some(([, h]) => h === f) })).join('')}</div>`
        : '';
    const paperUrl = (id) => (id ? textureUrl(textures, id) : null);
    const paperId = (id) => (paperUrl(id) ? id : paperUrl(shownPaper) ? shownPaper : papers[0] ?? null);
    const sizeOf = (f) => Math.round(26 * (f === TYPEWRITER ? 0.82 : HAND_SCALE[f] ?? 1));
    // its writing in the brush's paints, at the brush's brightnesses (Luke,
    // 2026-10-06: the same choices as the brush); an ink the paper had before
    // stays until a paint is picked
    const marker = look.ink.marker ?? [];
    let lit = bright ?? 1;
    const colourOf = (p) => (p === null || p === undefined || p === '' ? (ink !== null && ink !== undefined ? hex((type === 'scrawl' ? look.ink.sheet : look.ink.paper)[ink] ?? look.ink.text) : '') : hex(brushColor(marker[Number(p)], lit)));
    // (Any first, as in every row that has one: Luke 2026-10-21)
    const paintRow = row(loc('heart.board.paint-label'), `<div class="heart-board-paints"><label class="any"><input type="radio" name="paint" value="" ${paint === null || paint === undefined ? 'checked' : ''}><span>${esc(loc('heart.board.any'))}</span></label>${paintOrder(marker.length).map((i) => `<label data-tooltip="${esc(paintName(i))}"><input type="radio" name="paint" value="${i}" ${i === paint ? 'checked' : ''}><span style="background:${hex(brushColor(marker[i], lit))}"></span></label>`).join('')}</div>`)
        + brightRow(lit);
    const paperRow = papers.length
        ? row(loc('heart.board.paper'), `<div class="heart-board-papers"><label class="any"><input type="radio" name="paper" value="" ${paper ? '' : 'checked'}><span>${esc(loc('heart.board.any'))}</span></label>${papers.map((id) => `<label><input type="radio" name="paper" value="${esc(id)}" ${paper === id ? 'checked' : ''}><img src="${textureUrl(textures, id)}" alt=""></label>`).join('')}</div>`)
        : '';
    // the note as it will lie (Luke, 2026-10-06: a bigger preview): its paper
    // turned a quarter at a time and freely, its writing where it sits on it,
    // dragged by its handle; writing on the sheet is the sheet's
    const note = type === 'note';
    let q = ((Number(pturn) || 0) % 4 + 4) % 4;
    let deg = Math.round(Number(turn) || 0);
    let at = textAt && Number.isFinite(textAt.u) ? { ...textAt } : { u: 0, v: -0.05 };
    const touched = { q: false, r: false, at: false };
    const shown = colourOf(paint);
    const area = `<textarea name="text" rows="4" maxlength="${MAX_TEXT}" style="font-family: '${esc(now)}'; font-size: ${sizeOf(now)}px; ${shown ? `color: ${shown};` : ''}">${esc(text)}</textarea>`;
    const stage = note
        ? `<div class="heart-board-stage"><div class="heart-board-sheet"><div class="paper"></div>${area}<span class="grip" data-tooltip="${esc(loc('heart.board.note-move-text'))}"><i class="fa-solid fa-up-down-left-right"></i></span></div></div>
            <div class="heart-board-turns"><button type="button" data-q="-1" data-tooltip="${esc(loc('heart.board.note-turn-left'))}"><i class="fa-solid fa-rotate-left"></i></button><button type="button" data-q="1" data-tooltip="${esc(loc('heart.board.note-turn-right'))}"><i class="fa-solid fa-rotate-right"></i></button>
            <label><span>${esc(loc('heart.board.note-tilt'))}</span><input type="range" name="tilt" min="-45" max="45" step="1" value="${Math.max(-45, Math.min(45, deg))}"><output>${deg}°</output></label></div>`
        : `<div class="heart-board-preview sheet">${area}</div>`;
    // (Luke, 2026-10-21: Enter writes it, Shift+Enter starts a new line, as
    // in the editor)
    const hint = `<p class="heart-board-hint">${esc(loc('heart.board.note-enter'))}</p>`;
    return new Promise((resolve) => {
        const d = new Dialog({
            title: loc(title),
            content: `${stage}${hint}${styleRow}${faceRow}${paintRow}${paperRow}`,
            buttons: {
                ok: {
                    label: loc('heart.board.write'),
                    callback: (html) => {
                        const picked = html.find('[name=face]:checked').val() ?? now;
                        const pv = html.find('[name=paint]:checked').val();
                        resolve({
                            text: String(html.find('[name=text]').val() ?? '').trim(),
                            hand: chooseHand ? (picked === TYPEWRITER ? face : picked) || null : hand,
                            paper: html.find('[name=paper]:checked').val() || null,
                            // (an ink of before kept, unless a paint was picked)
                            ink: pv === '' || pv === undefined ? ink : null,
                            paint: pv === '' || pv === undefined ? null : Number(pv),
                            bright: lit,
                            typed: canType && picked === TYPEWRITER,
                            style: textStyleOf({
                                align: html.find('[name=align]:checked').val(),
                                ...Object.fromEntries(TEXT_STYLES.map((k) => [k, html.find(`[name=${k}]`).is(':checked')])),
                            }),
                            ...(note && touched.q ? { pturn: q } : {}),
                            ...(note && touched.r ? { r: deg } : {}),
                            ...(note && touched.at ? { textAt: at } : {}),
                        });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => {
                const ta = html.find('textarea');
                ta.trigger('focus');
                ta.on('keydown', (ev) => {
                    if (ev.key !== 'Enter' || ev.shiftKey || ev.originalEvent?.isComposing) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    d.submit(d.data.buttons.ok, ev.originalEvent ?? ev);
                });
                const sheet = html.find('.heart-board-sheet')[0];
                // the paper as it lies: its picture turned and mirrored inside
                // a sheet its shape, the sheet turned freely
                const lay = () => {
                    if (!sheet) return;
                    const id = paperId(html.find('[name=paper]:checked').val());
                    const z = id ? textures[id] : null;
                    const w0 = z?.w || 300;
                    const h0 = z?.h || 400;
                    const [w, h] = q % 2 ? [h0, w0] : [w0, h0];
                    const k = Math.min(330 / w, 230 / h);
                    Object.assign(sheet.style, { width: `${Math.round(w * k)}px`, height: `${Math.round(h * k)}px`, transform: `translate(-50%, -50%) rotate(${deg}deg)` });
                    const pic = sheet.querySelector('.paper');
                    Object.assign(pic.style, { width: `${Math.round(w0 * k)}px`, height: `${Math.round(h0 * k)}px`, backgroundImage: id ? `url('${paperUrl(id)}')` : 'none', transform: `translate(-50%, -50%) rotate(${q * 90}deg) scaleX(${flip ? -1 : 1})` });
                    const t = ta[0];
                    Object.assign(t.style, { left: `${50 + at.u * 90}%`, top: `${50 + at.v * 90}%` });
                    html.find('.heart-board-sheet .grip').css({ left: `${50 + at.u * 90}%`, top: `calc(${50 + at.v * 90}% - 44px)` });
                };
                lay();
                html.find('[data-q]').on('click', (ev) => {
                    q = (q + Number(ev.currentTarget.dataset.q) + 4) % 4;
                    touched.q = true;
                    lay();
                });
                html.find('[name=tilt]').on('input', (ev) => {
                    deg = Number(ev.currentTarget.value);
                    touched.r = true;
                    html.find('.heart-board-turns output').text(`${deg}°`);
                    lay();
                });
                // the writing dragged by its handle, in the paper's own frame
                html.find('.heart-board-sheet .grip').on('pointerdown', (ev) => {
                    ev.preventDefault();
                    const r = sheet.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const a = (-deg * Math.PI) / 180;
                    const W = sheet.offsetWidth * 0.9;
                    const H = sheet.offsetHeight * 0.9;
                    const move = (e) => {
                        const dx = e.clientX - cx;
                        const dy = e.clientY - cy;
                        at = { u: Math.max(-0.5, Math.min(0.5, (dx * Math.cos(a) - dy * Math.sin(a)) / W)), v: Math.max(-0.5, Math.min(0.5, (dx * Math.sin(a) + dy * Math.cos(a)) / H)) };
                        touched.at = true;
                        lay();
                    };
                    const up = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                });
                // the text shows the hand, paint, and paper as they are picked
                html.find('[name=face]').on('change', (ev) => {
                    const f = ev.currentTarget.value;
                    ta.css({ 'font-family': `'${f}'`, 'font-size': `${sizeOf(f)}px` });
                    html.find('.heart-board-faces .face').removeClass('on');
                    $(ev.currentTarget).closest('.face').addClass('on');
                });
                const tint = () => ta.css('color', colourOf(html.find('[name=paint]:checked').val()));
                html.find('[name=paint]').on('change', tint);
                html.find('[name=bright]').on('change', (ev) => {
                    lit = Number(ev.currentTarget.value);
                    html.find('.heart-board-paints [name=paint]').each((_, el) => {
                        if (el.value !== '') $(el).next('span').css('background', hex(brushColor(marker[Number(el.value)], lit)));
                    });
                    tint();
                });
                html.find('[name=paper]').on('change', lay);
                // (and as it is set)
                const setLook = () => {
                    const on = (k) => html.find(`[name=${k}]`).is(':checked');
                    ta.css({ 'text-align': html.find('[name=align]:checked').val() ?? 'center', 'font-weight': on('bold') ? 'bold' : '', 'font-style': on('italic') ? 'italic' : '', 'text-decoration': [on('underline') ? 'underline' : '', on('strike') ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' });
                };
                html.find('.heart-board-style input').on('change', setLook);
                setLook();
            },
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 520 })).render(true);
    });
}

// (what of a dialog's answer the relay takes for a note's look)
const noteLookOf = (a) => ({ paint: a.paint, bright: a.bright, ...('pturn' in a ? { pturn: a.pturn } : {}), ...('r' in a ? { r: a.r } : {}), ...(a.textAt ? { textAt: a.textAt } : {}) });

// A player pins a note (type 'note') or writes straight on the sheet
// ('scrawl') at a board point, in their hand
export async function playerAddNote(scene, at, type = 'note') {
    const hand = await ensureHand();
    if (!hand) return;
    const answer = await noteDialog({ hand, type, title: type === 'scrawl' ? 'heart.board.write-title' : 'heart.board.note-title' });
    if (!answer?.text) return;
    // (a click just off the sheet puts it at the sheet's edge: the GM's
    // client refuses a point past it; Luke, 2026-10-21)
    const { look } = await loadBoardLook();
    const x = Math.max(0, Math.min(look.w, Math.round(at.x)));
    const y = Math.max(0, Math.min(look.h, Math.round(at.y)));
    return asked(scene, 'board.addNote', { sceneId: scene.id, type, x, y, text: answer.text, paper: answer.paper, ink: answer.ink, style: answer.style, typed: answer.typed, look: noteLookOf(answer) });
}

// A player's request to the GM: what it changed comes back, kept as their
// own edit to undo (Luke, 2026-10-06)
async function asked(scene, op, data) {
    const res = await askGM(op, data);
    if (res?.undo) pushEdit(scene, res.undo);
    return res;
}

// A player moves their own notes and writing ({ key: { x, y } })
export async function playerMove(scene, moves) {
    if (!Object.keys(moves ?? {}).length) return;
    return asked(scene, 'board.moveOwn', { sceneId: scene.id, moves });
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
    // (the paper it lies on now, for the preview)
    const vs = canvas.heartBoard?.renderer?.view?.scraps?.find((x) => x.key === key)?.layout;
    const shownPaper = vs?.paper?.tex ?? null;
    // (its paper's turn, its own turn, and its writing's place, as it lies)
    const textAt = s.parts?.text && Number.isFinite(s.parts.text.u) ? { u: s.parts.text.u, v: s.parts.text.v } : null;
    const answer = await noteDialog({ text: s.text ?? '', hand: face, paper: s.paper ?? null, ink: s.ink ?? null, type: s.type, chooseHand: gm, title: 'heart.board.note-edit', style: s, typed: Boolean(s.typed), shownPaper, paint: s.paint ?? null, bright: s.bright ?? null, pturn: vs?.paper?.turn ?? 0, flip: Boolean(vs?.paper?.flip), turn: vs ? Math.round(((vs.paper?.rot ?? 0) * 180) / Math.PI) : 0, textAt });
    if (!answer?.text) return;
    if (gm) return setScrap(scene, key, { text: answer.text, hand: answer.hand === face && !s.hand ? null : answer.hand, paper: answer.paper, ink: answer.ink, typed: Boolean(answer.typed), ...answer.style, ...noteFields(answer, look, s) });
    return asked(scene, 'board.editNote', { sceneId: scene.id, key, text: answer.text, paper: answer.paper, ink: answer.ink, style: answer.style, typed: answer.typed, look: noteLookOf(answer) });
}

// A players' board owner's edit, or anyone's marker stroke, through the GM
export function boardEdit(scene, request) {
    return asked(scene, 'board.edit', { sceneId: scene.id, ...request });
}

const cleanInk = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(15, Math.round(Number(v)))));

// A player's strings (Luke, 2026-10-03): theirs to make in the sheet's
// paints (never a delve, the Vermissian, or a path), and to edit; pins theirs
// when they made them or only their strings run through them. Everything else
// is refused whole.
function ownedPin(board, id, userId, pending = {}) {
    const p = board.pins?.[id];
    if (!p) return id in pending;
    const refs = Object.values(board.links ?? {}).filter((l) => l.aPin === id || l.bPin === id || (l.joints ?? []).some((j) => j?.pin === id));
    if (refs.length) return refs.every((l) => l.author === userId);
    return p.author === userId;
}
const paintOk = (c, look) => Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) < look.ink.marker.length;
function ownPatchOf(board, patch, userId, look) {
    const out = { pins: {}, links: {}, newLinks: {} };
    if (Object.keys(patch?.scraps ?? {}).length || Object.keys(patch?.newScraps ?? {}).length || Object.keys(patch?.marks ?? {}).length) return null;
    const newPins = patch?.pins ?? {};
    for (const [id, p] of Object.entries(newPins)) {
        if (board.pins?.[id]) {
            if (!ownedPin(board, id, userId)) return null;
            out.pins[id] = p === null ? null : { ...p, author: board.pins[id].author ?? userId };
        } else {
            if (p === null || !p?.tex) return null;
            out.pins[id] = { ...p, author: userId };
        }
    }
    const pinsOf = (l) => [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j?.pin)].filter(Boolean);
    const edits = { ...(patch?.links ?? {}) };
    if (patch?.link) edits[patch.link[0]] = patch.link[1];
    for (const [id, p] of Object.entries(edits)) {
        const l = board.links?.[id];
        if (!l || l.author !== userId) return null;
        if (p === null) { out.links[id] = null; continue; }
        const { kind, state, author, ...rest } = p;
        void kind; void state; void author;
        if ('color' in rest && !paintOk(rest.color, look)) return null;
        if (pinsOf(rest).some((pid) => !ownedPin(board, pid, userId, out.pins))) return null;
        out.links[id] = rest;
    }
    for (const [id, p] of Object.entries(patch?.newLinks ?? {})) {
        if (board.links?.[id] || !paintOk(p?.color, look)) return null;
        if (pinsOf(p).some((pid) => !ownedPin(board, pid, userId, out.pins))) return null;
        out.newLinks[id] = { ...p, kind: 'path', state: 'known', author: userId, color: Number(p.color) };
    }
    return out;
}
async function ownStrings(scene, board, req, userId, sink) {
    const { look } = await loadBoardLook();
    if (req.ownPatch) {
        const patch = ownPatchOf(board, req.ownPatch, userId, look);
        if (!patch) return { status: 'not-allowed' };
        await applyBoardPatch(scene, patch, { sink });
        return { status: 'done' };
    }
    if (req.ownString) {
        const { act = {}, color } = req.ownString;
        if (!paintOk(color, look)) return { status: 'not-allowed' };
        // (ends on pins: theirs; any shared pin made first must be theirs too)
        for (const pid of [act.aPin, act.bPin].filter(Boolean)) if (!ownedPin(board, pid, userId, act.prep?.pins ?? {})) return { status: 'not-allowed' };
        if (act.prep && !ownPatchOf(board, act.prep, userId, look)) return { status: 'not-allowed' };
        const { id, patch } = newStringPatch(board, { ...act }, 'path', look, { color: Number(color), author: userId });
        const clean = ownPatchOf(board, patch, userId, look);
        if (!clean) return { status: 'not-allowed' };
        await applyBoardPatch(scene, clean, { sink });
        if (req.ownString.label) await labelString(scene, id, String(req.ownString.label).slice(0, MAX_TEXT), { sink, author: userId });
        return { status: 'done', id };
    }
    if (req.ownLabel) {
        const l = board.links?.[req.ownLabel.id];
        if (!l || l.author !== userId) return { status: 'not-allowed' };
        const text = String(req.ownLabel.text ?? '').slice(0, MAX_TEXT).trim();
        // (the name tag, its thread, and their pins theirs: Luke, 2026-10-21,
        // else their undo of the name was refused and the tag not theirs to edit)
        if (text) await labelString(scene, req.ownLabel.id, text, { sink, author: userId });
        return { status: 'done' };
    }
    if (req.ownRemove) {
        const links = (req.ownRemove.links ?? []).filter((id) => board.links?.[id]?.author === userId);
        const pins = (req.ownRemove.pins ?? []).filter((id) => ownedPin(board, id, userId));
        if (links.length + pins.length !== (req.ownRemove.links ?? []).length + (req.ownRemove.pins ?? []).length) return { status: 'not-allowed' };
        await removeMany(scene, { scraps: [], pins, links }, { sink });
        return { status: 'done' };
    }
    return { status: 'not-allowed' };
}

// The cards a player may take off (Luke, 2026-10-21: their own notes and
// writing, into the bin like the GM's): each one theirs to move (mayMove),
// and nothing that would go with it anyone else's (a string tied to it, a pin
// in it, a joint it holds). Null refuses the lot; an owner of a players'
// board, or the GM, may take any note or writing.
export function ownCardsOf(board, keys, who) {
    const list = [...new Set([].concat(keys ?? []).map(String))];
    if (!list.length || !who || list.some((k) => !mayMove(board?.scraps?.[k], who))) return null;
    if (who.isGM || who.owner) return list;
    const r = removalOf(board, { scraps: list });
    const theirs = (id) => board.links?.[id]?.author === who.id;
    if (![...r.links, ...Object.keys(r.edits ?? {})].every(theirs)) return null;
    if (!r.pins.every((id) => ownedPin(board, id, who.id))) return null;
    return list;
}

// Whether a player may have a record of theirs undone or done again (Luke,
// 2026-10-06: each player undoes their own edits): every thing it touches,
// before and after, theirs to edit (their notes and writing, their strings and
// pins, their strokes; on a players' board, an owner's any but the GM's places)
export function mayHistory(board, rec, side, who) {
    if (who.isGM) return true;
    // (Luke, 2026-10-21: a path to a whole collection, ['scraps'] or
    // ['links'], named no card or string, so every check below passed and a
    // crafted record could empty the board; an edit's records never hold one,
    // nor a path through __proto__)
    if (!(rec?.ops ?? []).every((op) => safePath(op?.path) && op.path.length >= 2)) return false;
    const target = recordTarget(board, rec, side);
    const mine = (v) => v?.author === who.id;
    for (const op of rec?.ops ?? []) {
        const [coll, id, field, sub] = op.path;
        const versions = (b) => [board, target].map((x) => (b(x)));
        if (coll === 'marks') {
            if (!(who.owner || id === who.id)) return false;
        } else if (coll === 'scraps' && field === 'marks') {
            // (one stroke, or a card's strokes whole: its first stroke made
            // the record name them all, Luke 2026-10-21, so a player's undo
            // of their first stroke on a place was refused)
            const strokes = (x) => (sub ? [x?.scraps?.[id]?.marks?.[sub]] : Object.values(x?.scraps?.[id]?.marks ?? {}));
            if (!versions(strokes).flat().every((st) => !st || who.owner || st.by === who.id)) return false;
        } else if (coll === 'bits') {
            // (the board's loose pieces: a players' board's owners move them)
            if (!who.owner) return false;
        } else if (coll === 'scraps') {
            if (!versions((x) => x?.scraps?.[id]).every((sc) => !sc || ((sc.type === 'note' || sc.type === 'scrawl') && (who.owner || mine(sc))))) return false;
        } else if (coll === 'links') {
            if (!versions((x) => x?.links?.[id]).every((l) => !l || who.owner || mine(l))) return false;
        } else if (coll === 'pins') {
            // (theirs, or held only by their strings, as it is now)
            if (!versions((x) => x?.pins?.[id]).every((p) => !p || who.owner || mine(p) || ownedPin(board, id, who.id))) return false;
        } else if (coll === 'bin') {
            // (their own note or writing in the bin, Luke 2026-10-21: taken
            // off by them, so put back by their undo)
            const theirs = (e) => (e.scrap?.type === 'note' || e.scrap?.type === 'scrawl') && (who.owner || mine(e.scrap));
            const whole = op.path.length === 2 ? [op.a, op.b].filter((e) => e !== undefined) : [];
            if (!whole.every((e) => e && theirs(e)) || !versions((x) => x?.bin?.[id]).every((e) => !e || theirs(e))) return false;
        } else return false;
    }
    return true;
}

// The edits the GM's client handed back to each player this session, per
// scene (Luke, 2026-10-21): a player's undo or redo is taken only when it is
// one of them, word for word, so a record made up or changed on its way
// back (a note's size, `typed`, another's hand, a string's kind, past what
// the dialogs allow) is refused. In memory only: once the GM's client
// reloads, a player's older records are refused as forgotten (Luke: "Undo
// doesn't need to survive reloading"). The newest HANDED_MAX are kept, past
// the UNDO_MAX a player's client keeps (api.js).
const HANDED_MAX = 300;
const handed = new Map();
// (a record as one string, its keys in order: it crosses the socket twice)
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const recordText = (rec) => JSON.stringify(canon(rec?.ops ?? []));
function handOut(userId, sceneId, rec) {
    if (!rec?.ops?.length) return rec;
    const at = `${userId}:${sceneId}`;
    const list = handed.get(at) ?? new Set();
    handed.set(at, list);
    const text = recordText(rec);
    list.delete(text);
    list.add(text);
    while (list.size > HANDED_MAX) list.delete(list.values().next().value);
    return rec;
}
const wasHanded = (userId, sceneId, rec) => Boolean(handed.get(`${userId}:${sceneId}`)?.has(recordText(rec)));
// (what a reload of the GM's client does to them: the tests' stand-in)
export function forgetHandedRecords() {
    handed.clear();
}

// Whether a player may put a note on a scene (Luke, 2026-10-21): one they
// can see, the active scene or one they have at least Limited on, or the one
// they are on (a GM's pull), never any board scene by its id
function maySeeScene(scene, user) {
    if (!scene || !user) return false;
    if (user.isGM || scene.active || user.viewedScene === scene.id) return true;
    return Boolean(scene.testUserPermission(user, 'LIMITED'));
}
// A point on the board (board px within the look's sheet, never past it)
const onBoard = (look, x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= look.w && y <= look.h;

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
    registerRelayHandler('board.addNote', async ({ sceneId, type = 'note', x, y, text, paper = null, ink = null, style = {}, typed = false, look: noteLook = null }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        const hand = hands()[userId];
        if (!isBoardScene(scene) || !hand || !['note', 'scrawl'].includes(type)) return { status: 'not-allowed' };
        // (a board the player can see, never another by its id; Luke, 2026-10-21)
        if (!maySeeScene(scene, game.users.get(userId))) return { status: 'not-allowed' };
        const clean = String(text ?? '').slice(0, MAX_TEXT).trim();
        if (!clean || !Number.isFinite(x) || !Number.isFinite(y)) return { status: 'not-allowed' };
        const { look } = await loadBoardLook();
        // (on the sheet: the player's own client keeps a click there, so a
        // point past it is refused)
        if (!onBoard(look, x, y)) return { status: 'not-allowed' };
        // (never a key a card in the bin holds: model.js keysTaken)
        const taken = keysTaken(boardOf(scene));
        let i = 1;
        while (taken[`p${i}`]) i++;
        const data = { type, text: clean, x, y, hand, author: userId, state: 'known', ...textStyleOf(style), ...(typed && mayType(userId) ? { typed: true } : {}) };
        if (type === 'note' && paper && look.pools.notes.includes(paper)) data.paper = paper;
        if (cleanInk(ink) !== null) data.ink = cleanInk(ink);
        // (its paint, its paper's turn, its own turn, its writing's place)
        for (const [k, v] of Object.entries(noteFields(noteLook ?? {}, look))) if (v !== null && (type === 'note' || k === 'paint' || k === 'bright')) data[k] = v;
        // (it may come with a doodle, theirs to move or rub out: Luke 2026-10-06)
        const doodle = type === 'note' ? seasonMarks(`${scene.id}:p${i}`, { by: userId, type }) : {};
        if (Object.keys(doodle).length) data.marks = doodle;
        const sink = [];
        await writeBoard(scene, { [`flags.heart.board.scraps.p${i}`]: data }, { sink });
        return { status: 'done', key: `p${i}`, undo: handOut(userId, scene.id, mergeRecords(sink)) };
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
        const sink = [];
        if (Object.keys(data).length) await writeBoard(scene, data, { sink });
        return { status: 'done', undo: handOut(userId, scene.id, mergeRecords(sink)) };
    });
    registerRelayHandler('board.editNote', async ({ sceneId, key, text, paper, ink, style = {}, typed = false, look: noteLook = null }, userId) => {
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
        // (typed only by those who may type)
        data[`flags.heart.board.scraps.${key}.typed`] = Boolean(typed) && mayType(userId);
        if (paper === null || look.pools.notes.includes(paper)) data[`flags.heart.board.scraps.${key}.paper`] = paper ?? null;
        for (const [k, v] of Object.entries(noteFields(noteLook ?? {}, look, s))) if (s.type === 'note' || k === 'paint' || k === 'bright' || k === 'ink') data[`flags.heart.board.scraps.${key}.${k}`] = v;
        const sink = [];
        await writeBoard(scene, data, { sink });
        return { status: 'done', undo: handOut(userId, scene.id, mergeRecords(sink)) };
    });
    // a player's own edit undone or done again (api.js step): checked, then
    // applied to the board as it is now
    registerRelayHandler('board.history', async ({ sceneId, record, side }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        if (!isBoardScene(scene) || !Array.isArray(record?.ops) || !record.ops.every((op) => safePath(op?.path)) || !['before', 'after'].includes(side)) return { status: 'missing' };
        const user = game.users.get(userId);
        if (!user) return { status: 'not-allowed' };
        // (only a record this client handed them, unchanged: else made up, or
        // from before a reload; Luke, 2026-10-21)
        if (!user.isGM && !wasHanded(userId, scene.id, record)) return { status: 'forgotten' };
        const who = { id: userId, isGM: user.isGM, owner: ownsBoard(scene, userId) };
        const board = boardOf(scene);
        if (!mayHistory(board, record, side, who)) return { status: 'not-allowed' };
        const data = recordUpdate(board, record, side);
        if (Object.keys(data).length) await writeBoard(scene, data, { record: false });
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
        // (what it changes, handed back: the asker's own edit to undo)
        const sink = [];
        const res = await boardEditFor(scene, board, req, userId, who, sink);
        return res?.status === 'done' ? { ...res, undo: handOut(userId, scene.id, mergeRecords(sink)) } : res;
    });
}

async function boardEditFor(scene, board, req, userId, who, sink) {
    // a stroke on a card (Luke, 2026-10-03): the card's, in its own frame,
    // its author the one who drew it
    if (req.mark?.on) {
        const s = board.scraps?.[req.mark.on];
        const st = cleanStroke({ ...req.mark, by: userId }, { card: true });
        if (!s || !st) return { status: 'not-allowed' };
        const { look } = await loadBoardLook();
        st.w = Math.min(st.w, markMax(look));
        await applyBoardPatch(scene, { scraps: { [req.mark.on]: { marks: { [customKey('m', s.marks ?? {})]: st } } } }, { sink });
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
        await applyBoardPatch(scene, { marks, scraps }, { sink });
        return { status: 'done' };
    }
    if (req.mark) {
        const pts = (Array.isArray(req.mark.pts) ? req.mark.pts : []).map((v) => Math.round(Number(v))).filter(Number.isFinite).slice(0, 6000);
        if (pts.length < 4 || pts.length % 2) return { status: 'not-allowed' };
        const { look } = await loadBoardLook();
        const o = Number(req.mark.o);
        await addMark(scene, userId, { c: cleanInk(req.mark.c) ?? 0, w: Math.max(1, Math.min(markMax(look), Number(req.mark.w) || 6)), ...(Number.isFinite(o) ? { o: Math.max(0.05, Math.min(1, o)) } : {}), ...(Number.isFinite(Number(req.mark.b)) ? { b: Math.max(0, Math.min(2, Math.round(Number(req.mark.b)))) } : {}), pts }, { sink });
        return { status: 'done' };
    }
    if (req.unmark) {
        const mayGo = (e) => (String(e[0]).startsWith('@') ? mayRubOut(board.scraps?.[String(e[0]).slice(1)]?.marks?.[e[1]]?.by, who) : mayRubOut(e[0], who));
        await removeMarks(scene, (Array.isArray(req.unmark) ? req.unmark : []).filter((e) => Array.isArray(e) && mayGo(e)), { sink });
        return { status: 'done' };
    }
    // a player's own notes and writing taken off, into the bin (Luke,
    // 2026-10-21): refused whole if any of it, or what goes with it, isn't theirs
    if (req.ownCards) {
        const keys = ownCardsOf(board, req.ownCards, who);
        if (!keys) return { status: 'not-allowed' };
        await binCards(scene, keys, { sink, by: userId });
        return { status: 'done' };
    }
    // a player's own strings (Luke, 2026-10-03): made, edited, named, taken off
    if (req.ownString || req.ownPatch || req.ownRemove || req.ownLabel) return ownStrings(scene, board, req, userId, sink);
    if (!who.isGM && !who.owner) return { status: 'not-allowed' };
    const ownable = (key) => board.scraps?.[key] && mayMove(board.scraps[key], who);
    if (req.patch) {
        if (Object.keys(req.patch.scraps ?? {}).some((k) => !ownable(k))) return { status: 'not-allowed' };
        // (new pieces of a players' board are notes and writing only)
        if (Object.values(req.patch.newScraps ?? {}).some((s) => !['note', 'scrawl'].includes(s?.type))) return { status: 'not-allowed' };
        await applyBoardPatch(scene, req.patch, { sink });
    }
    let id = null;
    if (req.addLink) id = await addLink(scene, req.addLink, { sink });
    // (a new string from the shared controls' ends, pins made as needed)
    if (req.addString) id = await addString(scene, req.addString.act, req.addString.kind, { color: cleanInk(req.addString.color), state: req.addString.state === 'hidden' ? 'hidden' : 'known' }, { sink });
    // a name for the new string (or one named by req.label.id)
    if (req.label?.text && (id || req.label.id)) await labelString(scene, id ?? req.label.id, String(req.label.text).slice(0, MAX_TEXT), { sink });
    if (req.addPin?.tex) await addPin(scene, req.addPin, { sink });
    if (id && !req.removeScrap && !req.removeLink && !req.remove) return { status: 'done', id };
    // (a card comes off into the bin, never gone)
    if (req.removeScrap) {
        if (!ownable(req.removeScrap)) return { status: 'not-allowed' };
        await removeScrap(scene, req.removeScrap, { sink, by: userId });
    }
    if (req.removeLink) await removeLink(scene, req.removeLink, { sink });
    if (req.remove) {
        const scraps = (req.remove.scraps ?? []).filter(ownable);
        if (scraps.length) await binCards(scene, scraps, { sink, by: userId });
        await removeMany(scene, { scraps: [], pins: req.remove.pins ?? [], links: req.remove.links ?? [] }, { sink });
    }
    return { status: 'done' };
}

/* -------------------------------------------- */
/*  The tools' dialogs                          */
/* -------------------------------------------- */

// An existing string's kind, name, and colour (a new one never asks: Luke,
// 2026-10-06; double-click it to come here)
// `player`: a player's own string (Luke, 2026-10-03): one of the sheet's
// paints, never a delve, the Vermissian, or a path (their kinds and default
// colours are the GM's)
export async function stringDialog({ kind = 'delve', label = '', color = null, player = false } = {}) {
    // (any string in any of the brush's paints, in the brush's order and
    // names: Luke 2026-10-21)
    const { look } = await loadBoardLook();
    const marker = look.ink.marker ?? [];
    const pick = player ? color ?? 0 : color;
    const own = player ? '' : `<label class="any"><input type="radio" name="color" value="" ${pick === null || pick === undefined ? 'checked' : ''}><span>${esc(loc('heart.board.string-color-own'))}</span></label>`;
    const colors = row(loc('heart.board.string-color'), `<div class="heart-board-paints">${own}${paintOrder(marker.length).map((i) => `<label data-tooltip="${esc(paintName(i))}"><input type="radio" name="color" value="${i}" ${i === pick ? 'checked' : ''}><span style="background:${hex(marker[i])}"></span></label>`).join('')}</div>`);
    // (its kind as chips, not a dropdown)
    const kinds = player ? '' : row(loc('heart.board.kind'), `<span class="heart-board-chips">${['delve', 'rail', 'path'].map((k) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${esc(loc(`heart.board.kind-${k}`))}</span></label>`).join('')}</span>`);
    const name = row(loc('heart.board.string-name'), `<input type="text" name="label" value="${esc(label)}" placeholder="${esc(loc('heart.board.string-name-hint'))}">`);
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.string-this'),
            content: `${kinds}${name}${colors}`,
            buttons: {
                ok: {
                    label: loc('heart.board.keep-it'),
                    callback: (html) => {
                        const c = html.find('[name=color]:checked').val();
                        resolve({ kind: player ? 'path' : html.find('[name=kind]:checked').val() ?? kind, label: String(html.find('[name=label]').val() ?? '').trim(), color: c === '' || c === undefined ? (player ? 0 : null) : Number(c) });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 })).render(true);
    });
}

// Which pin to put in (the Pin tool): every pin the look offers, as pictures
// (thumb: paint.js pinThumb, each pin stood upright and cut to itself)
export async function pinDialog({ thumb = null } = {}) {
    const { look, textures } = await loadBoardLook();
    const ids = pinChoices(look, Object.keys(textures)).filter((id) => textureUrl(textures, id));
    let picked = null;
    return new Promise((resolve) => {
        const d = new Dialog({
            title: loc('heart.board.pin-title'),
            content: `<p>${esc(loc('heart.board.pin-hint'))}</p><div class="heart-board-pins">${ids.map((id) => `<button type="button" data-pin="${esc(id)}" data-tooltip="${esc(pinName(id))}" aria-label="${esc(pinName(id))}"><img src="${textureUrl(textures, id)}" alt=""></button>`).join('')}</div>`,
            buttons: { cancel: { label: loc('Cancel') } },
            default: 'cancel',
            render: (html) => {
                html.find('[data-pin]').on('click', (ev) => {
                    picked = ev.currentTarget.dataset.pin;
                    d.close();
                });
                if (thumb) {
                    html.find('[data-pin] img').each((_, im) => {
                        const swap = () => { const c = thumb(im, im.closest('[data-pin]').dataset.pin, 96); im.replaceWith(c); };
                        if (im.complete && im.naturalWidth) swap();
                        else im.addEventListener('load', swap, { once: true });
                    });
                }
            },
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

// When, in words (a minute ago, 3 hours ago, on 6 Oct)
function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return loc('heart.board.ago-now');
    if (m < 60) return loc('heart.board.ago-min', { n: m });
    if (m < 60 * 24) return loc('heart.board.ago-hour', { n: Math.round(m / 60) });
    return new Date(t).toLocaleString();
}

// The bin (Luke, 2026-10-06): the cards taken off this board, newest first,
// each to put back where it was (the GM's)
export async function binDialog(scene) {
    if (!game.user.isGM || !scene) return;
    const { look } = await loadBoardLook();
    const list = binList(boardOf(scene), look);
    const kind = (t) => loc(t === 'note' ? 'heart.board.bin-note' : t === 'scrawl' ? 'heart.board.bin-writing' : 'heart.board.bin-place');
    const rows = list.length
        ? list.map((e) => `<div class="heart-board-bin-row"><div><b>${esc(String(e.name).slice(0, 60))}</b><small>${esc(kind(e.type))}, ${esc(ago(e.at))}${e.by && game.users.get(e.by) ? `, ${esc(game.users.get(e.by).name)}` : ''}</small></div><button type="button" class="heart-board-act" data-unbin="${esc(e.key)}"><i class="fa-solid fa-rotate-left"></i> ${esc(loc('heart.board.bin-restore'))}</button></div>`).join('')
        : `<p>${esc(loc('heart.board.bin-none'))}</p>`;
    const d = new Dialog({
        title: loc('heart.board.bin-title'),
        content: `<p>${esc(loc('heart.board.bin-hint'))}</p><div class="heart-board-bin">${rows}</div>`,
        buttons: {
            empty: {
                icon: '<i class="fa-solid fa-trash"></i>',
                label: loc('heart.board.bin-empty'),
                callback: async () => {
                    if (!list.length) return;
                    const ok = await askBoard({ title: loc('heart.board.bin-empty'), content: loc('heart.board.bin-empty-confirm', { n: list.length }), yes: loc('heart.board.ask.let-go'), no: loc('heart.board.ask.keep-them') });
                    if (ok) await emptyBin(scene);
                },
            },
            close: { label: loc('Close') },
        },
        default: 'close',
        render: (html) => html.find('[data-unbin]').on('click', async (ev) => {
            const key = ev.currentTarget.dataset.unbin;
            await unbinCard(scene, key);
            d.close();
            binDialog(scene);
        }),
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 }));
    d.render(true);
}

// Earlier boards (Luke, 2026-10-06): the copies this browser kept, newest
// first; one put back replaces the board (an edit, so Undo takes it back)
export async function backupsDialog(scene) {
    if (!game.user.isGM || !scene) return;
    const list = await listBackups(scene.id);
    const why = (w) => loc(`heart.board.history-why-${['start', 'removed', 'replaced'].includes(w) ? w : 'edits'}`);
    const rows = list.length
        ? list.map((e) => `<div class="heart-board-bin-row"><div><b>${esc(ago(e.at))}</b><small>${esc(why(e.why))}: ${esc(loc('heart.board.history-counts', { cards: e.counts?.cards ?? 0, strings: e.counts?.strings ?? 0, strokes: e.counts?.strokes ?? 0 }))}</small></div><button type="button" class="heart-board-act" data-backup="${e.id}"><i class="fa-solid fa-clock-rotate-left"></i> ${esc(loc('heart.board.history-restore'))}</button></div>`).join('')
        : `<p>${esc(loc('heart.board.history-none'))}</p>`;
    const d = new Dialog({
        title: loc('heart.board.history-title'),
        content: `<p>${esc(loc('heart.board.history-hint'))}</p><div class="heart-board-bin">${rows}</div>`,
        buttons: { close: { label: loc('Close') } },
        default: 'close',
        render: (html) => html.find('[data-backup]').on('click', async (ev) => {
            const id = Number(ev.currentTarget.dataset.backup);
            const ok = await askBoard({ title: loc('heart.board.history-title'), content: loc('heart.board.history-confirm'), yes: loc('heart.board.ask.put-back'), no: loc('heart.board.ask.keep-this') });
            if (!ok) return;
            const board = await readBackup(id);
            if (!board) return ui.notifications.warn(loc('heart.board.history-gone'));
            d.close();
            await replaceBoard(scene, board);
            ui.notifications.info(loc('heart.board.history-done'));
        }),
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 }));
    d.render(true);
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

// A board pasted from the editor, or (Luke, 2026-10-21) loaded from a file
// this computer has (a downloaded board): its text lands in the box, then
// Import takes it the same way
export function importDialog() {
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.import-title'),
            content: `<p>${esc(loc('heart.board.import-hint'))}</p>
                <div class="heart-board-file"><label class="heart-board-act"><input type="file" accept=".json,application/json" hidden><i class="fa-solid fa-file-arrow-up"></i> ${esc(loc('heart.board.import-file'))}</label><span class="name"></span></div>
                <textarea name="json" rows="14" placeholder="{ &quot;scraps&quot;: ... }"></textarea>`,
            buttons: {
                ok: { label: loc('heart.board.import'), callback: (html) => resolve(String(html.find('[name=json]').val() ?? '')) },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => html.find('input[type=file]').on('change', async (ev) => {
                const file = ev.currentTarget.files?.[0];
                if (!file) return;
                try {
                    html.find('[name=json]').val(await file.text());
                    html.find('.heart-board-file .name').text(file.name);
                } catch {
                    ui.notifications.error(loc('heart.board.import-bad'));
                }
            }),
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 560 })).render(true);
    });
}

// A new place (Luke, 2026-10-21: File, New place, for places invented at the
// table): its name, a picture (Foundry's file picker; none is fine), hidden or
// known, and where its card goes. Resolves { name, img, state, where } or null.
export function placeDialog() {
    const chips = (name, list, on) => `<span class="heart-board-chips">${list.map(([v, key]) => `<label><input type="radio" name="${name}" value="${v}" ${v === on ? 'checked' : ''}><span>${esc(loc(key))}</span></label>`).join('')}</span>`;
    const content = `<p>${esc(loc('heart.board.place-hint'))}</p>
        ${row(loc('heart.board.place-name'), `<input type="text" name="name" placeholder="${esc(loc('heart.board.place-name-hint'))}">`)}
        ${row(loc('heart.board.place-img'), `<div class="heart-board-file"><input type="text" name="img" placeholder="${esc(loc('heart.board.place-img-hint'))}"><button type="button" class="heart-board-act" data-browse><i class="fa-solid fa-file-image"></i> ${esc(loc('heart.board.place-browse'))}</button></div>`)}
        <img class="heart-board-place-img" alt="" hidden>
        ${row(loc('heart.board.place-state'), chips('state', [['hidden', 'heart.board.place-hidden'], ['known', 'heart.board.place-known']], 'hidden'))}
        ${row(loc('heart.board.place-where'), chips('where', [['centre', 'heart.board.place-centre'], ['click', 'heart.board.place-click']], 'centre'))}`;
    return new Promise((resolve) => {
        const d = new Dialog({
            title: loc('heart.board.place-title'),
            content,
            buttons: {
                ok: {
                    label: loc('heart.board.place-make'),
                    callback: (html) => {
                        const name = String(html.find('[name=name]').val() ?? '').trim();
                        if (!name) {
                            ui.notifications.warn(loc('heart.board.place-no-name'));
                            return resolve(null);
                        }
                        resolve({ name, img: String(html.find('[name=img]').val() ?? '').trim() || null, state: html.find('[name=state]:checked').val() === 'known' ? 'known' : 'hidden', where: html.find('[name=where]:checked').val() === 'click' ? 'click' : 'centre' });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => {
                const field = html.find('[name=img]');
                const shot = html.find('.heart-board-place-img');
                const show = () => {
                    const src = String(field.val() ?? '').trim();
                    shot.attr('src', src || null).prop('hidden', !src);
                    d.setPosition({ height: 'auto' });
                };
                field.on('change', show);
                html.find('[data-browse]').on('click', () => new FilePicker({ type: 'image', current: String(field.val() ?? ''), callback: (path) => { field.val(path); show(); } }).render(true));
                html.find('[name=name]').trigger('focus');
            },
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 }));
        d.render(true);
    });
}
