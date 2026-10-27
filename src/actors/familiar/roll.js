import { TRAITS, TARGETS, DEFAULT_TARGET, familiarOutcome, traitsOf, dangerOf, dangerStep, hasTraits, speciesFor, spellFor, spellIdOf, speciesUpdate, targetOf } from './rules';
import { oneAtATime } from '../../common/busy';

// The familiar's rolls (The Witch is Dead, Luke, 2026-10-24): a trait roll
// through a small dialog, and the sheet's Roll species and Roll spell. Each
// is a Foundry Roll posted with roll.toMessage, so Dice So Nice animates it
// and the roll mode applies; the card is the sheet's ink on paper
// (familiar.sass .familiar-card). The outcome is rules.js familiarOutcome.
// A write to the actor (a point of Danger, a rolled species or spell) waits
// for the dice to land, so the sheet never tells the result before the card.

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));

export const traitLabel = (key) => loc(`heart.familiar.trait.${key}`);
const speciesLabel = (id) => loc(`heart.familiar.species.${id}`);
const spellLabel = (id) => loc(`heart.familiar.spell.${id}`);

// A spell's sigil (Luke, 2026-10-26: on the sheet and in chat): the content
// module's art (the system ships none), or null without it or for a spell
// that isn't one of the ten
export const familiarSpellId = (actor) => spellIdOf(actor?.system?.spell, spellLabel);
export function sigilSrc(id) {
    if (!id || !game.modules?.get('fvtt-heart-content')?.active) return null;
    return `modules/fvtt-heart-content/assets/art/familiar/sigils/${id}.webp`;
}
const sigilImg = (id, cls = 'familiar-card-sigil') => {
    const src = sigilSrc(id);
    return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(spellLabel(id))}"/>` : '';
};

// The familiar's windows keep the paper look in both colour schemes and with
// glass on: no heart-window class (see sheet.js defaultOptions)
const DIALOG_CLASSES = ['dialog', 'heart-familiar-dialog'];

// A Dialog v1 that resolves what read(html) returns on the main button, and
// null on the other button or on close
function ask({ title, content, ok, cancel, render, read }) {
    return new Promise(resolve => {
        new Dialog({
            title,
            content,
            buttons: {
                ok: { icon: '<i class="fas fa-dice-d10"></i>', label: ok, callback: html => resolve(read ? read(html) : true) },
                cancel: { label: cancel, callback: () => resolve(null) },
            },
            default: 'ok',
            render,
            close: () => resolve(null),
        }, { classes: DIALOG_CLASSES, width: 440 }).render(true);
    });
}

const rootOf = (html) => html?.[0] ?? html;

// The face of a 1d10
const faceOf = (roll) => Number(roll?.dice?.[0]?.results?.[0]?.result ?? roll?.total) || 0;

// Waits for Dice So Nice to finish (when it is there), so a write lands with
// the card, not before it
async function diceLanded(message) {
    if (!message?.id || !game.dice3d?.waitFor3DAnimationByMessageID) return;
    try {
        await game.dice3d.waitFor3DAnimationByMessageID(message.id);
    } catch (_err) { /* the card is out; write anyway */ }
}

// ------------------------------------------------------------- the dialog

function rollDialogContent() {
    const targets = TARGETS.map(t => `<label class="familiar-target" data-tooltip="${esc(loc(`heart.familiar.target.${t.id}`))}">`
        + `<input type="radio" name="target" value="${t.value}"${t.value === DEFAULT_TARGET ? ' checked' : ''}/>`
        + `<span><b>${t.value}</b><small>${esc(loc(`heart.familiar.target.${t.id}`))}</small></span></label>`).join('');
    const check = (name) => `<label class="familiar-check"><input type="checkbox" name="${name}"/>`
        + `<span class="familiar-check-box"></span><span class="familiar-check-text"><b>${esc(loc(`heart.familiar.dialog.${name}`))}</b>`
        + `<small>${esc(loc(`heart.familiar.dialog.${name}-hint`))}</small></span></label>`;
    return `<div class="familiar-roll-form">`
        + `<div class="familiar-roll-label">${esc(loc('heart.familiar.dialog.target'))}</div>`
        + `<div class="familiar-targets">${targets}</div>`
        + `<div class="familiar-checks">${check('dangerous')}${check('magic')}</div>`
        + `</div>`;
}

