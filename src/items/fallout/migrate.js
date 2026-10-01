// Fallout source (2026-09-30). Where a fallout comes from ("Butcher,
// p. 176") used to be the last paragraph of its effect text, which the
// character sheet then showed on every row. It is now system.source. Copies
// made before (on actors and in the Items directory) still carry the
// paragraph; on ready the GM's client moves it into the field once. Only
// that exact trailing "<p><em>Source: ...</em></p>" paragraph is touched.

const TRAILING_SOURCE = /\s*<p><em>Source: ([\s\S]*?)<\/em><\/p>\s*$/;

function decode(html) {
    const t = document.createElement('textarea');
    t.innerHTML = html;
    return t.value;
}

function updatesFor(items) {
    return items
        .filter(i => i.type === 'fallout' && !i.system.source && TRAILING_SOURCE.test(i.system.description ?? ''))
        .map(i => {
            const match = i.system.description.match(TRAILING_SOURCE);
            return {
                _id: i.id,
                'system.source': decode(match[1]).trim(),
                'system.description': i.system.description.replace(TRAILING_SOURCE, ''),
            };
        });
}

export async function migrateFalloutSource() {
    if (!game.users.activeGM?.isSelf) return;
    let moved = 0;
    for (const actor of game.actors) {
        const updates = updatesFor(actor.items);
        if (updates.length) { await actor.updateEmbeddedDocuments('Item', updates); moved += updates.length; }
    }
    const world = updatesFor(game.items);
    if (world.length) { await Item.updateDocuments(world); moved += world.length; }
    if (moved) console.log(`heart | moved the source line of ${moved} fallout(s) into system.source`);
}
