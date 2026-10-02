// How an actor becomes a bond (2026-10-01, Luke's picks from the Heart
// Bonds Mock). Bonds are the GM's call:
//   - the GM drops an actor on a character sheet (or answers a request): a
//     `hireling` actor is hired (Who runs them? first), any other actor
//     becomes a person bond linking it; with three bonds already, the drop
//     is refused until one is removed (no replacing, 2026-10-02, Luke)
//   - a player drops one: a "request a bond" card is whispered to the GMs
//     (and the player), whose Add bond / Decline buttons only the GM sees
// The API calls in bonds.js do the writing and their own guards.

import { ledgerCard } from '../common/ledger';
import { glyphFor } from '../common/icons';
import { canAddBond } from './rules';
import { addBond, hire, bondsOf, HIRELING_TYPE } from './bonds';
import { hireDialog } from './dialogs';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

// The GM gives `character` a bond with `actor`. Resolves the new bond, or
// null when cancelled or refused.
export async function grantBond(character, actor) {
    if (!game.user.isGM) {
        ui.notifications.warn(loc('heart.bond.gm-only-add'));
        return null;
    }
    if (!character || character.type !== 'character' || !actor) return null;
    if (actor.type === 'character' && actor.id === character.id) return null;
    const uuid = actor.uuid;
    if (bondsOf(character).some(b => b.system.target === uuid)) {
        ui.notifications.warn(loc('heart.bond.refused.already', { name: character.name, bond: actor.name }));
        return null;
    }
    // full: refused before any dialog (remove a bond first)
    if (!canAddBond(bondsOf(character).length)) {
        ui.notifications.warn(loc('heart.bond.refused.full', { name: character.name, bond: actor.name }));
        return null;
    }
    if (actor.type === HIRELING_TYPE) {
        const answer = await hireDialog(character, actor);
        if (!answer) return null;
        const result = await hire({ characterId: character.id, hirelingUuid: uuid, runBy: answer.runBy, name: answer.name || undefined });
        return result?.bond ?? null;
    }
    return addBond({ characterId: character.id, targetUuid: uuid });
}

// The GM, then every GM, plus the asking user: a whisper's recipients
function gmWhisper() {
    const ids = new Set([game.user.id]);
    for (const user of game.users) if (user.isGM) ids.add(user.id);
    return [...ids];
}

// A player asks for a bond with `actor`; the GM decides on the card
export async function requestBond(character, actor) {
    if (!character?.isOwner || !actor) return null;
    const link = `<a class="content-link ledger-name" draggable="true" data-link data-uuid="${esc(actor.uuid)}" data-type="Actor">${esc(actor.name)}</a>`;
    const acts = `<button type="button" data-action="bond-request-add" data-tooltip="${esc(loc('heart.bond.request.add-tip', { bond: actor.name, name: character.name }))}">${esc(loc('heart.bond.request.add'))}</button>`
        + `<button type="button" data-action="bond-request-decline">${esc(loc('heart.bond.request.decline'))}</button>`;
    const content = await ledgerCard({
        what: `${glyphFor('resistance', 'bond')}${esc(loc('heart.bond.request.what', { name: character.name }))}`,
        out: link,
        det: esc(loc('heart.bond.request.det', { name: character.name, bond: actor.name })),
        acts,
    });
    ui.notifications.info(loc('heart.bond.request.sent', { bond: actor.name }));
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: character }),
        content,
        whisper: gmWhisper(),
        flags: { heart: { bondRequest: { characterId: character.id, actorUuid: actor.uuid } } },
    });
}

// The card's answer replaces its buttons with a line saying what happened
async function settle(message, key, data) {
    const line = `<div class="ledger-det">${esc(loc(key, data))}</div>`;
    await message.update({
        content: message.content.replace(/<div class="ledger-acts">[\s\S]*?<\/div>/, line),
        'flags.heart.bondRequest.settled': true,
    });
}

export function registerBondRequests() {
    Hooks.on('renderChatMessage', (message, html) => {
        const request = message.getFlag('heart', 'bondRequest');
        if (!request) return;
        const buttons = html.find('[data-action^="bond-request-"]');
        // only the GM decides; players see the request without buttons
        if (!game.user.isGM || request.settled) {
            buttons.closest('.ledger-acts').remove();
            return;
        }
        buttons.on('click', async ev => {
            ev.preventDefault();
            const character = game.actors.get(request.characterId);
            const actor = await fromUuid(request.actorUuid);
            if (ev.currentTarget.dataset.action === 'bond-request-decline') {
                await settle(message, 'heart.bond.request.declined', { name: character?.name ?? '' });
                return;
            }
            if (!character || !actor) {
                ui.notifications.warn(loc('heart.bond.no-target'));
                return;
            }
            const bond = await grantBond(character, actor);
            if (bond) await settle(message, 'heart.bond.request.added', { bond: bond.name, name: character.name });
        });
    });
}
