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

// Every piece the art viewer pages through: the main piece and the alts
// (pickable, `variant` 0..n), then the gallery drawings
export function artPieces(doc) {
    const art = baseArt(doc);
    if (!art) return [];
    const main = [art, ...(art.alts ?? [])].filter(p => p?.src).map((p, variant) => ({ src: p.src, ar: p.ar, variant }));
    const gallery = (art.gallery ?? []).filter(p => p?.src).map(p => ({ src: p.src, ar: p.ar, variant: null }));
    return [...main, ...gallery];
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

// The whole piece: one piece in Foundry's image viewer, sized to the art's
// own proportions within the screen (ImagePopout does that; no Show
// Players); several (a class with alternates or gallery drawings) in the
// art viewer, which pages through them
export function showArt(doc) {
    const pieces = artPieces(doc);
    if (!pieces.length) return;
    if (pieces.length === 1) {
        new ImagePopout(pieces[0].src, { title: localizeHeart(doc.name), shareable: false, uuid: doc.uuid }).render(true);
        return;
    }
    new ArtViewer(doc, pieces).render(true);
}

// The art viewer (2026-10-01, Luke: "both picker and gallery"): one piece at
// a time, arrows (or the arrow keys) to page, a count and what the piece is.
// On a character's own class the main piece and the alternates offer "Use
// for this character", which sets the art its banner and class sheet show.
class ArtViewer extends Application {
    constructor(doc, pieces, options = {}) {
        super(options);
        this.doc = doc;
        this.pieces = pieces;
        const current = Number(doc.flags?.heart?.[VARIANT_FLAG]) || 0;
        this.index = Math.max(0, pieces.findIndex(p => p.variant === current));
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
        return localizeHeart(this.doc.name);
    }

    // a character's class, which this user may change
    get pickable() {
        return this.doc.documentName === 'Item' && this.doc.type === 'class' && this.doc.isEmbedded
            && !this.doc.isChild && this.doc.isOwner;
    }

    async _renderInner() {
        const p = this.pieces[this.index];
        const current = Number(this.doc.flags?.heart?.[VARIANT_FLAG]) || 0;
        const t = (k) => game.i18n.localize(`heart.art.${k}`);
        // "Class art" only on a class; a landmark's banner piece (2026-10-02,
        // landmarks with extras) goes unlabelled
        const kind = p.variant === null ? t('gallery') : p.variant === 0 ? (this.doc.type === 'class' ? t('main') : '') : t('alternate');
        let pick = '';
        if (p.variant !== null && this.pickable) {
            pick = p.variant === current
                ? `<span class="art-pick on">${t('in-use')}</span>`
                : `<a class="art-pick" data-action="pick">${t('use')}</a>`;
        }
        const esc = Handlebars.escapeExpression;
        return $(`<div class="art-viewer">
            <div class="art-stage"><img src="${esc(p.src)}" alt="${esc(localizeHeart(this.doc.name))}"></div>
            <a class="art-step prev" data-action="prev" aria-label="${t('previous')}"><i class="fas fa-chevron-left"></i></a>
            <a class="art-step next" data-action="next" aria-label="${t('next')}"><i class="fas fa-chevron-right"></i></a>
            <div class="art-caption"><span class="art-count">${this.index + 1} / ${this.pieces.length}</span><span class="art-kind">${kind}</span>${pick}</div>
        </div>`);
    }

    step(by) {
        this.index = (this.index + by + this.pieces.length) % this.pieces.length;
        this.render();
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('[data-action=prev]').click(ev => { ev.preventDefault(); this.step(-1); });
        html.find('[data-action=next]').click(ev => { ev.preventDefault(); this.step(1); });
        html.find('[data-action=pick]').click(async ev => {
            ev.preventDefault();
            await this.doc.setFlag('heart', VARIANT_FLAG, this.pieces[this.index].variant);
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
