// Beat flow (2026-09-29 review): activation and completion are two stages.
//
//   inactive   [Activate]  [Complete - disabled]
//   active     [Active]    [Complete]            (click Active to deactivate)
//   completed  [Activate - disabled] [Completed] (click Completed to undo)
//
// Rules, enforced here for every sheet that shows beat rows (calling,
// character, Beat Tracker, the beat's own sheet):
//   - a character chases at most two beats at a time
//   - only an active beat can be completed
//   - completing a beat deactivates it
//   - undoing a completion makes the beat active again when there is room
//     (otherwise it goes back to inactive, with a notice)

export const ACTIVE_BEAT_LIMIT = 2;

// The character a beat belongs to: a loose beat on the actor, or a child of
// the character's calling (children have parentItem, the calling has actor)
function owningActor(beat) {
    let item = beat;
    while (item?.parentItem) item = item.parentItem;
    return item?.actor ?? null;
}

function isActiveBeat(item) {
    return item.type === 'beat' && item.system.active && !item.system.complete;
}

// Active beats competing with this one for the two slots
export function activeBeatCount(beat) {
    const actor = owningActor(beat);
    if (actor?.type === 'character') {
        const calling = actor.items.find(i => i.type === 'calling');
        return [...(calling?.children ?? []), ...actor.items].filter(isActiveBeat).length;
    }
    // an unowned calling (compendium / sidebar): count its own children
    return (beat.parentItem?.children ?? []).filter(isActiveBeat).length;
}

export async function activateBeat(beat) {
    if (!beat || beat.system.complete || beat.system.active) return;
    if (activeBeatCount(beat) >= ACTIVE_BEAT_LIMIT) {
        ui.notifications.warn(game.i18n.localize('heart.item-sheet.two-beats'));
        return;
    }
    await beat.update({ 'system.active': true });
}

export async function deactivateBeat(beat) {
    if (!beat?.system.active) return;
    await beat.update({ 'system.active': false });
}

export async function completeBeat(beat) {
    if (!beat || beat.system.complete) return;
    if (!beat.system.active) {
        ui.notifications.info(game.i18n.localize('heart.beat.activate-first'));
        return;
    }
    await beat.update({ 'system.complete': true, 'system.active': false });
}

export async function uncompleteBeat(beat) {
    if (!beat?.system.complete) return;
    const room = activeBeatCount(beat) < ACTIVE_BEAT_LIMIT;
    await beat.update({ 'system.complete': false, 'system.active': room });
    if (!room) ui.notifications.info(game.i18n.localize('heart.beat.undo-no-room'));
}

// Wire the row buttons in any rendered sheet / application
export function activateBeatListeners(html) {
    const handle = (action, fn) => {
        html.find(`[data-action=${action}]`).click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const uuid = ev.currentTarget.closest('[data-item-id]')?.dataset.itemId;
            if (!uuid) return;
            await fn(await fromUuid(uuid));
        });
    };
    handle('beat-activate', activateBeat);
    handle('beat-deactivate', deactivateBeat);
    handle('beat-complete', completeBeat);
    handle('beat-uncomplete', uncompleteBeat);
}

// Every active beat the calling's character is chasing: the calling's own
// plus loose beats on the actor, so the calling sheet and the character
// sheet count the same (2026-09-30)
export function activeBeatsOf(calling) {
    return allBeatsOf(calling).filter(isActiveBeat);
}

// Every beat a calling's character has: the calling's own (book and custom)
// plus loose beats on the actor (custom beats made before 2026-09-30, when
// the character sheet created them outside the calling)
export function allBeatsOf(calling) {
    const actor = calling?.actor;
    const own = [...(calling?.children ?? [])].filter(i => i.type === 'beat');
    if (actor?.type !== 'character') return own;
    return [...own, ...actor.items.filter(i => i.type === 'beat')];
}

// A beat's severity; custom beats made without one count as minor
export function beatLevel(beat) {
    return beat?.system?.type || 'minor';
}

// Custom beats (2026-09-30): asked for a name, a severity (default minor,
// or the section it was added from) and an optional description, then
// added to the character's calling, so the calling sheet lists it and every
// count (pursued, finished, per severity) includes it. Without a calling it
// is a loose beat on the actor. pursue: take one of the two slots at once
// when there is room.
export async function createCustomBeat({ calling = null, actor = null, level = 'minor', pursue = false } = {}) {
    const loc = (k) => game.i18n.localize(`heart.beat.custom.${k}`);
    const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
    const levels = game.heart.beat_levels ?? ['minor', 'major', 'zenith'];
    const content = `<form class="heart custom-beat-form" autocomplete="off">
        <div class="form-group"><label>${esc(loc('name'))}</label><input type="text" name="name" placeholder="${esc(loc('default-name'))}" autofocus /></div>
        <div class="form-group"><label>${esc(loc('severity'))}</label><select name="level">${levels
            .map(l => `<option value="${l}" ${l === level ? 'selected' : ''}>${esc(game.i18n.localize(`heart.beat.level.${l}`))}</option>`).join('')}</select></div>
        <div class="form-group stacked"><label>${esc(loc('description'))}</label><textarea name="description" rows="3"></textarea></div>
    </form>`;
    const answer = await Dialog.prompt({
        title: loc('title'),
        content,
        label: loc('create'),
        rejectClose: false,
        callback: html => ({
            name: String(html.find('[name=name]').val() ?? '').trim(),
            level: html.find('[name=level]').val() || 'minor',
            description: String(html.find('[name=description]').val() ?? '').trim(),
        }),
    });
    if (!answer) return null;

    const description = answer.description
        ? answer.description.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('')
        : '';
    const data = {
        type: 'beat',
        name: answer.name || loc('default-name'),
        system: { type: answer.level, description, active: false, complete: false },
        flags: { heart: { custom: true } },
    };

    let beat = null;
    if (calling) {
        const child = { ...data, documentName: 'Item' };
        await calling.addChildren([child]);
        // addChildren gives the data its new id
        beat = calling.children.get(child._id) ?? null;
    } else if (actor) {
        [beat] = await actor.createEmbeddedDocuments('Item', [data]);
    }
    if (beat && pursue) await activateBeat(beat);
    return beat;
}

// Open the character's calling straight on its Beats tab
export function openCallingBeats(actor) {
    const calling = actor?.items.find(i => i.type === 'calling');
    if (!calling) return;
    calling.sheet._activeTab = 'beats';
    calling.sheet.render(true);
}
