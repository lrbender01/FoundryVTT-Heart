// modules we need
const path = require('path');
const config = require('./foundryvtt.config.cjs');
const TerserPlugin = require('terser-webpack-plugin');

// auto calculated values
const {
    type,
    id
} = config;

const distPath = path.resolve(__dirname, 'dist');
const publicPath = `/${type}s/${id}/`;

// The import-glob loader (webpack-import-glob-loader) expands a glob into
// imports but never tells webpack the folder is a dependency, so a cached
// build would miss a file ADDED to (or removed from) what a glob matches.
// The matched file list is part of the cache's version: a new or removed
// file starts a fresh cache; an edit to an existing file is tracked by webpack.
const GLOBS = ['**/*.@(html|handlebars|hbs)', '**/index.js', '**/sheet.js'];
function globVersion() {
    const { globSync } = require('glob');
    const files = GLOBS.flatMap((g) => globSync(g, { cwd: path.resolve(__dirname, 'src'), posix: true })).sort();
    return require('crypto').createHash('sha1').update(files.join('\n')).digest('hex').slice(0, 12);
}

// The board lives in the Dream Board module (fvtt-dream-board) since
// 2026-10-28; heart.js no longer carries it. The old board code stays in
// src/ (Map Dreamer and the content tools import it by path), so two
// plugins keep it out of the bundle:
//   - the glob in src/index.js still finds src/map/scrapboard/index.js, so
//     that one file is swapped for src/map/board-elsewhere.js, which exports
//     nothing;
//   - any other board file that still reaches the bundle (a new import of a
//     scrapboard file, map.sass, or the session tools) fails the build with
//     a plain message, instead of quietly bringing a second board back.
const SRC = path.resolve(__dirname, 'src');
const BOARD_INDEX = path.join(SRC, 'map', 'scrapboard', 'index.js');
const BOARD_STUB = path.join(SRC, 'map', 'board-elsewhere.js');
const BOARD_DIR = path.join(SRC, 'map', 'scrapboard') + path.sep;
const BOARD_FILES = new Set([
    path.join(SRC, 'map', 'map.sass'),
    path.join(SRC, 'common', 'session-tools.js'),
    path.join(SRC, 'common', 'pull-view.js'),
]);
const same = (a, b) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
const isBoardFile = (file) => {
    const f = path.normalize(file).toLowerCase();
    return f.startsWith(BOARD_DIR.toLowerCase()) || [...BOARD_FILES].some((b) => same(b, f));
};

function swapBoardIndex(webpack) {
    return new webpack.NormalModuleReplacementPlugin(/[\\/]src[\\/]map[\\/]scrapboard[\\/]index\.js$/, (data) => {
        if (!data.createData?.resource || !same(data.createData.resource, BOARD_INDEX)) return;
        data.createData.resource = BOARD_STUB;
        // (the stub's own folder, for anything it might import)
        data.createData.context = path.dirname(BOARD_STUB);
    });
}

class NoBoardInBundle {
    apply(compiler) {
        const name = 'NoBoardInBundle';
        compiler.hooks.thisCompilation.tap(name, (compilation, { normalModuleFactory }) => {
            const told = new Set();
            normalModuleFactory.hooks.afterResolve.tap(name, (data) => {
                const file = data.createData?.resource?.split('?')[0];
                if (!file || !isBoardFile(file) || told.has(file)) return;
                told.add(file);
                const who = data.contextInfo?.issuer ? path.relative(__dirname, data.contextInfo.issuer) : 'something';
                compilation.errors.push(new compiler.webpack.WebpackError(
                    `The board is in the fvtt-dream-board module now, but ${who} still brings ${path.relative(__dirname, file)} into heart.js. `
                    + 'Use the module\'s api (game.modules.get(\'fvtt-dream-board\').api) instead of importing the old board code.',
                ));
            });
        });
    }
}

module.exports = (env, argv) => {
    // `--env incremental` (npm run build-fast / watch): keep dist/ and its
    // hash-named assets in place instead of wiping it. A release or a clean
    // build (build-all, check-build.yml, release.yml) never passes it, so
    // output.clean stays on there, exactly as before. The filesystem cache is
    // on for every build; a cold cache, or CI's fresh checkout, is just a
    // normal cold build.
    const incremental = Boolean(env && env.incremental);
    return {
        mode: 'development',
        entry: './src/index.js',
        output: {
            path: distPath,
            filename: `${id}.js`,
            clean: !incremental,
            publicPath: publicPath,
        },
        cache: {
            type: 'filesystem',
            cacheDirectory: path.resolve(__dirname, 'node_modules', '.cache', 'webpack'),
            name: `heart-${(argv && argv.mode) || 'development'}`,
            version: globVersion(),
            buildDependencies: {
                config: [__filename, path.resolve(__dirname, 'dev-utils', 'templates-loader.cjs'), path.resolve(__dirname, 'foundryvtt.config.cjs')],
            },
        },
        // Size hints target sites downloaded over the network; Foundry loads
        // heart.js and the fonts from local disk, so the warnings are noise.
        performance: {
            hints: false,
        },
        optimization: {
            minimize: false, //true,
            minimizer: [new TerserPlugin({
                terserOptions: {
                    keep_classnames: true
                }
            })],
        },
        module: {
            rules: [{
                    test: /\.html$|\.handlebars$|\.hbs$/,
                    use: {
                        loader: path.resolve('dev-utils', 'templates-loader.cjs'),
                        options: {
                            name: id
                        }
                    }
                },
                {
                    test: /\.js$/,
                    // The package is ESM ("type": "module", 2026-10-27), which
                    // makes webpack demand full file extensions; src/ imports
                    // omit them, as they always did.
                    resolve: { fullySpecified: false },
                    use: 'webpack-import-glob-loader'
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        // Creates `style` nodes from JS strings
                        "style-loader",
                        // Translates CSS into CommonJS
                        "css-loader",
                        // Compiles Sass to CSS
                        "sass-loader",
                    ],
                },
                {
                    test: /\.(woff|woff2|eot|ttf|otf)$/i,
                    type: 'asset/resource',
                },
                {
                    test: /\.(png|jpe?g|gif|webp|svg)$/i,
                    type: 'asset/resource',
                  },
            ],
        },
        // (the board kept out of the bundle: see the top of this file; the
        // swap first, so the check sees the stub, not the real index.js)
        plugins: [swapBoardIndex(require('webpack')), new NoBoardInBundle()],
        // (upstream's devServer block, in webpack-dev-server 3 options the
        // installed v4 rejects, was removed 2026-10-21: nothing ran it)
    }
};