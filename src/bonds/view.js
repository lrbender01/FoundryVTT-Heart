// What the bond surfaces show (2026-10-01, Luke's picks from the Heart Bonds
// Mock, pared down the same day): the character sheet's compact bond rows,
// the pool marks the bond sheet shares, and the party sheet's Companions.
// Pure: documents come in already read (the bond, its bonded actor, its
// Fallout), so it runs in the vitest suite. Every text is a lang key
// through game.i18n.
//
// A row (bondRowView) carries: who the bond is with (portrait and name, the
// bonded actor's when there is one; a kind chip whose tooltip says what the
// kind can do), what it is carrying (a person's ten pool marks, which the
// GM clicks to set or clear, and its open Fallout; a companion's marked
// tracks, its total, and the Fallout it has taken, as small square chips
// like the party chips), and its buttons (Luke's "lean set"):
//   person     Visit, Heal a Fallout; the GM's Fallout Check
//   companion  Open, Bond Action, and (for whoever runs it) Stress, Fallout
//   missing    a companion whose actor was deleted: Remove only
// No greyed buttons: the kind chip's tooltip carries the rule. A Critical
// removes the bond (HCB p. 102), so there is no Broken state.

import { RESISTANCES, BOND_STRESS_MAX, isCompanion, bondKindFor, poolStress, trackStress } from './rules.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// A pool as ten marks, filled up to its value
export function poolMarks(value, max = BOND_STRESS_MAX) {
    const n = Math.max(0, Number(max) || BOND_STRESS_MAX);
    const v = Math.max(0, Number(value) || 0);
    return Array.from({ length: n }, (_, i) => i < v);
}

// A companion's tracks that carry Stress, in the book's order
export function trackSummary(resistances = {}) {
    return RESISTANCES
        .map(key => ({ key, value: Number(resistances?.[key]?.value) || 0 }))
        .filter(track => track.value > 0);
}

// The Fallout a companion has taken: its book Fallouts are a menu (switched
// off); the Fallout picker switches one on; resolving switches it off
export function takenFallouts(items = []) {
    return [...items].filter(i => i?.type === 'fallout' && i.system?.active && !i.system?.complete);
}

const chip = (key, action, tip) => ({ label: t(`heart.bond.ui.${key}`), action, tip });

// The row's buttons, the player's and the GM's. canRun: this user may roll
// for the companion (owns it, or is the GM)
export function bondActions({ kind, missing = false, name = '', canRun = false } = {}) {
    if (isCompanion(kind)) {
        if (missing) return { actions: [chip('remove', 'remove-bond', t('heart.bond.ui.remove-tip'))], gmActions: [] };
        const actions = [
            chip('open', 'open-companion', t('heart.bond.ui.open-companion-tip', { name })),
            chip('bond-action', 'bond-action', t('heart.bond.ui.action-tip')),
        ];
        if (canRun) {
            actions.push(chip('stress', 'companion-stress', t('heart.bond.ui.stress-tip', { name })));
            actions.push(chip('fallout', 'companion-fallout', t('heart.bond.ui.fallout-roll-tip')));
        }
        return { actions, gmActions: [] };
    }
    return {
        actions: [
            chip('visit', 'bond-visit', t('heart.bond.ui.visit-tip')),
            chip('heal', 'bond-heal', t('heart.bond.ui.heal-tip', { name })),
        ],
        gmActions: [chip('check', 'bond-check', t('heart.bond.ui.check-tip'))],
    };
}

// The party sheet's Companions (2026-10-01, Luke's pick): every companion
// bonded to a party member, once each, alphabetical. Under the name (Luke):
// what the book calls them when they go by another name, then "Bond of" and
// who hired them ("Cook, Bond of Vess"). targetOf(bond) resolves a bond's
// bonded actor (bonds.js bondTarget in the sheet).
export function companionCards(members = [], targetOf = () => null) {
    const cards = new Map();
    for (const member of members) {
        for (const bond of [...(member?.items ?? [])]) {
            if (bond?.type !== 'bond') continue;
            const target = targetOf(bond);
            if (!target || bondKindFor(target.type, bond.system?.kind) !== 'companion') continue;
            if (!cards.has(target.uuid)) {
                const role = target.flags?.heart?.role;
                cards.set(target.uuid, {
                    uuid: target.uuid,
                    name: target.name,
                    img: target.img ?? '',
                    kindLabel: t('heart.bond.kind.companion'),
                    role: role && role !== target.name ? role : '',
                    employers: [],
                });
            }
            const card = cards.get(target.uuid);
            if (!card.employers.includes(member.name)) card.employers.push(member.name);
        }
    }
    return [...cards.values()]
        .map(card => {
            const name = card.employers.join(', ');
            const traits = card.role ? t('heart.bond.ui.companion-of', { role: card.role, name }) : t('heart.bond.ui.bond-of', { name });
            return { ...card, traits, label: `${card.name}: ${traits}` };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// One compact row. bond: the bond item ({ id, uuid, name, img, system });
// target: its bonded actor or null; fallouts: a person bond's open Fallout
// children; companionItems: the companion's items; canRun: this user may
// roll for the companion
export function bondRowView(bond, { target = null, fallouts = [], companionItems = [], canRun = false } = {}) {
    const sys = bond?.system ?? {};
    const kind = bondKindFor(target?.type, sys.kind);
    const companion = isCompanion(kind);
    const missing = companion && !target;
    // the bonded actor's name and portrait, read live
    const name = target?.name || bond?.name || '';
    const max = Number(sys.stress?.max) || BOND_STRESS_MAX;
    const value = poolStress(sys);
    const resistances = target?.system?.resistances ?? {};
    const total = trackStress(resistances);
    return {
        id: bond?.id,
        uuid: bond?.uuid,
        name,
        img: target?.img || bond?.img || '',
        kind,
        kindLabel: t(`heart.bond.kind.${kind}`),
        kindTip: t(`heart.bond.ui.${kind}-tip`),
        companion,
        missing,
        // the portrait and name open the companion's sheet, else the bond's
        openAction: companion ? 'open-companion' : 'view-bond',
        openTip: companion ? t('heart.bond.ui.open-companion-tip', { name }) : t('heart.bond.ui.open-bond'),
        targetUuid: target?.uuid ?? '',
        targetTip: !companion && target ? t('heart.bond.ui.open-target', { name: target.name }) : '',
        pool: { value, max, marks: poolMarks(value, max) },
        poolTip: t('heart.bond.ui.pool-tip', { name, value, max }),
        fallouts: companion ? [] : fallouts.map(f => ({
            id: f.id, uuid: f.uuid, name: f.name, type: f.system?.type ?? 'minor', tip: plain(f.system?.description),
        })),
        summary: trackSummary(resistances).map(track => ({
            ...track, label: t(`heart.resistance.${track.key}`), tip: t(`heart.tip.resistance.${track.key}`),
        })),
        total,
        totalLine: t('heart.bond.ui.total', { total }),
        totalTip: t('heart.bond.ui.total-tip', { name }),
        companionFallouts: companion ? takenFallouts(companionItems).map(f => ({
            id: f.id, uuid: f.uuid, name: f.name, type: f.system?.type ?? 'minor',
            tip: `${f.name}: ${plain(f.system?.description)}`,
        })) : [],
        missingLine: t('heart.bond.ui.missing', { name }),
        ...bondActions({ kind, missing, name, canRun }),
    };
}
