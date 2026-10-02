// Bonds (HCB p. 102; W&M W65-W67 hirelings and animals): the document side
// (2026-10-01, Luke). The arithmetic lives in rules.js; this file reads and
// writes documents and posts chat cards. The UI calls these; everything is
// also reachable as game.heart.bonds.<name>(...).
//
// Documents (pared down 2026-10-01, Luke's calls):
//   - a `bond` Item on a character is the relationship: the bonded actor
//     (system.target, a uuid; optional for a person), a name and portrait
//     for when there is none, notes, and for a person bond its Stress pool
//     and its own Fallout (system.children, as a class holds abilities). Its
//     kind follows the actor: a companion actor makes it a companion bond.
//   - a `hireling` Actor is the companion itself, hireling or animal alike
//     (the book gives them the same rules): five Resistance tracks with
//     Protection, its abilities, gear, and its book Fallouts as a menu.
// A Critical removes the bond (HCB p. 102): the GM removes it; there is no
// "broken" state. Fallout is the GM's pick (HCB p. 78): the check's card
// offers the Fallout picker (fallout-picker/), and Stress is always cleared
// by hand.
// Ownership: the bond item belongs to the character, so its players can
// transfer Stress without owning any NPC. Hiring imports a fresh world copy
// of the companion, owned by the character's players when they run it.

import {
    RESISTANCES,
    TRANSFER_DIE,
    HEAL_COST_DIE,
    BOND_STRESS_MAX,
    BOND_ACTION_DIE,
    bondKindFor,
    isCompanion,
    poolStress,
    trackStress,
    canAddBond,
    canLeanOn,
    transferAmount,
    pooledValue,
    bondFalloutResult,
    healOutcome,
    bondActionDice,
    bondActionResult,
} from './rules';
import { afterProtection } from '../rolls/stress-roll/rules';
import { ledgerCard } from '../common/ledger';
import { glyphFor } from '../common/icons';
import { pickFalloutButton } from '../fallout-picker/button';

export const BOND_TYPE = 'bond';
export const HIRELING_TYPE = 'hireling';
export const BOND_IMG = 'systems/heart/assets/icons/resistances/bond.svg';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];

// ---------------------------------------------------------------- reading

export function bondsOf(character) {
    return (character?.items ?? []).filter(i => i.type === BOND_TYPE);
}

// The bonded actor (a companion, or any actor a person bond points at), or
// null when there is none or it no longer exists
export function bondTarget(bond) {
    const uuid = bond?.system?.target;
    if (!uuid) return null;
    try { return fromUuidSync(uuid) ?? null; } catch (e) { return null; }
}

// The bond's person-bond Fallout entries (children), open ones only
export function bondFallouts(bond) {
    return [...(bond?.children ?? [])].filter(c => c.type === 'fallout' && !c.system?.complete);
}

// { kind, companion, target, missing, total, max } for sheets and cards
export function bondState(bond) {
    const sys = bond?.system ?? {};
    const target = bondTarget(bond);
    const kind = bondKindFor(target?.type, sys.kind);
    const companion = isCompanion(kind);
    return {
        kind,
        companion,
        target,
        // a companion's actor is gone (deleted)
        missing: companion && !target,
        total: companion ? trackStress(target?.system?.resistances) : poolStress(sys),
        max: companion ? RESISTANCES.length * 10 : (Number(sys.stress?.max) || BOND_STRESS_MAX),
    };
}

// ---------------------------------------------------------------- guards

function warn(key, data) {
    ui.notifications.warn(loc(key, data));
    return null;
}

function getCharacter(characterId) {
    const actor = game.actors.get(characterId);
    if (!actor || actor.type !== 'character') return warn('heart.bond.not-a-character');
    return actor;
}

function getBond(character, bondId) {
    const bond = character?.items.get(bondId);
    if (!bond || bond.type !== BOND_TYPE) return warn('heart.bond.not-a-bond');
    return bond;
}

function owns(doc) {
    if (doc?.isOwner) return true;
    warn('heart.bond.not-owner', { name: doc?.name ?? '' });
    return false;
}

// character + bond, checked: the character's owner may act on its bonds
function resolve(characterId, bondId) {
    const character = getCharacter(characterId);
    if (!character || !owns(character)) return {};
    const bond = getBond(character, bondId);
    return bond ? { character, bond } : {};
}

function rollDie(die) {
    const d = String(die ?? '').toLowerCase();
    if (!DICE.includes(d)) throw new Error(`heart | bonds: "${die}" is not a die`);
    return new Roll(d).evaluate();
}

