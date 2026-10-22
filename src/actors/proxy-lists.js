// The items of one type an actor uses: switched on (or with no switch) and
// not finished; with `from` (a character's class), that item's own children
// first. One copy since 2026-10-21 (Luke; the same lines were in four actor
// proxies). Tested in test/proxy-lists.test.mjs.
// `sorted`: the actor's own items in their sort order (the panel sheets,
// whose rows are sorted by dragging; S5, 2026-10-21).
export function activeOf(actor, type, { from, sorted = false } = {}) {
    const inUse = (i) => i.type === type && (i.system?.active ?? true) && !(i.system?.complete ?? false);
    const own = actor?.items?.filter(inUse) ?? [];
    return [...(from?.children?.filter(inUse) ?? []), ...(sorted ? bySort(own) : own)];
}

// Items in their sort order; equal sorts (new items are all 0) keep the
// order they came in
export function bySort(list = []) {
    return list.map((item, i) => [Number(item?.sort) || 0, i, item])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(x => x[2]);
}
