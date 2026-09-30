import chatTemplateHTML from './roll.html';
import { showDice } from '../dice';

// Stress roll (2026-09-30 rebuild with the roll prompt). Rules (HCB p.77-78;
// gm-companion rulings 13, 16):
//   - the GM names the resistance and stress die; the default die is D4
//   - a critical failure doubles the stress roll (then Protection, once)
//   - a passive action (only avoiding harm) that succeeds at a cost takes
//     stress one die size smaller
//   - Protection in that resistance is subtracted per character
//   - helpers take the same stress the roller does, less their own Protection
//   - if Protection stops all of it, there is no fallout roll
// Stakes are picked AFTER the roll (Luke, 2026-09-30): one short picker;
// the resistance is prefilled with this user's last choice, the die is D4.

const DIE_ORDER = ['d4', 'd6', 'd8', 'd10', 'd12'];

function stepDown(die) {
    const i = DIE_ORDER.indexOf(String(die).toLowerCase());
    return i > 0 ? DIE_ORDER[i - 1] : die;
}

export default class StressRoll extends Roll {
    static get CHAT_TEMPLATE() { return chatTemplateHTML.path; }

    static get requirements() {
        const characters = game.actors.filter(x => x.type === 'character');
        const loc = (k) => game.i18n.localize(k);
        const last = game.user.getFlag('heart', 'lastStakes') ?? {};
        return {
            character: {
                label: loc('heart.character.label-single'),
                options: Object.fromEntries(characters.map(c => [c.id, c.name])),
            },
            result: {
                label: loc('heart.result.label-single'),
                options: Object.fromEntries(game.heart.stress_results.filter(r => r !== 'n_a').map(r => [r, loc(`heart.result.${r}`)])),
            },
            resistance: {
                label: loc('heart.resistance.label-single'),
                // the five personal tracks plus the party's Provisions
                options: Object.fromEntries(game.heart.stress_targets.map(r => [r, loc(`heart.resistance.${r}`)])),
                default: last.resistance,
            },
            die_size: {
                label: loc('heart.rolls.stress-roll.die'),
                options: Object.fromEntries(game.heart.stress_dice.map(d => [d, d.toUpperCase()])),
                default: 'd4',
            },
            passive: {
                label: loc('heart.rolls.stress-roll.passive'),
                hint: loc('heart.rolls.stress-roll.passive-hint'),
                isCheckbox: true,
            },
            ignoreProtection: {
                label: loc('heart.rolls.stress-roll.ignore-protection'),
                isCheckbox: true,
            },
        };
    }

    // Resolves with a StressRoll, or null if the picker is closed
    static build({ result, die_size, character, resistance, ignoreProtection, helpers = [], passive } = {}, data = {}, options = {}) {
        return new Promise(resolve => {
            const requirements = this.requirements;
            if (result !== undefined) delete requirements.result;
            if (die_size !== undefined) delete requirements.die_size;
            if (character !== undefined) delete requirements.character;
            if (resistance !== undefined && resistance !== '') delete requirements.resistance;
            if (ignoreProtection !== undefined) delete requirements.ignoreProtection;
            // passive only changes a success at a cost
            if (passive !== undefined || (result !== undefined && result !== 'success_at_a_cost')) delete requirements.passive;

            const buildData = { result, die_size, character, resistance, ignoreProtection, helpers, passive };
            const finish = (more = {}) => {
                foundry.utils.mergeObject(buildData, more);
                game.user.setFlag('heart', 'lastStakes', { resistance: buildData.resistance, die_size: buildData.die_size });
                resolve(this._build(buildData, data, options));
            };

            if (Object.keys(requirements).length === 0) return finish();
            const who = game.actors.get(character)?.name;
            game.heart.applications.RequirementApplication.build({
                requirements,
                callback: finish,
                cancel: () => resolve(null),
                type: 'stakes',
                description: who ? game.i18n.format('heart.rolls.stress-roll.stakes-for', { name: who }) : undefined,
            });
        });
    }

    static _build({ result, die_size, character, resistance, ignoreProtection, helpers = [], passive }, data = {}, options = {}) {
        let die = String(die_size ?? 'd4').toLowerCase();
        const stepped = Boolean(passive) && result === 'success_at_a_cost';
        if (stepped) die = stepDown(die);

        options.result = result;
        options.die_size = die;
        options.stepped = stepped;
        options.character = character;
        options.resistance = resistance;
        options.ignoreProtection = Boolean(ignoreProtection);
        options.helpers = (helpers ?? []).filter(id => id && id !== character);

        const formula = result === 'critical_failure' ? `2 * {${die}}` : die;
        return new this(formula, data, options);
    }

    // Mark the stress on the roller and each helper. Returns (and stores in
    // options.applied, which is saved with the card) who took how much.
    async takeStress() {
        const resistance = this.options.resistance;
        if (!resistance) return [];
        const total = Number(this.total) || 0;
        if (resistance === 'provisions') return this._takePartyStress(total);
        const applied = [];
        for (const id of [this.options.character, ...(this.options.helpers ?? [])]) {
            const actor = game.actors.get(id);
            const res = actor?.system?.resistances?.[resistance];
            if (!res) continue;
            const protection = this.options.ignoreProtection ? 0 : (Number(res.protection) || 0);
            const amount = Math.max(0, total - protection);
            if (amount > 0 && actor.isOwner) {
                await actor.update({ [`system.resistances.${resistance}.value`]: (Number(res.value) || 0) + amount });
            }
            applied.push({ id, name: actor.name, amount, protection, marked: amount > 0 && actor.isOwner });
        }
        this.options.applied = applied;
        return applied;
    }

