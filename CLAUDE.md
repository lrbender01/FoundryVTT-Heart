# fvtt-heart-system — Personal Fork of Heart: The City Beneath

**Status:** Phase 0 ✓ Done 2026-06-12. PR #94 cherry-picked via fast-forward merge. System runs in Foundry; all 9 verification tests passed. Phase 2 polish work documented below.

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

A house rule (monorepo `reference/heart-rules/provisions.md`; as-built notes and the UI handoff in `docs/plans/heart-provisions.md`). `src/actors/party/`: a singleton Actor type `party` holding the world's one Provisions track (`system.provisions { value, max: 20 }`, `system.quartermaster`, `system.notes`); `rules.js` is the pure arithmetic (thresholds, restock sizes, protection), `party.js` the API and singleton hooks, `proxy.js` the derived data, `sheet.*` a placeholder. An actor rather than a world setting so players can mark it from their own stress cards (settings are GM-write only; the fork has no socket relay). `game.heart.resistances` stays the five personal tracks; `game.heart.stress_targets` adds `provisions` for the stress picker. `StressRoll._takePartyStress` applies a Provisions mark once to the party; `FalloutRoll` has a party branch (`options.party`, `critical-fallout`, `notRolled`). `activeFallouts(character)` includes the party's fallouts.

### No game text in the system (2026-09-30)

The system ships **no book content**: the classes, callings, fallouts and tags packs, `pack-data/`, `dev-utils/build-packs.js` and the 1,266 `class.*` / `calling.*` / `fallout.<severity>.*` / `tag.<slug>.*` lang keys (92% of `en.json`; the same keys in `it.json` and `pt.json`) all moved to `fvtt-heart-content`, which now carries every book in one module with deterministic ids and literal strings. Reasons: the fork can be published without RRD's prose; the two random-id-per-build packs stopped orphaning world copies; one content taxonomy instead of two. The runtime never depended on the packs by id - pickers discover packs by item TYPE (`open-type-compendium`, `character-options`), the roll pool recognises fallouts by NAME (raw or localized), and `localizeHeart` returns raw strings on a lookup miss, so literal names render unchanged. `src/manifest.json` keeps the `macros` pack (static `macros.db`) and `recommends` the content module. Only UI keys remain in the lang files (`heart.fallout.level.*`, `heart.ability.type.*`, the `label-*` and `core-ability.*` keys). Translations of the game text in `it.json` / `pt.json` were dropped with it; the content module is English-only by design.

### Bug fix landed during Phase 0: `dev-utils/build-packs.js` (script removed 2026-09-30; kept for the record)

