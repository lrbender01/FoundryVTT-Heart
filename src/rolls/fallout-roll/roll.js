import chatTemplateHTML from './roll.html';
import './roll.sass';
import { glyphFor } from '../../common/icons';
import { diceRow, rollParts } from '../dice';
import { heartDialogOptions } from '../../common/dialog';
import { pickFalloutButton } from '../../fallout-picker/button';
import { askGM } from '../../common/relay';
import { oneAtATime } from '../../common/busy';
import { messageOf } from '../card-actions';
import { partyFalloutResult, isPastRolling, PARTY_FALLOUT_RESULTS } from '../../actors/party/rules';
// The character thresholds live in results.js, free of webpack-only imports,
// so the rules tests can load them (2026-09-30, Luke)
import { characterFalloutResult } from './results';

export function initialise() {
    // critical-fallout is rolled only for the party's Provisions (house rule,
    // 2026-09-30); a character's own check never rolls it
    game.heart.fallout_results = [...PARTY_FALLOUT_RESULTS];
}

export default class FalloutRoll extends Roll {
    static get CHAT_TEMPLATE() { return chatTemplateHTML.path; }

    static get requirements() {
        const characters = game.actors.filter(x => x.type === 'character');
        return {
            character: {
                label: game.i18n.localize(`heart.character.label-single`),
                options: characters.reduce((map, char) => {
                    map[char.id] = char.name
                    return map;
                }, {})
            }, 
        }
    }

    // resistance: the stress that triggered it, so Minor fallout can clear
    // that track without asking (2026-09-30)
    static build({character, resistance}={}, data={}, options={}) {
        return new Promise((resolve, reject) => {
            const requirements = this.requirements;
        
            if(character !== undefined) delete requirements.character;

            const buildData = {character, resistance};
            if(Object.keys(requirements).length > 0) {
                game.heart.applications.RequirementApplication.build({
                    requirements,
                    callback: moreData => {
                        foundry.utils.mergeObject(buildData, moreData)
                        resolve(this._build(buildData, data, options));
                    },
                    type: 'prepare-fallout-roll',
                });
            } else {
                return resolve(this._build(buildData, data, options));
            }
        })
    }

    static _build({character, resistance}, data={}, options={}) {
        const doc = game.actors.get(character);
        // Provisions: the check is against the party's track, with the house
        // rule's thresholds (13+: Major is Critical; at the max: no roll)
        if (resistance === 'provisions' || doc?.type === 'party') {
            const party = doc?.type === 'party' ? doc : game.heart.party;
            const p = party.proxy.provisions;
            options.party = true;
            options.totalStress = p.value;
            options.max = p.max;
            options.character = party.id;
            options.resistance = 'provisions';
            return new this('1d12', data, options);
        }
        const actor = doc.proxy;
        options.totalStress = actor.totalStress;
        options.character = character;
        options.resistance = resistance;
        return new this('1d12', data, options);
    }

    get notRolled() {
        return Boolean(this.options.party) && isPastRolling(this.options.totalStress, this.options.max);
    }

    get result() {
        if (this.options.party) return partyFalloutResult(this.total, this.options.totalStress, this.options.max);
        return characterFalloutResult(this.total, this.options.totalStress);
    }

    async render(chatOptions = {}) {
        chatOptions = foundry.utils.mergeObject({
            user: game.user.id,
            flavor: null,
            template: this.constructor.CHAT_TEMPLATE,
            blind: false
        }, chatOptions);
        const isPrivate = chatOptions.isPrivate;

        const showClearStressButton = chatOptions.showClearStressButton !== undefined ? chatOptions.showClearStressButton : false;

        // Execute the roll, if needed
        if (!this._evaluated) await this.evaluate();

        const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
        const esc = (t) => Handlebars.escapeExpression(String(t ?? ''));
        const opts = this.options;
        const result = this.result;
        const resistance = opts.resistance;
        const resistanceLabel = resistance ? loc(`heart.resistance.${resistance}`) : '';

        // What: "d12 vs 9 total stress", "d12 vs 14 Provisions"; at the top of
        // the track the d12 decides nothing (no die shown). The triggering
        // resistance is left off (2026-09-30 review: the stress block above
        // already says it)
        let what;
        if (this.notRolled) what = loc('heart.card.fallout-full', { value: opts.totalStress, max: opts.max });
        else if (opts.party) what = loc('heart.card.fallout-party', { total: opts.totalStress, resistance: `${glyphFor('resistance', 'provisions')}<b>${esc(resistanceLabel)}</b>` });
        else what = loc('heart.card.fallout-what', { total: opts.totalStress });
        if (chatOptions.flavor) what = `${esc(chatOptions.flavor)}: ${what}`;

        // the clear button says what it clears
        const clearLabel = opts.party ? loc('heart.party.clear')
            : result === 'major-fallout' ? loc('heart.rolls.fallout-roll.confirm-clear-all')
            : resistanceLabel ? loc('heart.rolls.fallout-roll.confirm-clear-one', { resistance: resistanceLabel })
            : loc('heart.rolls.fallout-roll.clear-stress-short');
        // and its tooltip names the rule (2026-09-30, Luke): Minor clears its
        // resistance, Major every resistance, a Provisions Fallout the track
        const clearTip = opts.party ? 'heart.tip.card.clear-provisions'
            : result === 'major-fallout' ? 'heart.term.major-fallout'
            : result === 'minor-fallout' ? 'heart.term.minor-fallout'
            : '';

        // the GM's Fallout picker for whoever rolled, at this severity
        // (2026-10-01): a character, the party, or a companion
        const severity = String(result ?? '').replace(/-fallout$/, '');
        const pickTarget = opts.party ? (game.actors.get(opts.character) ?? game.heart.party) : game.actors.get(opts.character);
        const pickButton = !isPrivate && result && result !== 'no-fallout' && pickTarget
            ? pickFalloutButton({ targetUuid: pickTarget.uuid, severity, resistance: resistance ?? '' })
            : '';

        // Define chat data
        const chatData = {
            pickButton,
            what: isPrivate ? '???' : what,
            formula: isPrivate ? "???" : this._formula,
            user: chatOptions.user,
            dice: isPrivate || this.notRolled ? '' : diceRow(rollParts(this).map(p => ({ ...p, kept: true }))),
            total: isPrivate ? "?" : this.total,
            result: isPrivate ? "?" : result,
            bad: !isPrivate && result !== 'no-fallout',
            crit: !isPrivate && result === 'critical-fallout',
            clearLabel,
            clearTip,
            showClearStressButton: isPrivate ? false : showClearStressButton,
            party: Boolean(opts.party),
            notRolled: isPrivate ? false : this.notRolled,
            // minor / major / critical: the outcome's severity glyph
            severity: isPrivate ? '' : String(result ?? '').replace(/-fallout$/, ''),
        };

        // Render the roll display template
        const output = await renderTemplate(chatOptions.template, chatData);
        return output;
    }

