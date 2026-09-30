# Changelog

All notable changes to this **personal fork** of `hitcherland/FoundryVTT-Heart` will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning extends upstream's scheme with a fork-identifying suffix (e.g. `0.10.5-pr94`).

**This is a personal v12 maintenance fork.** Upstream (`hitcherland/FoundryVTT-Heart`) is frozen at `0.10.4` (Sep 2024) on `main`; the maintainer pivoted to v13 development on the `new-magic` branch. This fork carries community contributions and bug fixes the upstream `main` will not receive.

See [CLAUDE.md](CLAUDE.md) for fork rationale, build pipeline, and known issues.

## [Unreleased]

### Added

- **Every new glyph in use (2026-09-30 review, Luke's placements).** Severity glyphs (minor / major / critical) on fallout rows, the fallout roll card's outcome, and the fallout sheet's Severity chip. Fallout rows lead with the severity glyph, then the resistance glyph (tooltips name both; the "(Major Blood)" text is gone, kept only for a resistance with no glyph). Item-type glyphs before section titles (Pursued Beats and beat sections: beat; Abilities, Core Ability, class tiers: ability; Tags: tag; landmark Haunts: haunt) and the tag glyph before equipment / resource tag lists. Equipment, resource, and haunt roll cards lead with the item's own icon. Item rows (Items section, keepsakes) show their icon on the left. Provisions shows its own glyph on the character sheet; a party still carrying the old Supplies placeholder takes the Provisions glyph on the GM's next load. `heartGlyph` gained the `item` kind; `heartHasGlyph` tests for a glyph in templates.
- **Class starting equipment locks once picked (2026-09-30 review).** Picking an option on a character's class asks first ("can't be changed once it's picked"); the other options stay listed, ghosted, and unpickable, and the pick can't be undone by players (the GM still can).

- **Choose a Class / Calling / Ancestry as cards (2026-09-30 review).** One grid in source order (core book, then Ways and Means, by page; world items last; no book headings): a 56px glyph, the name in the display face, a two-sentence pitch from fvtt-heart-content (`flags.fvtt-heart-content.pitch`), Preview and Choose; the current pick is outlined. Opens 900px wide.
- **Reorder skills and domains (2026-09-30 review).** Drag a card onto another on the Character tab (a red bar shows the side it lands on); the order is saved on the character (`flags.heart.skillOrder` / `domainOrder`). `reorder.js` gained `orderKeys` and a `{ key, axis }` option on `enableReorder`.

- **Soft glyph halo (2026-09-30, Luke).** Every glyph gets a soft outline in the colour opposite the glyph: sheet glyphs (`.heart-glyph`, drawn in the text colour) take `--heart-glyph-halo` from the colour scheme (dark halo on the dark scheme, light halo on the light one), and glyph files shown as plain images anywhere in Foundry (`img[src*="/assets/icons/"]`: sidebar, compendium lists, portraits, chat) take a dark halo. The glyph mask moved to `.heart-glyph::before` because a filter on a masked element is masked away with it. Tokens on the canvas are not affected. Also new: `assets/icons/severity/` (minor, major, critical) and `assets/icons/items/` (haunt, beat, ability, tag) with the item type defaults pointed at them; `heartGlyph` accepts `severity` and the `provisions` resistance; Sneak, Cursed, Technology, Wild and Blood glyphs replaced; Hunt back to its original drawing.
- **Custom beats (2026-09-30 review).** The GM's "+" on the character sheet's Pursued Beats and on each calling Beats section asks for a name, a severity (default Minor, or that section's) and an optional description. The beat is added to the character's calling (a loose actor beat only when there is none), so the calling sheet lists it and every count includes it; from the character sheet it is pursued at once when a slot is free. Loose custom beats made earlier show in the calling's sections too (no severity reads as Minor), and the calling sheet refreshes when they change (`createCustomBeat`, `allBeatsOf`, `beatLevel` in `items/beat/actions.js`).
- **Class abilities "+" on a character's class (GM).** Every tier (Core, Minor, Major, Zenith) has a "+"; a new core ability is learned at once, the others show Learn. Any "+" that adds a child (abilities, beats, equipment, resources, tags) now opens the new child's sheet to name it.
- **Equipment and resource icons.** Rows show the item's own icon (skill / domain glyph, the content module's miscellaneous icon) wherever they appear: character, class, landmark and delve sheets.

- **Party sheet and Provisions on the character sheet (2026-09-30).** The party actor has a real sheet (`actors/party/sheet.*`, `party.sass`): name and quartermaster picker in the header beside the 20-box Provisions track (two rows of ten, a red tick and red outlines from box 13) and the quartermaster's protection; a members strip (token art and name; drag characters onto the sheet or use +, x to remove, click to open); Provisions actions (Upkeep, Mark by die or amount with an ignore-protection box, Restock with payer and die, Scavenge relief, Relieve by die or amount, Clear, GM-only Reset), every one through the party API; party fallouts (only fallout items can be dropped); notes. New field `system.members` (character ids); the quartermaster and restock payer lists offer the members, or every character while there are none. Each character sheet shows Provisions as a sixth, read-only row under the five resistances ("Party · QM Vess", or "Quartermaster" on the quartermaster's own sheet): the name rolls stress to Provisions, the eye opens the party sheet. Open character sheets refresh when the party, its fallouts or the quartermaster's Supplies protection change (`actors/party/view.js` holds the shared display data).
- **Provisions and the party actor (2026-09-30).** A house rule (monorepo `reference/heart-rules/provisions.md`): one party-wide Provisions track of 20 on a new singleton Actor type `party` ("The Party", created by the GM on ready, owned by every player, not deletable, only one). `game.heart.party`, `actor.proxy.provisions` on every character, and an API on `game.heart.party.proxy` (mark, upkeep, relieve, restock, scavenge, quartermaster, clear, reset). Stress rolls can target Provisions (applied once to the party, less the quartermaster's Supplies protection); its fallout check uses the house thresholds (13+: Major is Critical; 20: Critical without a roll). Party fallouts count on every character's roll prompt. Behaviour only: the party sheet is a placeholder and no other UI changed. Details in the monorepo's `docs/plans/heart-provisions.md`.

### Fixed

- **Sheets no longer jump to the top on update (2026-09-30 review).** Foundry AppV1 saves scroll positions from the whole window but restores them only inside the newly rendered inner HTML; Heart sheets scroll on `.window-content`, which is outside it, so learning an ability, pursuing a beat, or any other update scrolled the sheet back to the top. The shared sheet mixin (`common/sheet.js`) adds `.window-content` to `scrollY` and restores against the whole window.
- **Keepsakes and trinkets (2026-09-30 review).** The roll shows its dice through Dice So Nice (Foundry's dice sound without it), then posts the draw card without the roll attached so it isn't animated twice; no "added to items" banner. The Keepsake / Trinket section shows the rolled item as an item row (icon, name, open). The ancestry's Keepsake section sits under Questions.
- **Choose a Class / Calling / Ancestry** opens at 1450 x 900, five cards across.

- **Character sheet review round 15 (2026-09-30).** The Provisions eye sits right after its name. A hovered skill / domain card keeps its name centred (the red pill grows evenly). The Skills and Domains boxes are just as tall as their rows of three. The Skills & Domains tab was broken by the card-grid rules (same container classes); it now has its own classes and the Edit Skills / Edit Domains rows (tick, glyph, name | knack; a knack box opens once its skill is ticked). The Equipment line lost its "Pick it" link (click the alert). Alerts are ember gold with a dark "!" and a thin dark ring (`--heart-warn` / `--heart-warn-ink`), every one opens what fixes it. Calling header counts are white.
- **Ancestry sheet like the calling (2026-09-30 review).** Two columns (description and a Keepsake section on the left, questions on the right) at the calling's size, 960 x 820; the keepsake roll has its own titled section like the calling's Trinket.
- **Resistances block fits its box (2026-09-30 review).** The name column takes the width that is left and wraps (the Provisions "Party · QM" line), the box and shield columns are exactly their marks, and the Stress / Protection heads are small labels that wrap instead of widening their columns. The character tab's left column is 390px (was 370).
- **Calling sheet header and Overview (2026-09-30 review).** Header: "Completed Beats" (all severities, custom beats included), then Minor / Major / Zenith progress; "Pursued" is gone from the header. Every item sheet's name field is as wide as its text, so the header chips sit right beside the title. The trinket roll has its own Trinket section under Core Ability. Pursued Beats carries the same "!" warning as the character sheet while fewer than two are pursued (click: Beats tab).
- **Edit Skills / Edit Domains (renamed from "Pick your ... and Knacks").** Each row shows its glyph; the column heads are small labels; the window opens 380px wide (was 520) with less padding.
- **Chat cards:** a solid black edge on every card, whispers and blind rolls included (was a dashed player-coloured edge); the player's colour stays on the avatar.

- **Sheets always show a document's own icon (2026-09-30 audit).** The shared sheet code (`common/sheet.js`) no longer writes the type's generic picture onto the live actor / item; it computes `displayImg` for the template instead (every actor and item sheet's portrait uses it), so opening a sheet can never replace an assigned icon anywhere else. The ready-time icon adoption now covers every item type, not just class / calling / ancestry: older copies of resources, equipment, fallouts, keepsakes and the like, including ones nested inside a class or calling, take the icon their compendium entry has now (only copies still showing a generic image; a type + name two entries disagree on is skipped).
- **Character sheet review round 13 (2026-09-30).** Each warning shows in one place only (equipment on the Equipment section, beats on Pursued Beats; the class and calling slots only warn when empty or for a keepsake / trinket). The equipment line is greyed like the beat count: "Your class starting equipment isn't picked yet. Pick it". Skills and domains are square cards, name over a larger glyph, three per row. Resistance names and tracks are centred. The header is tighter so name, ancestry, class and calling stay legible. Title counts line up with the icons beside them; "+" buttons match the eye icons' height. Pursuing a beat on the calling sheet keeps the scroll position. The ancestry sheet's Roll keepsake is a full-width bar under the header.

### Added

- **Reorder resources and items (2026-09-30).** Resources and Items rows on the character sheet drag to reorder like abilities (`flags.heart.resourceOrder` / `itemOrder`, `actors/character/reorder.js`).
- **Warnings (2026-09-30).** A round "!" badge with a tooltip marks what a character still needs: on the ancestry / class / calling header slots (none chosen; keepsake or trinket not rolled, for book ancestries and callings; class equipment not picked; fewer than two beats pursued) and after the Equipment and Pursued Beats titles. Each badge opens what fixes it (the picker, the item, the class Overview, the calling's beats).
- **Reorder abilities (2026-09-30).** Drag an ability row onto another on the character sheet to put them in any order; the order is saved on the character (`flags.heart.abilityOrder`), since abilities come from the class, the calling and the character. Core abilities read "Core Class: ..." / "Core Calling: ...".
- **Icons in use (2026-09-30).** `common/icons.js` adds `{{{heartGlyph kind id}}}` (the skill / domain / resistance glyphs) and `{{{heartIcon img}}}` (an item's own icon, e.g. fvtt-heart-content's class / calling / ancestry glyphs); both paint white-on-transparent SVGs in the current text colour through a CSS mask, so they work in both colour schemes. Used on: character sheet skill / domain rows, resistance names, header ancestry / class / calling slots and Biography block titles; the class / calling / ancestry picker rows; the class sheet's Domain & Skill cells; the roll prompt's domain / skill chips and its pool dice; the stress card's outcome; adversary / landmark / delve domain chips; the Beat Tracker's calling names. On ready the GM's client gives older class / calling / ancestry copies still showing the generic drum / monument the icon of the compendium entry with the same type and name (image only).
- **Sheet glyphs (2026-09-30).** `static/assets/icons/{skills,domains,resistances}/<slug>.svg`: 20 game-icons.net glyphs (white on transparent, CC BY 3.0, credited in `static/assets/icons/CREDITS.md`) chosen by Luke for the character sheet's skills, domains and resistances. Assets only for now; the sheet, roll prompt and chat card templates do not reference them yet.

### Removed

- **All game text (2026-09-30).** The classes, callings, fallouts and tags compendium packs, their YAML sources (`pack-data/`), the `build-packs` script and the 1,266 content strings in the language files are gone from the system; `fvtt-heart-content` now ships every book's content (core and Ways and Means alike) with deterministic ids and literal names, filed under one sidebar taxonomy (Heart - Delvers / Rules / GM). The manifest keeps the `macros` pack and `recommends` the content module. Existing worlds keep their imported copies; re-import from the content module's packs to get stable ids. The Portuguese and Italian translations of the game text went with it (UI strings stay translated).

### Added

- **Trinkets and keepsakes (2026-09-30).** A character's ancestry and calling each get a one-time **Roll keepsake** / **Roll trinket** button (in the Biography blocks and in the item's own sheet header). It draws from the matching table (Foundry's draw card, animated by Dice So Nice), adds the drawn item straight to the character's Items, and then shows what was rolled (click it to open; the GM can reset to allow a reroll). Tables are found by name in the world or any RollTable compendium ("<Ancestry> Keepsakes", "<Calling> Calling ..."), so fvtt-heart-content's 13 tables work without the system depending on it (`items/trinkets.js`). Neither book has class trinket tables.
- **Class equipment reminder (2026-09-30).** While a character's class still has a pick-one equipment choice unmade, the header's class slot shows a red "!" badge and the Equipment section a line "Your class equipment isn't picked yet. Pick it"; both open the class Overview, whose Equipment title says "Equipment not picked yet" (`items/class/equipment.js`).
- **Beat Tracker (2026-09-29).** The unused beat-tracker application is wired up: a "Beat Tracker" button in the Actors sidebar (or `game.heart.openBeatTracker()`) opens one window listing each character's active beats (calling beats and loose ones), minor to zenith, with working complete marks. It refreshes itself as characters and items change. The GM sees player-owned characters; players see the characters they can observe.
- **Class skill and domain on the character (2026-09-29 review).** Adding a class to a character ticks the class's core skill and core domain on the character (never unticks anything). The class's old ActiveEffects for this were never applied.
- **More term highlighting (2026-09-29 review).** Besides skills and domains: resistances (Blood, Mind, Echo, Fortune, Supplies), fallout ("Minor Blood fallout", "Major fallout"), Protection, equipment / resource tag names (Brutal, Piercing, Point-Blank, ...) and die sizes (d4-d20). Capitalisation-sensitive: only capitalised terms are highlighted ("Kill", not "kill"; "Protection", not "protection"), except dice ("d6" and "D6"). Applied to item sheet descriptions (abilities, class, calling core ability), beat, fallout, tag and resource rows, the Biography tab's calling / ancestry / class descriptions, and adversary / landmark / delve text panels (e.g. adversary Special). Tag names in equipment rows are term-coloured.
- **Calling sheet (2026-09-29, approved sweep v2).** Shared item chrome; header shows active beats (x / 2 on a character) and minor / major progress. **Overview** leads with **Active Beats** (a character chases two at a time), then description, core ability and questions. **Beats** tab: minor | major + zenith, one row per beat with a grey/red complete mark and an Active / Set active chip; a third beat can't be activated while two are active. Beat rows everywhere (incl. the character sheet's Active Beats) use the new mark instead of strikethrough-only.
- **Dialogs (2026-09-29, approved sweep).** Roll prompt: one-click chips instead of dropdowns (single choices are radios, multiples checkboxes, difficulty a segmented set; the submitted form data is unchanged). Prepare Roll Request: segmented difficulty, "Send to chat" button; its chat card's buttons read "Roll as <name>". Skills / Domains pickers: knack boxes only take input once the skill/domain is ticked. Fallout "clear stress" confirmations say what will happen with numbers ("Vess took Minor fallout. Clear the stress in Mind (5 boxes marked)?") and name their buttons (Keep it / Clear Mind stress). Changelog dialog restyled.
- **Chat cards (2026-09-29, approved sweep).** Heart, stress and fallout rolls show a summary line, the dice faces (kept die in red; hover a face for its source), the outcome as a large word (failures and fallout in bright red, critical success underlined red) and labelled buttons (Roll Stress, Take Stress, Roll Fallout, Clear stress).
- **Skill / domain highlighting in journals.** Displayed journal text gets the same bold-red terms as ability rows (display only; stored pages are untouched and edit mode is left alone).
- **Dark-mode polish** for roll table sheets (zebra rows, muted ranges) and compendium windows (search, rows, folder bars).

### Changed

- **Rolls rebuilt (2026-09-30, from the rules audit and the approved "Heart Roll Prompt" mock).**
  - **Roll prompt** (`applications/heart-roll`): knows who is rolling. Skills and domains they have are marked (knacks too), with a "None" choice (nothing is preselected by accident any more); a missing skill or domain says it adds no die. A knack is offered as a suggestion ("Roll with mastery if it applies"), never forced. Helpers: only characters with the chosen skill or domain, not Furious, up to two; the GM can pick anyone. Tired / Clouded remove the skill / domain die; fallouts that make actions harder (Darkness, Limping, Blinded, ...) show as a hint beside difficulty. A live preview shows the dice (base, skill, domain, mastery, each helper), what the difficulty does, and the result table; the button says what will happen ("Roll 4 dice", "Roll 1 fresh die", "Fail and take stress"). Closing the prompt rolls nothing.
  - **One pool, one formula** (`rolls/heart-roll/pool.js`): the preview and the roll use the same rules code.
  - **Card**: dice removed by difficulty are struck through and the die actually kept is highlighted; notes explain missing dice; a critical success reminds you to step up inflicted stress; helpers are named.
  - **Stress** (tied to the roll): Take stress opens one short picker (resistance, stress die, Passive, Ignore Protection; prefilled with your last choice; default D4), rolls it (doubled on a critical failure, one size smaller for a passive success at a cost) and marks it on the roller AND each helper, less each one's own Protection. The card lists who took what; Fallout buttons appear per character who took stress, and not at all when Protection stopped it (HCB p.78). A helper's fallout posts as its own card; its Clear stress clears the right resistance.
  - **Dice So Nice**: rolls posted as cards animate before the card appears (Dice So Nice's own handling); stress and fallout rolls chained under a Heart roll now animate too (`rolls/dice.js`, honouring the roll mode and the existing 3D settings), with Foundry's dice sound as the fallback.
- **Beats: two-stage flow (2026-09-29 review).** Beat rows lose their checkbox and get stacked **Activate** / **Complete** buttons (calling Beats and Overview, character Active Beats, Beat Tracker, the beat's own sheet). Complete is greyed out until the beat is active; completing a beat deactivates it and greys the whole row; clicking **Completed** undoes it (active again when fewer than two are active, otherwise inactive with a notice). A character still chases at most two beats. The rules live in one place (`items/beat/actions.js`). The character sheet's Active Beats title shows the count, an eye that opens the calling straight on its Beats tab, and a "+" for the GM only (one-off beats outside the calling); while fewer than two beats are active a quiet line reads "1 of 2 beats active. Choose another". "Set active" is now "Activate".
- **Character sheet Abilities show only what the player can use (2026-09-29 review).** A major ability's nested options appear only when switched on in the class sheet, and no ability row on the character sheet has an on / off toggle (the class sheet keeps the full list with toggles). Abilities added straight to the character follow suit: switched-off ones stay in the inactive list only. (The old filter was wrapped in an HTML comment and never received its flag, so every nested option always showed.)
- **Review round 10 (2026-09-30).** The ancestry sheet is one column (keepsake, questions, then description) and resizes freely (a fixed 620 x 720 start; auto-height windows can't be resized vertically). Roll keepsake / Roll trinket moved from the ancestry / calling header into the body, and a roll can never be redone (the GM reset is gone). Item names can be selected and copied on sheets you can't edit (read-only instead of disabled).
- **Review round 9 (2026-09-30).** The character sheet opens at 930 x 920 (was 1250 x 1000). The ancestry / class / calling pickers size themselves to their list, and list options in book order (core, then Ways and Means, each by page, from fvtt-heart-content's book / page flags) instead of alphabetically; packs are ordered the same way. The Beat Tracker drops its hint line, and its sidebar button reads "Pursued Beats".
- **Review round 8 (2026-09-30).** Adversary panels sit in three paired rows of equal height: Attacks | Descriptors, Special | Motivation, Loot | Profile (Inactive Gear spans both columns below them; Description and GM Notes stay full width). Abilities on the character sheet show their degree in the title ("Major: Crimson Mirror", "Minor: Ramblewyrd", "Core: ..."), including a major ability's options; the class sheet doesn't, since it already groups them.
- **Review round 7 (2026-09-30).**
  - **Adversary sheet ordered for play:** a fight column (Attacks, Special, then Loot) beside a portrayal column (Descriptors, Motivation, then a compact Profile with each label beside its value), equal widths; Description and GM Notes full width below. The empty red strip under the header is half as tall (adversary and delve).
  - **Abilities:** a major ability's options can't be learned before the major ability (greyed Learn with a tooltip; the click is refused too). Learn / Learned lose their icons and match Finish / Finished.
  - **Class Domain & Skill:** two equal cells, a small-caps label centred over each value (domain first, as in the roll prompt).
  - **Calling Overview:** the pursued-beats hint text is gone.
- **Review round 6 (2026-09-30).**
  - **Beat terms are Pursue / Pursued / Finish / Finished** ("Pursued Beats" on the character sheet and the Beat Tracker). A finished beat shows only Finished (no Pursue).
  - **Abilities: Learn / Learned** (green), no confirmation; the GM can un-learn. A major ability's options sit in columns beneath it.
  - **Class sheet:** core skill and domain moved from the header to the top of the Overview ("Skill & Domain"); the class resource has no on / off toggle; the pick marks are centred on their options; the resource / equipment column is wider.
  - **Roll prompt:** Domain before Skill (and in the title); clearer Mastery tooltip. Stakes: the stress die defaults to D4, without the extra hint.
  - **Roll cards** centre their summary, dice, outcome and notes, with larger dice faces and chat-sized buttons.
  - **Header slots:** ancestry / class / calling view and delete icons float translucent over the name (full strength on hover), so long names stay readable.
  - Fixed: the Fallout container swallowed Abilities after round 5's move (a missing closing tag).
  - Plan written for choosing fallout from the roll card: `docs/plans/heart-fallout-roll.md` (monorepo root).
- **Review round 5 (2026-09-30).** Beat terms are final: **Activate / Active / Finish / Finished**; Finish stays neutral until the beat is finished, Finished is green. The calling's Beats tab stacks Activate over Finish (more room for the text), drops the Minor / Major label on each row (the section says it), and its section titles stick to the top of the window while scrolling. Fallout sits between Active Beats and Abilities on the character sheet. The Roll die is centred under its label.
- **Review round 4 (2026-09-30).**
  - **Abilities unlock, permanently.** On a character's class, each non-core ability shows Unlock (with a confirmation) or Unlocked; players can't lock one again, the GM can (click Unlocked). The class's on / off toggles remain only on an unowned class. The character sheet's Abilities title gets an eye that opens the class on its Abilities tab, and its "+" says "Create New Ability".
  - **Beat buttons** are smaller, centred on their row, and completion is green (Complete outlined green; Completed filled green).
  - **Container titles** centre their name, count, eye and "+" against each other.
  - **Header rolls:** Roll is a square on the left (label over the die); Stress sits above Fallout on the right.
  - **Skills above Domains**, each full width, so knacks have room.
  - **No generic Complete toggle** in item sheet headers: resources showed one (the upstream data model marks resources "completable"; a completed resource disappears from lists). Beats keep their own buttons.
  - **Calling sheet counts the same active beats as the character sheet** (its own plus beats added straight to the character).
- **Beats and rows, round 3 (2026-09-30 review).** Activate and Complete sit side by side; "Completed" stays red like "Active" (the row still greys out). The "1 of 2 beats active" line no longer carries a "Choose another" link (the eye in the title opens the calling). Beat and ability rows on the character sheet have no edit button (edit beats from the calling, abilities from the class). "Inactive Items" is now **Inactive Gear** on every sheet. Every "+" that makes a new item says so on hover: Create New Beat / Equipment / Resource / Item.
- **Adversary sheet on one page (2026-09-30 review).** No tabs: the stat block's two columns, then Description and GM Notes full width below; the tab strip is a static red banner (as on the delve).
- **Character sheet (2026-09-29 / 30 review).** Skills and Domains rows form a grid sized by how many there are (one row alone, otherwise two columns only as wide as their rows), centred horizontally and vertically in each box. The header's ancestry, class and calling slots share one rule: the name truncates with an ellipsis and the view / delete buttons stay on the same line (the ancestry buttons used to wrap under the name).
- **Type system (2026-09-29, from the "Heart Type System" mock, Roomy scale).** Every stylesheet now uses five text styles defined once in `util.sass` (display, section, label, body, secondary) plus a chip style for choices and buttons, instead of about 25 hand-picked sizes and a mix of fonts. Mosherif is kept for names, titles, tabs and header labels; choice chips and buttons are Alegreya SC (chosen over Mosherif and plain Alegreya); small labels are Alegreya SC small caps; body text is Alegreya at 17px across sheets and dialogs; tag names lose their italic (bold red like every term). Alegreya and Alegreya SC are now bundled (`src/fonts/alegreya/`, SIL OFL) with real bold and italic weights, replacing the Google Fonts import, so they work offline and bold text is no longer faked by the browser. The unused Melma font declaration is gone and the `'Alegrey'` typo that left the character header's inputs in a fallback font is fixed.
- **Review round 2 (2026-09-29).**
  - Character sheet Skills / Domains: no dice icons; each row is the name with its knack beside it (a two-column row, so the knack always starts on the name's line and wraps in its own column), and the whole row rolls.
  - Adversary / landmark / delve highlighting widened: the difficulty banner, the domains note, attack and danger rows (their descriptions now show under the row, like Loot), and haunt services (resistance names in term red). Landmarks with gear get an Equipment panel (the one book landmark with gear was invisible while active).
  - Roll / Roll with Mastery prompt: larger description, headings and chips, the window sizes to its content, and difficulty is separate buttons like every other choice (also in Prepare Roll Request). **Help** is now **Helpers** with a line explaining the rule (HCB p. 76: each helper with a relevant skill or domain adds a d10 and takes the same stress); the roller is never offered as their own helper, the list is the party (player-owned characters) when there is one, and the section is hidden when nobody else could help. Heart roll cards name the helpers and remind that they take the same stress (the system does not mark it for them).
  - Question answers on the calling / ancestry sheets and the Biography tab are italic.
  - Class sheet on a character: GM equipment-group add / delete controls are hidden (they edit the class, not the character's pick).
  - Game text proofread for case so the highlighter catches it ("Minor Mind Fallout", "Blood Protection", "Ranged" as a tag): 139 core-book strings in `en.json` plus the fvtt-heart-content YAML. Case only; no wording changed. A capitalised "Fallout" on its own ("Mind Fallout") now highlights.

### Fixed

- **Opening an item sheet replaced the item's icon (2026-09-30).** The shared sheet code (`common/sheet.js`, from upstream) set `item.img` to the sheet type's default image every time a sheet rendered, and `data.item` is the live item, so opening any class, calling or ancestry (from a character or a compendium) swapped its own icon for the drum / monument in memory everywhere until a relaunch. It now fills in the default only for items without an image. Also: icons no longer wrap onto their own line (an icon and its word never split; the Resistances name column sizes to its content), section-title counts share the title's baseline (class Minor / Major / Zenith Abilities), and the class Domain & Skill cells put the label over the value with the glyph full height to their right.
- **Calling sheet showed stale beats (2026-09-30).** Activating, deactivating or finishing a beat in the calling's Overview often didn't show until the next change. Foundry re-rendered the sheet before the calling's child beats were refreshed, and the refresh's own render request was dropped because a render was already running. Child documents now refresh first (`items/index.js`), so every sheet renders the new state.
- **Rolls (2026-09-30 audit):** Impossible threw a formula error and posted nothing (now a "Failure" card with Take stress); Dangerous with exactly two dice read the higher die instead of one fresh d10 on the Difficult table; a roll crashed when nobody else could help; any knack text forced mastery on every roll of that skill; skill / domain rows passed a label instead of the id; the highlighted "kept" die could be a removed one on ties; the fallout roll was offered even when Protection stopped all the stress; closing a picker left the caller waiting forever.
- **Protection shields rendered as faint dotted outlines** on the character sheet: the shared mark rule (outline, transparent fill) tied with the shield rule on weight and won on load order, so only its border showed through the shield mask. The shield rule now outranks it. The character header's buttons read "Stress" and "Fallout" (the die icon already says "roll").
- **Compendium folders were flattened.** Heart replaced Foundry's whole compendium template with a flat list (to translate lang-key names), so in-pack folders never showed: landmark tiers, adversary difficulties and so on. Foundry's template is back (folders, sort, search modes, collapse); only the entry row is Heart's (`templates/sidebar/compendium-index-partial.html`). `src/templates/apps/compendium.html` is no longer used.
- **Class sheet equipment rows were scrambled** ("( d6 / Kill )" spread over lines): the item-sheet header's two-row chip grid also caught the rows' own `.item-stats`. Now scoped to the header. Header chips no longer wrap under the torn edge in narrow windows.

- **Review round 1 (2026-09-29): character sheet and adjacent sheets.**
  - Item sheet header chips are larger, sit at the left next to the name and stack two high (class skill / domain, ability tier / Active, fallout severity / resistance). The item name is text-coloured, not red. Simple item sheets (fallout, tag, beat, ...) size to their content instead of opening at 600px.
  - Pluses after section titles are much smaller everywhere.
  - Ancestry: no Active toggle (an ancestry is always active); the prompt says to answer each question; placeholder "Not answered yet."; a small pencil right after each question opens a tall answer editor. Calling questions work the same way.
  - Class Overview: equipment is one "You get" section plus one "Pick one" section per choice, with the options inside separated by thin red lines and a grey/red mark for the chosen option (Blightborn's weapon and kit choices are two sections). Previously every option was its own section.
  - Calling Beats tab: minor, major and zenith are full-width sections stacked top to bottom, two beats per row inside; the Active / Set active chips are larger.
  - Delve: one page (no Notes tab); Notes sits under Connection and Description, and the tab strip is a plain red banner.
  - Landmark / delve domain editing keeps the check mark on the same line as the input.
  - Adversaries imported before the field split (flavour text in GM Notes, empty Description) are fixed on first open by an owner: the text moves to Description, the "Example names" / "Domains" lines move to the Profile fields, and GM Notes is left empty. Only adversaries from fvtt-heart-content are touched.

### Fixed

- **Item sheets had a large gap under the header** (a shared rule let the empty tab-strip spacer grow to fill the window).
- **Ancestry / calling questions (2026-09-29 review).** From a compendium, GMs saw every question twice (the text plus an editor for the question itself) with Delete links and a "+" to add questions. Questions are now a read-only, dense list with thin red separators, under a separate muted prompt line; no add / delete. On a character each question has its answer editor, with a placeholder until it's answered.
- **Item sheet description panels were titled with the item's name** (the fallback keyed on `title`, which Foundry already sets to the window title); the parameter is now `panelTitle`. The item name in the header was also being centred above the type line by an old shared rule; overridden.
- **Adversary "Default Difficulty" banner** showed the level currently selected in the header. It now shows the book's default (`system.difficulty`), and only when that differs from the selected level; the Profile field is labelled "Default difficulty".

- **Item sheets on a shared chrome (2026-09-29, approved "Heart Interface Sweep").** `items/base/sheet.html` is now a compact torn header (icon, name, type line with the owning class/actor, key stats as chips, automatic Active / Complete toggles) plus a body of titled containers; sheets supply `item-stats` / `item-tabs` inline partials and their body. Shared pieces: `items/base/description.html` (pencil-in-title description panel), `items/base/tags.html` (tags with their rule text inline), `items/base/item-sheet.sass`, and base-sheet behaviour for tabs, toggle chips, rolling the item's own die from the header, pencil editors and the quantity stepper. Item sheets open at 720 x 600.
  - **Class:** core skill / domain chips; Overview tab (resource, equipment groups with solid chosen / dashed unchosen options, description) and Abilities tab (one container per tier with counts; core, minor and zenith in a two-column grid).
  - **Ability** (tier chip, upgrades panel), **Equipment** (skill + die chips, "Deals stress to" / "Heals" resistance chips replacing the tick boxes, tags, description), **Resource** (domain + die), **Item** (quantity stepper), **Beat** (level), **Fallout** (severity + resistance; Effect panel), **Haunt** (upgrade track + up/down in the header, services rows), **Tag** (uses; Rule panel), **Ancestry** (description beside questions).
- **Adversary header polish (2026-09-29 review).** Resistance and protection marks share one size (13px squares, 14px shields), render as blocks so they centre on their labels, and wrap in even rows of ten (two groups of five); the tracks box grows for a two-row track. The difficulty banner now leads with "Default Difficulty: <level>". Profile domain chips are larger.
- **Options picker (2026-09-29 review).** Search removed; group headings larger. The W&M pack labels are spelled out ("Classes - Ways and Means", "Callings - Ways and Means", in fvtt-heart-content).

- **Landmark and delve sheets redesigned (2026-09-29, approved mockup)** in the adversary sheet's design. Landmark: header with name, tier, domain chips (pencil toggles an input) and the default stress die (select + click to roll); **Landmark** tab with Haunts (compact rows: services as rollable "Blood d8", upgrade track with up/down; services edited on the haunt's sheet), Resources with notes, Special Rules and Potential Plots; **Lore** tab with description and new GM notes (`system.notes` added). Delve: header with name, tier, resistance track (groups of five, editable max) and domain chips; **Delve** tab with Dangers (its equipment), Resources, Connection and Description; **Notes** tab. Delve domains/tier accept both the array the model declares and the text the old sheet wrote.
- **Shared panel-sheet layer** (`src/common/panel-sheet.js` + `.sass`): tabs, actor tracks (click the last marked box again to clear), pencil-opens-editor panels, edit toggle and die rolls for the adversary, landmark and delve sheets; the adversary sheet was moved onto it.

- **Adversary sheet redesign (2026-09-29, approved mockup).** Built on the character sheet's chrome (torn header, tab strip, titled containers). Header: portrait, name, difficulty level (select), resistance track in groups of five with an editable max, protection as shields. **Stat Block** tab: Attacks and Loot rows (loot shows each resource's note), Profile (domain chips, domain note, names; pencil toggles inline editing), Special / Descriptors / Motivation panels (pencil in the title opens the editor), inactive items only when there are some, and a note under the tabs when the book's difficulty text says more than the level. **Lore** tab: description + GM notes. Opens at 920 x 780. New adversary fields: `level`, `domains`, `domainsNote`, `description` (`notes` is now the GM's own notes).
- **Character Options picker (2026-09-29).** The "+" on the Ancestry / Class / Calling slots (header and Biography) opens one searchable window listing every option of that type from every visible Item compendium plus world items, grouped by source. Click a name or the eye to preview; Choose adds it through the sheet's normal drop path (replacing an existing class/calling).
- **Skills and domains highlighted in ability text (2026-09-29).** Ability rows run their text through `src/common/terms.js` (`heartTerms` helper): every skill/domain name becomes bold accent red, "Skill+Domain" rolls stay one unit, existing bold text is untouched, and sentence-start words like "Wild animals" are skipped. Render-time, so core, W&M and future content all get it without data edits.

### Fixed

- **Haunt upgrade tracks could not be cleared** (landmark rows and the haunt sheet both compared against `.data`, undefined on v12). The "Potential Plots" heading also read "Potential Plot".
- **Skills / Domains pickers could not save.** Knack boxes are `<textarea>`s but only `input[type=text]` changes were saved, and the templates had no `<form>` for FormApplication to submit. Both are now real forms with Cancel / Save buttons (`_updateObject` updates the actor); headings are text colour.
- **Skill and domain "+" / dice icons did nothing.** Only the name was clickable; the whole row now rolls.

### Changed

- **Rows:** equipment and resource rows always read skill (plus resistances) or domain first, then the die, with spacing from CSS instead of template line breaks (the old markup left a wide gap after the skill).
- **Knacks** show just their text under the skill/domain (no "Knack" prefix).

- **Character + Biography tab review, batch 2 (2026-09-29).**
  - Stress total and its `showTotalStress` setting are back (batch 1 had removed them).
  - Resistances header and rows now share one grid, so "Stress" and "Protection" sit exactly over their columns; the gap between the two groups of five boxes is tighter everywhere (1rem -> 0.45rem).
  - Character tab section spacing reverted to the pre-batch-1 gaps.
  - Header Roll / Roll Stress / Roll Fallout buttons turn red on hover.
  - Equipment and resource rows: the skill (Kill, Delve...) or domain and the rollable die read in accent red with a red die icon; tags are italic. Applies wherever those rows appear.
  - The Ancestry / Class / Calling "+" prompts open EVERY visible compendium that holds that item type (core book and Ways & Means side by side), not one hardcoded pack.
  - Biography order: Notes, Calling, Ancestry, Class (class moved to the bottom).
  - Class item sheets open at 1050 x 900 (were Foundry's 560px item default).

### Fixed

- **Switched-off class equipment vanished.** Toggling a class's equipment off from the character sheet removed it from the Equipment list, but the Inactive Items box only listed items owned directly by the character, so it could not be switched back on. Inactive Items now also lists switched-off class equipment (from groups still selected on the class) and class resources; they can be re-activated but not deleted there.
- **Adversary resistance/protection boxes could not be cleared.** The "click a marked box again" handler read `this.data`, which is undefined on v12 sheets; it now reads the actor.

- **Character + Biography tab review, batch 1 (2026-09-29).**
  - Header: Roll sits alone on the top row, Roll Stress + Roll Fallout below it. Empty-slot prompts unified: "Select an Ancestry / a Class / a Calling".
  - Character tab: container titles in text colour (red was hard to read on charcoal); about half the space between sections (titles use a 20px line box so they protrude less, smaller container padding and gaps; scoped to the Character tab so Skills & Domains is unchanged). Resistances: the Protection info icon and the "(Total: N)" stress total are gone, and the header row sits tight under the title. The `showTotalStress` client setting was removed with it.
  - Biography tab: Notes (the player's own background) moved to the top, with its edit button in the section title like the others (it opens the notes editor inline; Foundry's floating editor button is hidden). Calling, class and ancestry descriptions are body-size and left-aligned (were 24px centred). The red rule no longer closes the question-less class block. Section edit/add icons now just turn red on hover (they used to gain a padded red pill and jump in size).
- **Paragraph spacing (2026-09-29).** Rich text everywhere (the `notepad` mixin) and the class/calling/haunt item sheets now leave a blank-line gap between paragraphs; upstream zeroed it, so every multi-paragraph description read as one block.

### Fixed

- **Core class descriptions without paragraph breaks.** Cleaver, Deadwalker, Hound, Incarnadine and Witch were single unbroken strings in `en.json`; they now carry the book's paragraph breaks (3/2/4/4/3 paragraphs, located from the text layer of each class PDF, words unchanged). Witch's description also had the following "Core Traits" heading pasted onto its end; removed. Deep Apiarist, Heretic, Junk Mage and Vermissian Knight already matched the book.

- **Dark visual identity (2026-09-29).** The whole system is now dark by default: layered charcoal surfaces, off-white text and blood-crimson accents in three tiers with fixed jobs (deep red for fills such as the tab strip, buttons and chat speaker bars; mid red for borders and dividers; bright red for all red text, headings, links and marked states). Palette approved via a preview page, with Luke's corrections: empty stress boxes use the same grey as empty protection shields and turn bright red when marked; skills/domains in ability text are accent red; item quantity is plain text colour.
  - Every colour in all 19 stylesheets now goes through semantic roles in `src/util.sass` backed by CSS custom properties defined in the new `src/theme.sass`; no literal colours remain outside the palette. The old ambiguous names (`$red`, `$white`, `$black`, `$grey`, ...) are gone, so a stale reference fails the build.
  - New per-user client setting **Colour Scheme** (Dark default / Light), applied at `init` via `html[data-heart-scheme]` and switched live with no reload. Light approximates the previous white sheet.
  - In dark mode Foundry's own windows follow too (journals, roll tables, dialogs, settings, file picker): the parchment background and the core `--color-text-dark-*` / `--color-border-light-*` variables are re-pointed inside `.window-app .window-content` and chat messages only; inputs, buttons, content links, inline rolls and table stripes are restyled with `:where()` so any Heart or module rule still wins. Light mode leaves Foundry untouched.
  - Chat cards: charcoal card, mid-red border, deep-red speaker bar; whispers/blind rolls recessed with a dashed edge. The duplicate chat-card block in `index.sass` was folded into `chat-message.sass`.

- **Character sheet density pass (2026-09-29).** Same text sizes, roughly half the whitespace. Header ~180px -> 124px and tab strip ~90px -> 60px (geometry now in SASS variables at the top of `character.sass`), container padding 1.5rem -> 0.6rem with titles centred on the border line, resistances panel packed (content-sized columns fix the Protection info icon overflowing the box), tighter skill/domain rows, item rows and biography blocks. Header boxes have fixed 30px rows, which fixes the "Roll Fallout" button hanging through the bottom border.
- **Pronouns input removed from the sheet header (2026-09-29)** - to return later; `system.pronouns` data is kept.
- **Biography order is now Calling, Class, Ancestry (2026-09-29).** The calling block's nested `<form>` became a `<div>`.
- **No lines under text anywhere (2026-09-29).** The `notepad` mixin no longer paints ruled-paper lines behind rich text (descriptions, notes, answers), and a global rule removes heading underlines (Foundry core h1-h3, Heart dialog section headings) in every window while Heart is loaded.

### Fixed

- Build noise: webpack `performance.hints` off (bundle-size advice is irrelevant for locally loaded files) and the stray `console.log(process.argv)` in `build-manifest.js` removed.

### Added

- **Generic `item` type (2026-09-29).** A new Item type "Item" for anything a character carries that has no roll automation (trinkets, keepsakes, loot): name, image, description, quantity. Own sheet (base sheet + quantity), own preview row (quantity badge when > 1), and an "Items" container on the character sheet's Character tab beside Equipment and Resources. Dropping a second copy of an Item with the same name onto a character stacks the quantity instead of being rejected as a duplicate. Generic items are not given the `active` flag on drop.
- **Ancestry questions (2026-09-29).** Ancestry items now carry `system.questions` (`{ <id>: { question, answer } }`) with the same add/delete/answer UI as callings. The character sheet's Biography tab shows Ancestry (description + answerable questions) and Class (description) blocks above the existing Calling block, each with an edit shortcut and a compendium prompt when the slot is empty. Ancestry items authored before this change have no questions until re-imported.

### Fixed

- **Content-link enrichment for `@UUID[...]` (2026-09-29).** The chat/text-editor override that renders Item links as previews only handled `@Item[...]` and legacy `@Compendium[...]`; any `@UUID[...]` link (RollTable draws, modern journal links) fell through with an unresolved document and threw, which broke enrichment of the whole message. All link forms now resolve via `fromUuid`, Items with a preview partial render as draggable previews, everything else uses Foundry's default link. Debug logging removed.

### Changed

- **Compendium sidebar organization (2026-08-25).** System packs now group into two sidebar folders (`packFolders` in `src/manifest.json`): "Heart - Core Options" (Classes, Callings) and "Heart - System Reference" (Fallouts, Tags, Useful Heart Macros). Labels stay unqualified; the folder taxonomy pairs with the fvtt-heart-content module's "Heart - Expanded Options" / future "Heart - GM Content" so the four folders alphabetically sort into reading order. Presentation-only; pack names/ids unchanged, so no compendium UUIDs break.

### Fixed

- **Pack-data content audit (2026-08-25).** Audited the classes/callings packs against the source books (via user-supplied condensed reference + PDF text-layer extraction). Six upstream data bugs fixed in `pack-data/`:
  - Cleaver's cleaver weapon was `D6`; the book says **Kill D8** (Brutal, Tiring).
  - Heretic was missing the minor ability **Blessed Deprivation** (text already existed in lang files; the yaml entry was absent so it never packed).
  - Hound was missing the minor ability **Hard As Nails** (same pattern).
  - Hound's class resource (Bottle of rotgut liquor) was missing its `dice`/`domain` (**D6 Haven**).
  - Incarnadine's Crave was missing its **Viral** nested upgrade (lang text existed; yaml entry absent).
  - Witch's Physiker's Bag `resistances` was a scalar (`blood`) instead of a list, producing a malformed string instead of `["blood"]` in packed data.
  - Forced calling had 19 minor beats instead of 20: `beats.minor.3` in `en.json` was two book beats merged into one string. Split into `minor.3` + new `minor.19` (pt.json already had the correct first half) and added the new key to `callings.yaml`.
- All fixes are data-layer only (no book text added beyond what upstream's lang files already publish) - safe for the public fork. Requires `npm run build-all` to re-pack.

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
