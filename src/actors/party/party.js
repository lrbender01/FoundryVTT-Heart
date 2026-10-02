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
    provisionsChange,
} from './rules';
import { glyphFor } from '../../common/icons';
import { ledgerCard } from '../../common/ledger';
import { askGM } from '../../common/relay';
import { oneAtATime } from '../../common/busy';

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

// Every change to the track is made by the GM's client, one at a time, from
// the value it holds then (2026-10-02, Luke: two players marking at once
// must both count; common/relay.js). Only for relay handlers: anyone else
// calls changeProvisions().
export async function applyProvisions({ mode, amount } = {}, userId) {
    const party = getParty();
    if (!party) return { status: 'no-party' };
    const user = game.users?.get(userId);
    if (user && !party.testUserPermission(user, 'OWNER')) return { status: 'not-allowed' };
    const { value: before, max } = provisionsOf(party);
    const after = provisionsChange(before, max, { mode, amount });
    if (after !== before) await party.update({ 'system.provisions.value': after });
    return { status: 'done', from: before, to: after, max };
}

// { from, to, max } once the GM's client made the change, else null (the
// user was told why)
export function changeProvisions(change) {
    return askGM('provisions', change);
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
    // marked by the GM's client (common/relay.js, rolls/card-actions.js)
    const answer = await askGM('apply-stress', { roll: roll.toJSON() });
    if (!answer) return null;
    const applied = answer.applied ?? [];
    roll.options.applied = applied;
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

// ---------------------------------------------------------------- cards
// Ledger chat cards for the Provisions actions that are not a StressRoll
// card (the builder is shared with bonds: common/ledger.js)

const provisionsLabel = () => loc('heart.resistance.provisions');
const provisionsWhat = (text) => `${glyphFor('resistance', 'provisions')}${text}`;

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
    const change = await changeProvisions({ mode: 'relieve', amount: relief });
    if (!change) return null;
    const { from: before, to: after, max } = change;

    const dieLabel = fixed ? '' : String(die).toUpperCase();
    const what = [esc(sourceLabel(source) || loc('heart.card.relief')), dieLabel].filter(Boolean).join(', ');
    const content = await ledgerCard({
        rolls: [{ roll, label: provisionsLabel() }],
        what: provisionsWhat(what),
        glyph: glyphFor('resistance', 'provisions'),
        out: esc(loc('heart.card.provisions-out', { amount: `-${relief}` })),
        lines: [{ name: esc(party.name), value: esc(loc('heart.card.provisions-change', { from: before, to: after, max })) }],
    });
    await ChatMessage.create({ speaker: speakerFor(byActorId), content, rolls: roll ? [roll] : [] });
    return { amount: relief, from: before, to: after };
}

// Restock: the payer marks D4 / D6 / D8 to their own Supplies (their
// protection applies, and their own fallout can be rolled from the card),
// then Provisions loses one size larger (D6 / D8 / D10). One card for both
// (2026-09-30 review): "-6 Provisions Stress", "Resupplied D8 provisions.",
// "Kettle pays D6: +4 Supplies Stress".
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

    // the payment: an ordinary stress roll to the payer's Supplies
    const StressRoll = game.heart.rolls.StressRoll;
    const pay = StressRoll._build({ die_size: String(die).toLowerCase(), character: payer.id, resistance: 'supplies' }, {}, {});
    await pay.evaluate();
    // both writes by the GM's client (common/relay.js)
    const payment = await askGM('apply-stress', { roll: pay.toJSON() });
    if (!payment) return null;
    pay.options.applied = payment.applied ?? [];
    const [paid] = pay.options.applied;

    // the relief: one die size larger off Provisions
    const reliefRoll = await new Roll(relief).evaluate();
    const change = await changeProvisions({ mode: 'relieve', amount: reliefRoll.total });
    if (!change) return null;
    const { from: before, to: after, max } = change;

    const supplies = payer.system?.resistances?.supplies;
    const payValue = [
        loc('heart.card.pays-amount', { amount: paid?.amount ?? 0 }),
        paid?.protection ? `(${loc('heart.card.protection', { protection: paid.protection })})` : '',
        supplies ? `· ${loc('heart.card.track', { value: Number(supplies.value) || 0, max: 10 })}` : '',
    ].filter(Boolean).join(' ');
    const falloutButton = (paid?.amount ?? 0) > 0
        ? `<button type="button" data-action="ledger-fallout" data-claim="fallout-${esc(payer.id)}" data-character="${esc(payer.id)}" data-resistance="supplies" data-tooltip="heart.term.fallout">${esc(loc('heart.card.fallout-for', { name: payer.name }))}</button>`
        : '';
    const content = await ledgerCard({
        rolls: [{ roll: pay, label: loc('heart.resistance.supplies') }, { roll: reliefRoll, label: provisionsLabel() }],
        what: provisionsWhat(esc(loc('heart.card.restock-what', { die: String(die).toUpperCase() }))),
        glyph: glyphFor('resistance', 'provisions'),
        out: esc(loc('heart.card.provisions-out', { amount: `-${reliefRoll.total}` })),
        det: esc(loc('heart.card.restock-det', { die: String(relief).toUpperCase() })),
        lines: [
            { name: esc(loc('heart.card.pays', { name: payer.name, die: String(die).toUpperCase() })), value: esc(payValue) },
            { name: esc(party.name), value: esc(loc('heart.card.provisions-change', { from: before, to: after, max })) },
        ],
        acts: falloutButton,
    });
    await ChatMessage.create({ speaker: speakerFor(payer.id), content, rolls: [pay, reliefRoll] });
    return { payment: pay, amount: reliefRoll.total, from: before, to: after };
}

