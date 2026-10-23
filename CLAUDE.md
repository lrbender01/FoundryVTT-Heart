# fvtt-heart-system: Personal Fork of Heart: The City Beneath

**Status:** this doc is current to 2026-10-22, the day Luke declared a soft feature freeze on Heart (finish, review, and fix what is built; new features wait). What changed and when: [CHANGELOG.md](CHANGELOG.md). The window-by-window review: the monorepo's `docs/plans/heart-ui-review.md`. The monorepo's `HEART.md` says which doc owns which fact.

**Fork source:** https://github.com/hitcherland/FoundryVTT-Heart → https://github.com/lrbender01/FoundryVTT-Heart (personal fork)

**System ID:** `heart` (never change; upstream hardcoded)

**System version (our fork):** `0.11.0` (2026-10-22), everything up to the soft feature freeze; changes and fixes after it are 0.11.1 and on. The first fork release was `0.10.5-pr94` (2026-06-12), a patch bump over upstream `0.10.4` identifying the PR #94 cherry-pick. **To release a version:** the version in the `build-all` script and `version` in `package.json` (and `package-lock.json`'s root), a `heart.versions.<x_y_z>` entry in `static/lang/en.json` (`version` "v<x.y.z>" exactly, since the startup window opens on `v${game.system.version}`, plus a few `changes` and `bug_fixes`), and the CHANGELOG's `[Unreleased]` cut into a dated section.

**Foundry version:** v12. No DialogV2 / ApplicationV2 / v13 APIs.

---

## Fork Rationale

The upstream Heart system (`hitcherland/FoundryVTT-Heart`) is mechanically complete but has these gaps:

- **UX sparse**: Single-page character sheet, no click-to-roll, no resistance visualization, no token bar integration
- **Content missing**: Compendium items have zero art; supplement content absent
- **Upstream abandoned on v12**: Maintainer (hitcherland) pivoted to v13 rewrite (`new-magic` branch); v12 `main` is frozen

