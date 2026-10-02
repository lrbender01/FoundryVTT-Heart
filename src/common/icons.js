// Icons (2026-09-30).
//
// Two sets, both game-icons.net glyphs drawn white on transparent (CC BY 3.0;
// credits ship next to them):
//   - the system's sheet glyphs: static/assets/icons/{skills,domains,
//     resistances}/<id>.svg, served as systems/heart/assets/icons/...
//   - fvtt-heart-content's per-document icons for classes, callings and
//     ancestries, which it sets as each document's img
//
// Both are painted with a CSS mask in the current text colour (.heart-glyph),
// so they follow the text in either colour scheme instead of staying white
// (invisible on the light scheme's white ground).

import { termTooltipKey } from './terms';

const GLYPH_DIRS ={ skill: 'skills', domain: 'domains', resistance: 'resistances', severity: 'severity', item: 'items', section: 'sections' };
const GLYPH_IDS = {
    skill: () => game.heart?.skills ?? [],
    domain: () => game.heart?.domains ?? [],
    // the five personal tracks plus the party's Provisions (2026-09-30) and
    // Bond, a Fallout that befalls a bond or hireling (2026-10-01)
    resistance: () => [...(game.heart?.resistances ?? []), ...(game.heart?.party_resistances ?? []), 'bond'],
    // fallout severity badges: minor / major / critical (2026-09-30)
    severity: () => game.heart?.fallout_levels ?? ['minor', 'major', 'critical'],
    // item-type glyphs: section titles, tag lists (2026-09-30)
    item: () => ['ability', 'beat', 'haunt', 'tag'],
    // character sheet section titles (2026-09-30); files under
    // icons/sections/ start as an obvious placeholder until the real glyph is
    // dropped in with the same name
    section: () => ['resistances', 'party', 'fallout', 'skills', 'domains', 'equipment', 'resources', 'items', 'inactive-gear', 'notes',
        // Luke's picks from the glyph candidate sheet (2026-09-30)
        'descriptors', 'motivation', 'profile', 'special', 'plots', 'services', 'dangers', 'connection',
        'questions', 'core-traits', 'upgrades', 'effect', 'rule',
        // the Bonds section and the party's Companions (2026-10-01, Luke's
        // pick: shaking-hands, the same file as the bond resistance)
        'bonds'],
};

// The fork's generic type images (each sheet type's fallback) and Foundry's
// own defaults: a document still showing one of these has no icon of its own
export const DEFAULT_IMGS = new Set([
    'systems/heart/assets/drum.svg',
    'systems/heart/assets/monument.svg',
    'systems/heart/assets/ore.svg',
    'systems/heart/assets/battle-gear.svg',
    'systems/heart/assets/prayer.svg',
    'systems/heart/assets/skills.svg',
    'systems/heart/assets/fallout-shelter.svg',
    'systems/heart/assets/high-punch.svg',
    'systems/heart/assets/dungeon-light.svg',
    'icons/svg/item-bag.svg',
    'icons/svg/mystery-man.svg',
]);

function maskSpan(src, extraClass = '') {
    const url = Handlebars.escapeExpression(src);
    return `<span class="heart-glyph ${extraClass}" style="--glyph: url('${url}')" aria-hidden="true"></span>`;
}

// {{{heartGlyph "skill" "kill"}}} - also accepts a label ("Kill", "Wild")
export function glyphFor(kind, name, extraClass = '') {
    const dir = GLYPH_DIRS[kind];
    if (!dir || !name) return '';
    const id = String(name).trim().toLowerCase();
    if (!GLYPH_IDS[kind]().includes(id)) return '';
    return maskSpan(`systems/heart/assets/icons/${dir}/${id}.svg`, `glyph-${kind} ${extraClass}`);
}

// {{{heartIcon item.img}}} - an item's own icon, tinted like the glyphs when
// it is an SVG; nothing for the generic type images (they add no meaning)
export function iconFor(img, extraClass = '') {
    if (!img || DEFAULT_IMGS.has(img)) return '';
    if (/\.svg($|\?)/i.test(img)) return maskSpan(img, `item-icon-glyph ${extraClass}`);
    return `<img class="heart-item-thumb ${extraClass}" src="${Handlebars.escapeExpression(img)}" alt="" />`;
}

