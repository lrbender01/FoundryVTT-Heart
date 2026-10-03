// A sheet art tool's export, as fvtt-heart-content ships it (2026-10-02):
// party-art.json, character-art.json. Read once and kept; with the module
// off, or no file, there is no art and the sheet renders as it always did.
//
//   const file = decorFile(path, normalize, prepare?);
//   await file.load();   // in getData (resolves the normalized art or null)
//   file.get();          // what it resolved, once it has
const CONTENT = 'fvtt-heart-content';

export function decorFile(path, normalize, prepare = async (art) => art) {
    let loading = null;
    let loaded = null;
    return {
        load() {
            if (!game.modules?.get(CONTENT)?.active) return Promise.resolve(null);
            loading ??= (async () => {
                try {
                    const res = await fetch(foundry.utils.getRoute(path), { cache: 'no-cache' });
                    if (!res.ok) return null;
                    const art = normalize(await res.json());
                    return art ? await prepare(art) : null;
                } catch (err) {
                    console.warn(`heart | ${path} could not be read`, err);
                    return null;
                }
            })().then(art => (loaded = art));
            return loading;
        },
        get: () => loaded,
    };
}