**Solution:** Fork and own the system. Cherry-pick character sheet redesign (PR #94 by Lavaeolous) and critical bug fixes.

**Consequence:** Maintenance burden. When upstream ships v12 patches, manual evaluation needed (unlikely; upstream is v13-only going forward).

---

## Origin: PR #94

The fork is upstream `0.10.4` plus PR #94 (Lavaeolous's character sheet redesign, `feature-character-sheet`), applied 2026-06-12 by a fast-forward merge with zero conflicts. Phase 0 found that the PR's bug fixes (drag and drop of nested items, compendium roll tables, the `totalStress` proxy) are embedded in the redesign commits; only `b30920f` (the Firefox SVG token crash) stands alone. Commits, provenance, what it added, and its known gaps (all closed since): the CHANGELOG's `0.10.5-pr94` entry.

---

## Build System

Heart uses **webpack + sass** (the modern pure-JS sass, NOT node-sass; briefing was wrong about that). Source in `src/`; build outputs to `dist/`.

### Available scripts (`package.json`)

| Script           | What it does                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `build-prod`     | `webpack --mode production`. Emits `dist/heart.js` (not minified: `minimize: false` in `webpack.config.js`, so stack traces stay readable) + hash-named auxiliary assets (`xxxxxxxx.ttf` etc.). **Use this for builds.** |
| `build-code`     | `webpack --mode development`. Unminified dev bundle.                                                                                      |
| `build-manifest` | `node dev-utils/build-manifest.js <version>`. Generates `dist/system.json` from `src/manifest.json` + `foundryvtt.config.js`.             |
| `build-template` | `node dev-utils/build-template.js`. Merges all `src/**/template.json` into `dist/template.json`.                                          |
| `build-all`      | **Full pipeline, cross-platform (2026-08-24).** empty-dist → build-prod → build-manifest (version hardcoded here; bump on release) → build-template → copy-static. Use this. (`build-packs` was removed 2026-09-30 with the content packs; see "No game text in the system".)  |
| `build-local`    | Alias for `build-all` (kept for muscle memory). The old Unix-only version + the hardcoded-path `relink` script were removed 2026-08-24.    |
| `empty-dist` / `copy-static` | The first and last steps of `build-all` (`dev-utils/empty-dist.js`, `dev-utils/copy-static.js`: LICENSE plus `static/` into `dist/`). |
| `check:build`    | Compile-check only: `webpack --mode production --output-path node_modules/.cache/heart-build-check`, never into `dist/`. The monorepo root runs it as `npm run check:heart-build` (part of `npm run check`). |
| `test` / `test:watch` | The rules tests (vitest; see "Tests").                                                                                              |

**Note: there is NO `npm run build` script.** Old plan documents that said to run `npm run build` were wrong; that errors with "Missing script: build". Use `build-prod` for the webpack step.

**Note: there is NO separate `heart.css` output.** Webpack uses `style-loader` (CSS injected at runtime via JS), so all CSS is bundled INTO `heart.js`. Old plan documents claiming a `heart.css` artifact were wrong.

### Full build (cross-platform since 2026-08-24)

Run from inside `packages/fvtt-heart-system/`:

```
npm run build-all
```

`empty-dist` and `copy-static` are now Node scripts (`dev-utils/empty-dist.js`, `dev-utils/copy-static.js`); the hardcoded-Linux-path `relink` script was dropped. The manifest version string is hardcoded in the `build-all` script line in package.json - bump it there on release. NEVER run `build-prod` alone and reload Foundry: webpack wipes dist/, and skipping `build-template` leaves a stale `Item.types` (symptom: new item types silently invisible - unrenderable sheets, hidden compendium docs, refused drops).

From the monorepo root, `npm run build:heart` chains this with the heart-content and heart-toolkit pack builds (Foundry must be at the Setup screen).

### Build outputs (`dist/`)

| File                             | Purpose                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dist/heart.js`                  | Webpack bundle (entry: `src/index.js`). Includes all CSS as runtime `style-loader` injections.                                 |
| `dist/system.json`               | Foundry system manifest. Generated by `build-manifest`; lists packs + languages + version + compatibility.                     |
| `dist/template.json`             | Foundry data template. Merged from all `src/**/template.json` files.                                                           |
| `dist/<hash>.ttf`/`.svg`/`.webp` | Hash-named auxiliary assets. Referenced from `heart.js` via webpack `asset/resource`. Must live at dist root (relative paths). |
| `dist/lang/{en,es,it,pt}.json`   | i18n translation files. Copied from `static/lang/`.                                                                            |
| `dist/assets/...`                | UI assets (header SVGs, dice icons, fonts beyond the webpack-hashed ones). Copied from `static/assets/`.                       |
| `dist/assets/icons/<kind>/`      | Skill / domain / resistance glyphs (game-icons.net, CC BY 3.0, `static/assets/icons/CREDITS.md`). Added 2026-09-30; drawn through `common/icons.js` (`{{{heartGlyph kind id}}}`, tinted by a CSS mask). |
| `dist/LICENSE`                   | ISC license from upstream.                                                                                                     |

### Party actor and Provisions (2026-09-30)

A house rule (monorepo `reference/heart-rules/provisions.md`, the rule text this implements). `src/actors/party/`: a singleton Actor type `party` holding the world's one Provisions track (`system.provisions { value, max: 20 }`, `system.quartermaster`, `system.notes`); `rules.js` is the pure arithmetic (thresholds, restock sizes, protection), `party.js` the API and singleton hooks, `proxy.js` the derived data, `sheet.*` the party sheet (built 2026-09-30, `view.js` its shared display data; since grown Party Items, Pursued Beats, Companions, and the quartermaster Volunteer / Resign buttons). An actor rather than a world setting so players can mark it from their own stress cards (settings are GM-write only). Since 2026-10-02 every Provisions write goes through the GM relay (`applyProvisions`; see "GM relay" below). `game.heart.resistances` stays the five personal tracks; `game.heart.stress_targets` adds `provisions` for the stress picker. Party art (2026-10-02): `PartySheet` is a `BannerSheet`. Its banner and decorations come from the content module's `assets/art/party/party-art.json` (the Heart Party Sheet Art tool's export), read once by `actors/party/art.js` (`common/decor-file.js`). The decorations are shared code since 2026-10-02 (the character sheet has them too; Heart Character Sheet Art tool, `assets/art/character/character-art.json`, `actors/character/decor.js`): `common/decor.js` is the pure maths (`normalizeDecorArt`, `decorLayout`, `decorUV`; tested in `test/decor.test.mjs` and `test/party-decor.test.mjs`), and `common/decor-dom.js` `SheetDecor` places the images, keeps them placed (a ResizeObserver; a box on a hidden tab has no rect, so its pieces wait), plays hover (lift by default), and opens the sheet's gallery at a clicked piece when nothing clickable or opaque is in the way and the pixel isn't transparent. The behind layer and section pieces sit at `z-index: -1` in an isolated form or section (`common/decor.sass`), so sheets' own z-indexes are untouched. Party sections carry `data-anchor` (`members`, `companions`, `fallouts`, `provisions`, `items`, `notes`, `beats`, plus `header` and `sheet`); the character sheet's are listed in `CHARACTER_ANCHORS` (a test checks each appears once in the templates). `getData` is async: it awaits the art. The Notes section is a note board (2026-10-02): `system.board` is an object keyed by note id (`{ title, text, sort }`, `board.js`, tested), so concurrent writers touch different keys; each note opens in `note-window.js` (a FormApplication: title field plus Heart's editor, whose Cancel closes the window); the GM moves the old `system.notes` text onto the board once on ready. `StressRoll._takePartyStress` applies a Provisions mark once to the party; `FalloutRoll` has a party branch (`options.party`, `critical-fallout`, `notRolled`). `activeFallouts(character)` includes the party's fallouts.

### The Heart map (2026-10-02)

The scrapboard: the party's ledger, a folded sheet with the journey pinned to it. Play starts from an empty board, built at the table. Map Phase 8, a small spoiler-free demo board, is session-zero prep, not a new feature, and is not made yet. The user guide is the map's in-Foundry Help window; what changed, round by round, is in the CHANGELOG. **The Heart Map Board mock (monorepo `docs/mocks/heart-map/`) is the primary map editor and the source of truth for how the map looks; Foundry is the frontend plus the table tools.** `src/map/scrapboard/model.js` (the board model) and `paint.js` (canvas 2D drawing) are the one copy both run: the mock's build inlines them (imports and `export` stripped), so keep them free of Foundry globals, and rebuild the mock (`node build.mjs` there) after changing them. `src/map/`:
- `scrapboard/model.js` (tested in `test/scrapboard-model.test.mjs`) and `scrapboard/paint.js` (`createPainter(env)`: `img`, `piece`, `measure`, `pxs` are all that differ between the two).
- `scrapboard/render.js` takes the client setting `boardDetail` (`DETAIL`: bitmap scale, image cap, live repaint). `paint.js` caches graded images (WeakMap per image and filter) and each scrap's finished composite (its paper, clipping, writing, and grime), so keep per-frame work out of `drawScrap`; since 2026-10-21 it also keeps each brush stroke's painted layer (`StrokeLayerCache`), and render.js paints a tile's sheet a band at a time (`sheetBands`) and repaints only the parts an arriving image lies in (`arrivalAreas`).
- `scrapboard/look.js` reads fvtt-heart-content's `assets/art/map/heart-board.json` (exported from the mock: `node build.mjs --export`) once.
- `scrapboard/render.js` paints the look and a viewer's board into tiles (a finer set over the view when zoomed in), shown as sprites in `canvas.primary` at sortLayer 100 (above the background, below tiles and tokens).
- `scrapboard/api.js` holds the board (`flags.heart.board`, the same JSON the mock edits), the GM's edits, and import / export with one backup (`flags.heart.boardBackup`). **Every board write goes through its `update()`** (exported as `writeBoard`): it records what the write changed (`model.js` `diffBoard`, path by path, scoped by `updateRoots`) as this user's undo record, or into a `sink` (the relay's: handed back to the player who asked). Undo and redo (2026-10-06) apply a record's `before` or `after` side to the board as it is now (`recordUpdate`), never a whole board, so they never undo other users' edits; a player's go through the relay (`board.history`, checked by `notes.js` `mayHistory`, and only for a record the GM's client handed that player this session, M31: after a GM reload older records answer `forgotten`). A relay handler that writes must pass `{ sink }` to every api write and return `undo: mergeRecords(sink)`; a write that bypasses `update()` is invisible to undo. Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z are keybindings registered in `map/index.js` (they defer to Foundry's own off the board).
- **Cards are never deleted outright** (2026-10-06): `removeScrap` / `removeMany` put cards into the board's `bin` (`binPatch`; File, Removed cards; `unbinPatch`), and Delete never takes a card (`controls.removal()` lists them as `cards`). A card's generated pieces come off by id (`drop`: `tape<i>`, `pin<i>`, `x<i>`).
- `scrapboard/boardfile.js` (2026-10-21): a board as a file (File, Download the board (.json); Import, Load a file; `boardFromText` keeps loose pieces, the bin, and `pinsEd`) and `renamedCards` (a landmark card follows its actor's renames). File, New place (`api.js` `newPlace`) makes a landmark actor in the "Heart Map places" folder with its card; a library-less landmark card uses its actor's image as its clipping. Reshuffle (Shift+R or File) gives the selected cards a new seed. Players take their own notes and writing off into the bin (`board.edit` `ownCards`, checked by `notes.js` `ownCardsOf`).
- `scrapboard/backups.js`: rolling copies of each board in the GM's browser (IndexedDB): at session start, every few minutes of edits, and before cards come off or the board is replaced (File, Earlier boards). Never on a player's client; never an error if IndexedDB is unavailable.
- `scrapboard/hits.js` (tested in `test/scrapboard-hits.test.mjs`) is what is under the pointer.
- `scrapboard/controls.js` (`BoardControls`, tested in `test/scrapboard-controls.test.mjs`) is the one copy of what a press, Ctrl+press, box, drag, wheel, and double-click do with each tool. It returns actions or patches; the host carries them out. The editor inlines it too, so **a control change goes here, never into the layer or the mock alone** (Luke, 2026-10-02: "the controls must flow from Foundry").
- `scrapboard/layer.js` is `ScrapboardLayer` (`canvas.heartBoard`, interface group): Foundry's pointer events into the controls, their actions out through Foundry dialogs and scene writes. It carries the Heart Map scene control on scrapboard scenes only, activated when such a scene is viewed.
- `scrapboard/rail.js` (2026-10-03) is the Heart Map's own toolbar: the same tools as Foundry's buttons (`layer.js` `boardTools`) on frosted glass with Foundry's icons and spacing, up the left or along the top, with the rarely used few (picture, bin, earlier boards, export, import, reload) under one File button. The client setting `boardToolbar` picks it or Foundry's column (`boardToolbarDir` remembers its direction). It shows only while the Heart Map control is in hand.
- **The brush and doodles** live in the shared code: brush strokes are the board's `marks` (Dim, Medium, or Bright; a stroke begun on a card belongs to the card), and the doodles (`DOODLES`, drawn shaky by `humanize`) are stamped from a palette beside the toolbar while the brush is in hand (`model.js`; tested in `test/scrapboard-brush.test.mjs` and `test/scrapboard-doodles.test.mjs`).
- **Map dialogs** (since the 2026-10-21 consistency pass, in both hosts) use the design language's chip and button mixins, list colours in the palette's order with "Any" or "Default" first, confirm through `askBoard` with buttons that say what they do, and take every string from i18n. They carry `heart-board-dialog`, so they stay out of glass.
- A string's ends are scrap keys (`a`, `b`, placed by `aAt` / `bAt`) or loose board points (`aPt`, `bPt`). It may run through `joints` (board points) and have `pulls` (per span, an array: arrays replace on a Foundry update, so per-span state is never an object). The view gives each string `waypoints` and `spans` (vertex ranges in `points`).
- The board also holds `pins` (its own, in a scrap or loose) and `marks` (the marker's strokes, by user layer). A scrap may hold `ink`, `parts` (its pieces moved by hand), and `pinOff`.
- A drag is always worked out from a snapshot of the board taken when it starts (`drag.raw`): both hosts repaint the board as the drag goes, so reading the live board would apply each move on top of the last.
- A players' board (`flags.heart.boardOwners`) gives its owners `user.owner`: `toolsFor` / `mayMove` / `mayRubOut` decide what they may do, and their writes go through the relay's `board.edit` (checked again on the GM's client). Everyone's marker strokes go through it too.
- `scrapboard/notes.js`: players' notes and their claimed hands (world setting `boardHands`), through the relay (`board.claimHand`, `board.addNote` for notes and writing, `board.editNote`, `board.moveOwn`; `mayMove` is the rule both sides check: the GM anything, a player only their own notes and writing); the board's dialogs.
- `index.js` holds the hooks (redraw on `flags.heart`, the landmark drop, the Scenes sidebar button, the v2 map scene conversion). `game.heart.board` is the API. The handwriting faces are bundled in `src/fonts/hands/`.

The map's colours are the book's ink and paper (a fixed art piece, like the header art), not theme roles. Compile-check map code with `npm run check:build` (webpack `--output-path` into `node_modules/.cache/`), never into `dist/` (`output.clean` wipes it, and Foundry may hold a lock on `dist/packs`). After a change to `model.js`, `hits.js`, `controls.js`, or `paint.js` (the four files the editor's `build.mjs` inlines), the monorepo's `npm run check:heart-map` rebuilds the editor and parse-checks it, and `npm run test:heart-map` runs its headless-Chrome suite (`docs/mocks/heart-map/tests/README.md`).

### Bonds, hirelings, and animals (2026-10-01)

The bond rules of HCB p. 102 and W&M W65-W67, split as Luke decided and pared down to what the rules need (2026-10-01): the **bond is the relationship**, a `bond` Item on the character (`items/bond/`: `system.target` = the bonded actor's uuid, optional for a person; a name and portrait for when there is none; notes; for a person bond a Stress pool and its own Fallout in nested `system.children`). Its kind is **person** or **companion** and follows the bonded actor (`bondKindFor`: a `hireling` actor makes it a companion; the stored `system.kind` is only a fallback once the actor is gone; older "hireling" / "animal" read as companion). The **companion is its own actor**, type `hireling`, for hirelings and animals alike (the book gives them the same rules; no kind field): five `resistances` tracks with Protection, cost, descriptors, description, examples, notes, and items (ability items, equipment, resources, and its book Fallouts as a menu switched off; one switched on is taken). `actor.proxy.totalStress` / `employers`. Logic in `src/bonds/`: pure rules in `rules.js` (tested, `test/bonds.test.mjs`), document actions and chat cards in `bonds.js` (`game.heart.bonds`), hooks (three bonds max, characters only, redraws) registered from `index.js`. A full list refuses new bonds until one is removed; there is no replacing (2026-10-02). Every transfer onto a bond runs the GM's Fallout check (`bondFalloutResult`, the delver thresholds, never Critical); on a Minor or Major the card carries the GM-only Pick Fallout button (nothing is recorded automatically, and Stress is always cleared by hand). A Critical removes the bond (HCB p. 102): no broken state. A heal (D8 to the bond) runs the same check. One visit per bond per session, a hand-over or a heal (table ruling 38, 2026-10-23), is named in the tooltips and kept by the table, not enforced. `addBond` and `hire` are GM-only; `hire` imports a fresh world copy of a compendium companion (book name kept in `flags.heart.role`, book Fallouts switched off, a legacy `system.ability` turned into an item) and, when the player runs it, grants the character's players ownership. Fallouts may hit `bond` (`game.heart.fallout_resistances`). The ledger card builder lives in `common/ledger.js` (shared with the party). The model's decisions: the content roadmap's Decision of 2026-10-01 in the monorepo.

**The UI (2026-10-01, Luke's picks from the Heart Bonds Mock).** Display data is pure and tested: `bonds/view.js` (`bondRowView`, `bondActions` (the lean button set), `poolMarks`, `trackSummary`, `takenFallouts`, `companionCards`; `test/bonds-view.test.mjs`). Partials `heart:bonds/section.html` / `row.html` / `chips.html` draw the character sheet's Bonds section (Character tab, above Inactive Items; `_activateBondListeners` in `actors/character/sheet.js` maps each `data-action` to `game.heart.bonds` or the ordinary Stress / Fallout rolls for a companion; the GM clicks a pool's marks, `setBondStress`). `bonds/dialogs.js` only asks (Dialog v1 + `heartDialogOptions`, chip choices, resolves null on close); `bonds/flow.js` is the drop path (`grantBond` for the GM: companion actors go through `hire`, others through `addBond`, refused when the character already has three; `requestBond` for players: a GM-whispered ledger card with `flags.heart.bondRequest`, buttons wired in a `renderChatMessage` hook, GM only, settled by rewriting the card). `items/bond/sheet.js` is a real sheet class (actor drops link `system.target`); `actors/hireling/sheet.js` uses panel-sheet chrome (`data-actor-track` marks, the edit toggle for the profile) with the character sheet's `.roll-buttons-container` and `.stress-container`, and migrates a legacy `system.ability` on the owner's first open. **The Fallout picker** is `src/fallout-picker/` (`game.heart.fallout.pick({ target, severity, resistance })`; pure half `candidates.js`, tested in `test/fallout-picker.test.mjs`; `button.js` makes the GM-only `[data-gm-only]` Pick Fallout button, which `index.js` strips for players and wires for the GM). Every Fallout "+" on an actor sheet goes through it (`actors/base/sheet.js` add handler). Styles: `bonds/bonds.sass` (rows, dialogs, companions), `items/bond/sheet.sass`, `actors/hireling/hireling.sass`, `fallout-picker/picker.sass`.

### GM relay and card actions (2026-10-02)

Writes that several clients could race on (stress taken twice from one card, two players marking Provisions at once) have ONE writer. `common/relay.js`: a client calls `askGM(op, data)` (or `relay`), which emits on `system.heart` (manifest `"socket": true`) to the active GM's client. That client runs the registered handler in a single queue and answers `{ status: 'done' | 'already' | 'not-allowed' | 'missing' | 'needs-gm' | 'no-party', ... }`; `askGM` reports any non-done status to the user and returns null. The GM's own calls, and every call when no GM is connected, run in the same queue locally.

Rules for handlers: check "already done" and who asked (`userId`) inside the handler; never call `relay` from a handler (it would deadlock the queue); never show a notification (it would land on the GM's screen); answer plain JSON. The card and party handlers live in `rolls/card-actions.js` (`registerCardActions`, called from `rolls/index.js`): `provisions` (`applyProvisions`), `apply-stress`, `attach-stress`, `take-stress`, `claim-fallout` / `release-fallout` / `attach-fallout`, `record-fallout-pick`, `clear-stress`, and `claim-card-button` / `release-card-button`. The map's `board.*` handlers register in `map/scrapboard/notes.js` (see "The Heart map"). Each handler has 12 seconds (`HANDLER_LIMIT_MS`), and the GM's client trusts the sender id Foundry's server passes (`onRelayMessage`), refusing a request whose own `from` disagrees; answers count only from a GM. `StressRoll.takeStress` is only called from handlers. A click handler that writes wraps its work in `oneAtATime(key, button, fn)` (`common/busy.js`): the key is per card and action, so the chat log and a popout share it. Only the GM and the rolling character's owners see or press Roll Stress and Take Stress (`mayRunStress`). **Rolling and marking stress are separate steps** (2026-10-21, Luke): `attach-stress` only attaches the roll (the card reads "Rolled, not taken yet" with a preview per target), and `take-stress` marks it, once; between them a person applies Defiant, a guard, or a redirect by hand. Rolled Provisions marks wait the same way. A GM's Request Roll can carry the stakes (resistance, die, passive; `normalizeStakes`), which preselect the stress picker without forcing it. Tested in `test/relay.test.mjs` and `test/card-actions.test.mjs`.

Drops: `common/drops.js` (tested in `test/drops.test.mjs`). An item sheet takes exactly the child types it shows (`ITEM_CHILD_TYPES`). An actor sheet refuses only clear mistakes (`actorDropRefusal`, in `HeartActorSheet._onDropItemCreate`, which every actor sheet's own drop reaches through `super`).

### Book art (2026-10-01)

**Galleries (2026-10-02, Luke):** one art viewer for every sheet, and a sheet's gallery holds every piece of art the sheet shows. Build it from `piecesOf(doc)` (main, alternates, the book's drawings), `gearPieces(items)`, and `plainPiece(src, label)` (decorations, fixed art), then open it with `showGallery(pieces, { title, start: startAt(pieces, doc) })`. `canPickKeyArt` offers "Use for this character" on a character's own class, calling, or ancestry that has alternates (`flags.heart.artVariant`).

The system ships no art; fvtt-heart-content gives classes, callings, and ancestries `flags.fvtt-heart-content.art = { src, ar, card, item, band }`, each place a `{ z, x, y }` framing (zoom %, 100 = covers the canvas; the art's centre as % of the canvas). `common/art.js` (`artOf`, `artCanvas`, `showArt`, helpers `heartArt` / `heartHasArt`) and `common/art.sass` draw any place as `.heart-art-canvas` inside a `position: relative` parent: pure CSS, sized with container query units (`cqw` / `cqh`), so it holds at any size. Places: the Choose card (behind the text, 20% / 40% on hover; the hover popout beside the card was removed 2026-10-02, Luke), the item sheet's header block (`items/base/sheet.html`: `.item-head.has-art` wraps the art, a 220px `$art-lead` strip, and `.item-header`, so one canvas spans strip and title bar; class / calling / ancestry only), and the character sheet's `.character-art-band` (`.character-head.has-art` wraps it with `.character-header`: three panes from a `$header-height` lead strip down behind the header). In both, the wrapper carries the header texture and a two-layer mask (solid over the lead strip, `header_nav.svg`'s torn edge below), and the header row drops its own texture and mask; without art the wrapper adds nothing. The books' art has one switch per user since 2026-10-02 (client setting `heart.showArt`, `common/art-toggle.js`): the Art button in the title bar of every window that shows art (character, party, landmark, adversary, companion, item sheets, and the Choose window) flips it for all of them, every open Heart window redraws, and `body.heart-art-off` hides the art behind gear rows anywhere. It replaced `showCharacterArt` and the per-document `hiddenItemArt`. Class / calling / ancestry items outside the packs (on characters, in the world) take their pack entry's art first and their own flag only as a fallback, so re-tuned placements reach existing characters (`packArt`: `_stats.compendiumSource` / `flags.core.sourceId`, else type + name in the content packs; the flag is in `CONFIG.Item.compendiumIndexFields`, so no document loads). View-art buttons open Foundry's `ImagePopout` (sized to the art within the screen, `shareable: false`).

### Glass sheets (2026-10-02)

An opt-in look, one switch per user and off by default (client setting `heart.glassSheets`, `common/glass.js`): every Heart sheet as smoked glass over the texture set's charcoal grunge. Luke tuned it in the monorepo's Heart Sheet Glass mock (`docs/mocks/sheet-glass`; his values are listed at the top of `common/glass.sass`). It is CSS only, hung on `body.heart-glass`, so flipping it needs no redraw. Scope (2026-10-02 sweep, Luke): every Heart window in the dark scheme (`$windows` in `glass.sass`: `.heart-window` sheets, apps, and dialogs, plus the art viewer), except the map's, which carry `.heart-board-dialog`. **A new Heart window takes glass by carrying `heart-window`** (HeartSheetMixin, HeartApplication, and `heartDialogOptions` add it); a new map dialog must add `heart-board-dialog` to stay out. The Glass button is on the sheets only. Chat cards are glass too (`$chat`, every `.chat-message`): the ground in `::before`, one layer of tint in `::after` (two for whispers and blind rolls), no blur in the docked log, the window blur only in `#chat-notifications` (cards over the scene).
- **Tokens:** most of it is `--heart-surface` / `--heart-sunken` / `--heart-bg` made translucent inside the window, so new sections, rows, and chips follow with no rule of their own.
- **One frost, layered tint (Luke, 2026-10-02):** only the window blurs. Every piece on it is the same charcoal glass, `--heart-glass-section` per layer (the per-user setting `glassTint`, 0 to 90%, default 80%; See-Through 25, Blur 6, Luke's picks in Foundry on 2026-10-21 and 22), so darkness comes only from depth (a row in a section is two layers, a chip on it three, by stacking). Pieces that stand alone get a layer count outright, 1 - (1 - t)^n: header boxes 3, the tab strip 6 (red), title pills 7 (`LAYERS` and `glassLayers` in `glass.js`, tested). **Never give an element inside a glass window its own `backdrop-filter`:** the window's blur makes the window the backdrop root, so an inner blur cuts a hole through the scene and fills it with its own tint (the sections read as solid charcoal until 2026-10-02). The glass mode turns the header boxes' non-glass 2px blur off for this reason.
- **Named rules:** only the rim light, red edges, shadows, and reactions: sections (`.character-tab-container`, the title on a pill because the border cut was a patch of `$bg`), cards and rows (`$cards`, for the hover), the header boxes (`$head-boxes`), and the tab strip.
- **See-through to the scene:** the window is the outer pane. With glass the window's own background is transparent and the ground is a `::before` layer at `1 - --heart-glass-clear` opacity; the window blurs what is behind it (`--heart-glass-pass`). Both come from the per-user settings `glassSeeThrough` (0 to 90) and `glassBlur` (px) through `applyGlassPass` (`glassPass` is the pure half, tested). Nothing showing through sets the blur to `none`, so a solid window costs no blur.
- **The ground on every sheet:** the same texture at 30%, solid, is every Heart sheet's background in the dark scheme, glass or not (top of `glass.sass`).
- **The ground:** book art, so the fork never ships it. `applyGlassGround` sets `--heart-glass-ground` from fvtt-heart-content when that module is active.
- **The switch in the title bar:** `HeartSheetMixin._getHeaderButtons` adds the Glass button to every sheet (Art, where present, comes first). It is grey or white from the body class.

### Startup notice, intro, and pause screen (2026-10-02 and 2026-10-03)

- **Startup notice** (`src/templates/startup.html`, rendered from `index.js` on `ready`): a short welcome, a link that opens the intro, and the changelog from the `heart.versions.*` lang keys, sorted by number, newest first and open on the current version (`common/versions.js` `compareVersions`, tested in `test/versions.test.mjs`). A new release adds its entry under `heart.versions`. Close is the outline button (still the Enter key); Don't Show This Again is the filled one.
- **Intro** (`src/applications/intro`, `HeartIntroApplication`, `game.heart.applications.HeartIntroApplication.open()`): three pages (where things are; rolling; stress and fallout) in the system's own words, never book text. It opens from the startup link and from Configure Settings (Open the Intro); a FormApplication only so the settings menu can open it.
- **Pause screen** (`src/pause/`): Foundry's clockwork becomes a slowly turning ouroboros glyph with the soft halo, in Heart's reds, and Monk's Little Details' pause glow turns deep red when that module's setting is on. Heart worlds only.

### GM Notes are the GM's alone (2026-10-21)

Adversary, landmark, and delve `system.notes` are GM Notes (`common/gm-notes.js` `GM_NOTE_FIELDS`; character, companion, bond, and party notes are player-facing). The sheet mixin drops them from a non-GM's data before enriching, owners included, and the templates gate the panel on `showGmNotes`; a non-GM below Observer gets `actors/base/limited.html` (name, picture, art banner, public description). **A new GM-facing field goes in `GM_NOTE_FIELDS`, and its panel inside `{{#if showGmNotes}}`** (`test/gm-notes.test.mjs` checks every `gm-notes-container` is gated). Foundry v12 sends every actor's data to every client, so this hides the notes from the UI, not from a console.

### Rules and helpers landed 2026-10-21 (where they live)

The pre-freeze round (the rulings and the code audit: monorepo `docs/history/heart-code-audit/`, archived; the tests and build audit is still open at `docs/plans/heart-code-audit/tests-build.md`). Each pure rule has its test file:

- **Companions as helpers** (W&M W66 assistance is the core helper die): `rolls/heart-roll/companions.js` (`companionCandidates`: the roller's bonded companions, then those bonded to other party members; the trigger text is shown and a person decides), with the character helpers from `actors/party/view.js` `helperPool`, one list for the roll prompt and Request Roll. `test/companion-helpers.test.mjs`.
- **Linked tokens:** `actors/token-defaults.js` links new character, party, and companion tokens to their actor and puts total Stress on a character's first bar; adversaries stay unlinked. `test/token-defaults.test.mjs`.
- **Adversary Resistance counts down:** `actors/adversary/resistance.js` (pure) and `resistance-sync.js` keep `system.resistanceBar = { value: left, max }` in step for a token bar. `test/adversary-resistance.test.mjs`.
- **Fallout Clear follows the pick:** `rolls/fallout-roll/results.js` `clearScope`. `test/fallout-clear.test.mjs`.
- **Haunt services and upgrades:** `items/haunt/rules.js` (payment dice, `hauntStep`) and `service.js` (asks what pays). `test/haunt-service.test.mjs`.
- **Keepsakes and trinkets** (two keepsakes, one trinket, roll or pick): `items/trinket-rules.js`, drawn by `items/trinkets.js`. `test/trinkets.test.mjs`.
- **Shared sheet helpers:** `common/tracks.js` (every track's click rule, wired only for those who may edit), `common/rich-text.js` (sheets enrich rich text, secrets for owners only; a sheet lists its fields in `_richFields`), `actors/proxy-lists.js` (an actor's items in use), `actors/drop-active.js` (folder drops), and `applications/base/traits.js` (the skills and domains windows).
- **Stress is never capped; tracks are twelve boxes** (R17's cap of 2026-10-21 reversed by Luke on 2026-10-23: "Full track rule dies right now"): `rolls/stress-roll/rules.js` `markedValue(value, amount)` marks every point, `TRACK_MAX` is 12 (`trackMax` reads a track's own max first), `trackOverflow` and `trackText` ("7 of 12", "15 (3 past 12)") feed the sheets' "+N" and the stress and restock cards; `common/tracks.js` `stressTrackHtml` is the `{{{stress-track value max}}}` helper's body. `actors/track-length.js` raises a character's or companion's max from exactly 10 to 12 (`trackLengthUpdate`): at ready on the active GM's client, every load, and in `preCreateActor` for actors made from older data (fvtt-heart-content's companions still say 10). `test/stress-steps.test.mjs`, `test/migrations.test.mjs`.

### No game text in the system (2026-09-30)

The system ships **no book content**: the classes, callings, fallouts and tags packs, `pack-data/`, `dev-utils/build-packs.js` and the 1,266 `class.*` / `calling.*` / `fallout.<severity>.*` / `tag.<slug>.*` lang keys (92% of `en.json`; the same keys in `it.json` and `pt.json`) all moved to `fvtt-heart-content`, which now carries every book in one module with deterministic ids and literal strings. Reasons: the fork can be published without RRD's prose; the two random-id-per-build packs stopped orphaning world copies; one content taxonomy instead of two. The runtime never depended on the packs by id - pickers discover packs by item TYPE (`character-options`), the roll pool recognises fallouts by NAME (raw or localized), and `localizeHeart` returns raw strings on a lookup miss, so literal names render unchanged. `src/manifest.json` `recommends` the content module and declares no packs: upstream's inherited `macros` pack (static `macros.db`) was dropped 2026-10-21, every macro in it being on the sheets and sidebar buttons. Only UI keys remain in the lang files (`heart.fallout.level.*`, `heart.ability.type.*`, the `label-*` and `core-ability.*` keys). Translations of the game text in `it.json` / `pt.json` were dropped with it; the content module is English-only by design.

## Tests

Rules tests (added 2026-09-30): vitest, node environment, 1113 tests in 61 files (2026-10-23) that run in seconds without Foundry. Since 2026-10-02 `vitest.config.mjs` stubs `.html` / `.sass` imports, so document-touching modules (rolls, bonds, party, sheets, migrations) load too, against the fakes in `test/helpers.mjs` (`fakeActor`, `fakeMessage`, `FakeRoll`, `fakeHooks`, `resetWorld`).

- **Run:** `npm test` inside this folder (`npm run test:watch` to watch), or `npm run test:heart-system` from the monorepo root. Root `npm test` (and so the Husky pre-commit hook) chains it on after the workspaces. vitest is a devDependency of the fork since 2026-10-22 (audit T12), so `npm ci` here installs it and the tests run outside the monorepo too.
- **CI and lint:** the fork's GitHub workflows (`.github/workflows/check-build.yml` on every push, `release.yml` by hand with a version) run `npm ci`, `npm test`, and the `build-all` steps. ESLint over the fork runs from the monorepo root as `npm run lint:heart` (with the toolkit and content), never in the hook.
- **Layout:** `vitest.config.mjs`; `test/setup.mjs` stubs only the Foundry globals the tested modules touch (`game.i18n` returns keys as themselves and `format` appends its data as `key{a=1}`, `game.actors` is a Map, `game.heart`, `Handlebars.escapeExpression`, `foundry.utils`, `ui.notifications`), reset before each test; `test/helpers.mjs` has fake actors and fallouts, a seeded PRNG, the highlighter's match helpers, and a copy of Foundry v12's pool keep / drop logic (`evaluatePool`).
- **Covered:** Heart roll results (normal, Difficult, Impossible; which results offer stress), the pool (`pool.js`: dice, difficulty cuts, the fresh die, helpers, mastery, missing skill / domain notes, Tired / Clouded / Furious, party fallouts, hints, knacks), kept / removed dice on the card (`markPool`), stress (die steps, passive, critical doubling, Protection per character), the character fallout thresholds and `totalStress`, Provisions (`actors/party/rules.js`, `provisionsOf`, `provisionsView`, `partyMembers`), the term highlighter (`common/terms.js`, a table of phrases plus the sentence-start rule, markup, and ability references; assertions read the highlighted text and class, never the exact tag), `rollParts` / `diceRow`, repeatable abilities, class equipment choices, the two-beat limit, and seeded randomized checks (thousands of pools and Provisions marks). Later files add bonds (`bonds*.test.mjs`), the Fallout picker, item rules, the relay and card actions, drops, the party (members, note board, decorations, API), art (zoom, toggle, gallery), glass, the lang files (`lang.test.mjs`: keys the code names exist, no dotted-key collisions, translations keep their placeholders), the sheets' small helpers (`sheet-helpers.test.mjs`), the startup changelog's version order, the stored `totalStress`, migrations, sheets and chat helpers, GM Notes (`gm-notes.test.mjs`), the 2026-10-21 rules (companion helpers, token defaults, adversary resistance, fallout Clear, haunt services, trinkets), and the map (`scrapboard-*.test.mjs`: model, hits, controls, paint, the stroke cache, notes, own cards, history, the relay's board handlers, brush, strings, sheet, cards, doodles, and the board file). File names follow the area: `test/<area>.test.mjs`.
- **Extraction pattern:** a module that imports `.html` or `.sass` (webpack-only) cannot load in vitest. Keep the rule in a small pure module beside it and import it back, with no behaviour change: `rolls/heart-roll/results.js` (result tables, `heartResult`, `markPool`), `rolls/fallout-roll/results.js` (`characterFalloutResult`), `rolls/stress-roll/rules.js` (`stepDown`, `stressDie`, `stressFormula`, `afterProtection`, `markedValue`, `trackMax`), alongside the already-pure `actors/party/rules.js`. New rules go in modules like these; test files are `test/*.test.mjs`.
- **A failing test that shows a real rules bug** is reported and left as `it.fails` with a comment, never fixed silently in the same change.

---

## Monorepo Integration

This fork is registered as a **git submodule** of the FoundryMacros monorepo (formalized 2026-06-12 during Phase 0). The submodule points at `https://github.com/lrbender01/FoundryVTT-Heart.git`.

### `.gitmodules` (at monorepo root)

```ini
[submodule "packages/fvtt-heart-system"]
    path = packages/fvtt-heart-system
    url = https://github.com/lrbender01/FoundryVTT-Heart.git
```

The directory's `.git` is a gitlink file pointing at `.git/modules/packages/fvtt-heart-system/` in the outer repo. Inner repo operations (commit, push, branch) work normally from inside the submodule.

### Why submodule (not nested-`.git`-untracked like grvntdrafter)?

The Heart fork has a real GitHub remote (`lrbender01/FoundryVTT-Heart`) that needs to stay in sync. Submodule semantics give:

- Outer repo records the exact fork commit hash (reproducible checkouts)
- Standard pattern that future maintainers will recognize
- Explicit dependency declared in `.gitmodules`

`fvtt-grvntdrafter` stays nested-but-untracked because it has no remote yet. See [ROADMAP.md](../../ROADMAP.md) Phase H item 2.

### Workflow for inner-repo changes

When editing source inside this submodule:

1. Edit `src/` (or `dev-utils/`, `static/`, etc.)
2. Rebuild dist/ with `npm run build-all` (see Build System)
3. Reload Foundry to test
4. `cd packages/fvtt-heart-system` and commit + push from inside the submodule (lands in `lrbender01/FoundryVTT-Heart`)
5. `cd ..` back to the outer repo; `git add packages/fvtt-heart-system` to bump the outer pointer; commit + push outer

### npm workspaces exclusion

The fork is **deliberately excluded** from the root `package.json` workspaces list (switched from `["packages/*"]` glob to explicit list on 2026-06-12 during Phase 0). Root devDependencies do not pollute the fork's isolated `node_modules`. Since 2026-09-30 root `npm test` does run the fork's rules tests, chained on after the workspaces (`npm run test:heart-system`); see "Tests" below.

```json
// root package.json: fvtt-heart-system NOT in this list
"workspaces": [
  "packages/fvtt-swade-toolkit",
  "packages/fvtt-mothership-toolkit",
  "packages/fvtt-mothership-content",
  "packages/fvtt-grvntdrafter",
  "packages/fvtt-playtime-tracker",
  "packages/fvtt-inventory-tracker",
  "packages/fvtt-heart-toolkit",
  "packages/fvtt-heart-content"
]
```

`fvtt-heart-toolkit` and `fvtt-heart-content` joined the list when their phases scaffolded a `package.json`; the fork is still the only Heart package outside it.

### Symlink in Foundry

The symlink target is the **`dist/` subdirectory**, NOT the package root. Webpack emits hash-named auxiliary assets at the dist root and `heart.js` references them via relative paths; linking the package root would break asset resolution.

Run from **elevated PowerShell** (Developer Mode alone is NOT sufficient for `New-Item -ItemType SymbolicLink` on Windows 10):

```powershell
$linkPath = "$env:LOCALAPPDATA\FoundryVTT\Data\systems\heart"
$targetPath = "C:\Users\lrben\Desktop\Personal Projects\FoundryMacros\packages\fvtt-heart-system\dist"

# Remove existing (Foundry must be closed)
if (Test-Path $linkPath) { Remove-Item $linkPath -Recurse -Force }

# Create symlink
New-Item -ItemType SymbolicLink -Path $linkPath -Target $targetPath
```

If you can't run elevated PowerShell, the `Junction` alternative works without admin (same-volume only, directories only):

```powershell
New-Item -ItemType Junction -Path $linkPath -Target $targetPath
```

Foundry treats junctions and symlinks identically for system loading.

After symlinking, edits to `src/` files are picked up by Foundry on world reload (after rebuilding `dist/`).

---

## Upstream Sync Strategy

**Do not expect automatic cherry-picks from upstream.** The v12 `main` branch is frozen. The active upstream work is on `new-magic` (v13 rewrite).

If upstream ships a critical v12 patch:

1. Evaluate whether it applies to the fork's current state
2. Manual cherry-pick if applicable; resolve conflicts file-by-file
3. Document in CHANGELOG.md
4. Build + verify in Foundry
5. Push to `lrbender01/FoundryVTT-Heart`

For now: treat the fork as a personal branch. No automatic sync. The `lavaeolous` remote stays configured in case future PRs land there worth pulling in.

---

## Ancestry item type (added 2026-08-24)

Registered the `ancestry` item type that upstream half-built (`parseAncestries` in build-packs.js and the character proxy `ancestry` getter existed; the type itself didn't). No book text in any of this - safe to push to the public fork. Consumed by `fvtt-heart-content`'s core-items pack.

- **Type**: `src/items/ancestry/{template.json,sheet.js,sheet.html}` - has_description only, monument.svg icon, base-sheet partial (renders the standard name + description-editor item sheet). `Item.types` picks it up automatically via build-template's key derivation - a stale `dist/template.json` means the type doesn't exist and ancestry items neither render nor drop; ALWAYS run the full build pipeline.
- **Proxy fix**: `src/actors/character/proxy.js` ancestry getter used `actor.find` (upstream bug; always undefined) - now `actor.items.find`.
- **Header slot (full class/calling parity)**: `src/actors/character/sheet.html` identity container Row 2 renders an item slot (name + eye/trash icons, `.ancestry-content` in character.sass) when an ancestry item is attached; when empty (owner view), a placeholder prompt + "+" button. The "+" opens the Choose window (`applications/character-options`, every Item compendium providing the type, searchable; the older `open-type-compendium` action was removed 2026-10-21) - so the fork never hardcodes a content-module pack id, and any module providing ancestry items works. If `system.ancestry` holds legacy typed text with no item, the text shows in the slot. The free-text input was removed from the template (its `.ancestry-input` rule was deleted in the 2026-10-02 dead-CSS cleanup). `sheet.js` getData supplies `ancestryItem`.
- **Sync hooks** in `src/index.js`: `createItem` keeps at most one ancestry item per character (new replaces old, mirroring class/calling) and mirrors the item name into `system.ancestry`; `deleteItem` clears the field on genuine removal (not during replace-on-drop).
- **Lang**: `heart.ancestry.label-single/-multiple` in en/es/it/pt.

## Phase 2 System Polish

Closes known gaps from PR #94, plus quality-of-life improvements discovered during Phase 0.

### From PR #94

1. ~~**Style the management popups**~~ Done (see Known Issues).
2. ~~**Replace "Skills Temp" tab**~~ Done: labelled "Skills & Domains".
3. ~~**Fix knack overflow**~~ Done: knack labels wrap.
4. ~~**Complete i18n**~~ Done 2026-10-21: the rest of the hardcoded English (setting names and hints, adversary difficulty, domain placeholders, "New ...", the class effects) went to `heart.*` keys in `static/lang/en.json`. See the i18n working rule under Design language for the checks.
5. ~~**Add `totalStress` stored field**~~ Done 2026-10-21: `system.totalStress` is a stored `{ value, max }` on characters (template default max 60 since 2026-10-23: five twelve-box tracks; the value is the plain sum, never capped), so it can be a token bar. `actors/character/total-stress.js` is the pure rule (`STRESS_TRACKS`, `sumStress`; tested in `test/total-stress.test.mjs`); `total-stress-sync.js` adds the total to the same write as the tracks (`preCreateActor`, `preUpdateActor`), so nothing loops. `actor.proxy.totalStress` still sums the tracks live.

### From Phase 0 discoveries

6. ~~**Add Windows-compatible `build-local` Node replacement.**~~ ✓ Done 2026-08-24 - `dev-utils/empty-dist.js` + `dev-utils/copy-static.js`, `build-all` script, `relink` dropped. See §Build System.
7. ~~**Investigate `static/packs/macros.db` content.**~~ Superseded 2026-10-21: upstream's macros pack was dropped, not regenerated.

### Theming (2026-09-29) - read before touching any colour

- **Never write a literal colour in a stylesheet.** Use the roles in `src/util.sass` (`$bg`, `$surface`, `$sunken`, `$line`, `$text`, `$muted`, `$red-deep`, `$red-mid`, `$red-bright`, `$on-red`, `$mark-empty`, `$mark-on`, `$disabled`, `$header-fg`, `$header-field-bg`). Their values live ONLY in `src/theme.sass` (`:root` = Dark default, `:root[data-heart-scheme="light"]` = Light). The few colours that are the same in both schemes (halos over art, the art viewer's chrome, the title bar's Art and Glass buttons, the glass palette) are named roles too since 2026-10-21 (`$halo`, `$art-*`, `$title-btn-on` / `-off`, `$glass-*`; black, white, and the reds as channels, `$ink`, `$paper`, `$red-*-rgb`, for an alpha: `rgba(util.$ink, 0.55)`), so the rule has no exceptions.
- **Red tiers have jobs:** deep = fills with `$on-red` text; mid = borders/dividers (never text: ~1.8:1 on charcoal); bright = every piece of red text. Marks: `$mark-empty` grey when empty, `$mark-on` when marked.
- **The character header is fixed-dark art** in both schemes, so header text/borders use `$header-fg`, not `$text`.
- **Scheme switch:** client setting `heart.colourScheme`, registered at `init` in `src/index.js`, mirrored to `document.documentElement.dataset.heartScheme`. CSS variables make it live.
- **Foundry core in dark mode:** `theme.sass` swaps the parchment background and re-points core `--color-text-dark-*` / `--color-border-light-*` variables inside `.window-app .window-content` and `.chat-message` only. Core-component restyles are wrapped in `:where(...)` so they carry element-level specificity and never outrank a Heart or module class rule. If a module's window looks wrong in dark mode, the fix is a scoped rule in `theme.sass`, not a change to the tokens.
- `mask:`/`mask-image:` gradients that mention `black` are alpha masks, not colours; leave them.

### Design language (2026-09-29) - follow this for any new or changed interface

Distilled from the character, adversary, landmark and delve sheets and applied system-wide in the "Heart Interface Sweep" (mockups approved by Luke). Review status lives in `docs/plans/heart-ui-review.md` (monorepo root).

- **Working rules for any UI work.**
  - **Mock first, then build:** a new or changed surface goes to Luke as an interactive mock with options before any template is written; he picks, then it is built. Ask him about any design decision not settled here.
  - **Read first:** this file, the monorepo's `docs/foundry-gotchas.md`, and the `gotcha-preflight` skill.
  - **Foundry v12, AppV1:** the `Dialog` v1 API only (`heartDialogOptions`).
  - **i18n:** every string goes in `static/lang/en.json` as a flat `heart.*` key; never add a sub-key under a key that holds a string. Since 2026-10-21 two checks catch a nesting collision here: the monorepo's `npm run lint:i18n` (it walks `static/lang/` too, so the pre-commit hook runs it) and `test/lang.test.mjs` (which also checks that every key the code names exists).
  - **Writing:** no em dashes, and the Oxford comma, in UI strings and comments.
  - **Builds:** `npm run build-all` here, or `npm run build:heart` from the monorepo root with Foundry at the Setup screen. Never a partial build (webpack wipes `dist/`).
  - **Tests:** pure helpers go in a `rules.js` / `view.js` beside the code, with vitest tests (see Tests).
  - **No commits:** never `git add` or `git commit`; Luke owns git.

- **Chrome.** Actor sheets: torn header strip (`.character-header`, texture + `header_nav.svg` mask) with white-bordered header boxes, then the red tab strip (`.character-nav-tabs`). Item sheets: the compact version in `items/base/sheet.html` (icon, name, type line, stat chips), same tab strip. Never a plain white/parchment top.
- **Sections are titled containers** (`.character-tab-container` + `.container-title` + `.container-content`): mid-red border, title centred on the border line in text colour (NOT red - Luke found red titles hard to read), surface-coloured body. No lines under text anywhere; separators only where they separate items (thin red lines between questions, mid-red rule under a description that has questions after it).
- **Density.** Same font sizes, little whitespace: rows are compact recessed cards (`.item.preview`), two columns where content allows (narrow "use it" column + wide "run it" column). Long prose may go on a secondary tab (adversary / landmark Lore), but a sheet with little content stays one page (delve: no tabs, the strip is a static red banner). Simple item sheets size to their content (`height: 'auto'`).
- **Type: five styles, tokens only** (2026-09-29, "Heart Type System" mock, Roomy scale). `util.sass` defines the families and sizes and mixins `text-display` (Mosherif 32: names, banners), `text-section` (Mosherif 28: container titles, tabs, header field labels, chat outcome words), `text-label` (Alegreya SC 14, lowercase text rendered as small caps, one letter-spacing: "pick one", type lines, requirement / profile labels), `text-body` (Alegreya 17: everything you read; the root size of every Heart sheet and dialog), `text-secondary` (Alegreya italic 15, muted: knacks, hints, placeholders, empty states), plus `text-chip` (`$font-chip` at 19: every choice chip and button). Never write a literal `font-family` or `font-size` for text; icons may keep pixel sizes. Small fixed text outside the five styles uses the named sizes `$fs-caption` (12: captions and labels over art, the "!" badges), `$fs-small` (13: a knack label, the art viewer caption), and `$fs-pause` (24: "Game Paused") (2026-10-21). Italic means secondary text or a player's answer, nothing else. Alegreya / Alegreya SC are bundled in `src/fonts/alegreya/` (OFL) with real 400/500/700 and italic weights. Window title bars stay in Foundry's font.
- **Header chips** (item sheets): larger (32px, 19px Mosherif labels), placed at the left right after the name, stacked two rows high (tier + Active, skill + domain, severity + resistance). Pluses after titles are small (`.panel-add` 15px icon; the character sheet's Mosherif `.addItem` 30px), never title-sized.
- **Red means something.** Bright red = rollable or game terms, marked states, bad outcomes. Deep red = fills (tab strip, primary buttons, speaker bars, "on" chips). Mid red = borders only. Game terms (`common/terms.js`, capitalisation-sensitive except dice): skills, domains, resistances, "Minor/Major/Critical [resistance] fallout", Protection, tag names, die sizes (d4-d20). New tags must be added to its `TAGS` list. Templates use `{{{heartTerms ...}}}`; rendered editor content uses `highlightRendered(root, selector)` in `activateListeners` (item chrome and panel sheets already call it).
- **Marks.** Every track/checkbox: grey outline when empty, bright red when marked; click the last marked box again to clear it; groups of five, rows of ten. Three sizes only (2026-10-02, `util.sass`): `$mark-md` (12px) for every track, `$mark-sm` (10px) for inline readouts (a character's Provisions row, a bond's pool, checkboxes), `$shield` (13px) for Protection; `$mark-gap` 2px, `$mark-group-gap` 5px. Use `@include util.mark-size(...)`, never a pixel size. **Resistance tracks are the exception since 2026-10-23 (Luke):** twelve boxes in the room ten had (character and companion sheets, `.resistance-stress.stress-track` in `character.sass`): `$mark-sm` squares, `$mark-gap-long` 1px, `$mark-group-gap-long` 4px (groups 5, 5, 2), the shields beside them shrunk to the same 12px, and a bright red "+N" after the last box for stress past it.
- **Buttons and chips: five designs** (2026-10-02, Luke's values from the "Heart Style Unification" mock, https://claude.ai/artifact/FEcgAcvSjGPi3gM7F7bepg). Every control uses a `util.sass` mixin, never its own size, padding, radius, or hover:
  - `choice-chip` (+ `choice-chip-on`, `choice-chip-compact` for the chat column and the picker's filters): a pick in a dialog, prompt, or picker.
  - `action-chip` (+ `-on`, `-done`, `-cta`): a small action on a row (Activate, Finish, Learn, die choices); a call to action (Volunteer, Roll keepsake) is filled.
  - `button-primary` / `button-secondary` (`(true)` for the small size in chat cards and the editor): the action filled, backing out an outline.
  - `info-chip`: a fact, not a control (domain chips, header chips, a bond's kind).
  - One `$radius` (5px) and one hover everywhere, `hover-outline`: the border brightens to `$red-bright` (the one place bright red is a border).
- **Header labels:** one size on every sheet, `$header-label-fs` (25px Mosherif); the character header's Roll / Stress / Fallout buttons keep 23px.
- **Controls.** Choices are chips (hidden radio/checkbox + styled span) or segmented sets, not dropdowns, in dialogs. Editing: pencil in a panel title opens that panel's editor (`data-action=edit-editor`; Foundry's floating button hidden); small structured fields use an edit toggle (pencil <-> check, staying on the field's line); question answers use a small pencil right after the question (`data-action=edit-answer`) and open a tall editor. Buttons say what they do ("Clear Mind stress", "Send to chat", "Roll as Vess"), never Yes/No.
- **Rolls** (2026-09-30): the action roll's rules live in ONE module, `rolls/heart-roll/pool.js` (pool, Tired / Clouded / Furious, helper eligibility, difficulty cut, fresh die, Impossible, formula); the prompt (`applications/heart-roll`) previews with it and `HeartRoll._build` rolls with it. Stress stakes are picked after the roll (StressRoll: roller + helpers, per-character Protection and fallout). Chained dice go through `rolls/dice.js` (Dice So Nice first, dice sound fallback). Rules source: `reference/heart-rules/` (monorepo root).
- **Shared code to reuse:** `common/panel-sheet.js/.sass` (actor panel sheets: tabs, tracks, editors, edit toggle, die roll), `items/base/*` (item chrome, description/tags panels), `common/terms.js` (term highlighting), chip styles in `applications/application.sass`, roll card styles in `chat-messages/chat-message.sass`.

### Landed 2026-09-29 (content-driven sheet work)

- **Generic `item` type** (`src/items/item/`): `has_description` + `quantity`. Base sheet plus a quantity field; preview row shows `xN` when quantity > 1. Character sheet gained an "Items" container (Character tab, under Resources) listing `actor.itemTypes.item`. `_onDropItemCreate` stacks same-name generic items by bumping quantity and does NOT set `active` on them (they have no such field, so they never appear in the Inactive Items box).
- **Ancestry questions**: `src/items/ancestry/template.json` now has `questions: {}`; the sheet is a real class (add/delete-question listeners copied from calling). Biography tab renders Ancestry (with answer editors) and Class blocks above Calling using shared `.bio-description` / `.bio-items` styles in `character.sass`. fvtt-heart-content's `expandAncestry` emits the questions map (same shape as callings).
- **Content-link fix** (`src/chat-messages/index.js`): `HeartTextEditor._createContentLink` resolves `@UUID`, `@Compendium` and `@Item` via `fromUuid`, renders Item previews when a `heart:items/<type>/preview.html` partial exists, and otherwise defers to Foundry. The upstream WIP threw on `@UUID` links, which is what compendium-linked RollTable results emit.

### Maintenance

8. **Maintain CHANGELOG.md**: see [packages/fvtt-heart-system/CHANGELOG.md](CHANGELOG.md).
9. **Track upstream patches**: quarterly review of `hitcherland/main` for any v12 fixes worth pulling. Realistic expectation: zero per year.

---

## Per-File Notes

### Key upstream references

- **System manifest source:** `src/manifest.json` (merged with `foundryvtt.config.js` by `build-manifest` → `dist/system.json`)
- **System config:** `foundryvtt.config.js`: owns the system ID, title, description, compatibility, author list. Edit here to change foundational metadata.
- **Character sheet:** `src/actors/character/sheet.html` + `sheet.js` + `character.sass` + `proxy.js` (`totalStress` summed live; the stored copy is `total-stress.js`)
- **Character template:** `src/actors/character/template.json` (stored fields: ancestry and pronouns from PR #94, `totalStress` since 2026-10-21)
- **Settings registry:** `src/index.js` (PR #94 added `showTotalStress`, `showStressInputBox`, `preSelectStressType`; the last two, and `showTextboxesBelowItems`, were removed 2026-09-30 as nothing read them). The map's settings register beside their code: `boardHands` and `boardDetail` in `map/scrapboard/notes.js`, `boardToolbar` and `boardToolbarDir` in `rail.js`; its keybindings in `map/index.js`; the Open the Intro menu in `applications/intro/application.js`.
- **Rolls:** `src/rolls/`: `HeartRoll`, `StressRoll`, `FalloutRoll`, `ItemRoll`. Exposed as `game.heart.rolls.<Class>` after `ready`.
- **Chat messages:** `src/chat-messages/index.js` (PR #94 fixed rolltable compendium resolution here)
- **Items:** `src/items/`: 12 item types (ability, ancestry, beat, bond, calling, class, equipment, fallout, haunt, item, resource, tag), plus `base/` (the shared templates and item sheet chrome, not a type)
- **Pack data:** none since 2026-09-30 - all game content is authored in `packages/fvtt-heart-content/content/`

### Build pipeline files (`dev-utils/`)

- `build-manifest.js`: Generates `dist/system.json`
- `build-template.js`: Merges actor/item templates
- `templates-loader.js`: Webpack loader for `.html`/`.handlebars` templates
- `common.js`: `mergeDeep` helper used by `build-template.js`

---

## Known Issues & Deferred Work

### From PR #94 (Phase 2 closes)

- ~~"Skills Temp" tab placeholder label~~ Resolved: the tab reads "Skills & Domains" (`heart.character.tab-skills-and-domains`; the internal `data-tab="skills-temp"` id is unchanged).
- ~~Management popups unstyled~~ Resolved: Edit Skills / Edit Domains are styled Heart windows (`applications/application.sass`: titled sections with glyphs, ticks, knack boxes).
- ~~Incomplete i18n~~ Resolved 2026-10-21 (Phase 2 item 4).
- ~~Knack text overflow~~ Resolved: knack labels wrap (`.knack-label`, `overflow-wrap: break-word`, in `character.sass`).

### From Phase 0 (2026-06-12)

- ~~**`build-local` script is Unix-only**~~ Resolved 2026-08-24: Node-based `build-all` pipeline (see §Build System); `relink` dropped.
- **`heart.css` does not exist as a separate file.** Webpack `style-loader` injects CSS at runtime via JS. The original `package.json` `copy-static` script's comment about copying `heart.css` was vestigial; the actual artifact is just `heart.js` plus auxiliary assets.
- ~~**macros.db legacy NeDB pack**~~ Superseded: dropped 2026-10-21.
- ~~**Nested `<form>` in the Biography calling block**~~ Resolved 2026-09-29: converted to a `<div>` during the sheet density pass.
- **`build-template` "key already defined" warnings** - `dev-utils/common.js` `mergeDeep` warns on every shared key (each template file adds under the same top-level `Item`/`Actor`), so the log is a wall of false positives. A real collision would be a repeated TYPE name. Harmless; tighten the warning to type-level if it ever hides something.
- **Sheet header geometry** - header/nav heights, overlap and row sizes are SASS variables at the top of `src/actors/character/character.sass` (2026-09-29). They are coupled to `static/assets/ui/header_nav.svg`, whose torn edge sits at ~87-91% of strip height; change them together.
- **Some templates use CRLF line endings** - scripted edits must match `\r\n` (or regex) or they silently miss. As of 2026-10-22 the character `sheet.html` is LF, but about ten templates are still CRLF (`templates/startup.html`, `applications/base/application.html`, several `items/*/sheet.html` and `preview.html`, `rolls/heart-roll/tooltip.html`); the fork has no `.gitattributes`.
- ~~**CLAUDE.md in this directory is untracked**~~ Resolved: it is tracked in the fork's own repo (it IS the fork's architecture doc).

### Open from the 2026-10-21 code audit

The audits are archived in monorepo `docs/history/heart-code-audit/`; these are what they left open:

- **R21, in part:** the party sheet's `MARK_DICE` (`actors/party/sheet.js`) and `game.heart.die_sizes` (`src/index.js`) still keep their own die lists; the item roll and `bonds/bonds.js` share the one ladder. (`rolls-relay.md` R21)
- **R26:** any party update, each note-board edit included, still redraws every open character sheet; redraw only when `system.provisions`, `system.quartermaster`, `system.members`, or `name` changes. (`rolls-relay.md` R26)
- **R28, last item:** `fallout-picker/picker.js` `apply()` is untested (its four branches: a bond item, a companion's own Fallout, a pack entry copied, a written one). (`rolls-relay.md` R28)
- **S40:** the nested-children document model (`items/index.js` `HeartItem`) has no tests; a fake `Item` base class would let node test it. (`sheets-items.md` S40)
- **S41:** the document hooks in `index.js` (class portrait, ancestry sync, class delete resets, `translateKeyName`) are untested; extract the decisions into a pure `actors/character/identity-sync.js` and test those. (`sheets-items.md` S41)

### Parked until after session zero (2026-10-22)

Unbuilt freeze lines (monorepo `docs/plans/heart-freeze-decisions.md`). Luke: "I don't want to FORGET about them... but now is not the time." Reactivation: after session zero, Luke's call.

- **S7, Combine Fallouts button:** two Minors into a Major, two Majors into a Critical (the "Combine offer" idea below is its picker form).
- **S9, a ledger card for the landmark's Stress die:** it still posts Foundry's plain card (UI review F15).
- **M8, map GM notes hidden from the start:** new GM notes are visible to players at once.

### Deferred ideas: fallout from the roll card

The Fallout picker shipped with the bonds work (2026-10-01); three ideas from its plan are unbuilt:

- **Random:** a button in the picker that draws one Fallout from the filtered list (table ruling 12 says the GM picks, so it may never be wanted).
- **Combine offer:** when the target already has a Fallout of the same severity, offer Combine into Major or into Critical (GM-only, naming the player; Critical warns that it ends the character).
- **Adversary and landmark Fallouts first:** list the source's own Fallouts at the top of the picker, which needs the stakes picker to record what the stress came from.

### No plans for

- **v13 migration**: upstream is on v13; v12 fork stays on v12. Decided 2026-05-22 (project-wide); revisit only on explicit decision.
- **More socket use than the GM relay** - the relay (2026-10-02) exists only to make racing writes single-writer; ordinary syncing stays Foundry's document sync.
- **Complete system redesign**: toolkit works within upstream constraints.
- **Publishing the fork**: Tier 4 in [docs/publishing.md](../../docs/publishing.md). Requires (1) RRD third-party creator license verification, (2) attribution to hitcherland + Lavaeolous, (3) explicit "not officially-blessed continuation" framing.

---

## Links

- **Heart index (which doc owns what):** [HEART.md](../../HEART.md)
- **Original integration plan (archived):** [docs/history/heart-integration.md](../../docs/history/heart-integration.md)
- **Upstream repo:** https://github.com/hitcherland/FoundryVTT-Heart
- **Upstream PR #94:** https://github.com/hitcherland/FoundryVTT-Heart/pull/94
- **Lavaeolous fork:** https://github.com/Lavaeolous/FoundryVTT-Heart
- **Our fork:** https://github.com/lrbender01/FoundryVTT-Heart
- **Toolkit:** [packages/fvtt-heart-toolkit/](../fvtt-heart-toolkit/) (Party Stress Panel; roadmap in its `docs/roadmap.md`)
- **Content:** [packages/fvtt-heart-content/](../fvtt-heart-content/) (all game text and book art; roadmap in its `docs/roadmap.md`)
- **UI review checklist:** [docs/plans/heart-ui-review.md](../../docs/plans/heart-ui-review.md)
