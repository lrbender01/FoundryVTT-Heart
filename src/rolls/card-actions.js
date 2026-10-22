// What a chat card's buttons write, done by the GM's client one request at
// a time (2026-10-02, Luke: a double-click took stress twice; common/relay.js).
// Each handler checks, inside the queue, whether its button was already used
// and who is asking, then writes the actors and settles the card in one go,
// so a card is applied once however many clicks or players reach it.
// The buttons themselves (heart-roll, stress-roll, and fallout-roll roll.js,
// the restock card in actors/party/party.js) only ask and report.
//
// (Luke, 2026-10-21: the code audit's R6 to R10) the handlers trust nothing
// the click sends that the card itself already knows: who rolled, who
// helped, what the result was, and which fallout roll the card carries.

import { registerRelayHandler } from '../common/relay';
import { applyProvisions, getParty } from '../actors/party/party';
import { clearScope } from './fallout-roll/results';
import { stress_results } from './heart-roll/results';

// Who may run a card's stress (Roll Stress, Take Stress; Luke, 2026-10-02):
// the GM, or a player who owns the rolling character
export function mayRunStress(user, actor) {
    if (!user) return false;
    if (user.isGM) return true;
    return Boolean(actor?.testUserPermission?.(user, 'OWNER'));
}

// Who may roll a character's Fallout check (Luke, 2026-10-21, R8): the same
// people, the GM or the character's own player (the party: its owners).
// Picking the Fallout that results is the GM's alone (fallout-picker).
export function mayRollFallout(user, actor) {
    return mayRunStress(user, actor);
}

// The character a one-use card button rolls Fallout for: its key is
// "fallout-<actor id>" (a restock's payer, actors/party/party.js); null for
// any other button
export function falloutKeyCharacter(key) {
    const m = /^fallout-(.+)$/.exec(String(key ?? ''));
    return m ? m[1] : null;
}

// The chat message a card button sits in
export function messageOf(ev) {
    const id = $(ev.currentTarget).closest('[data-message-id]').data('messageId');
    return id ? game.messages.get(id) : undefined;
}

const userOf = (userId) => game.users?.get(userId);

// What a stress roll may mark: the five tracks and the party's Provisions
// (src/index.js sets game.heart.stress_targets)
function stressTargetList() {
    return game.heart?.stress_targets
        ?? [...(game.heart?.resistances ?? []), ...(game.heart?.party_resistances ?? ['provisions'])];
}

// A roll's JSON as the roll it names, or undefined when it names no roll
// class (a malformed flag must never break a card for everyone)
function rollFrom(json, className) {
    if (!json || typeof json !== 'object' || (className && json.class !== className)) return undefined;
    try {
        return Roll.fromData(json);
    } catch (err) {
        console.warn('heart | a card roll could not be read', err);
        return undefined;
    }
}

// Mark an already rolled stress roll (the party's fixed Provisions marks, a
// restock's payment): who took how much. Only a resistance a stress roll may
// mark; Provisions for the party's owners; anyone else's character only for
// the GM or its own player, and helpers the asker may not run are dropped
// (2026-10-21, R6).
async function applyStress({ roll } = {}, userId) {
    const stressRoll = rollFrom(roll, 'StressRoll');
    const opts = stressRoll?.options;
    if (!opts || !stressTargetList().includes(opts.resistance)) return { status: 'missing' };
    const user = userOf(userId);
    if (opts.resistance === 'provisions') {
        const party = getParty();
        if (!party) return { status: 'no-party' };
        if (userId !== undefined && !(user && party.testUserPermission(user, 'OWNER'))) return { status: 'not-allowed' };
    } else {
        if (userId !== undefined && !mayRunStress(user, game.actors.get(opts.character))) return { status: 'not-allowed' };
        if (userId !== undefined) opts.helpers = (opts.helpers ?? []).filter(id => mayRunStress(user, game.actors.get(id)));
    }
    // marked here, once: whatever arrived marked is not trusted
    delete opts.applied;
    const applied = await stressRoll.takeStress();
    return { status: 'done', applied };
}

