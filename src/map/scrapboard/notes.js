// Notes on the scrapboard map, and the dialogs its tools ask through
// (2026-10-02, Luke). Players may pin notes and edit the text, paper, and
// ink of their own, size and turn them, and move the pieces on them, and
// draw with the brush on a layer of their own. Anything anyone makes is its
// maker's or public (Luke, 2026-10-24): a public one is anyone's to change
// as its maker's is, and only its maker and the GM switch it. Each player writes in a hand of their own:
// they pick one of the map's handwriting faces with their first note, and it
// is theirs from then on (no one else may take it, and they may not pick
// again), their "visual voice" on the board. On a players' board its owners
// do anything but see what's hidden or bring in places. The GM has full
// control and, in the player view, can try the picker without claiming a
// hand. Players' writes go through the GM's relay (one queue on the GM's
// client; each request checked against who asked).
import { LINK_KINDS, nibOf, cutPatch, freshStrokeIds, doodlePatch, DOODLE_KINDS, isSavedKind, cleanSavedDoodle,absorbPatch, mayShareStroke, HAND_SCALE, pinChoices, pickFrom, ALIGNS, TEXT_STYLES, textStyleOf, markMax, cleanStroke, keysTaken, safePath, TYPEWRITER, newStringPatch, mergeRecords, recordTarget, recordUpdate, binList, removalOf, brushColor, PAINT_NAMES, PAINT_ORDER, noteFields, mineOrOpen, mayShare, mayBit, sharePatch, breakAwayPatch, normalizeBoard, scrapLayout, boardView, WEB_TEX, TEXT_SIZE_MIN, NOTE_AR_MIN, MAX_INKS, sheetLook, pickNotePaper, notePreview, uvOn, fmtOf } from './model.js';
import { listBackups, readBackup } from './backups.js';
import { askGM, registerRelayHandler, runLocal } from '../../common/relay.js';
import { heartDialogOptions } from '../../common/dialog.js';
import { mayMove, mayRubOut, mayStroke, PLAYER_MAX_SIZE, DOODLE_MIN, DOODLE_MAX } from './controls.js';

