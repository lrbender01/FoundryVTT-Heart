import templates from './**/*.@(html|handlebars|hbs)';
import './index.sass';
import './common/sheet.sass';
import { emphasizeTerms, emphasizeTermsText, registerJournalTerms } from './common/terms';
import { registerIconHelpers, adoptPackIcons, DEFAULT_IMGS } from './common/icons';
import { registerArtHelpers, registerArtViewer } from './common/art';
import { registerRowArt } from './common/row-art';
import { migrateFalloutSource } from './items/fallout/migrate';
import { removeRetiredBondActors } from './bonds/migrate';
import { migrateAdversaryLore } from './actors/adversary/migrate';
import { heartDialogOptions } from './common/dialog';
import { registerHeartTooltips } from './common/tooltip';
import { registerRelay } from './common/relay';
import { ART_SETTING, applyArtClass, carryOldArtSetting, redrawArtWindows } from './common/art-toggle';
import { startupVersions } from './common/versions';
import { localizeHeart } from './common/localize';
import { GLASS_SETTING, SEE_THROUGH_SETTING, BLUR_SETTING, TINT_SETTING, applyGlassClass, applyGlassGround, applyGlassPass } from './common/glass';
import { isRepeatable } from './items/ability/repeat';
import { registerGrantCleanup } from './items/trinkets';
import { clearedTraits, coreTraitsOf } from './actors/character/traits';
import { registerTotalStressSync, correctTotalStress } from './actors/character/total-stress-sync';
import { registerTokenDefaults } from './actors/token-defaults';

import modules from './**/index.js';

function activateTemplates() {
    templates.forEach(function (module) {
        const template = module.default;
        const compiled = Handlebars.compile(template.source);
        Handlebars.registerPartial(template.path, compiled);
    });
}

// Setting names, hints, and choices are lang keys (heart.settings.<key>.*,
// 2026-10-21): Configure Settings localizes them when it draws
function registerSettings() {
    game.settings.register('heart', 'showStartupMessage', {
        name: 'heart.settings.showStartupMessage.name',
        hint: 'heart.settings.showStartupMessage.hint',
        scope: 'client',
        config: true,
        default: true,
        type: Boolean,
    });

    // (showTextboxesBelowItems, showStressInputBox, and preSelectStressType
    // were removed 2026-09-30, Luke: nothing read them any more)

    game.settings.register('heart', 'showStressRoll3dDice', {
      name: 'heart.settings.showStressRoll3dDice.name',
      hint: 'heart.settings.showStressRoll3dDice.hint',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
    });

    game.settings.register('heart', 'showFalloutRoll3dDice', {
      name: 'heart.settings.showFalloutRoll3dDice.name',
      hint: 'heart.settings.showFalloutRoll3dDice.hint',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
    });

    game.settings.register('heart', 'showTotalStress', {
      name: 'heart.settings.showTotalStress.name',
      hint: 'heart.settings.showTotalStress.hint',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
    });

    // The books' art, one switch per user (2026-10-02, Luke; common/
    // art-toggle.js): the Art button in any window's title bar flips it for
    // every window. Replaced showCharacterArt and hiddenItemArt.
    game.settings.register('heart', ART_SETTING, {
      name: 'heart.settings.showArt.name',
      hint: 'heart.settings.showArt.hint',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
      onChange: redrawArtWindows,
    });
    carryOldArtSetting();
    applyArtClass();

    // Glass sheets, one switch per user, off unless chosen (2026-10-02,
    // Luke; common/glass.js): the Glass button in any sheet's title bar
    // flips it for every window at once (a body class, no redraw)
    game.settings.register('heart', GLASS_SETTING, {
      name: 'heart.settings.glassSheets.name',
      hint: 'heart.settings.glassSheets.hint',
      scope: 'client',
      config: true,
      default: false,
      type: Boolean,
      onChange: applyGlassClass,
    });
    // see-through to the scene behind a glass sheet, and the blur over it
    // (2026-10-02, Luke): live, per user
    game.settings.register('heart', SEE_THROUGH_SETTING, {
      name: 'heart.settings.glassSeeThrough.name',
      hint: 'heart.settings.glassSeeThrough.hint',
      scope: 'client',
      config: true,
      // 25: Luke's pick after living with the glass (2026-10-21; 60 from
      // the first tuning, 2026-10-02, let too much through)
      default: 25,
      type: Number,
      range: { min: 0, max: 90, step: 5 },
      onChange: applyGlassPass,
    });
    game.settings.register('heart', BLUR_SETTING, {
      name: 'heart.settings.glassBlur.name',
      hint: 'heart.settings.glassBlur.hint',
      scope: 'client',
      config: true,
      // 6 to start (Luke, 2026-10-02: 3, 6, or 10 are the usual glass)
      default: 6,
      type: Number,
      range: { min: 0, max: 30, step: 1 },
      onChange: applyGlassPass,
    });
    // how strong each layer of glass is (2026-10-02, Luke: one glass, its
    // darkness from depth; common/glass.js glassLayers)
    game.settings.register('heart', TINT_SETTING, {
      name: 'heart.settings.glassTint.name',
      hint: 'heart.settings.glassTint.hint',
      scope: 'client',
      config: true,
      // 80: Luke's pick after living with the glass (2026-10-22; 25 from
      // the first tuning, then 60), and the range opened to 90 so it can go
      // darker
      default: 80,
      type: Number,
      range: { min: 0, max: 90, step: 5 },
      onChange: applyGlassPass,
    });
    applyGlassClass();
    applyGlassGround();
    applyGlassPass();

    // Set once the older adversaries' lore has been moved out of GM Notes
    // (actors/adversary/migrate.js, 2026-10-02): it never runs again
    game.settings.register('heart', 'adversaryLoreMigrated', {
      scope: 'world',
      config: false,
      default: false,
      type: Boolean,
    });

}

