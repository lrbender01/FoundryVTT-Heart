// The scrapboard map's table tools (2026-10-02, monorepo
// docs/plans/heart-map.md): a canvas layer with its own scene controls, on a
// scrapboard scene only (activated as soon as such a scene is viewed). What
// each click, Ctrl+click, box, drag, wheel, and double-click does is the
// shared controls' (controls.js: the same copy the Heart Map Board editor
// runs); this layer feeds them Foundry's pointer events and carries out what
// they return with Foundry's dialogs and scene writes.
//   Move     select (click; Ctrl adds or takes away; drag a box), drag the
//            selection, size it by its corner square or turn it by its corner
//            circle, Ctrl+wheel turns and Shift+wheel sizes it; drag any pin,
//            joint, junction, or tag (a white dot shows what a press takes);
//            Ctrl+drag a string pulls it, Shift+drag pins a joint into it; a
//            selected card's pieces (its clipping, tape, pins) have handles;
//            double-click opens a place, edits a note, or a string's kind and
//            name
//   String   click (or press and drag) where it starts, then where it ends:
//            on a place it ties on, anywhere else it hangs loose
//   Pin      click to pick a pin and put it in (in a scrap, or loose);
//            Ctrl+click puts in the last one again
//   Marker   draw on the sheet, under everything pinned to it, on your own
//            layer (Shift+drag rubs out); its palette has the inks, the widths,
//            and (the GM's) every layer, to show, hide, or clear
//   Reveal, Note, Write, Erase; Player view (the players' own tools, as they
//   see the board), Undo, Export, Import, Restore, Reload the look (GM)
// Players have Look, Move, Note, Write, and the Marker, all on their own
// notes, writing, and layer, in the hand they claimed (notes.js). On a
// players' board its owners have the GM's tools but Reveal. The map is drawn
// by render.js in the primary group; this layer (in the interface group)
// takes the pointer and draws the tools' marks.
import { ScrapboardRenderer } from './render.js';
import { pinThumb } from './paint.js';
import { reloadBoardLook } from './look.js';
import { markMax, doodleBoard, strokeToCard, customKey, brushColor, PAINT_NAMES, PAINT_ORDER, DOODLE_KINDS, DOODLE_SIZE, noteFields } from './model.js';
import { BoardControls, toolsFor, applyPatch, LOCK_MS } from './controls.js';
import {
    isBoardScene, boardOf, ownsBoard, setScrap, setLink, unsetLink, addLink, addPin, addScrap, addMark, removeMarks, clearAllBrushes,
    removeScrap, removeLink, removeMany, applyBoardPatch, labelString, addString, undo, redo, exportBoard, importBoard, restoreBackup, hasBackup,
} from './api.js';
import {
    playerAddNote, playerMove, editNote, noteDialog, pickHand, stringDialog, pinDialog, exportDialog, importDialog, boardEdit, binDialog, backupsDialog,
} from './notes.js';
import { heartDialogOptions } from '../../common/dialog.js';
import { showArt, showImage } from '../../common/art.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
const SELECTED = 0xef5a4d;
// a selected pin or piece: a small orange dot where the grab dot would be
const PICKED = 0xf08a24;
const WIDTHS = [4, 8, 12];
void WIDTHS;
const LAST_PIN = 'heart.board.lastPin';
// where this client left the brush's palette (Luke, 2026-10-06: dragged
// anywhere, never closed)
const PALETTE_AT = 'heart.board.paletteAt';
// the brush's paints as the palette shows them: the plain ones, then the colours
// The palette kept in the window, at x, y (px)
function placePalette(el, x, y) {
    const r = el.getBoundingClientRect();
    const px = Math.max(4, Math.min(window.innerWidth - r.width - 4, x));
    const py = Math.max(4, Math.min(window.innerHeight - r.height - 4, y));
    Object.assign(el.style, { left: `${px}px`, top: `${py}px`, bottom: 'auto', transform: 'none' });
}

