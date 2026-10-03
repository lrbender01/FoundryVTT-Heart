# fvtt-heart-system — Personal Fork of Heart: The City Beneath

**Status:** Phase 0 ✓ Done 2026-06-12. PR #94 cherry-picked via fast-forward merge. System runs in Foundry; all 9 verification tests passed. Phase 2 polish work documented below. Since then (2026-09-29 to 2026-10-02): the Heart interface sweep, Provisions and the party sheet, bonds and companions, the Fallout picker, and book art, all built and launched; not yet systematically reviewed (`docs/plans/heart-ui-review.md` in the monorepo) or played.

**Fork source:** https://github.com/hitcherland/FoundryVTT-Heart → https://github.com/lrbender01/FoundryVTT-Heart (personal fork)

**System ID:** `heart` (never change; upstream hardcoded)

**System version (our fork):** `0.10.5-pr94` — patch bump over upstream `0.10.4`, identifying the PR #94 cherry-pick.

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

## What Was Cherry-Picked from PR #94

PR #94 (`Lavaeolous/FoundryVTT-Heart`, branch `feature-character-sheet`) — opened 2025-04-01, open/unmerged on upstream.

### Phase 0 finding: bug fixes are NOT separable from the sheet redesign

The original Heart integration plan claimed "4 separable bug fixes that can be cherry-picked individually first, then the sheet redesign." Phase 0 audit found this was wrong. The actual structure of PR #94:

| Commit    | Date       | Description                                                                                     | Bug-fix content embedded                                               |
| --------- | ---------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `7901f50` | 2025-03-09 | WIP Header (sheet redesign start)                                                               | —                                                                      |
| `4faa2c6` | 2025-03-11 | Header (refined; deletes backup files)                                                          | **`totalStress` proxy property** + **ancestry/pronouns** template.json |
| `d5b799a` | 2025-03-16 | WIP Everything but Skills/Knacks/Domains                                                        | Possibly the drag/drop fix (sheet.js touched)                          |
| `33e542d` | 2025-03-16 | More WIP (sass tweaks)                                                                          | —                                                                      |
| `9a38260` | 2025-03-22 | only skills and domains remain                                                                  | —                                                                      |
| `8601bd7` | 2025-03-23 | More WIP (chat-messages)                                                                        | —                                                                      |
| `b103269` | 2025-03-30 | WIP Skills and Domains                                                                          | **Rolltable compendium resolution** (`chat-messages/index.js`)         |
| `247ced9` | 2025-04-01 | v1 of the new char sheet (final)                                                                | Possibly the drag/drop nested-item fix (sheet.js + dialogs added)      |
| `b30920f` | 2025-04-05 | Fix for error when creating tokens in Firefox (standalone — touches only `static/assets/*.svg`) | **Firefox SVG token crash** fix                                        |

Only `b30920f` is genuinely separable. The other 3 "bug fixes" the briefing claimed (drag/drop, rolltable, `totalStress` proxy) are embedded inside the sheet-redesign commits.

### How we applied it

The merge-base of our fork HEAD (`29a21146` / tag `0.10.4`) and `lavaeolous/feature-character-sheet` is our HEAD itself — Lavaeolous branched directly from upstream's `0.10.4`. So all 9 commits applied with ZERO conflicts via:

```sh
git merge --ff-only lavaeolous/feature-character-sheet
```

Single command, atomic, preserves original commit hashes + Lavaeolous's authorship. HEAD moved from `29a21146` to `b30920f`; branch ahead of `origin/main` by 9 commits and ready to push to `lrbender01/FoundryVTT-Heart`.

### Functional content added

1. **Three-tab character sheet** — Character / Biography / Skills Temp. Two-column body layout, inlayed container labels, Mosherif display font, shield-icon protection checkboxes, shaped header with SVG mask.
2. **Click-to-roll** — resistance checkboxes, skill rows, domain rows all clickable.
3. **Floating management dialogs** — `SkillsManagementApplication`, `DomainsManagementApplication`.
4. **Drag/drop nested item crash fix** — old `dataset.itemId` crashed for class/calling children (UUIDs contain `@`). Now uses `fromUuid()`.
5. **Rolltable compendium resolution** — old code only found world rolltables. Now finds both world and compendium.
6. **Firefox SVG token crash fix** — non-character tokens crashed in Firefox due to SVG mask. SVG handling fixed.
7. **`totalStress` proxy property** (`src/actors/character/proxy.js`) — computed as sum of all 5 `resistance.<X>.value` fields. Phase 2 work makes it a stored field for token-bar registration.
8. **Data model additions** — `ancestry: ""`, `pronouns: ""` fields in `src/actors/character/template.json`.
9. **New client settings** — `showTotalStress`, `showStressInputBox`, `preSelectStressType` (Boolean toggles).

### Known gaps from PR #94 (Phase 2 closes)

- "Skills Temp" tab is a placeholder label
- `SkillsManagementApplication` and `DomainsManagementApplication` are functional but unstyled
- Localization incomplete (hardcoded English in new code)
- Knack text overflow unhandled

---

## Build System

Heart uses **webpack + sass** (the modern pure-JS sass, NOT node-sass — briefing was wrong about that). Source in `src/`; build outputs to `dist/`.