    // Provisions (house rule, 2026-09-30): one pool for the whole party, so the
    // stress lands ONCE on the party actor however many helpers there were,
    // less the quartermaster's Supplies protection. The applied entry names
    // the party, so the card's fallout button rolls against Provisions.
    async _takePartyStress(total) {
        const party = game.heart.party;
        if (!party) {
            ui.notifications.warn(game.i18n.localize('heart.party.no-party'));
            this.options.applied = [];
            return [];
        }
        const p = party.proxy.provisions;
        const protection = this.options.ignoreProtection ? 0 : p.protection;
        const amount = Math.max(0, total - protection);
        const marked = amount > 0 && party.isOwner;
        if (marked) {
            await party.update({ 'system.provisions.value': Math.min(p.max, p.value + amount) });
        }
        const applied = [{ id: party.id, name: party.name, amount, protection, marked, shared: true }];
        this.options.applied = applied;
        return applied;
    }

    async render(chatOptions = {}) {
        chatOptions = foundry.utils.mergeObject({
            user: game.user.id,
            flavor: null,
            template: this.constructor.CHAT_TEMPLATE,
            blind: false
        }, chatOptions);
        const isPrivate = chatOptions.isPrivate;
        const showTakeStressButton = chatOptions.showTakeStressButton ?? false;
        const showFalloutRollButton = chatOptions.showFalloutRollButton ?? false;

        if (!this._evaluated) await this.evaluate();

        const opts = this.options;
        const die = String(opts.die_size ?? '').toUpperCase();
        const resistanceLabel = opts.resistance ? game.i18n.localize(`heart.resistance.${opts.resistance}`) : '';
        let description = game.i18n.format('heart.rolls.stress-roll.summary', { die, resistance: resistanceLabel });
        if (opts.result === 'critical_failure') description += game.i18n.localize('heart.rolls.stress-roll.summary-double');
        if (opts.stepped) description += game.i18n.localize('heart.rolls.stress-roll.summary-passive');

        const applied = (opts.applied ?? []).map(a => ({
            ...a,
            line: a.amount > 0
                ? game.i18n.format(a.marked ? 'heart.rolls.stress-roll.took' : 'heart.rolls.stress-roll.takes', { name: a.name, amount: a.amount, resistance: resistanceLabel })
                : game.i18n.format('heart.rolls.stress-roll.blocked', { name: a.name }),
            protectionNote: a.protection ? game.i18n.format('heart.rolls.stress-roll.protection-note', { protection: a.protection }) : '',
        }));

        const chatData = {
            character: chatOptions.character || opts.character,
            description: isPrivate ? '???' : description,
            formula: isPrivate ? '???' : this._formula,
            flavor: isPrivate ? null : chatOptions.flavor,
            user: chatOptions.user,
            tooltip: isPrivate ? '' : await this.getTooltip(),
            applied: isPrivate ? [] : applied,
            showTakeStressButton: isPrivate ? false : showTakeStressButton && !opts.applied,
            // fallout per character who took stress (none if Protection stopped it)
            falloutFor: isPrivate || !showFalloutRollButton ? [] : applied.filter(a => a.amount > 0 && !(chatOptions.falloutDone ?? []).includes(a.id)),
            resistance: isPrivate ? '' : opts.resistance,
            total: isPrivate ? '?' : this.total,
            result: isPrivate ? '?' : this.result
        };
        return renderTemplate(chatOptions.template, chatData);
    }

    static activateListeners(html) {
        // A standalone stress card (the character header's Stress button)
        html.on('click', '.stress-roll [data-action=take-stress]', async function(ev) {
            ev.preventDefault();
            const msg = game.messages.get($(ev.currentTarget).closest('.chat-message').data('messageId'));
            const stressRoll = msg.stressRoll;
            if (!stressRoll.options.resistance) {
                ui.notifications.warn(game.i18n.localize('heart.rolls.stress-roll.no-resistance'));
                return;
            }
            const applied = await stressRoll.takeStress();
            const update = {
                'flags.heart.show-take-stress-button': false,
                'flags.heart.show-fallout-roll-button': applied.some(a => a.amount > 0),
            };
            if (msg.rolls[0] === stressRoll || msg.rolls[0] instanceof StressRoll) {
                update.rolls = [JSON.stringify(stressRoll.toJSON())];
            } else {
                update['flags.heart.stress-roll'] = stressRoll.toJSON();
            }
            await msg.update(update);
            ui.chat.scrollBottom();
        });

        // Fallout for one character who took stress. The roller's fallout
        // joins this card; a helper's fallout posts as its own card.
        html.on('click', '.stress-roll [data-action=roll-fallout]', async function(ev) {
            ev.preventDefault();
            const msg = game.messages.get($(ev.currentTarget).closest('.chat-message').data('messageId'));
            const stressRoll = msg.stressRoll;
            const character = ev.currentTarget.dataset.character || stressRoll.options.character;
            const falloutRoll = await game.heart.rolls.FalloutRoll.build({ character, resistance: stressRoll.options.resistance });
            if (!falloutRoll) return;

            const done = [...(msg.falloutDone ?? []), character];
            // the party's Provisions fallout joins this card like the roller's
            const joinsCard = character === stressRoll.options.character || game.actors.get(character)?.type === 'party';
            if (!joinsCard) {
                // Dice So Nice animates it as its own card is created
                await falloutRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: game.actors.get(character) }) });
                await msg.update({ 'flags.heart.fallout-done': done });
                return;
            }
            await falloutRoll.evaluate();
            await showDice(falloutRoll, { setting: 'showFalloutRoll3dDice' });
            await msg.update({
                'flags.heart.fallout-roll': falloutRoll.toJSON(),
                'flags.heart.fallout-done': done,
            });
            ui.chat.scrollBottom();
        });
    }
}