// The corner handles (Luke, 2026-10-02: compact and clear): size, a hollow
// square broken along its edges; turn, a quarter arc from top-left round to
// bottom-right with an arrowhead at each end. Dark under red, so they read
// on anything.
function handleGlyph(g, c, k, kind) {
    const pass = (w, color, alpha) => {
        g.lineStyle({ width: w * k, color, alpha, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
        if (kind === 'size') {
            const h = 6 * k;
            const a = 3 * k;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                g.moveTo(c.x + sx * h, c.y + sy * (h - a)).lineTo(c.x + sx * h, c.y + sy * h).lineTo(c.x + sx * (h - a), c.y + sy * h);
            }
            return;
        }
        const rad = 6.5 * k;
        const t0 = (-3 * Math.PI) / 4;
        const t1 = Math.PI / 4;
        g.moveTo(c.x + Math.cos(t0) * rad, c.y + Math.sin(t0) * rad).arc(c.x, c.y, rad, t0, t1, false);
        for (const [t, sgn] of [[t0, -1], [t1, 1]]) {
            const px = c.x + Math.cos(t) * rad;
            const py = c.y + Math.sin(t) * rad;
            const dx = -Math.sin(t) * sgn;
            const dy = Math.cos(t) * sgn;
            const b = 3.2 * k;
            g.moveTo(px - dx * b - dy * b * 0.8, py - dy * b + dx * b * 0.8).lineTo(px, py).lineTo(px - dx * b + dy * b * 0.8, py - dy * b - dx * b * 0.8);
        }
    };
    pass(3.4, 0x1a0d0b, 0.7);
    pass(1.6, SELECTED, 1);
}

export class ScrapboardLayer extends InteractionLayer {
    static get layerOptions() {
        // (rotatableObjects: Foundry hands Ctrl+wheel and Shift+wheel to this
        // layer while it has a target, the selection)
        return foundry.utils.mergeObject(super.layerOptions, { name: 'heartBoard', zIndex: 260, rotatableObjects: true, controllableObjects: false });
    }

    renderer = new ScrapboardRenderer();
    // the GM sees the map as players do, with their tools (Player view)
    preview = false;
    // the marker's ink (an index into the look's sheet inks) and width
    markInk = 0;
    markWidth = WIDTHS[1];
    // (Luke, 2026-10-03: its opacity, 5 to 100%)
    markOpacity = 0.85;
    // (Luke, 2026-10-06: its brightness, 0 dim, 1 as it is, 2 bright)
    markBright = 1;
    controls = new BoardControls({
        view: () => this.renderer.view,
        look: () => this.renderer.look,
        painter: () => this.renderer.painter,
        size: (id) => this.renderer.size(id),
        user: () => this.user,
        px: () => 1 / Math.max(0.02, this.renderer.scale * (canvas.stage?.scale.x ?? 1)),
        // (board px per screen px at the closest zoom)
        finest: () => 1 / Math.max(0.02, this.renderer.scale * (CONFIG.Canvas.maxZoom ?? 3)),
        raw: () => this.#working ?? boardOf(canvas.scene),
    });
    #overlay = null;
    // (the stroke being drawn, painted by the brush itself, in its two passes:
    // Luke 2026-10-06)
    #strokeSprites = [];
    #strokeMask = null;
    // the board as an edit under way would leave it (a drag, a wheel), shown
    // before it is written
    #working = null;
    #painting = false;
    #again = false;
    #live = null;

    get isBoard() {
        return isBoardScene(canvas.scene);
    }

    // who the controls act for: the GM in Player view is a player
    get user() {
        const u = game.user;
        if (u.isGM && this.preview) return { id: u.id, isGM: false, owner: false };
        return { id: u.id, isGM: u.isGM, owner: !u.isGM && ownsBoard(canvas.scene, u.id) };
    }

    get viewer() {
        return game.user.isGM && !this.preview ? 'gm' : 'player';
    }

    // Foundry's wheel target: the selection
    get hover() {
        return this.controls.wantsWheel({ ctrl: true }) ? true : null;
    }

    async _draw(options) {
        await super._draw(options);
        this.#strokeSprites = [0, 1, 2].map(() => this.addChild(new PIXI.Sprite(PIXI.Texture.EMPTY)));
        for (const sp of this.#strokeSprites) sp.visible = false;
        this.#overlay = this.addChild(new PIXI.Graphics());
        this.controls.clear();
        this.controls.from = null;
    }

    async _tearDown(options) {
        this.renderer.clear();
        this.#overlay = null;
        this.#strokeSprites = [];
        this.#strokeMask = null;
        this.controls.clear();
        this.#palette(false);
        return super._tearDown(options);
    }

    _activate() {
        canvas.stage.on('pointermove', this.#onHover);
        window.addEventListener('keydown', this.#onKey);
        window.addEventListener('keyup', this.#onKeyUp);
        this.syncPalette();
    }

    _deactivate() {
        canvas.stage.off('pointermove', this.#onHover);
        window.removeEventListener('keydown', this.#onKey);
        window.removeEventListener('keyup', this.#onKeyUp);
        this.controls.from = null;
        this.controls.grab = null;
        this.controls.cancel();
        this.drawMarks();
        this.#palette(false);
        this.#caption(null);
    }

    // the grab reticle (and a new string's line) follow the pointer; the
    // reticle's ring shows once it has held a moment
    #onHover = (event) => {
        if (!this.active || !this.isBoard || !this.renderer.view || this.controls.drag) return;
        const pt = this.renderer.toMap(event.getLocalPosition(canvas.stage));
        this.#pointer = pt;
        // (and the doodle in hand, a ghost where a click lays it)
        if (this.controls.hover(pt, game.activeTool) || this.controls.from || this.#layingDoodle()) {
            this.drawMarks(pt);
            clearTimeout(this.#lockTimer);
            if (this.controls.grab) this.#lockTimer = setTimeout(() => this.drawMarks(this.#pointer), LOCK_MS + 15);
        }
        this.#mouse = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    };

    #mouse = null;

    // A few words by the reticle once it has caught something (what a press
    // does on it); this client's, out of the way of the pointer
    #caption(text) {
        let el = document.getElementById('heart-board-caption');
        if (!text || !this.#mouse) return el?.remove();
        if (!el) {
            el = document.createElement('div');
            el.id = 'heart-board-caption';
            el.className = 'heart-board-caption';
            document.body.append(el);
        }
        el.textContent = text;
        el.style.left = `${this.#mouse.x + 16}px`;
        el.style.top = `${this.#mouse.y + 18}px`;
    }

    #pointer = null;
    #lockTimer = 0;

    // Delete (or Backspace) takes the selection off the board (Foundry only
    // sends the key to layers of its own placeables)
    #onKey = (event) => {
        // (Escape puts the doodle in hand down)
        if (event.key === 'Escape' && this.controls.doodle && this.active) {
            this.controls.doodle = null;
            return this.syncPalette();
        }
        // (Luke, 2026-10-03: Enter smooths a selected pin away)
        if (event.key === 'Enter' && this.active && this.isBoard && !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
            const patch = this.controls.smooth();
            if (patch) {
                event.preventDefault();
                event.stopPropagation();
                this.drawMarks();
                return this.#write(patch);
            }
        }
        if (!this.active || !this.isBoard || !['Delete', 'Backspace', 'PageUp', 'PageDown'].includes(event.key)) return;
        if (!this.controls.editor) {
            // (a player: their own strings and pins, Luke 2026-10-03)
            if (!['Delete', 'Backspace'].includes(event.key) || event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
            const what = this.controls.removal();
            if (!what.links.length && !what.pins.length) return;
            event.preventDefault();
            this.controls.clear();
            this.drawMarks();
            return boardEdit(canvas.scene, { ownRemove: { links: what.links, pins: what.pins } });
        }
        if (event.target?.closest?.('input, textarea, select, [contenteditable]') || !this.controls.count) return;
        // (a card's own piece selected alone: that piece comes off)
        if (event.key === 'Delete' || event.key === 'Backspace') {
            const piece = this.controls.pieceOut();
            if (piece) {
                event.preventDefault();
                this.drawMarks();
                return this.#write(piece);
            }
        }
        // PageUp, PageDown: the selected cards a layer up or down
        if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            const patch = this.controls.layer(event.key === 'PageUp' ? 1 : -1);
            return patch ? this.#write(patch) : null;
        }
        event.preventDefault();
        // (Luke, 2026-10-06: pins and strings go at once; cards only once
        // asked, into the bin)
        const what = this.controls.removal();
        const gone = { scraps: [], pins: what.pins, links: what.links };
        if (what.pins.length || what.links.length) {
            for (const id of [...what.pins]) this.controls.pins.delete(id);
            for (const id of [...what.links]) this.controls.links.delete(id);
            this.controls.link = null;
            this.drawMarks();
            if (this.user.isGM) removeMany(canvas.scene, gone);
            else boardEdit(canvas.scene, { remove: gone });
        }
        const cards = (this.renderer.view?.scraps ?? []).filter((x) => what.cards.includes(x.key));
        if (cards.length) return this.#takeOff(cards);
    };

    // Undo or redo this user's own last edit on the board (Ctrl+Z, Ctrl+Y,
    // Ctrl+Shift+Z; Luke 2026-10-06). False when the board isn't in hand.
    async history(dir) {
        if (!this.active || !this.isBoard) return false;
        this.controls.cancel();
        await (dir === 'redo' ? redo(canvas.scene) : undo(canvas.scene));
        return true;
    }

    // Cards off the board, into the bin, once asked
    async #takeOff(list) {
        const cards = [].concat(list);
        if (!cards.length) return;
        const ok = await Dialog.confirm({
            title: loc('heart.board.erase-title'),
            content: `<p>${esc(cards.length === 1 ? loc('heart.board.erase-scrap', { name: this.#nameOf(cards[0]) }) : loc('heart.board.erase-cards', { n: cards.length }))}</p>`,
            options: heartDialogOptions({ classes: ['heart-board-dialog'] }),
        });
        if (!ok) return;
        this.controls.clear();
        this.drawMarks();
        const keys = cards.map((c) => c.key);
        if (game.user.isGM) return removeMany(canvas.scene, { scraps: keys, pins: [], links: [] });
        return boardEdit(canvas.scene, { remove: { scraps: keys, pins: [], links: [] } });
    }

    // A doodle laid down where the brush's doodle palette's one in hand was
    // clicked (Luke, 2026-10-06): on the card under it (its own strokes,
    // kept to it) or the sheet, in the brush's paint, brightness, width, and
    // opacity; strokes of whoever placed it
    #doodle(a) {
        const r = this.renderer;
        const look = r.look;
        if (!look) return;
        const strokes = doodleBoard(a.kind, a.seed ?? `${a.kind}:${Date.now()}`, { x: a.at.x, y: a.at.y, size: this.doodleSize, c: this.markInk, w: Math.min(this.markWidth, markMax(look)), b: this.markBright, o: this.markOpacity });
        const raw = boardOf(canvas.scene);
        const me = game.user.id;
        const patch = { marks: {}, scraps: {} };
        const card = a.on ? r.view?.scraps.find((x) => x.key === a.on) : null;
        if (card) {
            const have = { ...(raw.scraps?.[card.key]?.marks ?? {}) };
            const marks = {};
            for (const st of strokes) {
                const id = customKey('m', have);
                have[id] = 1;
                marks[id] = { ...strokeToCard(st, card, look), by: me };
            }
            patch.scraps[card.key] = { marks };
        } else {
            const have = { ...(raw.marks?.[me] ?? {}) };
            const marks = {};
            for (const st of strokes) {
                const id = customKey('m', have);
                have[id] = 1;
                marks[id] = st;
            }
            patch.marks[me] = marks;
        }
        if (game.user.isGM && !this.preview) return applyBoardPatch(canvas.scene, patch);
        return boardEdit(canvas.scene, { remark: patch });
    }

    // the doodle palette's size (a doodle's half-width, board px), and
    // whether its panel is open (shut until the brush's Doodles opens it:
    // Luke 2026-10-06)
    doodleSize = DOODLE_SIZE;
    doodlesOpen = false;

    #layingDoodle() {
        return game.activeTool === 'mark' && Boolean(this.controls.doodle);
    }

    async refresh() {
        if (!canvas.ready && !canvas.scene) return;
        if (!this.isBoard) return this.renderer.clear();
        this.#working = null;
        await this.renderer.draw(canvas.scene, this.viewer);
        this.controls.prune();
        this.drawMarks();
        this.syncPalette();
    }

    queueRefresh = foundry.utils.debounce(() => this.refresh(), 60);

    // a new detail level: everything painted again
    reset() {
        this.renderer.reset();
        return this.refresh();
    }

    async setPreview(on) {
        this.preview = Boolean(on);
        this.controls.clear();
        this.controls.from = null;
        await this.refresh();
        // (the players' tools, or the GM's again)
        ui.controls?.initialize({ control: 'heartBoard', tool: on ? 'inspect' : 'move' });
    }

    #pointOf(event, which = 'origin') {
        const p = event.interactionData?.[which] ?? event.getLocalPosition?.(this);
        return p ? this.renderer.toMap(p) : null;
    }

    #ctrl(event) {
        return Boolean(event?.ctrlKey || event?.metaKey) || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    }

    #shift(event) {
        return Boolean(event?.shiftKey) || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    }

    /* -------------------------------------------- */
    /*  The tools' marks                            */
    /* -------------------------------------------- */

    // The selection, its handles, a box, a new string's start and line, a
    // stroke being drawn, the eraser, a selected card's pieces' handles, and
    // the grab reticle (also on pan and zoom: they keep their width on screen)
    drawMarks(pointer = null) {
        const g = this.#overlay;
        if (!g || g.destroyed) return;
        g.clear();
        const r = this.renderer;
        if (!r.view) return;
        const k = 1 / Math.max(0.02, canvas.stage.scale.x);
        const toC = (pts) => {
            const out = [];
            for (let i = 0; i < pts.length; i += 2) {
                const c = r.toCanvas({ x: pts[i], y: pts[i + 1] });
                out.push(c.x, c.y);
            }
            return out;
        };
        const path = (pts) => {
            const c = toC(pts);
            g.moveTo(c[0], c[1]);
            for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1]);
        };
        const round = { cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND };
        // (a Ctrl chain too: its next string's line follows the pointer, Luke 2026-10-06)
        const m = this.controls.marks({ pointer: game.activeTool === 'string' || this.controls.chaining || this.#layingDoodle() ? pointer : null });
        // (the drawing alone: only the marker's own marks)
        // (its box and handles stay while the brush is in hand: Luke 2026-10-06,
        // the select box never showed)
        if (r.marksOnly) Object.assign(m, { hulls: [], link: null, strings: [], pins: [], from: null, fromPt: null, line: null, parts: [], partBox: null, grab: null, caption: null, join: null, ...(game.activeTool === 'mark' ? {} : { handle: null, rotor: null, box: null }) });
        for (const hull of m.hulls) g.lineStyle({ width: 2.5 * k, color: SELECTED, alpha: 0.95 }).beginFill(SELECTED, 0.07).drawPolygon(toC(hull)).endFill();
        for (const pts of [...(m.link ? [m.link] : []), ...m.strings]) {
            g.lineStyle({ width: 9 * k, color: SELECTED, alpha: 0.35 });
            path(pts);
        }
        for (const p of m.pins) {
            const c = r.toCanvas(p);
            g.lineStyle({ width: 1.5 * k, color: 0x1a0d0b, alpha: 0.9 }).beginFill(PICKED, 1).drawCircle(c.x, c.y, 4.5 * k).endFill();
        }
        if (m.partBox) g.lineStyle({ width: 1.5 * k, color: PICKED, alpha: 0.95 }).drawPolygon(toC(m.partBox));
        if (m.handle) handleGlyph(g, r.toCanvas(m.handle), k, 'size');
        if (m.rotor) handleGlyph(g, r.toCanvas(m.rotor), k, 'turn');
        if (m.from) g.lineStyle({ width: 4 * k, color: SELECTED, alpha: 0.9 }).drawPolygon(toC(m.from));
        if (m.fromPt) {
            const c = r.toCanvas(m.fromPt);
            g.lineStyle({ width: 2 * k, color: 0x1a0d0b, alpha: 0.9 }).beginFill(SELECTED, 1).drawCircle(c.x, c.y, 7 * k).endFill();
            // the line to where it would end (a drag, or the pointer between
            // clicks), as the string will run
            if (m.line) {
                const [p, q] = m.line.map((x) => r.toCanvas(x));
                g.lineStyle({ width: 2.5 * k, color: SELECTED, alpha: 0.85 }).moveTo(p.x, p.y).lineTo(q.x, q.y);
            }
        }
        if (m.box) {
            const a = r.toCanvas({ x: m.box.x0, y: m.box.y0 });
            const z = r.toCanvas({ x: m.box.x1, y: m.box.y1 });
            g.lineStyle({ width: 1.5 * k, color: SELECTED, alpha: 0.9 }).beginFill(SELECTED, 0.08).drawRect(a.x, a.y, z.x - a.x, z.y - a.y).endFill();
        }
        this.#strokePreview(m.stroke, m.strokeHull ? toC(m.strokeHull) : null);
        // the doodle in hand, where a click lays it (Luke, 2026-10-06)
        if (m.doodle && this.#layingDoodle() && r.look) {
            for (const st of doodleBoard(m.doodle.kind, m.doodle.seed, { x: m.doodle.at.x, y: m.doodle.at.y, size: this.doodleSize, c: this.markInk, w: Math.min(this.markWidth, markMax(r.look)), b: this.markBright, o: this.markOpacity })) {
                g.lineStyle({ width: st.w * r.scale, color: brushColor(r.look.ink.marker[this.markInk], this.markBright), alpha: 0.6 * this.markOpacity, ...round });
                path(st.pts);
            }
        }
        // (the strokes being rubbed out, a card's too; the selected ones)
        const strokeOf = (layer, id) => (String(layer).startsWith("@") ? r.view.scraps.find((x) => x.key === layer.slice(1))?.layout.strokes?.find((x) => x.id === id) : r.view.marks?.[layer]?.[id]);
        for (const [layer, id] of m.rubbed) {
            const s = strokeOf(layer, id);
            if (!s) continue;
            g.lineStyle({ width: (s.w + 4) * r.scale, color: SELECTED, alpha: 0.45, ...round });
            path(s.pts);
        }
        for (const s of m.strokes ?? []) {
            g.lineStyle({ width: (s.w + 6) * r.scale, color: SELECTED, alpha: 0.35, ...round });
            path(s.pts);
        }
        // (strokes being moved, sized, or turned: in their own ink, where they are going)
        // (a padlock: a card locked to the sheet)
        for (const p of m.locks ?? []) {
            const c = r.toCanvas(p);
            g.lineStyle({ width: 1.5 * k, color: 0x1a0d0b, alpha: 0.9 }).beginFill(SELECTED, 1).drawRoundedRect(c.x - 6 * k, c.y - 3 * k, 12 * k, 9 * k, 1.5 * k).endFill();
            g.lineStyle({ width: 2 * k, color: SELECTED, alpha: 1 }).arc(c.x, c.y - 3 * k, 4 * k, Math.PI, 0);
        }
        for (const s of m.moving ?? []) {
            g.lineStyle({ width: Math.min(s.w, markMax(r.look)) * r.scale, color: r.look?.ink.marker[s.c] ?? 0xd8ccb4, alpha: s.o ?? 0.85, ...round });
            path(s.pts);
        }
        if (m.eraser) {
            const c = r.toCanvas(m.eraser);
            g.lineStyle({ width: 1.5 * k, color: 0xffffff, alpha: 0.9 }).drawCircle(c.x, c.y, m.eraser.r * r.scale);
        }
        for (const p of m.parts) {
            const c = r.toCanvas(p);
            g.lineStyle({ width: 1.5 * k, color: 0x1a0d0b, alpha: 0.9 }).beginFill(p.on ? PICKED : 0xffffff, 0.95).drawCircle(c.x, c.y, 4 * k).endFill();
        }
        // (a string's pin dragged over another's: a thin ring where they would join)
        if (m.join) {
            const c = r.toCanvas(m.join);
            g.lineStyle({ width: 2.5 * k, color: 0x1a0d0b, alpha: 0.35 }).drawCircle(c.x, c.y, 8 * k);
            g.lineStyle({ width: 1.2 * k, color: 0xffffff, alpha: 0.85 }).drawCircle(c.x, c.y, 8 * k);
        }
        this.#caption(m.caption);
        if (m.grab) {
            const c = r.toCanvas(m.grab);
            g.lineStyle({ width: 1.5 * k, color: 0x1a0d0b, alpha: 0.9 }).beginFill(0xffffff, 1).drawCircle(c.x, c.y, 3.5 * k).endFill();
            // held: a ring round it (a press takes it)
            if (m.grab.locked) {
                g.lineStyle({ width: 3 * k, color: 0x1a0d0b, alpha: 0.55 }).drawCircle(c.x, c.y, 9 * k);
                g.lineStyle({ width: 1.5 * k, color: 0xffffff, alpha: 0.95 }).drawCircle(c.x, c.y, 9 * k);
            }
        }
    }

    // The stroke being drawn as the brush will paint it (its paint, ragged
    // edges, and dry gaps, at this brightness and opacity), at screen
    // resolution, under the tools' marks
    #strokePreview(pts, hull = null) {
        const sps = this.#strokeSprites;
        // (begun on a card, kept to it as it will be)
        if (sps[0] && !sps[0].destroyed) {
            this.#strokeMask ??= this.addChild(new PIXI.Graphics());
            this.#strokeMask.clear();
            if (hull) this.#strokeMask.beginFill(0xffffff, 1).drawPolygon(hull).endFill();
            for (const sp of sps) sp.mask = hull ? this.#strokeMask : null;
        }
        if (!sps[0] || sps[0].destroyed) return;
        const r = this.renderer;
        if (!pts || pts.length < 4 || !r.painter?.strokeLayer || !r.look) {
            for (const sp of sps) sp.visible = false;
            return;
        }
        const st = { c: this.markInk, w: Math.min(this.markWidth, markMax(r.look)), o: this.markOpacity, b: this.markBright, pts };
        const k = Math.min(3, r.scale * canvas.stage.scale.x * (window.devicePixelRatio || 1));
        let L = null;
        try {
            L = r.painter.strokeLayer(st, k, 'live');
        } catch (err) {
            console.warn('heart | the stroke could not be shown', err);
        }
        if (!L) {
            for (const sp of sps) sp.visible = false;
            return;
        }
        // The painter's passes over the sheet as it is now, grime and all
        // (Luke, 2026-10-06: Dim and Bright previewed too dim): soaked in, the
        // stroke as it is (the grime already under it darkens it as the
        // grime over it will); laid on, darkened as the grime will darken
        // it; a bright stroke's light pass over the grime, as it is
        const c = document.createElement('canvas');
        c.width = L.canvas.width;
        c.height = L.canvas.height;
        const g = c.getContext('2d');
        g.drawImage(L.canvas, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = `#${r.painter.grimeVeil.toString(16).padStart(6, '0')}`;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(L.canvas, 0, 0);
        const veiled = PIXI.Texture.from(c);
        const plain = PIXI.Texture.from(L.canvas);
        const a = r.toCanvas({ x: L.x0, y: L.y0 });
        const pass = [[plain, PIXI.BLEND_MODES.MULTIPLY, L.soak], [veiled, PIXI.BLEND_MODES.NORMAL, L.lay], [plain, PIXI.BLEND_MODES.NORMAL, L.over ?? 0]];
        const olds = new Set(sps.map((sp) => sp.texture).filter((t) => t && t !== PIXI.Texture.EMPTY && t !== plain && t !== veiled));
        sps.forEach((sp, i) => {
            const [t, blend, alpha] = pass[i];
            sp.texture = t;
            sp.position.set(a.x, a.y);
            sp.width = (L.x1 - L.x0) * r.scale;
            sp.height = (L.y1 - L.y0) * r.scale;
            sp.blendMode = blend;
            sp.alpha = alpha;
            sp.visible = alpha > 0;
        });
        for (const t of olds) t.destroy(true);
    }

    /* -------------------------------------------- */
    /*  Presses                                     */
    /* -------------------------------------------- */

    // (Foundry calls a left click on the press, before any drag)
    async _onClickLeft(event) {
        if (!this.isBoard || !this.renderer.view) return;
        const action = this.controls.press(game.activeTool, this.#pointOf(event), { ctrl: this.#ctrl(event) });
        return this.#do(action);
    }

    async _onClickRight(event) {
        if (!this.isBoard || !this.renderer.view || !this.controls.editor) return;
        const e = event?.data?.originalEvent ?? event?.nativeEvent;
        if (Number.isFinite(e?.clientX)) this.#mouse = { x: e.clientX, y: e.clientY };
        const action = this.controls.press(game.activeTool, this.#pointOf(event), { right: true });
        return this.#do(action);
    }

    async _onClickLeft2(event) {
        if (!this.isBoard || !this.renderer.view) return;
        return this.#do(this.controls.double(game.activeTool, this.#pointOf(event)));
    }

    // Carry out what the controls asked for
    async #do(a) {
        if (!a) return;
        const scene = canvas.scene;
        const gm = this.user.isGM;
        switch (a.do) {
            case 'select':
                return this.drawMarks();
            case 'refuse':
                return ui.notifications.info(loc('heart.board.reveal-place-first'));
            case 'reveal':
                if (a.scrap) return setScrap(scene, a.scrap.key, { state: a.to });
                if (a.pin) return applyBoardPatch(scene, { pins: { [a.pin.id]: { state: a.to } } });
                // (a string's name tag and its thread come with it)
                return applyBoardPatch(scene, {
                    link: [a.link.id, { state: a.to }],
                    links: Object.fromEntries((a.also?.links ?? []).map((id) => [id, { state: a.to }])),
                    scraps: Object.fromEntries((a.also?.scraps ?? []).map((k) => [k, { state: a.to }])),
                });
            case 'remove':
                this.controls.clear();
                return gm ? removeMany(scene, a.what) : boardEdit(scene, { remove: a.what });
            case 'doodle':
                return this.#doodle(a);
            case 'string': {
                this.drawMarks();
                // (a Ctrl+drag from a pin: tied at once, the kind of the string
                // it came from; double-click it to name it)
                // (a player, not a board's owner: their own string, in a paint)
                const player = !gm && !this.user.owner;
                // (Luke, 2026-10-06: a new string never asks; double-click it to
                // name it or change its kind)
                const answer = { kind: player ? 'path' : a.kind ?? this.#lastKind, label: '', color: a.color ?? (player ? this.#lastColor : null), state: a.state ?? null };
                if (!answer) return this.drawMarks();
                if (player) this.#lastColor = answer.color ?? 0;
                else this.#lastKind = answer.kind;
                // (a shared pin is made first, then the string, then its name:
                // a pin, a name tag, and a thread, ordinary pieces)
                // (each end a pin: one shared, or one made where it was asked for)
                const act = { a: a.a, b: a.b, aPt: a.aPt, bPt: a.bPt, aAt: a.aAt, bAt: a.bAt, aPin: a.aPin, bPin: a.bPin, prep: a.prep };
                if (player) {
                    const res = await boardEdit(scene, { ownString: { act, color: answer.color ?? 0, label: answer.label || undefined } });
                    return this.#carryOn(a, res?.id);
                }
                if (!gm) {
                    const res = await boardEdit(scene, { addString: { act, kind: answer.kind, color: answer.color ?? null, state: answer.state ?? null }, label: answer.label ? { text: answer.label } : undefined });
                    return this.#carryOn(a, res?.id);
                }
                const id = await addString(scene, act, answer.kind, { color: answer.color ?? null, state: answer.state ?? 'known' });
                if (id && answer.label) await labelString(scene, id, answer.label);
                this.#carryOn(a, id);
                return;
            }
            case 'pin':
                return this.#pin(a);
            case 'add': {
                if (!gm) {
                    // a player (a players' board's owners too) writes in their
                    // own hand; the GM in Player view tries the picker
                    if (!game.user.isGM) return playerAddNote(scene, a.at, a.type);
                    const hand = await pickHand({ preview: true });
                    if (!hand) return;
                    const answer = await noteDialog({ hand, type: a.type });
                    if (answer?.text) return addScrap(scene, { type: a.type, x: a.at.x, y: a.at.y, ...this.#noteData(answer), hand });
                    return;
                }
                const answer = await noteDialog({ type: a.type, chooseHand: true, title: a.type === 'scrawl' ? 'heart.board.write-title' : 'heart.board.note-title' });
                if (!answer?.text) return;
                return addScrap(scene, { type: a.type, x: a.at.x, y: a.at.y, ...this.#noteData(answer) });
            }
            case 'edit':
                return editNote(scene, a.key);
            case 'erase': {
                if (a.link) return gm ? removeLink(scene, a.link.id) : boardEdit(scene, { removeLink: a.link.id });
                // (a card: asked first, into the bin)
                if (a.scrap) return this.#takeOff(a.scrap);
                return;
            }
            case 'patch':
                return this.#write(a.patch);
            case 'mark': {
                const stroke = { c: this.markInk, w: Math.min(this.markWidth, markMax(this.renderer.look)), o: this.markOpacity, b: this.markBright, pts: a.pts };
                this.drawMarks();
                // (begun on a card: the card's, in its own frame)
                if (a.on && a.patch) {
                    const st = { ...a.patch.stroke(stroke), by: game.user.id };
                    if (game.user.isGM) return applyBoardPatch(scene, { scraps: { [a.patch.key]: { marks: { [a.patch.id]: st } } } });
                    return boardEdit(scene, { mark: { ...st, on: a.patch.key } });
                }
                return game.user.isGM ? addMark(scene, game.user.id, stroke) : boardEdit(scene, { mark: stroke });
            }
            case 'unmark':
                this.drawMarks();
                return game.user.isGM ? removeMarks(scene, a.strokes) : boardEdit(scene, { unmark: a.strokes });
            case 'open':
                return this.#open(a.scrap);
            case 'inspect':
                return this.#inspect(a.scrap);
            case 'editString': {
                const link = a.link;
                if (link.delve) return (await fromUuid(link.delve))?.sheet?.render(true);
                // its name is its name tag's writing (a note hung from it)
                const player = !gm && !this.user.owner;
                const answer = await stringDialog({ kind: link.kind, label: link.named ?? '', color: link.color ?? null, player });
                if (!answer) return;
                if (player) {
                    await boardEdit(scene, { ownPatch: { link: [link.id, { color: answer.color ?? 0 }] } });
                    if (!link.nameNote && answer.label) await boardEdit(scene, { ownLabel: { id: link.id, text: answer.label } });
                    return;
                }
                const was = link.named ?? '';
                const patch = { link: [link.id, { kind: answer.kind, color: answer.color ?? null }] };
                if (link.nameNote && answer.label && answer.label !== was) patch.scraps = { [link.nameNote]: { text: answer.label } };
                if (!gm) {
                    await boardEdit(scene, { patch, label: !link.nameNote && answer.label ? { id: link.id, text: answer.label } : undefined });
                    if (link.nameNote && !answer.label) return boardEdit(scene, { remove: { scraps: [link.nameNote] } });
                    return;
                }
                await applyBoardPatch(scene, patch);
                if (!link.nameNote && answer.label) return labelString(scene, link.id, answer.label);
                // (no name: the tag comes off, with its thread)
                if (link.nameNote && !answer.label) return removeMany(scene, { scraps: [link.nameNote] });
                return;
            }
            default:
        }
    }

    #lastKind = 'delve';
    // (a player's last paint for their strings)
    #lastColor = 0;

    // a chained string made: on from its end pin while Ctrl is still held
    // (Luke, 2026-10-03), else the chain is over
    #carryOn(a, id) {
        const held = game.keyboard?.isModifierActive?.(KeyboardManager.MODIFIER_KEYS.CONTROL);
        const pin = id ? boardOf(canvas.scene).links?.[id]?.bPin : null;
        if (a.chain && held && pin) this.controls.chainFrom(pin, a.endPt);
        else this.controls.endChain();
        this.drawMarks();
    }

    #onKeyUp = (event) => {
        if (event.key === 'Control' && this.controls.endChain()) this.drawMarks();
    };

    // a note's text and its choices, as a scrap's fields
    #noteData(answer) {
        const data = { text: answer.text };
        if (answer.hand) data.hand = answer.hand;
        if (answer.paper) data.paper = answer.paper;
        if (answer.ink !== null && answer.ink !== undefined) data.ink = answer.ink;
        Object.assign(data, answer.style ?? {});
        if (answer.typed) data.typed = true;
        // (its paint, its paper's turn, its own turn, where its writing sits)
        for (const [k, v] of Object.entries(noteFields(answer, this.renderer.look))) if (v !== null) data[k] = v;
        return data;
    }

    // a new pin: picked from the pins on offer, or (Ctrl+click) the last one
    async #pin(a) {
        let tex = null;
        if (a.quick) {
            try {
                tex = localStorage.getItem(LAST_PIN);
            } catch {
                tex = null;
            }
        }
        tex ||= await pinDialog({ thumb: pinThumb });
        if (!tex) return;
        try {
            localStorage.setItem(LAST_PIN, tex);
        } catch {
            // (a private window: nothing remembered)
        }
        const data = a.on ? { tex, on: a.on, at: a.uv } : { tex, x: a.at.x, y: a.at.y };
        return this.user.isGM ? addPin(canvas.scene, data) : boardEdit(canvas.scene, { addPin: data });
    }

    #nameOf(s) {
        return s.name || this.renderer.look?.library?.[s.lib]?.name || s.text || s.key;
    }

    // The landmark a scrap stands for: a world copy of a book landmark first,
    // else the book's entry, else the GM's own landmark
    async #docOf(s) {
        if (s.uuid) return fromUuid(s.uuid);
        const entry = this.renderer.look?.library?.[s.lib];
        if (!entry?.uuid) return null;
        const world = game.actors?.find((x) => x.type === 'landmark' && (x._stats?.compendiumSource ?? x.flags?.core?.sourceId) === entry.uuid);
        return world ?? fromUuid(entry.uuid);
    }

    async #open(s) {
        (await this.#docOf(s))?.sheet?.render(true);
    }

    // A player opens a known landmark they may see (else its art)
    async #inspect(s) {
        if (s.type !== 'landmark' || s.look !== 'known') return;
        const doc = await this.#docOf(s);
        if (doc?.testUserPermission?.(game.user, 'OBSERVER')) return doc.sheet.render(true);
        if (doc) return showArt(doc);
    }

    /* -------------------------------------------- */
    /*  Dragging and the wheel                      */
    /* -------------------------------------------- */

    _canDragLeftStart() {
        const t = game.activeTool;
        return Boolean(this.isBoard && this.renderer.view && (t === 'move' || t === 'mark' || (t === 'string' && this.controls.editor)));
    }

    _onDragLeftStart(event) {
        const alt = Boolean(event?.altKey) || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
        const kind = this.controls.dragStart(this.#pointOf(event), { ctrl: this.#ctrl(event), shift: this.#shift(event), alt, tool: game.activeTool });
        // (decorations are the editor's to edit)
        if (kind === 'decor') this.controls.cancel();
        this.drawMarks();
    }

    _onDragLeftMove(event) {
        const out = this.controls.dragMove(this.#pointOf(event, 'destination'));
        if (!out) return;
        if (out.marks) return this.drawMarks();
        if (this.renderer.detail.live) this.#show(out);
    }

    async _onDragLeftDrop() {
        const out = this.controls.dragEnd();
        if (!out || out.select) return this.drawMarks();
        if (out.do) return this.#do(out);
        await this.#live;
        return this.#write(out);
    }

    _onDragLeftCancel() {
        this.controls.cancel();
        this.refresh();
    }

    // Ctrl+wheel turns the selection, Shift+wheel sizes it; written once the
    // wheel rests
    _onMouseWheel(event) {
        const patch = this.controls.wheel(event.delta ?? event.deltaY, { ctrl: Boolean(event.ctrlKey || event.metaKey), shift: Boolean(event.shiftKey) });
        if (!patch) return;
        this.#wheelPatch = { scraps: { ...(this.#wheelPatch?.scraps ?? {}) } };
        for (const [k, p] of Object.entries(patch.scraps)) this.#wheelPatch.scraps[k] = { ...(this.#wheelPatch.scraps[k] ?? {}), ...p };
        this.#show(this.#wheelPatch);
        this.#wheelWrite();
    }

    #wheelPatch = null;
    #wheelWrite = foundry.utils.debounce(async () => {
        const patch = this.#wheelPatch;
        this.#wheelPatch = null;
        if (!patch) return;
        await this.#live;
        return this.#write(patch);
    }, 350);

    // An edit written: the GM's at once, a players' board owner's through the
    // GM, a player's moves of their own notes
    #write(patch) {
        const scene = canvas.scene;
        if (game.user.isGM && !this.preview) return applyBoardPatch(scene, patch);
        // (strokes moved: through the relay's own check, for anyone)
        if (patch.marks || Object.values(patch.scraps ?? {}).some((p) => p.marks)) return boardEdit(scene, { remark: { marks: patch.marks ?? {}, scraps: patch.scraps ?? {} } });
        // (a player's own strings and pins: checked there too)
        if (!this.user.owner && (patch.link || Object.keys(patch.links ?? {}).length || Object.keys(patch.newLinks ?? {}).length || Object.keys(patch.pins ?? {}).length)) {
            return boardEdit(scene, { ownPatch: { link: patch.link, links: patch.links ?? {}, newLinks: patch.newLinks ?? {}, pins: patch.pins ?? {} } });
        }
        if (this.user.owner) return boardEdit(scene, { patch });
        const moves = Object.fromEntries(Object.entries(patch.scraps ?? {}).filter(([, p]) => Number.isFinite(p.x)).map(([k, p]) => [k, { x: p.x, y: p.y }]));
        if (Object.keys(moves).length) return playerMove(scene, moves);
    }

    // Repaint the board as an edit under way would leave it: one repaint at
    // a time, the latest state next
    #show(patch) {
        this.#pending = patch;
        if (this.#painting) return (this.#again = true);
        const b = applyPatch(foundry.utils.deepClone(boardOf(canvas.scene)), patch);
        this.#working = b;
        this.#painting = true;
        this.#live = this.renderer.draw(canvas.scene, this.viewer, b).finally(() => {
            this.#painting = false;
            this.drawMarks();
            if (this.#again) {
                this.#again = false;
                this.#show(this.#pending);
            }
        });
    }

    #pending = null;

    /* -------------------------------------------- */
    /*  A picture of the board                      */
    /* -------------------------------------------- */

    // The whole map as this user sees it now (the GM's view, or the
    // players'), at full resolution, downloaded as a PNG
    async saveSnapshot() {
        if (!this.isBoard) return;
        ui.notifications.info(loc('heart.board.snapshot-working'));
        let blob = null;
        try {
            blob = await this.renderer.snapshot(canvas.scene, this.viewer);
        } catch (err) {
            console.error('heart | the map picture could not be painted', err);
        }
        await this.refresh();
        if (!blob) return ui.notifications.warn(loc('heart.board.snapshot-failed'));
        const name = `${canvas.scene.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'heart-map'} (${this.viewer === 'gm' ? 'GM' : loc('heart.board.snapshot-players')}).png`;
        // (Foundry's own save, which its desktop client allows; failing that,
        // the picture in Foundry's image viewer, to save from there)
        try {
            saveDataToFile(blob, 'image/png', name);
        } catch (err) {
            console.warn('heart | the map picture could not be saved', err);
            const url = URL.createObjectURL(blob);
            showImage(url, { title: name });
        }
    }

    /* -------------------------------------------- */
    /*  The marker's palette                        */
    /* -------------------------------------------- */

    // Shown while the Marker is in hand: the sheet's inks and three widths;
    // for the GM, every layer on the board (each to show or hide on this
    // screen, or clear), and Clear every layer
    syncPalette() {
        const on = Boolean(this.active && this.isBoard && game.activeTool === 'mark');
        this.#doodles(on && this.doodlesOpen);
        if (!on || !this.doodlesOpen) this.controls.doodle = null;
        // (the drawing alone is the brush's: it ends when the brush is put
        // down, Luke 2026-10-06)
        if (!on && this.renderer.marksOnly) {
            this.renderer.marksOnly = false;
            this.refresh();
        }
        this.#palette(on);
    }

    #palette(on) {
        let el = document.getElementById('heart-board-palette');
        if (!on) return el?.remove();
        const look = this.renderer.look;
        if (!look) return;
        const fresh = !el;
        if (!el) {
            el = document.createElement('div');
            el.id = 'heart-board-palette';
            el.className = 'heart-board-palette';
            document.body.append(el);
            el.addEventListener('click', (ev) => this.#onPalette(ev));
            el.addEventListener('pointerdown', (ev) => this.#paletteDrag(ev, el));
            el.addEventListener('input', (ev) => {
                if (ev.target.matches('[data-opacity-range]')) {
                    this.markOpacity = Number(ev.target.value) / 100;
                    const out = el.querySelector('[data-opacity-out]');
                    if (out) out.textContent = `${ev.target.value}%`;
                    return;
                }
                if (!ev.target.matches('[data-width-range]')) return;
                this.markWidth = Number(ev.target.value);
                const out = el.querySelector('[data-width-out]');
                if (out) out.textContent = String(this.markWidth);
            });
        }
        const hex = (c) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
        const order = [...PAINT_ORDER.filter((i) => i < look.ink.marker.length), ...look.ink.marker.map((_, i) => i).filter((i) => !PAINT_ORDER.includes(i))];
        // (Luke, 2026-10-03: the toolbar's glass, in plain sections)
        // (Luke, 2026-10-06: named, and as the chosen brightness shows them)
        const nameOf = (i) => PAINT_NAMES[i] ?? `${loc('heart.board.ink')} ${i + 1}`;
        const inks = order.map((i) => `<button type="button" data-ink="${i}" class="ink ${i === this.markInk ? 'on' : ''}" style="--ink:${hex(brushColor(look.ink.marker[i], this.markBright))}" data-tooltip="${esc(nameOf(i))}"></button>`).join('');
        const bright = ['dim', 'as-is', 'bright'].map((k, i) => `<button type="button" data-bright="${i}" class="${this.markBright === i ? 'on' : ''}">${esc(loc(`heart.board.brush-${k}`))}</button>`).join('');
        const w = Math.min(this.markWidth, markMax(look));
        const sliders = `<label class="slide"><span class="lab">${esc(loc('heart.board.mark-width'))}</span><input type="range" min="2" max="${markMax(look)}" step="1" value="${w}" data-width-range><output data-width-out>${w}</output></label>
            <label class="slide"><span class="lab">${esc(loc('heart.board.mark-opacity'))}</span><input type="range" min="5" max="100" step="5" value="${Math.round(this.markOpacity * 100)}" data-opacity-range><output data-opacity-out>${Math.round(this.markOpacity * 100)}%</output></label>`;
        const mode = `<span class="seg">${['draw', 'select'].map((m) => `<button type="button" data-mode="${m}" class="${this.controls.markMode === m ? 'on' : ''}" data-tooltip="${esc(loc(`heart.board.mark-${m}-hint`))}"><i class="fa-solid ${m === 'draw' ? 'fa-paintbrush' : 'fa-arrow-pointer'}"></i> ${esc(loc(`heart.board.mark-${m}`))}</button>`).join('')}</span>`;
        const doodles = `<button type="button" data-doodles class="switch ${this.doodlesOpen ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.doodles-hint'))}"><i class="fa-solid ${this.doodlesOpen ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.doodles'))}</button>`;
        const alone = `<button type="button" data-alone class="switch ${this.renderer.marksOnly ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.mark-alone-hint'))}"><i class="fa-solid ${this.renderer.marksOnly ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.mark-alone'))}</button>`;
        const reset = game.user.isGM && !this.preview ? `<button type="button" data-reset-all class="all"><i class="fa-solid fa-eraser"></i> ${esc(loc('heart.board.brush-reset'))}</button>` : '';
        el.innerHTML = `<div class="sec head" data-grip data-tooltip="${esc(loc('heart.board.brush-drag'))}"><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.mark-palette'))}</b>${mode}</div>
            <div class="sec"><span class="lab">${esc(nameOf(this.markInk))}</span><span class="inks">${inks}</span></div>
            <div class="sec"><span class="lab">${esc(loc('heart.board.brush-light'))}</span><span class="seg">${bright}</span></div>
            <div class="sec">${sliders}</div>
            <div class="sec">${doodles}${alone}${reset}<small>${esc(loc('heart.board.mark-rub'))}</small></div>`;
        // (where this client left it, kept in the window)
        let at = null;
        try {
            at = JSON.parse(localStorage.getItem(PALETTE_AT) ?? 'null');
        } catch {
            at = null;
        }
        if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) placePalette(el, at.x, at.y);
        else if (!fresh && el.style.left) placePalette(el, parseFloat(el.style.left), parseFloat(el.style.top));
    }

    // The doodle palette (Luke, 2026-10-06): down the left, each doodle drawn
    // by the brush in its paint; pick one, then click where it goes (again,
    // or Escape, puts it down); its size below
    #doodles(on) {
        let el = document.getElementById('heart-board-doodles');
        if (!on) return el?.remove();
        const r = this.renderer;
        if (!r.look || !r.painter) return;
        if (!el) {
            el = document.createElement('div');
            el.id = 'heart-board-doodles';
            el.className = 'heart-board-doodles';
            document.body.append(el);
            el.addEventListener('click', (ev) => {
                const b = ev.target.closest('[data-doodle]');
                if (!b) return;
                this.controls.doodle = this.controls.doodle === b.dataset.doodle ? null : b.dataset.doodle;
                if (this.controls.doodle) this.controls.markMode = 'draw';
                this.syncPalette();
            });
            el.addEventListener('input', (ev) => {
                if (!ev.target.matches('[data-dsize]')) return;
                this.doodleSize = Number(ev.target.value);
            });
        }
        const rail = document.getElementById('heart-board-rail')?.getBoundingClientRect();
        el.style.left = `${Math.round((rail?.right ?? 60) + 10)}px`;
        el.style.top = `${Math.round(rail?.top ?? 80)}px`;
        // (its size first, above the doodles, which scroll)
        el.innerHTML = `<label class="size" data-tooltip="${esc(loc('heart.board.doodle-size'))}"><input type="range" min="20" max="160" step="5" value="${this.doodleSize}" data-dsize></label>${DOODLE_KINDS.map((k) => `<button type="button" data-doodle="${k}" class="${this.controls.doodle === k ? 'on' : ''}" data-tooltip="${esc(loc(`heart.board.doodle.${k}`))}"><canvas width="48" height="48"></canvas></button>`).join('')}`;
        // (each drawn as it will be laid down: the brush's paint and brightness)
        for (const b of el.querySelectorAll('[data-doodle]')) {
            const cv = b.querySelector('canvas');
            const g = cv.getContext('2d');
            const strokes = doodleBoard(b.dataset.doodle, `palette:${b.dataset.doodle}`, { x: 24, y: 24, size: 17, c: this.markInk, w: 9, b: this.markBright, o: 1 });
            try {
                for (const st of strokes) r.painter.drawStroke(g, st, `palette:${b.dataset.doodle}`);
            } catch {
                // (a texture not yet loaded: drawn next time)
            }
        }
    }

    // the palette dragged by its head, wherever this client wants it
    #paletteDrag(ev, el) {
        if (!ev.target.closest('[data-grip]') || ev.target.closest('button, input')) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        const dx = ev.clientX - r.left;
        const dy = ev.clientY - r.top;
        const move = (e) => placePalette(el, e.clientX - dx, e.clientY - dy);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            try {
                localStorage.setItem(PALETTE_AT, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
            } catch {
                // (a private window: not remembered)
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    async #onPalette(ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.ink) this.markInk = Number(b.dataset.ink);
        if (b.dataset.bright !== undefined) this.markBright = Number(b.dataset.bright);
        if (b.dataset.mode === 'select') this.controls.doodle = null;
        if (b.dataset.width) this.markWidth = Number(b.dataset.width);
        if (b.dataset.mode) {
            this.controls.markMode = b.dataset.mode;
            this.controls.markSel.clear();
            this.drawMarks();
        }
        if (b.dataset.doodles !== undefined) {
            this.doodlesOpen = !this.doodlesOpen;
            if (!this.doodlesOpen) this.controls.doodle = null;
            this.drawMarks(this.#pointer);
        }
        if (b.dataset.alone !== undefined) {
            this.renderer.marksOnly = !this.renderer.marksOnly;
            await this.refresh();
        }
        if (b.dataset.resetAll !== undefined) {
            const ok = await Dialog.confirm({ title: loc('heart.board.brush-reset'), content: `<p>${esc(loc('heart.board.brush-reset-confirm'))}</p>`, options: heartDialogOptions({ classes: ['heart-board-dialog'] }) });
            if (ok) await clearAllBrushes(canvas.scene);
        }
        this.syncPalette();
    }
}

/* -------------------------------------------- */
/*  Scene controls                              */
/* -------------------------------------------- */

const ICONS = {
    move: 'fa-solid fa-up-down-left-right', reveal: 'fa-solid fa-eye', string: 'fa-solid fa-route', pin: 'fa-solid fa-thumbtack',
    note: 'fa-solid fa-note-sticky', write: 'fa-solid fa-pencil', mark: 'fa-solid fa-highlighter', erase: 'fa-solid fa-eraser',
    inspect: 'fa-solid fa-magnifying-glass',
};

// The Heart Map's tools and buttons for this user (Foundry's scene controls
// and the Heart Map's own toolbar, rail.js, both show these): { tools,
// buttons, list }
// The Heart Map's tools and what each does (the help the tooltips leave out)
function helpDialog(user, tools) {
    const key = (t) => `heart.board.help.${user.isGM || user.owner ? t : `${t}-player`}`;
    const rows = tools.map((t) => {
        const k = game.i18n.has(key(t.name)) ? key(t.name) : `heart.board.help.${t.name}`;
        return `<div class="heart-board-help-row"><i class="${t.icon}"></i><div><b>${esc(t.title)}</b><p>${esc(loc(k))}</p></div></div>`;
    }).join('');
    new Dialog({ title: loc('heart.board.help.title'), content: `<div class="heart-board-help">${rows}</div>`, buttons: { ok: { label: loc('Close') } }, default: 'ok' }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 560 })).render(true);
}