// Magic is always dangerous: ticking it ticks Dangerous and holds it there;
// unticking it gives Dangerous back as it was
function bindMagic(html) {
    const root = rootOf(html);
    const dangerous = root?.querySelector('[name=dangerous]');
    const magic = root?.querySelector('[name=magic]');
    if (!dangerous || !magic) return;
    let chosen = dangerous.checked;
    dangerous.addEventListener('change', () => { chosen = dangerous.checked; });
    magic.addEventListener('change', () => {
        dangerous.checked = magic.checked || chosen;
        dangerous.disabled = magic.checked;
    });
}

function readChoice(html) {
    const root = rootOf(html);
    return {
        target: Number(root?.querySelector('[name=target]:checked')?.value) || DEFAULT_TARGET,
        dangerous: Boolean(root?.querySelector('[name=dangerous]')?.checked),
        magic: Boolean(root?.querySelector('[name=magic]')?.checked),
    };
}

// ------------------------------------------------------------- the cards

const num = (value, label, cls = '') => `<span class="familiar-card-num ${cls}"><b>${esc(value)}</b><small>${esc(label)}</small></span>`;
const op = (text) => `<span class="familiar-card-op">${esc(text)}</span>`;
const line = (cls, strong, small) => `<div class="${cls}"><b>${esc(strong)}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>`;

function traitCard(actor, name, out, mayMark) {
    const rating = loc(`heart.familiar.target.${targetOf(out.target).id}`);
    const tags = [out.magic && loc('heart.familiar.card.magic'), out.dangerous && loc('heart.familiar.card.dangerous')]
        .filter(Boolean).map(t => `<span class="familiar-card-tag">${esc(t)}</span>`).join('');
    let danger = '';
    if (out.gainDanger) {
        danger = mayMark
            ? line('familiar-card-danger', loc('heart.familiar.card.danger-up'), loc('heart.familiar.card.danger-now', { danger: out.dangerAfter }))
            : line('familiar-card-danger', loc('heart.familiar.card.danger-up'), loc('heart.familiar.card.danger-no-permission', { name: actor.name }));
    }
    const trouble = out.trouble
        ? line('familiar-card-trouble', loc('heart.familiar.card.trouble'), loc('heart.familiar.card.trouble-why', { die: out.die, danger: out.dangerBefore }))
        : '';
    // (magic: the familiar's spell and its sigil over the sum)
    const spellId = out.magic ? familiarSpellId(actor) : null;
    const spell = spellId ? `<div class="familiar-card-spell">${sigilImg(spellId)}<span>${esc(spellLabel(spellId))}</span></div>` : '';
    return `<div class="familiar-card">`
        + `<div class="familiar-card-head"><span class="familiar-card-title">${esc(name)}</span>${tags}</div>`
        + spell
        + `<div class="familiar-card-sum">${num(out.die, loc('heart.familiar.card.die'), 'die')}${op('+')}${num(out.trait, name)}${op('=')}`
        + `${num(out.total, loc('heart.familiar.card.total'), 'total')}${op(loc('heart.familiar.card.vs'))}${num(out.target, rating, 'target')}</div>`
        + `<div class="familiar-card-outcome ${out.success ? 'success' : 'failure'}">${esc(loc(out.success ? 'heart.familiar.card.success' : 'heart.familiar.card.failure'))}</div>`
        + danger + trouble
        + `</div>`;
}

function resultCard(title, face, result, detail = '', sigil = '') {
    return `<div class="familiar-card">`
        + `<div class="familiar-card-head"><span class="familiar-card-title">${esc(title)}</span></div>`
        + `<div class="familiar-card-sum">${num(face, 'd10', 'die')}${sigil}<span class="familiar-card-result">${esc(result)}</span></div>`
        + (detail ? `<div class="familiar-card-line">${esc(detail)}</div>` : '')
        + `</div>`;
}