### Available scripts (`package.json`)

| Script           | What it does                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `build-prod`     | `webpack --mode production`. Emits minified `dist/heart.js` + hash-named auxiliary assets (`xxxxxxxx.ttf` etc.). **Use this for builds.** |
| `build-code`     | `webpack --mode development`. Unminified dev bundle.                                                                                      |
| `build-manifest` | `node dev-utils/build-manifest.js <version>`. Generates `dist/system.json` from `src/manifest.json` + `foundryvtt.config.js`.             |
| `build-template` | `node dev-utils/build-template.js`. Merges all `src/**/template.json` into `dist/template.json`.                                          |
| `build-all`      | **Full pipeline, cross-platform (2026-08-24).** empty-dist → build-prod → build-manifest (version hardcoded here; bump on release) → build-template → copy-static. Use this. (`build-packs` was removed 2026-09-30 with the content packs; see "No game text in the system".)  |
| `build-local`    | Alias for `build-all` (kept for muscle memory). The old Unix-only version + the hardcoded-path `relink` script were removed 2026-08-24.    |

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
| `dist/packs/macros.db`           | Legacy NeDB compendium pack (single file). Pre-built; copied from `static/packs/macros.db`.                                    |
| `dist/lang/{en,es,it,pt}.json`   | i18n translation files. Copied from `static/lang/`.                                                                            |
| `dist/assets/...`                | UI assets (header SVGs, dice icons, fonts beyond the webpack-hashed ones). Copied from `static/assets/`.                       |
| `dist/assets/icons/<kind>/`      | Skill / domain / resistance glyphs (game-icons.net, CC BY 3.0, `static/assets/icons/CREDITS.md`). Added 2026-09-30; drawn through `common/icons.js` (`{{{heartGlyph kind id}}}`, tinted by a CSS mask). |
| `dist/LICENSE`                   | ISC license from upstream.                                                                                                     |

### Party actor and Provisions (2026-09-30)

A house rule (monorepo `reference/heart-rules/provisions.md`; as-built notes and the UI handoff in `docs/plans/heart-provisions.md`). `src/actors/party/`: a singleton Actor type `party` holding the world's one Provisions track (`system.provisions { value, max: 20 }`, `system.quartermaster`, `system.notes`); `rules.js` is the pure arithmetic (thresholds, restock sizes, protection), `party.js` the API and singleton hooks, `proxy.js` the derived data, `sheet.*` the party sheet (built 2026-09-30, `view.js` its shared display data; since grown Party Items, Pursued Beats, Companions, and the quartermaster Volunteer / Resign buttons). An actor rather than a world setting so players can mark it from their own stress cards (settings are GM-write only). Since 2026-10-02 every Provisions write goes through the GM relay (`applyProvisions`; see "GM relay" below). `game.heart.resistances` stays the five personal tracks; `game.heart.stress_targets` adds `provisions` for the stress picker. Party art (2026-10-02, monorepo `docs/plans/heart-party-art.md`): `PartySheet` is a `BannerSheet`. Its banner and decorations come from the content module's `assets/art/party/party-art.json` (the Heart Party Sheet Art tool's export), read once by `actors/party/art.js` (`common/decor-file.js`). The decorations are shared code since 2026-10-02 (the character sheet has them too; Heart Character Sheet Art tool, `assets/art/character/character-art.json`, `actors/character/decor.js`): `common/decor.js` is the pure maths (`normalizeDecorArt`, `decorLayout`, `decorUV`; tested in `test/decor.test.mjs` and `test/party-decor.test.mjs`), and `common/decor-dom.js` `SheetDecor` places the images, keeps them placed (a ResizeObserver; a box on a hidden tab has no rect, so its pieces wait), plays hover (lift by default), and opens the sheet's gallery at a clicked piece when nothing clickable or opaque is in the way and the pixel isn't transparent. The behind layer and section pieces sit at `z-index: -1` in an isolated form or section (`common/decor.sass`), so sheets' own z-indexes are untouched. Party sections carry `data-anchor` (`members`, `companions`, `fallouts`, `provisions`, `items`, `notes`, `beats`, plus `header` and `sheet`); the character sheet's are listed in `CHARACTER_ANCHORS` (a test checks each appears once in the templates). `getData` is async: it awaits the art. The Notes section is a note board (2026-10-02): `system.board` is an object keyed by note id (`{ title, text, sort }`, `board.js`, tested), so concurrent writers touch different keys; each note opens in `note-window.js` (a FormApplication: title field plus Heart's editor, whose Cancel closes the window); the GM moves the old `system.notes` text onto the board once on ready. `StressRoll._takePartyStress` applies a Provisions mark once to the party; `FalloutRoll` has a party branch (`options.party`, `critical-fallout`, `notRolled`). `activeFallouts(character)` includes the party's fallouts.

### The Heart map (2026-10-02)

