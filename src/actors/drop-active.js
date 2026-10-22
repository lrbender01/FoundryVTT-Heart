// Items dropped on an adversary, delve, or landmark land switched on. A
// folder of items arrives as a list (Foundry's _onDropFolder), and setting
// `active` on the list itself threw (Luke, 2026-10-21). Only data that has a
// system gets the flag; with `onlyIfPresent`, only data that already has an
// `active` field (the delve's rule).
export function activeData(itemData, { onlyIfPresent = false } = {}) {
    const list = Array.isArray(itemData) ? itemData : [itemData];
    for (const data of list) {
        if (!data?.system) continue;
        if (onlyIfPresent && data.system.active === undefined) continue;
        data.system.active = true;
    }
    return itemData;
}
