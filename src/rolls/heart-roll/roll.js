import './roll.sass';

import chatTemplateHTML from './roll.html';
import tooltipTemplateHTML from './tooltip.html';
import { buildPool, poolFormula } from './pool';
import { showDice, diceRow } from '../dice';
import { glyphFor } from '../../common/icons';
import { emphasizeTerms } from '../../common/terms';
import { askGM } from '../../common/relay';
import { oneAtATime } from '../../common/busy';
import { mayRunStress, messageOf } from '../card-actions';
// The result tables and lookups live in results.js, free of webpack-only
// imports, so the rules tests can load them (2026-09-30, Luke)
import { normal_results, difficult_results, stress_results, heartResult, markPool } from './results';

const difficulty_reductions = {
    standard: 0,
    risky: 1,
    dangerous: 2,
    impossible: Infinity,
}

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
        return heartResult(this.total, this.options.result_set, this.options.difficulty);
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
        const loc = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
        const esc = (t) => Handlebars.escapeExpression(String(t ?? ""));
        const difficulty = loc(`heart.difficulty.${opts.difficulty}`);

        // What was rolled: "Kill + Occult, Risky" with their glyphs; the
        // difficulty always, highlighted like the game's other terms
        const trait = (kind, id) => id ? `${glyphFor(kind, id)}<b>${esc(loc(`heart.${kind}.${id}`))}</b>` : "";
        const traits = [trait("skill", opts.skill), trait("domain", opts.domain)].filter(Boolean).join(" + ");
        const whatParts = [traits || esc(loc("heart.card.heart-roll"))];
        if (opts.difficulty) whatParts.push(`<strong class="heart-term">${esc(difficulty)}</strong>`);
        if (opts.mastery) whatParts.push(esc(loc("heart.card.mastery")));
        let what = whatParts.join(", ");
        if (chatOptions.flavor) what = `${esc(chatOptions.flavor)}: ${what}`;

        // One muted line: the difficulty's cut, the pool's notes, helpers
        // ("Risky: highest die removed. Vess helped and takes the same stress.")
        const det = [];
        if (opts.result_set === "impossible") det.push(esc(loc("heart.card.impossible")));
        else if (opts.result_set === "difficult") det.push(esc(loc("heart.card.fresh", { difficulty })));
        else if (opts.cut) det.push(esc(loc(`heart.card.cut-${opts.cut}`, { difficulty })));
        for (const note of opts.notes ?? []) det.push(esc(note));
        // Helpers share the consequences (HCB p. 76): Take stress marks the
        // same stress on each of them, less their own Protection
        const helpers = (opts.helpers ?? []).map(id => game.actors.get(id)?.name).filter(Boolean);
        if (helpers.length) {
            const names = helpers.map(n => `<b>${esc(n)}</b>`).join(` ${esc(loc("heart.card.and"))} `);
            det.push(game.i18n.format(helpers.length === 1 ? "heart.card.helped-one" : "heart.card.helped-many", { names }));
        }
        if (this.result === "critical_success") det.push(esc(loc("heart.rolls.roll.crit-step-up")));

        // a result that costs stress reads red; a critical success underlined
        const outcomeClass = ["failure", "critical_failure", "success_at_a_cost"].includes(this.result) ? "bad"
            : this.result === "critical_success" ? "crit" : "";

        // Define chat data
        const chatData = {
            outcomeClass: isPrivate ? "" : outcomeClass,
            character: chatOptions.character || opts.character,
            what: isPrivate ? "???" : what,
            // the outcome leads with the skill's glyph (the domain's without one)
            glyph: isPrivate ? "" : (glyphFor("skill", opts.skill) || glyphFor("domain", opts.domain)),
            det: isPrivate ? "" : emphasizeTerms(det.join(" ")),
            formula: isPrivate ? "???" : this._formula,
            user: chatOptions.user,
            // each die with its source (Base, Wild, a helper, Difficult)
            dice: isPrivate ? '' : diceRow(faces.map(f => ({ label: f.flavor, faces: 10, value: f.result, kept: f.kept, removed: f.removed }))),
            // drawn per client: only the roller's player and the GM see it
            showStressRollButton: isPrivate ? false : showStressRollButton && stress_results.includes(this.result)
                && mayRunStress(game.user, game.actors.get(opts.character)),
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
        const { kept: keptIndex, removed } = markPool(results, this.options.cut ?? 0);
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
        html.on('click', '.heart-roll [data-action=roll-stress]', function(ev) {
            ev.preventDefault();
            const msg = messageOf(ev);
            const roll = msg?.rolls?.[0];
            if (!roll) return;
            return oneAtATime(`${msg.id}:roll-stress`, ev.currentTarget, async () => {
                // only the roller's player or the GM (Luke, 2026-10-02)
                const roller = game.actors.get(roll.options.character);
                if (!mayRunStress(game.user, roller)) {
                    ui.notifications.warn(game.i18n.format('heart.relay.stress-not-yours', { name: roller?.name ?? '' }));
                    return;
                }
                if (msg.getFlag('heart', 'stress-roll')) {
                    ui.notifications.warn(game.i18n.localize('heart.relay.already'));
                    return;
                }
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
                // marked and attached by the GM's client, once (2026-10-02,
                // rolls/card-actions.js): a second click or a second player
                // is told it was already taken
                if (await askGM('attach-stress', { messageId: msg.id, roll: stressRoll.toJSON() })) ui.chat.scrollBottom();
            });
        });
    }
}