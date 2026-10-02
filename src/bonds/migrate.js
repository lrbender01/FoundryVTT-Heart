// Leftover "bond" Actors (2026-10-01, Luke). Bonds are Items (items/bond/);
// an Actor of type "bond" left over from an earlier iteration of the bonds
// work can't load ("bond" is not a valid Actor type), so Foundry lists it as
// an unavailable Actor document in Support Details. On ready the GM's client
// deletes those, and only those: invalid Actors whose stored type is
// "bond". There is nothing in one to keep, since no sheet or rule can read
// it. Anything else invalid is left for Foundry's own report.

const RETIRED_ACTOR_TYPES = ['bond'];

export async function removeRetiredBondActors() {
    if (!game.users.activeGM?.isSelf) return;
    const ids = [...(game.actors.invalidDocumentIds ?? [])];
    let removed = 0;
    for (const id of ids) {
        let doc;
        try { doc = game.actors.getInvalid(id, { strict: false }); } catch (e) { doc = null; }
        if (!doc || !RETIRED_ACTOR_TYPES.includes(doc._source?.type)) continue;
        await doc.delete();
        removed += 1;
    }
    if (removed) {
        console.log(`heart | removed ${removed} leftover "bond" actor(s) from an earlier version`);
        ui.notifications.info(game.i18n.format('heart.bond.migrate.removed', { count: removed }));
    }
}
