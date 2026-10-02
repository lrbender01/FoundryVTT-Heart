import { defineConfig } from "vitest/config";

// Rules tests for the Heart fork (2026-09-30, Luke). Node environment, with
// the few Foundry globals the tested modules touch stubbed in test/setup.mjs.
// vitest itself resolves from the monorepo root's node_modules (the fork is
// not an npm workspace and installs nothing for it).
//
// Webpack-only imports (2026-10-02): templates and stylesheets are webpack
// loaders' business (dev-utils/templates-loader.js, sass-loader), so here
// they resolve to stand-ins and the modules that import them (the roll
// classes, the chat message class, the sheets) load under vitest:
//   - a template (.html, .handlebars, .hbs) is `{ path, source: '' }`, its
//     path built the way the templates loader builds it ('./roll.html' ->
//     'heart:roll.html')
//   - a stylesheet (.sass, .scss, .css) is an empty module
// This config is read by vitest only; the webpack build never sees it.
const TEMPLATE = /\.(html|handlebars|hbs)$/;
const STYLE = /\.(s[ac]ss|css)$/;
const TEMPLATE_PREFIX = "\0heart-template:";
const STYLE_ID = "\0heart-style";

const webpackOnlyImports = {
  name: "heart-webpack-only-imports",
  enforce: "pre",
  resolveId(source) {
    const bare = source.split("?")[0];
    if (TEMPLATE.test(bare)) return TEMPLATE_PREFIX + bare;
    if (STYLE.test(bare)) return STYLE_ID;
    return null;
  },
  load(id) {
    if (id.startsWith(TEMPLATE_PREFIX)) {
      const request = id.slice(TEMPLATE_PREFIX.length);
      const path = request.replace(/^\.\//, "heart:");
      return `export default ${JSON.stringify({ path, source: "" })};`;
    }
    if (id === STYLE_ID) return "export default {};";
    return null;
  },
};

export default defineConfig({
  plugins: [webpackOnlyImports],
  test: {
    environment: "node",
    setupFiles: ["./test/setup.mjs"],
    include: ["test/**/*.test.mjs"],
  },
});
