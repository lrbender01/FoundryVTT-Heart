// Heart dialogs (2026-09-30, Luke): every confirm and prompt the system opens
// carries the Heart window classes, so it takes the dark theme (which is
// scoped to .heart-window) and the chip buttons of .heart-confirm
// (applications/application.sass). Pass as `options` to Dialog.confirm /
// Dialog.prompt, or as the second argument of new Dialog().
export const HEART_DIALOG_CLASSES = ['dialog', 'heart-window', 'heart-confirm'];

export function heartDialogOptions(extra = {}) {
    return { ...extra, classes: [...HEART_DIALOG_CLASSES, ...(extra.classes ?? [])] };
}
