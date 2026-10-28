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
    // (the idle throttle, Luke, 2026-10-28)
    registerIdleThrottle();
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

// The idle throttle (Luke, 2026-10-28 night): with nothing moving, Foundry's
// tab on the Plenty map still burned 15 to 25 percent of a core at the 30 fps
// cap (454 token containers and 1,103 name texts walked every frame; held to
// 15 fps it fell to about 9 percent). So on Auto and Light only, after
// IDLE.afterMs with no input, no movement, and no animation, the ticker drops
// to IDLE.fps; any ping (pointer, wheel, or key on the canvas, a pan or zoom,
// a token or piece or tile created, updated, or deleted, a board change) or
// any running animation puts the normal cap back at once. Ultra ("unlimited is
// meant to be unlimited"), High, and Standard are never throttled: they keep
// what frameCapFor gives them (nothing: Foundry's own rate, 60 by default).
// Animated lights in view (torch or lantern flicker) hold a gentler floor,
// IDLE.lightFps, so a lit night village still flickers smoothly (the flicker
// is clocked by time, not by frame count, so a lower rate only costs steps).
export const IDLE = Object.freeze({ afterMs: 1000, fps: 10, lightFps: 20, pollMs: 250 });

// The fps for a board that has been quiet for `idleMs`, given the fps it runs
// at when active (`base`, from tickerFps). Pure.
export function idleFps({ base, picked, board, idleMs, busy = false, lights = false }) {
    if (!board || frameCapFor(picked) === null) return base;
    if (busy || idleMs < IDLE.afterMs) return base;
    const floor = lights ? IDLE.lightFps : IDLE.fps;
    return base > 0 ? Math.min(base, floor) : floor;
}

// The throttle's state machine. `read()` gives { board, picked, foundryFps,
// busy, lights } (busy and lights may be functions, asked only once the board
// has been quiet long enough to matter); `apply(fps)` sets the ticker; `now()`
// is the clock. Pure of Foundry: the wiring below hands it the real ones.
export function createIdleGovernor({ read, apply, now = () => Date.now() }) {
    let lastActive = now();
    let current = null;
    let slowed = false;
    const ask = (v) => (typeof v === 'function' ? Boolean(v()) : Boolean(v));

    function evaluate() {
        const t = now();
        const r = read();
        const base = tickerFps(r);
        let fps = base;
        let idleMs = t - lastActive;
        if (r.board && frameCapFor(r.picked) !== null && idleMs >= IDLE.afterMs) {
            // (an animation running counts as activity: the clock starts over when it ends)
            if (ask(r.busy)) {
                lastActive = t;
                idleMs = 0;
            }
        }
        if (idleMs >= IDLE.afterMs) {
            fps = idleFps({ base, picked: r.picked, board: r.board, idleMs, busy: false, lights: ask(r.lights) });
        }
        slowed = fps !== base;
        if (fps !== current) {
            current = fps;
            apply(fps);
        }
        return fps;
    }

    return {
        // something happened: back to the normal cap now if it was slowed
        ping() {
            lastActive = now();
            if (slowed) evaluate();
        },
        // the poll: slows the board once it has been quiet
        tick: evaluate,
        // a new scene, a new quality, or teardown: active, nothing remembered
        reset() {
            lastActive = now();
            current = null;
            slowed = false;
        },
        get slowed() {
            return slowed;
        },
    };
}

const setTicker = (cv, fps) => {
    const ticker = cv?.app?.ticker;
    if (!ticker) return;
    ticker.maxFPS = PIXI.Ticker.shared.maxFPS = PIXI.Ticker.system.maxFPS = fps;
};

// What the throttle reads off the live canvas
function frameInputs(cv) {
    // (Foundry's own fps, from its performance mode, else its setting)
    return {
        board: Boolean(cv?.scene?.flags?.heart?.board),
        picked: game.settings.get('heart', 'boardDetail'),
        foundryFps: Number(cv?.performance?.fps ?? game.settings.get('core', 'maxFPS') ?? 60) || 0,
    };
}

