// The incremental build (2026-10-27): the same result as `build-all`, made
// quicker for the edit-and-reload loop.
//
//   node dev-utils/build-fast.js            build once
//   node dev-utils/build-fast.js --watch    build, then keep rebuilding on a change
//
// What differs from build-all (which stays the clean build for releases, and
// the one CI runs):
//   - dist/ is NOT emptied. Webpack runs with `--env incremental`
//     (output.clean off), its filesystem cache in node_modules/.cache/webpack,
//     and it rewrites a file only when its content changed. So heart.js is
//     replaced in place, never absent, and a crash mid-build cannot blank the
//     system. The hash-named fonts and images of old builds stay behind until
//     the next `build-all`; they are harmless.
//   - system.json, template.json, and the static copy each run only when
//     their inputs changed (a fingerprint per step, kept in
//     node_modules/.cache/heart-incremental.json), or when their output is
//     missing.
//   - the result of the last run is written into that same file under `last`
//     ({ codeChanged, ran, seconds }), for `npm run plenty` to read.
//
// Never use it for a release: the version comes from package.json (build-all
// hardcodes the same number in its script line; release.yml passes its own).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STATE = path.join(ROOT, 'node_modules', '.cache', 'heart-incremental.json');

// ---------------------------------------------------------------- pure parts

// A step runs when its fingerprint is not the one last recorded, or when any
// of its outputs is missing. prev: { [step]: fingerprint }, now: the same
// for this run, missing: { [step]: true } when an output is gone.
function decideSteps(prev, now, missing = {}) {
    const run = [];
    for (const step of Object.keys(now)) {
        if (missing[step] || prev[step] !== now[step]) run.push(step);
    }
    return run;
}

// One hash over named parts: [{ name, data }] in any order
function hashParts(parts) {
    const h = crypto.createHash('sha1');
    for (const p of [...parts].sort((a, b) => (a.name < b.name ? -1 : 1))) {
        h.update(p.name).update('\0').update(p.data).update('\0');
    }
    return h.digest('hex');
}

// ---------------------------------------------------------------- the files

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const content = (files) => files.map((f) => ({ name: rel(f), data: fs.readFileSync(f) }));

function version() {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

function fingerprints() {
    const { globSync } = require('glob');
    const templates = globSync('./src/**/template.json', { cwd: ROOT }).map((p) => path.resolve(ROOT, p));
    const dev = (n) => path.join(ROOT, 'dev-utils', n);
    // static/ is copied wholesale, so path, size, and time stand in for content
    const statics = walk(path.join(ROOT, 'static')).map((f) => {
        const s = fs.statSync(f);
        return { name: rel(f), data: `${s.size}:${Math.round(s.mtimeMs)}` };
    });
    const license = path.join(ROOT, 'LICENSE');
    statics.push({ name: 'LICENSE', data: `${fs.statSync(license).size}:${Math.round(fs.statSync(license).mtimeMs)}` });
    return {
        manifest: hashParts([
            ...content([path.join(ROOT, 'src', 'manifest.json'), path.join(ROOT, 'foundryvtt.config.js'), dev('build-manifest.js')]),
            { name: 'version', data: version() },
        ]),
        template: hashParts(content([...templates, dev('build-template.js'), dev('common.js')])),
        static: hashParts(statics),
    };
}

const OUTPUTS = {
    manifest: [path.join(DIST, 'system.json')],
    template: [path.join(DIST, 'template.json')],
    static: [path.join(DIST, 'LICENSE'), path.join(DIST, 'lang', 'en.json')],
};

const readState = () => {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
};
const writeState = (s) => {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
};

// ---------------------------------------------------------------- running

const node = (file, ...args) => spawnSync(process.execPath, [file, ...args], { cwd: ROOT, stdio: 'inherit' });
const STEP_RUNNERS = {
    manifest: () => node(path.join('dev-utils', 'build-manifest.js'), version()),
    template: () => node(path.join('dev-utils', 'build-template.js')),
    static: () => node(path.join('dev-utils', 'copy-static.js')),
};

// Run the support steps whose inputs changed; returns the steps run
function supportSteps() {
    fs.mkdirSync(DIST, { recursive: true });
    const state = readState();
    const now = fingerprints();
    const missing = Object.fromEntries(Object.entries(OUTPUTS).map(([k, files]) => [k, files.some((f) => !fs.existsSync(f))]));
    const ran = [];
    for (const step of decideSteps(state.fingerprints ?? {}, now, missing)) {
        const r = STEP_RUNNERS[step]();
        if (r.status !== 0) throw new Error(`build-fast: ${step} failed`);
        ran.push(step);
        // (recorded one by one, so a later failure does not forget this one)
        state.fingerprints = { ...(state.fingerprints ?? {}), [step]: now[step] };
        writeState(state);
    }
    return ran;
}

const WEBPACK = path.join(ROOT, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const webpackArgs = ['--mode', 'production', '--env', 'incremental'];
const sizeKey = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return null; } };

function once() {
    const t0 = Date.now();
    const bundle = path.join(DIST, 'heart.js');
    const before = sizeKey(bundle);
    const w = spawnSync(process.execPath, [WEBPACK, ...webpackArgs], { cwd: ROOT, stdio: 'inherit' });
    if (w.status !== 0) throw new Error('build-fast: webpack failed');
    const ran = supportSteps();
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    const codeChanged = sizeKey(bundle) !== before;
    const state = readState();
    state.last = { when: new Date().toISOString(), codeChanged, ran, seconds };
    writeState(state);
    console.log(`build-fast: heart.js ${codeChanged ? 'CHANGED' : 'unchanged'}; support steps run: ${ran.length ? ran.join(', ') : 'none'}; ${seconds} s`);
}

function watch() {
    const ran = supportSteps();
    console.log(`build-fast --watch: support steps run: ${ran.length ? ran.join(', ') : 'none'}; webpack is watching src/ (Ctrl+C to stop)`);
    // (a template.json, manifest, or static change is not in webpack's graph:
    // the fingerprints are checked every two seconds and the step rerun)
    const timer = setInterval(() => {
        try {
            const again = supportSteps();
            if (again.length) console.log(`build-fast --watch: reran ${again.join(', ')}`);
        } catch (e) { console.error(e.message); }
    }, 2000);
    const child = spawn(process.execPath, [WEBPACK, ...webpackArgs, '--watch'], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (code) => { clearInterval(timer); process.exit(code ?? 0); });
}

module.exports = { decideSteps, hashParts };

if (require.main === module) {
    try {
        if (process.argv.includes('--watch')) watch();
        else once();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
