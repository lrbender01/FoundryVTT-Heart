// A new delver's, party's, or companion's token is the actor itself (Luke,
// 2026-10-21: an unlinked token's sheet and bars edited a copy of its own,
// while rolls always write to the world actor, so stress split in two). A
// delver's first bar shows its total Stress (system.totalStress). Adversaries
// keep Foundry's unlinked default: each token its own copy, as a mob should.

// The token defaults for a new actor of this type, or null (pure, tested)
export function tokenDefaults(type) {
    if (type === 'character') return { actorLink: true, bar1: { attribute: 'totalStress' } };
    // (a familiar too, Luke, 2026-10-24: The Witch is Dead's player
    // characters, whose Danger the rolls write to the world actor)
    if (type === 'party' || type === 'hireling' || type === 'familiar') return { actorLink: true };
    return null;
}

// A player's delver's token (Luke, 2026-10-25: every character a player
// owns): their sheet's portrait, friendly, and its name shown to anyone who
// hovers over it. The changes a token (prototype or placed) needs, as an
// update ({} when none); `modes`: Foundry's { friendly, hover } values (pure,
// tested)
export function pcTokenFix(token, img, modes) {
    const out = {};
    if (img && token?.texture?.src !== img) out['texture.src'] = img;
    if (token?.disposition !== modes.friendly) out.disposition = modes.friendly;
    if (token?.displayName !== modes.hover) out.displayName = modes.hover;
    return out;
}

// whether an actor is a player's delver: a character a player owns
const isPc = (actor) => actor?.type === 'character' && Boolean(actor.hasPlayerOwner);
const pcModes = () => ({ friendly: CONST.TOKEN_DISPOSITIONS.FRIENDLY, hover: CONST.TOKEN_DISPLAY_MODES.HOVER });

// A player's delver's prototype token and every token of theirs on a scene
// made so (by the one GM who acts for the world, so it is done once)
async function fixPcTokens(actor) {
    if (!isPc(actor) || !game.users.activeGM?.isSelf) return;
    const modes = pcModes();
    const proto = pcTokenFix(actor.prototypeToken, actor.img, modes);
    if (Object.keys(proto).length) {
        await actor.update(Object.fromEntries(Object.entries(proto).map(([k, v]) => [`prototypeToken.${k}`, v])));
    }
    for (const scene of game.scenes) {
        const updates = scene.tokens
            .filter((t) => t.actorId === actor.id)
            .map((t) => ({ _id: t.id, ...pcTokenFix(t, actor.img, modes) }))
            .filter((u) => Object.keys(u).length > 1);
        if (updates.length) await scene.updateEmbeddedDocuments('Token', updates);
    }
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
    // (a player's delver's token: at every start, the world's delvers put
    // right; then whenever a portrait or who owns them changes, and as a
    // token of theirs is put on a scene)
    Hooks.once('ready', async () => {
        for (const actor of game.actors) await fixPcTokens(actor);
    });
    Hooks.on('updateActor', (actor, changed) => {
        if ('img' in changed || 'ownership' in changed || changed.prototypeToken) fixPcTokens(actor);
    });
    Hooks.on('preCreateToken', (token) => {
        const actor = token.actor ?? game.actors.get(token.actorId);
        if (!isPc(actor)) return;
        const fix = pcTokenFix(token._source, actor.img, pcModes());
        if (Object.keys(fix).length) token.updateSource(fix);
    });
}