// Scavenging succeeded (the Delve+Domain roll itself is an ordinary roll)
export function scavengeRelief({ byActorId } = {}) {
    return relieveProvisions({ die: SCAVENGE_RELIEF, source: 'scavenge', byActorId });
}

export async function setQuartermaster(actorId) {
    // GM only (2026-09-30, Luke)
    if (!game.user.isGM) {
        ui.notifications.warn(loc('heart.party.gm-only-settings'));
        return null;
    }
    const party = requireParty();
    if (!party) return null;
    const actor = actorId ? game.actors.get(actorId) : null;
    if (actorId && (!actor || actor.type !== 'character')) {
        ui.notifications.warn(loc('heart.party.quartermaster-character'));
        return null;
    }
    // no chat message: the sheets show the quartermaster (2026-09-30 review)
    await party.update({ 'system.quartermaster': actor ? actor.id : '' });
    return actor;
}

// A player may volunteer their own character as quartermaster (2026-10-01,
// Luke): only a member they own, and only while nobody holds the post. The
// GM still picks or changes anyone from the party sheet.
export function canVolunteer(party, actor, user = game.user) {
    if (!party || actor?.type !== 'character') return false;
    if (!actor.testUserPermission(user, 'OWNER')) return false;
    if (!(party.system.members ?? []).includes(actor.id)) return false;
    return !provisionsOf(party).quartermaster;
}

export async function volunteerQuartermaster(actorId) {
    const party = requireParty();
    if (!party) return null;
    const actor = game.actors.get(actorId);
    if (!canVolunteer(party, actor)) {
        ui.notifications.warn(loc('heart.party.volunteer-refused'));
        return null;
    }
    await party.update({ 'system.quartermaster': actor.id });
    return actor;
}

// ...and resign it the same way (2026-10-01, Luke): only the quartermaster's
// own player, leaving the post empty for anyone to volunteer
export function canResign(party, actor, user = game.user) {
    if (!party || actor?.type !== 'character') return false;
    if (!actor.testUserPermission(user, 'OWNER')) return false;
    return Boolean(actor.id) && party.system.quartermaster === actor.id;
}

export async function resignQuartermaster(actorId) {
    const party = requireParty();
    if (!party) return null;
    const actor = game.actors.get(actorId);
    if (!canResign(party, actor)) {
        ui.notifications.warn(loc('heart.party.resign-refused'));
        return null;
    }
    await party.update({ 'system.quartermaster': '' });
    return actor;
}

// Clear the track (what a Provisions fallout does, or a rest in Derelictus)
export async function clearProvisions({ source } = {}) {
    const party = requireParty();
    if (!party || !requireOwner(party)) return null;
    // no chat notice (2026-09-30 review: the one-line cards are gone; the
    // sheets show the track)
    const change = await changeProvisions({ mode: 'set', amount: 0 });
    return change ? { from: change.from, to: change.to } : null;
}

