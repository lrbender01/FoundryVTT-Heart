// The party actor and the Provisions house rule (2026-09-30).
//
// Provisions is ONE track for the whole world, kept on a singleton Actor of
// type `party` (reference/heart-rules/provisions.md; plan in the monorepo at
// docs/plans/heart-provisions.md). An actor rather than a world setting
// because players must be able to mark it from their own stress cards:
// world settings are GM-write only, and the party actor is created with
// every player as owner, so the stress card's ordinary actor.update works.
//
// Guarded singleton: the first active GM creates it on ready; a second party
// actor is refused; deleting it is refused (use reset() instead).
//
// Everything here is behaviour. The layout of the party sheet, the character
// sheet's Provisions track and the prompt / card wording belong to the UI;
// sheet.html in this folder is a placeholder.

import {
    PROVISIONS_MAX,
    CRITICAL_FROM,
    UPKEEP_DIE,
    SCAVENGE_RELIEF,
    restockRelief,
    provisionsProtection,
    relievedValue,
} from './rules';

export const PARTY_TYPE = 'party';
export const PARTY_IMG = 'systems/heart/assets/icons/resistances/provisions.svg';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

export function getParty() {
    return game.actors?.find(a => a.type === PARTY_TYPE);
}

export function activePartyFallouts(party) {
    return (party?.items ?? []).filter(i => i.type === 'fallout' && !i.system?.complete);
}

// { value, max, protection, quartermaster, quartermasterName, criticalFrom, pastRolling }
export function provisionsOf(party) {
    const sys = party?.system ?? {};
    const value = Number(sys.provisions?.value) || 0;
    const max = Number(sys.provisions?.max) || PROVISIONS_MAX;
    const qm = sys.quartermaster ? game.actors?.get(sys.quartermaster) : undefined;
    const falloutNames = activePartyFallouts(party).map(f => game.i18n.localize(f.name ?? ''));
    return {
        value,
        max,
        protection: provisionsProtection(qm?.system?.resistances?.supplies?.protection, falloutNames),
        quartermaster: qm ? qm.id : '',
        quartermasterName: qm?.name ?? '',
        criticalFrom: CRITICAL_FROM,
        pastRolling: value >= max,
    };
}

function requireParty() {
    const party = getParty();
    if (!party) ui.notifications.warn(loc('heart.party.no-party'));
    return party;
}

function requireOwner(doc) {
    if (doc?.isOwner) return true;
    ui.notifications.warn(loc('heart.party.not-owner', { name: doc?.name ?? '' }));
    return false;
}

function speakerFor(actorId) {
    const actor = actorId ? game.actors.get(actorId) : undefined;
    return actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker();
}

function sourceLabel(source) {
    return source ? loc(`heart.party.source.${source}`) : '';
}

// A stress card for the party: the ordinary StressRoll with resistance
// 'provisions', applied at once (its takeStress marks the party a single time,
// less the quartermaster's protection) and posted with the fallout button.
async function stressCard({ formula, dieLabel, resistance, character, ignoreProtection = false, flavor }) {
    const StressRoll = game.heart.rolls.StressRoll;
    const roll = new StressRoll(formula, {}, {
        result: 'n_a',
        die_size: dieLabel,
        character,
        resistance,
        ignoreProtection: Boolean(ignoreProtection),
        helpers: [],
    });
    await roll.evaluate();
    const applied = await roll.takeStress();
    await roll.toMessage({
        speaker: speakerFor(character),
        flavor: flavor || undefined,
        flags: {
            heart: {
                'show-take-stress-button': false,
                'show-fallout-roll-button': applied.some(a => a.amount > 0),
            },
        },
    });
    return roll;
}

// ---------------------------------------------------------------- the API
// Exposed on the party proxy: game.heart.party.proxy.<name>(...). Any owner
// of the party actor (every player) may call them; each posts its own card.

// Mark stress to Provisions: roll `die` (or take a fixed `amount`), less the
// quartermaster's protection unless ignored; the card offers the fallout roll.
export async function markProvisions({ die = UPKEEP_DIE, amount, ignoreProtection = false, source, byActorId } = {}) {
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    const fixed = amount !== undefined && amount !== null && amount !== '';
    const n = fixed ? Math.max(0, Math.floor(Number(amount) || 0)) : 0;
    return stressCard({
        formula: fixed ? String(n) : String(die).toLowerCase(),
        dieLabel: fixed ? String(n) : String(die).toLowerCase(),
        resistance: 'provisions',
        character: byActorId ?? game.user.character?.id ?? party.id,
        ignoreProtection,
        flavor: sourceLabel(source),
    });
}

// Upkeep: D4 at the end of every delve, or every night outside a haven
export function upkeep({ die = UPKEEP_DIE, byActorId } = {}) {
    return markProvisions({ die, source: 'upkeep', byActorId });
}