const speakerFor = (actor) => (actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker());
const bondWhat = (text) => `${glyphFor('resistance', 'bond')}${text}`;

// ---------------------------------------------------------------- the GM's check

// After Stress lands on a bond: a d12 against its total (the person's pool,
// or the companion's five tracks). Nothing is recorded: on a Minor or Major
// the card offers the GM the Fallout picker for the bond (a person) or the
// companion, and Stress is cleared by hand (2026-10-01, Luke).
async function falloutCheck(bond) {
    const state = bondState(bond);
    const roll = await new Roll('1d12').evaluate();
    const result = bondFalloutResult(roll.total, state.total);
    const severity = result === 'no-fallout' ? '' : result.replace(/-fallout$/, '');
    // where a picked Fallout goes: the companion actor, or the bond itself
    const pickTarget = state.companion ? state.target?.uuid : bond.uuid;
    return { roll, result, severity, total: state.total, companion: state.companion, pickTarget };
}

function checkLine(bond, check) {
    const verdict = loc(`heart.bond.check.${check.result}`);
    const extra = check.severity ? ` ${loc('heart.bond.check.pick')}` : '';
    return { name: esc(loc('heart.bond.check.line', { name: bond.name, total: check.total })), value: esc(verdict + extra) };
}

const checkActs = (check) => (check.severity && check.pickTarget ? pickFalloutButton({ targetUuid: check.pickTarget, severity: check.severity, resistance: 'bond' }) : '');

// ---------------------------------------------------------------- the API

// GM only ("at the GM's discretion"): give a character a bond. With
// `targetUuid` the bond links that actor (its kind follows the actor) and
// takes its name / portrait unless given. A character with three bonds is
// refused until one is removed (no replacing, 2026-10-02, Luke).
export async function addBond({ characterId, name, img, targetUuid = '', notes = '' } = {}) {
    if (!game.user.isGM) return warn('heart.bond.gm-only-add');
    const character = getCharacter(characterId);
    if (!character) return null;
    const target = targetUuid ? fromUuidSync(targetUuid) : null;
    if (targetUuid && !target) return warn('heart.bond.no-target');
    const existing = bondsOf(character);
    if (targetUuid && existing.some(b => b.system.target === targetUuid)) return warn('heart.bond.refused.already', { name: character.name, bond: target.name });
    if (!canAddBond(existing.length)) return warn('heart.bond.refused.full', { name: character.name, bond: name ?? target?.name ?? '' });
    const [bond] = await character.createEmbeddedDocuments('Item', [{
        name: name || target?.name || loc('heart.bond.default-name'),
        type: BOND_TYPE,
        img: img || target?.img || BOND_IMG,
        // the kind is kept only so a companion bond whose actor is later
        // deleted still reads as one
        system: { kind: bondKindFor(target?.type, 'person'), target: targetUuid, notes },
    }]);
    return bond;
}

// A companion copied from an older content pack: its ability was a field;
// it is an ability item now (2026-10-01)
export function abilityItemFrom(ability) {
    if (!ability?.name) return null;
    return {
        name: ability.name,
        type: 'ability',
        img: 'systems/heart/assets/icons/items/ability.svg',
        system: { description: ability.description ?? '', mechanics: '', type: 'core', active: true, children: {} },
    };
}

// GM only: hire a companion (any `hireling` actor, usually from the
// compendium). A compendium entry becomes a fresh world copy; `runBy:
// 'player'` makes the character's players its owners (W66: decide who rolls
// for it), 'gm' keeps it with the GM. Then the bond is added. Refused before
// anything is copied when the character already has three bonds; a copy
// whose bond still fails is deleted again, so no stray companion is left.
export async function hire({ characterId, hirelingUuid, runBy = 'player', name } = {}) {
    if (!game.user.isGM) return warn('heart.bond.gm-only-add');
    const character = getCharacter(characterId);
    if (!character) return null;
    const source = await fromUuid(hirelingUuid);
    if (!source || source.documentName !== 'Actor' || source.type !== HIRELING_TYPE) return warn('heart.bond.needs-hireling');
    if (!canAddBond(bondsOf(character).length)) return warn('heart.bond.refused.full', { name: character.name, bond: name || source.name });
    let actor = source;
    let copied = false;
    if (source.pack) {
        const data = source.toObject();
        delete data._id;
        delete data.folder;
        if (name) data.name = name;
        // what the book calls them ("Cook"), shown before "Bond of ..." when
        // they go by another name (2026-10-01, Luke)
        foundry.utils.setProperty(data, 'flags.heart.role', source.name);
        data.items = data.items ?? [];
        // their book Fallouts are a menu: the GM switches one on through the
        // Fallout picker (an older pack shipped them switched on)
        for (const item of data.items) {
            if (item.type === 'fallout') foundry.utils.setProperty(item, 'system.active', false);
        }
        const legacy = abilityItemFrom(data.system?.ability);
        if (legacy && !data.items.some(i => i.type === 'ability')) data.items.unshift(legacy);
        actor = await Actor.create(data);
        copied = true;
    }
    const bond = await addBond({ characterId, targetUuid: actor.uuid });
    if (!bond) {
        if (copied) await actor.delete();
        return null;
    }
    if (runBy === 'player') {
        const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        const grant = {};
        for (const user of game.users) {
            if (!user.isGM && character.testUserPermission(user, 'OWNER')) grant[user.id] = OWNER;
        }
        if (Object.keys(grant).length) await actor.update({ ownership: grant });
    }
    return { bond, hireling: actor };
}