export function boardTools() {
    const gm = game.user.isGM;
    const layer = canvas.heartBoard;
    const scene = canvas.scene;
    const user = layer?.user ?? { id: game.user.id, isGM: gm };
    // (a players' board's owners have the GM's names for the tools they share)
    const tool = (name, extra = {}) => ({ name, icon: ICONS[name] ?? extra.icon, title: loc(`heart.board.tool.${user.isGM || user.owner ? name : `${name}-player`}`), ...extra });
    const button = (name, icon, onClick) => tool(name, { icon, button: true, onClick });
    const preview = { name: 'preview', icon: 'fa-solid fa-user-secret', title: loc('heart.board.tool.preview'), toggle: true, active: Boolean(layer?.preview), onClick: (on) => layer?.setPreview(on) };
    const tools = toolsFor(user).map((t) => tool(t));
    // the players' strings alone (Luke, 2026-10-06), this screen's
    const theirs = { name: 'theirs', icon: 'fa-solid fa-user-pen', title: loc('heart.board.tool.theirs'), toggle: true, active: Boolean(layer?.renderer.playerStringsOnly), onClick: async (on) => { if (!layer) return; layer.renderer.playerStringsOnly = Boolean(on); await layer.refresh(); } };
    // a picture of the map as this user sees it (everyone's)
    const snapshot = { name: 'snapshot', icon: 'fa-solid fa-camera', title: loc('heart.board.tool.snapshot'), button: true, onClick: () => layer?.saveSnapshot() };
    // the tools' long help, in a window of its own (the tooltips are short)
    const help = { name: 'help', icon: 'fa-solid fa-circle-question', title: loc('heart.board.tool.help'), button: true, onClick: () => helpDialog(user, tools) };
    // (each user's own edits; Luke 2026-10-06)
    const undoB = button('undo', 'fa-solid fa-rotate-left', () => layer?.history('undo'));
    const redoB = button('redo', 'fa-solid fa-rotate-right', () => layer?.history('redo'));
    let buttons = [snapshot, undoB, redoB, theirs];
    // Player view: the players' own tools (and the way back)
    if (gm && layer?.preview) buttons = [snapshot, preview, theirs];
    else if (gm) {
        buttons = [
            snapshot,
            preview,
            undoB,
            redoB,
            theirs,
            button('bin', 'fa-solid fa-box-archive', () => binDialog(scene)),
            button('history', 'fa-solid fa-clock-rotate-left', () => backupsDialog(scene)),
            button('export', 'fa-solid fa-file-export', () => exportDialog(exportBoard(scene))),
            button('import', 'fa-solid fa-file-import', async () => {
                const text = await importDialog();
                if (text) await importBoard(scene, text);
            }),
            button('restore', 'fa-solid fa-right-left', async () => {
                if (!hasBackup(scene)) return ui.notifications.info(loc('heart.board.no-backup'));
                const ok = await Dialog.confirm({ title: loc('heart.board.tool.restore'), content: `<p>${esc(loc('heart.board.restore-confirm'))}</p>`, options: heartDialogOptions({ classes: ['heart-board-dialog'] }) });
                if (ok) await restoreBackup(scene);
            }),
            button('reload', 'fa-solid fa-rotate', async () => {
                await reloadBoardLook();
                await layer?.refresh();
                ui.notifications.info(loc('heart.board.reloaded'));
            }),
        ];
    }
    buttons.push(help);
    return { tools, buttons, list: [...tools, ...buttons] };
}

export function boardControls(controls) {
    if (!isBoardScene(canvas?.scene)) return;
    const { tools, list } = boardTools();
    controls.push({
        name: 'heartBoard',
        title: loc('heart.board.control'),
        layer: 'heartBoard',
        icon: 'fa-solid fa-thumbtack',
        visible: true,
        activeTool: tools[0].name,
        tools: list,
    });
}
