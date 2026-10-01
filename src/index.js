import templates from './**/*.@(html|handlebars|hbs)';
import './index.sass';
import './common/sheet.sass';
import { emphasizeTerms, registerJournalTerms } from './common/terms';
import { registerIconHelpers, adoptPackIcons } from './common/icons';
import { migrateFalloutSource } from './items/fallout/migrate';
import { heartDialogOptions } from './common/dialog';
import { registerHeartTooltips } from './common/tooltip';
import { isRepeatable } from './items/ability/repeat';

import modules from './**/index.js';

function activateTemplates() {
    templates.forEach(function (module) {
        const template = module.default;
        const compiled = Handlebars.compile(template.source);
        Handlebars.registerPartial(template.path, compiled);
    });
}

function registerSettings() {
    game.settings.register('heart', 'showStartupMessage', {
        name: 'Show Startup Message',
        hint: 'Show the startup message, which provides a brief tutorial on how to use Heart.',
        scope: 'client',
        config: true,
        default: true,
        type: Boolean,
    });

    // (showTextboxesBelowItems, showStressInputBox, and preSelectStressType
    // were removed 2026-09-30, Luke: nothing read them any more)

    game.settings.register('heart', 'showStressRoll3dDice', {
      name: 'Show 3D Dice for Stress Rolls',
      hint: 'Shows 3D Dice rolls for Stress Rolls using modules like Dice So Nice!',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
    });

    game.settings.register('heart', 'showFalloutRoll3dDice', {
      name: 'Show 3D Dice for Fallout Rolls',
      hint: 'Shows 3D Dice rolls for Fallout Rolls using modules like Dice So Nice!',
      scope: 'client',
      config: true,
      default: true,
      type: Boolean,
    });

    game.settings.register('heart', 'showTotalStress', {
      name: 'Show Total Stress on Character Sheet',
      hint: 'Show Total Stress on Character Sheet',
      scope: 'client',
      config: true,
      default: true,
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
        name: 'Colour Scheme',
        hint: 'Dark (default) or Light for Heart sheets, chat cards, and Foundry windows. Applies instantly, per user.',
        scope: 'client',
        config: true,
        type: String,
        choices: {
            dark: 'Dark',
            light: 'Light',
        },
        default: 'dark',
        onChange: applyColourScheme,
    });
    applyColourScheme(game.settings.get('heart', 'colourScheme'));
}

function initialise() {
    registerColourScheme();
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

    Handlebars.registerHelper('concat', function (a, b) {
        return a + b;
    });

    Handlebars.registerHelper('undef', function (a) {
        return a === undefined;
    });

    Handlebars.registerHelper('titlecase', function (a) {
        return a[0].toUpperCase() + a.slice(1);
    });

    Handlebars.registerHelper('includes', function (array, item, options) {
        if (array === undefined) {
            console.warn('includes has undefined array', array, item, options);
            return false;
        }
        return array.includes(item);
    });

    Handlebars.registerHelper('randomID', function () {
        return foundry.utils.randomID();
    });

    Handlebars.registerHelper('numEq', function (a, b) {
        return a == b;
    });

    Handlebars.registerHelper('not', function (a) {
        return !Boolean(a);
    });

    Handlebars.registerHelper("some", function (array, condition) {
        console.debug("some helper called with:", { array, condition });
    
        if (typeof condition !== "string") {
            console.warn("Invalid condition passed to 'some' helper:", condition);
            return false;
        }
    
        return array.some(item => {
            const [key, value] = condition.split(" ");
            return item[key] === value;
        });
    });

    Handlebars.registerHelper('notification', function (target, targetName, options) {
        const fa = Boolean(target) ? 'check' : 'times';
        let type = options.hash.optional ? 'optional' : 'required';
        const title = game.i18n.localize(`heart.notification:${type}`);
        return `<span class="fas fa-${fa}-circle" data-notification="${type}" data-target="${targetName}" data-tooltip="${title}" data-type="${options.hash.type}"></span>`;
    });

    Handlebars.registerHelper('getActor', function (id) {
        return game.actors.get(id);
    });

    Handlebars.registerHelper('itemIsKillOrMend', function (itemType) {
      return ["kill", "mend"].includes(itemType);
    });

    Handlebars.registerHelper('getHeartResistances', function () {
      return game.heart.resistances;
    });

    function localizeHeart(...args) {
        let options = {};
        if (typeof args[args.length - 1] === "object") {
            options = args.splice(-1, 1)[0];
        }
    
        const key = args.join('.');
        const value = `heart.${key}`;
        const response = game.i18n.localize(value);
    
        // Debugging information
        if (response === value) {
            console.warn(`Missing localization key: ${value}`);
            console.debug("Arguments passed to localizeHeart:", args);
            console.debug("Options passed to localizeHeart:", options);
            return key; // Return the key if localization is missing
        } else {
            //console.debug(`Localized value for key '${value}':`, response);
            return response;
        }
    }

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

    // {{{heartGlyph kind id}}} / {{{heartIcon img}}} (common/icons.js)
    registerIconHelpers();

    Handlebars.registerHelper('ownsAnyActors', function (ids) {
        for (let id of ids) {
            const actor = game.actors.get(id);
            if (!actor) continue;

            if (actor.isOwner) return true;
        }

        return false;
    });
}

Hooks.once('init', initialise);

Hooks.once('ready', function () {
    registerSettings();
    // Heart's data-tooltip elements: themed, shown as plain text (common/tooltip.js)
    registerHeartTooltips();
    // older class / calling / ancestry copies take their compendium icon (GM)
    adoptPackIcons();
    // fallout source lines out of the effect text, into system.source (GM, once)
    migrateFalloutSource();
    new Promise(async function () {
        if (game.settings.get('heart', 'showStartupMessage')) {
            let d = new Dialog({
                title: game.i18n.format("heart.dialog.title(VERSION)", { VERSION: game.system.version }),
                content: await renderTemplate('heart:templates/startup.html', { versions: Object.values(game.i18n.translations.heart.versions).sort((a, b) => a.version > b.version ? -1 : 1), version: game.system.version }),
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
                // not exist, so no button was the default (2026-09-30)
                default: "close",
                render: html => {
                    const tabs = new Tabs({ navSelector: ".tabs", contentSelector: ".content", initial: `v${game.system.version}` });
                    tabs.bind(html[0]);
                },
                close: html => { }
            }, heartDialogOptions()); // a Heart window: themed, chip buttons (common/dialog.js)
            d.render(true);
        }
    });
});



Hooks.on('preCreateItem', function(document, data, options, userId) {
    document.updateSource({
        name: localizeHeart(document.name)
    });
});

Hooks.on('preCreateActor', function(document, data, options, userId) {
    document.updateSource({
        name: localizeHeart(document.name)
    });
});

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
    const updates = {};
    const skill = item.system.core_skill;
    const domain = item.system.core_domain;
    if (skill && actor.system.skills?.[skill] && !actor.system.skills[skill].value) updates[`system.skills.${skill}.value`] = true;
    if (domain && actor.system.domains?.[domain] && !actor.system.domains[domain].value) updates[`system.domains.${domain}.value`] = true;
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