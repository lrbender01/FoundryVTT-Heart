// The scrapboard map's table tools (2026-10-02; the fork's CLAUDE.md "The
// Heart map"): a canvas layer with its own scene controls, on a
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
//   Brush    paint on the sheet, under everything pinned to it, or on a card
//            (Shift+drag rubs out); its palette has the paints, the
//            brightness, the width, the opacity, and the doodles
//   Reveal, Note, Write, Erase; Player view (the players' own tools, as they
//   see the board), Undo, Redo, and File (Removed cards, Earlier boards,
//   Export, Import, the backup, a picture, Reload the look: the GM's)
// Players have Look, Move, Note, Write, String, and the Brush, all on their
// own notes, writing, strings, and strokes, in the hand they claimed
// (notes.js). On a players' board its owners have the GM's tools but Reveal.
// The map is drawn by render.js in the primary group; this layer (in the
// interface group) takes the pointer and draws the tools' marks.
import { ScrapboardRenderer } from './render.js';
import { Backdrop } from './backdrop.js';
import { refreshFogAll } from './fog.js';
import { pinThumb } from './paint.js';
import { loadBoardLook, textureUrl } from './look.js';
import { NIBS, NIB_DEFAULTS, nibStyleOf, LINK_KINDS, cardWord, cutPatch, freshStrokeIds, absorbPatch, markMax, brushStroke, doodleBoard, doodlePatch, brushColor, DOODLE_TABS, doodleTabsFor, noteFields, customKey, keysTaken, sharePatch, mayShare, savedDoodleOf, cleanSavedDoodles, isSavedKind, SAVED_MAX, pinChoices, pickFrom, pinPreview, pinTint, pinScale } from './model.js';
import { BoardControls, applyPatch, LOCK_MS, strokeEdges, DOODLE_MIN, DOODLE_MAX, dockAt, snapSide } from './controls.js';
import {
    isBoardScene, boardOf, ownsBoard, addPin, addScrap, removeMarks, clearAllBrushes,
    removeLink, removeMany, applyBoardPatch, labelString, addString, undo, redo, newPlace,
} from './api.js';
import {
    playerAddNote, editNote, noteDialog, pickHand, stringDialog, pinDialog, boardEdit,
    askBoard, paintName, paintOrder, placeDialog, ownCardsOf, freshBase, pinName,
} from './notes.js';
// (the windows' placing and keeping, the previews' painting, and the scene
// controls each their own module since 2026-10-25: windows.js, previews.js,
// tools.js)
import { kept, floating, carried, carryWindows, placeKept, placePalette, writeWindow, shutButton, PALETTE_AT, DOODLES_AT, STRING_AT, PINWIN_AT, ERASEWIN_AT } from './windows.js';
import { SELECTED, layPasses, PASS_BLENDS, doodleBake, stringGhost, dashed, handleGlyph } from './previews.js';
import { heartDialogOptions } from '../../common/dialog.js';
import { sendLive, onLive } from '../../common/relay.js';
import { LiveSender, livePeer, livePeerAfterUpdate, livePeerAt, liveShows, landingOf, landedOn } from './live.js';
import { boardCounts, boardBytes, liveCounts } from './stats.js';
import { showArt, showImage } from '../../common/art.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));
// a selected pin or piece: a small orange dot where the grab dot would be
const PICKED = 0xf08a24;
const LAST_PIN = 'heart.board.lastPin';
// (Luke, 2026-10-25) the brush window's view (full, the paints alone, its
// head alone); the doodles window's place (none: by the brush's), size, and
// view; the String window's place, width, view, and the pin a string's ends are
const PALETTE_VIEW = 'heartBoard.paletteView';
// (sizes kept only when set by hand by the window's corner: Luke 2026-10-25;
// new keys, so a size kept by itself before is let go)
const DOODLES_SIZE = 'heartBoard.doodlesSized';
// (the doodles window's tab: places, signs, or yours; Luke 2026-10-25)
const DOODLE_TAB = 'heartBoard.doodleTab';
const DOODLES_VIEW = 'heartBoard.doodlesView';
const STRING_VIEW = 'heartBoard.stringView';
const STRING_PIN = 'heartBoard.stringPin';
// (Luke, 2026-10-25) the brush window's size; whether the doodles window is
// open (its switch on the brush window); the String window's size; the Pin
// window's place, size, and view
const PALETTE_SIZE = 'heartBoard.paletteSized';
const DOODLES_OPEN = 'heartBoard.doodlesOpen';
// (the side of the brush window the doodles window is snapped to)
const DOODLES_DOCK = 'heartBoard.doodlesDock';
// (a new string's pins in its colour, or their own)
const STRING_TINT = 'heartBoard.stringPinTint';
const STRING_SIZE = 'heartBoard.stringSized';
const PINWIN_SIZE = 'heartBoard.pinSized';
const PINWIN_VIEW = 'heartBoard.pinView';
// (Luke, 2026-10-25) the eraser's size (screen px) and mode ('parts' or
// 'whole'), shared by the Erase window and the brush window's rub-out row;
// the Erase window's place, size, and view
const ERASE_SIZE = 'heartBoard.eraseSize';
const ERASE_MODE = 'heartBoard.eraseMode';
const ERASEWIN_SIZE = 'heartBoard.eraseWinSized';
// (the brush's own eraser mode for Shift+drag: Parts to start)
const BRUSH_ERASE_MODE = 'heartBoard.brushEraseMode';
// (the brush's nib, 'pen' or 'brush', once picked: Luke 2026-10-25; none,
// the style's own)
const MARK_NIB = 'heartBoard.markNib';
// (whether the wash fills the shape a stroke closes: Luke 2026-10-25)
const MARK_FILL = 'heartBoard.markFill';
// (each nib's own width and opacity, this client's: Luke 2026-10-25)
const NIB_STYLE = 'heartBoard.nibStyle';
// (the nibs and their starting widths and opacities: model.js NIBS,
// NIB_DEFAULTS, the editor's too)
// (the Pin window's paint for a new pin: none, its own colour)
const PIN_PAINT = 'heartBoard.pinPaint';
const ERASEWIN_VIEW = 'heartBoard.eraseView';
const ERASE_MIN = 4;
const ERASE_MAX = 80;
// (the degree sign, written as its code)
const DEG_SIGN = String.fromCharCode(176);

// what the layer offers Foundry as its hovered object while the selection
// takes the wheel: truthy, with a document that has no elevation
const WHEEL_TARGET = Object.freeze({ document: Object.freeze({ schema: Object.freeze({ has: () => false }) }) });
export class ScrapboardLayer extends InteractionLayer {
    static get layerOptions() {
        // (rotatableObjects: Foundry hands Ctrl+wheel and Shift+wheel to this
        // layer while it has a target, the selection)
        return foundry.utils.mergeObject(super.layerOptions, { name: 'heartBoard', zIndex: 260, rotatableObjects: true, controllableObjects: false });
    }

