// Cross-platform replacement for the Unix-only `bash -c 'rm -rf dist/*'`
// empty-dist script (Phase 2 item; the bash version silently fails on
// Windows). Removes dist/ entirely and recreates it empty.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
console.log('empty-dist: dist/ emptied');