// (the move rule lives with the shared controls; re-exported for the tests)
export { mayMove };
import {
    boardOf, isBoardScene, ownsBoard, setScrap, applyBoardPatch, addPin, addMark, removeMarks, removeScrap, removeLink, removeMany, labelString, addString,
    writeBoard, pushEdit, binCards, unbinCard, emptyBin, replaceBoard, layoutTools, tidiedBoard, sheetRoom, resizeBoardSheet,
} from './api.js';
import { loadBoardLook, textureUrl } from './look.js';
import { richHtml, readRich, wireRich } from './richtext.js';
import { pinThumb } from './paint.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
const hex = (c) => `#${(Number(c) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
export const HANDS = Object.keys(HAND_SCALE);
const MAX_TEXT = 300;
// the largest a player may size their own note or writing (its `s`), so one
// can't be blown up over the whole board (the controls' own limit, so a
// player is never shown a size refused here: Luke 2026-10-25)
const MAX_SIZE = PLAYER_MAX_SIZE;
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
            // (Enter leaves things be: the safe answer is the default; Luke
            // 2026-10-23, the board safety audit)
            default: 'no',
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
    // whether the GM's doing on the map is shown to the players as it happens
    // (Luke, 2026-10-25: on; File's switch turns it off for quiet prep)
    game.settings.register('heart', 'boardLiveShare', { scope: 'client', config: false, type: Boolean, default: true });
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

// A player's hand let go (Luke, 2026-10-25: the GM's right-click on it in the
// note window): they pick one again the next time they write; their notes
// already on the board keep the hand they were written in. The GM's.
// (in the relay's queue, read there: a claim a moment before is never lost;
// Luke 2026-10-25, the health audit)
export async function freeHand(face) {
    if (!game.user.isGM) return false;
    return runLocal('board.freeHand', () => letHandsGo((id, f) => f === face));
}

// (the GM never holds a hand: theirs only kept it from the players; Luke
// 2026-10-25) any a GM held let go, by the active GM once the world is up
export async function freeGMHands() {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
    await runLocal('board.freeGMHands', () => letHandsGo((id) => game.users.get(id)?.isGM));
}

// the hands whose holders `which(userId, face)` names let go; whether any were
async function letHandsGo(which) {
    const all = { ...hands() };
    const ids = Object.entries(all).filter(([id, f]) => which(id, f)).map(([id]) => id);
    if (!ids.length) return false;
    for (const id of ids) delete all[id];
    await game.settings.set('heart', 'boardHands', all);
    return true;
}
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
// paper, ink, ... } (hand, paper, ink null: the board's choice), or null.
// (Luke, 2026-10-24) The note is shown as the board will draw it, by the
// board's own painter: its paper, its writing as large as fits (or smaller,
// its Text size), its hand, paint, turns, and strokes; drag on it to move its
// writing. A new note's paper is picked at once (the dice picks another) and
// kept. `base`: the card as it is (an edit), or where it goes and the key it
// will have (a new one), so what the preview shows is what the board shows.
// `canShare`: its maker or the GM, who may make it public (`open`).
// (Luke, 2026-10-25) `fmt`: its writing set a stretch at a time (model.js);
// bold, italic, underline, and strike through apply to what is selected and
// to what is typed next, the alignment to the whole note. A new note starts
// in Soot at Medium.
export async function noteDialog({ text = '', fmt = [], hand = null, paper = null, ink = null, type = 'note', chooseHand = false, title = 'heart.board.note-title', style = {}, typed = false, shownPaper = null, paint = null, bright = null, pturn = null, turn = null, textAt = null, base = null, open = false, canShare = false, textSize = null } = {}) {
    const canType = mayType();
    const st = textStyleOf(style);
    // (Luke, 2026-10-03: how the writing is set: align, bold, italic,
    // underline, strike through)
    const ICON = { left: 'fa-align-left', center: 'fa-align-center', right: 'fa-align-right', bold: 'fa-bold', italic: 'fa-italic', underline: 'fa-underline', strike: 'fa-strikethrough' };
    const FLAG = { bold: 'b', italic: 'i', underline: 'u', strike: 's' };
    const styleRow = `<div class="heart-board-style">${ALIGNS.map((a) => `<label data-tooltip="${esc(loc(`heart.board.align-${a}`))}"><input type="radio" name="align" value="${a}" ${(st.align ?? 'center') === a ? 'checked' : ''}><span><i class="fa-solid ${ICON[a]}"></i></span></label>`).join('')}<span class="sep"></span>${TEXT_STYLES.map((k) => `<button type="button" class="flag" data-rich-flag="${FLAG[k]}" data-tooltip="${esc(loc(`heart.board.style-${k}`))}" aria-label="${esc(loc(`heart.board.style-${k}`))}"><i class="fa-solid ${ICON[k]}"></i></button>`).join('')}</div>`;
    // (the card's own setting over all of it, from before: now each letter's)
    const all = TEXT_STYLES.filter((k) => st[k]).map((k) => FLAG[k]).join('');
    // (a new note in Soot, at Medium: Luke 2026-10-25, dark writing first)
    const paint0 = type === 'note' && base?.fresh && (paint === null || paint === undefined) ? SOOT_PAINT : paint;
    const { look: look0, textures } = await loadBoardLook();
    // (the board's own painter, its look, and its measures: the preview)
    const R = canvas?.heartBoard?.renderer;
    const look = R?.look ?? look0;
    const painter = R?.look ? R.painter : null;
    const note = type === 'note';
    const papers = note ? look.pools.notes.filter((id) => textureUrl(textures, id)) : [];
    // (a new note of the GM's starts in a hand no player holds: Luke 2026-10-25)
    const heldNow = new Set(Object.values(hands()));
    const face = hand ?? (chooseHand ? look.fonts.hands.find((f) => !heldNow.has(f)) ?? HANDS.find((f) => !heldNow.has(f)) ?? look.fonts.hands[0] : look.fonts.hands[0]);
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
        // (no hand is the GM's: one no player holds is free; Luke 2026-10-25)
        return loc('heart.board.hand-free');
    };
    // (the hands the players hold last, so the GM writes in one of their
    // own; the typewriter after: Luke 2026-10-25)
    const held = (f) => claimed.some(([uid, h]) => h === f && !game.users.get(uid)?.isGM);
    const ordered = [...faces.filter((f) => f !== TYPEWRITER && !held(f)), ...faces.filter((f) => f !== TYPEWRITER && held(f)), ...faces.filter((f) => f === TYPEWRITER)];
    const faceRow = faces.length > 1
        ? `<div class="heart-board-faces">${ordered.map((f) => faceTile(f, { name: 'face', on: f === now, label: f === TYPEWRITER ? '' : f, whose: whose(f), claimed: held(f) })).join('')}</div>`
        : '';
    // its writing in the brush's paints, at the brush's brightnesses (Luke,
    // 2026-10-06: the same choices as the brush); an ink the paper had before
    // stays until a paint is picked
    const marker = look.ink.marker ?? [];
    let lit = bright ?? 1;
    const paintRow = row(loc('heart.board.paint-label'), `<div class="heart-board-paints"><label class="any"><input type="radio" name="paint" value="" ${paint0 === null || paint0 === undefined ? 'checked' : ''}><span>${esc(loc('heart.board.any'))}</span></label>${paintOrder(marker.length).map((i) => `<label data-tooltip="${esc(paintName(i))}"><input type="radio" name="paint" value="${i}" ${i === paint0 ? 'checked' : ''}><span style="background:${hex(brushColor(marker[i], lit))}"></span></label>`).join('')}</div>`)
        + brightRow(lit);
    // its paper (Luke, 2026-10-24): a new note's picked at once, the dice
    // picking another; an older note on Any keeps that until one is picked
    const sizeOfTex = (id) => (textures[id] ? { w: textures[id].w, h: textures[id].h, safe: textures[id].safe, cover: textures[id].cover } : null);
    const size = R?.look ? R.size : sizeOfTex;
    let paperNow = note ? paper ?? (base?.key && !base.fresh ? null : pickNotePaper(look, size)) : null;
    let paperTouched = Boolean(note && !paper && paperNow);
    const paperRow = papers.length
        ? row(loc('heart.board.paper'), `<div class="heart-board-papers">${papers.map((id) => `<label><input type="radio" name="paper" value="${esc(id)}" ${(paperNow ?? shownPaper) === id ? 'checked' : ''}><img src="${textureUrl(textures, id)}" alt=""></label>`).join('')}<button type="button" class="dice" data-dice data-tooltip="${esc(loc('heart.board.paper-again'))}" aria-label="${esc(loc('heart.board.paper-again'))}"><i class="fa-solid fa-dice"></i></button></div>`)
        : '';
    // its writing's size (Luke, 2026-10-24): as large as fits, or smaller
    const pct = Math.round((textSize ?? 1) * 100);
    const sizeRow = note ? row(loc('heart.board.text-size'), `<label class="heart-board-slide" data-tooltip="${esc(loc('heart.board.text-size-hint'))}"><input type="range" name="textSize" min="${Math.round(TEXT_SIZE_MIN * 100)}" max="100" step="5" value="${pct}"><output>${pct >= 100 ? esc(loc('heart.board.text-fit')) : `${pct}%`}</output></label>`) : '';
    // public, or its maker's (Luke, 2026-10-24): its maker's switch, or the GM's
    // its shape stretched by its corner (Luke, 2026-10-24): back to its paper's own
    let shapeBack = false;
    const shapeRow = note && base?.ar ? row(loc('heart.board.note-shape'), `<button type="button" class="heart-board-act" data-shape>${esc(loc('heart.board.note-shape-own'))}</button>`) : '';
    const shareRow = canShare ? row(loc('heart.board.public'), `<label class="heart-board-switch" data-tooltip="${esc(loc('heart.board.public-hint'))}"><input type="checkbox" name="open" ${open ? 'checked' : ''}><span>${esc(loc('heart.board.public-on'))}</span></label>`) : '';
    let q = pturn;
    let deg = turn;
    let at = textAt && Number.isFinite(textAt.u) ? { ...textAt } : null;
    const touched = { q: false, r: false, at: false };
    // (a box that shows each stretch as it is set: Luke 2026-10-25)
    const area = `<div class="heart-board-rich" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" data-rich data-placeholder="${esc(loc(note ? 'heart.board.note-placeholder' : 'heart.board.write-placeholder'))}" style="font-family: '${esc(now)}'; font-size: ${faceSize(now)}px; line-height: 1.15">${richHtml(text, fmt, all)}</div>`;
    const preview = painter
        ? `<div class="heart-board-stage ${note ? '' : 'sheet'}"><canvas></canvas></div>`
        : '';
    // (writing on the sheet tilts too, as a note: Luke 2026-10-25; only a
    // note's paper takes quarter turns)
    const turns = `<div class="heart-board-turns">${note ? `<button type="button" data-q="-1" data-tooltip="${esc(loc('heart.board.note-turn-left'))}"><i class="fa-solid fa-rotate-left"></i></button><button type="button" data-q="1" data-tooltip="${esc(loc('heart.board.note-turn-right'))}"><i class="fa-solid fa-rotate-right"></i></button>` : ''}
            <label><span>${esc(loc('heart.board.note-tilt'))}</span><input type="range" name="tilt" min="-45" max="45" step="1" value="0"><output>0°</output></label></div>`;
    // (Luke, 2026-10-21: Enter writes it, Shift+Enter starts a new line, as
    // in the editor)
    const hint = `<p class="heart-board-hint">${esc(loc(note && painter ? 'heart.board.note-enter-drag' : 'heart.board.note-enter'))}</p>`;
    return new Promise((resolve) => {
        let stop = false;
        const d = new Dialog({
            title: loc(title),
            // (Luke, 2026-10-24: wide, two columns, the hands below, the
            // buttons always in view)
            content: `<div class="heart-note-layout"><div class="heart-note-left">${preview}${area}${hint}${turns}${sizeRow}</div><div class="heart-note-right">${styleRow}${paintRow}${paperRow}${shapeRow}${shareRow}</div></div>${faceRow ? `<div class="heart-note-hands"><span class="lab">${esc(loc('heart.board.note-hands'))}</span>${faceRow}</div>` : ''}`,
            buttons: {
                ok: {
                    icon: '<i class="fa-solid fa-check"></i>',
                    label: loc('heart.board.note-save'),
                    callback: (html) => {
                        const picked = html.find('[name=face]:checked').val() ?? now;
                        const pv = html.find('[name=paint]:checked').val();
                        const ts = Number(html.find('[name=textSize]').val());
                        const w = writingOf();
                        resolve({
                            text: w.text,
                            fmt: w.fmt,
                            hand: chooseHand ? (picked === TYPEWRITER ? face : picked) || null : hand,
                            paper: paperTouched ? paperNow : paper,
                            // (an ink of before kept, unless a paint was picked)
                            ink: pv === '' || pv === undefined ? ink : null,
                            paint: pv === '' || pv === undefined ? null : Number(pv),
                            bright: lit,
                            typed: canType && picked === TYPEWRITER,
                            style: styleOf(html),
                            ...(note && touched.q ? { pturn: q } : {}),
                            ...(touched.r ? { r: deg } : {}),
                            ...(note && touched.at && at ? { textAt: at } : {}),
                            ...(note ? { textSize: Number.isFinite(ts) && ts < 100 ? ts / 100 : null } : {}),
                            ...(canShare ? { open: html.find('[name=open]').is(':checked') } : {}),
                            ...(shapeBack ? { ar: null } : {}),
                        });
                    },
                },
                cancel: { icon: '<i class="fa-solid fa-xmark"></i>', label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => {
                const box = html.find('[data-rich]')[0];
                const ta = $(box);
                // (each hand's tile writes the note's own words: Luke 2026-10-24)
                const sample = () => {
                    const t = writingOf().text.replace(/\s+/g, ' ');
                    html.find('.heart-board-faces .smp').text(t ? t.slice(0, 48) : loc('heart.board.face-sample'));
                };
                ta.on('input', sample);
                sample();
                // (the GM's right-click on a player's hand: it is theirs no
                // more, and they pick again the next time they write; Luke
                // 2026-10-25)
                if (game.user.isGM && chooseHand) {
                    html.find('.heart-board-faces .face.claimed').on('contextmenu', async (ev) => {
                        ev.preventDefault();
                        const tile = $(ev.currentTarget);
                        const f = tile.find('input[name=face]').val();
                        const ok = await askBoard({ title: loc('heart.board.hand-free-title'), content: loc('heart.board.hand-free-confirm', { hand: f, who: whose(f) }), yes: loc('heart.board.hand-free-title'), no: loc('heart.board.ask.keep-it') });
                        if (!ok || !(await freeHand(f))) return;
                        tile.removeClass('claimed');
                        tile.find('small').html(`<b>${esc(f)}</b> ${esc(loc('heart.board.hand-free'))}`);
                        ui.notifications.info(loc('heart.board.hand-freed', { hand: f }));
                    });
                }
                ta.trigger('focus');
                ta.on('keydown', (ev) => {
                    if (ev.key !== 'Enter' || ev.shiftKey || ev.originalEvent?.isComposing) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    d.submit(d.data.buttons.ok, ev.originalEvent ?? ev);
                });
                // the note as the board will draw it (model.js notePreview,
                // the painter's drawPreview), drawn again as it is changed
                const cv = html.find('.heart-board-stage canvas')[0];
                let shown = null;
                let frame = 0;
                let tries = 0;
                const fields = () => {
                    const picked = html.find('[name=face]:checked').val() ?? now;
                    const pv = html.find('[name=paint]:checked').val();
                    const ts = Number(html.find('[name=textSize]').val());
                    const w = writingOf();
                    const out = {
                        ...(base ?? {}), type, text: w.text, fmt: w.fmt,
                        hand: picked === TYPEWRITER ? face : picked, typed: canType && picked === TYPEWRITER,
                        paint: pv === '' || pv === undefined ? null : Number(pv), bright: lit, ink: pv === '' || pv === undefined ? ink : null,
                        ...styleOf(html),
                    };
                    if (deg !== null) out.r = deg;
                    if (note) {
                        out.paper = paperNow ?? base?.paper ?? null;
                        if (q !== null) out.pturn = q;
                        if (at) out.parts = { ...(base?.parts ?? {}), text: { ...(base?.parts?.text ?? {}), u: at.u, v: at.v } };
                        out.textSize = Number.isFinite(ts) && ts < 100 ? ts / 100 : null;
                        if (shapeBack) out.ar = null;
                    }
                    return out;
                };
                const draw = () => {
                    frame = 0;
                    if (!cv || !painter || stop) return;
                    const r = window.devicePixelRatio || 1;
                    const cw = cv.clientWidth || 520;
                    const ch = cv.clientHeight || 340;
                    if (cv.width !== Math.round(cw * r) || cv.height !== Math.round(ch * r)) {
                        cv.width = Math.round(cw * r);
                        cv.height = Math.round(ch * r);
                    }
                    shown = notePreview(fields(), look, R.size, R.measure, cw, ch);
                    const g = cv.getContext('2d');
                    g.setTransform(1, 0, 0, 1, 0, 0);
                    g.clearRect(0, 0, cv.width, cv.height);
                    if (!shown) return;
                    g.setTransform(shown.k * r, 0, 0, shown.k * r, shown.ox * r, shown.oy * r);
                    let done = true;
                    try {
                        done = painter.drawPreview(g, shown.scrap, shown.k * r);
                    } catch (err) {
                        console.warn('heart | the note preview could not be drawn', err);
                    }
                    // (a picture not loaded yet: drawn again once it is)
                    if (!done && tries++ < 40) setTimeout(redraw, 250);
                    // (its tilt and turn as the board has them, until set)
                    // (writing on the sheet: its own turn; Luke 2026-10-25)
                    const P = shown.scrap.layout.paper;
                    if (!touched.r && (note ? P : true)) {
                        const a = note ? Math.round((P.rot * 180) / Math.PI) : Math.round(Number(base?.r) || 0);
                        html.find('[name=tilt]').val(Math.max(-45, Math.min(45, a)));
                        html.find('.heart-board-turns output').text(`${a}°`);
                    }
                };
                const redraw = () => { if (!frame) frame = requestAnimationFrame(draw); };
                redraw();
                // the writing dragged on the note: where it sits on the paper
                if (cv && note) {
                    cv.addEventListener('pointerdown', (ev) => {
                        if (!shown) return;
                        ev.preventDefault();
                        cv.setPointerCapture?.(ev.pointerId);
                        const move = (e) => {
                            const b = cv.getBoundingClientRect();
                            const pt = { x: (e.clientX - b.left - shown.ox) / shown.k, y: (e.clientY - b.top - shown.oy) / shown.k };
                            at = uvOn(shown.scrap.layout, pt);
                            touched.at = true;
                            redraw();
                        };
                        const up = () => {
                            cv.removeEventListener('pointermove', move);
                            cv.removeEventListener('pointerup', up);
                        };
                        move(ev);
                        cv.addEventListener('pointermove', move);
                        cv.addEventListener('pointerup', up);
                    });
                }
                // (bold, italic, underline, and strike through on the selection
                // and what is typed next; Ctrl+B, I, U)
                wireRich(box, html[0], redraw);
                html.find('[data-q]').on('click', (ev) => {
                    const t = shown?.scrap.layout.paper.turn ?? 0;
                    q = ((q ?? t) + Number(ev.currentTarget.dataset.q) + 4) % 4;
                    touched.q = true;
                    redraw();
                });
                html.find('[name=tilt]').on('input', (ev) => {
                    deg = Number(ev.currentTarget.value);
                    touched.r = true;
                    html.find('.heart-board-turns output').text(`${deg}°`);
                    redraw();
                });
                html.find('[name=textSize]').on('input', (ev) => {
                    const v = Number(ev.currentTarget.value);
                    html.find('[name=textSize]').next('output').text(v >= 100 ? loc('heart.board.text-fit') : `${v}%`);
                    redraw();
                });
                html.find('[name=face]').on('change', (ev) => {
                    ta.css({ 'font-family': `'${ev.currentTarget.value}'`, 'font-size': `${faceSize(ev.currentTarget.value)}px` });
                    html.find('.heart-board-faces .face').removeClass('on');
                    $(ev.currentTarget).closest('.face').addClass('on');
                    redraw();
                });
                html.find('[name=paint]').on('change', redraw);
                html.find('[name=bright]').on('change', (ev) => {
                    lit = Number(ev.currentTarget.value);
                    html.find('.heart-board-paints [name=paint]').each((_, el) => {
                        if (el.value !== '') $(el).next('span').css('background', hex(brushColor(marker[Number(el.value)], lit)));
                    });
                    redraw();
                });
                html.find('[name=paper]').on('change', (ev) => {
                    paperNow = ev.currentTarget.value;
                    paperTouched = true;
                    redraw();
                });
                html.find('[data-dice]').on('click', () => {
                    paperNow = pickNotePaper(look, size, paperNow ?? shown?.scrap.layout.paper.tex ?? null);
                    paperTouched = true;
                    html.find('[name=paper]').each((_, el) => { el.checked = el.value === paperNow; });
                    redraw();
                });
                html.find('.heart-board-style input').on('change', redraw);
                html.find('[data-shape]').on('click', (ev) => {
                    shapeBack = true;
                    ev.currentTarget.disabled = true;
                    redraw();
                });
            },
            close: () => {
                stop = true;
                resolve(null);
            },
        }, heartDialogOptions({ classes: ['heart-board-dialog', 'heart-note-dialog'], width: Math.min(980, window.innerWidth - 40), height: Math.min(900, window.innerHeight - 40), resizable: true }));
        // (the box's writing, as long as a card's may be)
        const writingOf = () => {
            const el = d.element?.find?.('[data-rich]')?.[0];
            if (!el) return { text: String(text ?? '').trim(), fmt };
            const w = readRich(el);
            return w.text.length > MAX_TEXT ? { text: w.text.slice(0, MAX_TEXT), fmt: fmtOf(w.fmt, MAX_TEXT) } : w;
        };
        d.render(true);
    });
}

// the paint a new note starts in: Soot, the darkest (Luke, 2026-10-25)
const SOOT_PAINT = 12;

// a note dialog's writing set: its alignment (bold, italic, underline, and
// strike through are each letter's now, its `fmt`: Luke 2026-10-25)
const styleOf = (html) => textStyleOf({ align: html.find('[name=align]:checked').val() });

// (what of a dialog's answer the relay takes for a note's look)
const noteLookOf = (a) => ({ paint: a.paint, bright: a.bright, ...('pturn' in a ? { pturn: a.pturn } : {}), ...('r' in a ? { r: a.r } : {}), ...(a.textAt ? { textAt: a.textAt } : {}) });

// A player pins a note (type 'note') or writes straight on the sheet
// ('scrawl') at a board point, in their hand
export async function playerAddNote(scene, at, type = 'note') {
    const hand = await ensureHand();
    if (!hand) return;
    // (a click just off the sheet puts it at the sheet's edge: the GM's
    // client refuses a point past it; Luke, 2026-10-21)
    // (the board's own sheet: Luke 2026-10-24)
    const look = sheetLook((await loadBoardLook(scene)).look, boardOf(scene));
    const x = Math.max(0, Math.min(look.w, Math.round(at.x)));
    const y = Math.max(0, Math.min(look.h, Math.round(at.y)));
    // (the key it will have, and the doodle it comes with, so the preview is
    // the note: Luke 2026-10-24)
    const key = nextPlayerKey(boardOf(scene));
    const answer = await noteDialog({ hand, type, title: type === 'scrawl' ? 'heart.board.write-title' : 'heart.board.note-title', base: freshBase(scene, key, type, x, y, game.user.id), canShare: true });
    // (a note may be blank: Luke 2026-10-25)
    if (!answer || (!answer.text && type !== 'note')) return;
    return asked(scene, 'board.addNote', { sceneId: scene.id, key, type, x, y, text: answer.text, fmt: answer.fmt ?? [], paper: answer.paper, ink: answer.ink, style: answer.style, typed: answer.typed, look: noteLookOf(answer), open: Boolean(answer.open), textSize: answer.textSize ?? null });
}

// the next key a player's note takes (the relay's: never one a card in the bin holds)
export function nextPlayerKey(board) {
    const taken = keysTaken(board);
    let i = 1;
    while (taken[`p${i}`]) i++;
    return `p${i}`;
}

// A new card as its window previews it (Luke, 2026-10-24): where it goes, the
// key it will have, and whose it is (no doodle: a note never comes with one,
// Luke 2026-10-24)
export function freshBase(scene, key, type, x, y, by = null) {
    void scene;
    return { key, fresh: true, type, x, y, state: 'known', ...(by && !game.users.get(by)?.isGM ? { author: by } : {}) };
}

// A player's request to the GM: what it changed comes back, kept as their
// own edit to undo (Luke, 2026-10-06), even when it failed part way (Luke,
// 2026-10-25)
function asked(scene, op, data) {
    return askGM(op, data, { seen: (res) => { if (res?.undo) pushEdit(scene, res.undo); } });
}

// A note's text, paper, and ink edited; the GM may change its hand too (the
// dialog opens on the hand it writes in now); its maker or the GM makes it
// public or theirs again (Luke, 2026-10-24); anyone edits a public one
export async function editNote(scene, key) {
    const s = boardOf(scene).scraps?.[key];
    if (!s) return;
    const gm = game.user.isGM;
    const who = canvas.heartBoard?.user ?? { id: game.user.id, isGM: gm, owner: ownsBoard(scene, game.user.id) };
    if (!mayMove(s, who)) return ui.notifications.warn(loc('heart.board.not-yours'));
    // (frozen until it is let go, for the GM too: Luke 2026-10-25)
    if (s.locked) return ui.notifications.info(loc('heart.board.locked-frozen'));
    const { look } = await loadBoardLook(scene);
    const face = s.hand ?? pickFrom(look.fonts.hands, `hand:${key}`) ?? look.fonts.hands[0];
    // (the paper it lies on now, for the paper row)
    const vs = canvas.heartBoard?.renderer?.view?.scraps?.find((x) => x.key === key)?.layout;
    const shownPaper = vs?.paper?.tex ?? null;
    const canShare = mayShare(s, who);
    const answer = await noteDialog({ text: s.text ?? '', fmt: s.fmt ?? [], hand: face, paper: s.paper ?? null, ink: s.ink ?? null, type: s.type, chooseHand: gm, title: s.author && s.author === game.user.id ? 'heart.board.note-edit' : 'heart.board.note-edit-any', style: s, typed: Boolean(s.typed), shownPaper, paint: s.paint ?? null, bright: s.bright ?? null, base: { ...foundry.utils.deepClone(s), key }, open: Boolean(s.open), canShare, textSize: s.textSize ?? null });
    if (!answer || (!answer.text && s.type !== 'note')) return;
    if (gm) {
        // (a blank note written on again: its writing back on it)
        const drop = answer.text && (s.drop ?? []).includes('text') ? { drop: s.drop.filter((id) => id !== 'text') } : {};
        return setScrap(scene, key, { text: answer.text, fmt: answer.fmt ?? [], hand: answer.hand === face && !s.hand ? null : answer.hand, paper: answer.paper, ink: answer.ink, typed: Boolean(answer.typed), ...answer.style, ...noteFields(answer, look, s), ...(s.type === 'note' ? { textSize: answer.textSize ?? null } : {}), ...(canShare ? { open: Boolean(answer.open) } : {}), ...('ar' in answer ? { ar: null } : {}), ...drop });
    }
    return asked(scene, 'board.editNote', { sceneId: scene.id, key, text: answer.text, fmt: answer.fmt ?? [], paper: answer.paper, ink: answer.ink, style: answer.style, typed: answer.typed, look: noteLookOf(answer), textSize: answer.textSize ?? null, ...(canShare ? { open: Boolean(answer.open) } : {}), ...('ar' in answer ? { ar: null } : {}) });
}

// A players' board owner's edit, or anyone's marker stroke, through the GM
export function boardEdit(scene, request) {
    return asked(scene, 'board.edit', { sceneId: scene.id, ...request });
}

const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const cleanSize = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) >= 1 ? null : Math.max(TEXT_SIZE_MIN, Number(v)));
const cleanInk = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(MAX_INKS - 1, Math.round(Number(v)))));

