import applicationHTML from './application.html';
import { artOf, showArt } from '../../common/art';
import { artShown, artToggleButton, markArtButton } from '../../common/art-toggle';

// Character Options picker (2026-09-29). The "+" on the character sheet's
// Class / Calling / Ancestry slots opens this instead of raw compendiums:
// one list of every option of that type from every visible Item
// compendium (core book, Ways & Means, anything else installed), as cards in
// source order (no book headings since 2026-09-30). Click a name to preview it; Choose adds it to the character through
// the sheet's normal drop path (which already replaces an existing class or
// calling, and the createItem hook dedups ancestries).
// Source order (2026-09-30): the book an option comes from (core, then Ways
// and Means, then anything else) and its page, as fvtt-heart-content records
// them (flags.fvtt-heart-content.book / .page); then the pack's own sort,
// then the name for anything without book data.
const CONTENT = 'fvtt-heart-content';
const BOOK_RANK = { core: 0, wm: 1 };
function sourceOrder(entry) {
    const f = foundry.utils.getProperty(entry, `flags.${CONTENT}`) ?? {};
    const book = BOOK_RANK[f.book] ?? 9;
    // pages are "35" (core) or "W12" (Ways and Means): the digits sort within a book
    const page = Number.parseInt(String(f.page ?? "").replace(/D+/g, ""), 10);
    return [book, Number.isFinite(page) ? page : 99999, Number(entry.sort) || 0];
}
function bySourceOrder(a, b) {
    const x = a.order ?? [9, 99999, 0], y = b.order ?? [9, 99999, 0];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return String(a.name ?? a.label ?? "").localeCompare(String(b.name ?? b.label ?? ""));
}

// Cards per row and window size per picker (2026-09-30 review): the four
// ancestries in one row, the thirteen classes five across in three rows.
// Every window fits its cards (no scrolling) and stays resizable.
// 2026-10-01 (book art): callings five across like classes. The hover
// popout that showed the art large beside a card was removed 2026-10-02
// (Luke: the card's own hover and its art button are enough), so the
// ancestry window fits its one row of cards again.
const CARD = 277;
const LAYOUT = {
    ancestry: { columns: 4, window: { width: 4 * CARD + 60, height: 'auto' } },
    calling: { columns: 5, window: { width: 5 * CARD + 60, height: 'auto' } },
    class: { columns: 5, window: { width: 5 * CARD + 60, height: 'auto' } },
};

export default class CharacterOptionsApplication extends Application {
    constructor(actor, itemType, options = {}) {
        super({ ...(LAYOUT[itemType] ?? LAYOUT.class).window, ...options });
        this.actor = actor;
        this.itemType = itemType;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            // heart-window: the class Heart's theme is scoped to (2026-09-30)
            classes: ['heart', 'heart-window', 'heart-options-browser'],
            template: applicationHTML.path,
            width: 1450,
            height: 900,
            resizable: true,
        });
    }

    // the Art button (the one per-user art switch, common/art-toggle.js,
    // 2026-10-02): off, the cards show no art
    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.unshift(artToggleButton());
        return buttons;
    }

    // A window sized to fit its cards opens at that height, then keeps it as
    // a fixed height so it can still be resized (Foundry ignores vertical
    // resizing while a window's height is 'auto')
    async _render(force, options) {
        await super._render(force, options);
        markArtButton(this);
        if (!this._fitted && this.options.height === 'auto' && this.element?.length) {
            this._fitted = true;
            this.setPosition({ height: this.element.outerHeight() });
        }
    }

    get id() {
        return `heart-options-${this.itemType}-${this.actor.id}`;
    }

    get title() {
        return localizeHeart('character', `${this.itemType}-prompt`);
    }

    async getData() {
        // One list in source order (2026-09-30 review: no book headings):
        // every pack option by book, page and sort, then world items
        const entry = (doc, uuid) => ({
            uuid,
            name: localizeHeart(doc.name),
            img: doc.img,
            pitch: foundry.utils.getProperty(doc, `flags.${CONTENT}.pitch`) ?? "",
            // book art (2026-10-01): the card's faint background and the
            // view-art button (index entries carry the flags)
            art: artShown() ? artOf(doc) : null,
            order: sourceOrder(doc),
        });
        const packEntries = [];
        for (const pack of game.packs) {
            if (pack.metadata.type !== "Item" || !pack.visible) continue;
            const index = await pack.getIndex({ fields: ["type", "sort", `flags.${CONTENT}`] });
            for (const e of index) {
                if (e.type === this.itemType) packEntries.push(entry(e, e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`));
            }
        }
        packEntries.sort(bySourceOrder);
        const worldEntries = game.items
            .filter(i => i.type === this.itemType && i.testUserPermission(game.user, "OBSERVER"))
            .map(i => entry(i, i.uuid))
            .sort(bySourceOrder);

        const current = this.actor.items.find(i => i.type === this.itemType);
        const currentName = current ? localizeHeart(current.name) : "";
        const entries = [...packEntries, ...worldEntries].map(e => ({ ...e, current: Boolean(currentName) && e.name === currentName }));
        return { entries, currentName, columns: (LAYOUT[this.itemType] ?? LAYOUT.class).columns };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action=preview]').click(async ev => {
            ev.preventDefault();
            const doc = await fromUuid(ev.currentTarget.closest('.option-card').dataset.uuid);
            doc?.sheet.render(true);
        });

        // The whole piece in Foundry's image viewer
        html.find('[data-action=view-art]').click(async ev => {
            ev.preventDefault();
            showArt(await fromUuid(ev.currentTarget.closest('.option-card').dataset.uuid));
        });

        html.find('[data-action=choose]').click(async ev => {
            ev.preventDefault();
            const doc = await fromUuid(ev.currentTarget.closest('.option-card').dataset.uuid);
            if (!doc) return;
            const data = doc.toObject();
            delete data._id;
            await this.actor.sheet._onDropItemCreate(data);
            this.close();
        });
    }
}
