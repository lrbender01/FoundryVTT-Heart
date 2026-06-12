# Changelog

All notable changes to this **personal fork** of `hitcherland/FoundryVTT-Heart` will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning extends upstream's scheme with a fork-identifying suffix (e.g. `0.10.5-pr94`).

**This is a personal v12 maintenance fork.** Upstream (`hitcherland/FoundryVTT-Heart`) is frozen at `0.10.4` (Sep 2024) on `main`; the maintainer pivoted to v13 development on the `new-magic` branch. This fork carries community contributions and bug fixes the upstream `main` will not receive.

See [CLAUDE.md](CLAUDE.md) for fork rationale, build pipeline, and known issues.

## [Unreleased]

### Changed

- (Future entries land here)

---

## 0.10.5-pr94 — 2026-06-12

First own-history release of the fork. Cherry-picks community PR #94 (character sheet redesign by [@Lavaeolous](https://github.com/Lavaeolous)) onto upstream's `0.10.4` baseline, plus one upstream build-script bug fix discovered during integration.

### Added

- **Character sheet redesign (PR #94).** Three-tab layout (Character / Biography / Skills Temp), two-column character body (400px left, fluid right), inlayed container labels, Mosherif display font (added to `src/fonts/mosherif/`), shield-icon protection checkboxes, shaped header with SVG mask wavy edge, resistance-click-to-roll, skill/domain-click-to-roll, floating management dialogs (`SkillsManagementApplication`, `DomainsManagementApplication`).
- **Character template additions** — `ancestry: ""` and `pronouns: ""` fields in `src/actors/character/template.json`. Additive, non-breaking.
- **New client settings** — `showTotalStress`, `showStressInputBox`, `preSelectStressType` (Boolean toggles, registered in `src/index.js`).
- **`totalStress` proxy property** (`src/actors/character/proxy.js`) — computed as sum of all 5 `resistance.<X>.value` fields. Foundation for future token-bar work (requires conversion to a stored field; see CLAUDE.md §Phase 2 System Polish).

### Fixed

- **Drag/drop nested item crash.** Old `dataset.itemId` approach crashed when dragging calling/class children whose UUIDs contain `@`. Fixed in `src/actors/character/sheet.js` to use `fromUuid()` and guard against duplicating children.
- **Rolltable compendium resolution.** Old code in `src/chat-messages/index.js` only resolved world-side rolltables. Now resolves both world and compendium rolltables.
- **Firefox SVG token crash.** Non-character actor tokens crashed in Firefox due to SVG mask handling. Fixed in `src/items/base/sheet.js`.
- **`dev-utils/build-packs.js` system.json path bug.** Upstream's script wrote `"path": "./packs/<type>.db"` to system.json but `compilePack()` output the LevelDB directories WITHOUT a `.db` suffix. Foundry couldn't find the packs. Fixed at line 269 to drop the `.db` suffix. Legacy `macros.db` NeDB pack path stays unchanged (it's a real file, not a LevelDB directory).

### Cherry-pick provenance

Applied via `git merge --ff-only lavaeolous/feature-character-sheet`. Merge-base was upstream's `0.10.4` (tag `29a21146`); PR #94 branched directly off it, so all 9 commits applied with zero conflicts. Commit hashes preserved from Lavaeolous's branch:

| Hash      | Date       | Subject                                       |
| --------- | ---------- | --------------------------------------------- |
| `7901f50` | 2025-03-09 | WIP Header                                    |
| `4faa2c6` | 2025-03-11 | Header                                        |
| `d5b799a` | 2025-03-16 | WIP Everything but Skills, Knacks and Domains |
| `33e542d` | 2025-03-16 | More WIP                                      |
| `9a38260` | 2025-03-22 | only skills and domains remain                |
| `8601bd7` | 2025-03-23 | More WIP                                      |
| `b103269` | 2025-03-30 | WIP Skills and Domains                        |
| `247ced9` | 2025-04-01 | v1 of the new char sheet                      |
| `b30920f` | 2025-04-05 | Fix for error when creating tokens in Firefox |

### Known issues (Phase 2 will close)

- "Skills Temp" tab is a placeholder label
- `SkillsManagementApplication` and `DomainsManagementApplication` are functional but unstyled
- Localization incomplete (hardcoded English in new code)
- Knack text overflow unhandled
- `build-local` npm script is Unix-only (uses `bash -c` + `cp -r`); Windows users follow the inline PowerShell sequence documented in [CLAUDE.md](CLAUDE.md) §Build System

### Verification

Verified live in Foundry v12 on 2026-06-12 — all 9 Phase 0 verification tests passed. See [CLAUDE.md](CLAUDE.md) §"Phase 0 Verification" for the detail.

### Credits

- Original Heart system: [@hitcherland](https://github.com/hitcherland)
- PR #94 character sheet redesign + bug fixes: [@Lavaeolous](https://github.com/Lavaeolous)
- Heart: The City Beneath game IP: Rowan, Rook and Decard

---

## [0.10.4] — 2024-09-03 (upstream baseline)

This is where our fork diverges from upstream. Pre-fork history lives at https://github.com/hitcherland/FoundryVTT-Heart — see upstream's release notes for changes through `0.10.4`.

Tag preserved as `29a21146` on `main`. Upstream `main` is frozen here; active upstream work moved to the `new-magic` branch for v13.
