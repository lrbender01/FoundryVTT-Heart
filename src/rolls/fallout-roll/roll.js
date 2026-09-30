import chatTemplateHTML from './roll.html';
import './roll.sass';
import { partyFalloutResult, isPastRolling, PARTY_FALLOUT_RESULTS } from '../../actors/party/rules';

const fallout_results = {
    'no-fallout': (total, totalStress) => total > totalStress,
    'minor-fallout': (total, totalStress) => total <= totalStress && total <= 6,
    'major-fallout': (total, totalStress) => total <= totalStress && total > 6
};

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
        return Object.keys(fallout_results).find(result => fallout_results[result](this.total, this.options.totalStress));
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

        let description = game.i18n.format(this.options.party
            ? 'heart.rolls.fallout-roll.description-party(totalStress)'
            : 'heart.rolls.fallout-roll.description(totalStress)', {
            totalStress: this.options.totalStress
        });
        // at the top of the track the d12 decides nothing (the card can hide
        // the face using chatData.notRolled)
        if (this.notRolled) description = game.i18n.localize('heart.rolls.fallout-roll.not-rolled');

        // Define chat data
        const chatData = {
            description: isPrivate ? '???' : description,
            formula: isPrivate ? "???" : this._formula,
            flavor: isPrivate ? null : chatOptions.flavor,
            user: chatOptions.user,
            tooltip: isPrivate ? "" : await this.getTooltip(),
            total: isPrivate ? "?" : this.total,
            result: isPrivate ? "?" : this.result,
            showClearStressButton: isPrivate ? false : showClearStressButton,
            party: Boolean(this.options.party),
            notRolled: isPrivate ? false : this.notRolled,
            // minor / major / critical: the outcome's severity glyph
            severity: isPrivate ? '' : String(this.result ?? '').replace(/-fallout$/, ''),
        };

        // Render the roll display template
        const output = await renderTemplate(chatOptions.template, chatData);
        return output;
    }

    async clearStress(msg) {
      return new Promise((resolve, reject) => {
          let character = this.options.character || msg.rolls[0].options.character || msg.speaker.actor;
          let stressType = this.options.resistance || msg.stressRoll?.options?.resistance || msg.rolls[0].options.resistance || '';

          // Provisions fallout of any severity clears the party's track
          if (this.options.party) {
            const party = game.actors.get(character) ?? game.heart.party;
            if (!party) return resolve();
            confirmClear({
              content: game.i18n.format('heart.party.confirm-clear', {
                name: escape(party.name), count: Number(party.system.provisions?.value) || 0,
              }),
              clearLabel: game.i18n.localize('heart.party.clear'),
              onClear: () => {
                party.update({ 'system.provisions.value': 0 });
                msg.showClearStressButton = false;
              }
            });
            return resolve();
          }

          let actor = game.actors.get(character);
          let resistances = actor.system.resistances;

          if (this.result == 'major-fallout') {
            const count = Object.values(resistances).reduce((sum, r) => sum + (Number(r.value) || 0), 0);
            confirmClear({
              content: game.i18n.format('heart.rolls.fallout-roll.confirm-major', { name: escape(actor.name), count }),
              clearLabel: game.i18n.localize('heart.rolls.fallout-roll.confirm-clear-all'),
              onClear: () => {
                Object.keys(resistances).forEach(key =>{Object.assign(resistances[key], { value: 0 });});
            
                let data = {};
                data["system.resistances"] = resistances;
                actor.update(data);
                msg.showClearStressButton = false
              }
            });
          }
          if (this.result == 'minor-fallout' && stressType) {
            removeMinorStress(stressType, actor, resistances);
          }
          if (this.result == 'minor-fallout' && stressType == '') {
            game.heart.applications.RequirementApplication.build({
              requirements: {
                  resistance: {
                      options: game.heart.resistances.reduce((map, resistance) => {
                          map[resistance] = game.i18n.localize(`heart.resistance.${resistance}`)
                          return map;
                      }, {})
                  }
              },
              callback: ({resistance}) => {

                removeMinorStress(resistance, actor, resistances);
              },
              type: "clear-stress"
            });
          }
      });

      // Confirmations say exactly what will happen, with numbers, and the
      // buttons name the action (2026-09-29, approved sweep)
      function escape(text) {
        return Handlebars.escapeExpression(String(text ?? ''));
      }

      function confirmClear({ content, clearLabel, onClear }) {
        new Dialog({
          title: game.i18n.localize('heart.rolls.fallout-roll.confirm-title'),
          content: `<p>${content}</p><p>${game.i18n.localize('heart.rolls.fallout-roll.confirm-final')}</p>`,
          buttons: {
            keep: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize('heart.rolls.fallout-roll.confirm-keep') },
            clear: { icon: '<i class="fas fa-eraser"></i>', label: clearLabel, callback: onClear },
          },
          default: 'clear',
        }, { classes: ['dialog', 'heart-confirm'] }).render(true);
      }

      function removeMinorStress(stressType, actor, resistances) {
        const label = game.i18n.localize(`heart.resistance.${stressType}`);
        confirmClear({
          content: game.i18n.format('heart.rolls.fallout-roll.confirm-minor', {
            name: escape(actor.name), resistance: escape(label), count: Number(resistances[stressType]?.value) || 0,
          }),
          clearLabel: game.i18n.format('heart.rolls.fallout-roll.confirm-clear-one', { resistance: label }),
          onClear: () => {
            resistances[stressType].value = 0;

            let data = {};
            data["system.resistances"] = resistances;
            actor.update(data);
            msg.showClearStressButton = false;
          }
        });
      }
    }

    static activateListeners(html) {
      html.on('click', '.fallout-roll [data-action=clear-stress]', async function(ev) {
        ev.preventDefault();
        const target = $(ev.currentTarget);
        const msgElement = target.closest('.chat-message');
        const messageId = msgElement.data('messageId');
        const msg = game.messages.get(messageId);
        const falloutRoll = msg.falloutRoll;

        await falloutRoll.clearStress(msg);

        await ui.chat.updateMessage(msg, true);
        ui.chat.scrollBottom();
    });
  }
}