// Colour scheme (2026-09-29). Dark is the system default; each user can pick
// Light. The value is mirrored onto <html data-heart-scheme="..."> and the
// palette in src/theme.sass keys off it, so switching is live (CSS custom
// properties) with no reload. Registered at init, not ready, so the right
// palette is in place before the first sheet renders.
function applyColourScheme(scheme) {
    document.documentElement.dataset.heartScheme = scheme === 'light' ? 'light' : 'dark';
}

function registerColourScheme() {
    game.settings.register('heart', 'colourScheme', {
        name: 'heart.settings.colourScheme.name',
        hint: 'heart.settings.colourScheme.hint',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            dark: 'heart.settings.colourScheme.dark',
            light: 'heart.settings.colourScheme.light',
        },
        default: 'dark',
        onChange: applyColourScheme,
    });
    applyColourScheme(game.settings.get('heart', 'colourScheme'));
}

function initialise() {
    registerColourScheme();
    // every setting at init (2026-10-02): the chat log draws its item link
    // previews before ready, and those read the art switch
    registerSettings();
    // the GM's client answers the writes players' clients ask for
    // (common/relay.js); listening from init so no request is missed
    registerRelay();
    registerJournalTerms();

    // Compendium windows keep Foundry's own template (folders, sort, search
    // modes, collapse); only the entry row is Heart's, so the core packs'
    // lang-key names are translated. (Until 2026-09-29 the whole template was
    // replaced by a flat list, which dropped every in-pack folder.)
    Compendium.entryPartial = 'heart:templates/sidebar/compendium-index-partial.html';

    activateTemplates();

    game.heart = {
        difficulties: ['standard', 'risky', 'dangerous', 'impossible'],
        resistances: ['blood', 'mind', 'echo', 'fortune', 'supplies'],
        // Provisions house rule (2026-09-30): one party-wide track on the
        // party actor. `resistances` stays the five a character has; places
        // that pick what a stress roll marks use stress_targets.
        party_resistances: ['provisions'],
        stress_targets: ['blood', 'mind', 'echo', 'fortune', 'supplies', 'provisions'],
        // what a Fallout can hit: a delver's five, the party's Provisions, and
        // a bond (hirelings' "[Minor, Bond]", W&M W67; 2026-10-01)
        fallout_resistances: ['blood', 'mind', 'echo', 'fortune', 'supplies', 'provisions', 'bond'],
        skills: ['compel', 'delve', 'discern', 'endure', 'evade', 'hunt', 'kill', 'mend', 'sneak'],
        domains: ['cursed', 'desolate', 'haven', 'occult', 'religion', 'technology', 'warren', 'wild'],
        stress_dice: ['d4', 'd6', 'd8', 'd10', 'd12'],
        die_sizes: ['d4', 'd6', 'd8', 'd10', 'd12'],
    };

    console.log(`heart | Registering ${modules.length} modules`);
    modules.forEach(module => {
        if (module.initialise !== undefined) {
            module.initialise();
        }
    });

    Handlebars.registerHelper('ordered-checkable', function (value, max) {
        let output = '';
        for (let i = 0; i < max; i++) {
            output += `<a data-index="${i}" class="ordered-checkable-box${i < value ? ' checked' : ''}"></a>`;
        }
        return output;
    });

    Handlebars.registerHelper('join', function (separator, ...items) {
        const options = items.pop();
        const array = options.hash.array || [];
        return [...items, ...array].join(separator);
    });

    // (concat and not went 2026-10-21, Luke: Foundry core registers both,
    // and Heart's two-part concat replaced core's for every template in the
    // world; titlecase, randomID, notification, getHeartResistances,
    // ownsAnyActors, and some went too: no template used them)

    Handlebars.registerHelper('undef', function (a) {
        return a === undefined;
    });

    Handlebars.registerHelper('includes', function (array, item, options) {
        if (array === undefined) {
            console.warn('includes has undefined array', array, item, options);
            return false;
        }
        return array.includes(item);
    });

    // loose number equality, as == was: 1 and "1" match, null only null
    // (written out for eqeqeq, 2026-10-21)
    Handlebars.registerHelper('numEq', function (a, b) {
        if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
        if (typeof a === typeof b) return a === b;
        return Number(a) === Number(b);
    });

    Handlebars.registerHelper('getActor', function (id) {
        return game.actors.get(id);
    });

    Handlebars.registerHelper('itemIsKillOrMend', function (itemType) {
      return ["kill", "mend"].includes(itemType);
    });

    // (common/localize.js; still a window global for code that reads it so)
    window.localizeHeart = localizeHeart;

    Handlebars.registerHelper('localizeHeart', localizeHeart);

    // Skills and domains in ability text render bold + accent red
    // (src/common/terms.js). Returns HTML, so use it in a triple-stash.
    // {{heartPlain html}}: the text of some HTML, one line, for tooltips
    // (tag rules on hover, 2026-09-30)
    Handlebars.registerHelper('heartPlain', function (html) {
        const el = document.createElement('div');
        el.innerHTML = String(html ?? '');
        return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    });

    // {{{heartTerms text}}}; refs=true also marks capitalised ability
    // references (ability, class, and calling text; common/terms.js)
    // {{#if (heartRepeatable item)}}: an ability learnable more than once
    Handlebars.registerHelper('heartRepeatable', (item) => isRepeatable(item));

    Handlebars.registerHelper('heartTerms', function (html, options) {
        return emphasizeTerms(html, { abilityRefs: Boolean(options?.hash?.refs) });
    });
    // {{{heartTermsText text}}}: the same for plain text a player typed,
    // escaped first (Luke, 2026-10-21: typed markup ran as HTML)
    Handlebars.registerHelper('heartTermsText', function (text, options) {
        return emphasizeTermsText(text, { abilityRefs: Boolean(options?.hash?.refs) });
    });

    // {{{heartGlyph kind id}}} / {{{heartIcon img}}} (common/icons.js)
    registerIconHelpers();
    // {{{heartArt doc place}}} (common/art.js)
    registerArtHelpers();
    // a shared picture opens in Heart's art viewer (common/art.js, 2026-10-03)
    registerArtViewer();
    // gear row art lifts and opens the gallery on a click, in any window
    // (common/row-art.js, 2026-10-02)
    registerRowArt();
}