// A player's strings (Luke, 2026-10-03): theirs to make in the sheet's
// paints (never a delve, the Vermissian, or a path), and to edit; pins theirs
// when they made them or only their strings run through them. Everything else
// is refused whole.
// (and public ones, Luke 2026-10-24: a string or pin anyone may change)
// (`who`: { id, isGM, owner }; a players' board's owners and the GM, any:
// Luke 2026-10-25)
const ownedLink = (l, who) => Boolean(l) && (who.isGM || who.owner || mineOrOpen(l, who));
function ownedPin(board, id, who, pending = {}) {
    const p = board.pins?.[id];
    if (!p) return id in pending;
    if (who.isGM || who.owner) return true;
    const refs = Object.values(board.links ?? {}).filter((l) => l.aPin === id || l.bPin === id || (l.joints ?? []).some((j) => j?.pin === id));
    if (refs.length) return refs.every((l) => ownedLink(l, who));
    return mineOrOpen(p, who);
}
const paintOk = (c, look) => Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) < look.ink.marker.length;
// (or none: a plain white string, a pin its own colour; Luke 2026-10-25)
const paintOrNone = (c, look) => c === null || c === undefined || paintOk(c, look);

// (Luke, 2026-10-25, the health audit) What the relay takes from a request.
// Every key it names that becomes an object key or a scene update path:
// letters, digits, _ and -, up to 40 of them, never one that reaches an
// object's prototype (and never `-=` or a dot, which those leave out). At
// most REQUEST_MAX things named in one request.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const safeKey = (k) => typeof k === 'string' && /^[\w-]{1,40}$/.test(k) && !UNSAFE_KEYS.has(k);
const REQUEST_MAX = 200;
// (generous, only so no one client fills the scene: a player's notes and
// writing on one board, the strokes on one layer, and on one card)
const NOTES_MAX = 300;
const LAYER_MAX = 2000;
const CARD_MARKS_MAX = 500;
// (how far off the sheet a point may lie, in the sheet's own widths and
// heights, and a card's stroke from its card, in card widths)
const SHEET_REACH = 1;
const CARD_REACH = 20;
const axisOk = (L, side, v) => finite(v) && Number(v) >= -SHEET_REACH * L[side] && Number(v) <= (1 + SHEET_REACH) * L[side];
const inReach = (L, x, y) => axisOk(L, 'w', x) && axisOk(L, 'h', y);
const pointOk = (L, p) => Boolean(p) && inReach(L, Number(p.x), Number(p.y));
// a stroke's points: on or near the sheet, or (a card's) near its card
const ptsOk = (L, pts, card = false) => {
    for (let i = 0; i + 1 < pts.length; i += 2) if (card ? Math.abs(pts[i]) > CARD_REACH || Math.abs(pts[i + 1]) > CARD_REACH : !inReach(L, pts[i], pts[i + 1])) return false;
    return true;
};