    // The card's Clear button (stress is only ever cleared by this hand
    // click): a Provisions fallout clears the party's track, a Major every
    // resistance, a Minor the one that triggered it (asked when unknown).
    // Confirmed first, then written by the GM's client as single keys, once
    // (2026-10-02, rolls/card-actions.js). Resolves when done or declined.
    async clearStress(msg) {
        const character = this.options.character || msg.rolls[0]?.options?.character || msg.speaker.actor;
        let stressType = this.options.resistance || msg.stressRoll?.options?.resistance || msg.rolls[0]?.options?.resistance || '';
        const esc = (text) => Handlebars.escapeExpression(String(text ?? ''));
        const ask = (data) => askGM('clear-stress', { messageId: msg.id, ...data });

        if (this.options.party) {
            const party = game.actors.get(character) ?? game.heart.party;
            if (!party) return;
            const ok = await confirmClear({
                content: game.i18n.format('heart.party.confirm-clear', {
                    name: esc(party.name), count: Number(party.system.provisions?.value) || 0,
                }),
                clearLabel: game.i18n.localize('heart.party.clear'),
            });
            if (ok) await ask({ party: true });
            return;
        }

        const actor = game.actors.get(character);
        if (!actor) return;
        if (!actor.isOwner) {
            ui.notifications.warn(game.i18n.format('heart.party.not-owner', { name: actor.name }));
            return;
        }
        const resistances = actor.system.resistances ?? {};

        if (this.result === 'major-fallout') {
            const count = Object.values(resistances).reduce((sum, r) => sum + (Number(r.value) || 0), 0);
            const ok = await confirmClear({
                content: game.i18n.format('heart.rolls.fallout-roll.confirm-major', { name: esc(actor.name), count }),
                clearLabel: game.i18n.localize('heart.rolls.fallout-roll.confirm-clear-all'),
            });
            if (ok) await ask({ actorId: actor.id, scope: 'all' });
            return;
        }

        if (this.result !== 'minor-fallout') return;
        if (!stressType) stressType = await pickResistance();
        if (!stressType || !resistances[stressType]) return;
        const label = game.i18n.localize(`heart.resistance.${stressType}`);
        const ok = await confirmClear({
            content: game.i18n.format('heart.rolls.fallout-roll.confirm-minor', {
                name: esc(actor.name), resistance: esc(label), count: Number(resistances[stressType]?.value) || 0,
            }),
            clearLabel: game.i18n.format('heart.rolls.fallout-roll.confirm-clear-one', { resistance: label }),
        });
        if (ok) await ask({ actorId: actor.id, scope: stressType });

        // Confirmations say exactly what will happen, with numbers, and the
        // buttons name the action (2026-09-29, approved sweep). True only
        // when Clear was pressed.
        function confirmClear({ content, clearLabel }) {
            return new Promise(resolve => {
                new Dialog({
                    title: game.i18n.localize('heart.rolls.fallout-roll.confirm-title'),
                    content: `<p>${content}</p><p>${game.i18n.localize('heart.rolls.fallout-roll.confirm-final')}</p>`,
                    buttons: {
                        keep: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize('heart.rolls.fallout-roll.confirm-keep'), callback: () => resolve(false) },
                        clear: { icon: '<i class="fas fa-eraser"></i>', label: clearLabel, callback: () => resolve(true) },
                    },
                    default: 'clear',
                    close: () => resolve(false),
                }, heartDialogOptions()).render(true);
            });
        }

        // A Minor whose resistance is unknown: which one to clear
        function pickResistance() {
            return new Promise(resolve => {
                game.heart.applications.RequirementApplication.build({
                    requirements: {
                        resistance: {
                            options: Object.fromEntries(game.heart.resistances.map(r => [r, game.i18n.localize(`heart.resistance.${r}`)])),
                        },
                    },
                    callback: ({ resistance }) => resolve(resistance),
                    cancel: () => resolve(null),
                    type: 'clear-stress',
                });
            });
        }
    }

    static activateListeners(html) {
        html.on('click', '.fallout-roll [data-action=clear-stress]', function(ev) {
            ev.preventDefault();
            const msg = messageOf(ev);
            const falloutRoll = msg?.falloutRoll;
            if (!falloutRoll) return;
            return oneAtATime(`${msg.id}:clear-stress`, ev.currentTarget, () => falloutRoll.clearStress(msg));
        });
    }
}