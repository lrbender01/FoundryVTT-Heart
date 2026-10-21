# Heart - The City Beneath (personal v12 fork)

A personal Foundry VTT v12 fork of [hitcherland/FoundryVTT-Heart](https://github.com/hitcherland/FoundryVTT-Heart), the system for [Heart: The City Beneath](https://rowanrookanddecard.com/product/heart-the-city-beneath-rpg/) by Rowan, Rook and Decard. It is not an official or blessed continuation: upstream froze its v12 branch at `0.10.4` and moved to v13, and this fork keeps a v12 copy going for one table.

## Credits

- The original system: [@hitcherland](https://github.com/hitcherland).
- The character sheet redesign (upstream PR #94) and its fixes: [@Lavaeolous](https://github.com/Lavaeolous).
- Heart: The City Beneath is the work and property of Rowan, Rook and Decard.

## What the fork adds

- The PR #94 character sheet, then a full interface pass: one design language across every sheet, dialog, and chat card, a dark and a light scheme, and an optional smoked-glass look.
- Rolls with the rules worked out: the dice pool, difficulty, helpers, stress after the roll, Protection, and fallout checks, with racing writes handled by one GM-side relay.
- A party actor with a shared Provisions track (a house rule), a note board, and companions; bonds, hirelings, and animals; a Fallout picker.
- The Heart map: a scrapboard scene the party builds at the table, with strings, pins, notes, a brush, and per-user undo.
- `system.totalStress` stored as `{ value, max }`, so it can be a token bar.

## What it does not include

No game text. Classes, callings, ancestries, fallouts, tags, equipment, adversaries, and landmarks come from a separate content module (the manifest recommends `fvtt-heart-content`, which is not public). Without one, the sheets work and the compendiums are empty.

## Building

Requires Node. Inside this folder:

```shell
npm ci
npm run build-all
```

The built system is in `dist/`; link or copy `dist/` to Foundry's `Data/systems/heart`. Architecture, build details, and tests: [CLAUDE.md](CLAUDE.md). What changed: [CHANGELOG.md](CHANGELOG.md).

## Licence

ISC, as upstream ([LICENSE](LICENSE)).
