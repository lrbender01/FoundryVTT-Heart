import { heartProseMirrorPlugins } from './editor';
import { glassToggleButton } from './glass';
import { enrichFields } from './rich-text';
import { gmSafeFields, mayReadGmNotes } from './gm-notes';

export default function HeartSheetMixin(baseClass) {
    return class extends baseClass {
        // Keep the window's scroll position across re-renders (2026-09-30).
        // Heart sheets scroll on .window-content, and Foundry's AppV1 saves
        // positions from the whole window but restores them only inside the
        // freshly rendered inner HTML, which .window-content is not part of:
        // every update (learning an ability, pursuing a beat, a stress box)
        // jumped the sheet back to the top.
        // .heart-window (2026-09-30, Luke): the one class every Heart window
        // carries; Heart's theme and window-level rules are scoped to it, so
        // the rest of Foundry keeps its own look. Every actor and item sheet
        // reaches here (panel sheets and HeartItemSheet extend these classes).
        static get defaultOptions() {
            const options = super.defaultOptions;
            const scrollY = [...new Set([...(options.scrollY ?? []), '.window-content'])];
            const classes = [...new Set([...(options.classes ?? []), 'heart-window'])];
            return foundry.utils.mergeObject(options, { scrollY, classes });
        }

        _restoreScrollPositions(html) {
            super._restoreScrollPositions(this.element?.length ? this.element : html);
        }

        // The Glass button on every Heart sheet (2026-10-02, Luke;
        // common/glass.js): this user's one glass switch. Sheets that show
        // art put their Art button before it.
        _getHeaderButtons() {
            const buttons = super._getHeaderButtons();
            buttons.unshift(glassToggleButton());
            return buttons;
        }

        // The tamed rich-text editor (2026-09-30, Luke; common/editor.js):
        // Bold, Italic, Bullet list, Cancel, Save; Save closes it
        _configureProseMirrorPlugins(name, options = {}) {
            return heartProseMirrorPlugins(this, name, options);
        }

        // Rich text this sheet draws, enriched before the template runs
        // (common/rich-text.js; Luke, 2026-10-21): [{ key, html, doc }]
        _richFields(data) {
            return [];
        }

        // (GM Notes only for the GM, 2026-10-21: common/gm-notes.js)
        async _renderInner(data, ...args) {
            data.enriched = await enrichFields(gmSafeFields(this._richFields(data), game.user));
            return super._renderInner(data, ...args);
        }

        // (the default template, common/sheet.html, went 2026-10-21, Luke:
        // every Heart sheet names its own)

        get default_img() {
            return CONST.DEFAULT_TOKEN;
        }

        get img() {
            return 'systems/heart/assets/battle-gear.svg';
        }

        get title() {
            const key = 'heart.' + super.title;
            const resp = game.i18n.localize(key);
            if (resp === key) {
                return super.title;
            } else {
                return resp;
            }
        }

        getData() {
            const data = super.getData();
            // The picture a sheet shows: the document's own img, or the
            // sheet type's generic one when it has none. Computed for the
            // template, never written back: data.actor / data.item are the
            // live documents, and assigning to them (the upstream code did)
            // replaced their assigned icons in memory for every sheet and
            // list that read them afterwards (2026-09-30 fixes).
            const own = (data.actor ?? data.item)?.img;
            data.displayImg = (own && own !== this.default_img) ? own : this.img;
            if (!data.actor && !data.item) data.img = this.img;
            // the templates draw GM Notes panels only when this is set
            // (common/gm-notes.js, 2026-10-21)
            data.showGmNotes = mayReadGmNotes(game.user);
            return data;
        }
    };
}