// The spell sent to chat from the sheet's sigil: the sigil large, its name,
// and who knows it (anyone who can see the sheet; no write)
export async function showSpell(actor) {
    const id = familiarSpellId(actor);
    if (!actor || !id) return null;
    const content = `<div class="familiar-card familiar-spell-card">`
        + `<div class="familiar-card-head"><span class="familiar-card-title">${esc(loc('heart.familiar.spell-label'))}</span></div>`
        + `${sigilImg(id, 'familiar-card-sigil big')}`
        + `<div class="familiar-card-result">${esc(spellLabel(id))}</div>`
        + `<div class="familiar-card-line">${esc(loc('heart.familiar.card.spell-known', { name: actor.name }))}</div>`
        + `</div>`;
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

// ------------------------------------------------------------- the rolls

// A trait roll. Anyone who can see the sheet may roll (player-callable); the
// point of Danger is marked only by someone who may edit the familiar, and
// the card says so when the roller may not.
export async function rollTrait(actor, trait) {
    if (!actor || !TRAITS.includes(trait)) return null;
    const name = traitLabel(trait);
    const choice = await ask({
        title: loc('heart.familiar.dialog.title', { name: actor.name, trait: name }),
        content: rollDialogContent(),
        ok: loc('heart.familiar.dialog.roll', { trait: name }),
        cancel: loc('heart.familiar.dialog.cancel'),
        render: bindMagic,
        read: readChoice,
    });
    if (!choice) return null;
    return oneAtATime(`familiar-roll-${actor.id}`, null, async () => {
        const roll = await new Roll('1d10').evaluate();
        const out = familiarOutcome({
            die: faceOf(roll),
            trait: traitsOf(actor.system)[trait],
            target: choice.target,
            danger: dangerOf(actor.system),
            dangerous: choice.dangerous,
            magic: choice.magic,
        });
        const mayMark = actor.isOwner;
        const message = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), content: traitCard(actor, name, out, mayMark) });
        if (out.gainDanger && mayMark) {
            await diceLanded(message);
            // from the Danger as it is now, so two quick rolls both count
            await actor.update({ 'system.danger': dangerStep(actor.system?.danger, 1) });
        }
        return out;
    });
}

// Owner-required: these write the familiar
function mayEdit(actor) {
    if (actor?.isOwner) return true;
    ui.notifications.warn(loc('heart.familiar.not-owner', { name: actor?.name ?? '' }));
    return false;
}

// Roll species: a d10 on the table sets the species and all four traits,
// after asking when something is already written in
export async function rollSpecies(actor) {
    if (!mayEdit(actor)) return null;
    if (hasTraits(actor.system)) {
        const go = await ask({
            title: loc('heart.familiar.confirm-species.title'),
            content: `<p class="familiar-confirm">${esc(loc('heart.familiar.confirm-species.text', { name: actor.name }))}</p>`,
            ok: loc('heart.familiar.confirm-species.roll'),
            cancel: loc('heart.familiar.confirm-species.keep'),
        });
        if (!go) return null;
    }
    const roll = await new Roll('1d10').evaluate();
    const face = faceOf(roll);
    const entry = speciesFor(face);
    if (!entry) return null;
    const name = speciesLabel(entry.id);
    const detail = TRAITS.map(key => `${traitLabel(key)} ${entry.traits[key]}`).join(' · ');
    const message = await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: resultCard(loc('heart.familiar.species-label'), face, name, detail),
    });
    await diceLanded(message);
    await actor.update(speciesUpdate(entry, name));
    return entry;
}

// Roll spell: a d10 for the spell the witch taught you
export async function rollSpell(actor) {
    if (!mayEdit(actor)) return null;
    const roll = await new Roll('1d10').evaluate();
    const face = faceOf(roll);
    const id = spellFor(face);
    if (!id) return null;
    const name = spellLabel(id);
    const message = await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: resultCard(loc('heart.familiar.spell-label'), face, name, '', sigilImg(id)),
    });
    await diceLanded(message);
    await actor.update({ 'system.spell': name });
    return id;
}