A point-crawl map scene drawn as a descent (monorepo `docs/plans/heart-map.md`). `src/map/`:
- `model.js` is the pure half: the layout plus a scene's state, what the GM and players see, the seeded ink geometry, and hit tests. It is tested in `test/map-model.test.mjs`, and the Heart Map tuner inlines it, so keep it free of Foundry globals.
- `layout.js` reads fvtt-heart-content's `assets/art/map/heart-map.json` once.
- `api.js` holds the scene state (`flags.heart.map`) and the GM's edits.
- `render.js` draws one PIXI container into `canvas.primary` at sortLayer 100 (above the background, below tiles and tokens).
- `layer.js` is `HeartMapLayer`, an InteractionLayer in the interface group registered as `canvas.heartMap`, with the Heart Map scene control shown on map scenes only.
- `index.js` holds the hooks: redraw on `flags.heart` and on landmark or delve actor changes, the landmark drop, and the Scenes sidebar button. `game.heart.map` is the API.

The map's colours are the book's ink and paper (a fixed art piece, like the header art), not theme roles. Compile-check map code with webpack `--output-path` into a scratch folder, never into `dist/` (`output.clean` wipes it, and Foundry may hold a lock on `dist/packs`).

### Bonds, hirelings, and animals (2026-10-01)

