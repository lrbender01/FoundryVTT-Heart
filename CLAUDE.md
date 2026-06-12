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
| `build-packs`    | `node dev-utils/build-packs.js`. Compiles `pack-data/<type>/<type>.yaml` into LevelDB packs at `dist/packs/<type>/`.                      |
| `build-local`    | Full pipeline. **NOT Windows-compatible** — uses `bash -c` + Unix `cp -r`. Replaced by the PowerShell sequence below.                     |

**Note: there is NO `npm run build` script.** Old plan documents that said to run `npm run build` were wrong; that errors with "Missing script: build". Use `build-prod` for the webpack step.

**Note: there is NO separate `heart.css` output.** Webpack uses `style-loader` (CSS injected at runtime via JS), so all CSS is bundled INTO `heart.js`. Old plan documents claiming a `heart.css` artifact were wrong.

### Windows-compatible full build (replaces `build-local`)

Run from inside `packages/fvtt-heart-system/` in PowerShell:

```powershell
# 1. Empty dist/
if (Test-Path dist) { Remove-Item dist -Recurse -Force }
New-Item -ItemType Directory -Path dist | Out-Null

# 2. Build webpack (production minified)
npm run build-prod

# 3. Generate system.json (pick a version string; 0.10.5-pr94 was Phase 0's choice)
npm run build-manifest -- 0.10.5-pr94

# 4. Generate template.json (merges all src/**/template.json — emits "key already defined" warnings; harmless)
npm run build-template

# 5. Compile compendium packs (writes dist/packs/<type>/ as LevelDB directories)
npm run build-packs

# 6. Copy LICENSE + static/* into dist/ (replaces the Unix cp -r step)
Copy-Item LICENSE dist/ -Force
Copy-Item static/* dist/ -Recurse -Force
```

A Node-based replacement for `build-local` (so the full pipeline lives in `package.json`) is a Phase 2 task. The script needs Node equivalents for `empty-dist` (Unix `rm -rf dist/*`) and `copy-static` (Unix `cp -r`), plus removal of the hard-coded Linux-path `relink` step.

### Build outputs (`dist/`)

| File                             | Purpose                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dist/heart.js`                  | Webpack bundle (entry: `src/index.js`). Includes all CSS as runtime `style-loader` injections.                                 |
| `dist/system.json`               | Foundry system manifest. Generated by `build-manifest`; lists packs + languages + version + compatibility.                     |
| `dist/template.json`             | Foundry data template. Merged from all `src/**/template.json` files.                                                           |
| `dist/<hash>.ttf`/`.svg`/`.webp` | Hash-named auxiliary assets. Referenced from `heart.js` via webpack `asset/resource`. Must live at dist root (relative paths). |
| `dist/packs/<type>/`             | LevelDB compendium packs (tags, fallouts, classes, callings). Generated by `build-packs`. **Directory, NOT file with `.db`.**  |
| `dist/packs/macros.db`           | Legacy NeDB compendium pack (single file). Pre-built; copied from `static/packs/macros.db`.                                    |
| `dist/lang/{en,es,it,pt}.json`   | i18n translation files. Copied from `static/lang/`.                                                                            |
| `dist/assets/...`                | UI assets (header SVGs, dice icons, fonts beyond the webpack-hashed ones). Copied from `static/assets/`.                       |
| `dist/LICENSE`                   | ISC license from upstream.                                                                                                     |

### Bug fix landed during Phase 0: `dev-utils/build-packs.js`

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

## Phase 2 System Polish

Closes known gaps from PR #94, plus quality-of-life improvements discovered during Phase 0.

### From PR #94

1. **Style the management popups** (`SkillsManagementApplication`, `DomainsManagementApplication`) — write SASS in `src/applications/`
2. **Replace "Skills Temp" tab** — rename or replace with proper skills/domains view
3. **Fix knack overflow** — add CSS `overflow: hidden; text-overflow: ellipsis` or tooltip
4. **Complete i18n** — audit all new strings in `src/` files; add missing keys to `static/lang/en.json`
5. **Add `totalStress` stored field** — add `"totalStress": 0` to `src/actors/character/template.json`, plus `updateActor` hook to keep in sync. Enables token-bar registration in `fvtt-heart-toolkit`.

### From Phase 0 discoveries

6. **Add Windows-compatible `build-local` Node replacement.** Write `dev-utils/empty-dist.js` and `dev-utils/copy-static.js` using Node `fs` so the full pipeline can run from a single `npm run` call regardless of platform. Drop the hardcoded-Linux-path `relink` step.
7. **Investigate `static/packs/macros.db` content.** Phase 0 verified the macros pack APPEARED in the compendium list with non-zero count; deeper content inspection (macro names, payloads) was not done. If the legacy NeDB file is broken in Foundry v12, regenerate as LevelDB.

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
- **Pack data:** `pack-data/<type>/<type>.yaml` — YAML sources for `build-packs.js` to compile into compendiums

### Build pipeline files (`dev-utils/`)

- `build-manifest.js` — Generates `dist/system.json`
- `build-template.js` — Merges actor/item templates
- `build-packs.js` — Compiles YAML → LevelDB packs (Phase 0 fixed the `.db` path bug here)
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

- **`build-local` script is Unix-only** (uses `bash -c`, `cp -r`). Phase 2 task: add Node-based replacement. Workaround documented in "Build System" above.
- **`relink` script has a hardcoded Linux-style path** (`C:/Data/FoundryDev/...`). Drop entirely; the symlink is created manually per user setup.
- **`heart.css` does not exist as a separate file.** Webpack `style-loader` injects CSS at runtime via JS. The original `package.json` `copy-static` script's comment about copying `heart.css` was vestigial; the actual artifact is just `heart.js` plus auxiliary assets.
- **macros.db legacy NeDB pack** — appears in compendium list but contents not deeply verified. May need regeneration if Foundry v12 rejects NeDB format.
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
