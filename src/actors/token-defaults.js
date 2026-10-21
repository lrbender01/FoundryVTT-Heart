// A new delver's, party's, or companion's token is the actor itself (Luke,
// 2026-10-21: an unlinked token's sheet and bars edited a copy of its own,
// while rolls always write to the world actor, so stress split in two). A
// delver's first bar shows its total Stress (system.totalStress). Adversaries
// keep Foundry's unlinked default: each token its own copy, as a mob should.

// The token defaults for a new actor of this type, or null (pure, tested)
export function tokenDefaults(type) {
    if (type === 'character') return { actorLink: true, bar1: { attribute: 'totalStress' } };
    if (type === 'party' || type === 'hireling') return { actorLink: true };
    return null;
}

export function registerTokenDefaults() {
    Hooks.on('preCreateActor', (actor) => {
        const d = tokenDefaults(actor.type);
        if (!d) return;
        const t = actor._source.prototypeToken ?? {};
        const out = {};
        if (!t.actorLink) out['prototypeToken.actorLink'] = true;
        // (a bar already chosen, kept)
        if (d.bar1 && !t.bar1?.attribute) out['prototypeToken.bar1.attribute'] = d.bar1.attribute;
        if (Object.keys(out).length) actor.updateSource(out);
    });
}
