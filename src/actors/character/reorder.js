// Drag a row onto another to reorder a character sheet list (2026-09-30).
// The order is saved on the character (flags.heart.<flag>, a list of keys:
// item uuids, or skill / domain names) because the lists mix sources:
// abilities and resources come from the class and calling as well as the
// character. `orderByFlag` / `orderKeys` sort by it; anything not in the
// saved order keeps its place after the rest.

function ranked(order, list, keyOf) {
    const rank = (x, i) => { const k = order.indexOf(keyOf(x)); return k < 0 ? order.length + i : k; };
    return list.map((x, i) => [rank(x, i), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

export function orderByFlag(actor, list, flag) {
    const order = actor?.getFlag?.('heart', flag) ?? [];
    return order.length ? ranked(order, list, item => item.uuid) : list;
}

// Plain keys (skill / domain names)
export function orderKeys(actor, keys, flag) {
    const order = actor?.getFlag?.('heart', flag) ?? [];
    return order.length ? ranked(order, keys, k => k) : keys;
}

// key: the row's data-* attribute holding its key (camelCase dataset name);
// axis 'x' for cards in a grid (drop left / right of a card), 'y' for rows
export function enableReorder(html, actor, rowSelector, flag, { key = 'itemId', axis = 'y' } = {}) {
    if (!actor?.isOwner) return;
    const rows = html.find(rowSelector);
    if (!rows.length) return;
    const TYPE = `text/heart-order-${flag.toLowerCase()}`;
    const clear = () => rows.removeClass('drop-before drop-after dragging');
    rows.attr('draggable', 'true');
    rows.on('dragstart', ev => {
        ev.originalEvent.dataTransfer.setData(TYPE, ev.currentTarget.dataset[key]);
        ev.originalEvent.dataTransfer.effectAllowed = 'move';
        ev.currentTarget.classList.add('dragging');
    });
    rows.on('dragend', clear);
    rows.on('dragover', ev => {
        if (!ev.originalEvent.dataTransfer.types.includes(TYPE)) return;
        ev.preventDefault();
        ev.stopPropagation();
        const r = ev.currentTarget.getBoundingClientRect();
        const after = axis === 'x'
            ? ev.originalEvent.clientX > r.left + r.width / 2
            : ev.originalEvent.clientY > r.top + r.height / 2;
        rows.not(ev.currentTarget).removeClass('drop-before drop-after');
        ev.currentTarget.classList.toggle('drop-after', after);
        ev.currentTarget.classList.toggle('drop-before', !after);
    });
    rows.on('drop', async ev => {
        const moved = ev.originalEvent.dataTransfer.getData(TYPE);
        if (!moved) return;
        ev.preventDefault();
        ev.stopPropagation();
        const target = ev.currentTarget.dataset[key];
        const after = ev.currentTarget.classList.contains('drop-after');
        clear();
        if (moved === target) return;
        const order = rows.toArray().map(el => el.dataset[key]).filter(u => u !== moved);
        order.splice(order.indexOf(target) + (after ? 1 : 0), 0, moved);
        await actor.setFlag('heart', flag, order);
    });
}