// The GM or the character's player: end a bond. A bonded actor stays (a
// dismissed companion is still in the world). Also what a Critical does.
export async function removeBond({ characterId, bondId } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    await bond.delete();
    return true;
}

// Visit a person bond and move up to D8 of the character's Stress in one
// Resistance onto them (never more than marked there). `amount` replaces
// the roll. Then the GM's Fallout check.
export async function transferStress({ characterId, bondId, resistance = 'mind', die = TRANSFER_DIE, amount } = {}) {
    const { character, bond } = resolve(characterId, bondId);
    if (!bond) return null;
    if (!canLeanOn(bondState(bond).kind)) return warn('heart.bond.companion-no-transfer', { name: bond.name });
    if (!RESISTANCES.includes(resistance)) return warn('heart.bond.bad-resistance');

    const fixed = amount !== undefined && amount !== null && amount !== '';
    const roll = fixed ? null : await rollDie(die);
    const rolled = fixed ? Math.max(0, Math.floor(Number(amount) || 0)) : roll.total;
    const available = Number(character.system.resistances?.[resistance]?.value) || 0;
    const moved = transferAmount(rolled, available);
    const poolBefore = poolStress(bond.system);
    const max = Number(bond.system.stress?.max) || BOND_STRESS_MAX;

    await character.update({ [`system.resistances.${resistance}.value`]: available - moved });
    await bond.update({ 'system.stress.value': pooledValue(poolBefore, moved, max) });

    const check = await falloutCheck(bond);
    const resistanceLabel = loc(`heart.resistance.${resistance}`);
    const content = await ledgerCard({
        rolls: [roll ? { roll, label: resistanceLabel } : null, { roll: check.roll, label: loc('heart.bond.check.die') }],
        what: bondWhat(esc(loc('heart.bond.card.transfer-what', { name: character.name, bond: bond.name, die: fixed ? rolled : String(die).toUpperCase() }))),
        glyph: glyphFor('resistance', resistance),
        bad: check.result !== 'no-fallout',
        out: esc(loc('heart.bond.card.transfer-out', { amount: moved, resistance: resistanceLabel })),
        det: moved < rolled ? esc(loc('heart.bond.card.capped', { rolled, available })) : '',
        lines: [
            { name: esc(character.name), value: esc(loc('heart.bond.card.track', { resistance: resistanceLabel, from: available, to: available - moved })) },
            { name: esc(bond.name), value: esc(loc('heart.bond.card.pool', { from: poolBefore, to: pooledValue(poolBefore, moved, max), max })) },
            checkLine(bond, check),
        ],
        acts: checkActs(check),
    });
    await ChatMessage.create({ speaker: speakerFor(character), content, rolls: [roll, check.roll].filter(Boolean) });
    return { moved, check };
}

