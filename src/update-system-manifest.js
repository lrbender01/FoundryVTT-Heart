const fs = require('fs');
const content = fs.readFileSync('./system.json');
const manifest = JSON.parse(content);

version = process.argv[2] || "???";
manifest.version = version;
manifest.download = `https://github.com/hitcherland/FoundryVTT-Heart/releases/download/${version}/heart.zip`

// Return as nicely parsed string
const output = JSON.stringify(manifest, null, 4);
console.log(`Writing manifest to ${config.type}.json`);
fs.writeFileSync(`./dist/${config.type}.json`, output);