// The keys a board.edit request names, and how many things it names:
// { keys, n, bad } (bad: something that should be a map or a list isn't)
function requestNames(req) {
    const keys = [];
    let n = 0;
    let bad = false;
    const ids = (o) => (o && typeof o === 'object' ? Object.keys(o) : []);
    const list = (v) => [].concat(v ?? []);
    const name = (k) => { keys.push(k); n++; };
    const ref = (k) => { if (k !== undefined && k !== null) keys.push(k); };
    // a stroke, [layer, id] (a card's layer its key after '@')
    const stroke = (e) => {
        if (!Array.isArray(e)) { bad = true; return; }
        ref(String(e[0] ?? '').startsWith('@') ? String(e[0]).slice(1) : e[0]);
        name(e[1]);
    };
    // what a string or a new one's ends name: cards and pins
    const ends = (l) => {
        if (!l || typeof l !== 'object') return;
        for (const f of ['a', 'b', 'aPin', 'bPin']) ref(l[f]);
        for (const j of Array.isArray(l.joints) ? l.joints : []) ref(j?.pin);
    };
    const patch = (p) => {
        if (p === undefined || p === null) return;
        if (typeof p !== 'object') { bad = true; return; }
        for (const [k, sp] of Object.entries(p.scraps ?? {})) { name(k); ids(sp?.marks).forEach(name); }
        ids(p.newScraps).forEach(name);
        for (const [k, pin] of Object.entries(p.pins ?? {})) { name(k); ref(pin?.on); }
        ids(p.bits).forEach(name);
        for (const [k, l] of [...Object.entries(p.links ?? {}), ...Object.entries(p.newLinks ?? {})]) { name(k); ends(l); }
        if (p.link !== undefined && p.link !== null) {
            if (!Array.isArray(p.link)) bad = true;
            else { name(p.link[0]); ends(p.link[1]); }
        }
        for (const [layer, strokes] of Object.entries(p.marks ?? {})) { ref(layer); ids(strokes).forEach(name); }
        ids(p.bin).forEach(name);
    };
    ref(req.mark?.on);
    ref(req.doodle?.a?.on);
    patch(req.remark);
    list(req.unmark).forEach(stroke);
    list(req.cut?.strokes).forEach(stroke);
    ref(req.absorb?.writing);
    ref(req.absorb?.note);
    list(req.ownCards).forEach(name);
    patch(req.ownPatch);
    for (const act of [req.ownString?.act, req.addString?.act]) { ends(act); patch(act?.prep); }
    ref(req.ownLabel?.id);
    for (const k of ['links', 'pins']) list(req.ownRemove?.[k]).forEach(name);
    for (const k of ['scraps', 'links', 'pins', 'bits']) list(req.share?.[k]).forEach(name);
    list(req.share?.strokes).forEach(stroke);
    patch(req.own);
    patch(req.patch);
    ref(req.label?.id);
    ref(req.addPin?.on);
    ref(req.removeScrap);
    ref(req.removeLink);
    for (const k of ['scraps', 'pins', 'links']) list(req.remove?.[k]).forEach(name);
    return { keys, n, bad };
}
function requestOk(req) {
    if (!req || typeof req !== 'object') return false;
    const { keys, n, bad } = requestNames(req);
    return !bad && n <= REQUEST_MAX && keys.every(safeKey);
}

// A pin moved, made, or taken out, as a locked card allows (Luke,
// 2026-10-25): a pin in a locked card moves on it, never off it, and none is
// put into one; taking a string off takes its pins
function pinKept(board, id, p) {
    if (p === null) return true;
    const frozen = (key) => Boolean(key && board.scraps?.[key]?.locked);
    const had = board.pins?.[id];
    const on = p && typeof p === 'object' && 'on' in p ? p.on : had?.on ?? null;
    if (frozen(had?.on) && on !== had.on) return false;
    return !(frozen(on) && on !== had?.on);
}

// The fields a player's or an owner's edit may set on the board's pins and
// strings, each value checked (Luke, 2026-10-25, the health audit: a pin's
// maker, a string's kind or whether it is shown were taken as sent). `L`: the
// board's sheet.
const PIN_FIELDS = new Set(['tex', 's', 'r', 'on', 'at', 'x', 'y', 'c']);
const LINK_FIELDS = new Set(['a', 'b', 'aPt', 'bPt', 'aPin', 'bPin', 'aAt', 'bAt', 'joints', 'pulls', 'color', 'plainPins', 'slack', 'bend', 'tagAt', 'tagDx', 'tagDy', 'tagR', 'via', 'tagPinAt']);
function pinFieldsOk(board, p, L, look) {
    return Object.entries(p).every(([f, v]) => {
        if (!PIN_FIELDS.has(f)) return false;
        if (f === 'c') return paintOrNone(v, look);
        if (v === null) return f !== 'tex';
        if (f === 'tex') return typeof v === 'string' && v.length <= 200;
        if (f === 's') return finite(v) && v > 0 && v <= MAX_SIZE;
        if (f === 'on') return Boolean(board.scraps?.[v]);
        if (f === 'at') return uvOk(v);
        if (f === 'r') return finite(v);
        return axisOk(L, f === 'x' ? 'w' : 'h', v);
    });
}
function linkFieldsOk(board, l, L, look) {
    return Object.entries(l).every(([f, v]) => {
        if (!LINK_FIELDS.has(f)) return false;
        if (f === 'color') return paintOrNone(v, look);
        if (v === null) return true;
        if (f === 'a' || f === 'b') return Boolean(board.scraps?.[v]);
        if (f === 'aPin' || f === 'bPin') return typeof v === 'string';
        if (f === 'aPt' || f === 'bPt') return pointOk(L, v);
        if (f === 'aAt' || f === 'bAt' || f === 'tagPinAt') return uvOk(v);
        if (f === 'joints') return Array.isArray(v) && v.length <= REQUEST_MAX && v.every((j) => (j?.pin ? typeof j.pin === 'string' : pointOk(L, j)));
        if (f === 'pulls') return Array.isArray(v) && v.length <= REQUEST_MAX;
        if (f === 'plainPins') return typeof v === 'boolean';
        if (f === 'via') return typeof v === 'object' && finite(v.t) && finite(v.off);
        return finite(v);
    });
}

// A player's or a players' board owner's strings and the board's pins
// (Luke, 2026-10-03), checked: theirs or public (an owner's any), the fields
// above only, never a pin into or out of a locked card. The one check of the
// ownPatch, ownString, and own routes, and an owner's patch. Returns the
// patch the GM's client writes, or null to refuse the lot.
function ownPatchOf(board, patch, who, look, textures = {}) {
    const out = { pins: {}, links: {}, newLinks: {} };
    if (Object.keys(patch?.scraps ?? {}).length || Object.keys(patch?.newScraps ?? {}).length || Object.keys(patch?.marks ?? {}).length) return null;
    const L = sheetLook(look, board);
    const fields = (p) => p === null || (typeof p === 'object' && !Array.isArray(p));
    if (![...Object.values(patch?.pins ?? {}), ...Object.values(patch?.links ?? {}), ...(patch?.link ? [patch.link[1]] : [])].every(fields)) return null;
    for (const [id, p] of Object.entries(patch?.pins ?? {})) {
        if (!pinKept(board, id, p)) return null;
        // (never made public or anyone's by the asker: Luke, 2026-10-24;
        // a public pin with no maker stays the GM's)
        const { author, open, ...rest } = p ?? {};
        void author; void open;
        if (board.pins?.[id]) {
            if (!ownedPin(board, id, who)) return null;
            if (p === null) { out.pins[id] = null; continue; }
            const had = board.pins[id];
            if (!pinFieldsOk(board, rest, L, look)) return null;
            // (a string's pins given another picture: one the String window
            // offers, model.js pinChoices; Luke 2026-10-25, its extra pins
            // were refused)
            if ('tex' in rest && rest.tex !== had.tex && !pinChoices(look, Object.keys(textures ?? {})).includes(rest.tex)) return null;
            out.pins[id] = { ...rest, author: had.author ?? (had.open ? null : who.id) };
        } else {
            // (a pin made for a moment and let go: nothing)
            if (p === null) continue;
            if (!rest.tex || !pinFieldsOk(board, rest, L, look)) return null;
            out.pins[id] = { ...rest, author: who.id };
        }
    }
    const pinsOf = (l) => [l.aPin, l.bPin, ...(l.joints ?? []).map((j) => j?.pin)].filter(Boolean);
    // (a string's kind an owner's to change, as their String window offers;
    // never whether it is shown, nor its maker)
    const kindOf = (kind) => (who.owner && LINK_KINDS.includes(kind) ? { kind } : {});
    const edits = { ...(patch?.links ?? {}) };
    if (patch?.link) edits[patch.link[0]] = patch.link[1];
    for (const [id, p] of Object.entries(edits)) {
        const l = board.links?.[id];
        if (!l || !ownedLink(l, who)) return null;
        if (p === null) { out.links[id] = null; continue; }
        const { kind, state, author, open, ...rest } = p ?? {};
        void state; void author; void open;
        if (!linkFieldsOk(board, rest, L, look)) return null;
        if (pinsOf(rest).some((pid) => !ownedPin(board, pid, who, out.pins))) return null;
        out.links[id] = { ...rest, ...('color' in rest ? { color: rest.color === null || rest.color === undefined ? null : Number(rest.color) } : {}), ...kindOf(kind) };
    }
    for (const [id, p] of Object.entries(patch?.newLinks ?? {})) {
        if (board.links?.[id] || !p || typeof p !== 'object') return null;
        const { kind, state, author, open, color: c0, ...rest } = p;
        void state; void author; void open;
        if (!paintOrNone(c0, look) || !linkFieldsOk(board, rest, L, look)) return null;
        if (pinsOf(rest).some((pid) => !ownedPin(board, pid, who, out.pins))) return null;
        // (a player's string: no kind, white unless painted; Luke 2026-10-25;
        // an owner's string broken in two keeps its kind)
        out.newLinks[id] = { ...rest, kind: 'plain', ...kindOf(kind), state: 'known', author: who.id, ...(c0 === null || c0 === undefined ? {} : { color: Number(c0) }) };
    }
    return out;
}
// a pin a new string's ends may be (the String window's pick: Luke
// 2026-10-25), or null for the kind's own (`tools`: the board's look and
// textures, layoutTools)
function pinPick(id, tools) {
    if (!id) return null;
    return pinChoices(tools.look, Object.keys(tools.textures ?? {})).includes(String(id)) ? String(id) : null;
}

async function ownStrings(scene, board, req, who, sink, tools) {
    if (req.ownPatch) {
        const patch = ownPatchOf(board, req.ownPatch, who, tools.look, tools.textures);
        if (!patch) return { status: 'not-allowed' };
        await applyBoardPatch(scene, patch, { sink });
        return { status: 'done' };
    }
    if (req.ownString) return ownString(scene, board, req.ownString, who, sink, tools);
    if (req.ownLabel) {
        const l = board.links?.[req.ownLabel.id];
        const text = String(req.ownLabel.text ?? '').slice(0, MAX_TEXT).trim();
        // (a name of nothing is no name: Luke 2026-10-25)
        if (!l || !ownedLink(l, who) || !text) return { status: 'not-allowed' };
        // (the name tag, its thread, and their pins theirs: Luke, 2026-10-21,
        // else their undo of the name was refused and the tag not theirs to edit)
        // (a public string's name the string's maker's, and public: Luke 2026-10-24)
        await labelString(scene, req.ownLabel.id, text, { sink, author: l.open ? l.author ?? null : who.id, open: Boolean(l.open) });
        return { status: 'done' };
    }
    if (req.ownRemove) {
        const links = [].concat(req.ownRemove.links ?? []);
        const pins = [].concat(req.ownRemove.pins ?? []);
        if (!links.every((id) => ownedLink(board.links?.[id], who)) || !pins.every((id) => ownedPin(board, id, who))) return { status: 'not-allowed' };
        await removeMany(scene, { scraps: [], pins, links }, { sink });
        return { status: 'done' };
    }
    return { status: 'not-allowed' };
}