// GM only: a fresh party for a new adventure (2026-09-30 review): Provisions
// empty, no quartermaster, no members, no fallouts, no notes, and the
// default name and portrait
export async function reset() {
    if (!game.user.isGM) {
        ui.notifications.warn(loc('heart.party.gm-only'));
        return null;
    }
    const party = requireParty();
    if (!party) return null;
    await party.update({
        name: loc('heart.party.default-name'),
        img: PARTY_IMG,
        'system.provisions.value': 0,
        'system.quartermaster': '',
        'system.members': [],
        'system.notes': '',
    });
    // every party item goes: fallouts and the shared gear (2026-09-30)
    const ids = party.items.map(i => i.id);
    if (ids.length) await party.deleteEmbeddedDocuments('Item', ids);
    return party;
}

export const PARTY_API = {
    markProvisions,
    upkeep,
    relieveProvisions,
    restock,
    scavengeRelief,
    setQuartermaster,
    volunteerQuartermaster,
    resignQuartermaster,
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
    // The payer's fallout button on a restock card: rolls their fallout as
    // its own card. The GM's client claims the button first (2026-10-02,
    // rolls/card-actions.js), so it rolls once however many clicks; a claimed
    // button is left out when the card is drawn.
    Hooks.on('renderChatMessage', (message, html) => {
        const claimed = message.getFlag('heart', 'claimed') ?? {};
        const keyOf = (el) => el.dataset.claim || `fallout-${el.dataset.character}`;
        html.find('[data-action=ledger-fallout]').each((i, el) => {
            if (claimed[keyOf(el)]) el.remove();
        });
        html.find('.ledger-acts').each((i, el) => {
            if (!el.querySelector('button, a')) el.remove();
        });
        html.find('[data-action=ledger-fallout]').on('click', ev => {
            ev.preventDefault();
            const button = ev.currentTarget;
            const { character, resistance } = button.dataset;
            const key = keyOf(button);
            return oneAtATime(`${message.id}:${key}`, button, async () => {
                const actor = game.actors.get(character);
                if (!actor?.isOwner) {
                    ui.notifications.warn(loc('heart.party.not-owner', { name: actor?.name ?? '' }));
                    return;
                }
                if (!(await askGM('claim-card-button', { messageId: message.id, key }))) return;
                const roll = await game.heart.rolls.FalloutRoll.build({ character, resistance });
                if (!roll) return;
                await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }) });
            });
        });
    });

    // GM-only party settings (2026-09-30, Luke): everyone owns the party (so
    // Fallout, Provisions, items, and notes stay open to players), but only
    // the GM renames it, picks the quartermaster, or adds members. A player
    // may still take their own character out (the member list may shrink),
    // volunteer their own character while there is no quartermaster
    // (canVolunteer), and resign their own character from the post
    // (canResign). Checked on the updating client, before anything is sent.
    Hooks.on('preUpdateActor', (actor, changes, options, userId) => {
        const user = game.users.get(userId);
        if (actor.type !== PARTY_TYPE || user?.isGM) return;
        const blocked = [];
        if ('name' in changes && changes.name !== actor.name) blocked.push('name');
        if (foundry.utils.hasProperty(changes, 'system.quartermaster')) {
            const qm = foundry.utils.getProperty(changes, 'system.quartermaster');
            const volunteer = qm && canVolunteer(actor, game.actors.get(qm), user);
            const resign = !qm && canResign(actor, game.actors.get(actor.system.quartermaster), user);
            if (qm !== actor.system.quartermaster && !volunteer && !resign) blocked.push('quartermaster');
        }
        if (foundry.utils.hasProperty(changes, 'system.members')) {
            const before = new Set(actor.system.members ?? []);
            const after = foundry.utils.getProperty(changes, 'system.members') ?? [];
            // a player only takes out their own characters (2026-10-02,
            // found by the tests); an id whose actor is gone may still go
            const takesOthers = [...before].some(id => {
                const member = game.actors.get(id);
                return !after.includes(id) && member && !member.testUserPermission(user, 'OWNER');
            });
            if (after.some(id => !before.has(id)) || takesOthers) blocked.push('members');
        }
        if (!blocked.length) return;
        if (userId === game.user.id) ui.notifications.warn(loc('heart.party.gm-only-settings'));
        return false;
    });

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
