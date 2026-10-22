// Class equipment choices (2026-09-30). "core" is what every member of the
// class gets; every other group is one option of a pick-one choice,
// clustered by name prefix ("group_1..3" is one choice; Blightborn's
// "weapon_*" and "kit_*" are two). Shared by the class sheet (sections) and
// the character sheet (the "not picked yet" indicator).

// The choice an option belongs to: its id less a trailing number
// ("group_2" -> "group", "weapon-1" -> "weapon"); one copy since 2026-10-21
export function choiceKey(id) {
    return String(id).replace(/[_-]?\d+$/, '') || String(id);
}

export function equipmentChoices(cls) {
    const system = cls?.system ?? {};
    const groups = system.equipment_groups ?? [];
    const active = new Set([...(system.active_equipment_groups ?? []), system.active_equipment_group].filter(Boolean));
    const choices = new Map();
    for (const id of groups) {
        if (id === 'core') continue;
        const key = choiceKey(id);
        if (!choices.has(key)) choices.set(key, []);
        choices.get(key).push({ id, active: active.has(id) });
    }
    return [...choices.entries()].map(([key, options]) => ({ key, options, picked: options.some(o => o.active) }));
}

// A class on a character with a pick-one choice nobody has made yet
export function needsEquipmentPick(cls) {
    return Boolean(cls?.actor) && equipmentChoices(cls).some(c => !c.picked);
}