Hooks.once('init', initialise);

Hooks.once('ready', function () {
    // Heart's data-tooltip elements: themed, shown as plain text (common/tooltip.js)
    registerHeartTooltips();
    // older class / calling / ancestry copies take their compendium icon (GM)
    adoptPackIcons();
    // fallout source lines out of the effect text, into system.source (GM, once)
    migrateFalloutSource();
    // leftover "bond" Actors from an earlier version, which can't load (GM)
    removeRetiredBondActors();
    // older adversaries' lore out of GM Notes, once per world (GM)
    migrateAdversaryLore();
    // characters' stored total Stress put right where it is out of step (GM)
    correctTotalStress();
    showStartupNotice();
});

// The startup notice (Luke, 2026-10-21): a plain async function with its own
// catch. It ran inside new Promise(async ...), which turned any error into an
// unhandled rejection with no context, and it read the changelog from the
// active language alone: es and it have none, so it threw for those users and
// the notice never opened (pt's stopped at an older version). The changelog
// is English only, so it comes from English, the fallback every language has
// (common/versions.js startupVersions).
async function showStartupNotice() {
    try {
        if (game.settings.get('heart', 'showStartupMessage')) {
            const versions = startupVersions(game.i18n.translations, game.i18n._fallback);
            let d = new Dialog({
                title: game.i18n.format("heart.dialog.title(VERSION)", { VERSION: game.system.version }),
                // newest first, by number (as text "v0.10" sorted below
                // "v0.8", so the current version was never first, 2026-10-03)
                content: await renderTemplate('heart:templates/startup.html', { versions, version: game.system.version }),
                buttons: {
                    close: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("heart.dialog.skip"),
                        callback: () => { }
                    },
                    prevent: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("heart.dialog.dont-show-again"),
                        callback: () => game.settings.set('heart', 'showStartupMessage', false)
                    }
                },
                // "close" (Skip): the default named a "skip" button that does
                // not exist, so no button was the default (2026-09-30). Enter
                // still closes; Don't Show This Again is the red one
                // (application.sass .heart-startup, 2026-10-03, Luke)
                default: "close",
                render: html => {
                    const tabs = new Tabs({ navSelector: ".tabs", contentSelector: ".content", initial: `v${game.system.version}` });
                    tabs.bind(html[0]);
                    // the intro opens in its own window (2026-10-03, Luke)
                    html.find('[data-action=open-intro]').click(ev => {
                        ev.preventDefault();
                        game.heart.applications.HeartIntroApplication?.open();
                    });
                },
                close: html => { }
            }, heartDialogOptions({ classes: ['heart-startup'] })); // a Heart window: themed, chip buttons (common/dialog.js)
            d.render(true);
        }
    } catch (err) {
        console.error('heart | startup notice', err);
    }
}



