const fs = require('fs');
const config = require('../foundryvtt.config.cjs');
const content = fs.readFileSync('./src/manifest.json');
const manifest = JSON.parse(content);

const version = process.argv[2] || "???";
manifest.version = version;

// Required
manifest.id = config.id;
manifest.title = config.title;
manifest.description = config.description;
// Foundry v12 reads `authors` as objects (2026-10-21: this wrote
// config.author, which was never defined, so system.json had no author)
manifest.authors = config.authors.map((name) => ({ name }));
manifest.compatibility = config.compatibility;

// Optional
if (manifest.esmodules === undefined) manifest.esmodules = [`${config.id}.js`];

// The fork's own home (2026-10-21; these pointed at upstream's releases).
// manifest and download are empty on purpose: with no manifest URL Foundry
// never offers an "Update" that would install upstream over the dist/
// symlink. src/manifest.json can still set any of them.
if (manifest.url === undefined) manifest.url = config.repository;
if (manifest.manifest === undefined) manifest.manifest = "";
if (manifest.readme === undefined) manifest.readme = `${config.repository}/blob/main/README.md`;
if (manifest.download === undefined) manifest.download = "";

// Return as nicely parsed string
const output = JSON.stringify(manifest, null, 4);
console.log(`Writing manifest to ${config.type}.json`);
fs.writeFileSync(`./dist/${config.type}.json`, output);