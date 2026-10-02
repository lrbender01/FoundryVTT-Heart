// Removing a class resets the character's skills and domains (2026-10-01,
// Luke): a character who loses their class is starting over, and a new
// character has only the core skill and domain their class gives (the
// class's createItem hook in index.js); every other skill, domain, and knack
// comes later, from abilities. So all of them are cleared, custom ones too.

// The actor update that clears every skill and domain and every knack.
// keep: { skills, domains } as Sets of keys left marked (the core skill and
// domain of a class the character still has).
export function clearedTraits(system, keep = {}) {
    const out = {};
    for (const kind of ['skills', 'domains']) {
        for (const [key, trait] of Object.entries(system?.[kind] ?? {})) {
            if (trait?.value && !keep[kind]?.has(key)) out[`system.${kind}.${key}.value`] = false;
            if (trait?.knack) out[`system.${kind}.${key}.knack`] = '';
        }
    }
    return out;
}

// The core skills and domains of the classes an actor still has
export function coreTraitsOf(classes = []) {
    return {
        skills: new Set(classes.map(c => c.system?.core_skill).filter(Boolean)),
        domains: new Set(classes.map(c => c.system?.core_domain).filter(Boolean)),
    };
}
