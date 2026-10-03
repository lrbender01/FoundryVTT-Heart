// Book art (2026-10-01). fvtt-heart-content gives each class, calling and
// ancestry flags.fvtt-heart-content.art = { src, ar, card, item, band }: the
// image, its width / height, and how to frame it in each place the system
// shows a crop of it (the Choose card, the item sheet's banner, the character
// sheet's art banner). Gear with art (equipment, resources, items) has
// { src, ar, item, row }: the item sheet's banner and the background of the
// item's row. A class may add alts (alternate pieces a player can pick for
// their character), gallery (drawings only shown in the art viewer), and
// gear (its starting equipment's art, keyed by the child's id). Without that
// module (or for anything else) there is no art and every place below
// renders nothing, so the system ships no art of its own.
//
// Framing: each place is a canvas. z is the zoom in % (100 = the art just
// covers the canvas, lower shows more of it), x / y the art's centre as % of
// the canvas, and for gear an optional r, the art's rotation in degrees
// about its centre (sized before it turns). The layout is pure CSS (art.sass, container query units), so
// it holds at any card or window size.
import './art.sass';
import { FITTED, zoomAt, panBy, wheelFactor } from './art-zoom';

const CONTENT = 'fvtt-heart-content';
const ART_FLAG = `flags.${CONTENT}.art`;
const ART_TYPES = new Set(['class', 'calling', 'ancestry']);
const GEAR_TYPES = new Set(['equipment', 'resource', 'item']);
// actors with a sheet banner (common/banner.js)
const BANNER_ACTORS = new Set(['landmark', 'adversary', 'hireling']);
// the piece a player picked for their character's class (0 = the main one)
const VARIANT_FLAG = 'artVariant';

const flagArt = (doc) => {
    const art = doc ? foundry.utils.getProperty(doc, ART_FLAG) : null;
    return art?.src ? art : null;
};

// The art as the content module framed it, before any player's pick
function baseArt(doc) {
    if (!doc) return null;
    // a landmark, adversary, or companion (2026-10-02) in the world takes its
    // pack entry's art first, like the items below
    if (doc.documentName === 'Actor') return BANNER_ACTORS.has(doc.type) && !doc.pack ? packArt(doc) ?? flagArt(doc) : flagArt(doc);
    if (doc.documentName !== 'Item') return flagArt(doc);
    // a class's starting equipment: framed on the class's own art
    if (doc.isChild) {
        const parent = doc.parentItem;
        if (parent?.type === 'class') {
            // by the child's id, else its name (a copy made before a slug
            // rename has the old id, e.g. the Heretic's candle, 2026-10-01)
            const gear = baseArt(parent)?.gear;
            return gear?.[doc.id] ?? Object.values(gear ?? {}).find(g => g?.name === doc.name) ?? flagArt(doc);
        }
        return flagArt(doc);
    }
    // a class / calling / ancestry or piece of gear outside the packs (on a
    // character, or in the world) takes its pack entry's art first: the
    // content module owns the framing, so re-tuned placements reach existing
    // characters
    if (!doc.pack && (ART_TYPES.has(doc.type) || GEAR_TYPES.has(doc.type))) return packArt(doc) ?? flagArt(doc);
    return flagArt(doc);
}

export function artOf(doc) {
    const art = baseArt(doc);
    if (!art) return null;
    // the player's pick among a class's pieces (the art viewer sets it)
    const k = Number(doc.flags?.heart?.[VARIANT_FLAG]) || 0;
    const alt = k > 0 ? art.alts?.[k - 1] : null;
    return alt?.src ? { ...art, ...alt } : art;
}

// The art on the pack entry a document came from, else on the content
// module's entry of the same type and name that has art (copies made before
// the art existed, or with no source recorded). The packs' indexes carry the
// flag (registerArtHelpers), so this loads no documents.
function packArt(doc) {
    const source = doc._stats?.compendiumSource ?? doc.flags?.core?.sourceId;
    const art = source ? flagArt(fromUuidSync(source, { strict: false })) : null;
    if (art) return art;
    for (const pack of game.packs ?? []) {
        if (pack.metadata.packageName !== CONTENT || pack.documentName !== doc.documentName) continue;
        const entry = pack.index.find(e => e.type === doc.type && e.name === doc.name && flagArt(e));
        if (entry) return flagArt(entry);
    }
    return null;
}

// ---------------------------------------------------------------- galleries
// One gallery for every sheet (2026-10-02, Luke): a sheet's gallery holds
// every piece of art the sheet shows, and a class, calling, or ancestry
// piece with alternates can be picked as the character's key art. A piece:
//   { src, ar, label, doc, variant }
// doc: the document it is the art of (null for a decoration); variant: 0
// for the main piece, 1..n for alternates (a key-art pick), null for a
// drawing that can't be picked (gallery drawings, gear, decorations).

// the item types whose art a player may pick for their character
const KEY_ART_TYPES = new Set(['class', 'calling', 'ancestry']);