// Documents copied from an old pack whose names were lang keys
// ("class.cleaver.name") get the translated name. Only a dotted lowercase
// key path is looked up (2026-10-02): an ordinary name such as "trinket" or
// "Roll" is never a key and is left exactly as typed.
const LANG_KEY_NAME = /^[a-z0-9_-]+(\.[a-z0-9_()-]+)+$/;
function translateKeyName(document) {
    const name = document.name;
    if (!LANG_KEY_NAME.test(name ?? '')) return;
    const translated = localizeHeart(name);
    if (translated !== name) document.updateSource({ name: translated });
}
Hooks.on('preCreateItem', translateKeyName);
Hooks.on('preCreateActor', translateKeyName);

// A removed class's skill reset still on its way, per actor: the new class
// waits for it before marking its own core skill and domain (2026-10-01)
const pendingTraitResets = new WeakMap();

// An actor holds at most one ancestry item; dropping a new one replaces the
// old (mirroring the class/calling behavior in the character sheet) and keeps
// the header's system.ancestry text field in sync with the item name.
// A character gains its class's core skill and core domain when the class is
// added (2026-09-29 review): the class shows them in its header, and the old
// class-proxy ActiveEffects were never applied to the actor. Only turns them
// on; anything the player already has is left alone.
Hooks.on('createItem', async function(item, options, userId) {
    if (game.user.id !== userId) return;
    const actor = item.actor;
    if (item.type !== 'class' || !actor || actor.type !== 'character') return;
    // the old class's reset first (replacing a class)
    await pendingTraitResets.get(actor)?.catch(() => null);
    const updates = {};
    const skill = item.system.core_skill;
    const domain = item.system.core_domain;
    // (always written, even when already marked, 2026-10-01: a replaced
    // class's reset below must never leave the new core skill cleared)
    if (skill && actor.system.skills?.[skill]) updates[`system.skills.${skill}.value`] = true;
    if (domain && actor.system.domains?.[domain]) updates[`system.domains.${domain}.value`] = true;
    // The class icon becomes the portrait (2026-10-01, Luke) while the
    // character still shows a generic image or the icon of the class it had
    // before (flags.heart.classPortrait); a portrait picked by hand stays
    const classImg = item.img && !DEFAULT_IMGS.has(item.img) ? item.img : '';
    const portrait = actor.img ?? '';
    if (classImg && (DEFAULT_IMGS.has(portrait) || portrait === actor.getFlag('heart', 'classPortrait'))) {
        updates.img = classImg;
        updates['flags.heart.classPortrait'] = classImg;
    }
    if (Object.keys(updates).length) await actor.update(updates);
});

