import sheetHTML from './sheet.html';
import { heartProseMirrorPlugins } from './editor';

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

        // The tamed rich-text editor (2026-09-30, Luke; common/editor.js):
        // Bold, Italic, Bullet list, Cancel, Save; Save closes it
        _configureProseMirrorPlugins(name, options = {}) {
            return heartProseMirrorPlugins(this, name, options);
        }

        get template() {
            return sheetHTML.path;
        }

        get default_img() {
            return CONST.DEFAULT_TOKEN;
        }

        get img() {
            return 'systems/heart/assets/battle-gear.svg';
        }

        get title() {
            const key = 'heart.' + super.title;
            const resp = game.i18n.localize(key);
            if (resp == key) {
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
            return data;
        }
    };
}