The bond rules of HCB p. 102 and W&M W65-W67, split as Luke decided and pared down to what the rules need (2026-10-01): the **bond is the relationship**, a `bond` Item on the character (`items/bond/`: `system.target` = the bonded actor's uuid, optional for a person; a name and portrait for when there is none; notes; for a person bond a Stress pool and its own Fallout in nested `system.children`). Its kind is **person** or **companion** and follows the bonded actor (`bondKindFor`: a `hireling` actor makes it a companion; the stored `system.kind` is only a fallback once the actor is gone; older "hireling" / "animal" read as companion). The **companion is its own actor**, type `hireling`, for hirelings and animals alike (the book gives them the same rules; no kind field): five `resistances` tracks with Protection, cost, descriptors, description, examples, notes, and items (ability items, equipment, resources, and its book Fallouts as a menu switched off; one switched on is taken). `actor.proxy.totalStress` / `employers`. Logic in `src/bonds/`: pure rules in `rules.js` (tested, `test/bonds.test.mjs`), document actions and chat cards in `bonds.js` (`game.heart.bonds`), hooks (three bonds max, characters only, redraws) registered from `index.js`. A full list refuses new bonds until one is removed; there is no replacing (2026-10-02). Every transfer onto a bond runs the GM's Fallout check (`bondFalloutResult`, the delver thresholds, never Critical); on a Minor or Major the card carries the GM-only Pick Fallout button (nothing is recorded automatically, and Stress is always cleared by hand). A Critical removes the bond (HCB p. 102): no broken state. `addBond` and `hire` are GM-only; `hire` imports a fresh world copy of a compendium companion (book name kept in `flags.heart.role`, book Fallouts switched off, a legacy `system.ability` turned into an item) and, when the player runs it, grants the character's players ownership. Fallouts may hit `bond` (`game.heart.fallout_resistances`). The ledger card builder lives in `common/ledger.js` (shared with the party). The UI plan and decisions: `docs/plans/heart-bonds-ui.md` in the monorepo.

**The UI (2026-10-01, Luke's picks from the Heart Bonds Mock).** Display data is pure and tested: `bonds/view.js` (`bondRowView`, `bondActions` (the lean button set), `poolMarks`, `trackSummary`, `takenFallouts`, `companionCards`; `test/bonds-view.test.mjs`). Partials `heart:bonds/section.html` / `row.html` / `chips.html` draw the character sheet's Bonds section (Character tab, above Inactive Items; `_activateBondListeners` in `actors/character/sheet.js` maps each `data-action` to `game.heart.bonds` or the ordinary Stress / Fallout rolls for a companion; the GM clicks a pool's marks, `setBondStress`). `bonds/dialogs.js` only asks (Dialog v1 + `heartDialogOptions`, chip choices, resolves null on close); `bonds/flow.js` is the drop path (`grantBond` for the GM: companion actors go through `hire`, others through `addBond`, refused when the character already has three; `requestBond` for players: a GM-whispered ledger card with `flags.heart.bondRequest`, buttons wired in a `renderChatMessage` hook, GM only, settled by rewriting the card). `items/bond/sheet.js` is a real sheet class (actor drops link `system.target`); `actors/hireling/sheet.js` uses panel-sheet chrome (`data-actor-track` marks, the edit toggle for the profile) with the character sheet's `.roll-buttons-container` and `.stress-container`, and migrates a legacy `system.ability` on the owner's first open. **The Fallout picker** is `src/fallout-picker/` (`game.heart.fallout.pick({ target, severity, resistance })`; pure half `candidates.js`, tested in `test/fallout-picker.test.mjs`; `button.js` makes the GM-only `[data-gm-only]` Pick Fallout button, which `index.js` strips for players and wires for the GM). Every Fallout "+" on an actor sheet goes through it (`actors/base/sheet.js` add handler). Styles: `bonds/bonds.sass` (rows, dialogs, companions), `items/bond/sheet.sass`, `actors/hireling/hireling.sass`, `fallout-picker/picker.sass`.

### GM relay and card actions (2026-10-02)

Writes that several clients could race on (stress taken twice from one card, two players marking Provisions at once) have ONE writer. `common/relay.js`: a client calls `askGM(op, data)` (or `relay`), which emits on `system.heart` (manifest `"socket": true`) to the active GM's client. That client runs the registered handler in a single queue and answers `{ status: 'done' | 'already' | 'not-allowed' | 'missing' | 'needs-gm' | 'no-party', ... }`; `askGM` reports any non-done status to the user and returns null. The GM's own calls, and every call when no GM is connected, run in the same queue locally.

Rules for handlers: check "already done" and who asked (`userId`) inside the handler; never call `relay` from a handler (it would deadlock the queue); never show a notification (it would land on the GM's screen); answer plain JSON. Handlers live in `rolls/card-actions.js` (`registerCardActions`, the one registry, called from `rolls/index.js`): `provisions` (`applyProvisions`), `apply-stress`, `attach-stress`, `take-stress`, `claim-fallout` / `release-fallout` / `attach-fallout`, `clear-stress`, and `claim-card-button`. `StressRoll.takeStress` is only called from handlers. A click handler that writes wraps its work in `oneAtATime(key, button, fn)` (`common/busy.js`): the key is per card and action, so the chat log and a popout share it. Only the GM and the rolling character's owners see or press Roll Stress and Take Stress (`mayRunStress`). Tested in `test/relay.test.mjs` and `test/card-actions.test.mjs`.

Drops: `common/drops.js` (tested in `test/drops.test.mjs`). An item sheet takes exactly the child types it shows (`ITEM_CHILD_TYPES`). An actor sheet refuses only clear mistakes (`actorDropRefusal`, in `HeartActorSheet._onDropItemCreate`, which every actor sheet's own drop reaches through `super`).

### Book art (2026-10-01)

**Galleries (2026-10-02, Luke):** one art viewer for every sheet, and a sheet's gallery holds every piece of art the sheet shows. Build it from `piecesOf(doc)` (main, alternates, the book's drawings), `gearPieces(items)`, and `plainPiece(src, label)` (decorations, fixed art), then open it with `showGallery(pieces, { title, start: startAt(pieces, doc) })`. `canPickKeyArt` offers "Use for this character" on a character's own class, calling, or ancestry that has alternates (`flags.heart.artVariant`).

The system ships no art; fvtt-heart-content gives classes, callings, and ancestries `flags.fvtt-heart-content.art = { src, ar, card, item, band }`, each place a `{ z, x, y }` framing (zoom %, 100 = covers the canvas; the art's centre as % of the canvas). `common/art.js` (`artOf`, `artCanvas`, `showArt`, helpers `heartArt` / `heartHasArt`) and `common/art.sass` draw any place as `.heart-art-canvas` inside a `position: relative` parent: pure CSS, sized with container query units (`cqw` / `cqh`), so it holds at any size. Places: the Choose card (behind the text, 20% / 40% on hover; the hover popout beside the card was removed 2026-10-02, Luke), the item sheet's header block (`items/base/sheet.html`: `.item-head.has-art` wraps the art, a 220px `$art-lead` strip, and `.item-header`, so one canvas spans strip and title bar; class / calling / ancestry only), and the character sheet's `.character-art-band` (`.character-head.has-art` wraps it with `.character-header`: three panes from a `$header-height` lead strip down behind the header). In both, the wrapper carries the header texture and a two-layer mask (solid over the lead strip, `header_nav.svg`'s torn edge below), and the header row drops its own texture and mask; without art the wrapper adds nothing. The books' art has one switch per user since 2026-10-02 (client setting `heart.showArt`, `common/art-toggle.js`): the Art button in the title bar of every window that shows art (character, party, landmark, adversary, companion, item sheets, and the Choose window) flips it for all of them, every open Heart window redraws, and `body.heart-art-off` hides the art behind gear rows anywhere. It replaced `showCharacterArt` and the per-document `hiddenItemArt`. Class / calling / ancestry items outside the packs (on characters, in the world) take their pack entry's art first and their own flag only as a fallback, so re-tuned placements reach existing characters (`packArt`: `_stats.compendiumSource` / `flags.core.sourceId`, else type + name in the content packs; the flag is in `CONFIG.Item.compendiumIndexFields`, so no document loads). View-art buttons open Foundry's `ImagePopout` (sized to the art within the screen, `shareable: false`).

### No game text in the system (2026-09-30)

The system ships **no book content**: the classes, callings, fallouts and tags packs, `pack-data/`, `dev-utils/build-packs.js` and the 1,266 `class.*` / `calling.*` / `fallout.<severity>.*` / `tag.<slug>.*` lang keys (92% of `en.json`; the same keys in `it.json` and `pt.json`) all moved to `fvtt-heart-content`, which now carries every book in one module with deterministic ids and literal strings. Reasons: the fork can be published without RRD's prose; the two random-id-per-build packs stopped orphaning world copies; one content taxonomy instead of two. The runtime never depended on the packs by id - pickers discover packs by item TYPE (`open-type-compendium`, `character-options`), the roll pool recognises fallouts by NAME (raw or localized), and `localizeHeart` returns raw strings on a lookup miss, so literal names render unchanged. `src/manifest.json` keeps the `macros` pack (static `macros.db`) and `recommends` the content module. Only UI keys remain in the lang files (`heart.fallout.level.*`, `heart.ability.type.*`, the `label-*` and `core-ability.*` keys). Translations of the game text in `it.json` / `pt.json` were dropped with it; the content module is English-only by design.

### Bug fix landed during Phase 0: `dev-utils/build-packs.js` (script removed 2026-09-30; kept for the record)

Upstream's `build-packs.js` line 269 wrote `"path": \`./packs/${type}.db\`` to system.json, but `compilePack()` on line 259 wrote the LevelDB directories WITHOUT a `.db` suffix. Foundry then couldn't resolve the path. Fixed at source on 2026-06-12 — line 269 now writes `"path": \`./packs/${type}\``. The legacy `macros.db`NeDB pack keeps its`.db` (it's a real file, not a LevelDB directory).

## Tests

Rules tests (added 2026-09-30): vitest, node environment, about 540 tests that run in about a second without Foundry. Since 2026-10-02 `vitest.config.mjs` stubs `.html` / `.sass` imports, so document-touching modules (rolls, bonds, party, sheets, migrations) load too, against the fakes in `test/helpers.mjs` (`fakeActor`, `fakeMessage`, `FakeRoll`, `fakeHooks`, `resetWorld`).

- **Run:** `npm test` inside this folder (`npm run test:watch` to watch), or `npm run test:heart-system` from the monorepo root. Root `npm test` (and so the Husky pre-commit hook) chains it on after the workspaces. vitest is NOT a dependency of the fork: it resolves from the monorepo root's `node_modules` (npm puts every ancestor `node_modules/.bin` on the script PATH), so nothing is installed here.
- **Layout:** `vitest.config.mjs`; `test/setup.mjs` stubs only the Foundry globals the tested modules touch (`game.i18n` returns keys as themselves and `format` appends its data as `key{a=1}`, `game.actors` is a Map, `game.heart`, `Handlebars.escapeExpression`, `foundry.utils`, `ui.notifications`), reset before each test; `test/helpers.mjs` has fake actors and fallouts, a seeded PRNG, the highlighter's match helpers, and a copy of Foundry v12's pool keep / drop logic (`evaluatePool`).
- **Covered:** Heart roll results (normal, Difficult, Impossible; which results offer stress), the pool (`pool.js`: dice, difficulty cuts, the fresh die, helpers, mastery, missing skill / domain notes, Tired / Clouded / Furious, party fallouts, hints, knacks), kept / removed dice on the card (`markPool`), stress (die steps, passive, critical doubling, Protection per character), the character fallout thresholds and `totalStress`, Provisions (`actors/party/rules.js`, `provisionsOf`, `provisionsView`, `partyMembers`), the term highlighter (`common/terms.js`, a table of phrases plus the sentence-start rule, markup, and ability references; assertions read the highlighted text and class, never the exact tag), `rollParts` / `diceRow`, repeatable abilities, class equipment choices, the two-beat limit, and seeded randomized checks (thousands of pools and Provisions marks). Later files add bonds (`bonds.test.mjs`, `bonds-view.test.mjs`), the Fallout picker (`fallout-picker.test.mjs`), item rules (`items.test.mjs`), and the art popout (`art-popout.test.mjs`).
- **Extraction pattern:** a module that imports `.html` or `.sass` (webpack-only) cannot load in vitest. Keep the rule in a small pure module beside it and import it back, with no behaviour change: `rolls/heart-roll/results.js` (result tables, `heartResult`, `markPool`), `rolls/fallout-roll/results.js` (`characterFalloutResult`), `rolls/stress-roll/rules.js` (`stepDown`, `stressDie`, `stressFormula`, `afterProtection`), alongside the already-pure `actors/party/rules.js`. New rules go in modules like these; test files are `test/*.test.mjs`.
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
2. Rebuild dist/ via the Windows-compat sequence above
3. Reload Foundry to test
4. `cd packages/fvtt-heart-system` and commit + push from inside the submodule (lands in `lrbender01/FoundryVTT-Heart`)
5. `cd ..` back to the outer repo; `git add packages/fvtt-heart-system` to bump the outer pointer; commit + push outer

### npm workspaces exclusion

The fork is **deliberately excluded** from the root `package.json` workspaces list (switched from `["packages/*"]` glob to explicit list on 2026-06-12 during Phase 0). Root devDependencies do not pollute the fork's isolated `node_modules`. Since 2026-09-30 root `npm test` does run the fork's rules tests, chained on after the workspaces (`npm run test:heart-system`); see "Tests" below.

```json
// root package.json — fvtt-heart-system NOT in this list
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

The symlink target is the **`dist/` subdirectory**, NOT the package root. Webpack emits hash-named auxiliary assets at the dist root and `heart.js` references them via relative paths — linking the package root would break asset resolution.

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

## Phase 0 Verification (2026-06-12)

The 11-test discovery audit of vanilla Heart was **intentionally skipped** to save ~45 minutes (vanilla Heart wasn't installed; installing then replacing with the fork was unnecessary Foundry-shuffling). Post-cherry-pick verification ran a tighter 9-test checklist against the BUILT FORK:

| #   | Test                                                        | Status | Notes                                                                                                         |
| --- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | World boot — open new Heart world                           | ✓      | No `Uncaught` errors in F12 console                                                                           |
| 2   | Compendiums load — Compendium tab                           | ✓      | All 5 packs visible (macros, tags, fallouts, classes, callings) with non-zero counts                          |
| 3   | Character sheet renders                                     | ✓ \*   | Three-tab layout + shaped header + shield-icon protections visible. _Known issues: see Phase 2 polish below._ |
| 4   | Resistance checkboxes persist                               | ✓      | Click → save → reload → values persist                                                                        |
| 5   | Skill/domain click-to-roll fires HeartRoll                  | ✓      | Roll dialog opens with skill pre-selected                                                                     |
| 6   | Drag class from Classes compendium onto character           | ✓      | Class attaches; abilities/equipment appear. **PR #94 drag/drop fix verified.**                                |
| 7   | Drag calling from Callings compendium onto character        | ✓      | Calling attaches; beats appear                                                                                |
| 8   | API surface — `game.heart` and `game.heart.rolls.HeartRoll` | ✓      | Both accessible in F12 console. `HeartRoll` is a constructor (Phase 4 viable)                                 |
| 9   | Other actor types (Adversary, Delve, Landmark) render       | ✓      | All three render without errors                                                                               |

**Phase 0 verdict:** All tests passed. System is usable for actual play.

---

## Ancestry item type (added 2026-08-24)

Registered the `ancestry` item type that upstream half-built (`parseAncestries` in build-packs.js and the character proxy `ancestry` getter existed; the type itself didn't). No book text in any of this - safe to push to the public fork. Consumed by `fvtt-heart-content`'s core-items pack.

- **Type**: `src/items/ancestry/{template.json,sheet.js,sheet.html}` - has_description only, monument.svg icon, base-sheet partial (renders the standard name + description-editor item sheet). `Item.types` picks it up automatically via build-template's key derivation - a stale `dist/template.json` means the type doesn't exist and ancestry items neither render nor drop; ALWAYS run the full build pipeline.
- **Proxy fix**: `src/actors/character/proxy.js` ancestry getter used `actor.find` (upstream bug; always undefined) - now `actor.items.find`.
- **Header slot (full class/calling parity)**: `src/actors/character/sheet.html` identity container Row 2 renders an item slot (name + eye/trash icons, `.ancestry-content` in character.sass) when an ancestry item is attached; when empty (owner view), a placeholder prompt + "+" button. The "+" uses a new generic `open-type-compendium` action in `src/actors/base/sheet.js` that opens the first Item compendium whose index contains the requested type - so the fork never hardcodes a content-module pack id, and any module providing ancestry items works. If `system.ancestry` holds legacy typed text with no item, the text shows in the slot. The free-text input was removed from the template (its `.ancestry-input` rule was deleted in the 2026-10-02 dead-CSS cleanup). `sheet.js` getData supplies `ancestryItem`.
- **Sync hooks** in `src/index.js`: `createItem` keeps at most one ancestry item per character (new replaces old, mirroring class/calling) and mirrors the item name into `system.ancestry`; `deleteItem` clears the field on genuine removal (not during replace-on-drop).
- **Lang**: `heart.ancestry.label-single/-multiple` in en/es/it/pt.

## Phase 2 System Polish

Closes known gaps from PR #94, plus quality-of-life improvements discovered during Phase 0.

### From PR #94

1. ~~**Style the management popups**~~ Done (see Known Issues).
2. ~~**Replace "Skills Temp" tab**~~ Done: labelled "Skills & Domains".
3. ~~**Fix knack overflow**~~ Done: knack labels wrap.
4. **Complete i18n** — audit all new strings in `src/` files; add missing keys to `static/lang/en.json`
5. **Add `totalStress` stored field** — add `"totalStress": 0` to `src/actors/character/template.json`, plus `updateActor` hook to keep in sync. Enables token-bar registration in `fvtt-heart-toolkit`.

### From Phase 0 discoveries

6. ~~**Add Windows-compatible `build-local` Node replacement.**~~ ✓ Done 2026-08-24 - `dev-utils/empty-dist.js` + `dev-utils/copy-static.js`, `build-all` script, `relink` dropped. See §Build System.
7. **Investigate `static/packs/macros.db` content.** Phase 0 verified the macros pack APPEARED in the compendium list with non-zero count; deeper content inspection (macro names, payloads) was not done. If the legacy NeDB file is broken in Foundry v12, regenerate as LevelDB.

### Theming (2026-09-29) - read before touching any colour

- **Never write a literal colour in a stylesheet.** Use the roles in `src/util.sass` (`$bg`, `$surface`, `$sunken`, `$line`, `$text`, `$muted`, `$red-deep`, `$red-mid`, `$red-bright`, `$on-red`, `$mark-empty`, `$mark-on`, `$disabled`, `$header-fg`, `$header-field-bg`). Their values live ONLY in `src/theme.sass` (`:root` = Dark default, `:root[data-heart-scheme="light"]` = Light).
- **Red tiers have jobs:** deep = fills with `$on-red` text; mid = borders/dividers (never text: ~1.8:1 on charcoal); bright = every piece of red text. Marks: `$mark-empty` grey when empty, `$mark-on` when marked.
- **The character header is fixed-dark art** in both schemes, so header text/borders use `$header-fg`, not `$text`.
- **Scheme switch:** client setting `heart.colourScheme`, registered at `init` in `src/index.js`, mirrored to `document.documentElement.dataset.heartScheme`. CSS variables make it live.
- **Foundry core in dark mode:** `theme.sass` swaps the parchment background and re-points core `--color-text-dark-*` / `--color-border-light-*` variables inside `.window-app .window-content` and `.chat-message` only. Core-component restyles are wrapped in `:where(...)` so they carry element-level specificity and never outrank a Heart or module class rule. If a module's window looks wrong in dark mode, the fix is a scoped rule in `theme.sass`, not a change to the tokens.
- `mask:`/`mask-image:` gradients that mention `black` are alpha masks, not colours; leave them.

### Design language (2026-09-29) - follow this for any new or changed interface

Distilled from the character, adversary, landmark and delve sheets and applied system-wide in the "Heart Interface Sweep" (mockups approved by Luke). Review status lives in `docs/plans/heart-ui-review.md` (monorepo root).

- **Chrome.** Actor sheets: torn header strip (`.character-header`, texture + `header_nav.svg` mask) with white-bordered header boxes, then the red tab strip (`.character-nav-tabs`). Item sheets: the compact version in `items/base/sheet.html` (icon, name, type line, stat chips), same tab strip. Never a plain white/parchment top.
- **Sections are titled containers** (`.character-tab-container` + `.container-title` + `.container-content`): mid-red border, title centred on the border line in text colour (NOT red - Luke found red titles hard to read), surface-coloured body. No lines under text anywhere; separators only where they separate items (thin red lines between questions, mid-red rule under a description that has questions after it).
- **Density.** Same font sizes, little whitespace: rows are compact recessed cards (`.item.preview`), two columns where content allows (narrow "use it" column + wide "run it" column). Long prose may go on a secondary tab (adversary / landmark Lore), but a sheet with little content stays one page (delve: no tabs, the strip is a static red banner). Simple item sheets size to their content (`height: 'auto'`).
- **Type: five styles, tokens only** (2026-09-29, "Heart Type System" mock, Roomy scale). `util.sass` defines the families and sizes and mixins `text-display` (Mosherif 32: names, banners), `text-section` (Mosherif 28: container titles, tabs, header field labels, chat outcome words), `text-label` (Alegreya SC 14, lowercase text rendered as small caps, one letter-spacing: "pick one", type lines, requirement / profile labels), `text-body` (Alegreya 17: everything you read; the root size of every Heart sheet and dialog), `text-secondary` (Alegreya italic 15, muted: knacks, hints, placeholders, empty states), plus `text-chip` (`$font-chip` at 19: every choice chip and button). Never write a literal `font-family` or `font-size` for text; icons may keep pixel sizes. Italic means secondary text or a player's answer, nothing else. Alegreya / Alegreya SC are bundled in `src/fonts/alegreya/` (OFL) with real 400/500/700 and italic weights. Window title bars stay in Foundry's font.
- **Header chips** (item sheets): larger (32px, 19px Mosherif labels), placed at the left right after the name, stacked two rows high (tier + Active, skill + domain, severity + resistance). Pluses after titles are small (`.panel-add` 15px icon; the character sheet's Mosherif `.addItem` 30px), never title-sized.
- **Red means something.** Bright red = rollable or game terms, marked states, bad outcomes. Deep red = fills (tab strip, primary buttons, speaker bars, "on" chips). Mid red = borders only. Game terms (`common/terms.js`, capitalisation-sensitive except dice): skills, domains, resistances, "Minor/Major/Critical [resistance] fallout", Protection, tag names, die sizes (d4-d20). New tags must be added to its `TAGS` list. Templates use `{{{heartTerms ...}}}`; rendered editor content uses `highlightRendered(root, selector)` in `activateListeners` (item chrome and panel sheets already call it).
- **Marks.** Every track/checkbox: grey outline when empty, bright red when marked; click the last marked box again to clear it; groups of five, rows of ten. Three sizes only (2026-10-02, `util.sass`): `$mark-md` (12px) for every track, `$mark-sm` (10px) for inline readouts (a character's Provisions row, a bond's pool, checkboxes), `$shield` (13px) for Protection; `$mark-gap` 2px, `$mark-group-gap` 5px. Use `@include util.mark-size(...)`, never a pixel size.
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

8. **Maintain CHANGELOG.md** — see [packages/fvtt-heart-system/CHANGELOG.md](CHANGELOG.md).
9. **Track upstream patches** — quarterly review of `hitcherland/main` for any v12 fixes worth pulling. Realistic expectation: zero per year.

---

## Per-File Notes

### Key upstream references

- **System manifest source:** `src/manifest.json` (merged with `foundryvtt.config.js` by `build-manifest` → `dist/system.json`)
- **System config:** `foundryvtt.config.js` — owns the system ID, title, description, compatibility, author list. Edit here to change foundational metadata.
- **Character sheet:** `src/actors/character/sheet.html` + `sheet.js` + `character.sass` + `proxy.js` (where `totalStress` is computed)
- **Character template:** `src/actors/character/template.json` (defines stored fields — ancestry, pronouns added by PR #94)
- **Settings registry:** `src/index.js` (PR #94 added `showTotalStress`, `showStressInputBox`, `preSelectStressType`; the last two, and `showTextboxesBelowItems`, were removed 2026-09-30 as nothing read them)
- **Rolls:** `src/rolls/` — `HeartRoll`, `StressRoll`, `FalloutRoll`, `ItemRoll`. Exposed as `game.heart.rolls.<Class>` after `ready`.
- **Chat messages:** `src/chat-messages/index.js` (PR #94 fixed rolltable compendium resolution here)
- **Items:** `src/items/`: 12 item types (ability, ancestry, beat, bond, calling, class, equipment, fallout, haunt, item, resource, tag), plus `base/` (the shared templates and item sheet chrome, not a type)
- **Pack data:** none since 2026-09-30 - all game content is authored in `packages/fvtt-heart-content/content/`

### Build pipeline files (`dev-utils/`)

- `build-manifest.js` — Generates `dist/system.json`
- `build-template.js` — Merges actor/item templates
- `templates-loader.js` — Webpack loader for `.html`/`.handlebars` templates
- `common.js` — `mergeDeep` helper used by `build-template.js`

---

## Known Issues & Deferred Work

### From PR #94 (Phase 2 closes)

- ~~"Skills Temp" tab placeholder label~~ Resolved: the tab reads "Skills & Domains" (`heart.character.tab-skills-and-domains`; the internal `data-tab="skills-temp"` id is unchanged).
- ~~Management popups unstyled~~ Resolved: Edit Skills / Edit Domains are styled Heart windows (`applications/application.sass`: titled sections with glyphs, ticks, knack boxes).
- Incomplete i18n: still open in a few places (adversary difficulty options, domain placeholders, system setting names and hints; see `docs/plans/heart-ui-review.md` section J).
- ~~Knack text overflow~~ Resolved: knack labels wrap (`.knack-label`, `overflow-wrap: break-word`, in `character.sass`).

### From Phase 0 (2026-06-12)

- ~~**`build-local` script is Unix-only**~~ Resolved 2026-08-24: Node-based `build-all` pipeline (see §Build System); `relink` dropped.
- **`heart.css` does not exist as a separate file.** Webpack `style-loader` injects CSS at runtime via JS. The original `package.json` `copy-static` script's comment about copying `heart.css` was vestigial; the actual artifact is just `heart.js` plus auxiliary assets.
- **macros.db legacy NeDB pack** — appears in compendium list but contents not deeply verified. May need regeneration if Foundry v12 rejects NeDB format.
- ~~**Nested `<form>` in the Biography calling block**~~ Resolved 2026-09-29: converted to a `<div>` during the sheet density pass.
- **`build-template` "key already defined" warnings** - `dev-utils/common.js` `mergeDeep` warns on every shared key (each template file adds under the same top-level `Item`/`Actor`), so the log is a wall of false positives. A real collision would be a repeated TYPE name. Harmless; tighten the warning to type-level if it ever hides something.
- **Sheet header geometry** - header/nav heights, overlap and row sizes are SASS variables at the top of `src/actors/character/character.sass` (2026-09-29). They are coupled to `static/assets/ui/header_nav.svg`, whose torn edge sits at ~87-91% of strip height; change them together.
- **`sheet.html` uses CRLF line endings** - scripted edits must match `\r\n` (or regex) or they silently miss.
- ~~**CLAUDE.md in this directory is untracked**~~ Resolved: it is staged in the fork's own repo (it IS the fork's architecture doc); Luke commits it.

### No plans for

- **v13 migration** — upstream is on v13; v12 fork stays on v12. Decided 2026-05-22 (project-wide); revisit only on explicit decision.
- **More socket use than the GM relay** - the relay (2026-10-02) exists only to make racing writes single-writer; ordinary syncing stays Foundry's document sync.
- **Complete system redesign** — toolkit works within upstream constraints.
- **Publishing the fork** — Tier 4 in [docs/publishing.md](../../docs/publishing.md). Requires (1) RRD third-party creator license verification, (2) attribution to hitcherland + Lavaeolous, (3) explicit "not officially-blessed continuation" framing.

---

## Links

- **Full integration plan:** [docs/plans/heart-integration.md](../../docs/plans/heart-integration.md)
- **Technical plan (user-local, full detail):** `C:\Users\lrben\.claude\plans\help-me-make-a-jazzy-puzzle.md`
- **Upstream repo:** https://github.com/hitcherland/FoundryVTT-Heart
- **Upstream PR #94:** https://github.com/hitcherland/FoundryVTT-Heart/pull/94
- **Lavaeolous fork:** https://github.com/Lavaeolous/FoundryVTT-Heart
- **Our fork:** https://github.com/lrbender01/FoundryVTT-Heart
- **Toolkit:** [packages/fvtt-heart-toolkit/](../fvtt-heart-toolkit/) (Party Stress Panel; roadmap in its `docs/roadmap.md`)
- **Content:** [packages/fvtt-heart-content/](../fvtt-heart-content/) (all game text and book art; roadmap in its `docs/roadmap.md`)
- **UI review checklist:** [docs/plans/heart-ui-review.md](../../docs/plans/heart-ui-review.md)
