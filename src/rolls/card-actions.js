// What a chat card's buttons write, done by the GM's client one request at
// a time (2026-10-02, Luke: a double-click took stress twice; common/relay.js).
// Each handler checks, inside the queue, whether its button was already used
// and who is asking, then writes the actors and settles the card in one go,
// so a card is applied once however many clicks or players reach it.
// The buttons themselves (heart-roll, stress-roll, and fallout-roll roll.js,
// the restock card in actors/party/party.js) only ask and report.

import { registerRelayHandler } from '../common/relay';
import { applyProvisions } from '../actors/party/party';

// Who may run a card's stress (Roll Stress, Take Stress; Luke, 2026-10-02):
// the GM, or a player who owns the rolling character
export function mayRunStress(user, actor) {
    if (!user) return false;
    if (user.isGM) return true;
    return Boolean(actor?.testUserPermission?.(user, 'OWNER'));
}

// The chat message a card button sits in
export function messageOf(ev) {
    const id = $(ev.currentTarget).closest('[data-message-id]').data('messageId');
    return id ? game.messages.get(id) : undefined;
}

const userOf = (userId) => game.users?.get(userId);

// Mark an already rolled stress roll (the party's Provisions cards, a
// restock's payment): who took how much
async function applyStress({ roll }) {
    const stressRoll = Roll.fromData(roll);
    const applied = await stressRoll.takeStress();
    return { status: 'done', applied };
}

// A Heart roll's Roll Stress: the stress roll joins the card once
async function attachStress({ messageId, roll }, userId) {
    const msg = game.messages.get(messageId);
    const heartRoll = msg?.rolls?.[0];
    if (!heartRoll) return { status: 'missing' };
    if (!mayRunStress(userOf(userId), game.actors.get(heartRoll.options.character))) return { status: 'not-allowed' };
    if (msg.getFlag('heart', 'stress-roll')) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    const stressRoll = Roll.fromData(roll);
    const applied = await stressRoll.takeStress();
    // fallout offered only if some got through Protection (HCB p.78)
    await msg.update({
        'flags.heart.stress-roll': stressRoll.toJSON(),
        'flags.heart.show-stress-roll-button': false,
        'flags.heart.show-take-stress-button': false,
        'flags.heart.show-fallout-roll-button': applied.some(a => a.amount > 0),
    });
    return { status: 'done', applied };
}

// A standalone stress card's Take Stress
async function takeStressOnCard({ messageId }, userId) {
    const msg = game.messages.get(messageId);
    const stressRoll = msg?.stressRoll;
    if (!stressRoll || !stressRoll.options.resistance) return { status: 'missing' };
    if (!mayRunStress(userOf(userId), game.actors.get(stressRoll.options.character))) return { status: 'not-allowed' };
    if (stressRoll.options.applied || msg.getFlag('heart', 'show-take-stress-button') === false) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    const applied = await stressRoll.takeStress();
    const update = {
        'flags.heart.show-take-stress-button': false,
        'flags.heart.show-fallout-roll-button': applied.some(a => a.amount > 0),
    };
    if (msg.rolls[0] instanceof game.heart.rolls.StressRoll) {
        update.rolls = [JSON.stringify(stressRoll.toJSON())];
    } else {
        update['flags.heart.stress-roll'] = stressRoll.toJSON();
    }
    await msg.update(update);
    return { status: 'done', applied };
}

// A stress card's fallout button for one character: claimed before the roll,
// so it rolls once; released again if the roll could not be made
async function claimFallout({ messageId, character }) {
    const msg = game.messages.get(messageId);
    if (!msg || !character) return { status: 'missing' };
    const done = msg.getFlag('heart', 'fallout-done') ?? [];
    if (done.includes(character)) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ 'flags.heart.fallout-done': [...done, character] });
    return { status: 'done' };
}

async function releaseFallout({ messageId, character }) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    const done = msg.getFlag('heart', 'fallout-done') ?? [];
    await msg.update({ 'flags.heart.fallout-done': done.filter(id => id !== character) });
    return { status: 'done' };
}

// The roller's fallout joins the stress card (a helper's posts its own)
async function attachFallout({ messageId, roll }) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    if (msg.getFlag('heart', 'fallout-roll')) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ 'flags.heart.fallout-roll': roll });
    return { status: 'done' };
}

// A fallout card's Clear button: the triggering resistance (Minor), every
// resistance (Major), or the party's Provisions; written as single keys,
// then the button is gone. Stress is only ever cleared by this hand click.
async function clearStressOnCard({ messageId, actorId, party, scope }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    if (msg.getFlag('heart', 'show-clear-stress-button') === false) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    if (party) {
        const result = await applyProvisions({ mode: 'set', amount: 0 }, userId);
        if (result.status !== 'done') return result;
    } else {
        const actor = game.actors.get(actorId);
        if (!actor) return { status: 'missing' };
        const user = userOf(userId);
        if (!(user?.isGM || actor.testUserPermission(user, 'OWNER'))) return { status: 'not-allowed' };
        const resistances = actor.system.resistances ?? {};
        const keys = scope === 'all' ? Object.keys(resistances) : [scope];
        const update = {};
        for (const key of keys) {
            if (resistances[key]) update[`system.resistances.${key}.value`] = 0;
        }
        if (!Object.keys(update).length) return { status: 'missing' };
        await actor.update(update);
    }
    await msg.update({ 'flags.heart.show-clear-stress-button': false });
    return { status: 'done' };
}

// Any other one-use card button (a restock's payer fallout): flags.heart.claimed.<key>
async function claimCardButton({ messageId, key }) {
    const msg = game.messages.get(messageId);
    if (!msg || !key) return { status: 'missing' };
    if (msg.getFlag('heart', 'claimed')?.[key]) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ [`flags.heart.claimed.${key}`]: true });
    return { status: 'done' };
}

// Every relay handler, registered in one place (rolls/index.js at init)
export function registerCardActions() {
    // the party's Provisions track (actors/party/party.js)
    registerRelayHandler('provisions', applyProvisions);
    registerRelayHandler('apply-stress', applyStress);
    registerRelayHandler('attach-stress', attachStress);
    registerRelayHandler('take-stress', takeStressOnCard);
    registerRelayHandler('claim-fallout', claimFallout);
    registerRelayHandler('release-fallout', releaseFallout);
    registerRelayHandler('attach-fallout', attachFallout);
    registerRelayHandler('clear-stress', clearStressOnCard);
    registerRelayHandler('claim-card-button', claimCardButton);
}

export const CARD_ACTIONS = {
    applyStress,
    attachStress,
    takeStressOnCard,
    claimFallout,
    releaseFallout,
    attachFallout,
    clearStressOnCard,
    claimCardButton,
};