// A player's own new string, its ends on pins of theirs (any shared pin made
// first theirs too), and its name
async function ownString(scene, board, ask, who, sink, tools) {
    const { look } = tools;
    const { act = {}, color = null, pin = null, plainPins = false } = ask;
    if (!paintOrNone(color, look)) return { status: 'not-allowed' };
    for (const pid of [act.aPin, act.bPin].filter(Boolean)) if (!ownedPin(board, pid, who, act.prep?.pins ?? {})) return { status: 'not-allowed' };
    if (act.prep && !ownPatchOf(board, act.prep, who, look, tools.textures)) return { status: 'not-allowed' };
    // (the pins it makes at its ends checked as theirs: on or near the sheet,
    // never in a locked card)
    const { id, patch } = newStringPatch(board, { ...act }, 'plain', look, { color: color === null || color === undefined ? null : Number(color), author: who.id, pin: pinPick(pin, tools), plainPins: Boolean(plainPins) });
    const clean = ownPatchOf(board, patch, who, look, tools.textures);
    if (!clean) return { status: 'not-allowed' };
    await applyBoardPatch(scene, clean, { sink });
    if (ask.label) await labelString(scene, id, String(ask.label).slice(0, MAX_TEXT), { sink, author: who.id });
    return { status: 'done', id };
}

// The cards a player may take off (Luke, 2026-10-21: their own notes and
// writing, into the bin like the GM's): each one theirs to move (mayMove),
// and nothing that would go with it anyone else's (a string tied to it, a pin
// in it, a joint it holds). Null refuses the lot; an owner of a players'
// board, or the GM, may take any note or writing.
export function ownCardsOf(board, keys, who) {
    const list = [...new Set([].concat(keys ?? []).map(String))];
    if (!list.length || !who || list.some((k) => !mayMove(board?.scraps?.[k], who) || board.scraps[k].locked)) return null;
    if (who.isGM || who.owner) return list;
    const r = removalOf(board, { scraps: list });
    const theirs = (id) => ownedLink(board.links?.[id], who);
    if (![...r.links, ...Object.keys(r.edits ?? {})].every(theirs)) return null;
    if (!r.pins.every((id) => ownedPin(board, id, who))) return null;
    return list;
}