// Remove stress from Provisions: roll `die` or take a fixed `amount`
export async function relieveProvisions({ die = SCAVENGE_RELIEF, amount, source, byActorId } = {}) {
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    const fixed = amount !== undefined && amount !== null && amount !== '';
    let roll;
    let relief;
    if (fixed) {
        relief = Math.max(0, Math.floor(Number(amount) || 0));
    } else {
        roll = await new Roll(String(die).toLowerCase()).evaluate();
        relief = Number(roll.total) || 0;
    }
    const before = provisionsOf(party).value;
    const after = relievedValue(before, relief);
    await party.update({ 'system.provisions.value': after });
    const text = loc('heart.party.chat.relieved', {
        name: party.name, amount: relief, from: before, to: after, source: sourceLabel(source),
    });
    if (roll) await roll.toMessage({ speaker: speakerFor(byActorId), flavor: text });
    else await ChatMessage.create({ speaker: speakerFor(byActorId), content: `<p>${esc(text)}</p>` });
    return { amount: relief, from: before, to: after };
}

// Restock: the payer marks D4 / D6 / D8 to their own Supplies (a normal
// stress card, so their protection and their own fallout roll apply), then
// Provisions loses one size larger (D6 / D8 / D10).
export async function restock({ payerId, die = 'd4' } = {}) {
    let relief;
    try {
        relief = restockRelief(die);
    } catch (e) {
        ui.notifications.warn(loc('heart.party.restock-die'));
        return null;
    }
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    const payer = game.actors.get(payerId);
    if (!payer || payer.type !== 'character') {
        ui.notifications.warn(loc('heart.party.restock-payer'));
        return null;
    }
    if (!requireOwner(payer)) return null;
    const payment = await stressCard({
        formula: String(die).toLowerCase(),
        dieLabel: String(die).toLowerCase(),
        resistance: 'supplies',
        character: payer.id,
        flavor: sourceLabel('restock'),
    });
    const result = await relieveProvisions({ die: relief, source: 'restock', byActorId: payer.id });
    return { payment, ...result };
}

// Scavenging succeeded (the Delve+Domain roll itself is an ordinary roll)
export function scavengeRelief({ byActorId } = {}) {
    return relieveProvisions({ die: SCAVENGE_RELIEF, source: 'scavenge', byActorId });
}

export async function setQuartermaster(actorId) {
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (actorId && (!actor || actor.type !== 'character')) {
        ui.notifications.warn(loc('heart.party.quartermaster-character'));
        return null;
    }
    await party.update({ 'system.quartermaster': actor ? actor.id : '' });
    const text = actor
        ? loc('heart.party.chat.quartermaster', { name: actor.name })
        : loc('heart.party.chat.no-quartermaster');
    await ChatMessage.create({ speaker: speakerFor(actor?.id), content: `<p>${esc(text)}</p>` });
    return actor;
}

// Clear the track (what a Provisions fallout does, or a rest in Derelictus)
export async function clearProvisions({ source } = {}) {
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    const before = provisionsOf(party).value;
    await party.update({ 'system.provisions.value': 0 });
    const text = loc('heart.party.chat.cleared', { name: party.name, from: before, source: sourceLabel(source) });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content: `<p>${esc(text)}</p>` });
    return { from: before, to: 0 };
}

// GM only: empty the track, drop the quartermaster and the party's fallouts
export async function reset() {
    if (!game.user.isGM) {
        ui.notifications.warn(loc('heart.party.gm-only'));
        return null;
    }
    const party = requireParty();
    if (!party) return null;
    await party.update({ 'system.provisions.value': 0, 'system.quartermaster': '' });
    const ids = party.items.filter(i => i.type === 'fallout').map(i => i.id);
    if (ids.length) await party.deleteEmbeddedDocuments('Item', ids);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content: `<p>${esc(loc('heart.party.chat.reset', { name: party.name }))}</p>` });
    return party;
}

export const PARTY_API = {
    markProvisions,
    upkeep,
    relieveProvisions,
    restock,
    scavengeRelief,
    setQuartermaster,
    clearProvisions,
    reset,
};

// ---------------------------------------------------------------- lifecycle

// The first active GM creates the party actor if the world has none
export async function ensureParty() {
    if (!game.users.activeGM?.isSelf) return;
    const existing = getParty();
    if (existing) {
        // parties made before Provisions had its own glyph used Supplies'
        // (2026-09-30); only that untouched placeholder is replaced
        if (existing.img === 'systems/heart/assets/icons/resistances/supplies.svg') await existing.update({ img: PARTY_IMG });
        return;
    }
    await Actor.create({
        name: loc('heart.party.default-name'),
        type: PARTY_TYPE,
        img: PARTY_IMG,
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
        flags: { heart: { singleton: true } },
    });
}

export function registerPartyHooks() {
    // One party per world. The first one is owned by everyone, however it is
    // created. options.heartAllowSecondParty is the deliberate escape hatch.
    Hooks.on('preCreateActor', (doc, data, options, userId) => {
        if (doc.type !== PARTY_TYPE) return;
        if (!options.heartAllowSecondParty && getParty()) {
            if (userId === game.user.id) ui.notifications.warn(loc('heart.party.singleton'));
            return false;
        }
        doc.updateSource({
            'ownership.default': CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
            'flags.heart.singleton': true,
        });
    });

    // Deleting it would lose the track and every character's link to it;
    // reset() empties it instead. options.heartForce overrides.
    Hooks.on('preDeleteActor', (doc, options, userId) => {
        if (doc.type !== PARTY_TYPE || options.heartForce) return;
        if (userId === game.user.id) ui.notifications.warn(loc('heart.party.no-delete'));
        return false;
    });

    Hooks.once('ready', ensureParty);
}
