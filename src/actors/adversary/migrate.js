// Adversaries imported before the 2026-09-29 field split carry their flavour
// text (plus "Example names" / "Domains" lines) in system.notes and an empty
// system.description. This moves that text to the Description and the two
// lines to the Profile fields, leaving GM Notes empty.
//
// 2026-10-02 (Luke: "the GM notes leak is unacceptable"): until then it ran
// on every sheet open, so a content adversary whose Description the GM had
// emptied had its secret GM Notes moved into the player-visible Description.
// Now it runs ONCE per world, on the active GM's client at ready (the world
// setting heart.adversaryLoreMigrated records it), and only touches notes
// that still carry the old content's exact "Example names:" or "Domains:"
// paragraph, which GM-written notes never have.

const NAMES = /<p><strong>Example names:<\/strong>\s*([\s\S]*?)<\/p>/;
const DOMAINS = /<p><strong>Domains:<\/strong>\s*([\s\S]*?)<\/p>/;
const DOMAIN_LIST = /^(Cursed|Desolate|Haven|Occult|Religion|Technology|Warren|Wild)(,\s*(Cursed|Desolate|Haven|Occult|Religion|Technology|Warren|Wild))*$/;
const LEVEL = /^(Standard|Risky|Dangerous|Legendary)/i;

// The update for one adversary's system data, or null when it isn't a
// legacy content adversary (pure, tested)
export function legacyLoreUpdates(system = {}, fromContent = false) {
    if (!fromContent) return null;
    if (String(system.description ?? '').trim()) return null;
    let text = String(system.notes ?? '');
    if (!text.trim()) return null;
    const names = text.match(NAMES);
    const domains = text.match(DOMAINS);
    // the old content's signature; without it the notes are the GM's own
    if (!names && !domains) return null;

    const updates = { 'system.notes': '' };
    if (names) {
        text = text.replace(names[0], '');
        if (!system.names) updates['system.names'] = names[1].trim();
    }
    if (domains) {
        text = text.replace(domains[0], '');
        // "Haven, Technology; note" / "Haven" / "note" (no domain list)
        const [head, ...rest] = domains[1].split(/;\s*/);
        const isList = DOMAIN_LIST.test(head.trim());
        const list = isList ? head.trim() : '';
        const note = (isList ? rest : [head, ...rest]).join('; ').trim();
        if (list && !system.domains) updates['system.domains'] = list;
        if (note && !system.domainsNote) updates['system.domainsNote'] = note;
    }
    if (!system.level) {
        const lead = String(system.difficulty ?? '').match(LEVEL);
        if (lead) updates['system.level'] = lead[1][0].toUpperCase() + lead[1].slice(1).toLowerCase();
    }
    updates['system.description'] = text.trim();
    return updates;
}

export async function migrateAdversaryLore() {
    if (!game.users.activeGM?.isSelf) return;
    if (game.settings.get('heart', 'adversaryLoreMigrated')) return;
    const updates = [];
    for (const actor of game.actors) {
        if (actor.type !== 'adversary') continue;
        const update = legacyLoreUpdates(actor.system, Boolean(actor.flags?.['fvtt-heart-content']));
        if (update) updates.push({ _id: actor.id, ...update });
    }
    try {
        if (updates.length) await Actor.updateDocuments(updates, { render: false });
        await game.settings.set('heart', 'adversaryLoreMigrated', true);
        if (updates.length) console.log(`heart | moved the lore of ${updates.length} older adversaries out of GM Notes`);
    } catch (err) {
        // left unset: tried again on the next load
        console.error('heart | adversary lore migration failed', err);
    }
}