// A Heart roll's Roll Stress: the stress roll joins the card once, and
// nothing is marked (Luke, 2026-10-21: "there must be separate roll and mark
// steps"). The card's Take Stress marks it (take-stress below), so the table
// can apply anything that changes it in between, by hand.
async function attachStress({ messageId, roll }, userId) {
    const msg = game.messages.get(messageId);
    const heartRoll = msg?.rolls?.[0];
    if (!heartRoll) return { status: 'missing' };
    if (!mayRunStress(userOf(userId), game.actors.get(heartRoll.options.character))) return { status: 'not-allowed' };
    if (msg.getFlag('heart', 'stress-roll')) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    // only a result that costs stress (2026-10-21, R7)
    const results = game.heart?.stress_results ?? stress_results;
    if (!results.includes(heartRoll.result)) return { status: 'missing' };
    const stressRoll = rollFrom(roll, 'StressRoll');
    if (!stressRoll) return { status: 'missing' };
    // a roll that arrives already marked is refused: only take-stress marks
    delete stressRoll.options.applied;
    // who rolled, who helped, and the result are the card's own (2026-10-21,
    // R7); the stakes (resistance, die, passive) stay the roller's
    stressRoll.options.character = heartRoll.options.character;
    stressRoll.options.helpers = [...(heartRoll.options.helpers ?? [])];
    stressRoll.options.result = heartRoll.result;
    await msg.update({
        'flags.heart.stress-roll': stressRoll.toJSON(),
        'flags.heart.show-stress-roll-button': false,
        'flags.heart.show-take-stress-button': true,
        'flags.heart.show-fallout-roll-button': false,
    });
    return { status: 'done' };
}

// Take Stress, on a standalone stress card or one chained under its Heart
// roll; fallout is offered only if some got through Protection (HCB p.78)
async function takeStressOnCard({ messageId }, userId) {
    const msg = game.messages.get(messageId);
    const stressRoll = msg?.stressRoll;
    if (!stressRoll || !stressRoll.options.resistance) return { status: 'missing' };
    if (!mayRunStress(userOf(userId), game.actors.get(stressRoll.options.character))) return { status: 'not-allowed' };
    if (stressRoll.options.applied || msg.getFlag('heart', 'show-take-stress-button') === false) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    // Provisions with no party: nothing could be marked, so the card is left
    // as it is and the asker is told why (2026-10-21, R9)
    if (stressRoll.options.resistance === 'provisions' && !getParty()) return { status: 'no-party' };
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
// so it rolls once; released again if the roll could not be made. Only a
// character the card marked with stress (the party, on a Provisions card)
// can be claimed, and the claimant is kept so only they or a GM can release
// it (2026-10-21, R8).
async function claimFallout({ messageId, character }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg || !character) return { status: 'missing' };
    const took = (msg.stressRoll?.options?.applied ?? []).some(a => a.id === character && a.amount > 0);
    if (!took) return { status: 'missing' };
    // only the GM or the character's own player rolls it (R8, Luke)
    if (userId !== undefined && !mayRollFallout(userOf(userId), game.actors.get(character))) return { status: 'not-allowed' };
    const done = msg.getFlag('heart', 'fallout-done') ?? [];
    if (done.includes(character)) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({
        'flags.heart.fallout-done': [...done, character],
        [`flags.heart.fallout-claims.${character}`]: userId ?? '',
    });
    return { status: 'done' };
}

async function releaseFallout({ messageId, character }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    const done = msg.getFlag('heart', 'fallout-done') ?? [];
    if (!done.includes(character)) return { status: 'already' };
    const claimant = msg.getFlag('heart', 'fallout-claims')?.[character];
    if (userId !== undefined && !userOf(userId)?.isGM && claimant !== userId) return { status: 'not-allowed' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ 'flags.heart.fallout-done': done.filter(id => id !== character) });
    return { status: 'done' };
}

// The roller's fallout joins the stress card (a helper's posts its own):
// only a real FalloutRoll, for the card's roller or the party, whose button
// was claimed (2026-10-21, R8: a bad JSON here broke the card for everyone)
async function attachFallout({ messageId, roll }) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    if (msg.getFlag('heart', 'fallout-roll')) return { status: 'already' };
    if (roll?.class !== 'FalloutRoll' || !rollFrom(roll, 'FalloutRoll')) return { status: 'missing' };
    const character = roll.options?.character;
    const roller = msg.stressRoll?.options?.character;
    const isParty = game.actors.get(character)?.type === 'party';
    if (!character || (character !== roller && !isParty)) return { status: 'missing' };
    if (!(msg.getFlag('heart', 'fallout-done') ?? []).includes(character)) return { status: 'missing' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ 'flags.heart.fallout-roll': roll });
    return { status: 'done' };
}