// Every piece of one document's art: the main piece and its alternates,
// then the book's other drawings
export function piecesOf(doc, label) {
    const art = baseArt(doc);
    if (!art) return [];
    const group = label ?? localizeHeart(doc.name);
    const main = [art, ...(art.alts ?? [])].filter(p => p?.src).map((p, variant) => ({ src: p.src, ar: p.ar, label: group, doc, variant }));
    const gallery = (art.gallery ?? []).filter(p => p?.src).map(p => ({ src: p.src, ar: p.ar, label: group, doc, variant: null }));
    return [...main, ...gallery];
}

// (the name the art viewer used before galleries took several documents)
export const artPieces = (doc) => piecesOf(doc);

// A piece no one picks: gear art, a decoration, a banner of fixed art
export function plainPiece(src, label = '', ar = null) {
    return src ? { src, ar, label, doc: null, variant: null } : null;
}

// The gear on a sheet that shows art: one piece each
export function gearPieces(items) {
    return [...(items ?? [])].map(item => plainPiece(artOf(item)?.src, localizeHeart(item.name), artOf(item)?.ar)).filter(Boolean);
}

// Each drawing once, in order (a drawing shared by several items appears once)
export function uniquePieces(pieces) {
    const seen = new Set();
    return pieces.filter(p => p?.src && !seen.has(p.src) && seen.add(p.src));
}

// The piece a document shows now: its key-art pick (0 = the main one)
export function currentVariant(doc) {
    return Number(doc?.flags?.heart?.[VARIANT_FLAG]) || 0;
}

// May this user pick this document's key art? A character's own class,
// calling, or ancestry with alternates to pick from.
export function canPickKeyArt(doc) {
    return Boolean(doc && doc.documentName === 'Item' && KEY_ART_TYPES.has(doc.type) && doc.isEmbedded
        && !doc.isChild && doc.isOwner && baseArt(doc)?.alts?.length);
}

// Open a gallery: one piece in Foundry's image viewer; several (or one that
// can be picked) in the art viewer, starting at `start`
export function showGallery(pieces, { title = '', start = 0 } = {}) {
    const list = uniquePieces(pieces);
    if (!list.length) return;
    if (list.length === 1 && !canPickKeyArt(list[0].doc)) {
        new ImagePopout(list[0].src, { title, shareable: false }).render(true);
        return;
    }
    new ArtViewer(list, { title, start }).render(true);
}

// The index of a document's current piece in a gallery (where to open it)
export function startAt(pieces, doc) {
    const list = uniquePieces(pieces);
    const i = list.findIndex(p => p.doc === doc && p.variant === currentVariant(doc));
    return Math.max(0, i >= 0 ? i : list.findIndex(p => p.doc === doc));
}

// The crop for one place, as markup: an absolutely positioned canvas that
// fills its (position: relative) parent
export function artCanvas(art, place, extraClass = '') {
    if (!art) return '';
    const p = art[place] ?? { z: 100, x: 50, y: 50 };
    // r: gear art may be turned to fit its canvas (degrees, about its centre)
    const style = `--ar:${Number(art.ar) || 1};--z:${p.z / 100};--x:${p.x / 100};--y:${p.y / 100};--r:${Number(p.r) || 0}deg`;
    return `<div class="heart-art-canvas ${extraClass}" aria-hidden="true"><img src="${Handlebars.escapeExpression(art.src)}" alt="" draggable="false" style="${style}"></div>`;
}

// One document's art (a landmark's banner and extras, a class and its
// alternates): its gallery, opened at the piece it shows now
export function showArt(doc) {
    const pieces = piecesOf(doc);
    showGallery(pieces, { title: doc ? localizeHeart(doc.name) : '', start: startAt(pieces, doc) });
}

// The index of the piece with this picture in a gallery (where to open it
// for a clicked decoration; 0 when it isn't there)
export function startAtSrc(pieces, src) {
    return Math.max(0, uniquePieces(pieces).findIndex(p => p.src === src));
}

// The art viewer (2026-10-01, Luke: "both picker and gallery"; one viewer for
// every sheet's gallery since 2026-10-02): one piece at a time, arrows (or
// the arrow keys) to page, a count, whose art it is and what kind. A piece
// of a character's own class, calling, or ancestry with alternates offers
// "Use for this character", which sets the art its banner and sheet show.
class ArtViewer extends Application {
    constructor(pieces, { title = '', start = 0, ...options } = {}) {
        super(options);
        this.pieces = pieces;
        this.galleryTitle = title;
        this.index = Math.min(Math.max(0, start), pieces.length - 1);
        // zoom and pan (art-zoom.js); each piece opens fitted
        this.view = FITTED;
    }