// Any Foundry animation running: token moves, camera pans, door and light
// fades, and every other CanvasAnimation (the timeline's token moves are
// these too, and its scene and token updates also ping)
function animationRunning() {
    try {
        const a = globalThis.CanvasAnimation?.animations;
        return Boolean(a) && Object.keys(a).length > 0;
    } catch {
        return false;
    }
}

// An animated light (torch, lantern flicker) lit inside the view, with its
// radius counted. Unsure counts as yes: smooth over cheap.
function animatedLightInView(cv) {
    try {
        if (cv.performance && cv.performance.lightAnimation === false) return false;
        const sources = cv.effects?.lightSources;
        if (!sources) return false;
        const stage = cv.stage;
        const screen = cv.app?.screen;
        let view = null;
        if (stage && screen) {
            const k = stage.scale?.x || 1;
            const hw = screen.width / 2 / k;
            const hh = screen.height / 2 / k;
            view = { l: stage.pivot.x - hw, r: stage.pivot.x + hw, t: stage.pivot.y - hh, b: stage.pivot.y + hh };
        }
        for (const s of sources.values?.() ?? sources) {
            const animated = s.isAnimated ?? (s.active && s.data?.animation?.type);
            if (!animated || s.active === false) continue;
            if (!view) return true;
            const x = s.x ?? s.data?.x;
            const y = s.y ?? s.data?.y;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
            const rad = Number(s.radius ?? s.data?.radius ?? 0) || 0;
            if (x + rad >= view.l && x - rad <= view.r && y + rad >= view.t && y - rad <= view.b) return true;
        }
        return false;
    } catch {
        return true;
    }
}

const governor = createIdleGovernor({
    read: () => ({
        ...frameInputs(canvas),
        busy: animationRunning,
        lights: () => animatedLightInView(canvas),
    }),
    apply: (fps) => {
        try {
            setTicker(canvas, fps);
        } catch (err) {
            console.warn('Heart | the idle throttle could not set the frame rate', err);
        }
    },
});

// Set the canvas ticker for the scene now showing: the normal cap, with the
// idle clock started over (a new scene, a new quality, or teardown)
export function applyFrameCap(cv) {
    try {
        if (!cv?.app?.ticker) return;
        governor.reset();
        setTicker(cv, tickerFps(frameInputs(cv)));
    } catch (err) {
        console.warn('Heart | the frame cap could not be set', err);
    }
}

// The wiring: pings from the canvas, the hooks that mean the board changed,
// and the poll that slows it. Registered once at init; the canvas listeners
// and the poll live from canvasReady to canvasTearDown.
const PING_DOCS = ['Token', 'Tile', 'Drawing', 'Scene', 'AmbientLight', 'AmbientSound', 'Note', 'Wall', 'Region'];
const PING_HOOKS = ['canvasPan', 'refreshToken', 'controlToken', 'hoverToken', 'targetToken', 'heartSymbolsChanged'];

function registerIdleThrottle() {
    let timer = null;
    let abort = null;
    const ping = () => governor.ping();

    const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
        abort?.abort();
        abort = null;
    };

    for (const name of PING_HOOKS) Hooks.on(name, ping);
    for (const doc of PING_DOCS) for (const verb of ['create', 'update', 'delete']) Hooks.on(`${verb}${doc}`, ping);

    Hooks.on('canvasReady', (cv) => {
        stop();
        applyFrameCap(cv);
        abort = new AbortController();
        const opts = { passive: true, signal: abort.signal };
        const view = cv.app?.view;
        for (const type of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) view?.addEventListener(type, ping, opts);
        window.addEventListener('keydown', ping, { ...opts, capture: true });
        timer = setInterval(() => governor.tick(), IDLE.pollMs);
    });
    Hooks.on('canvasTearDown', (cv) => {
        stop();
        // (the normal cap back; the next scene's canvasInit sets its own)
        applyFrameCap(cv);
    });
}