// A fallout card's Pick Fallout (GM only): what was picked, so the Clear
// button clears that Fallout's resistance (Luke, 2026-10-21, HCB p. 81).
// The latest pick wins.
async function recordFalloutPick({ messageId, pick }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg || !pick) return { status: 'missing' };
    if (!userOf(userId)?.isGM) return { status: 'not-allowed' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({
        'flags.heart.fallout-pick': {
            name: String(pick.name ?? ''), severity: String(pick.severity ?? ''), resistance: String(pick.resistance ?? ''),
        },
    });
    return { status: 'done' };
}

// A fallout card's Clear button: the picked Fallout's resistance, else the
// triggering one (Minor), every resistance (Major), or the party's
// Provisions; written as single keys, then the button is gone. Stress is
// only ever cleared by this hand click. Who and what come from the card's
// own fallout roll; the click's scope is only the Minor fallback, when the
// card cannot say which resistance (2026-10-21, R10).
async function clearStressOnCard({ messageId, scope }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg) return { status: 'missing' };
    const roll = msg.falloutRoll;
    const result = roll?.result;
    if (!roll || !result || result === 'no-fallout') return { status: 'missing' };
    if (msg.getFlag('heart', 'show-clear-stress-button') === false) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    if (roll.options?.party) {
        const answer = await applyProvisions({ mode: 'set', amount: 0 }, userId);
        if (answer.status !== 'done') return answer;
    } else {
        const actor = game.actors.get(roll.options?.character);
        if (!actor) return { status: 'missing' };
        const user = userOf(userId);
        if (!(user?.isGM || actor.testUserPermission(user, 'OWNER'))) return { status: 'not-allowed' };
        const resistances = actor.system.resistances ?? {};
        const names = Object.keys(resistances);
        // the card's recorded pick wins (2026-10-21): the GM may have picked
        // after the click was confirmed
        const triggering = roll.options?.resistance || msg.stressRoll?.options?.resistance || '';
        const decided = clearScope({ result, pick: msg.getFlag('heart', 'fallout-pick'), triggering, resistances: names });
        const clear = decided || (result === 'minor-fallout' && names.includes(scope) ? scope : '');
        if (!clear) return { status: 'missing' };
        const keys = clear === 'all' ? names : [clear];
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

// Any other one-use card button (a restock's payer fallout):
// flags.heart.claimed.<key> holds who claimed it (true before 2026-10-21).
// A fallout button is only for the GM or that character's player (R8).
async function claimCardButton({ messageId, key }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg || !key) return { status: 'missing' };
    const character = falloutKeyCharacter(key);
    if (character && userId !== undefined && !mayRollFallout(userOf(userId), game.actors.get(character))) return { status: 'not-allowed' };
    if (msg.getFlag('heart', 'claimed')?.[key]) return { status: 'already' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ [`flags.heart.claimed.${key}`]: userId ?? true });
    return { status: 'done' };
}

// ...and its release, when the roll it was claimed for could not be made
// (2026-10-21, R13): only the claimant or a GM
async function releaseCardButton({ messageId, key }, userId) {
    const msg = game.messages.get(messageId);
    if (!msg || !key) return { status: 'missing' };
    const claimant = msg.getFlag('heart', 'claimed')?.[key];
    if (!claimant) return { status: 'already' };
    if (userId !== undefined && !userOf(userId)?.isGM && claimant !== userId) return { status: 'not-allowed' };
    if (!msg.isOwner) return { status: 'needs-gm' };
    await msg.update({ [`flags.heart.claimed.${key}`]: false });
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
    registerRelayHandler('record-fallout-pick', recordFalloutPick);
    registerRelayHandler('clear-stress', clearStressOnCard);
    registerRelayHandler('claim-card-button', claimCardButton);
    registerRelayHandler('release-card-button', releaseCardButton);
}

export const CARD_ACTIONS = {
    applyStress,
    attachStress,
    takeStressOnCard,
    claimFallout,
    releaseFallout,
    attachFallout,
    recordFalloutPick,
    clearStressOnCard,
    claimCardButton,
    releaseCardButton,
};