Upstream's `build-packs.js` line 269 wrote `"path": \`./packs/${type}.db\`` to system.json, but `compilePack()` on line 259 wrote the LevelDB directories WITHOUT a `.db` suffix. Foundry then couldn't resolve the path. Fixed at source on 2026-06-12 — line 269 now writes `"path": \`./packs/${type}\``. The legacy `macros.db`NeDB pack keeps its`.db` (it's a real file, not a LevelDB directory).

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

The fork is **deliberately excluded** from the root `package.json` workspaces list (switched from `["packages/*"]` glob to explicit list on 2026-06-12 during Phase 0). Root `npm test` does not touch this package. Root devDependencies do not pollute the fork's isolated `node_modules`.

```json
// root package.json — fvtt-heart-system NOT in this list
"workspaces": [
  "packages/fvtt-swade-toolkit",
  "packages/fvtt-mothership-toolkit",
  "packages/fvtt-mothership-content",
  "packages/fvtt-grvntdrafter",
  "packages/fvtt-playtime-tracker",
  "packages/fvtt-inventory-tracker"
]
```

`fvtt-heart-toolkit` and `fvtt-heart-content` will be added to this list when their respective phases scaffold a `package.json` (Phase 1 and Phase 3).

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
- **Header slot (full class/calling parity)**: `src/actors/character/sheet.html` identity container Row 2 renders an item slot (name + eye/trash icons, `.ancestry-content` in character.sass) when an ancestry item is attached; when empty (owner view), a placeholder prompt + "+" button. The "+" uses a new generic `open-type-compendium` action in `src/actors/base/sheet.js` that opens the first Item compendium whose index contains the requested type - so the fork never hardcodes a content-module pack id, and any module providing ancestry items works. If `system.ancestry` holds legacy typed text with no item, the text shows in the slot. The free-text input was removed from the template (`.ancestry-input` sass rule retained but unused). `sheet.js` getData supplies `ancestryItem`.
- **Sync hooks** in `src/index.js`: `createItem` keeps at most one ancestry item per character (new replaces old, mirroring class/calling) and mirrors the item name into `system.ancestry`; `deleteItem` clears the field on genuine removal (not during replace-on-drop).
- **Lang**: `heart.ancestry.label-single/-multiple` in en/es/it/pt.

## Phase 2 System Polish

Closes known gaps from PR #94, plus quality-of-life improvements discovered during Phase 0.

### From PR #94

1. **Style the management popups** (`SkillsManagementApplication`, `DomainsManagementApplication`) — write SASS in `src/applications/`
2. **Replace "Skills Temp" tab** — rename or replace with proper skills/domains view
3. **Fix knack overflow** — add CSS `overflow: hidden; text-overflow: ellipsis` or tooltip
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
- **Marks.** Every track/checkbox: grey outline when empty, bright red when marked; click the last marked box again to clear it; groups of five, rows of ten.
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
- **Settings registry:** `src/index.js` (PR #94 added `showTotalStress`, `showStressInputBox`, `preSelectStressType`)
- **Rolls:** `src/rolls/` — `HeartRoll`, `StressRoll`, `FalloutRoll`, `ItemRoll`. Exposed as `game.heart.rolls.<Class>` after `ready`.
- **Chat messages:** `src/chat-messages/index.js` (PR #94 fixed rolltable compendium resolution here)
- **Items:** `src/items/` — 10 item types (ability, beat, calling, class, equipment, fallout, haunt, resource, tag, base)
- **Pack data:** none since 2026-09-30 - all game content is authored in `packages/fvtt-heart-content/content/`

### Build pipeline files (`dev-utils/`)

- `build-manifest.js` — Generates `dist/system.json`
- `build-template.js` — Merges actor/item templates
- `templates-loader.js` — Webpack loader for `.html`/`.handlebars` templates
- `common.js` — `mergeDeep` helper used by `build-template.js`

---

## Known Issues & Deferred Work

### From PR #94 (Phase 2 closes)

- "Skills Temp" tab placeholder label
- Management popups unstyled
- Incomplete i18n
- Knack text overflow

### From Phase 0 (2026-06-12)

- ~~**`build-local` script is Unix-only**~~ Resolved 2026-08-24: Node-based `build-all` pipeline (see §Build System); `relink` dropped.
- **`heart.css` does not exist as a separate file.** Webpack `style-loader` injects CSS at runtime via JS. The original `package.json` `copy-static` script's comment about copying `heart.css` was vestigial; the actual artifact is just `heart.js` plus auxiliary assets.
- **macros.db legacy NeDB pack** — appears in compendium list but contents not deeply verified. May need regeneration if Foundry v12 rejects NeDB format.
- ~~**Nested `<form>` in the Biography calling block**~~ Resolved 2026-09-29: converted to a `<div>` during the sheet density pass.
- **`build-template` "key already defined" warnings** - `dev-utils/common.js` `mergeDeep` warns on every shared key (each template file adds under the same top-level `Item`/`Actor`), so the log is a wall of false positives. A real collision would be a repeated TYPE name. Harmless; tighten the warning to type-level if it ever hides something.
- **Sheet header geometry** - header/nav heights, overlap and row sizes are SASS variables at the top of `src/actors/character/character.sass` (2026-09-29). They are coupled to `static/assets/ui/header_nav.svg`, whose torn edge sits at ~87-91% of strip height; change them together.
- **`sheet.html` uses CRLF line endings** - scripted edits must match `\r\n` (or regex) or they silently miss.
- **CLAUDE.md in this directory is untracked in both the inner repo and the outer (outer treats this dir as submodule).** Decide whether to commit it to the fork's history (recommended — it IS the fork's architecture doc) or leave it untracked.

### No plans for

- **v13 migration** — upstream is on v13; v12 fork stays on v12. Decided 2026-05-22 (project-wide); revisit only on explicit decision.
- **Socket support** — no real-time sync needed; Foundry's built-in document sync suffices.
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
- **Toolkit (Phase 1 scaffold pending):** [packages/fvtt-heart-toolkit/](../fvtt-heart-toolkit/)
- **Content (Phase 3 scaffold pending):** [packages/fvtt-heart-content/](../fvtt-heart-content/)