// A player's edit from the shared controls (Luke, 2026-10-24: their own
// notes and writing and public ones moved, sized, and turned, and the pieces
// on them: the writing, a web, the note's own pins, each moved on it or off
// it; their own strings and pins, and public ones), checked field by field.
// A players' board's owner's edit too (Luke, 2026-10-25, the health audit),
// any note and string theirs, and a note's writing theirs to change.
// Points from the asker lie on the sheet or near it.
// Returns the patch the GM's client writes, or null to refuse the lot.
//   board   the board's JSON
//   who     { id, isGM, owner }
//   look    the board's look
//   layoutOf(key)  a card's layout as the board lays it out (a note's
//          writing taken off it is made again from the note, never taken
//          as sent)
const PART_ID = /^(text|x\d+)$/;
const finite = (v) => Number.isFinite(Number(v));
const uvOk = (p) => p && finite(p.u) && finite(p.v) && Math.abs(p.u) <= 2 && Math.abs(p.v) <= 2;
export function playerPatchOf(board, patch, who, look, { layoutOf = null, textures = {} } = {}) {
    if (!patch || !who) return null;
    const allowed = new Set(['scraps', 'newScraps', 'pins', 'bits', 'link', 'links', 'newLinks']);
    if (Object.keys(patch).some((k) => !allowed.has(k) && patch[k] !== undefined && patch[k] !== null)) return null;
    const out = { scraps: {}, newScraps: {}, pins: {}, bits: {} };
    // (the board's sheet: a point from the asker on it or near it, Luke
    // 2026-10-25, the health audit)
    const L = sheetLook(look, board);
    // (what pieces came off which card in this edit: a new pin, a loose piece,
    // or writing each needs one)
    const pinsFreed = [];
    const websOff = [];
    let textOff = null;
    for (const [key, p] of Object.entries(patch.scraps ?? {})) {
        const s = board.scraps?.[key];
        // (and never an edit of nothing)
        if (!s || !p || typeof p !== 'object' || !Object.keys(p).length || !mayMove(s, who)) return null;
        // (locked: frozen, only let go; Luke 2026-10-25)
        if (s.locked && Object.keys(p).some((f) => f !== 'locked')) return null;
        const clean = {};
        for (const [f, v] of Object.entries(p)) {
            if (f === 'x' || f === 'y') {
                if (!inReach(L, p.x, p.y)) return null;
                clean[f] = Math.round(Number(v));
            } else if (f === 's') {
                if (!(finite(v) && v > 0 && v <= MAX_SIZE)) return null;
                clean.s = Number(Number(v).toPrecision(4));
            } else if (f === 'r') {
                if (!finite(v)) return null;
                clean.r = Math.round(Number(v));
            } else if (f === 'parts') {
                if (!v || typeof v !== 'object') return null;
                const parts = {};
                for (const [id, q] of Object.entries(v)) {
                    // (the pieces a note has: its writing, a web; a place's are the GM's)
                    // (each no larger than a card may be)
                    if (!PART_ID.test(id) || !uvOk(q) || ('s' in q && !(finite(q.s) && q.s > 0 && q.s <= MAX_SIZE))) return null;
                    parts[id] = Object.fromEntries(['u', 'v', 's', 'r', 'w', 'h', 'fs'].filter((k) => finite(q[k])).map((k) => [k, Number(q[k])]));
                }
                clean.parts = parts;
            } else if (f === 'drop') {
                if (!Array.isArray(v)) return null;
                const had = new Set(s.drop ?? []);
                for (const id of v) if (!had.has(id) && !PART_ID.test(String(id))) return null;
                clean.drop = [...new Set(v.map(String))];
                for (const id of clean.drop) {
                    if (had.has(id)) continue;
                    if (id === 'text') textOff = key;
                    else websOff.push(key);
                }
            } else if (f === 'pinAt') {
                if (v !== null && !uvOk(v)) return null;
                clean.pinAt = v === null ? null : { u: Number(v.u), v: Number(v.v) };
            } else if (f === 'locked') {
                // (right-click: locked to the sheet, or let go; owners too,
                // Luke 2026-10-24)
                clean.locked = Boolean(v);
            } else if (f === 'pinOff') {
                clean.pinOff = Boolean(v);
                if (v && !s.pinOff) pinsFreed.push(key);
            } else if (f === 'pins') {
                const was = s.pins ?? [];
                if (!Array.isArray(v) || v.length > was.length || !v.every(uvOk)) return null;
                clean.pins = v.map((q) => ({ u: Number(q.u), v: Number(q.v) }));
                for (let i = v.length; i < was.length; i++) pinsFreed.push(key);
            } else if (f === 'text') {
                // (only a note's writing taken off it, the note left blank;
                // a players' board's owner writes on any, as a string's name
                // tag renamed: Luke 2026-10-25)
                if (v !== '' && !who.owner) return null;
                if (v !== '') {
                    clean.text = String(v).slice(0, MAX_TEXT).trim();
                    if (!clean.text) return null;
                }
            } else if (f === 'fmt') {
                // (its setting, taken off with it, or an owner's set anew)
                if (!Array.isArray(v) || (v.length && !who.owner)) return null;
                clean.fmt = v.length ? fmtOf(v, String(p.text ?? s.text ?? '').length) : [];
            } else if (f === 'ar') {
                // (a note's shape, stretched by its corner: Luke 2026-10-24)
                if (s.type !== 'note' || (v !== null && !(finite(v) && v >= NOTE_AR_MIN && v <= 1 / NOTE_AR_MIN))) return null;
                clean.ar = v === null ? null : Number(v);
            } else if (f === 'textSize') {
                if (v !== null && !(finite(v) && v >= TEXT_SIZE_MIN && v <= 1)) return null;
                clean.textSize = v === null ? null : Number(v);
            } else return null;
        }
        out.scraps[key] = clean;
    }
    // a note's writing off it: made again from the note, where it was let go
    const asked = Object.entries(patch.newScraps ?? {});
    // (a note's writing deleted alone, the note left blank: Luke 2026-10-25)
    if (textOff && !asked.length) {
        if (board.scraps[textOff].type !== 'note') return null;
        out.scraps[textOff].text = '';
    } else if (textOff) {
        const s = board.scraps[textOff];
        const vs = layoutOf?.(textOff);
        const [k, w] = asked[0] ?? [];
        if (asked.length !== 1 || !vs || !w || !finite(w.x) || !finite(w.y) || keysTaken(board)[k] || !/^[a-z]+\d+$/.test(k)) return null;
        const made = breakAwayPatch(board, { ...vs, key: textOff, type: s.type, tag: s.tag, typed: s.typed, state: s.state }, { x: Number(w.x), y: Number(w.y) }, look, k);
        if (!made) return null;
        Object.assign(out.scraps[textOff], made.scraps[textOff]);
        out.newScraps = made.newScraps;
    } else if (asked.length) return null;
    if (!who.owner && 'text' in Object.assign({}, ...Object.values(patch.scraps ?? {})) && !textOff) return null;
    // the board's pins: one made from a card's own pin let off it (the card's
    // maker's, public as it was), or a string's (ownPatchOf)
    const strings = { link: patch.link, links: patch.links ?? {}, newLinks: patch.newLinks ?? {}, pins: {} };
    const pins = (look.pools?.pins ?? []).concat(Object.values(look.pools?.ends ?? {}).flat());
    for (const [id, p] of Object.entries(patch.pins ?? {})) {
        if (board.pins?.[id] || p === null || !p?.tex || !pinsFreed.length || (p.on && !p.at) || p.joints) {
            strings.pins[id] = p;
            continue;
        }
        // (never into a locked card: pinKept)
        if (!pinKept(board, id, p)) return null;
        const from = board.scraps[pinsFreed.shift()];
        if (!pins.includes(p.tex)) return null;
        const at = p.on ? (board.scraps?.[p.on] && uvOk(p.at) ? { on: String(p.on), at: { u: Number(p.at.u), v: Number(p.at.v) } } : null) : inReach(L, p.x, p.y) ? { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) } : null;
        if (!at || (finite(p.s) && !(p.s > 0 && p.s <= MAX_SIZE))) return null;
        out.pins[id] = { tex: p.tex, ...(finite(p.s) ? { s: Number(p.s) } : {}), ...(finite(p.r) ? { r: Number(p.r) } : {}), ...at, ...(from.author ? { author: from.author } : {}), ...(from.open ? { open: true } : {}) };
    }
    // loose pieces: a web off a note (the note's maker's, public as it was),
    // or one this user may move, moved, sized, turned, or taken off
    for (const [id, b] of Object.entries(patch.bits ?? {})) {
        const had = board.bits?.[id];
        if (had) {
            if (!mayBit(had, who)) return null;
            if (b === null) { out.bits[id] = null; continue; }
            const c = {};
            for (const f of ['x', 'y', 'w', 'r']) if (f in (b ?? {})) { if (!finite(b[f])) return null; c[f] = Math.round(Number(b[f])); }
            // (on or near the sheet; its width the model's own bounds)
            if (('x' in c || 'y' in c) && !inReach(L, c.x ?? had.x, c.y ?? had.y)) return null;
            if ('w' in c) c.w = Math.max(4, Math.min(3000, c.w));
            out.bits[id] = c;
            continue;
        }
        if (!b || b.tex !== WEB_TEX || !websOff.length || !inReach(L, b.x, b.y)) return null;
        const from = board.scraps[websOff.shift()];
        out.bits[id] = { tex: WEB_TEX, x: Math.round(Number(b.x)), y: Math.round(Number(b.y)), w: Math.max(4, Math.min(3000, Math.round(Number(b.w) || 40))), r: Math.round(Number(b.r) || 0), flip: Boolean(b.flip), alpha: Math.max(0.05, Math.min(1, Number(b.alpha) || 1)), ...(from.author ? { author: from.author } : {}), ...(from.open ? { open: true } : {}) };
    }
    const anyString = strings.link || Object.keys(strings.links).length || Object.keys(strings.newLinks).length || Object.keys(strings.pins).length;
    if (anyString) {
        const own = ownPatchOf(board, strings, who, look, textures);
        if (!own) return null;
        Object.assign(out.pins, own.pins);
        out.links = own.links;
        out.newLinks = own.newLinks;
    }
    for (const k of Object.keys(out)) if (!Object.keys(out[k]).length) delete out[k];
    return out;
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
    // (theirs, or public: Luke 2026-10-24)
    const mine = (v) => mineOrOpen(v, who);
    for (const op of rec?.ops ?? []) {
        const [coll, id, field, sub] = op.path;
        const versions = (b) => [board, target].map((x) => (b(x)));
        if (coll === 'marks') {
            // (their own layer's, or a public stroke in another's: Luke 2026-10-25)
            if (!(who.owner || id === who.id || versions((x) => x?.marks?.[id]?.[field]).every((st) => !st || st.open))) return false;
        } else if (coll === 'scraps' && field === 'marks') {
            // (one stroke, or a card's strokes whole: its first stroke made
            // the record name them all, Luke 2026-10-21, so a player's undo
            // of their first stroke on a place was refused)
            const strokes = (x) => (sub ? [x?.scraps?.[id]?.marks?.[sub]] : Object.values(x?.scraps?.[id]?.marks ?? {}));
            // (or any on a card of theirs, or a public one: Luke 2026-10-24)
            if (!versions(strokes).flat().every((st) => !st || who.owner || st.by === who.id || st.open || mayMove(board.scraps?.[id], who))) return false;
        } else if (coll === 'bits') {
            // (the board's loose pieces: a players' board's owners move them;
            // a player one of theirs or a public one, Luke 2026-10-24)
            if (!versions((x) => x?.bits?.[id]).every((b) => !b || mayBit(b, who))) return false;
        } else if (coll === 'scraps') {
            if (!versions((x) => x?.scraps?.[id]).every((sc) => !sc || ((sc.type === 'note' || sc.type === 'scrawl') && (who.owner || mine(sc))))) return false;
        } else if (coll === 'links') {
            if (!versions((x) => x?.links?.[id]).every((l) => !l || who.owner || mine(l))) return false;
        } else if (coll === 'pins') {
            // (theirs, or held only by their strings, as it is now)
            if (!versions((x) => x?.pins?.[id]).every((p) => !p || who.owner || mine(p) || ownedPin(board, id, who))) return false;
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

// Whether a user may see a scene, and so touch its board (Luke, 2026-10-21):
// one they can see, the active scene or one they have at least Limited on, or
// the one they are on (a GM's pull), never any board scene by its id (every
// board handler: Luke 2026-10-25, the health audit)
function maySeeScene(scene, user) {
    if (!scene || !user) return false;
    if (user.isGM || scene.active || user.viewedScene === scene.id) return true;
    return Boolean(scene.testUserPermission(user, 'LIMITED'));
}
// A point on the board (board px within the look's sheet, never past it)
const onBoard = (look, x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= look.w && y <= look.h;
// who asked, as the board's rules take it: { id, isGM, owner }
const whoOf = (scene, userId, user) => ({ id: userId, isGM: user.isGM, owner: ownsBoard(scene, userId) });
// a card's layout as the board lays it out (playerPatchOf's layoutOf)
const layoutsOf = (board, { look, size, measure }) => (key) => {
    const s = normalizeBoard({ scraps: { [key]: board.scraps?.[key] } }).scraps[key];
    return s ? { ...s, layout: scrapLayout(s, look, size, measure, s.lib ? look.library[s.lib] : null) } : null;
};

// The relay's handlers (run on the GM's client, inside its queue)
export function registerBoardRelay() {
    registerRelayHandler('board.claimHand', async ({ face }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        if (!HANDS.includes(face)) return { status: 'not-allowed' };
        // (never a GM's: Luke 2026-10-25)
        if (game.users.get(userId)?.isGM) return { status: 'not-allowed' };
        const all = { ...hands() };
        if (all[userId]) return { status: 'already' };
        if (Object.values(all).includes(face)) return { status: 'already' };
        all[userId] = face;
        await game.settings.set('heart', 'boardHands', all);
        return { status: 'done', face };
    });
    registerRelayHandler('board.addNote', async ({ sceneId, key: hint = null, type = 'note', x, y, text, fmt = [], paper = null, ink = null, style = {}, typed = false, look: noteLook = null, open = false, textSize = null }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        const hand = hands()[userId];
        if (!isBoardScene(scene) || !hand || !['note', 'scrawl'].includes(type)) return { status: 'not-allowed' };
        // (a board the player can see, never another by its id; Luke, 2026-10-21)
        if (!maySeeScene(scene, game.users.get(userId))) return { status: 'not-allowed' };
        const clean = String(text ?? '').slice(0, MAX_TEXT).trim();
        if ((!clean && type !== 'note') || !Number.isFinite(x) || !Number.isFinite(y)) return { status: 'not-allowed' };
        const { look } = await loadBoardLook(scene);
        // (on the sheet: the player's own client keeps a click there, so a
        // point past it is refused)
        if (!onBoard(sheetLook(look, boardOf(scene)), x, y)) return { status: 'not-allowed' };
        // (NOTES_MAX of a player's on one board at most: Luke 2026-10-25)
        if (Object.values(boardOf(scene).scraps ?? {}).filter((s) => s?.author === userId).length >= NOTES_MAX) return { status: 'not-allowed' };
        // (never a key a card in the bin holds: model.js keysTaken)
        const taken = keysTaken(boardOf(scene));
        // (the key its window previewed it under, when it is still free: Luke
        // 2026-10-24, the preview is the note)
        let i = /^p\d+$/.test(String(hint ?? '')) && !taken[hint] ? Number(String(hint).slice(1)) : 1;
        while (taken[`p${i}`]) i++;
        const data = { type, text: clean, x, y, hand, author: userId, state: 'known', ...textStyleOf(style), ...(typed && mayType(userId) ? { typed: true } : {}) };
        // (its writing set a stretch at a time: Luke 2026-10-25)
        const set = fmtOf(fmt, clean.length);
        if (set.length) data.fmt = set;
        if (type === 'note' && paper && look.pools.notes.includes(paper)) data.paper = paper;
        if (cleanInk(ink) !== null) data.ink = cleanInk(ink);
        // (public from the start, and its writing's size: Luke 2026-10-24)
        if (open) data.open = true;
        if (type === 'note' && cleanSize(textSize) !== null) data.textSize = cleanSize(textSize);
        // (its paint, its paper's turn, its own turn, its writing's place)
        for (const [k, v] of Object.entries(noteFields(noteLook ?? {}, look))) if (v !== null && (type === 'note' || k === 'paint' || k === 'bright' || k === 'r')) data[k] = v;
        // (no doodle: a note never comes with one, Luke 2026-10-24)
        const sink = [];
        await writeBoard(scene, { [`flags.heart.board.scraps.p${i}`]: data }, { sink });
        return { status: 'done', key: `p${i}`, undo: handOut(userId, scene.id, mergeRecords(sink)) };
    });
    registerRelayHandler('board.editNote', async ({ sceneId, key, text, fmt = [], paper, ink, style = {}, typed = false, look: noteLook = null, open, textSize, ar }, userId) => {
        if (!game.user.isGM) return { status: 'needs-gm' };
        const scene = game.scenes.get(sceneId);
        if (!isBoardScene(scene)) return { status: 'missing' };
        const user = game.users.get(userId);
        if (!user || !maySeeScene(scene, user) || !safeKey(key)) return { status: 'not-allowed' };
        // (the look loaded first and the note read after it: a lock made
        // meanwhile is seen; Luke 2026-10-25)
        const { look } = await loadBoardLook(scene);
        const s = boardOf(scene).scraps?.[key];
        if (!s) return { status: 'missing' };
        // (theirs, or public: Luke 2026-10-24)
        const who = whoOf(scene, userId, user);
        if (!mayMove(s, who) || s.locked) return { status: 'not-allowed' };
        const clean = String(text ?? '').slice(0, MAX_TEXT).trim();
        // (a note may be left blank: Luke 2026-10-25)
        if (!clean && s.type !== 'note') return { status: 'not-allowed' };
        const data = { [`flags.heart.board.scraps.${key}.text`]: clean, [`flags.heart.board.scraps.${key}.fmt`]: fmtOf(fmt, clean.length), [`flags.heart.board.scraps.${key}.ink`]: cleanInk(ink) };
        for (const [k, v] of Object.entries(textStyleOf(style))) data[`flags.heart.board.scraps.${key}.${k}`] = v;
        // (typed only by those who may type)
        data[`flags.heart.board.scraps.${key}.typed`] = Boolean(typed) && mayType(userId);
        if (paper === null || look.pools.notes.includes(paper)) data[`flags.heart.board.scraps.${key}.paper`] = paper ?? null;
        // (public or theirs again: its maker's call, or the GM's; its writing's
        // size; a blank note written on again: Luke 2026-10-24)
        if (open !== undefined && mayShare(s, who)) data[`flags.heart.board.scraps.${key}.open`] = Boolean(open);
        if (textSize !== undefined && s.type === 'note') data[`flags.heart.board.scraps.${key}.textSize`] = cleanSize(textSize);
        // (its paper's own shape again: the window only ever clears it)
        if (ar === null && s.type === 'note') data[`flags.heart.board.scraps.${key}.ar`] = null;
        if (clean && (s.drop ?? []).includes('text')) data[`flags.heart.board.scraps.${key}.drop`] = s.drop.filter((id) => id !== 'text');
        for (const [k, v] of Object.entries(noteFields(noteLook ?? {}, look, s))) if (s.type === 'note' || k === 'paint' || k === 'bright' || k === 'ink' || k === 'r') data[`flags.heart.board.scraps.${key}.${k}`] = v;
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
        if (!user || !maySeeScene(scene, user)) return { status: 'not-allowed' };
        // (only a record this client handed them, unchanged: else made up, or
        // from before a reload; Luke, 2026-10-21)
        if (!user.isGM && !wasHanded(userId, scene.id, record)) return { status: 'forgotten' };
        const who = whoOf(scene, userId, user);
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
        const scene = game.scenes.get(req?.sceneId);
        if (!isBoardScene(scene)) return { status: 'missing' };
        const user = game.users.get(userId);
        // (a board they can see, every key it names safe, and not too many
        // things at once: Luke 2026-10-25, the health audit)
        if (!user || !maySeeScene(scene, user) || !requestOk(req)) return { status: 'not-allowed' };
        // (the look, its pictures, and the hands loaded first, and the board
        // read after them, so a lock made while they load is seen)
        const tools = await layoutTools(scene);
        // (what it changes, handed back: the asker's own edit to undo, even
        // when it failed part way)
        const sink = [];
        let res;
        try {
            res = await boardEditFor(scene, boardOf(scene), req, whoOf(scene, userId, user), sink, tools);
        } catch (err) {
            if (!sink.length) throw err;
            console.error('heart | board.edit failed part way', err);
            res = { status: 'failed' };
        }
        const undo = mergeRecords(sink);
        return res?.status === 'done' || undo.ops.length ? { ...res, undo: handOut(userId, scene.id, undo) } : res;
    });
}

// A pin a players' board's owner puts in (the Pin tool): one of the pins on
// offer, in a card that takes it (never a locked one) or loose on or near the
// sheet, the Pin tool's fields only. Null refuses it.
function addPinOf(board, p, tools) {
    if (!p || typeof p !== 'object' || !pinPick(p.tex, tools)) return null;
    if (!pinFieldsOk(board, p, sheetLook(tools.look, board), tools.look) || !pinKept(board, null, p)) return null;
    return (p.on ? uvOk(p.at) : finite(p.x) && finite(p.y)) ? p : null;
}

async function boardEditFor(scene, board, req, who, sink, tools) {
    const userId = who.id;
    const { look, size, measure } = tools;
    // (the board's sheet: a stroke's points on it or near it, Luke 2026-10-25)
    const L = sheetLook(look, board);
    // a stroke on a card (Luke, 2026-10-03): the card's, in its own frame,
    // its author the one who drew it
    if (req.mark?.on) {
        const s = board.scraps?.[req.mark.on];
        const st = cleanStroke({ ...req.mark, by: userId }, { card: true });
        // (never on a locked card: Luke 2026-10-25; near it, and not past
        // CARD_MARKS_MAX on it)
        if (!s || !st || s.locked || !ptsOk(L, st.pts, true) || Object.keys(s.marks ?? {}).length >= CARD_MARKS_MAX) return { status: 'not-allowed' };
        // (as wide as its own nib allows: a wash's far wider; Luke 2026-10-25)
        st.w = Math.min(st.w, markMax(look, st.n));
        // (its id picked when the write's turn comes)
        await applyBoardPatch(scene, (b) => freshStrokeIds(b, { scraps: { [req.mark.on]: { marks: { new: st } } } }), { sink });
        return { status: 'done' };
    }
    // a doodle laid (Luke, 2026-10-25): what was laid and the brush; its
    // strokes and their ids worked out here (model.js doodlePatch), never
    // taken from the asker, whose board may be behind (a second doodle laid
    // before the first came back took the first's ids and overwrote it). On
    // the sheet in their layer, or on a card that takes it
    if (req.doodle) {
        const a = req.doodle.a ?? {};
        const b = req.doodle.brush ?? {};
        const saved = isSavedKind(a.kind) ? cleanSavedDoodle(a.saved) : null;
        const card = a.on ? board.scraps?.[a.on] : null;
        if (!(DOODLE_KINDS.includes(a.kind) || saved) || !pointOk(L, a.at) || (a.on && (!card || card.locked || (card.state === 'hidden' && !who.isGM)))) return { status: 'not-allowed' };
        const brush = {
            size: Math.max(DOODLE_MIN, Math.min(DOODLE_MAX, Number(b.size) || DOODLE_MIN)),
            c: cleanInk(b.c) ?? 0,
            w: Math.max(1, Math.min(markMax(look), Number(b.w) || 8)),
            b: Math.max(0, Math.min(2, Math.round(Number(b.b ?? 1)) || 0)),
            o: Math.max(0.05, Math.min(1, Number(b.o) || 0.85)),
        };
        const at = { x: Number(a.at.x), y: Number(a.at.y) };
        // (the board laid out only for a card's frame)
        const view = card ? boardView(look, normalizeBoard(board), 'gm', size, measure) : null;
        const patch = doodlePatch(board, view, { kind: a.kind, seed: String(a.seed ?? '').slice(0, 120) || `${a.kind}:${Date.now()}`, at, on: card ? a.on : null, rot: finite(a.rot) ? Number(a.rot) : 0, flip: Boolean(a.flip), saved }, brush, look, userId);
        // (each as wide as its nib allows, as a move is; no more than its
        // card or their layer holds)
        const strokes = (card ? patch.scraps?.[a.on]?.marks : patch.marks?.[userId]) ?? {};
        for (const st of Object.values(strokes)) st.w = Math.min(st.w, markMax(look, st.n));
        const made = Object.keys(strokes).length;
        const had = Object.keys((card ? card.marks : board.marks?.[userId]) ?? {}).length;
        if (!made || had + made > (card ? CARD_MARKS_MAX : LAYER_MAX)) return { status: 'not-allowed' };
        await applyBoardPatch(scene, (b) => freshStrokeIds(b, patch), { sink });
        return { status: 'done' };
    }
    // strokes moved, sized, or turned (with Move): each the
    // asker's to move (an owner or the GM, any), a new one theirs
    if (req.remark) {
        const marks = {};
        const scraps = {};
        // (as wide as its nib allows, or as it was: a move never widens one
        // past the cap; Luke 2026-10-25, the health audit)
        const narrow = (clean, had) => {
            if (clean) clean.w = Math.min(clean.w, Math.max(markMax(look, clean.n), had?.w ?? 0));
            return clean;
        };
        for (const [layer, strokes] of Object.entries(req.remark.marks ?? {})) {
            let count = Object.keys(board.marks?.[layer] ?? {}).length;
            for (const [id, st] of Object.entries(strokes ?? {})) {
                const had = board.marks?.[layer]?.[id];
                // (a public stroke anyone's to change; only its maker or the GM
                // switch it: Luke 2026-10-25)
                if (had ? !(mayRubOut(layer, who) || had.open) : layer !== userId && !who.isGM && !who.owner) return { status: 'not-allowed' };
                if (had && st && Boolean(st.open) !== Boolean(had.open) && !mayShareStroke(layer, had, who)) return { status: 'not-allowed' };
                // (a locked stroke never moves or goes: only its lock, paint,
                // or size changes; Luke 2026-10-24)
                if (had?.locked && (st === null || JSON.stringify(st.pts) !== JSON.stringify(had.pts))) return { status: 'not-allowed' };
                const clean = st === null ? null : cleanStroke(st);
                // (on or near the sheet; no more than LAYER_MAX on a layer)
                if (st !== null && (!clean || !ptsOk(L, clean.pts))) return { status: 'not-allowed' };
                if (!had && clean && ++count > LAYER_MAX) return { status: 'not-allowed' };
                (marks[layer] ??= {})[id] = narrow(clean, had);
            }
        }
        for (const [key, sp] of Object.entries(req.remark.scraps ?? {})) {
            if (!board.scraps?.[key] || board.scraps[key].locked || Object.keys(sp ?? {}).some((k) => k !== 'marks')) return { status: 'not-allowed' };
            let count = Object.keys(board.scraps[key].marks ?? {}).length;
            for (const [id, st] of Object.entries(sp.marks ?? {})) {
                const had = board.scraps[key].marks?.[id];
                // (any on a card of theirs, or a public one: Luke 2026-10-24)
                if (had ? !(mayStroke(had.by, board.scraps[key], who) || had.open) : (st?.by ?? userId) !== userId && !who.isGM && !who.owner) return { status: 'not-allowed' };
                if (had && st && Boolean(st.open) !== Boolean(had.open) && !mayShareStroke(`@${key}`, had, who)) return { status: 'not-allowed' };
                if (had?.locked && (st === null || JSON.stringify(st.pts) !== JSON.stringify(had.pts))) return { status: 'not-allowed' };
                const clean = st === null ? null : cleanStroke({ ...st, by: had?.by ?? st.by ?? userId }, { card: true });
                if (st !== null && (!clean || !ptsOk(L, clean.pts, true))) return { status: 'not-allowed' };
                if (!had && clean && ++count > CARD_MARKS_MAX) return { status: 'not-allowed' };
                ((scraps[key] ??= { marks: {} }).marks)[id] = narrow(clean, had);
            }
        }
        await applyBoardPatch(scene, { marks, scraps }, { sink });
        return { status: 'done' };
    }
    if (req.mark) {
        const pts = (Array.isArray(req.mark.pts) ? req.mark.pts : []).map((v) => Math.round(Number(v))).filter(Number.isFinite).slice(0, 6000);
        // (on or near the sheet, and no more than LAYER_MAX on their layer:
        // Luke 2026-10-25)
        if (pts.length < 4 || pts.length % 2 || !ptsOk(L, pts) || Object.keys(board.marks?.[userId] ?? {}).length >= LAYER_MAX) return { status: 'not-allowed' };
        const o = Number(req.mark.o);
        // (its nib kept, and a wash's fill, and as wide as that nib allows:
        // Luke 2026-10-25, a player's pen drew as the brush and their wash
        // was cut to its width)
        const nib = nibOf(req.mark.n, req.mark.fill);
        await addMark(scene, userId, { c: cleanInk(req.mark.c) ?? 0, w: Math.max(1, Math.min(markMax(look, nib.n), Number(req.mark.w) || 6)), ...(Number.isFinite(o) ? { o: Math.max(0.05, Math.min(1, o)) } : {}), ...(Number.isFinite(Number(req.mark.b)) ? { b: Math.max(0, Math.min(2, Math.round(Number(req.mark.b)))) } : {}), ...nib, pts }, { sink });
        return { status: 'done' };
    }
    // writing let go on a blank note, its writing now (Luke, 2026-10-25):
    // both theirs to change, or public; worked out here (model.js absorbPatch)
    if (req.absorb) {
        const w = String(req.absorb.writing ?? '');
        const n = String(req.absorb.note ?? '');
        const ws = board.scraps?.[w];
        const ns = board.scraps?.[n];
        if (!ws || !ns || !mayMove(ws, who) || !mayMove(ns, who)) return { status: 'not-allowed' };
        const patch = absorbPatch(board, w, n);
        if (!patch) return { status: 'not-allowed' };
        await applyBoardPatch(scene, patch, { sink });
        return { status: 'done' };
    }
    // part of strokes rubbed out (Luke, 2026-10-25): the eraser's path and
    // the strokes it touched; the cut worked out here (model.js cutPatch),
    // never taken from the asker; strokes theirs to rub out, or public; never
    // a locked one, nor on a locked card
    if (req.cut) {
        const pts = (Array.isArray(req.cut.sweep?.pts) ? req.cut.sweep.pts : []).map(Number).filter(Number.isFinite).slice(0, 4000);
        const r = Number(req.cut.sweep?.r);
        const keys = (Array.isArray(req.cut.strokes) ? req.cut.strokes : []).filter((e) => Array.isArray(e) && e.length === 2).slice(0, 300).map((e) => [String(e[0]), String(e[1])]);
        if (pts.length < 2 || pts.length % 2 || !(r > 0 && r <= 400) || !keys.length) return { status: 'not-allowed' };
        const may = (where, st, card) => (String(where).startsWith('@') ? mayStroke(st.by, card, who) : mayRubOut(where, who)) || Boolean(st.open);
        // (worked out when the write's turn comes, on the board as it is then)
        await applyBoardPatch(scene, (b) => cutPatch(b, () => boardView(look, normalizeBoard(b), 'gm', size, measure), { pts, r }, keys, look, may), { sink });
        return { status: 'done' };
    }
    if (req.unmark) {
        // (never a locked one: Luke 2026-10-24)
        const mayGo = (e) => {
            if (!String(e[0]).startsWith('@')) {
                const st = board.marks?.[e[0]]?.[e[1]];
                return Boolean(st) && (mayRubOut(e[0], who) || st.open) && !st.locked;
            }
            const card = board.scraps?.[String(e[0]).slice(1)];
            const st = card?.marks?.[e[1]];
            return Boolean(st) && !card.locked && !st.locked && (mayStroke(st.by, card, who) || st.open);
        };
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
    if (req.ownString || req.ownPatch || req.ownRemove || req.ownLabel) return ownStrings(scene, board, req, who, sink, tools);
    // things made public, or their maker's again (Luke, 2026-10-24): each
    // one its maker's call, or the GM's
    if (req.share) {
        const sel = { scraps: arr(req.share.scraps), links: arr(req.share.links), pins: arr(req.share.pins), bits: arr(req.share.bits), strokes: (Array.isArray(req.share.strokes) ? req.share.strokes : []).filter((e) => Array.isArray(e) && e.length === 2).map((e) => [String(e[0]), String(e[1])]) };
        // (a locked note stays as it is: Luke 2026-10-25)
        if (sel.scraps.some((k) => board.scraps?.[k]?.locked)) return { status: 'not-allowed' };
        const view = sel.links.length ? boardView(look, normalizeBoard(board), who.isGM ? 'gm' : 'player', size, measure) : null;
        const patch = sharePatch(board, view, sel, Boolean(req.share.on), who);
        if (!patch) return { status: 'not-allowed' };
        await applyBoardPatch(scene, patch, { sink });
        return { status: 'done' };
    }
    // a player's edit from the shared controls (Luke, 2026-10-24): their own
    // and public notes, writing, strings, and pins, and the pieces on them
    if (req.own) {
        const patch = playerPatchOf(board, req.own, who, look, { layoutOf: layoutsOf(board, tools), textures: tools.textures });
        if (!patch) return { status: 'not-allowed' };
        if (Object.keys(patch).length) await applyBoardPatch(scene, patch, { sink });
        return { status: 'done' };
    }
    if (!who.isGM && !who.owner) return { status: 'not-allowed' };
    // (Luke, 2026-10-25, the health audit) A players' board's owner's edit,
    // or the GM's: each part checked before anything is written. An owner's
    // edit from the shared controls is checked field by field as a player's
    // own is (playerPatchOf), with any note and any string theirs to change;
    // the GM's is taken as sent. Never the bin.
    const ownable = (key) => board.scraps?.[key] && mayMove(board.scraps[key], who);
    // (a locked card: only locked or let go, nothing put in it, never taken
    // off; Luke 2026-10-25)
    const frozen = (key) => Boolean(key && board.scraps?.[key]?.locked);
    if (req.patch?.bin) return { status: 'not-allowed' };
    const patch = req.patch && !who.isGM ? playerPatchOf(board, req.patch, who, look, { layoutOf: layoutsOf(board, tools), textures: tools.textures }) : req.patch;
    if (req.patch && !patch) return { status: 'not-allowed' };
    // (a new string: its kind one of the kinds, hidden only by the GM, its
    // new ends on or near the sheet, a shared pin made first checked as the
    // owner's own edit)
    const act = req.addString?.act ?? {};
    if (req.addString && ([act.aPt, act.bPt].some((p) => p && !pointOk(L, p)) || (!who.isGM && act.prep && !ownPatchOf(board, act.prep, who, look, tools.textures)))) return { status: 'not-allowed' };
    const pin = req.addPin?.tex ? addPinOf(board, req.addPin, tools) : null;
    if (req.addPin?.tex && !pin) return { status: 'not-allowed' };
    if (req.removeScrap && (!ownable(req.removeScrap) || frozen(req.removeScrap))) return { status: 'not-allowed' };
    if (patch) await applyBoardPatch(scene, patch, { sink });
    let id = null;
    // (a new string from the shared controls' ends, pins made as needed)
    if (req.addString) id = await addString(scene, act, LINK_KINDS.includes(req.addString.kind) ? req.addString.kind : 'plain', { color: cleanInk(req.addString.color), state: who.isGM && req.addString.state === 'hidden' ? 'hidden' : 'known', pin: pinPick(req.addString.pin, tools), plainPins: Boolean(req.addString.plainPins) }, { sink });
    // a name for the new string (or one named by req.label.id)
    if (req.label?.text && (id || req.label.id)) await labelString(scene, id ?? req.label.id, String(req.label.text).slice(0, MAX_TEXT), { sink });
    if (pin) await addPin(scene, pin, { sink });
    if (id && !req.removeScrap && !req.removeLink && !req.remove) return { status: 'done', id };
    // (a card comes off into the bin, never gone)
    if (req.removeScrap) await removeScrap(scene, req.removeScrap, { sink, by: userId });
    if (req.removeLink) await removeLink(scene, req.removeLink, { sink });
    if (req.remove) {
        const scraps = [].concat(req.remove.scraps ?? []).filter((k) => ownable(k) && !frozen(k));
        if (scraps.length) await binCards(scene, scraps, { sink, by: userId });
        await removeMany(scene, { scraps: [], pins: [].concat(req.remove.pins ?? []), links: [].concat(req.remove.links ?? []) }, { sink });
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
// (`canShare`: its maker or the GM, who may make it public: Luke 2026-10-24)
// (`pin`: the pin its ends are now, changed here for all its own pins: Luke
// 2026-10-25)
export async function stringDialog({ kind = 'plain', label = '', color = null, player = false, open = false, canShare = false, plainPins = false, pin = null } = {}) {
    // (any string in any of the brush's paints, in the brush's order and
    // names: Luke 2026-10-21)
    const { look, textures } = await loadBoardLook();
    const pinIds = pinChoices(look, Object.keys(textures ?? {})).filter((id) => textureUrl(textures, id));
    const pins = pin && pinIds.length ? row(loc('heart.board.string-pin'), `<div class="heart-board-pinpick">${(pinIds.includes(pin) ? pinIds : [pin, ...pinIds]).map((id) => `<label data-tooltip="${esc(pinName(id))}"><input type="radio" name="pin" value="${esc(id)}" ${id === pin ? 'checked' : ''}><span><img src="${esc(textureUrl(textures, id))}" alt=""></span></label>`).join('')}</div>`) : '';
    const marker = look.ink.marker ?? [];
    // (no paint for anyone: white, or its kind's own; Luke 2026-10-25)
    const pick = color;
    const own = `<label class="any"><input type="radio" name="color" value="" ${pick === null || pick === undefined ? 'checked' : ''}><span>${esc(loc(player || kind === 'plain' ? 'heart.board.string-color-none' : 'heart.board.string-color-own'))}</span></label>`;
    const colors = row(loc('heart.board.string-color'), `<div class="heart-board-paints">${own}${paintOrder(marker.length).map((i) => `<label data-tooltip="${esc(paintName(i))}"><input type="radio" name="color" value="${i}" ${i === pick ? 'checked' : ''}><span style="background:${hex(marker[i])}"></span></label>`).join('')}</div>`);
    // (its kind as chips, not a dropdown)
    const kinds = player ? '' : row(loc('heart.board.kind'), `<span class="heart-board-chips">${LINK_KINDS.map((k) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${esc(loc(`heart.board.kind-${k}`))}</span></label>`).join('')}</span>`);
    const name = row(loc('heart.board.string-name'), `<input type="text" name="label" value="${esc(label)}" placeholder="${esc(loc('heart.board.string-name-hint'))}">`);
    const share = canShare ? row(loc('heart.board.public'), `<label class="heart-board-switch" data-tooltip="${esc(loc('heart.board.public-string-hint'))}"><input type="checkbox" name="open" ${open ? 'checked' : ''}><span>${esc(loc('heart.board.public-on'))}</span></label>`) : '';
    // (its pins in its colour, or their own: Luke 2026-10-25)
    const tint = row(loc('heart.board.string-pins'), `<label class="heart-board-switch" data-tooltip="${esc(loc('heart.board.string-pin-tint-hint'))}"><input type="checkbox" name="tint" ${plainPins ? '' : 'checked'}><span>${esc(loc('heart.board.string-pin-tint'))}</span></label>`);
    return new Promise((resolve) => {
        new Dialog({
            title: loc('heart.board.string-this'),
            content: `${kinds}${name}${colors}${pins}${tint}${share}`,
            buttons: {
                ok: {
                    label: loc('heart.board.keep-it'),
                    callback: (html) => {
                        const c = html.find('[name=color]:checked').val();
                        resolve({ kind: player ? kind : html.find('[name=kind]:checked').val() ?? kind, label: String(html.find('[name=label]').val() ?? '').trim(), color: c === '' || c === undefined ? null : Number(c), plainPins: !html.find('[name=tint]').is(':checked'), pin: html.find('[name=pin]:checked').val() ?? pin, ...(canShare ? { open: html.find('[name=open]').is(':checked') } : {}) });
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            // (each pin stood upright and cut to itself, as the Pin window's)
            render: (html) => html.find('.heart-board-pinpick img').each((_, im) => {
                const swap = () => im.replaceWith(pinThumb(im, im.closest('label').querySelector('input').value, 64));
                if (im.complete && im.naturalWidth) swap();
                else im.addEventListener('load', swap, { once: true });
            }),
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
    const { look } = await loadBoardLook(scene);
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
            await replaceBoard(scene, await tidiedBoard(board, scene));
            ui.notifications.info(loc('heart.board.history-done'));
        }),
    }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 460 }));
    d.render(true);
}

// The sheet's size (Luke, 2026-10-24: File, Sheet size, the GM's): pages
// added or taken away on each side, one edit Undo takes back; never past
// anything placed (api.js sheetRoom), never less than a page
export async function sheetDialog(scene) {
    if (!game.user.isGM || !scene) return;
    const room = await sheetRoom(scene);
    // (on its scene's own background: no sheet to size; Luke 2026-10-25)
    if (room.bare) return ui.notifications.info(loc('heart.board.sheet-bare'));
    const by = { top: 0, left: 0, right: 0, bottom: 0 };
    const side = (k) => row(loc(`heart.board.sheet-${k}`), `<span class="heart-board-stepper"><button type="button" data-side="${k}" data-step="-1" aria-label="${esc(loc('heart.board.sheet-less'))}" data-tooltip="${esc(loc('heart.board.sheet-less'))}"><i class="fa-solid fa-minus"></i></button><output data-out="${k}">0</output><button type="button" data-side="${k}" data-step="1" aria-label="${esc(loc('heart.board.sheet-more'))}" data-tooltip="${esc(loc('heart.board.sheet-more'))}"><i class="fa-solid fa-plus"></i></button></span>`);
    return new Promise((resolve) => {
        const d = new Dialog({
            title: loc('heart.board.sheet-title'),
            content: `<p>${esc(loc('heart.board.sheet-hint'))}</p>${['top', 'left', 'right', 'bottom'].map(side).join('')}<p class="heart-board-hint" data-size></p>`,
            buttons: {
                ok: {
                    label: loc('heart.board.sheet-apply'),
                    callback: async () => {
                        if (!Object.values(by).some(Boolean)) return resolve(null);
                        const r = await resizeBoardSheet(scene, by);
                        if (r?.refused) ui.notifications.warn(loc('heart.board.sheet-refused', { side: loc(`heart.board.sheet-${r.refused}`).toLowerCase() }));
                        resolve(r);
                    },
                },
                cancel: { label: loc('Cancel'), callback: () => resolve(null) },
            },
            default: 'ok',
            render: (html) => {
                const show = () => {
                    const cols = room.cols + by.left + by.right;
                    const rows = room.rows + by.top + by.bottom;
                    for (const k of Object.keys(by)) {
                        html.find(`[data-out=${k}]`).text(by[k] > 0 ? `+${by[k]}` : String(by[k]));
                        const across = k === 'left' || k === 'right';
                        // (never in past what is placed, nor below one page)
                        html.find(`[data-side=${k}][data-step=-1]`).prop('disabled', by[k] <= -room[k] || (across ? cols : rows) <= 1);
                    }
                    html.find('[data-size]').text(loc('heart.board.sheet-size', { cols, rows, was: `${room.cols} x ${room.rows}` }));
                };
                html.find('[data-step]').on('click', (ev) => {
                    const { side: k, step } = ev.currentTarget.dataset;
                    by[k] += Number(step);
                    show();
                });
                show();
            },
            close: () => resolve(null),
        }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 380 }));
        d.render(true);
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