export function registerIconHelpers() {
    // {{#if (heartHasGlyph kind id)}}: a SafeString is always truthy, so
    // templates that need a fallback test with this instead
    Handlebars.registerHelper('heartHasGlyph', (kind, name) => Boolean(glyphFor(kind, name)));
    // {{heartTip "skill" "kill"}}: one sentence on what a skill, domain, or
    // resistance is for, as a tooltip (2026-09-30); empty when there is none.
    // {{heartTip "term" "Brutal"}}: the rule a game term names, as the
    // highlighter shows it (common/terms.js), e.g. a tag with no rule text
    // of its own (2026-09-30, Luke)
    Handlebars.registerHelper('heartTip', (kind, name) => {
        if (!kind || !name || typeof name !== 'string') return '';
        const key = kind === 'term'
            ? termTooltipKey(game.i18n.localize(name))
            : `heart.tip.${kind}.${name.trim().toLowerCase()}`;
        return key && game.i18n.has(key) ? game.i18n.localize(key) : '';
    });
    Handlebars.registerHelper('heartGlyph', (kind, name, options) =>
        new Handlebars.SafeString(glyphFor(kind, name, typeof options?.hash?.class === 'string' ? options.hash.class : '')));
    Handlebars.registerHelper('heartIcon', (img, options) =>
        new Handlebars.SafeString(iconFor(img, typeof options?.hash?.class === 'string' ? options.hash.class : '')));
}

// Copies imported before the content module shipped icons (on actors, in
// the Items directory, and nested inside a class / calling / equipment's
// children) still show a generic type image. On ready the GM gives each such
// copy the icon its compendium entry now has, matched by type and name
// (children included). A type + name that two entries give different icons
// is left alone rather than guessed. Only img changes, and only on copies
// still showing a generic image, so an icon someone picked by hand stays.
export async function adoptPackIcons() {
    if (!game.user.isGM) return;
    const key = (type, name) => `${type}|${game.i18n.localize(name ?? '').trim().toLowerCase()}`;
    const known = new Map();
    const learn = (e) => {
        if (!e?.type || !e.img || DEFAULT_IMGS.has(e.img)) return;
        const k = key(e.type, e.name);
        if (!known.has(k)) known.set(k, e.img);
        else if (known.get(k) !== e.img) known.set(k, null);
    };
    const learnChildren = (children) => {
        for (const c of Object.values(children ?? {})) {
            learn(c);
            learnChildren(c?.system?.children);
        }
    };
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
        const index = await pack.getIndex({ fields: ['type', 'img', 'system.children'] });
        for (const e of index) {
            learn(e);
            learnChildren(e.system?.children);
        }
    }
    if (![...known.values()].some(Boolean)) return;

    const wanted = (d) => DEFAULT_IMGS.has(d?.img ?? '') ? known.get(key(d.type, d.name)) : null;
    // flattened update paths for one top-level item and its nested children
    const diff = (source, prefix, out) => {
        const img = wanted(source);
        if (img) out[`${prefix}img`] = img;
        for (const [id, c] of Object.entries(source?.system?.children ?? {})) {
            diff(c, `${prefix}system.children.${id}.`, out);
        }
        return out;
    };
    const fix = (items) => items
        .map(i => ({ _id: i.id, ...diff(i.toObject(), '', {}) }))
        .filter(u => Object.keys(u).length > 1);

    let changed = 0;
    for (const actor of game.actors) {
        const updates = fix(actor.items);
        if (updates.length) { await actor.updateEmbeddedDocuments('Item', updates); changed += updates.length; }
    }
    const worldUpdates = fix(game.items);
    if (worldUpdates.length) { await Item.updateDocuments(worldUpdates); changed += worldUpdates.length; }
    if (changed) console.log(`heart | gave ${changed} item(s) (or their nested children) their compendium icons`);
}
