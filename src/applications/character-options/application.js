import applicationHTML from './application.html';

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

export default class CharacterOptionsApplication extends Application {
    constructor(actor, itemType, options = {}) {
        super(options);
        this.actor = actor;
        this.itemType = itemType;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['heart', 'heart-options-browser'],
            template: applicationHTML.path,
            // cards, five across, with little scrolling (2026-09-30 review)
            width: 1450,
            height: 900,
            resizable: true,
        });
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
        return { entries, currentName };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('[data-action=preview]').click(async ev => {
            ev.preventDefault();
            const doc = await fromUuid(ev.currentTarget.closest('.option-card').dataset.uuid);
            doc?.sheet.render(true);
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
