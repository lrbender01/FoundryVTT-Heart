// Stands in for src/map/scrapboard/index.js in the bundle (2026-10-28). The
// board lives in the Dream Board module (fvtt-dream-board) now, and webpack
// keeps the old board code out of heart.js. But src/index.js loads every
// index.js under src/ by a glob, and that glob still finds
// scrapboard/index.js, so webpack.config.cjs swaps it for this empty file.
// The real scrapboard/index.js stays in the tree, unchanged: Map Dreamer and
// the content tools import it by path. Exports nothing, so the glob finds no
// initialise() here.
