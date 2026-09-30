import './roll.sass';

import chatTemplateHTML from './roll.html';
import tooltipTemplateHTML from './tooltip.html';
import { buildPool, poolFormula } from './pool';
import { showDice } from '../dice';

const difficulty_reductions = {
    standard: 0,
    risky: 1,
    dangerous: 2,
    impossible: Infinity,
}

const normal_results = {
    'critical_failure': [1, 1],
    'failure': [2, 5],
    'success_at_a_cost': [6, 7],
    'success': [8, 9],
    'critical_success': [10, 10]
};

const difficult_results = {
    'critical_failure': [1, 1],
    'failure': [2, 9],
    'success_at_a_cost': [10, 10],
}

const stress_results = [
    'n_a',
    'success_at_a_cost',
    'failure',
    'critical_failure'
];

export function initialise() {
    const results = {...normal_results, ...difficult_results};
    game.heart.difficulties = Object.keys(difficulty_reductions);
    game.heart.results = Object.keys(results);
    game.heart.stress_results = stress_results;
}

export default class HeartRoll extends Roll {
    static get CHAT_TEMPLATE() { return chatTemplateHTML.path; }
    static get TOOLTIP_TEMPLATE() { return tooltipTemplateHTML.path; } 

    // Roll prompt data: every field the prompt can ask for. A caller that
    // passes all of them (the GM roll request card) skips the prompt.
    static get fields() { return ["character", "difficulty", "skill", "domain", "mastery", "helpers"]; }

    // Resolves with a HeartRoll, or null when the prompt is closed without
    // rolling (callers must check). 2026-09-30 rebuild: the actor-aware
    // HeartRollPrompt replaces the generic requirement form.
    static async build(pools = {}, data = {}, options = {}) {
        const complete = this.fields.every(k => pools[k] !== undefined);
        const state = complete ? pools : await game.heart.applications.HeartRollPrompt.prompt(pools);
        if (!state || !state.character) return null;
        return this._build(state, data, options);
    }

    static _build({ character, difficulty = "standard", skill = null, domain = null, mastery = false, helpers = [] } = {}, data = {}, options = {}) {
        const actor = game.actors.get(character);
        const pool = buildPool(actor, { skill, domain, mastery: Boolean(mastery), helpers: helpers ?? [], difficulty });

        options.character = character;
        options.difficulty = difficulty;
        options.skill = skill;
        options.domain = domain;
        options.mastery = Boolean(mastery);
        options.helpers = pool.dice.filter(d => d.kind === "helper").map(d => d.id);
        options.cut = pool.cut;
        options.pool = pool.dice.map(d => d.label);
        options.notes = pool.notes;
        options.result_set = pool.impossible ? "impossible" : pool.fresh ? "difficult" : "normal";

        return new this(poolFormula(pool), data, options);
    }

    get result() {
        if(this.options.difficulty === 'impossible') {
            return 'failure';   
        }

        let results = normal_results;
        if(this.options.result_set === 'difficult') {
            results = difficult_results;
        }

        return Object.keys(results).find(result => {
            const [minVal, maxVal] = results[result];
            return minVal <= this.total && this.total <= maxVal;
        });
    }

