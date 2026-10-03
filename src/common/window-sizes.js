// Default window sizes (2026-10-01, Luke's picks in the "Heart Window Sizes"
// mock). Everything is anchored to the character sheet: 1000px wide since
// 2026-10-02 (940 before) and as tall as the Foundry window less 100px. The
// class, calling, and ancestry sheets and the panel actor sheets (adversary,
// delve, landmark, companion) open at 85% of it, so the three art sheets
// share one art canvas (the art is framed per piece against the default
// size; a resized window simply shows more or less); the party sheet at its
// full size. The other sheets that sit beside it (gear items, bonds) grow by
// the same factor from the sizes Luke picked at 940 (scaledWidth). Read at
// open time, so the heights follow the screen.
export const CHARACTER_WIDTH = 1000;
// the character width the other sheets' sizes were picked at
const PICKED_AT = 940;
export const SHEET_SHARE = 0.85;

export const characterHeight = () => Math.max(600, window.innerHeight - 100);

export const characterSize = () => ({ width: CHARACTER_WIDTH, height: characterHeight() });

export const shareOfCharacter = (share = SHEET_SHARE) => ({
    width: Math.round(CHARACTER_WIDTH * share),
    height: Math.round(characterHeight() * share),
});

// a width picked beside the 940px character sheet, grown with it
export const scaledWidth = (px) => Math.round((px * CHARACTER_WIDTH) / PICKED_AT);
