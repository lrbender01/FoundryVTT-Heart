// Cross-platform replacement for the Unix-only `bash -c 'cp -r LICENSE
// static/. dist/'` copy-static script. Merges into dist/ without deleting
// existing build output (so it must run AFTER build-packs, same as before).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
fs.cpSync(path.join(root, 'static'), dist, { recursive: true });
console.log('copy-static: LICENSE + static/* copied into dist/');