    async render(chatOptions = {}) {
        chatOptions = foundry.utils.mergeObject({
            user: game.user.id,
            flavor: null,
            template: this.constructor.CHAT_TEMPLATE,
            blind: false
        }, chatOptions);
        const isPrivate = chatOptions.isPrivate;

        const showStressRollButton = chatOptions.showStressRollButton !== undefined ? chatOptions.showStressRollButton : false;

        // Execute the roll, if needed
        if (!this._evaluated) await this.evaluate();

        const faces = this.faces();
        const opts = this.options;
        const difficulty = game.i18n.localize(`heart.difficulty.${opts.difficulty}`);
        const count = (opts.pool ?? []).length || faces.length;
        let description;
        if (opts.result_set === "impossible") description = game.i18n.localize("heart.rolls.roll.summary-impossible");
        else if (opts.result_set === "difficult") description = game.i18n.format("heart.rolls.roll.summary-fresh", { difficulty, count });
        else description = game.i18n.format(count === 1 ? "heart.rolls.roll.summary-one" : "heart.rolls.roll.summary", { difficulty, count })
            + (opts.cut ? game.i18n.localize(`heart.rolls.roll.summary-cut-${opts.cut}`) : "");

        const outcomeClass = ["failure", "critical_failure"].includes(this.result) ? "bad"
            : this.result === "critical_success" ? "crit" : "";

        // Define chat data
        const chatData = {
            faces: isPrivate ? [] : faces,
            outcomeClass: isPrivate ? "" : outcomeClass,
            character: chatOptions.character || opts.character,
            description: isPrivate ? "???" : description,
            notes: isPrivate ? [] : (opts.notes ?? []),
            formula: isPrivate ? "???" : this._formula,
            flavor: isPrivate ? null : chatOptions.flavor,
            user: chatOptions.user,
            tooltip: isPrivate ? "" : await this.getTooltip(),
            // Helpers share the consequences (HCB p. 76): Take stress marks
            // the same stress on each of them, less their own Protection
            helperNames: isPrivate ? "" : (opts.helpers ?? []).map(id => game.actors.get(id)?.name).filter(Boolean).join(", "),
            criticalSuccess: !isPrivate && this.result === "critical_success",
            showStressRollButton: isPrivate ? false : showStressRollButton && stress_results.includes(this.result),
            total: isPrivate ? "?" : this.total,
            result: isPrivate ? "?" : this.result
        };

        // Render the roll display template
        return renderTemplate(chatOptions.template, chatData);
    }

    // One face per rolled die with its source: the die actually kept (from
    // Foundry's own active flag, so ties can't mislead) and the ones the
    // difficulty removed (the highest cut dice among the rest)
    faces() {
        const pool = this.terms[0];
        const labels = this.options.pool ?? [];
        if (this.options.result_set === "impossible") return [];
        if (this.options.result_set === "difficult" || !(pool?.results)) {
            return this.dice.map(d => ({ result: d.total, flavor: d.flavor || game.i18n.localize("heart.rolls.roll.fresh-flavor"), kept: true, removed: false }));
        }
        const results = pool.results;
        const keptIndex = results.findIndex(r => r.active);
        const cut = this.options.cut ?? 0;
        const removed = results.map((r, i) => ({ v: r.result, i }))
            .filter(o => o.i !== keptIndex)
            .sort((a, b) => b.v - a.v)
            .slice(0, cut)
            .map(o => o.i);
        return results.map((r, i) => ({
            result: r.result,
            flavor: labels[i] ?? this.dice[i]?.flavor ?? "",
            kept: i === keptIndex,
            removed: removed.includes(i),
        }));
    }

    async getTooltip() {
        const parts = this.dice.map(d => d.getTooltipData());
        const kept = this.faces().findIndex(f => f.kept);
        return renderTemplate(this.constructor.TOOLTIP_TEMPLATE, {
            kept,
            parts 
        });
    }

    static activateListeners(html) {
        html.on('click', '.heart-roll [data-action=roll-stress]', async function(ev) {
            const target = $(ev.currentTarget);
            const msgElement = target.closest('.chat-message');
            const messageId = msgElement.data('messageId');
            const msg = game.messages.get(messageId);
            const roll = msg.rolls[0];
            
            if (!roll._evaluated) await roll.evaluate();
            // Stakes are named after the roll (Luke, 2026-09-30): one short,
            // prefilled picker, then the stress is rolled and marked on the
            // roller and every helper
            const stressRoll = await game.heart.rolls.StressRoll.build({
                character: roll.options.character,
                result: roll.result,
                helpers: roll.options.helpers ?? [],
            }, msg);
            if (!stressRoll) return;

            await stressRoll.evaluate();
            await showDice(stressRoll, { setting: 'showStressRoll3dDice' });
            const applied = await stressRoll.takeStress();

            // one update: stress card attached, stress already taken, fallout
            // offered only if some got through Protection (HCB p.78)
            await msg.update({
                'flags.heart.stress-roll': stressRoll.toJSON(),
                'flags.heart.show-stress-roll-button': false,
                'flags.heart.show-take-stress-button': false,
                'flags.heart.show-fallout-roll-button': applied.some(a => a.amount > 0),
            });

            await ui.chat.updateMessage(msg, true);
            ui.chat.scrollBottom();
        });
    }
}