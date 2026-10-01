// Ancestry questions (2026-09-30, Luke): a character answers one of their
// ancestry's questions (the prompt says so; no pick marks since the review).
// Owners can delete questions (asks first, an answer may go with it) and add
// them: an added question is `custom` and its wording is a text field on the
// ancestry sheet (book questions stay read-only text).
//
// Shared by the ancestry sheet and the character sheet's Biography tab:
// every control sits inside [data-questions-of="<ancestry uuid>"] and
// [data-id="<question id>"].
import { heartDialogOptions } from '../../common/dialog';

const loc = (key) => game.i18n.localize(key);

async function ancestryOf(el) {
    const uuid = el.closest('[data-questions-of]')?.dataset.questionsOf;
    return uuid ? fromUuid(uuid) : null;
}

export async function addQuestion(item) {
    if (!item?.isOwner) return null;
    const id = foundry.utils.randomID();
    await item.update({ [`system.questions.${id}`]: { question: '', answer: '', custom: true } });
    return id;
}

export function activateQuestionListeners(html, { openSheetOnAdd = false } = {}) {
    html.find('[data-questions-of] [data-action=delete-question]').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const item = await ancestryOf(ev.currentTarget);
        if (!item?.isOwner) return;
        const id = ev.currentTarget.closest('[data-id]').dataset.id;
        const ok = await Dialog.confirm({
            title: loc('heart.ancestry.questions.delete-title'),
            content: `<p>${loc('heart.ancestry.questions.delete-body')}</p>`,
            options: heartDialogOptions(),
        });
        if (ok) await item.update({ [`system.questions.-=${id}`]: null });
    });

    // Biography tab pencil: answering happens on the ancestry sheet
    html.find('[data-questions-of] [data-action=open-questions]').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const item = await ancestryOf(ev.currentTarget);
        item?.sheet.render(true);
    });

    html.find('[data-questions-of] [data-action=add-question]').on('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const item = await ancestryOf(ev.currentTarget);
        const id = await addQuestion(item);
        // from the Biography tab the wording is typed on the ancestry sheet
        if (id && openSheetOnAdd) item.sheet.render(true);
    });
}