    constructor(...args) {
        super(...args);
        // The pointer, heard on the layer itself: PIXI tells every interactive
        // object of every move, and Foundry makes the layer interactive while
        // it is active, so this hears exactly then. Never on canvas.stage,
        // which is Foundry's: each scene drawn activates the layer last in
        // hand, then clears the stage's listeners (Canvas #addListeners), and
        // a listener added there by _activate was lost until the layer was
        // put down and taken up again (Luke 2026-10-25: the doodle's ghost,
        // the eraser's ring, and the reticle gone after a scene change)
        this.on('globalpointermove', this.#onHover);
    }

    renderer = new ScrapboardRenderer();
    // a baked map under the board (backdrop.js; Luke 2026-10-25)
    backdrop = new Backdrop(this.renderer);
    // the GM sees the map as players do, with their tools (Player view)
    preview = false;
    // the brush's paint (an index into the look's marker paints) and width
    markInk = 0;
    // (each nib its own width and opacity, this client's: the pen fine and
    // solid, the brush 8 at 85%, the wash broad and thin; Luke 2026-10-25)
    // (a wash still at the first default, 45%, takes the new one)
    #nibStyle = nibStyleOf(kept.get(NIB_STYLE));
    get markWidth() {
        return Number(this.#nibStyle[this.nib]?.w) || NIB_DEFAULTS[this.nib].w;
    }

    set markWidth(v) {
        this.#nibStyle = { ...this.#nibStyle, [this.nib]: { ...this.#nibStyle[this.nib], w: Number(v) } };
        kept.set(NIB_STYLE, this.#nibStyle);
    }

    get markOpacity() {
        return Number(this.#nibStyle[this.nib]?.o) || NIB_DEFAULTS[this.nib].o;
    }

    set markOpacity(v) {
        this.#nibStyle = { ...this.#nibStyle, [this.nib]: { ...this.#nibStyle[this.nib], o: Number(v) } };
        kept.set(NIB_STYLE, this.#nibStyle);
    }
    // (Luke, 2026-10-06: its brightness, 0 dim, 1 as it is, 2 bright)
    markBright = 1;
    markNib = NIBS.includes(kept.get(MARK_NIB)) ? kept.get(MARK_NIB) : null;
    // (Luke, 2026-10-25: the eraser's size in screen px, and what it takes)
    eraseSize = Math.max(ERASE_MIN, Math.min(ERASE_MAX, Number(kept.get(ERASE_SIZE)) || 14));
    eraseMode = kept.get(ERASE_MODE) === 'whole' ? 'whole' : 'parts';
    brushEraseMode = kept.get(BRUSH_ERASE_MODE) === 'whole' ? 'whole' : 'parts';
    controls = new BoardControls({
        view: () => this.renderer.view,
        look: () => this.renderer.look,
        painter: () => this.renderer.painter,
        size: (id) => this.renderer.size(id),
        user: () => this.user,
        // (the brush in hand, for the stroke the controls lay down)
        brush: () => this.brush,
        // (the eraser in hand: its size and mode)
        // (the brush's Shift+drag its own mode: Luke 2026-10-25)
        eraser: () => ({ size: this.eraseSize, mode: game.activeTool === 'mark' ? this.brushEraseMode : this.eraseMode }),
        px: () => 1 / Math.max(0.02, this.renderer.scale * (canvas.stage?.scale.x ?? 1)),
        // (the reticle's captions in this language: heart.board.caption.*)
        say: (id) => (game.i18n.has(`heart.board.caption.${id}`) ? loc(`heart.board.caption.${id}`) : null),
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

    // off a board the Token layer takes this layer's place: the layer is on
    // every scene, its control only on boards, and Foundry draws the next
    // scene with the layer last in hand. Activated where it has no control,
    // Foundry's controls threw mid-draw and the canvas never finished loading
    // (board, other scene, board: "You cannot switch Scenes until resources
    // finish loading"; Luke, 2026-10-23)
    activate(options) {
        if (!this.isBoard) return canvas.tokens?.activate() ?? this;
        return super.activate(options);
    }

    // who the controls act for: the GM in Player view is a player
    // the brush in hand: its paint, width, opacity, and brightness
    get brush() {
        return { c: this.markInk, w: this.markWidth, o: this.markOpacity, b: this.markBright, n: this.nib, fill: this.#filling() };
    }

    // (the wash filling the shape a stroke closes: Luke 2026-10-25, polygon
    // washes; its switch on the brush window, shown with the wash)
    markFill = kept.get(MARK_FILL) === true;
    #filling() {
        return this.nib === 'wash' && this.markFill;
    }

    // the nib a new stroke takes: the one picked, else the style's
    get nib() {
        const n = this.markNib ?? this.renderer?.look?.nib ?? 'brush';
        return NIBS.includes(n) ? n : 'brush';
    }

    get user() {
        const u = game.user;
        if (u.isGM && this.preview) return { id: u.id, isGM: false, owner: false };
        return { id: u.id, isGM: u.isGM, owner: !u.isGM && ownsBoard(canvas.scene, u.id) };
    }

    get viewer() {
        return game.user.isGM && !this.preview ? 'gm' : 'player';
    }

    // Foundry's wheel target: the selection. A stand-in placeable, not
    // `true`: Foundry's hover fade reads activeLayer.hover.document.schema on
    // every mouse move, and `true` threw there while anything was selected
    // (thousands of "reading 'schema'" errors; Luke, 2026-10-23)
    get hover() {
        // (the eraser in hand: Ctrl+wheel sizes it, never zooms; Luke 2026-10-25)
        if (game.activeTool === 'erase' && this.isBoard) return WHEEL_TARGET;
        // (the brush with Shift held: its eraser, sized by Ctrl+wheel too)
        if (game.activeTool === 'mark' && this.isBoard && this.#erasing()) return WHEEL_TARGET;
        return this.controls.wantsWheel({ ctrl: true }) ? WHEEL_TARGET : null;
    }

    async _draw(options) {
        await super._draw(options);
        // (what everyone else is doing, under this user's own: Luke 2026-10-25)
        this.#liveC = this.addChild(new PIXI.Container());
        this.#peers.clear();
        onLive((msg, from) => this.#onLive(msg, from));
        clearInterval(this.#liveTimer);
        this.#liveTimer = setInterval(() => this.#livePrune(), 500);
        // This user's own: everything that follows the pointer or shows what
        // the tool in hand will do, in one container drawn last, made here in
        // the order it is drawn and never added to later (Luke, 2026-10-25:
        // "cursor effects always need to be drawn last")
        const top = this.addChild(new PIXI.Container());
        const sprite = () => {
            const sp = top.addChild(new PIXI.Sprite(PIXI.Texture.EMPTY));
            sp.visible = false;
            return sp;
        };
        // a stroke or doodle just laid, held until the board shows it
        this.#landingC = top.addChild(new PIXI.Container());
        // the stroke being drawn, in the brush's three passes, kept to the
        // card it began on by its mask
        this.#strokeSprites = [0, 1, 2].map(sprite);
        this.#strokeMask = top.addChild(new PIXI.Graphics());
        this.#strokeBuilt = null;
        // the doodle in hand, painted as it will be laid, in the same passes
        this.#ghosts = [0, 1, 2].map(sprite);
        this.#ghostKey = '';
        // the pin the Pin tool would put in, and the string being tied
        this.#pinGhost = sprite();
        this.#pinGhostKey = '';
        this.#stringSprite = sprite();
        this.#stringKey = '';
        // (what the eraser will take, while it is dragged: painted solid in a
        // canvas of its own and shown see-through as one, so it never darkens
        // where it crosses itself; Luke 2026-10-25, PIXI's own wide lines
        // came out as faint outlines)
        this.#band = sprite();
        this.#band.alpha = 0.32;
        // the tools' marks: outlines, handles, rings, the reticle
        this.#overlay = top.addChild(new PIXI.Graphics());
        this.controls.clear();
        this.controls.from = null;
    }

    #band = null;
    #landingC = null;

    // The eraser's tint (board px shapes into one canvas, shown as one
    // see-through sprite): a canvas the size of the view at half the screen's
    // resolution, kept and drawn again each move, made anew only when the
    // view's size changes (Luke, 2026-10-25: a canvas the size of the whole
    // path, made each move, ran to 4096 px square on a long scrub; the tint
    // is a faint flat band, the ring over it stays sharp)
    #tintCanvas = null;
    #drawEraseTint(sweep, strokes = []) {
        const sp = this.#band;
        if (!sp || sp.destroyed) return;
        const r = this.renderer;
        const runs = [];
        if (sweep?.pts?.length >= 2) runs.push({ pts: sweep.pts, w: sweep.r * 2 });
        for (const st of strokes ?? []) if (st?.pts?.length >= 2) runs.push({ pts: st.pts, w: st.w + 8 / Math.max(0.05, r.scale * (canvas.stage?.scale.x ?? 1)) });
        if (!runs.length) {
            sp.visible = false;
            return;
        }
        const scr = canvas.app.renderer.screen;
        const tl = r.toMap(canvas.stage.toLocal(new PIXI.Point(0, 0)));
        const br = r.toMap(canvas.stage.toLocal(new PIXI.Point(scr.width, scr.height)));
        const W = Math.max(1, Math.ceil(scr.width / 2));
        const H = Math.max(1, Math.ceil(scr.height / 2));
        const res = W / Math.max(1e-6, br.x - tl.x);
        let c = this.#tintCanvas;
        const fresh = !c || c.width !== W || c.height !== H || sp.texture === PIXI.Texture.EMPTY;
        if (fresh) {
            c = this.#tintCanvas = document.createElement('canvas');
            c.width = W;
            c.height = H;
        }
        const g = c.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, W, H);
        g.setTransform(res, 0, 0, res, -tl.x * res, -tl.y * res);
        g.strokeStyle = `#${SELECTED.toString(16).padStart(6, '0')}`;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const u of runs) {
            g.lineWidth = u.w;
            g.beginPath();
            g.moveTo(u.pts[0], u.pts[1]);
            if (u.pts.length < 4) g.lineTo(u.pts[0] + 0.01, u.pts[1]);
            for (let i = 2; i < u.pts.length; i += 2) g.lineTo(u.pts[i], u.pts[i + 1]);
            g.stroke();
        }
        if (fresh) {
            const old = sp.texture;
            sp.texture = PIXI.Texture.from(c);
            if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
        } else sp.texture.baseTexture.update();
        const a = r.toCanvas(tl);
        sp.position.set(a.x, a.y);
        sp.width = (br.x - tl.x) * r.scale;
        sp.height = (br.y - tl.y) * r.scale;
        sp.visible = true;
    }

    async _tearDown(options) {
        this.renderer.clear();
        this.backdrop.clear();
        // (every picture this user's marks were showing let go with the
        // scene, the reticle's timer, and a place waiting for its click
        // forgotten: Luke, 2026-10-21)
        this.#landed(null);
        const sprites = [...this.#strokeSprites, ...this.#ghosts, this.#pinGhost, this.#stringSprite, this.#band];
        const held = new Set(sprites.map((sp) => sp?.texture).filter((t) => t && t !== PIXI.Texture.EMPTY && t.baseTexture));
        for (const sp of sprites) if (sp && !sp.destroyed) sp.texture = PIXI.Texture.EMPTY;
        for (const t of held) t.destroy(true);
        this.#ghosts = [];
        this.#ghostKey = '';
        this.#ghostPasses = null;
        this.#pinGhost = null;
        this.#pinGhostKey = '';
        this.#stringSprite = null;
        this.#stringKey = '';
        this.#band = null;
        this.#tintCanvas = null;
        this.#landingC = null;
        clearTimeout(this.#lockTimer);
        this.#placing = null;
        this.#wheelPatch = null;
        this.#overlay = null;
        clearInterval(this.#liveTimer);
        this.#liveTimer = 0;
        // (and every other timer of the live previews, what was being sent,
        // and the edit under way: Luke 2026-10-25, they reached the next scene)
        clearTimeout(this.#liveRepaint);
        this.#liveRepaint = 0;
        cancelAnimationFrame(this.#liveFrame);
        this.#liveFrame = 0;
        this.#sender.drop();
        this.#working = null;
        this.#pending = null;
        this.#again = false;
        this.#peers.clear();
        this.#liveDrop();
        this.#liveC = null;
        this.#strokeSprites = [];
        this.#strokeMask = null;
        this.#strokeBuilt = null;
        this.controls.clear();
        // (a drag the scene was left in the middle of let go: it held every
        // preview that follows the pointer away; Luke 2026-10-25)
        this.controls.cancel();
        // (and picking strokes, with the brush's windows)
        if (this.#picking) {
            this.#picking = false;
            if (canvas.app?.view) canvas.app.view.style.cursor = '';
        }
        this.#windows(false);
        this.#caption(null);
        return super._tearDown(options);
    }

    _activate() {
        canvas.app?.view?.addEventListener('pointerleave', this.#onLeave);
        window.addEventListener('keydown', this.#onKey);
        window.addEventListener('keyup', this.#onKeyUp);
        this.syncPalette();
    }

    _deactivate() {
        canvas.app?.view?.removeEventListener('pointerleave', this.#onLeave);
        this.#over = false;
        window.removeEventListener('keydown', this.#onKey);
        window.removeEventListener('keyup', this.#onKeyUp);
        this.controls.from = null;
        this.controls.grab = null;
        this.controls.cancel();
        this.drawMarks();
        this.#windows(false);
        this.#caption(null);
    }

    // the grab reticle (and a new string's line) follow the pointer; the
    // reticle's ring shows once it has held a moment
    #onHover = (event) => {
        // (a drag whose button is already up is over, whatever missed its
        // end, as a button let go outside the window: let go of it. Never
        // on a move Foundry makes up itself, which says no button is down:
        // a token moved or the view panned mid-stroke cut the stroke short;
        // Luke 2026-10-25)
        if (this.controls.drag && (event.buttons ?? 1) === 0 && event.nativeEvent?.isTrusted !== false) {
            this.controls.cancel();
            this.#sender.end();
        }
        if (!this.active || !this.isBoard || !this.renderer.view || this.controls.drag) return;
        // (a right-drag pans: nothing under the pointer said while it does;
        // Luke 2026-10-25, a stroke's "whose" stuck through the pan)
        if ((event.buttons ?? 0) & 2) return this.panned();
        if (typeof event.shiftKey === 'boolean') this.#shiftHeld = event.shiftKey;
        const pt = this.renderer.toMap(event.getLocalPosition(canvas.stage));
        this.#pointer = pt;
        this.#over = true;
        // (and the doodle in hand, a ghost where a click lays it)
        this.#mouse = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
        this.#sendHover(pt);
        if (this.controls.hover(pt, game.activeTool) || this.controls.from || this.#layingDoodle() || game.activeTool === 'pin' || this.#erasing()) {
            this.drawMarks(pt);
            clearTimeout(this.#lockTimer);
            if (this.controls.grab) this.#lockTimer = setTimeout(() => this.drawMarks(), LOCK_MS + 15);
            // (whose the thing under the pointer is, once it rests there)
            else if (this.controls.over) this.#lockTimer = setTimeout(() => this.drawMarks(), BoardControls.OWNER_MS + 15);
        } else if (this.#captionText) this.#caption(this.#captionText);
    };

    #mouse = null;

    // the pointer off the board (over a window): the eraser's ring and the
    // doodle's ghost go with it
    #onLeave = () => {
        if (!this.#over) return;
        this.#over = false;
        // (a string half tied, put down for everyone else too)
        this.#sender.idle();
        this.drawMarks();
    };

    // Where the pointer is now (board px), while it is over the board: read
    // from Foundry's own pointer, so a pan or zoom under a still pointer
    // keeps what follows it under it (Luke 2026-10-25: the eraser's ring
    // flickered through a right-drag pan)
    #over = false;
    #here() {
        if (!this.active || !this.#over) return null;
        try {
            const p = canvas.app?.renderer?.events?.pointer;
            if (p) return this.renderer.toMap(p.getLocalPosition(canvas.stage));
        } catch {
            // (the last pointer heard, below)
        }
        return this.#pointer;
    }

    // the board panned or zoomed: what the pointer rested on let go, its
    // caption gone, until the pointer moves again
    panned() {
        clearTimeout(this.#lockTimer);
        if (this.controls.panned() || this.#captionText) {
            this.#caption(null);
            this.drawMarks();
        }
    }

    // the eraser in hand: the Erase tool, or the brush with Shift held (and
    // no doodle in hand)
    #erasing() {
        const t = game.activeTool;
        if (t === 'erase') return true;
        return t === 'mark' && !this.controls.doodle && this.#shiftHeld;
    }

    // Shift held, as this layer last heard it (its keys, and each pointer
    // move: Luke 2026-10-25, Foundry's own count of the keys missed it)
    #shiftHeld = false;

    // a string half tied, sent to everyone else; else that it is put down
    // (Luke, 2026-10-25; the doodle in hand no longer, the same day: every
    // client painted its ghost again at every move)
    #sendHover(pt) {
        if (this.controls.from) {
            const m = this.controls.marks({ pointer: pt });
            if (m.line) return this.#sender.string({ from: m.line[0], to: m.line[1], ...this.#stringSpec() });
        }
        this.#sender.idle();
    }

    // A few words by the reticle once it has caught something (what a press
    // does on it); this client's, out of the way of the pointer
    #captionText = null;
    #caption(text) {
        this.#captionText = text || null;
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
        if (event.key === 'Shift' && !this.#shiftHeld) {
            this.#shiftHeld = true;
            if (this.active && game.activeTool === 'mark') this.drawMarks();
        }
        // (Escape: a new place waiting for its click isn't put on the board)
        if (event.key === 'Escape' && this.#placing && this.active) {
            this.#placing = null;
            return ui.notifications.info(loc('heart.board.place-cancelled'));
        }
        // (R mirrors the doodle in hand, its turn kept: Luke 2026-10-25)
        if ((event.key === 'r' || event.key === 'R') && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && this.controls.doodle && this.active && game.activeTool === 'mark' && !event.target?.closest?.('input, textarea, select, [contenteditable]')) {
            event.preventDefault();
            event.stopPropagation();
            this.controls.doodleFlip = !this.controls.doodleFlip;
            this.#doodleInputs();
            return this.drawMarks();
        }
        // (Escape puts the doodle in hand down)
        if (event.key === 'Escape' && this.controls.doodle && this.active) {
            this.#lastDoodle = this.controls.doodle;
            this.controls.doodle = null;
            this.drawMarks();
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
            // (a player: their own strings and pins, Luke 2026-10-03; their
            // own notes and writing too, once asked, into the bin, 2026-10-21)
            if (!['Delete', 'Backspace'].includes(event.key) || event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
            // (a piece of a note of theirs, or a public one, selected alone:
            // that piece comes off; Luke 2026-10-24)
            const piece = this.controls.pieceOut();
            if (piece) {
                event.preventDefault();
                this.drawMarks();
                return this.#write(piece);
            }
            const what = this.controls.removal();
            if (!what.links.length && !what.pins.length && !what.cards.length && !what.strokes?.length) return;
            event.preventDefault();
            // (the selected strokes, at once: Luke 2026-10-24)
            if (what.strokes?.length) {
                this.controls.markSel.clear();
                this.drawMarks();
                boardEdit(canvas.scene, { unmark: what.strokes });
            }
            if (what.links.length || what.pins.length) {
                for (const id of what.pins) this.controls.pins.delete(id);
                for (const id of what.links) this.controls.links.delete(id);
                this.controls.link = null;
                this.drawMarks();
                boardEdit(canvas.scene, { ownRemove: { links: what.links, pins: what.pins } });
                this.#saidGone(what);
            }
            const cards = (this.renderer.view?.scraps ?? []).filter((x) => what.cards.includes(x.key));
            if (cards.length) return this.#takeOff(cards);
            return;
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
        // (the selected strokes, at once: Luke 2026-10-24)
        if (what.strokes?.length) {
            this.controls.markSel.clear();
            this.drawMarks();
            if (this.user.isGM) removeMarks(canvas.scene, what.strokes);
            else boardEdit(canvas.scene, { unmark: what.strokes });
        }
        if (what.pins.length || what.links.length) {
            for (const id of [...what.pins]) this.controls.pins.delete(id);
            for (const id of [...what.links]) this.controls.links.delete(id);
            this.controls.link = null;
            this.drawMarks();
            if (this.user.isGM) removeMany(canvas.scene, gone);
            else boardEdit(canvas.scene, { remove: gone });
            this.#saidGone(what);
        }
        const cards = (this.renderer.view?.scraps ?? []).filter((x) => what.cards.includes(x.key));
        if (cards.length) return this.#takeOff(cards);
    };

    // Strings and pins go at once with Delete (Luke, 2026-10-06), and say so,
    // with the way back (2026-10-25, the map safety fixes)
    #saidGone(what) {
        const n = (what.links?.length ?? 0) + (what.pins?.length ?? 0);
        if (n) ui.notifications.info(loc('heart.board.strings-deleted', { n }));
    }

    // Undo or redo this user's own last edit on the board (Ctrl+Z, Ctrl+Y,
    // Ctrl+Shift+Z; Luke 2026-10-06). False when the board isn't in hand.
    async history(dir) {
        if (!this.active || !this.isBoard) return false;
        this.controls.cancel();
        await (dir === 'redo' ? redo(canvas.scene) : undo(canvas.scene));
        return true;
    }

    // Cards off the board, into the bin, once asked
    // (a player's own notes and writing too, Luke 2026-10-21: through the
    // relay, refused if anything going with them is someone else's)
    async #takeOff(list) {
        const cards = [].concat(list);
        if (!cards.length) return;
        const keys = cards.map((c) => c.key);
        const own = !this.controls.editor;
        if (own && !ownCardsOf(boardOf(canvas.scene), keys, this.user)) return ui.notifications.warn(loc('heart.board.not-yours-tied'));
        const one = cards.length === 1;
        // (Luke, 2026-10-25: it says what it deletes, "Delete note")
        const what = (c) => loc(`heart.board.delete-what.${cardWord(c.type)}`);
        const ok = await askBoard({
            title: one ? loc('heart.board.delete-one', { what: what(cards[0]) }) : loc('heart.board.delete-n', { n: cards.length }),
            content: one ? loc(own ? 'heart.board.erase-scrap-player' : 'heart.board.erase-scrap', { name: this.#nameOf(cards[0]) }) : loc(own ? 'heart.board.erase-cards-player' : 'heart.board.erase-cards', { n: cards.length }),
            yes: one ? loc('heart.board.delete-one', { what: what(cards[0]) }) : loc('heart.board.ask.delete-them'),
            no: loc(one ? 'heart.board.ask.keep-it' : 'heart.board.ask.keep-them'),
        });
        if (!ok) return;
        this.controls.clear();
        this.drawMarks();
        if (own) return boardEdit(canvas.scene, { ownCards: keys });
        if (game.user.isGM) return removeMany(canvas.scene, { scraps: keys, pins: [], links: [] });
        return boardEdit(canvas.scene, { remove: { scraps: keys, pins: [], links: [] } });
    }

    /* -------------------------------------------- */
    /*  A new place, a reshuffle                    */
    /* -------------------------------------------- */

    // File, New place (Luke, 2026-10-21: places invented at the table): its
    // card at the middle of the view, or where the GM clicks next (Escape
    // lets it go)
    async newPlace() {
        if (!game.user.isGM || !this.isBoard) return;
        const answer = await placeDialog();
        if (!answer) return;
        if (answer.where === 'click') {
            this.#placing = answer;
            return ui.notifications.info(loc('heart.board.place-click-now', { name: answer.name }));
        }
        return this.#putPlace(answer, this.renderer.toMap({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }));
    }

    #placing = null;

    async #putPlace(answer, at) {
        const made = await newPlace(canvas.scene, { name: answer.name, img: answer.img, state: answer.state, at });
        if (!made) return;
        ui.notifications.info(loc(answer.state === 'known' ? 'heart.board.place-made' : 'heart.board.placed', { name: made.actor.name }));
    }

    // Shift+R, or File, Reshuffle (Luke, 2026-10-21): the selected cards put
    // together afresh, one edit Undo takes back. False when the board isn't
    // in hand (the key is then Foundry's).
    reshuffle() {
        if (!this.active || !this.isBoard || !game.user.isGM || this.preview) return false;
        const patch = this.controls.reshuffle();
        if (!patch) {
            ui.notifications.info(loc('heart.board.reshuffle-none'));
            return true;
        }
        this.#write(patch);
        return true;
    }

    // A doodle laid down where the brush's doodle palette's one in hand was
    // clicked (Luke, 2026-10-06): on the card under it (its own strokes,
    // kept to it) or the sheet, in the brush's paint, brightness, width, and
    // opacity; strokes of whoever placed it
    #doodle(a) {
        const r = this.renderer;
        if (!r.look) return;
        // (model.js doodlePatch: the editor's own copy too)
        // (at the doodles window's size and turn; a drawing of this user's
        // own as it was drawn: Luke 2026-10-25)
        const brush = { size: a.size ?? this.controls.doodleSize, c: this.markInk, w: this.markWidth, b: this.markBright, o: this.markOpacity };
        const saved = this.#savedOf(a.kind);
        if (isSavedKind(a.kind) && !saved) return;
        const patch = doodlePatch(boardOf(canvas.scene), r.view, { ...a, saved }, brush, r.look, game.user.id);
        // (shown where it was laid until the board shows it: Luke 2026-10-25)
        this.#landGhost(a.at, patch);
        // (its ids picked when the write's turn comes: two quick doodles, both kept)
        if (game.user.isGM && !this.preview) return applyBoardPatch(canvas.scene, (board) => freshStrokeIds(board, patch));
        // (what was laid, the GM working out its strokes and ids on the board
        // as it is: Luke 2026-10-25, ids picked here from a board behind the
        // GM's overwrote strokes already there)
        return boardEdit(canvas.scene, { doodle: { a: { kind: a.kind, seed: a.seed, at: a.at, on: a.on ?? null, rot: a.rot ?? 0, flip: Boolean(a.flip), ...(saved ? { saved } : {}) }, brush } });
    }

    // the doodle last in hand, picked up again when the doodles window is
    // pressed (Luke, 2026-10-25: whichever window was last pressed is in hand)
    #lastDoodle = null;

    #layingDoodle() {
        return game.activeTool === 'mark' && Boolean(this.controls.doodle);
    }

    async refresh() {
        // (never mid-load: canvasReady draws it once the canvas is up)
        if (!canvas.ready || !canvas.scene) return;
        if (!this.isBoard) {
            this.backdrop.clear();
            return this.renderer.clear();
        }
        // (its baked background, when it has one: the map under the board;
        // Luke 2026-10-25, the Village of Plenty)
        this.backdrop.sync(canvas.scene).catch((err) => console.warn('heart | the baked map could not be drawn', err));
        this.#working = null;
        this.#pending = null;
        // (what others let go of is on the board now; what they still drag
        // painted in: Luke 2026-10-25)
        for (const [id, p] of this.#peers) this.#peers.set(id, livePeerAfterUpdate(p));
        const board = boardOf(canvas.scene);
        const peers = this.#withPeers(board);
        const view = await this.renderer.draw(canvas.scene, this.viewer, peers === board ? undefined : peers);
        // (what this user just laid, held until a board painted shows it)
        if (view) this.#landed(board);
        this.#liveDraw();
        this.controls.prune();
        this.drawMarks();
        this.syncPalette();
    }

    queueRefresh = foundry.utils.debounce(() => this.refresh(), 60);

    // a new detail level: everything painted again
    reset() {
        this.renderer.reset();
        // (a baked map's memory follows the detail: made again)
        this.backdrop.clear();
        return this.refresh();
    }

    async setPreview(on) {
        this.preview = Boolean(on);
        this.controls.clear();
        this.controls.from = null;
        await this.refresh();
        // (the NPC fog as the players see it, or gone again: Luke 2026-10-26)
        refreshFogAll();
        // (the players' tools, or the GM's again)
        ui.controls?.initialize({ control: 'heartBoard', tool: 'inspect' });
    }

    // a press held still half a second: Foundry's ping there, for everyone
    #holdToPing(event) {
        if (!game.user.hasPermission?.('PING_CANVAS')) return;
        const origin = event.getLocalPosition?.(canvas.stage) ?? event.interactionData?.origin;
        const x0 = event.clientX ?? event.global?.x ?? 0;
        const y0 = event.clientY ?? event.global?.y ?? 0;
        if (!origin) return;
        const at = { x: origin.x, y: origin.y };
        let timer = 0;
        const stop = () => {
            clearTimeout(timer);
            window.removeEventListener('pointermove', moved);
            window.removeEventListener('pointerup', stop);
        };
        const moved = (e) => {
            if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6) stop();
        };
        window.addEventListener('pointermove', moved);
        window.addEventListener('pointerup', stop);
        timer = setTimeout(() => {
            stop();
            canvas.ping?.(at);
        }, 500);
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
        // (a redraw for something else keeps what follows the pointer: the
        // eraser's ring, the doodle's ghost, a string's line; Luke 2026-10-25,
        // each repaint of the board had wiped them till the pointer moved)
        pointer ??= this.#here();
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
        // (the string being tied hidden until drawn again below)
        if (this.#stringShown && this.#stringSprite && !this.#stringSprite.destroyed) this.#stringSprite.visible = false;
        this.#stringShown = false;
        // (a Ctrl chain too: its next string's line follows the pointer, Luke 2026-10-06)
        const eraser = this.#erasing();
        const m = this.controls.marks({ pointer: game.activeTool === 'string' || this.controls.chaining || this.#layingDoodle() || eraser ? pointer : null, eraser });
        // (the drawing alone: only the marker's own marks)
        // (its box and handles stay while the brush is in hand: Luke 2026-10-06,
        // the select box never showed)
        if (r.marksOnly) Object.assign(m, { hulls: [], link: null, strings: [], pins: [], from: null, fromPt: null, line: null, parts: [], partBox: null, grab: null, caption: null, join: null, ...(game.activeTool === 'mark' ? {} : { handle: null, rotor: null, box: null, hot: null }) });
        // (what a press would take, this user's to change: the selection's red,
        // fainter and thinner, solid on their own, dashed on public; Luke
        // 2026-10-24)
        if (m.hot) {
            // (a stroke outlined round it, never over it: Luke 2026-10-24)
            const pts = m.hot.hull ? [...m.hot.hull, m.hot.hull[0], m.hot.hull[1]] : m.hot.stroke ? strokeEdges(m.hot.stroke.pts, m.hot.stroke.w / 2 + (3 * k) / r.scale) : m.hot.line;
            const c = pts?.length ? toC(pts) : null;
            if (c) {
                // (a string's run: a faint band, as a selected one's)
                if (m.hot.line) {
                    g.lineStyle({ width: 6 * k, color: SELECTED, alpha: 0.16, ...round });
                    dashed(g, c);
                }
                g.lineStyle({ width: 1.6 * k, color: SELECTED, alpha: 0.6, ...round });
                dashed(g, c, m.hot.open ? [6 * k, 5 * k] : null);
            }
        }
        // a padlock, as a selected one's: it won't move (Luke, 2026-10-25)
        const padlock = (p, alpha = 1) => {
            const c = r.toCanvas(p);
            g.lineStyle({ width: 1.5 * k, color: 0x1a0d0b, alpha: 0.9 * alpha }).beginFill(SELECTED, alpha).drawRoundedRect(c.x - 6 * k, c.y - 3 * k, 12 * k, 9 * k, 1.5 * k).endFill();
            g.lineStyle({ width: 2 * k, color: SELECTED, alpha }).arc(c.x, c.y - 3 * k, 4 * k, Math.PI, 0);
        };
        if (m.hot?.lock) padlock(m.hot.lock, 0.65);
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
            // (as it will be, its rope, paint, and pins: Luke 2026-10-25; the
            // light detail a line in its paint)
            if (m.line) this.#drawStringGhost(m.line, g, k);
        }
        if (m.box) {
            const a = r.toCanvas({ x: m.box.x0, y: m.box.y0 });
            const z = r.toCanvas({ x: m.box.x1, y: m.box.y1 });
            g.lineStyle({ width: 1.5 * k, color: SELECTED, alpha: 0.9 }).beginFill(SELECTED, 0.08).drawRect(a.x, a.y, z.x - a.x, z.y - a.y).endFill();
        }
        this.#strokePreview(m.stroke, m.strokeHull ? toC(m.strokeHull) : null);
        // the doodle in hand, where a click lays it (Luke, 2026-10-06),
        // painted as it will be (2026-10-25)
        this.#drawGhost(m.doodle);
        this.#drawPinGhost(game.activeTool === 'pin' && !r.marksOnly ? pointer : null);
        // (what the eraser will take while it is dragged, one even tint: in
        // Parts the path it passes over, as wide as it; in Whole strokes each
        // stroke it has touched. At rest, only its ring; Luke 2026-10-25)
        this.#drawEraseTint(m.sweep, m.erasable);
        // (a selected stroke outlined, never painted over: its own colour
        // shows as it will once let go; Luke 2026-10-24)
        for (const s of m.strokes ?? []) {
            g.lineStyle({ width: 1.5 * k, color: SELECTED, alpha: 0.9, ...round });
            path(strokeEdges(s.pts, s.w / 2 + (3 * k) / r.scale));
        }
        // (a padlock: a card locked to the sheet, a stroke locked)
        for (const p of m.locks ?? []) padlock(p);
        // (strokes being moved, sized, or turned: in their own paint at their
        // brightness, where they are going)
        for (const s of m.moving ?? []) {
            const paint = r.look?.ink.marker[s.c];
            g.lineStyle({ width: Math.min(s.w, markMax(r.look, s.n)) * r.scale, color: paint === undefined ? 0xd8ccb4 : brushColor(paint, s.b ?? 1), alpha: s.o ?? 0.85, ...round });
            path(s.pts);
        }
        // (the eraser itself: a ring its size, dragged or under the pointer)
        for (const e of [m.eraser, m.eraserAt]) {
            if (!e) continue;
            const c = r.toCanvas(e);
            g.lineStyle({ width: 3 * k, color: 0x1a0d0b, alpha: 0.4 }).drawCircle(c.x, c.y, e.r * r.scale);
            g.lineStyle({ width: 1.5 * k, color: 0xffffff, alpha: 0.9 }).drawCircle(c.x, c.y, e.r * r.scale);
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
        this.#caption(m.caption ?? this.#whoseText(m.whose));
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

    // The doodle in hand as it will be laid (Luke, 2026-10-25): the brush's
    // own painting of it (its paint, brightness, width, and opacity; a
    // drawing of this user's own in its own), at screen resolution, under
    // the pointer; made again only when it changes
    #ghosts = [];
    #ghostKey = '';
    #ghostBox = null;
    // (its three passes' canvases: copied when it is laid, to hold it there)
    #ghostPasses = null;
    #drawGhost(d) {
        const r = this.renderer;
        const sps = this.#ghosts;
        const hide = () => {
            for (const sp of sps) sp.visible = false;
        };
        if (sps.length !== 3) return;
        if (!d || !this.#layingDoodle() || !r.look || !r.painter?.strokeLayer) return hide();
        const saved = this.#savedOf(d.kind);
        const res = Math.min(3, r.scale * (canvas.stage?.scale.x ?? 1) * (window.devicePixelRatio || 1));
        const key = JSON.stringify([d.kind, d.seed, d.size, d.rot, Boolean(d.flip), canvas.scene?.id, this.markInk, this.markWidth, this.markBright, this.markOpacity, Math.round(res * 20), Boolean(saved)]);
        if (key !== this.#ghostKey) {
            this.#ghostKey = key;
            const strokes = doodleBoard(d.kind, d.seed, { x: 0, y: 0, size: d.size, rot: d.rot, flip: d.flip, c: this.markInk, w: Math.min(this.markWidth, markMax(r.look, this.nib)), b: this.markBright, o: this.markOpacity, n: this.nib, saved });
            // (each stroke's own painted layer, laid as the brush lays it: soaked
            // in, laid on as the sheet's grime will veil it, a bright one's light
            // pass over; as one's own stroke is shown while drawn)
            const P = layPasses(r.painter, strokes, res, `ghost:${d.seed}`);
            if (!P) {
                // (a texture not yet loaded: painted again at the next move)
                this.#ghostKey = '';
                return hide();
            }
            const blends = PASS_BLENDS();
            sps.forEach((sp, i) => {
                const old = sp.texture;
                sp.texture = PIXI.Texture.from(P.passes[i]);
                sp.blendMode = blends[i];
                sp.alpha = 1;
                if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
            });
            this.#ghostBox = P.box;
            this.#ghostPasses = P.passes;
            if (P.short) this.#ghostKey = '';
        }
        const B = this.#ghostBox;
        if (!B) return hide();
        const a = r.toCanvas({ x: d.at.x + B.x0, y: d.at.y + B.y0 });
        for (const sp of sps) {
            sp.position.set(a.x, a.y);
            sp.width = (B.x1 - B.x0) * r.scale;
            sp.height = (B.y1 - B.y0) * r.scale;
            sp.visible = true;
        }
    }

    /* -------------------------------------------- */
    /*  Live previews (Luke, 2026-10-25)            */
    /* -------------------------------------------- */

    // what everyone else is doing (live.js): their peers, by user id; this
    // user's sender; the layer they are drawn in, and its pictures, by peer
    #peers = new Map();
    // (the live messages heard and sent, for File's Statistics)
    #liveIn = 0;
    #liveOut = 0;
    #sender = new LiveSender({
        emit: (msg) => {
            this.#liveOut++;
            sendLive(msg);
        },
        scene: () => canvas.scene?.id ?? null,
        on: () => this.#sharing(),
    });
    #liveC = null;
    #liveKept = new Map();
    #liveTimer = 0;
    #liveFrame = 0;
    #liveRepaint = 0;

    // whether this user's doing is sent: a player's always; the GM's unless
    // their switch (File) is off
    #sharing() {
        if (!this.active || !this.isBoard) return false;
        if (!game.user.isGM) return true;
        try {
            return game.settings.get('heart', 'boardLiveShare') !== false;
        } catch {
            return true;
        }
    }

    #onLive(msg, from) {
        if (!from || from === game.user.id || !this.isBoard) return;
        this.#liveIn++;
        if (msg.scene !== canvas.scene?.id) {
            if (this.#peers.delete(from)) this.#liveChanged(true);
            return;
        }
        const was = this.#peers.get(from);
        const now = livePeer(was, msg);
        this.#peers.set(from, now);
        // (livePeer keeps the drag it had unless a drag message came: the same
        // one, or a new one; Luke 2026-10-25, two JSON strings a message before)
        this.#liveChanged((was?.drag ?? null) !== (now?.drag ?? null));
    }

    // a peer gone (a user left)
    dropPeer(id) {
        if (this.#peers.delete(id)) this.#liveChanged(true);
    }

    #sized = null;

    // The board's statistics on this client (File's Statistics, stats.js;
    // Luke 2026-10-25): what is on the board as this user sees it, everyone
    // else's live doing, what is drawn, and how the frame rate, the tiles,
    // and memory stand
    stats() {
        const r = this.renderer;
        if (!this.isBoard || !r.view || !r.look) return null;
        let sprites = 0;
        const count = (o) => {
            for (const c of o?.children ?? []) {
                sprites++;
                count(c);
            }
        };
        count(this);
        const R = r.stats();
        let gpuSide = 0;
        try {
            const gl = canvas.app?.renderer?.gl;
            gpuSide = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0 : 0;
        } catch {
            gpuSide = 0;
        }
        // (the board's saved size every 5 s: its whole JSON, too much to
        // make every second on a large board)
        const now = Date.now();
        if (!this.#sized || this.#sized.scene !== canvas.scene?.id || now - this.#sized.at > 5000) this.#sized = { at: now, scene: canvas.scene?.id, bytes: boardBytes(boardOf(canvas.scene)) };
        return {
            board: boardCounts(r.view),
            bytes: this.#sized.bytes,
            live: liveCounts([...this.#peers.values()]),
            here: game.users.filter((u) => u.active && u.viewedScene === canvas.scene?.id).length,
            liveIn: this.#liveIn,
            liveOut: this.#liveOut,
            landings: this.#landings.length,
            // (the board's own tiles are sprites of Foundry's, outside this layer)
            sprites: sprites + R.tiles,
            render: R,
            // (a baked map's tiles, when the board has one)
            baked: this.backdrop.stats(),
            fps: canvas.app?.ticker?.FPS ?? 0,
            frameMs: canvas.app?.ticker?.deltaMS ?? 0,
            heap: performance.memory?.usedJSHeapSize ?? 0,
            gpuSide,
            w: r.look.w,
            h: r.look.h,
        };
    }

    #livePrune() {
        // (and what this user laid, past its time)
        this.#landed(undefined);
        let drew = false;
        let drag = false;
        for (const [id, p] of this.#peers) {
            const q = livePeerAt(p);
            if (q === p) continue;
            drew = true;
            if (p.drag && !q?.drag) drag = true;
            if (q) this.#peers.set(id, q);
            else this.#peers.delete(id);
        }
        if (drew) this.#liveChanged(drag);
    }

    // drawn again on the next frame; a drag's repaint at the detail's pace
    // (high every 120 ms, standard 250; light draws outlines alone)
    #liveChanged(drag = false) {
        if (!this.#liveFrame) this.#liveFrame = requestAnimationFrame(() => {
            this.#liveFrame = 0;
            this.#liveDraw();
        });
        if (!drag || !this.renderer.detail.live || this.#liveRepaint) return;
        const every = this.renderer.detail.scale > 1 ? 120 : 250;
        this.#liveRepaint = setTimeout(() => {
            this.#liveRepaint = 0;
            this.#repaint();
        }, every);
    }

    // the live layer let go of, its pictures with it
    #liveDrop() {
        for (const kept of this.#liveKept.values()) for (const t of kept.textures ?? []) t.destroy(true);
        this.#liveKept.clear();
        if (this.#liveC && !this.#liveC.destroyed) this.#liveC.removeChildren().forEach((c) => c.destroy());
    }

    #liveDraw() {
        const C = this.#liveC;
        const r = this.renderer;
        if (!C || C.destroyed || !r.look || !r.view) return;
        // (the sprites go, their pictures kept in #liveKept)
        C.removeChildren().forEach((c) => c.destroy());
        const g = C.addChild(new PIXI.Graphics());
        const fine = r.detail.live && r.painter?.strokeLayer;
        const res = Math.min(2, r.scale * (canvas.stage?.scale.x ?? 1) * (window.devicePixelRatio || 1));
        const used = new Set();
        const toC = (pts) => {
            const out = [];
            for (let i = 0; i < pts.length; i += 2) {
                const c = r.toCanvas({ x: pts[i], y: pts[i + 1] });
                out.push(c.x, c.y);
            }
            return out;
        };
        const lines = (strokes, alpha = 0.85) => {
            for (const st of strokes) {
                const c = toC(st.pts);
                g.lineStyle({ width: Math.max(1, st.w * r.scale), color: brushColor(r.look.ink.marker[st.c] ?? 0xd8ccb4, st.b ?? 1), alpha: alpha * (st.o ?? 0.85), cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
                g.moveTo(c[0], c[1]);
                for (let i = 2; i < c.length; i += 2) g.lineTo(c[i], c[i + 1]);
            }
        };
        // (strokes painted by the brush, kept while they are the same)
        const painted = (key, strokes, seed) => {
            used.add(key);
            const sig = JSON.stringify([strokes.map((st) => [st.c, st.w, st.b, st.o, st.pts.length, st.pts[st.pts.length - 2], st.pts[st.pts.length - 1], st.pts[0], st.pts[1]]), Math.round(res * 20)]);
            let kept = this.#liveKept.get(key);
            if (!kept || kept.sig !== sig) {
                for (const t of kept?.textures ?? []) t.destroy(true);
                const L = layPasses(r.painter, strokes, res, seed);
                kept = L ? { sig, box: L.box, textures: L.passes.map((c) => PIXI.Texture.from(c)) } : { sig, box: null, textures: [] };
                this.#liveKept.set(key, kept);
            }
            if (!kept.box) return;
            const a = r.toCanvas({ x: kept.box.x0, y: kept.box.y0 });
            const blends = PASS_BLENDS();
            kept.textures.forEach((t, i) => {
                const sp = C.addChild(new PIXI.Sprite(t));
                sp.blendMode = blends[i];
                sp.position.set(a.x, a.y);
                sp.width = (kept.box.x1 - kept.box.x0) * r.scale;
                sp.height = (kept.box.y1 - kept.box.y0) * r.scale;
            });
        };
        for (const [id, p] of this.#peers) {
            if (!liveShows(p)) continue;
            const tint = Number(game.users.get(id)?.color ?? SELECTED) || SELECTED;
            if (p.stroke?.pts.length >= 4) {
                const st = { ...p.stroke.brush, pts: p.stroke.pts };
                if (fine) painted(`${id}:stroke`, [st], `live:${id}`);
                else lines([st]);
            }
            if (p.moving?.length) {
                if (fine) painted(`${id}:moving`, p.moving, `live:${id}:moving`);
                else lines(p.moving);
            }
            if (p.string) {
                const s = p.string;
                // (as it will be: its rope, paint, and pins; Luke 2026-10-25)
                if (fine && r.painter.drawLink) {
                    const key = `${id}:string`;
                    used.add(key);
                    const sig = JSON.stringify([s, Math.round(res * 20)]);
                    let kept = this.#liveKept.get(key);
                    if (!kept || kept.sig !== sig) {
                        for (const t of kept?.textures ?? []) t.destroy(true);
                        const G = stringGhost(r.painter, r.look, { ...s, seed: `live:${id}` }, res);
                        kept = G ? { sig, box: G.box, textures: [PIXI.Texture.from(G.canvas)] } : { sig: '', box: null, textures: [] };
                        this.#liveKept.set(key, kept);
                    }
                    if (kept.box) {
                        const sp = C.addChild(new PIXI.Sprite(kept.textures[0]));
                        const a = r.toCanvas({ x: kept.box.x0, y: kept.box.y0 });
                        sp.position.set(a.x, a.y);
                        sp.width = (kept.box.x1 - kept.box.x0) * r.scale;
                        sp.height = (kept.box.y1 - kept.box.y0) * r.scale;
                        sp.alpha = 0.92;
                    }
                } else {
                    const color = s.color !== null && s.color !== undefined ? r.look.ink.marker[s.color] ?? tint : tint;
                    const a = r.toCanvas(s.from);
                    const b = r.toCanvas(s.to);
                    g.lineStyle({ width: 2.5, color, alpha: 0.85, cap: PIXI.LINE_CAP.ROUND }).moveTo(a.x, a.y).lineTo(b.x, b.y);
                }
            }
            // (a drag at the light detail: the outlines of what moves)
            if (p.drag && !r.detail.live) {
                for (const [key, sp] of Object.entries(p.drag.scraps ?? {})) {
                    const s = r.view.scraps.find((x) => x.key === key);
                    if (!s || !sp || !Number.isFinite(sp.x) || !Number.isFinite(sp.y)) continue;
                    const dx = sp.x - s.x;
                    const dy = sp.y - s.y;
                    const hull = [];
                    for (let i = 0; i < s.layout.hull.length; i += 2) hull.push(s.layout.hull[i] + dx, s.layout.hull[i + 1] + dy);
                    g.lineStyle({ width: 2, color: tint, alpha: 0.8 }).drawPolygon(toC(hull));
                }
            }
        }
        // (pictures no peer shows any more let go)
        for (const [key, kept] of this.#liveKept) {
            if (used.has(key)) continue;
            for (const t of kept.textures ?? []) t.destroy(true);
            this.#liveKept.delete(key);
        }
    }

    // The pin the Pin tool would put in, under the pointer (Luke, 2026-10-25):
    // as the board will draw it, stuck in the card under it or loose; none
    // over a locked card
    #pinGhost = null;
    #pinGhostKey = '';
    #pinGhostBox = null;
    #drawPinGhost(pt) {
        const r = this.renderer;
        const sp = this.#pinGhost;
        if (!sp || sp.destroyed) return;
        const tex = this.#pinPick();
        const P = pt && tex && r.look && r.painter?.drawPin ? pinPreview(boardOf(canvas.scene), r.view, r.look, tex, pt) : null;
        if (!P || P.locked) {
            sp.visible = false;
            return;
        }
        const res = Math.min(3, r.scale * (canvas.stage?.scale.x ?? 1) * (window.devicePixelRatio || 1));
        const half = P.w * 1.2 + 12;
        const tint = this.#pinPaint !== null ? r.look.ink.marker?.[this.#pinPaint] ?? null : null;
        const key = JSON.stringify([tex, Math.round(P.w * 10), Math.round(P.rot * 1000), Math.round(res * 20), tint]);
        if (key !== this.#pinGhostKey) {
            const c = document.createElement('canvas');
            c.width = c.height = Math.max(1, Math.ceil(half * 2 * res));
            const g = c.getContext('2d');
            g.setTransform(res, 0, 0, res, 0, 0);
            // (its picture not yet in: drawn again next move)
            this.#pinGhostKey = r.painter.drawPin(g, tex, half, half, P.w, P.rot, tint) ? key : '';
            const old = sp.texture;
            sp.texture = PIXI.Texture.from(c);
            if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
            this.#pinGhostBox = half;
        }
        const h = this.#pinGhostBox ?? half;
        const a = r.toCanvas({ x: P.x - h, y: P.y - h });
        sp.position.set(a.x, a.y);
        sp.width = sp.height = h * 2 * r.scale;
        sp.alpha = 0.9;
        sp.visible = true;
    }

    // the string this user is tying, as it will be
    #stringSprite = null;
    #stringKey = '';
    #stringSpec() {
        const d = this.controls.drag;
        const player = !this.controls.editor;
        return {
            kind: player ? 'plain' : d?.linkKind ?? this.controls.chainKind ?? this.#lastKind,
            color: d?.linkColor ?? (player ? this.#lastColor : this.#gmColor),
            pin: this.#stringPin,
            plainPins: !this.#stringTint,
        };
    }

    #drawStringGhost(line, g, k) {
        const r = this.renderer;
        const spec = { ...this.#stringSpec(), from: line[0], to: line[1], seed: `ghost:${game.user.id}` };
        if (!r.detail.live || !r.painter?.drawLink) {
            const [p, q] = line.map((x) => r.toCanvas(x));
            const color = spec.color !== null && spec.color !== undefined ? r.look.ink.marker[spec.color] ?? SELECTED : SELECTED;
            g.lineStyle({ width: 2.5 * k, color, alpha: 0.85 }).moveTo(p.x, p.y).lineTo(q.x, q.y);
            return;
        }
        const sp = this.#stringSprite;
        if (!sp || sp.destroyed) return;
        const res = Math.min(2, r.scale * (canvas.stage?.scale.x ?? 1) * (window.devicePixelRatio || 1));
        const key = JSON.stringify([spec, Math.round(res * 20)]);
        if (key !== this.#stringKey) {
            const G = stringGhost(r.painter, r.look, spec, res);
            this.#stringKey = G ? key : '';
            if (!G) return;
            const old = sp.texture;
            sp.texture = PIXI.Texture.from(G.canvas);
            if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
            sp.heartBox = G.box;
        }
        const B = sp.heartBox;
        if (!B) return;
        const a = r.toCanvas({ x: B.x0, y: B.y0 });
        sp.position.set(a.x, a.y);
        sp.width = (B.x1 - B.x0) * r.scale;
        sp.height = (B.y1 - B.y0) * r.scale;
        sp.alpha = 0.92;
        sp.visible = true;
        this.#stringShown = true;
    }

    #stringShown = false;

    // The stroke being drawn as the brush will paint it (its paint, ragged
    // edges, and dry gaps, at this brightness and opacity), at screen
    // resolution, under the tools' marks. Painted again only when the stroke
    // has grown or the brush changed, as one picture shown three ways (Luke,
    // 2026-10-25: each redraw of the marks painted it whole, twice, and sent
    // both to the GPU)
    #strokeBuilt = null;
    // (the outline of the card it began on, canvas px: its mask)
    #strokeHull = null;
    #strokePreview(pts, hull = null) {
        const sps = this.#strokeSprites;
        const mask = this.#strokeMask;
        if (sps.length !== 3 || !mask || mask.destroyed) return;
        // (begun on a card, kept to it as it will be)
        mask.clear();
        if (hull) mask.beginFill(0xffffff, 1).drawPolygon(hull).endFill();
        for (const sp of sps) sp.mask = hull ? mask : null;
        this.#strokeHull = hull;
        const r = this.renderer;
        const hide = () => {
            for (const sp of sps) sp.visible = false;
            this.#strokeBuilt = null;
        };
        if (!pts || pts.length < 4 || !r.painter?.strokeLayer || !r.look) return hide();
        const st = brushStroke(this.brush, r.look, pts);
        const k = Math.min(3, r.scale * canvas.stage.scale.x * (window.devicePixelRatio || 1));
        // (a drag's points only grow: as many, and the same first, is the same stroke)
        const key = JSON.stringify([st.c, st.w, st.o, st.b, st.n ?? null, Math.round(k * 20), pts.length, pts[0], pts[1]]);
        if (key === this.#strokeBuilt?.key) return;
        let L = null;
        try {
            L = r.painter.strokeLayer(st, k, 'live');
        } catch (err) {
            console.warn('heart | the stroke could not be shown', err);
        }
        if (!L) return hide();
        // The painter's passes over the sheet as it is now, grime and all
        // (Luke, 2026-10-06: Dim and Bright previewed too dim): soaked in, the
        // stroke as it is (the grime already under it darkens it as the
        // grime over it will); laid on, tinted by the grime's veil as the
        // grime will darken it; a bright stroke's light pass over the grime,
        // as it is
        const tex = PIXI.Texture.from(L.canvas);
        const old = sps[0].texture;
        const a = r.toCanvas({ x: L.x0, y: L.y0 });
        const pass = [[PIXI.BLEND_MODES.MULTIPLY, L.soak, 0xffffff], [PIXI.BLEND_MODES.NORMAL, L.lay, r.painter.grimeVeil], [PIXI.BLEND_MODES.NORMAL, L.over ?? 0, 0xffffff]];
        sps.forEach((sp, i) => {
            const [blend, alpha, tint] = pass[i];
            sp.texture = tex;
            sp.position.set(a.x, a.y);
            sp.width = (L.x1 - L.x0) * r.scale;
            sp.height = (L.y1 - L.y0) * r.scale;
            sp.blendMode = blend;
            sp.alpha = alpha;
            sp.tint = tint;
            sp.visible = alpha > 0;
        });
        if (old && old !== PIXI.Texture.EMPTY && old !== tex) old.destroy(true);
        this.#strokeBuilt = { key };
    }

    /* -------------------------------------------- */
    /*  What was just laid, held (Luke, 2026-10-25) */
    /* -------------------------------------------- */

    // A stroke or a doodle this user just laid, shown as it was until the
    // board is painted with it (a stroke flashed off and back on as it
    // ended: its preview was hidden at once, and the board showed it only
    // once the scene's update came back and was painted). Each { sprites,
    // extras, textures, want (live.js landingOf), until }: let go once a
    // board painted shows all it waits for, or after LAND_MS (an edit
    // refused, or lost), or with the scene.
    #landings = [];
    static LAND_MS = 4000;

    // the stroke just drawn: its preview's picture and passes, as they are
    #landStroke(patch) {
        const sps = this.#strokeSprites;
        const C = this.#landingC;
        const tex = sps[0]?.texture;
        const want = landingOf(patch);
        if (!C || C.destroyed || !want.length || !tex || tex === PIXI.Texture.EMPTY || !sps.some((sp) => sp.visible)) return;
        const sprites = sps.filter((sp) => sp.visible).map((sp) => {
            const s = C.addChild(new PIXI.Sprite(tex));
            s.position.copyFrom(sp.position);
            s.scale.copyFrom(sp.scale);
            s.blendMode = sp.blendMode;
            s.alpha = sp.alpha;
            s.tint = sp.tint;
            return s;
        });
        const extras = [];
        // (begun on a card: kept to it still)
        if (this.#strokeHull) {
            const m = C.addChild(new PIXI.Graphics());
            m.beginFill(0xffffff, 1).drawPolygon(this.#strokeHull).endFill();
            for (const s of sprites) s.mask = m;
            extras.push(m);
        }
        // (the picture is the landing's now: the next stroke paints its own)
        for (const sp of sps) {
            sp.texture = PIXI.Texture.EMPTY;
            sp.visible = false;
        }
        this.#strokeBuilt = null;
        this.#landings.push({ sprites, extras, textures: [tex], want, until: Date.now() + ScrapboardLayer.LAND_MS });
    }

    // the doodle just laid at `at` (board px): a copy of its ghost there (the
    // ghost itself stays in hand, under the pointer)
    #landGhost(at, patch) {
        const C = this.#landingC;
        const P = this.#ghostPasses;
        const B = this.#ghostBox;
        const want = landingOf(patch);
        if (!C || C.destroyed || !want.length || !P || !B || !this.#ghosts[0]?.visible) return;
        const r = this.renderer;
        const a = r.toCanvas({ x: at.x + B.x0, y: at.y + B.y0 });
        const blends = PASS_BLENDS();
        const textures = P.map((c) => {
            const copy = document.createElement('canvas');
            copy.width = c.width;
            copy.height = c.height;
            copy.getContext('2d').drawImage(c, 0, 0);
            return PIXI.Texture.from(copy);
        });
        const sprites = textures.map((t, i) => {
            const s = C.addChild(new PIXI.Sprite(t));
            s.blendMode = blends[i];
            s.position.set(a.x, a.y);
            s.width = (B.x1 - B.x0) * r.scale;
            s.height = (B.y1 - B.y0) * r.scale;
            return s;
        });
        this.#landings.push({ sprites, extras: [], textures, want, until: Date.now() + ScrapboardLayer.LAND_MS });
    }

    // Landings let go: those a painted `board` shows, and those past their
    // time (`board` undefined: only those); every one (`board` null: the
    // scene left)
    #landed(board) {
        if (!this.#landings.length) return;
        const now = Date.now();
        this.#landings = this.#landings.filter((L) => {
            if (board !== null && now < L.until && !(board && landedOn(board, L.want))) return true;
            for (const sp of [...L.sprites, ...L.extras]) if (!sp.destroyed) sp.destroy();
            for (const t of L.textures) if (t !== PIXI.Texture.EMPTY) t.destroy(true);
            return false;
        });
    }

    /* -------------------------------------------- */
    /*  Presses                                     */
    /* -------------------------------------------- */

    // (Foundry calls a left click on the press, before any drag)
    async _onClickLeft(event) {
        if (!this.isBoard || !this.renderer.view) return;
        // (Look: held still, a ping where it is held, as Foundry's own on a
        // scene's tokens; Luke 2026-10-25)
        if (game.activeTool === 'inspect') this.#holdToPing(event);
        // (a new place waiting for where it goes: here)
        if (this.#placing && game.user.isGM) {
            const answer = this.#placing;
            const at = this.#pointOf(event);
            this.#placing = null;
            if (at) return this.#putPlace(answer, at);
        }
        // (picking strokes, on till its button or a right-click: a drag boxes
        // them, again to start over, Ctrl to add; Ctrl+click takes or lets
        // go of one; a plain click does nothing; Luke 2026-10-25)
        // (anyone's stroke: Luke 2026-10-25, controls.js pickAny)
        if (this.#picking && game.activeTool === 'mark') {
            if (!this.#ctrl(event)) return;
            this.controls.pickAt(this.#pointOf(event));
            this.controls.keepStrokesOnly();
            this.drawMarks();
            return this.syncPalette();
        }
        const action = this.controls.press(game.activeTool, this.#pointOf(event), { ctrl: this.#ctrl(event) });
        // (a stroke taken or let go with Ctrl and the brush: its palette too)
        if (action?.do === 'select' && game.activeTool === 'mark') {
            this.drawMarks();
            return this.syncPalette();
        }
        return this.#do(action);
    }

    async _onClickRight(event) {
        // (anyone's: Shift+right-click makes what they made public, or theirs
        // again; a right-click locks what they may change; Luke 2026-10-24)
        const shift = this.#shift(event);
        if (!this.isBoard || !this.renderer.view) return;
        // (picking stopped, nothing selected)
        if (this.#picking) return this.#endPicking(false);
        const e = event?.data?.originalEvent ?? event?.nativeEvent;
        if (Number.isFinite(e?.clientX)) this.#mouse = { x: e.clientX, y: e.clientY };
        // (Foundry calls this as the button goes down, and a right-drag pans:
        // only a click, let go where it was pressed, does anything, so a pan
        // never locks or switches what it began over and the selection stays
        // as it was; Luke 2026-10-24)
        const pt = this.#pointOf(event);
        const at = Number.isFinite(e?.clientX) ? { x: e.clientX, y: e.clientY } : null;
        const tool = game.activeTool;
        await new Promise((resolve) => {
            const up = (ev) => {
                window.removeEventListener('pointerup', up, true);
                resolve(!at || (ev.button === 2 && Math.hypot(ev.clientX - at.x, ev.clientY - at.y) <= 5));
            };
            window.addEventListener('pointerup', up, true);
        }).then((click) => (click ? this.#do(this.controls.press(tool, pt, { right: true, shift })) : null));
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
                return ui.notifications.info(loc(a.why === 'not-maker' ? 'heart.board.share-not-maker' : a.why === 'locked' ? 'heart.board.locked-frozen' : 'heart.board.reveal-place-first'));
            case 'share':
                // (Shift+right-click: Luke 2026-10-24)
                if (gm && !this.preview) await (a.patch ? applyBoardPatch(scene, a.patch) : null);
                else await boardEdit(scene, { share: { ...a.sel, on: a.on } });
                return ui.notifications.info(loc(a.on ? 'heart.board.shared' : 'heart.board.unshared'));
            case 'reveal':
                // (the shared controls' patch, model.js revealPatch: a
                // string's name tag and its thread come with it)
                return a.patch ? applyBoardPatch(scene, a.patch) : null;
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
                // (the String window's kind, paint, and pin: Luke 2026-10-25)
                const answer = { kind: player ? 'plain' : a.kind ?? this.#lastKind, label: '', color: a.color ?? (player ? this.#lastColor : this.#gmColor), state: a.state ?? null };
                const pin = this.#stringPin;
                const plainPins = !this.#stringTint;
                if (player) this.#lastColor = answer.color ?? null;
                else this.#lastKind = answer.kind;
                // (a shared pin is made first, then the string, then its name:
                // a pin, a name tag, and a thread, ordinary pieces)
                // (each end a pin: one shared, or one made where it was asked for)
                const act = { a: a.a, b: a.b, aPt: a.aPt, bPt: a.bPt, aAt: a.aAt, bAt: a.bAt, aPin: a.aPin, bPin: a.bPin, prep: a.prep };
                if (player) {
                    const res = await boardEdit(scene, { ownString: { act, color: answer.color ?? null, label: answer.label || undefined, pin, plainPins } });
                    return this.#carryOn(a, res?.id);
                }
                if (!gm) {
                    const res = await boardEdit(scene, { addString: { act, kind: answer.kind, color: answer.color ?? null, state: answer.state ?? null, pin, plainPins }, label: answer.label ? { text: answer.label } : undefined });
                    return this.#carryOn(a, res?.id);
                }
                const id = await addString(scene, act, answer.kind, { color: answer.color ?? null, state: answer.state ?? 'known', pin, plainPins });
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
                    const answer = await noteDialog({ hand, type: a.type, base: this.#freshBase(a), canShare: true });
                    // (a note may be blank, a card with nothing on it yet: Luke 2026-10-25)
                    if (answer && (answer.text || a.type === 'note')) return addScrap(scene, { type: a.type, x: a.at.x, y: a.at.y, ...this.#noteData(answer), hand });
                    return;
                }
                // (the key it will have, so its preview is the note: Luke 2026-10-24)
                const answer = await noteDialog({ type: a.type, chooseHand: true, title: a.type === 'scrawl' ? 'heart.board.write-title' : 'heart.board.note-title', base: this.#freshBase(a), canShare: true });
                if (!answer || (!answer.text && a.type !== 'note')) return;
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
            case 'mark':
                // (held as drawn until the board shows it: Luke 2026-10-25,
                // it flashed off and back on as it ended)
                this.#landStroke(a.patch);
                this.drawMarks();
                // (begun on a card: the card's, in its own frame; the patch is
                // the shared controls', model.js strokePatch, Luke 2026-10-21)
                // (its id picked when the write's turn comes: a dash right
                // after a stroke, both kept)
                if (game.user.isGM) return applyBoardPatch(scene, (board) => freshStrokeIds(board, a.patch));
                return boardEdit(scene, { mark: a.on ? { ...a.stroke, on: a.on } : a.stroke });
            case 'unmark':
                this.drawMarks();
                return game.user.isGM ? removeMarks(scene, a.strokes) : boardEdit(scene, { unmark: a.strokes });
            // (what the eraser passed over rubbed out, the rest of each stroke
            // left as it was: model.js cutPatch, the GM's relay the same for
            // anyone else; Luke 2026-10-25)
            // (writing let go on a blank note, its writing now: Luke 2026-10-25)
            case 'absorb': {
                this.drawMarks();
                if (gm && !this.preview) {
                    const p = absorbPatch(boardOf(scene), a.writing, a.note);
                    return p ? applyBoardPatch(scene, p) : null;
                }
                return boardEdit(scene, { absorb: { writing: a.writing, note: a.note } });
            }
            case 'cut': {
                this.drawMarks();
                // (worked out when the write's turn comes, on the board as it is then)
                if (gm && !this.preview) return applyBoardPatch(scene, (board) => cutPatch(board, this.renderer.view, a.sweep, a.strokes, this.renderer.look));
                return boardEdit(scene, { cut: { sweep: a.sweep, strokes: a.strokes } });
            }
            case 'open':
                return this.#open(a.scrap);
            case 'inspect':
                return this.#inspect(a.scrap);
            case 'editString': {
                const link = a.link;
                if (link.delve) return (await fromUuid(link.delve))?.sheet?.render(true);
                // its name is its name tag's writing (a note hung from it)
                const player = !gm && !this.user.owner;
                // (its maker or the GM makes it public, or theirs again: Luke 2026-10-24)
                const raw = boardOf(scene).links?.[link.id];
                const canShare = mayShare(raw, this.user);
                // (its own pins: those no other string holds; their pin, picked
                // here for them all: Luke 2026-10-25)
                const board = boardOf(scene);
                const others = new Set(Object.entries(board.links ?? {}).filter(([id]) => id !== link.id).flatMap(([, l]) => [l?.aPin, l?.bPin, ...(l?.joints ?? []).map((j) => j?.pin)]).filter(Boolean));
                const own = [raw?.aPin, raw?.bPin, ...(raw?.joints ?? []).map((j) => j?.pin)].filter((id) => id && board.pins?.[id] && !others.has(id));
                const pinNow = own.length ? board.pins[own[0]].tex : null;
                const answer = await stringDialog({ kind: link.kind, label: link.named ?? '', color: link.color ?? null, player, open: Boolean(raw?.open), canShare, plainPins: Boolean(raw?.plainPins), pin: pinNow });
                if (!answer) return;
                const repin = answer.pin && answer.pin !== pinNow ? Object.fromEntries(own.map((id) => [id, { tex: answer.pin }])) : null;
                const share = canShare && Boolean(answer.open) !== Boolean(raw?.open) ? { share: { links: [link.id], on: Boolean(answer.open) } } : null;
                if (player) {
                    await boardEdit(scene, { ownPatch: { link: [link.id, { color: answer.color ?? null, plainPins: Boolean(answer.plainPins) }], ...(repin ? { pins: repin } : {}) } });
                    if (!link.nameNote && answer.label) await boardEdit(scene, { ownLabel: { id: link.id, text: answer.label } });
                    if (share) await boardEdit(scene, share);
                    return;
                }
                if (share && !gm) await boardEdit(scene, share);
                else if (share) {
                    const p = sharePatch(boardOf(scene), this.renderer.view, { links: [link.id] }, share.share.on, this.user);
                    if (p) await applyBoardPatch(scene, p);
                }
                const was = link.named ?? '';
                const patch = { link: [link.id, { kind: answer.kind, color: answer.color ?? null, plainPins: Boolean(answer.plainPins) }], ...(repin ? { pins: repin } : {}) };
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

    // (no kind, white, to start: Luke 2026-10-25)
    #lastKind = 'plain';
    // (a player's last paint for their strings: none, white)
    #lastColor = null;
    // (the GM's: none, the kind's own colour; and the pin a new string's
    // ends are, none the kind's own: the String window's, Luke 2026-10-25)
    #gmColor = null;
    #stringPin = kept.get(STRING_PIN);
    // (its pins in its colour: on unless this client turned it off)
    #stringTint = kept.get(STRING_TINT) !== false;

    // a new string made: selected, as the editor does (Luke, 2026-10-21);
    // chained, on from its end pin while Ctrl is still held (Luke,
    // 2026-10-03), else the chain is over
    #carryOn(a, id) {
        if (id) this.controls.selectLink(id);
        const held = game.keyboard?.isModifierActive?.(KeyboardManager.MODIFIER_KEYS.CONTROL);
        const pin = id ? boardOf(canvas.scene).links?.[id]?.bPin : null;
        if (a.chain && held && pin) this.controls.chainFrom(pin, a.endPt);
        else this.controls.endChain();
        this.drawMarks();
    }

    #onKeyUp = (event) => {
        if (event.key === 'Shift' && this.#shiftHeld) {
            this.#shiftHeld = false;
            if (this.active && game.activeTool === 'mark') this.drawMarks();
        }
        if (event.key === 'Control' && this.controls.endChain()) this.drawMarks();
    };

    // a new card of the GM's, as its window previews it: the key addScrap
    // will give it (api.js), where it goes, and its doodle
    #freshBase(a) {
        const key = customKey(a.type === 'note' ? 'n' : 'w', keysTaken(boardOf(canvas.scene)));
        return freshBase(canvas.scene, key, a.type, Math.round(a.at.x), Math.round(a.at.y), game.user.id);
    }

    // a note's text and its choices, as a scrap's fields
    #noteData(answer) {
        const data = { text: answer.text };
        // (its writing set a stretch at a time: Luke 2026-10-25)
        if (answer.fmt?.length) data.fmt = answer.fmt;
        // (public from the start; its writing's size: Luke 2026-10-24)
        if (answer.open) data.open = true;
        if (answer.textSize) data.textSize = answer.textSize;
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
    // (the Pin window's pin, put in at once: Luke 2026-10-25)
    async #pin(a) {
        let tex = this.#pinPick();
        tex ||= await pinDialog({ thumb: pinThumb });
        if (!tex) return;
        try {
            localStorage.setItem(LAST_PIN, tex);
        } catch {
            // (a private window: nothing remembered)
        }
        const data = a.on ? { tex, on: a.on, at: a.uv } : { tex, x: a.at.x, y: a.at.y };
        // (in the Pin window's paint, if one is picked: Luke 2026-10-25)
        if (this.#pinPaint !== null) data.c = this.#pinPaint;
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
        const doc = await this.#docOf(s);
        if (doc) return doc.sheet?.render(true);
        this.#gone(s);
    }

    // A card whose place is gone (its actor deleted, or the book's entry
    // missing) says so when opened (Luke, 2026-10-21: it did nothing)
    #gone(s) {
        if (s.uuid || this.renderer.look?.library?.[s.lib]?.uuid) ui.notifications.warn(loc('heart.board.place-gone', { name: this.#nameOf(s) }));
    }

    // A player opens a known landmark they may see (else its art)
    async #inspect(s) {
        if (s.type !== 'landmark' || s.look !== 'known') return;
        const doc = await this.#docOf(s);
        if (doc?.testUserPermission?.(game.user, 'OBSERVER')) return doc.sheet.render(true);
        if (doc) return showArt(doc);
        this.#gone(s);
    }

    /* -------------------------------------------- */
    /*  Dragging and the wheel                      */
    /* -------------------------------------------- */

    _canDragLeftStart() {
        const t = game.activeTool;
        return Boolean(this.isBoard && this.renderer.view && (t === 'move' || t === 'mark' || t === 'erase' || (t === 'string' && this.controls.editor)));
    }

    _onDragLeftStart(event) {
        // (the one-time pick: a box round the strokes, as Move's)
        if (this.#picking && game.activeTool === 'mark') {
            this.controls.drag = { kind: 'box', start: this.#pointOf(event), ctrl: this.#ctrl(event) };
            return this.drawMarks();
        }
        const alt = Boolean(event?.altKey) || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
        const kind = this.controls.dragStart(this.#pointOf(event), { ctrl: this.#ctrl(event), shift: this.#shift(event), alt, tool: game.activeTool });
        // (decorations are the editor's to edit)
        if (kind === 'decor') this.controls.cancel();
        this.drawMarks();
    }

    _onDragLeftMove(event) {
        const pt = this.#pointOf(event, 'destination');
        const out = this.controls.dragMove(pt);
        this.#sendDrag(out, pt);
        if (!out) return;
        if (out.marks) return this.drawMarks();
        if (this.renderer.detail.live) this.#show(out);
    }

    // what this user is dragging, sent to everyone else (Luke, 2026-10-25):
    // a stroke being painted, a string being tied, strokes being moved, or
    // the board as the drag would leave it
    #sendDrag(out, pt) {
        const d = this.controls.drag;
        if (!d) return;
        if (d.kind === 'mark') return this.#sender.stroke(d.pts, this.#liveBrush(), d.on ?? null);
        if (d.kind === 'string') {
            const m = this.controls.marks({ pointer: pt });
            if (m.line) this.#sender.string({ from: m.line[0], to: m.line[1], ...this.#stringSpec() });
            return;
        }
        if (d.lifted) return this.#sender.moving((this.controls.marks().moving ?? []).map((st) => ({ c: st.c, w: st.w, b: st.b, o: st.o, pts: st.pts })));
        if (out && !out.marks && !out.do) this.#sender.drag(out);
    }

    #liveBrush() {
        return { c: this.markInk, w: Math.min(this.markWidth, markMax(this.renderer.look, this.nib)), b: this.markBright, o: this.markOpacity, n: this.nib, fill: this.#filling() };
    }

    async _onDragLeftDrop() {
        this.#sender.end();
        const out = this.controls.dragEnd();
        if (this.#picking) {
            this.controls.keepStrokesOnly();
            this.drawMarks();
            return this.syncPalette();
        }
        if (!out || out.select) {
            this.drawMarks();
            // (strokes boxed with Ctrl and the brush: its palette says so,
            // ready to restyle them; Luke 2026-10-25)
            if (game.activeTool === 'mark') this.syncPalette();
            return;
        }
        if (out.do) return this.#do(out);
        await this.#live;
        return this.#write(out);
    }

    _onDragLeftCancel() {
        this.#sender.end();
        this.controls.cancel();
        this.refresh();
    }

    // Ctrl+wheel turns the selection, Shift+wheel sizes it; written once the
    // wheel rests
    _onMouseWheel(event) {
        // (the eraser in hand: Ctrl+wheel sizes it; Luke 2026-10-25)
        // (and the brush's, Shift held: Shift+Ctrl+wheel; Luke 2026-10-25)
        if (game.activeTool === 'erase' || (game.activeTool === 'mark' && this.#erasing() && (event.ctrlKey || event.metaKey))) {
            if (!(event.ctrlKey || event.metaKey)) return;
            // (Shift turns the wheel sideways in some browsers)
            const dy = Number(event.delta ?? event.deltaY) || Number(event.deltaX) || 0;
            if (!dy) return;
            this.#setEraser({ size: Math.round(this.eraseSize * (dy < 0 ? 1.12 : 1 / 1.12)) });
            return this.drawMarks();
        }
        const patch = this.controls.wheel(event.delta ?? event.deltaY, { ctrl: Boolean(event.ctrlKey || event.metaKey), shift: Boolean(event.shiftKey) });
        if (!patch) return;
        // (the doodle in hand turned or sized: Luke 2026-10-25)
        if (patch.doodle) {
            this.drawMarks();
            return this.#doodleInputs();
        }
        // (never written to another scene viewed by the time the wheel rests,
        // whose cards may share its keys: Luke, 2026-10-21)
        this.#wheelScene = canvas.scene;
        this.#wheelPatch = { scraps: { ...(this.#wheelPatch?.scraps ?? {}) } };
        for (const [k, p] of Object.entries(patch.scraps)) this.#wheelPatch.scraps[k] = { ...(this.#wheelPatch.scraps[k] ?? {}), ...p };
        this.#show(this.#wheelPatch);
        this.#wheelWrite();
    }

    #wheelPatch = null;
    #wheelScene = null;
    #wheelWrite = foundry.utils.debounce(async () => {
        const patch = this.#wheelPatch;
        this.#wheelPatch = null;
        if (!patch || this.#wheelScene !== canvas.scene) return;
        await this.#live;
        return this.#write(patch);
    }, 350);

    // An edit written: the GM's at once, a players' board owner's through the
    // GM, a player's moves of their own notes
    #write(patch) {
        const scene = canvas.scene;
        if (game.user.isGM && !this.preview) return applyBoardPatch(scene, patch);
        // (refused by the GM's relay: the board drawn again as it really is,
        // never left as this user's edit showed it; Luke 2026-10-25, a note
        // sized past a player's limit stayed shown at that size)
        return this.#asked(scene, patch).then((res) => {
            if (res?.status !== 'done') this.refresh();
            return res;
        });
    }

    #asked(scene, patch) {
        // (strokes moved: through the relay's own check, for anyone; moved
        // with cards, strings, or pins, Luke 2026-10-24, the rest goes as its
        // own edit)
        const strokes = { marks: patch.marks ?? {}, scraps: Object.fromEntries(Object.entries(patch.scraps ?? {}).filter(([, p]) => p?.marks).map(([k, p]) => [k, { marks: p.marks }])) };
        const rest = { ...patch, scraps: Object.fromEntries(Object.entries(patch.scraps ?? {}).map(([k, p]) => { const { marks, ...q } = p ?? {}; void marks; return [k, q]; }).filter(([, q]) => Object.keys(q).length)) };
        delete rest.marks;
        const hasRest = Object.keys(rest.scraps).length || ['link', 'links', 'newLinks', 'pins', 'newScraps', 'bits'].some((k) => rest[k] && (k === 'link' || Object.keys(rest[k]).length));
        if (Object.keys(strokes.marks).length || Object.keys(strokes.scraps).length) {
            const asked = boardEdit(scene, { remark: strokes });
            if (!hasRest) return asked;
        }
        // (a player's own strings and pins: checked there too)
        if (this.user.owner) return boardEdit(scene, { patch: rest });
        // (their own notes and writing and public ones, moved, sized, and
        // turned, the pieces on them, and their own strings and pins: the
        // whole edit, checked there field by field; Luke 2026-10-24)
        return boardEdit(scene, { own: rest });
    }

    // Whose the thing under the pointer is, in words (Luke, 2026-10-24):
    // public, this user's, the GM's, or its maker's (and their character's)
    #whoseText(w) {
        if (!w) return null;
        const what = loc(`heart.board.whose.${w.kind}`);
        if (w.open) return loc('heart.board.whose.public', { what });
        if (w.author && w.author === game.user.id) return loc('heart.board.whose.yours', { what });
        const u = w.author ? game.users.get(w.author) : null;
        // (the GM's: "Luke's", his table's, not for publishing; Luke 2026-10-24)
        if (!u || u.isGM) return loc('heart.board.whose.gms', { what });
        return loc('heart.board.whose.theirs', { what, name: u.character ? `${u.name} (${u.character.name})` : u.name });
    }

    // The selection made public, or its maker's again (Luke, 2026-10-24:
    // Shift+P, or the toolbar's Public): only what this user made (the GM's,
    // anything). False when the board isn't in hand (the key is Foundry's).
    share() {
        if (!this.active || !this.isBoard) return false;
        const st = this.controls.shareState();
        if (!st) {
            ui.notifications.info(loc('heart.board.share-none'));
            return true;
        }
        if (game.user.isGM && !this.preview) {
            const patch = this.controls.sharePatch();
            if (patch) applyBoardPatch(canvas.scene, patch);
        } else {
            boardEdit(canvas.scene, { share: { ...this.controls.shareSel(), on: st.on } });
        }
        ui.notifications.info(loc(st.on ? 'heart.board.shared' : 'heart.board.unshared', { n: st.n }));
        return true;
    }

    // Repaint the board as an edit under way would leave it: one repaint at
    // a time, the latest state next
    // (everyone else's drags painted in under this user's own, never in the
    // board this user's edits are worked out from: Luke 2026-10-25)
    #show(patch) {
        this.#pending = patch;
        this.#repaint();
    }

    #repaint() {
        if (this.#painting) return (this.#again = true);
        const base = boardOf(canvas.scene);
        if (this.#pending) this.#working = applyPatch(foundry.utils.deepClone(base), this.#pending);
        const b = this.#withPeers(this.#working ?? base);
        this.#painting = true;
        this.#live = this.renderer.draw(canvas.scene, this.viewer, b).then((view) => {
            if (view) this.#landed(base);
            return view;
        }).catch((err) => {
            // (a repaint that failed never costs the edit waiting on it: Luke
            // 2026-10-25)
            console.warn('heart | the board could not be painted', err);
            return null;
        }).finally(() => {
            this.#painting = false;
            this.drawMarks();
            if (this.#again) {
                this.#again = false;
                this.#repaint();
            }
        });
    }

    // a board with everyone else's drags on it (a copy), or the board itself
    #withPeers(board) {
        const patches = this.renderer.detail.live ? [...this.#peers.values()].map((p) => p.drag).filter(Boolean) : [];
        if (!patches.length) return board;
        const b = foundry.utils.deepClone(board);
        for (const patch of patches) {
            try {
                applyPatch(b, patch);
            } catch {
                // (a patch that no longer fits the board: passed over)
            }
        }
        return b;
    }

    #pending = null;

    /* -------------------------------------------- */
    /*  A picture of the board                      */
    /* -------------------------------------------- */

    // The whole map as this user sees it now (the GM's view, or the
    // players'), at full resolution, downloaded as a PNG
    // Save Render (Luke, 2026-10-25: the whole map at full resolution):
    // Balanced, a WebP at 92% (balanced between quality and size), or
    // Quality, a lossless PNG (unlimited quality); a render past WebP's 16,383 px saves as PNG
    async saveSnapshot() {
        if (!this.isBoard) return;
        const pick = await new Promise((resolve) => {
            new Dialog({
                title: loc('heart.board.render-title'),
                content: `<p>${esc(loc('heart.board.render-hint'))}</p>`,
                buttons: {
                    webp: { icon: '<i class="fa-solid fa-download"></i>', label: loc('heart.board.render-balanced'), callback: () => resolve('webp') },
                    png: { icon: '<i class="fa-solid fa-gem"></i>', label: loc('heart.board.render-quality'), callback: () => resolve('png') },
                },
                default: 'webp',
                close: () => resolve(null),
            }, heartDialogOptions({ classes: ['heart-board-dialog', 'heart-board-render'], width: 460 })).render(true);
        });
        if (!pick) return;
        ui.notifications.info(loc('heart.board.snapshot-working'));
        let out = null;
        try {
            out = await this.renderer.snapshot(canvas.scene, this.viewer, 2, pick);
        } catch (err) {
            console.error('heart | the map picture could not be painted', err);
        }
        await this.refresh();
        const blob = out?.blob ?? null;
        if (!blob) return ui.notifications.warn(loc('heart.board.snapshot-failed'));
        if (pick === 'webp' && out.type !== 'image/webp') ui.notifications.info(loc('heart.board.render-too-big'));
        const ext = out.type === 'image/webp' ? 'webp' : 'png';
        const name = `${canvas.scene.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || loc('heart.board.snapshot-file')} (${loc(this.viewer === 'gm' ? 'heart.board.snapshot-gm' : 'heart.board.snapshot-players')}).${ext}`;
        // (Foundry's own save, which its desktop client allows; failing that,
        // the picture in Foundry's image viewer, to save from there)
        try {
            saveDataToFile(blob, out.type, name);
        } catch (err) {
            console.warn('heart | the map picture could not be saved', err);
            const url = URL.createObjectURL(blob);
            showImage(url, { title: name });
        }
    }

    /* -------------------------------------------- */
    /*  The brush's windows, and the string's       */
    /* -------------------------------------------- */

    // Shown while the Brush is in hand (Luke, 2026-10-25): the brush's window
    // (its paints, brightness, width, opacity, Show only drawings, and the
    // GM's Reset all brushes) and the doodles' (every doodle, this user's own
    // kept drawings, their size and turn), each its own, moved and sized by
    // itself, the doodles' by the brush's until it is moved; whichever was
    // last pressed is in hand, the brush or the doodle. The String window
    // while String is.
    // (each window shut by its x; a tool whose windows are all shut is put
    // down for Look; the brush shut with the doodles open keeps the doodles,
    // and the Brush taken again opens its window again: Luke 2026-10-25)
    #brushShut = false;
    #toolWas = null;
    #toLook() {
        ui.controls?.initialize({ control: 'heartBoard', tool: 'inspect' });
    }

    syncPalette() {
        if (game.activeTool !== this.#toolWas) {
            carried.clear();
            // (a tool taken lets go of any drag left over, and tells everyone
            // else: Luke 2026-10-25, a stroke or string half done stayed on
            // their screens)
            if (this.controls.drag) this.#sender.end();
            this.controls.cancel();
            this.#sender.idle();
            if (game.activeTool === 'mark') this.#brushShut = false;
            this.#toolWas = game.activeTool;
        }
        const on = Boolean(this.active && this.isBoard && game.activeTool === 'mark');
        // (picking strokes is the brush's: it ends, the strokes picked kept,
        // when the brush is put down; Luke 2026-10-25, left on under Move it
        // swallowed every drag)
        if (!on && this.#picking) this.#endPicking(true);
        if (on && this.#brushShut && !this.#doodlesOpen) return this.#toLook();
        if (!on && this.controls.doodle) {
            this.#lastDoodle = this.controls.doodle;
            this.controls.doodle = null;
        }
        // (the strokes selected are Move's, with everything else: they stay
        // selected with the brush in hand, its palette restyling them; Luke
        // 2026-10-24)
        // (the drawing alone is the brush's: it ends when the brush is put
        // down, Luke 2026-10-06)
        if (!on && this.renderer.marksOnly) {
            this.renderer.marksOnly = false;
            this.refresh();
        }
        this.#palette(on && !this.#brushShut);
        // (the doodles window only when its switch on the brush window is on:
        // Luke 2026-10-25)
        this.#doodles(on && this.#doodlesOpen);
        if (!this.#doodlesOpen && this.controls.doodle) {
            this.#lastDoodle = this.controls.doodle;
            this.controls.doodle = null;
        }
        const here = Boolean(this.active && this.isBoard);
        // (Look is for looking: the selection let go; Luke 2026-10-25)
        if (here && game.activeTool === 'inspect' && (this.controls.count || this.controls.from)) {
            this.controls.clear();
            this.controls.from = null;
            this.drawMarks();
        }
        this.#stringWin(here && game.activeTool === 'string');
        this.#pinWin(here && game.activeTool === 'pin');
        this.#eraseWin(here && game.activeTool === 'erase');
        if (!(here && game.activeTool === 'pin') && this.#pinGhost && !this.#pinGhost.destroyed) this.#pinGhost.visible = false;
    }

    #doodlesOpen = Boolean(kept.get(DOODLES_OPEN));

    // every window of the board's put away (the scene left, the layer let go)
    #windows(on) {
        if (!on) carryWindows();
        this.#palette(on);
        this.#doodles(on);
        this.#stringWin(on);
        this.#pinWin(on);
        this.#eraseWin(on);
    }

    #palette(on) {
        let el = document.getElementById('heart-board-palette');
        if (!on) return el?.remove();
        const look = this.renderer.look;
        if (!look) return;
        if (!el) {
            // (a double-click on its head: the whole of it, the paints and
            // brightness alone, or its head alone; Luke 2026-10-25)
            el = floating('heart-board-palette', 'heart-board-palette', { at: PALETTE_AT, view: PALETTE_VIEW, views: ['full', 'palette', 'shut'], size: PALETTE_SIZE, moved: () => this.#dock() });
            el.addEventListener('click', (ev) => this.#onPalette(ev));
            // (pressed: the brush in hand, the doodle put down)
            el.addEventListener('pointerdown', () => this.#useBrush(), true);
            el.addEventListener('input', (ev) => {
                if (this.#onEraseInput(ev)) return;
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
            // (the selected strokes take the slider's width or opacity once
            // it is let go; Luke 2026-10-24)
            el.addEventListener('change', (ev) => {
                if (ev.target.matches('[data-opacity-range]')) this.#restyle({ o: this.markOpacity });
                if (ev.target.matches('[data-width-range]')) this.#restyle({ w: Math.min(this.markWidth, markMax(this.renderer.look, this.nib)) });
            });
        }
        const hex = (c) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
        // (Luke, 2026-10-03: the toolbar's glass, in plain sections)
        // (Luke, 2026-10-06: named, and as the chosen brightness shows them)
        const inks = paintOrder(look.ink.marker.length).map((i) => `<button type="button" data-ink="${i}" class="ink ${i === this.markInk ? 'on' : ''}" style="--ink:${hex(brushColor(look.ink.marker[i], this.markBright))}" data-tooltip="${esc(paintName(i))}" aria-label="${esc(paintName(i))}"></button>`).join('');
        const bright = ['dim', 'as-is', 'bright'].map((k, i) => `<button type="button" data-bright="${i}" class="${this.markBright === i ? 'on' : ''}" data-tooltip="${esc(loc(`heart.board.brush-${k}-hint`))}">${esc(loc(`heart.board.brush-${k}`))}</button>`).join('');
        const w = Math.min(this.markWidth, markMax(look, this.nib));
        const sliders = `<label class="slide"><span class="lab">${esc(loc('heart.board.mark-width'))}</span><input type="range" min="1" max="${markMax(look, this.nib)}" step="1" value="${w}" data-width-range><output data-width-out>${w}</output></label>
            <label class="slide"><span class="lab">${esc(loc('heart.board.mark-opacity'))}</span><input type="range" min="5" max="100" step="5" value="${Math.round(this.markOpacity * 100)}" data-opacity-range><output data-opacity-out>${Math.round(this.markOpacity * 100)}%</output></label>`;
        // (no Draw or Select: strokes are selected with Move, Luke 2026-10-24;
        // the strokes selected say so, the palette restyling them)
        const n = this.controls.markSel.size;
        const mode = n ? `<small class="restyle">${esc(loc('heart.board.mark-restyle-n', { n }))}</small><button type="button" data-mclear class="mclear" data-tooltip="${esc(loc('heart.board.mark-clear-hint'))}">${esc(loc('heart.board.mark-clear'))}</button>` : '';
        const alone = `<button type="button" data-alone class="switch ${this.renderer.marksOnly ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.mark-alone-hint'))}"><i class="fa-solid ${this.renderer.marksOnly ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.mark-alone'))}</button>`;
        const reset = game.user.isGM && !this.preview ? `<button type="button" data-reset-all class="all"><i class="fa-solid fa-eraser"></i> ${esc(loc('heart.board.brush-reset'))}</button>` : '';
        // (its head says nothing on hover: the pointer shows it drags; Luke
        // 2026-10-25)
        writeWindow(el, `<div class="sec head" data-grip><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.mark-palette'))}</b>${mode}${shutButton()}</div>
            <div class="sec inks-sec"><span class="lab">${esc(paintName(this.markInk))}</span><span class="inks">${inks}</span></div>
            <div class="sec bright-sec"><span class="lab">${esc(loc('heart.board.brush-light'))}</span><span class="seg">${bright}</span><span class="seg">${NIBS.map((k) => `<button type="button" data-nib="${k}" class="${this.nib === k ? 'on' : ''}" data-tooltip="${esc(loc(`heart.board.nib-${k}-hint`))}">${esc(loc(`heart.board.nib-${k}`))}</button>`).join('')}</span>${this.nib === 'wash' ? `<button type="button" data-wfill class="switch ${this.markFill ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.wash-fill-hint'))}"><i class="fa-solid ${this.markFill ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.wash-fill'))}</button>` : ''}<button type="button" data-doodles class="switch ${this.#doodlesOpen ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.doodles-open'))}"><i class="fa-solid ${this.#doodlesOpen ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.doodles'))}</button></div>
            <div class="sec more">${sliders}</div>
            <div class="sec more rub-sec"><span class="lab">${esc(loc('heart.board.brush-rub'))}</span>${this.#eraseControls(true)}</div>
            <div class="sec more">${alone}${reset}</div>`, () => this.syncPalette());
        el.classList.toggle('in-hand', !this.controls.doodle);
        placeKept(el, PALETTE_AT);
    }

    // the doodles window by the brush's (its right, else its left), until it
    // is moved by itself
    // (snapped to a side: its top bar level with the brush window's and as
    // tall, or above or below it and as wide; Luke 2026-10-25, controls.js
    // dockAt)
    #dock() {
        const el = document.getElementById('heart-board-doodles');
        const P = document.getElementById('heart-board-palette');
        if (!el || !P || kept.get(DOODLES_AT)) return;
        const D = dockAt(P.getBoundingClientRect(), el.getBoundingClientRect(), kept.get(DOODLES_DOCK) ?? 'auto', { w: window.innerWidth, h: window.innerHeight });
        if (D.h) el.style.height = `${Math.round(D.h)}px`;
        if (D.w) el.style.width = `${Math.round(D.w)}px`;
        placePalette(el, D.x, D.y);
    }

    // (the doodles window put back beside the brush window's, wherever it went)
    dockDoodles() {
        this.#dock();
    }

    // the doodles window let go: by the brush window, snapped to that side;
    // anywhere else, where it was let go
    #doodlesDropped() {
        const el = document.getElementById('heart-board-doodles');
        const P = document.getElementById('heart-board-palette');
        if (!el || !P) return;
        const side = snapSide(P.getBoundingClientRect(), el.getBoundingClientRect());
        if (!side) return this.syncPalette();
        kept.set(DOODLES_AT, null);
        kept.set(DOODLES_DOCK, side);
        this.syncPalette();
    }

    // this user's own kept drawings ({ id: drawing }; Luke 2026-10-25), read
    // from their user once a change
    #savedMemo = { raw: undefined, out: {} };
    #saved() {
        const raw = game.user.getFlag?.('heart', 'doodles');
        if (raw !== this.#savedMemo.raw) this.#savedMemo = { raw, out: cleanSavedDoodles(raw) };
        return this.#savedMemo.out;
    }

    #savedOf(kind) {
        return isSavedKind(kind) ? this.#saved()[String(kind).slice(6)] ?? null : null;
    }

    // The doodles window (Luke, 2026-10-25; a column by the rail before):
    // its size and turn (Shift+wheel and Ctrl+wheel too, the doodle in hand),
    // the selected strokes kept as a doodle of this user's own, then their
    // own and every doodle, each drawn as it will be laid down; pick one,
    // then click where it goes (again, or Escape, puts it down). Right-click
    // one of their own to forget it.
    #doodles(on) {
        let el = document.getElementById('heart-board-doodles');
        if (!on) return el?.remove();
        const r = this.renderer;
        if (!r.look || !r.painter) return;
        if (!el) {
            // (open or shut by its switch on the brush window, nothing between:
            // Luke 2026-10-25)
            // (sized: its tiles drawn again at their new size)
            const sized = () => {
                this.#dock();
                cancelAnimationFrame(this.#tilesFrame);
                this.#tilesFrame = requestAnimationFrame(() => this.#doodleTiles(document.getElementById('heart-board-doodles'), false));
            };
            el = floating('heart-board-doodles', 'heart-board-doodles', { at: DOODLES_AT, view: DOODLES_VIEW, views: ['full'], size: DOODLES_SIZE, moved: (why) => (why === 'size' ? sized() : why === 'dropped' ? this.#doodlesDropped() : null) });
            el.addEventListener('pointerdown', (ev) => this.#useDoodles(ev), true);
            el.addEventListener('click', (ev) => this.#onDoodles(ev));
            el.addEventListener('contextmenu', (ev) => this.#forgetDoodle(ev));
            el.addEventListener('input', (ev) => {
                if (ev.target.matches('[data-dsize]')) this.controls.doodleSize = Number(ev.target.value);
                else if (ev.target.matches('[data-drot]')) this.controls.doodleRot = Number(ev.target.value);
                else return;
                this.#doodleInputs();
                this.drawMarks();
            });
        }
        const keep = el.querySelector('.tiles')?.scrollTop ?? 0;
        const saved = this.#saved();
        const ids = Object.keys(saved).sort((x, y) => (saved[y].at ?? 0) - (saved[x].at ?? 0));
        // (the doodle in hand lit, the sliders and Mirror set, by #inHand and
        // #doodleInputs: never written here, so the window is rewritten only
        // when what it holds changes)
        const tile = (kind, title, cls = '') => `<button type="button" data-doodle="${esc(kind)}" class="${cls}" data-tooltip="${esc(title)}" aria-label="${esc(title)}"><canvas></canvas></button>`;
        const sel = this.controls.markSel.size;
        // (the GM's flourishes are theirs alone: a player sees their own, and
        // what is given them; Luke 2026-10-25)
        const tabs = doodleTabsFor(game.user.isGM);
        const tab = tabs.includes(kept.get(DOODLE_TAB)) ? kept.get(DOODLE_TAB) : tabs[0];
        const free = !kept.get(DOODLES_AT);
        const dock = free ? '' : `<button type="button" data-dock class="dock" data-tooltip="${esc(loc('heart.board.doodles-dock'))}" aria-label="${esc(loc('heart.board.doodles-dock'))}"><i class="fa-solid fa-link"></i></button>`;
        const shut = `<button type="button" data-dclose class="dock" data-tooltip="${esc(loc('heart.board.doodles-close'))}" aria-label="${esc(loc('heart.board.doodles-close'))}"><i class="fa-solid fa-xmark"></i></button>`;
        const wrote = writeWindow(el, `<div class="sec head" data-grip><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.doodles'))}</b>${dock}${shut}</div>
            <div class="sec body">
                <label class="slide"><span class="lab">${esc(loc('heart.board.doodle-size'))}</span><input type="range" min="${DOODLE_MIN}" max="${DOODLE_MAX}" step="5" data-dsize><output data-dsize-out></output></label>
                <label class="slide"><span class="lab">${esc(loc('heart.board.doodle-turn'))}</span><input type="range" min="-180" max="180" step="5" data-drot><output data-drot-out></output></label>
                <small>${esc(loc('heart.board.doodle-wheel'))}</small>
                <button type="button" data-dflip class="flip" data-tooltip="${esc(loc('heart.board.doodle-mirror-hint'))}"><i class="fa-solid fa-left-right"></i> ${esc(loc('heart.board.doodle-mirror'))}</button>
                <button type="button" data-dpick class="save pick ${this.#picking ? 'on' : ''}" aria-pressed="${this.#picking}" data-tooltip="${esc(loc('heart.board.doodle-pick-hint'))}"><i class="fa-solid fa-arrow-pointer"></i> ${esc(loc('heart.board.doodle-pick'))}</button>
                <button type="button" data-dsave class="save" ${sel ? '' : 'disabled'} data-tooltip="${esc(loc(sel ? 'heart.board.doodle-save-hint' : 'heart.board.doodle-save-none'))}"><i class="fa-solid fa-floppy-disk"></i> ${esc(sel ? loc('heart.board.doodle-save-n', { n: sel }) : loc('heart.board.doodle-save'))}</button>${sel ? `<button type="button" data-mclear class="save mclear" data-tooltip="${esc(loc('heart.board.mark-clear-hint'))}">${esc(loc('heart.board.mark-clear'))}</button>` : ''}
            </div>
            <div class="tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-dtab="${t}" class="${t === tab ? 'on' : ''}" aria-selected="${t === tab}">${esc(loc(`heart.board.doodles-${t}`))}</button>`).join('')}</div>
            <div class="tiles">${tab === 'yours' ? (ids.length ? ids.map((id) => tile(`saved:${id}`, loc('heart.board.doodle-yours-hint'), 'saved')).join('') : `<small class="empty">${esc(loc('heart.board.doodles-yours-empty'))}</small>`) : DOODLE_TABS[tab].map((k) => tile(k, loc(`heart.board.doodle.${k}`))).join('')}</div>`, () => this.syncPalette());
        // (the tiles painted when written, else only for a new size or tint)
        this.#doodleTiles(el, wrote);
        if (wrote) el.querySelector('.tiles').scrollTop = keep;
        this.#doodleInputs();
        this.#inHand();
        if (free) this.#dock();
        else placeKept(el, DOODLES_AT);
    }

    // Each doodle's tile as it will be laid down, at the tile's own size on
    // screen (five across, the tiles growing with the window): its painting
    // in white (doodleBake) scaled to the tile and tinted in the brush's
    // paint at its brightness; one of their own in its own paints (Luke,
    // 2026-10-25). `all` false: only when the size or the tint changed.
    #tilesFrame = 0;
    #doodleTiles(el, all = true) {
        const r = this.renderer;
        const first = el?.querySelector('[data-doodle] canvas');
        if (!first || !r.painter || !r.look) return;
        const px = Math.max(16, Math.round(first.getBoundingClientRect().width * (window.devicePixelRatio || 1)));
        const tint = brushColor(r.look.ink.marker[this.markInk] ?? 0xd8ccb4, this.markBright);
        const sig = `${px}|${tint}|${this.nib}`;
        if (!all && el.dataset.tileSig === sig) return;
        el.dataset.tileSig = sig;
        const hex = `#${(tint >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
        const paints = r.look.ink.marker.join();
        for (const b of el.querySelectorAll('[data-doodle]')) {
            const kind = b.dataset.doodle;
            const saved = this.#savedOf(kind);
            const bake = doodleBake(r.painter, kind, this.nib, saved, paints);
            const cv = b.querySelector('canvas');
            cv.width = cv.height = px;
            const g = cv.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(bake, 0, 0, px, px);
            if (saved) continue;
            // (the white multiplied by the paint, then cut back to the
            // doodle's own shape and see-through edges)
            g.globalCompositeOperation = 'multiply';
            g.fillStyle = hex;
            g.fillRect(0, 0, px, px);
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(bake, 0, 0, px, px);
            g.globalCompositeOperation = 'source-over';
        }
    }

    // the doodles window's size and turn as they are now
    #doodleInputs() {
        const el = document.getElementById('heart-board-doodles');
        if (!el) return;
        const set = (sel, v) => {
            const q = el.querySelector(sel);
            if (q && q !== document.activeElement) q.value = String(v);
        };
        set('[data-dsize]', this.controls.doodleSize);
        set('[data-drot]', this.controls.doodleRot);
        const o1 = el.querySelector('[data-dsize-out]');
        if (o1) o1.textContent = String(this.controls.doodleSize);
        const o2 = el.querySelector('[data-drot-out]');
        if (o2) o2.textContent = `${this.controls.doodleRot}${DEG_SIGN}`;
        const f = el.querySelector('[data-dflip]');
        if (f) {
            f.classList.toggle('on', this.controls.doodleFlip);
            f.setAttribute('aria-pressed', String(this.controls.doodleFlip));
        }
    }

    // which window holds what is in hand, and the doodle picked, lit
    #inHand() {
        const d = this.controls.doodle;
        document.getElementById('heart-board-palette')?.classList.toggle('in-hand', !d);
        const el = document.getElementById('heart-board-doodles');
        if (!el) return;
        el.classList.toggle('in-hand', Boolean(d));
        for (const b of el.querySelectorAll('[data-doodle]')) b.classList.toggle('on', b.dataset.doodle === d);
    }

    // the brush window pressed: the brush in hand
    #useBrush() {
        if (!this.controls.doodle) return;
        this.#lastDoodle = this.controls.doodle;
        this.controls.doodle = null;
        this.#inHand();
        this.drawMarks();
    }

    // the doodles window pressed: the doodle last in hand again (a doodle
    // pressed is picked by its click)
    #useDoodles(ev) {
        if (ev.target.closest('[data-doodle]') || this.controls.doodle || !this.#lastDoodle) return;
        if (isSavedKind(this.#lastDoodle) && !this.#savedOf(this.#lastDoodle)) return;
        this.controls.doodle = this.#lastDoodle;
        this.#inHand();
    }

    async #onDoodles(ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.doodle) {
            const k = b.dataset.doodle;
            this.controls.doodle = this.controls.doodle === k ? null : k;
            this.#lastDoodle = k;
            this.#inHand();
            return this.drawMarks();
        }
        if (b.dataset.dtab) {
            kept.set(DOODLE_TAB, b.dataset.dtab);
            return this.syncPalette();
        }
        if (b.dataset.dock !== undefined) {
            kept.set(DOODLES_AT, null);
            kept.set(DOODLES_DOCK, null);
            return this.syncPalette();
        }
        if (b.dataset.dclose !== undefined) {
            this.#doodlesOpen = false;
            kept.set(DOODLES_OPEN, false);
            this.drawMarks();
            if (this.#brushShut) return this.#toLook();
            return this.syncPalette();
        }
        if (b.dataset.dpick !== undefined) return this.#picking ? this.#endPicking(true) : this.#startPicking();
        if (b.dataset.dflip !== undefined) {
            this.controls.doodleFlip = !this.controls.doodleFlip;
            this.#doodleInputs();
            return this.drawMarks();
        }
        if (b.dataset.dsave !== undefined) {
            if (!this.controls.markSel.size) return;
            if (this.#picking) this.#endPicking(true);
            return this.#keepDoodle();
        }
        if (b.dataset.mclear !== undefined) {
            this.controls.markSel.clear();
            this.drawMarks();
            return this.syncPalette();
        }
    }

    // The one-time pick (Luke, 2026-10-25): Save with no strokes selected
    // takes the next click or box as Move would, strokes alone, the brush and
    // its windows staying; a right-click lets it go with nothing selected
    #picking = false;
    // (any stroke on the board, anyone's: Luke 2026-10-25)
    #startPicking() {
        this.#picking = true;
        this.controls.pickAny = true;
        this.controls.keepStrokesOnly();
        if (canvas.app?.view) canvas.app.view.style.cursor = 'crosshair';
        this.drawMarks();
        this.syncPalette();
    }

    #endPicking(keep = true) {
        this.#picking = false;
        this.controls.pickAny = false;
        if (canvas.app?.view) canvas.app.view.style.cursor = '';
        this.controls.keepStrokesOnly();
        if (!keep) this.controls.markSel.clear();
        this.drawMarks();
        this.syncPalette();
    }

    // the selected strokes kept as a doodle of this user's own (on their
    // user: theirs on every board, Luke 2026-10-25), and put in hand
    async #keepDoodle() {
        const d = savedDoodleOf(this.controls.selectedStrokes());
        if (!d) return ui.notifications.info(loc('heart.board.doodle-save-none'));
        const all = this.#saved();
        if (Object.keys(all).length >= SAVED_MAX) return ui.notifications.warn(loc('heart.board.doodle-save-full', { n: SAVED_MAX }));
        const id = foundry.utils.randomID(10);
        await game.user.setFlag('heart', 'doodles', { [id]: { ...d, at: Date.now() } });
        this.controls.doodle = `saved:${id}`;
        // (shown where it went: Luke 2026-10-25)
        kept.set(DOODLE_TAB, 'yours');
        this.#lastDoodle = this.controls.doodle;
        ui.notifications.info(loc('heart.board.doodle-saved'));
        this.syncPalette();
    }

    // a right-click on one of this user's own doodles: forgotten, once asked
    async #forgetDoodle(ev) {
        const b = ev.target.closest('[data-doodle]');
        if (!b || !isSavedKind(b.dataset.doodle)) return;
        ev.preventDefault();
        const ok = await askBoard({ title: loc('heart.board.doodle-forget'), content: loc('heart.board.doodle-forget-confirm'), yes: loc('heart.board.doodle-forget'), no: loc('heart.board.ask.keep-it') });
        if (!ok) return;
        const id = b.dataset.doodle.slice(6);
        await game.user.unsetFlag('heart', `doodles.${id}`);
        if (this.controls.doodle === b.dataset.doodle) this.controls.doodle = null;
        if (this.#lastDoodle === b.dataset.doodle) this.#lastDoodle = null;
        this.syncPalette();
    }

    // The String window (Luke, 2026-10-25), while String is in hand: a new
    // string's kind (the GM's and a players' board's owners'), its paint (the
    // kind's own colour too, theirs), and the pin its ends are (any of the
    // look's, or the kind's own), with a little of the string as it will be.
    // Moved by its head, its corner widening it; a double-click on its head
    // folds it.
    #pins = null;
    #stringWin(on) {
        let el = document.getElementById('heart-board-string');
        if (!on) return el?.remove();
        const look = this.renderer.look;
        if (!look || !this.renderer.painter) return;
        this.#loadPins();
        if (!el) {
            el = floating('heart-board-string', 'heart-board-palette heart-board-string', { at: STRING_AT, view: STRING_VIEW, views: ['full', 'shut'], size: STRING_SIZE });
            el.addEventListener('click', (ev) => this.#onString(ev));
        }
        const hex = (c) => `#${(Number(c) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
        const player = !this.controls.editor;
        const kind = player ? 'plain' : this.#lastKind;
        const pick = player ? this.#lastColor : this.#gmColor;
        // (one under another, by name: the preview shows each; Luke 2026-10-25)
        const kinds = player ? '' : `<div class="sec kinds-sec"><span class="lab">${esc(loc('heart.board.kind'))}</span><span class="kinds">${LINK_KINDS.map((k) => `<button type="button" data-skind="${k}" class="${kind === k ? 'on' : ''}">${esc(loc(`heart.board.kind-${k}`))}</button>`).join('')}</span></div>`;
        const none = loc(player || kind === 'plain' ? 'heart.board.string-color-none' : 'heart.board.string-color-own');
        const own = `<button type="button" data-scolor="" class="any ${pick === null || pick === undefined ? 'on' : ''}">${esc(none)}</button>`;
        const inks = paintOrder(look.ink.marker.length).map((i) => `<button type="button" data-scolor="${i}" class="ink ${i === pick ? 'on' : ''}" style="--ink:${hex(look.ink.marker[i])}" data-tooltip="${esc(paintName(i))}" aria-label="${esc(paintName(i))}"></button>`).join('');
        const pins = this.#pins.ids.map((id) => `<button type="button" data-spin="${esc(id)}" class="pin ${id === this.#stringPin ? 'on' : ''}" data-tooltip="${esc(pinName(id))}" aria-label="${esc(pinName(id))}"><img src="${esc(textureUrl(this.#pins.textures, id))}" alt=""></button>`).join('');
        const wrote = writeWindow(el, `<div class="sec head" data-grip><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.string-win'))}</b>${shutButton()}</div>
            <div class="sec preview"><canvas width="260" height="70" data-spreview></canvas></div>
            ${kinds}
            <div class="sec inks-sec"><span class="lab">${esc(pick === null || pick === undefined ? none : paintName(pick))}</span>${own ? `<div class="any-row">${own}</div>` : ''}<span class="inks">${inks}</span></div>
            <div class="sec pins-sec"><span class="lab">${esc(loc('heart.board.string-pin'))}</span><button type="button" data-stint class="switch tint ${this.#stringTint ? 'on' : ''}" data-tooltip="${esc(loc('heart.board.string-pin-tint-hint'))}"><i class="fa-solid ${this.#stringTint ? 'fa-toggle-on' : 'fa-toggle-off'}"></i> ${esc(loc('heart.board.string-pin-tint'))}</button><span class="pins"><button type="button" data-spin="" class="any ${this.#stringPin ? '' : 'on'}" data-tooltip="${esc(loc('heart.board.string-pin-any'))}">${esc(loc('heart.board.any'))}</button>${pins}</span></div>`, () => this.syncPalette());
        if (wrote) {
            // (each pin stood upright and cut to itself, as the Pin tool's)
            for (const im of el.querySelectorAll('[data-spin] img')) {
                const swap = () => im.replaceWith(pinThumb(im, im.closest('[data-spin]').dataset.spin, 64));
                if (im.complete && im.naturalWidth) swap();
                else im.addEventListener('load', swap, { once: true });
            }
            this.#stringPreview(el, kind, pick);
        }
        placeKept(el, STRING_AT);
    }

    // a little of the string as it will be: its rope in its paint, sagging
    // between two of its pins
    #stringPreview(el, kind, color) {
        const cv = el.querySelector('[data-spreview]');
        const look = this.renderer.look;
        const painter = this.renderer.painter;
        if (!cv || !look || !painter) return;
        const g = cv.getContext('2d');
        const k = 0.5;
        const W = cv.width / k;
        const H = cv.height / k;
        const pts = [];
        for (let i = 0; i <= 32; i++) {
            const t = i / 32;
            pts.push(40 + t * (W - 80), 34 + Math.sin(Math.PI * t) * (H - 70));
        }
        g.clearRect(0, 0, cv.width, cv.height);
        g.save();
        g.scale(k, k);
        try {
            painter.drawLink(g, { id: 'string-window', kind, color: color ?? null, points: pts, look: 'known' });
        } catch {
            // (its rope not yet loaded)
        }
        g.restore();
        // (its two pins as the board draws them, in its colour or their own)
        const fam = look.pools.ends?.[kind]?.length ? look.pools.ends[kind] : look.pools.pins;
        const tex = this.#stringPin ?? pickFrom(fam, `string-window:${kind}`);
        if (!tex || !painter.drawPin) return;
        const tint = pinTint(look, { kind, color: color ?? null, plainPins: !this.#stringTint }, tex);
        const w = Math.max(11, look.scrap.w * 0.13 * 0.85) * pinScale(tex);
        g.save();
        g.scale(k, k);
        let done = true;
        for (const [x, y] of [[pts[0], pts[1]], [pts[pts.length - 2], pts[pts.length - 1]]]) done = painter.drawPin(g, tex, x, y, w, 0, tint) && done;
        g.restore();
        // (a picture not yet in: drawn again shortly)
        if (!done) setTimeout(() => cv.isConnected && this.#stringPreview(el, kind, color), 300);
    }

    // the look's pins, as pictures: loaded once for the board's look, then the
    // windows again (Luke, 2026-10-25: the first board's were kept for good,
    // another style's board and a reloaded look offered the old pins)
    #loadPins() {
        const now = this.renderer.look;
        if (this.#pins?.look === now) return;
        this.#pins = { look: now, ids: [], textures: {} };
        loadBoardLook(canvas.scene).then(({ look: L, textures }) => {
            if (this.#pins?.look !== now) return;
            const ids = pinChoices(L, Object.keys(textures ?? {})).filter((id) => textureUrl(textures, id));
            this.#pins = { look: now, ids, textures: textures ?? {} };
            // (a string's pin kept that this look has no more: its kind's own)
            if (this.#stringPin && !ids.includes(this.#stringPin)) this.#stringPin = null;
            this.syncPalette();
        }).catch((err) => console.warn('heart | the pins could not be listed', err));
    }

    // The Pin window (Luke, 2026-10-25), while the Pin tool is in hand: every
    // pin the look has, the one picked put in with a click (stuck in the card
    // under it, or loose) and shown under the pointer first; a large picture
    // of it on top. Moved, sized, and folded as the others.
    #pinTex = (() => {
        try {
            return localStorage.getItem(LAST_PIN) || null;
        } catch {
            return null;
        }
    })();

    #pinPick() {
        const ids = this.#pins?.ids ?? [];
        if (this.#pinTex && (!ids.length || ids.includes(this.#pinTex))) return this.#pinTex;
        return ids[0] ?? null;
    }

    #pinPaint = Number.isFinite(kept.get(PIN_PAINT)) ? kept.get(PIN_PAINT) : null;
    #pinWin(on) {
        let el = document.getElementById('heart-board-pinwin');
        if (!on) return el?.remove();
        if (!this.renderer.look) return;
        this.#loadPins();
        if (!el) {
            el = floating('heart-board-pinwin', 'heart-board-palette heart-board-string heart-board-pinwin', { at: PINWIN_AT, view: PINWIN_VIEW, views: ['full', 'shut'], size: PINWIN_SIZE });
            el.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-wclose]')) return this.#toLook();
                // (a new pin's paint: none, its own colour; Luke 2026-10-25)
                const pp = ev.target.closest('[data-ppaint]');
                if (pp) {
                    this.#pinPaint = pp.dataset.ppaint === '' ? null : Number(pp.dataset.ppaint);
                    kept.set(PIN_PAINT, this.#pinPaint);
                    this.#pinGhostKey = '';
                    return this.syncPalette();
                }
                const b = ev.target.closest('[data-pin]');
                if (!b) return;
                this.#pinTex = b.dataset.pin;
                try {
                    localStorage.setItem(LAST_PIN, this.#pinTex);
                } catch {
                    // (a private window: not remembered)
                }
                this.#pinGhostKey = '';
                this.syncPalette();
            });
        }
        const pick = this.#pinPick();
        const tiles = this.#pins.ids.map((id) => `<button type="button" data-pin="${esc(id)}" class="pin ${id === pick ? 'on' : ''}" data-tooltip="${esc(pinName(id))}" aria-label="${esc(pinName(id))}"><img src="${esc(textureUrl(this.#pins.textures, id))}" alt=""></button>`).join('');
        const wrote = writeWindow(el, `<div class="sec head" data-grip><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.pin-window'))}</b>${shutButton()}</div>
            <div class="sec preview pin-preview"><canvas width="96" height="96" data-ppreview></canvas><small>${esc(loc('heart.board.pin-window-hint'))}</small></div>
            <div class="sec pins-sec"><span class="lab">${esc(pick ? pinName(pick) : loc('heart.board.string-pin'))}</span><span class="pins">${tiles}</span></div>
            <div class="sec inks-sec"><span class="lab">${esc(this.#pinPaint === null ? loc('heart.board.pin-paint-none') : paintName(this.#pinPaint))}</span><div class="any-row"><button type="button" data-ppaint="" class="any ${this.#pinPaint === null ? 'on' : ''}">${esc(loc('heart.board.pin-paint-none'))}</button></div><span class="inks">${paintOrder(this.renderer.look.ink.marker.length).map((i) => `<button type="button" data-ppaint="${i}" class="ink ${i === this.#pinPaint ? 'on' : ''}" style="--ink:#${(this.renderer.look.ink.marker[i] >>> 0).toString(16).padStart(6, '0').slice(-6)}" data-tooltip="${esc(paintName(i))}" aria-label="${esc(paintName(i))}"></button>`).join('')}</span></div>`, () => this.syncPalette());
        // (each pin stood upright and cut to itself; the one picked large)
        if (wrote) for (const im of el.querySelectorAll('[data-pin] img')) {
            const id = im.closest('[data-pin]').dataset.pin;
            const swap = () => {
                if (id === pick) {
                    const cv = el.querySelector('[data-ppreview]');
                    cv?.getContext('2d').drawImage(pinThumb(im, id, 96), 0, 0);
                }
                im.replaceWith(pinThumb(im, id, 64));
            };
            if (im.complete && im.naturalWidth) swap();
            else im.addEventListener('load', swap, { once: true });
        }
        placeKept(el, PINWIN_AT);
    }

    // The eraser's size and mode (Luke, 2026-10-25): the Erase window's, and
    // the brush window's for Shift+drag; the same eraser in both
    #eraseControls(brush = false) {
        const now = brush ? this.brushEraseMode : this.eraseMode;
        const modes = ['parts', 'whole'].map((k) => `<button type="button" data-emode="${k}" ${brush ? 'data-ebrush' : ''} class="${now === k ? 'on' : ''}" data-tooltip="${esc(loc(`heart.board.erase-${k}-hint`))}">${esc(loc(`heart.board.erase-${k}`))}</button>`).join('');
        return `<label class="slide"><span class="lab">${esc(loc('heart.board.erase-size'))}</span><input type="range" min="${ERASE_MIN}" max="${ERASE_MAX}" step="1" value="${this.eraseSize}" data-esize><output data-esize-out>${this.eraseSize}</output></label>
            <span class="seg">${modes}</span>`;
    }

    // the size slider moved, in either window
    #onEraseInput(ev) {
        if (!ev.target.matches('[data-esize]')) return false;
        this.#setEraser({ size: Number(ev.target.value) }, ev.target);
        return true;
    }

    // the eraser's size or mode changed: kept, and both windows show it
    #setEraser({ size, mode, brush = false } = {}, from = null) {
        if (size !== undefined) {
            this.eraseSize = Math.max(ERASE_MIN, Math.min(ERASE_MAX, Math.round(Number(size) || 14)));
            kept.set(ERASE_SIZE, this.eraseSize);
            for (const q of document.querySelectorAll('[data-esize]')) if (q !== from) q.value = String(this.eraseSize);
            for (const o of document.querySelectorAll('[data-esize-out]')) o.textContent = String(this.eraseSize);
        }
        if (mode !== undefined) {
            const m = mode === 'whole' ? 'whole' : 'parts';
            if (brush) {
                this.brushEraseMode = m;
                kept.set(BRUSH_ERASE_MODE, m);
            } else {
                this.eraseMode = m;
                kept.set(ERASE_MODE, m);
            }
            for (const b of document.querySelectorAll('[data-emode]')) if (b.hasAttribute('data-ebrush') === brush) b.classList.toggle('on', b.dataset.emode === m);
        }
        this.drawMarks();
    }

    // The Erase window, while Erase is in hand (Luke, 2026-10-25): its size
    // (Ctrl+wheel too) and what it takes, the part it passes over or each
    // whole stroke it touches. Its x puts Erase down for Look.
    #eraseWin(on) {
        let el = document.getElementById('heart-board-erasewin');
        if (!on) return el?.remove();
        if (!el) {
            el = floating('heart-board-erasewin', 'heart-board-palette heart-board-string heart-board-erasewin', { at: ERASEWIN_AT, view: ERASEWIN_VIEW, views: ['full', 'shut'], size: ERASEWIN_SIZE });
            el.addEventListener('click', (ev) => {
                const b = ev.target.closest('button');
                if (!b) return;
                if (b.dataset.wclose !== undefined) return this.#toLook();
                if (b.dataset.emode) this.#setEraser({ mode: b.dataset.emode });
            });
            el.addEventListener('input', (ev) => this.#onEraseInput(ev));
        }
        writeWindow(el, `<div class="sec head" data-grip><i class="fa-solid fa-grip-vertical grip"></i><b>${esc(loc('heart.board.erase-window'))}</b>${shutButton()}</div>
            <div class="sec erase-sec">${this.#eraseControls()}<small>${esc(loc('heart.board.erase-window-hint'))}</small></div>`, () => this.syncPalette());
        placeKept(el, ERASEWIN_AT);
    }

    #onString(ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.wclose !== undefined) return this.#toLook();
        if (b.dataset.skind) this.#lastKind = b.dataset.skind;
        if (b.dataset.scolor !== undefined) {
            const c = b.dataset.scolor === '' ? null : Number(b.dataset.scolor);
            if (this.controls.editor) this.#gmColor = c;
            else this.#lastColor = c;
        }
        if (b.dataset.spin !== undefined) {
            this.#stringPin = b.dataset.spin || null;
            kept.set(STRING_PIN, this.#stringPin);
        }
        if (b.dataset.stint !== undefined) {
            this.#stringTint = !this.#stringTint;
            kept.set(STRING_TINT, this.#stringTint);
        }
        this.syncPalette();
    }

    // The selected strokes (picked with Move) in the palette's paint,
    // brightness, width, or opacity (Luke, 2026-10-24): each one this user
    // may change, as one edit
    #restyle(style) {
        const patch = this.controls.restylePatch(style);
        if (patch) this.#write(patch);
    }

    async #onPalette(ev) {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.emode) return this.#setEraser({ mode: b.dataset.emode, brush: true });
        // (the selected strokes let go: Luke 2026-10-25)
        if (b.dataset.mclear !== undefined) {
            this.controls.markSel.clear();
            this.drawMarks();
            return this.syncPalette();
        }
        // (the brush window shut: the doodles kept if open, a doodle in hand)
        if (b.dataset.wclose !== undefined) {
            this.#brushShut = true;
            if (!this.#doodlesOpen) return this.#toLook();
            if (!this.controls.doodle && this.#lastDoodle) this.controls.doodle = this.#lastDoodle;
            return this.syncPalette();
        }
        if (b.dataset.ink) {
            this.markInk = Number(b.dataset.ink);
            this.#restyle({ c: this.markInk });
        }
        if (b.dataset.bright !== undefined) {
            this.markBright = Number(b.dataset.bright);
            this.#restyle({ b: this.markBright });
        }
        // (the nib: Pen or Brush, each stroke its own; Luke 2026-10-25)
        if (b.dataset.nib) {
            this.markNib = NIBS.includes(b.dataset.nib) ? b.dataset.nib : 'brush';
            kept.set(MARK_NIB, this.markNib);
            this.#restyle({ n: this.markNib });
        }
        // (the wash's Fill: the shape each stroke closes, filled)
        if (b.dataset.wfill !== undefined) {
            this.markFill = !this.markFill;
            kept.set(MARK_FILL, this.markFill);
        }
        if (b.dataset.alone !== undefined) {
            this.renderer.marksOnly = !this.renderer.marksOnly;
            await this.refresh();
        }
        // (the doodles window opened or shut, as this client last left it)
        if (b.dataset.doodles !== undefined) {
            this.#doodlesOpen = !this.#doodlesOpen;
            kept.set(DOODLES_OPEN, this.#doodlesOpen);
            this.drawMarks();
        }
        if (b.dataset.resetAll !== undefined) {
            const ok = await askBoard({ title: loc('heart.board.brush-reset'), content: loc('heart.board.brush-reset-confirm'), yes: loc('heart.board.ask.rub-out-all'), no: loc('heart.board.ask.keep-them') });
            if (ok) await clearAllBrushes(canvas.scene);
        }
        this.syncPalette();
    }
}
