import './editor.sass';

// The rich-text editor, tamed (2026-09-30, Luke). Heart keeps Foundry's own
// ProseMirror editor (paste clean-up, undo, safe HTML, the book text's
// italics and links survive) but Heart sheets build its toolbar themselves:
// just Cancel and Save (no formatting buttons; the text is shown plain while
// it is edited). Save (or Ctrl+S) saves and closes the editor; Cancel closes
// it without saving.
//
// How: every Heart actor and item sheet (common/sheet.js) overrides
// FormApplication#_configureProseMirrorPlugins, the one place Foundry
// builds an editor's menu, and hands back a HeartProseMirrorMenu. That is
// deterministic: it doesn't depend on hooks or on finding the editor in the
// page (the first version filtered Foundry's menu from the
// getProseMirrorMenu* hooks and didn't take in Luke's world). Editors in
// other windows keep Foundry's full toolbar.

let MenuClass = null;

// Built on first use: ProseMirror is Foundry's global, there by the time a
// sheet opens an editor
function heartMenuClass() {
    if (MenuClass) return MenuClass;
    const label = (key, fallback) => {
        const text = game.i18n.localize(key);
        return Handlebars.escapeExpression(text === key ? fallback : text);
    };
    MenuClass = class HeartProseMirrorMenu extends ProseMirror.ProseMirrorMenu {
        // no dropdowns: no paragraph styles, fonts, or tables
        _getDropDownMenus() {
            return {};
        }

        // no formatting buttons (2026-09-30, Luke): a plain writing area with
        // Cancel and Save; saved text keeps whatever styling its sheet gives it
        _getMenuItems() {
            const items = [];
            if (this.options.onCancel) {
                items.push({
                    action: 'heart-cancel',
                    title: 'heart.editor.cancel-tip',
                    icon: `<span class="heart-editor-label">${label('heart.editor.cancel', 'Cancel')}</span>`,
                    scope: '',
                    cssClass: 'right heart-editor-cancel',
                    cmd: () => this.options.onCancel(),
                });
            }
            if (this.options.onSave) {
                items.push({
                    action: 'save',
                    title: 'EDITOR.SaveAndClose',
                    icon: `<span class="heart-editor-label">${label('heart.editor.save', 'Save')}</span>`,
                    scope: '',
                    cssClass: 'right heart-editor-save',
                    cmd: () => this._handleSave(),
                });
            }
            return items;
        }
    };
    return MenuClass;
}

// Close an editor without saving: what saveEditor does after a save, minus
// the save
function cancelEditor(sheet, name) {
    const editor = sheet.editors?.[name];
    if (!editor) return;
    editor.active = false;
    editor.changed = false;
    editor.instance?.destroy();
    editor.instance = editor.mce = null;
    if (editor.hasButton && editor.button) editor.button.style.display = 'block';
    sheet.render();
}

// For a sheet's _configureProseMirrorPlugins(name, { remove })
export function heartProseMirrorPlugins(sheet, name, { remove = true } = {}) {
    const schema = ProseMirror.defaultSchema;
    const onSave = () => sheet.saveEditor(name, { remove: true });
    return {
        menu: heartMenuClass().build(schema, {
            // every Heart editor closes on save (2026-09-30, Luke)
            destroyOnSave: true,
            onSave,
            onCancel: () => cancelEditor(sheet, name),
        }),
        keyMaps: ProseMirror.ProseMirrorKeyMaps.build(schema, { onSave }),
    };
}
