
// Objects merge key by key and arrays concatenate, so a shared container
// (every template.json adds its type under "Item" or "Actor") is expected,
// not a conflict. Only a plain value replaced by a different one is worth a
// warning (2026-09-30: the old check fired on every shared container, so
// every build printed a wall of false "key already defined" warnings).
function mergeDeep(target, source, complainOnDuplicates=true, path=[]) {
    for(const key in source) {
        if(target[key] instanceof Array && source[key] instanceof Array) {
            target[key].push(...source[key])
        } else if(target[key] instanceof Object && source[key] instanceof Object ) {
            mergeDeep(target[key], source[key], complainOnDuplicates, [...path, key])
        } else {
            if(complainOnDuplicates && target[key] !== undefined && target[key] !== source[key]) {
                console.warn(`Warning: ${[...path, key].join('.')} redefined`, {old_value: target[key], new_value: source[key]});
            }
            target[key] = source[key]
        }
    }

    return target;
}

module.exports = {
    mergeDeep
}