// Visit a person bond to remove one of the character's Minor Fallouts or
// downgrade a Major to Minor, at D8 Stress to the bond; then the GM's check.
export async function healFallout({ characterId, bondId, falloutId, die = HEAL_COST_DIE } = {}) {
    const { character, bond } = resolve(characterId, bondId);
    if (!bond) return null;
    if (!canLeanOn(bondState(bond).kind)) return warn('heart.bond.companion-no-transfer', { name: bond.name });
    const fallout = character.items.get(falloutId);
    if (!fallout || fallout.type !== 'fallout') return warn('heart.bond.not-a-fallout');
    const outcome = healOutcome(fallout.system.type);
    if (!outcome) return warn('heart.bond.cannot-heal', { name: fallout.name });

    const cost = await rollDie(die);
    const poolBefore = poolStress(bond.system);
    const max = Number(bond.system.stress?.max) || BOND_STRESS_MAX;
    await bond.update({ 'system.stress.value': pooledValue(poolBefore, cost.total, max) });
    const falloutName = fallout.name;
    if (outcome === 'remove') await fallout.delete();
    else await fallout.update({ 'system.type': 'minor' });

    const check = await falloutCheck(bond);
    const content = await ledgerCard({
        rolls: [{ roll: cost, label: bond.name }, { roll: check.roll, label: loc('heart.bond.check.die') }],
        what: bondWhat(esc(loc('heart.bond.card.heal-what', { name: character.name, bond: bond.name }))),
        glyph: glyphFor('severity', outcome === 'remove' ? 'minor' : 'major'),
        bad: check.result !== 'no-fallout',
        out: esc(loc(`heart.bond.card.heal-${outcome}`, { fallout: falloutName })),
        lines: [
            { name: esc(bond.name), value: esc(loc('heart.bond.card.pool', { from: poolBefore, to: pooledValue(poolBefore, cost.total, max), max })) },
            checkLine(bond, check),
        ],
        acts: checkActs(check),
    });
    await ChatMessage.create({ speaker: speakerFor(character), content, rolls: [cost, check.roll] });
    return { outcome, cost: cost.total, check };
}

// Stress on a bond from the fiction: a person bond's pool, or the companion's
// track less its Protection (needs ownership of the companion). `amount`
// replaces the roll. Rolls the GM's check unless check: false. (API only:
// on the sheets the GM clicks a pool's marks, and a companion takes Stress
// through the ordinary Stress roll.)
export async function markBondStress({ characterId, bondId, resistance = 'mind', die = 'd4', amount, ignoreProtection = false, check = true } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    const state = bondState(bond);
    if (state.missing) return warn('heart.bond.no-target');
    if (state.companion && !owns(state.target)) return null;
    const fixed = amount !== undefined && amount !== null && amount !== '';
    const roll = fixed ? null : await rollDie(die);
    const rolled = fixed ? Math.max(0, Math.floor(Number(amount) || 0)) : roll.total;
    let line;
    if (state.companion) {
        if (!RESISTANCES.includes(resistance)) return warn('heart.bond.bad-resistance');
        const hireling = state.target;
        const track = hireling.system.resistances?.[resistance] ?? {};
        const { amount: taken, protection } = afterProtection(rolled, track.protection, ignoreProtection);
        const before = Number(track.value) || 0;
        const after = Math.min(Number(track.max) || 10, before + taken);
        await hireling.update({ [`system.resistances.${resistance}.value`]: after });
        line = { name: esc(hireling.name), value: esc(loc('heart.bond.card.track-protected', { resistance: loc(`heart.resistance.${resistance}`), from: before, to: after, protection })) };
    } else {
        const before = poolStress(bond.system);
        const max = Number(bond.system.stress?.max) || BOND_STRESS_MAX;
        await bond.update({ 'system.stress.value': pooledValue(before, rolled, max) });
        line = { name: esc(bond.name), value: esc(loc('heart.bond.card.pool', { from: before, to: pooledValue(before, rolled, max), max })) };
    }
    const fallout = check ? await falloutCheck(bond) : null;
    const content = await ledgerCard({
        rolls: [roll ? { roll, label: bond.name } : null, fallout ? { roll: fallout.roll, label: loc('heart.bond.check.die') } : null],
        what: bondWhat(esc(loc('heart.bond.card.mark-what', { bond: bond.name, die: fixed ? rolled : String(die).toUpperCase() }))),
        bad: Boolean(fallout && fallout.result !== 'no-fallout'),
        out: esc(loc('heart.bond.card.mark-out', { amount: rolled })),
        lines: [line, fallout ? checkLine(bond, fallout) : null].filter(Boolean),
        acts: fallout ? checkActs(fallout) : '',
    });
    await ChatMessage.create({ speaker: speakerFor(state.target ?? bond.parent), content, rolls: [roll, fallout?.roll].filter(Boolean) });
    return { amount: rolled, check: fallout };
}

// The GM's Fallout check on its own
export async function rollBondFallout({ characterId, bondId } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    const check = await falloutCheck(bond);
    const content = await ledgerCard({
        rolls: [{ roll: check.roll, label: loc('heart.bond.check.die') }],
        what: bondWhat(esc(loc('heart.bond.card.check-what', { bond: bond.name }))),
        bad: check.result !== 'no-fallout',
        out: esc(loc(`heart.bond.check.${check.result}`)),
        lines: [checkLine(bond, check)],
        acts: checkActs(check),
    });
    await ChatMessage.create({ speaker: speakerFor(bond.parent), content, rolls: [check.roll] });
    return check;
}

