// Paying a haunt (Luke, 2026-10-21: the service button rolled the haunt's
// own die). The rule, HCB p. 140: exchange a resource "to access an
// equivalent dice worth of refresh up to the dice size listed next to the
// haunt"; HCB p. 81: roll the resource's die and remove that much stress,
// and the haunt's die is "the highest amount of stress they can remove,
// even if you have more valuable resources to trade". So the die rolled is
// the resource's, capped at the haunt's. Pure, no Foundry: tested in
// test/haunt-service.test.mjs; items/haunt/service.js asks and rolls.

export const DIE_SIZES = ['d4', 'd6', 'd8', 'd10', 'd12'];

// The die a payment rolls at this haunt: the smaller of the two. An unknown
// payment die rolls nothing (null); an unknown haunt die caps nothing.
export function serviceDie(paymentDie, hauntDie, dieSizes = DIE_SIZES) {
    const pay = dieSizes.indexOf(paymentDie);
    if (pay < 0) return null;
    const cap = dieSizes.indexOf(hauntDie);
    return cap < 0 ? paymentDie : dieSizes[Math.min(pay, cap)];
}

// What can pay: every resource the given characters hold (not the ones put
// aside as inactive), each with the die it rolls here.
//   characters: [{ id, name, items: [{ id, name, type, system }] }]
// Answers [{ key, actorId, itemId, owner, name, die, rolls, capped }].
export function resourcePayments(characters, hauntDie, dieSizes = DIE_SIZES) {
    const out = [];
    for (const actor of characters ?? []) {
        for (const item of actor.items ?? []) {
            if (item.type !== 'resource' || item.system?.active === false) continue;
            const die = item.system?.die_size;
            const rolls = serviceDie(die, hauntDie, dieSizes);
            if (!rolls) continue;
            out.push({
                key: `${actor.id}.${item.id}`, actorId: actor.id, itemId: item.id,
                owner: actor.name, name: item.name, die, rolls, capped: rolls !== die,
            });
        }
    }
    return out;
}

// Upgrade (delta 1) or Downgrade (delta -1) every service of a haunt one
// die size: the update paths, one place for the haunt sheet and the
// landmark's haunt rows (Luke, 2026-10-21; it was written twice). A die
// already at the end stays, and so does a die outside the list (Luke,
// 2026-10-22, audit S20: it became the smallest on Upgrade).
export function stepServices(services, delta, dieSizes = DIE_SIZES) {
    const updates = {};
    for (const [key, service] of Object.entries(services ?? {})) {
        const at = dieSizes.indexOf(service?.die_size);
        if (at < 0) continue;
        const i = at + delta;
        if (i >= 0 && i < dieSizes.length) updates[`system.resistances.${key}.die_size`] = dieSizes[i];
    }
    return updates;
}

// The whole Upgrade or Downgrade write, or null when no service moves. An
// Upgrade that steps any service clears the upgrade track; one that steps
// none (every die at the top) leaves the track alone, and the sheet says so
// (Luke, 2026-10-22, audit S20: it cleared the track for nothing).
export function hauntStep(services, delta, dieSizes = DIE_SIZES) {
    const updates = stepServices(services, delta, dieSizes);
    if (!Object.keys(updates).length) return null;
    if (delta > 0) updates['system.upgradeTrack'] = 0;
    return updates;
}

// A payment that is not a resource (a job, a favour; the GM sets its worth):
// the dice up to the haunt's
export function otherPaymentDice(hauntDie, dieSizes = DIE_SIZES) {
    const cap = dieSizes.indexOf(hauntDie);
    return cap < 0 ? [...dieSizes] : dieSizes.slice(0, cap + 1);
}