Hooks.on('createItem', async function(item, options, userId) {
    if (game.user.id !== userId) return;
    const actor = item.actor;
    if (item.type !== 'ancestry' || !actor || actor.type !== 'character') return;
    const stale = actor.itemTypes.ancestry.filter(x => x.id !== item.id);
    if (stale.length > 0) {
        await actor.deleteEmbeddedDocuments('Item', stale.map(x => x.id));
    }
    await actor.update({ 'system.ancestry': item.name });
});

// Removing an ancestry, calling, or class deletes the keepsake or trinket it
// granted (items/trinkets.js)
registerGrantCleanup();

// A character's stored total Stress follows its five tracks, for token bars
// (actors/character/total-stress-sync.js, 2026-10-21)
registerTotalStressSync();
registerTokenDefaults();

// Removing a class resets every skill, domain, and knack (2026-10-01, Luke;
// actors/character/traits.js): the character is starting over, and the next
// class marks its own core skill and domain (above). The character sheet
// waits for the old class to go before adding a new one, so this reset is
// sent before the new class's core skill.
Hooks.on('deleteItem', async function(item, options, userId) {
    if (game.user.id !== userId) return;
    const actor = item.actor;
    if (item.type !== 'class' || !actor || actor.type !== 'character') return;
    const remaining = actor.itemTypes.class.filter(c => c.id !== item.id);
    const updates = clearedTraits(actor.system, coreTraitsOf(remaining));
    if (!Object.keys(updates).length) return;
    const reset = actor.update(updates);
    pendingTraitResets.set(actor, reset);
    try { await reset; } finally {
        if (pendingTraitResets.get(actor) === reset) pendingTraitResets.delete(actor);
    }
});

// Deleting the ancestry item (header trash icon) clears the synced text field,
// but only when the deletion wasn't part of a replace-on-drop.
Hooks.on('deleteItem', async function(item, options, userId) {
    if (game.user.id !== userId) return;
    const actor = item.actor;
    if (item.type !== 'ancestry' || !actor || actor.type !== 'character') return;
    if (actor.itemTypes.ancestry.length === 0 && actor.system.ancestry === item.name) {
        await actor.update({ 'system.ancestry': '' });
    }
});

if (module.hot) {
    module.hot.accept();

    (async () => {
        Hooks._ids = {};
        Hooks._hooks.renderChatLog = [];
        Hooks._hooks.renderChatPopout = [];
        initialise();

        if (game.i18n !== undefined) {
            game.i18n.translations = {};
            await game.i18n.setLanguage(game.i18n.lang);
        }

        // Refresh all open windows with new css and/or html
        Object.values(ui.windows).forEach(function (window) {
            window.render(true);
        });

        if (ui.chat !== undefined) {
            ui.chat._lastId = null;
            ui.chat.element.find('#chat-log').html("");
            ui.chat._renderBatch(ui.chat.element, CONFIG.ChatMessage.batchSize)
        }
    })()
}


if (process.env.NODE_ENV !== 'production') {
    Hooks.once("quenchReady", (quench) => {
        quench.registerBatch(
            "game.packs",
            (ctx) => {
                const {
                    describe,
                    it,
                    assert,
                    beforeEach,
                    afterEach,
                } = ctx;

                game.packs.filter(pack => pack.metadata.packageType !== "world").forEach((pack) => {
                    describe(pack.metadata.id, () => {
                        function assertInnerHTML(content) {
                            describe(`${content.name} (${content.type})#${content.uuid} `, () => {
                                let document;
                                let inner;
                                beforeEach("setup", async () => {
                                    document = await fromUuid(content.uuid);
                                    let data = await document.sheet.getData();
                                    inner = (await document.sheet._renderInner(data)).text();
                                });

                                it(`doesn't contain a heart.* missed translation`, async () => {
                                    assert.notMatch(inner, /heart\.[a-z]/);
                                });
                            });
                        }

                        if (pack.metadata.type !== "Macro") {
                            describe("content generates inner html", () => {
                                pack.index.values().forEach((document) => {
                                    if (document.type !== "macro") {
                                        assertInnerHTML(document);
                                    }
                                });
                            });
                        }
                    });
                });
            }
        );
    });
}