// Set a person bond's pool (the GM clicking its marks), or clear it
export async function setBondStress({ characterId, bondId, value = 0 } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    const max = Number(bond.system.stress?.max) || BOND_STRESS_MAX;
    await bond.update({ 'system.stress.value': Math.max(0, Math.min(max, Math.floor(Number(value) || 0))) });
    return bond;
}

// Clear a bond's Stress: a person's pool, or the companion's track (all five
// when no resistance is given)
export async function clearBondStress({ characterId, bondId, resistance = null } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    const state = bondState(bond);
    if (!state.companion) {
        await bond.update({ 'system.stress.value': 0 });
        return bond;
    }
    if (state.missing || !owns(state.target)) return null;
    const keys = resistance ? [resistance] : RESISTANCES;
    await state.target.update(Object.fromEntries(keys.map(r => [`system.resistances.${r}.value`, 0])));
    return bond;
}

// Optional bond actions (HCB p. 102; table ruling 7: hirelings and animals
// only, not policed here): 1 D10, +1 at home, +1 in their expertise; the
// highest die reads as a delver's roll. Stress from it goes on by hand.
export async function bondAction({ characterId, bondId, home = false, expertise = false, what = '' } = {}) {
    const { bond } = resolve(characterId, bondId);
    if (!bond) return null;
    const n = bondActionDice({ home, expertise });
    const roll = await new Roll(`${n}${BOND_ACTION_DIE}`).evaluate();
    const values = roll.dice[0]?.results?.map(r => r.result) ?? [roll.total];
    const result = bondActionResult(values);
    const content = await ledgerCard({
        rolls: [{ roll, label: bond.name }],
        what: bondWhat(esc(what ? loc('heart.bond.card.action-what-for', { bond: bond.name, what }) : loc('heart.bond.card.action-what', { bond: bond.name }))),
        bad: ['failure', 'critical_failure'].includes(result),
        out: esc(loc(`heart.result.${result}`)),
        det: esc(loc('heart.bond.card.action-det', { count: n, highest: Math.max(...values) })),
    });
    await ChatMessage.create({ speaker: speakerFor(bondState(bond).target ?? bond.parent), content, rolls: [roll] });
    return { result, values };
}

export const BOND_API = {
    bondsOf,
    bondTarget,
    bondFallouts,
    bondState,
    addBond,
    hire,
    removeBond,
    transferStress,
    healFallout,
    markBondStress,
    rollBondFallout,
    setBondStress,
    clearBondStress,
    bondAction,
};

// ---------------------------------------------------------------- lifecycle

export function registerBondHooks() {
    // At most three bonds, however the item arrives (drag and drop, import)
    Hooks.on('preCreateItem', (item, data, options, userId) => {
        if (item.type !== BOND_TYPE || item.parent?.type !== 'character') return;
        if (!canAddBond(bondsOf(item.parent).length)) {
            if (userId === game.user.id) warn('heart.bond.refused.full', { name: item.parent.name, bond: item.name });
            return false;
        }
    });
    // Bonds belong on characters only
    Hooks.on('preCreateItem', (item, data, options, userId) => {
        if (item.type !== BOND_TYPE || !item.parent || item.parent.type === 'character') return;
        if (userId === game.user.id) warn('heart.bond.characters-only');
        return false;
    });

    // A companion's Stress, Fallout, name, and portrait show on its
    // employers' Bonds rows and on the party sheet's Companions (2026-10-01),
    // so changes redraw them
    const redraw = (sheet) => { if (sheet?.rendered) sheet.render(false); };
    const redrawCompanion = (hireling) => {
        for (const character of game.actors.filter(a => a.type === 'character'
            && a.items.some(i => i.type === BOND_TYPE && i.system.target === hireling.uuid))) redraw(character.sheet);
        redraw(game.heart?.party?.sheet);
    };
    Hooks.on('updateActor', (actor) => {
        if (actor.type === HIRELING_TYPE) redrawCompanion(actor);
    });
    for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
        Hooks.on(hook, (item) => {
            if (item.parent?.type === HIRELING_TYPE) redrawCompanion(item.parent);
            if (item.type === BOND_TYPE && item.parent?.type === 'character') redraw(game.heart?.party?.sheet);
        });
    }
}
