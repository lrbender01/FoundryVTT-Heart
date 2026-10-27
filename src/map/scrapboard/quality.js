// Ultra quality (Luke, 2026-10-26): the board's Board detail past High, made
// for the GM's own computer with a strong graphics card. It cranks what this
// client renders: the board's own painting (render.js DETAIL.ultra), the
// baked map's tiles (a finer level sooner, more kept, mipmapped), and
// Foundry's whole canvas: drawn at a higher resolution than the screen and
// smoothed down (tokens, light, and everything else sharper), antialiased,
// every texture mipmapped and filtered (tokens stay crisp zoomed out), soft
// light edges, and the frame rate uncapped to the screen's own. Players may
// pick it too, warned it is experimental. Never picked by Auto.
//
// Foundry v12's own ways in: the canvasConfig hook (the renderer's
// resolution and antialiasing, before the canvas is made: so a change
// needs a reload), and the canvasInit hook (each scene's draw: the texture
// defaults and the performance settings Foundry set just before).

// how much finer than the screen the canvas is drawn, at most this many
// canvas px per CSS px, and never past the GPU's widest texture
export const ULTRA = Object.freeze({ supersample: 1.5, maxResolution: 3, maxSide: 16384, anisotropy: 16 });

// The canvas's resolution under Ultra: the screen's own pixel ratio,
// supersampled, kept within the cap and within the widest texture for a
// window this wide (CSS px). Pure.
export function ultraResolution(dpr = 1, width = 1920, U = ULTRA) {
    const base = Number(dpr) > 0 ? Number(dpr) : 1;
    const w = Number(width) > 0 ? Number(width) : 1920;
    const r = Math.min(base * U.supersample, U.maxResolution, U.maxSide / w);
    // (never below the screen's own: Ultra is never softer than High)
    return Math.round(Math.max(base, r) * 100) / 100;
}

// Whether this client has Ultra picked (the boardDetail setting)
export function ultraPicked() {
    try {
        return game.settings.get('heart', 'boardDetail') === 'ultra';
    } catch {
        return false;
    }
}

// whether the canvas this page made was made under Ultra (a change of the
// setting reaches the renderer only with a reload)
let madeUltra = false;
export const canvasIsUltra = () => madeUltra;

// The hooks, registered at init (before the canvas is made)
export function registerUltra() {
    Hooks.on('canvasConfig', (config) => {
        madeUltra = ultraPicked();
        if (!madeUltra) return;
        config.resolution = ultraResolution(window.devicePixelRatio || 1, window.innerWidth || 1920);
        config.antialias = true;
    });
    // (after Foundry's own performance mode is set for the scene)
    Hooks.on('canvasInit', (cv) => {
        // (the frame cap on a board scene under Auto or Light: Luke, 2026-10-27)
        applyFrameCap(cv);
        if (!madeUltra) return;
        try {
            PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.ON;
            PIXI.BaseTexture.defaultOptions.anisotropicLevel = ULTRA.anisotropy;
            if (cv.performance) {
                cv.performance.mipmap = 'ON';
                cv.performance.lightSoftEdges = true;
                cv.performance.lightAnimation = true;
                cv.performance.tokenAnimation = true;
                // (the screen's own refresh rate, past Foundry's 60)
                if (cv.performance.fps === 60) cv.performance.fps = 0;
                cv.app.ticker.maxFPS = PIXI.Ticker.shared.maxFPS = PIXI.Ticker.system.maxFPS = cv.performance.fps;
            }
        } catch (err) {
            console.warn('Heart | Ultra quality could not set the canvas up', err);
        }
    });
    // (a change of the quality picked: the cap set again, no reload. The
    // setting's own onChange is notes.js's; this one is added to it)
    Hooks.once('ready', () => {
        // (the settings map is keyed "<namespace>.<key>")
        const s = game.settings.settings.get(['heart', 'boardDetail'].join('.'));
        if (!s) return;
        const was = s.onChange;
        s.onChange = (...args) => {
            was?.(...args);
            applyFrameCap(canvas);
        };
    });
}

// The frame cap (Luke, 2026-10-27): on the Plenty board Foundry redrew its
// whole scene 60 times a second at idle (15,900 objects, 965 draw calls). The
// board caps the canvas ticker at 30 fps when the board quality is Auto or
// Light; Ultra, High, and Standard are left as Foundry set them (Ultra: the
// screen's own rate). Luke's world setting core.maxFPS is never changed: the
// ticker alone is set, at runtime.
export const FRAME_CAP = 30;

// The cap for a quality picked (the boardDetail value), or null for none. Pure.
export const frameCapFor = (picked) => (picked === 'auto' || picked === 'light' ? FRAME_CAP : null);

// The fps the ticker should run at: the cap when the scene is a board and the
// quality asks for one (never above what Foundry allows), else Foundry's own
// (`foundryFps`, its performance setting; 0 is the screen's own). Pure.
export function tickerFps({ board, picked, foundryFps }) {
    const cap = board ? frameCapFor(picked) : null;
    if (cap === null) return foundryFps;
    return foundryFps > 0 ? Math.min(cap, foundryFps) : cap;
}

// Set the canvas ticker for the scene now showing
export function applyFrameCap(cv) {
    try {
        const ticker = cv?.app?.ticker;
        if (!ticker) return;
        const board = Boolean(cv.scene?.flags?.heart?.board);
        const picked = game.settings.get('heart', 'boardDetail');
        // (Foundry's own fps, from its performance mode, else its setting)
        const foundryFps = Number(cv.performance?.fps ?? game.settings.get('core', 'maxFPS') ?? 60) || 0;
        const fps = tickerFps({ board, picked, foundryFps });
        ticker.maxFPS = PIXI.Ticker.shared.maxFPS = PIXI.Ticker.system.maxFPS = fps;
    } catch (err) {
        console.warn('Heart | the frame cap could not be set', err);
    }
}