    static get defaultOptions() {
        const h = Math.round(window.innerHeight * 0.82);
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['heart', 'heart-art-viewer'],
            width: Math.min(Math.round(window.innerWidth * 0.8), Math.round(h * 0.85)),
            height: h,
            resizable: true,
        });
    }

    get title() {
        return this.galleryTitle || localizeHeart(this.pieces[this.index]?.label ?? '');
    }

    async _renderInner() {
        const p = this.pieces[this.index];
        const doc = p.doc;
        const t = (k) => game.i18n.localize(`heart.art.${k}`);
        const pickable = canPickKeyArt(doc);
        // what the piece is: key art and alternates only where there is a
        // choice; the book's other drawings; nothing more for a decoration
        const kind = p.variant === null ? (doc ? t('gallery') : '')
            : pickable ? (p.variant === 0 ? t('main') : t('alternate')) : '';
        let pick = '';
        if (p.variant !== null && pickable) {
            pick = p.variant === currentVariant(doc)
                ? `<span class="art-pick on">${t('in-use')}</span>`
                : `<a class="art-pick" data-action="pick">${t('use')}</a>`;
        }
        const esc = Handlebars.escapeExpression;
        const what = [p.label, kind].filter(Boolean).map(esc).join(' &middot; ');
        const steps = this.pieces.length > 1
            ? `<a class="art-step prev" data-action="prev" aria-label="${t('previous')}"><i class="fas fa-chevron-left"></i></a>
            <a class="art-step next" data-action="next" aria-label="${t('next')}"><i class="fas fa-chevron-right"></i></a>`
            : '';
        return $(`<div class="art-viewer">
            <div class="art-stage"><img src="${esc(p.src)}" alt="${esc(p.label ?? '')}"></div>
            ${steps}
            <div class="art-caption"><span class="art-count">${this.index + 1} / ${this.pieces.length}</span><span class="art-kind">${what}</span>${pick}</div>
        </div>`);
    }

    step(by) {
        this.index = (this.index + by + this.pieces.length) % this.pieces.length;
        this.view = FITTED;
        this.render();
    }

    // Zoom to the cursor and drag to pan (2026-10-02, Luke): the wheel zooms
    // about the point under the pointer, a drag pans a zoomed piece, a
    // double-click fits it again
    _activateZoom(html) {
        const stage = html.find('.art-stage')[0];
        const img = stage?.querySelector('img');
        if (!stage || !img) return;
        const size = () => ({ w: stage.clientWidth, h: stage.clientHeight });
        const apply = () => {
            const v = this.view;
            img.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
            stage.classList.toggle('zoomed', v.k > 1);
        };
        apply();
        stage.addEventListener('wheel', ev => {
            ev.preventDefault();
            const r = stage.getBoundingClientRect();
            this.view = zoomAt(this.view, { x: ev.clientX - r.left, y: ev.clientY - r.top }, wheelFactor(ev.deltaY), size());
            apply();
        }, { passive: false });
        let drag = null;
        stage.addEventListener('pointerdown', ev => {
            if (ev.button !== 0 || this.view.k <= 1) return;
            ev.preventDefault();
            drag = { x: ev.clientX, y: ev.clientY };
            stage.setPointerCapture(ev.pointerId);
            stage.classList.add('dragging');
        });
        stage.addEventListener('pointermove', ev => {
            if (!drag) return;
            this.view = panBy(this.view, ev.clientX - drag.x, ev.clientY - drag.y, size());
            drag = { x: ev.clientX, y: ev.clientY };
            apply();
        });
        const end = () => { drag = null; stage.classList.remove('dragging'); };
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);
        stage.addEventListener('dblclick', ev => {
            ev.preventDefault();
            this.view = FITTED;
            apply();
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('[data-action=prev]').click(ev => { ev.preventDefault(); this.step(-1); });
        html.find('[data-action=next]').click(ev => { ev.preventDefault(); this.step(1); });
        this._activateZoom(html);
        html.find('[data-action=pick]').click(async ev => {
            ev.preventDefault();
            const p = this.pieces[this.index];
            if (!canPickKeyArt(p.doc)) return;
            await p.doc.setFlag('heart', VARIANT_FLAG, p.variant);
            this.render();
        });
        // arrow keys page while the viewer is the window in front
        const el = this.element[0];
        if (el && !el.dataset.keys) {
            el.dataset.keys = '1';
            el.tabIndex = -1;
            el.addEventListener('keydown', ev => {
                if (ev.key === 'ArrowLeft') this.step(-1);
                else if (ev.key === 'ArrowRight') this.step(1);
            });
            el.focus();
        }
    }
}

export function registerArtHelpers() {
    // index the art flag (must happen at init, before the packs index), so
    // packArt and the Choose picker read it without loading documents
    for (const type of ['Item', 'Actor']) {
        const fields = (CONFIG[type].compendiumIndexFields ??= []);
        if (!fields.includes(ART_FLAG)) fields.push(ART_FLAG);
    }
    // {{{heartArt item "item"}}} (a document) / {{{heartArt entry.art "card"
    // class="..."}}} (the art itself, as the Choose picker's entries carry it)
    const artFrom = (x) => (x?.src && x?.ar ? x : artOf(x));
    Handlebars.registerHelper('heartArt', (doc, place, options) =>
        new Handlebars.SafeString(artCanvas(artFrom(doc), place, typeof options?.hash?.class === 'string' ? options.hash.class : '')));
    Handlebars.registerHelper('heartHasArt', (doc) => Boolean(artOf(doc)));
    // gear framed for its row (classes and the like have no row framing)
    Handlebars.registerHelper('heartHasRowArt', (doc) => Boolean(artOf(doc)?.row));
}
