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
        // (upstream's devServer block, in webpack-dev-server 3 options the
        // installed v4 rejects, was removed 2026-10-21: nothing ran it)
    }
};