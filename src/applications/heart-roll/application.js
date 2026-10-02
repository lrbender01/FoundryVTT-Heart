import applicationHTML from './application.html';
import './application.sass';
import { buildPool, helperEligibility, falloutFlags, difficultyHints, knackFor, HELPER_LIMIT } from '../../rolls/heart-roll/pool';

// Roll prompt (2026-09-30 rebuild, approved "Heart Roll Prompt" mock).
// Knows who is rolling: marks the skills / domains they have and their
// knacks, offers only helpers who could help (GM may override), applies
// Tired / Clouded / Furious, and previews the dice pool live. Resolves with
// the chosen {character, difficulty, skill, domain, mastery, helpers}, or
// null when closed without rolling.

export default class HeartRollPrompt extends Application {
    constructor(state = {}, resolve = () => {}, options = {}) {
        super(options);
        this.state = {
            character: state.character ?? null,
            difficulty: state.difficulty ?? 'standard',
            skill: state.skill ?? null,
            domain: state.domain ?? null,
            mastery: Boolean(state.mastery),
            helpers: [...(state.helpers ?? [])],
        };
        this._resolve = resolve;
        this._settled = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: applicationHTML.path,
            // heart-window: the class Heart's theme is scoped to (2026-09-30)
            classes: ['heart', 'heart-window', 'heart-roll-prompt'],
            width: 500,   // 2026-10-01 (was 600)
            height: 'auto',
            resizable: true,
        });
    }

    get title() {
        return game.i18n.localize('heart.roll-prompt.title');
    }

    static prompt(state) {
        return new Promise(resolve => new this(state, resolve).render(true));
    }

    get actor() {
        return game.actors.get(this.state.character) ?? null;
    }

    // Characters who could appear as helpers: the party (player-owned), or
    // every character when none are assigned yet; never the roller
    _helperCandidates() {
        const characters = game.actors.filter(a => a.type === 'character');
        const party = characters.some(a => a.hasPlayerOwner) ? characters.filter(a => a.hasPlayerOwner) : characters;
        return party.filter(a => a.id !== this.state.character);
    }

    getData() {
        const s = this.state;
        const actor = this.actor;
        const isGM = game.user.isGM;
        const flags = falloutFlags(actor);
        const loc = (k) => game.i18n.localize(k);

        const characters = actor ? [] : game.actors
            .filter(a => a.type === 'character' && a.testUserPermission(game.user, 'OWNER'))
            .map(a => ({ id: a.id, name: a.name, on: a.id === s.character }));

        const difficulties = game.heart.difficulties.map(id => ({
            id, label: loc(`heart.difficulty.${id}`), on: s.difficulty === id,
            tip: loc(`heart.roll-prompt.difficulty-tip.${id}`),
        }));

        const trait = (kind, id) => {
            const data = actor?.system?.[`${kind}s`]?.[id];
            const has = Boolean(data?.value);
            const blocked = has && ((kind === 'skill' && flags.tired) || (kind === 'domain' && flags.clouded));
            const label = loc(`heart.${kind}.${id}`);
            // the chip's rule (what the skill or domain covers, 2026-09-30),
            // or why it adds no die for this character
            const rule = loc(`heart.tip.${kind}.${id}`);
            let tip;
            if (!actor) tip = rule;
            else if (!has) tip = game.i18n.format('heart.roll-prompt.lacks', { name: actor.name, what: label });
            else if (blocked) tip = game.i18n.format(`heart.roll-prompt.${kind === 'skill' ? 'tired' : 'clouded'}`, { what: label });
            else tip = rule + (data.knack ? ` ${game.i18n.format('heart.roll-prompt.knack-tip', { knack: data.knack })}` : '');
            return { id, label, has, knack: has && Boolean(data.knack), on: s[kind] === id, lack: actor && !has, blocked, tip };
        };
        const skills = game.heart.skills.map(id => trait('skill', id));
        const domains = game.heart.domains.map(id => trait('domain', id));

        const helperIds = s.helpers;
        const helpers = this._helperCandidates().map(h => {
            const e = helperEligibility(h, s.skill, s.domain);
            const on = helperIds.includes(h.id);
            const full = !on && helperIds.length >= HELPER_LIMIT;
            const clickable = on || isGM || (e.ok && !full);
            const reason = !e.ok ? e.reason : full ? loc('heart.roll-prompt.helper-full') : e.reason;
            return { id: h.id, name: h.name, on, ok: e.ok, blocked: !clickable, override: isGM && (!e.ok || full) && !on, tip: reason };
        });

        const pool = buildPool(actor, s);
        const count = pool.count;
        let say;
        if (pool.impossible) say = loc('heart.roll-prompt.say-impossible');
        else if (pool.fresh) say = game.i18n.format('heart.roll-prompt.say-fresh', { difficulty: loc(`heart.difficulty.${s.difficulty}`), count });
        else if (!pool.cut) say = loc('heart.roll-prompt.say-standard');
        else say = game.i18n.format(`heart.roll-prompt.say-cut-${pool.cut}`, { left: pool.kept });

        const rollLabel = pool.impossible ? loc('heart.roll-prompt.roll-impossible')
            : pool.fresh ? loc('heart.roll-prompt.roll-fresh')
            : game.i18n.format(count === 1 ? 'heart.roll-prompt.roll-one' : 'heart.roll-prompt.roll-n', { count });

        const banner = [s.mastery ? loc('heart.mastery.label') : loc('heart.perform.roll'),
            s.domain ? loc(`heart.domain.${s.domain}`) : null,
            s.skill ? loc(`heart.skill.${s.skill}`) : null].filter(Boolean).join(' ');

        return {
            actor, isGM, characters, difficulties, skills, domains, helpers,
            hasHelpers: helpers.length > 0,
            noSkill: s.skill === null, noDomain: s.domain === null,
            mastery: s.mastery,
            knacks: knackFor(actor, s.skill, s.domain),
            hints: difficultyHints(actor),
            pool, say, rollLabel, banner,
            countLabel: pool.impossible ? loc('heart.roll-prompt.no-roll')
                : pool.fresh ? loc('heart.roll-prompt.one-fresh')
                : game.i18n.format(count === 1 ? 'heart.roll-prompt.count-one' : 'heart.roll-prompt.count-n', { count }),
            canRoll: Boolean(actor),
            legendHas: actor ? game.i18n.format('heart.roll-prompt.legend-has', { name: actor.name }) : '',
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        const s = this.state;

        html.find('[data-k]').click(ev => {
            ev.preventDefault();
            const el = ev.currentTarget;
            if (el.classList.contains('blocked')) return;
            const { k, v } = el.dataset;
            switch (k) {
                case 'character': s.character = v; s.helpers = s.helpers.filter(id => id !== v); break;
                case 'difficulty': s.difficulty = v; break;
                case 'skill': s.skill = v || null; break;
                case 'domain': s.domain = v || null; break;
                case 'mastery': s.mastery = !s.mastery; break;
                case 'helper': s.helpers = s.helpers.includes(v) ? s.helpers.filter(id => id !== v) : [...s.helpers, v]; break;
            }
            // a changed skill / domain can make a ticked helper ineligible
            if ((k === 'skill' || k === 'domain') && !game.user.isGM) {
                s.helpers = s.helpers.filter(id => helperEligibility(game.actors.get(id), s.skill, s.domain).ok);
            }
            this.render(false);
        });

        html.find('[data-action=roll]').click(ev => {
            ev.preventDefault();
            if (!this.actor) return;
            this._settle({ ...s, helpers: [...s.helpers] });
            this.close();
        });
        html.find('[data-action=cancel]').click(ev => {
            ev.preventDefault();
            this.close();
        });
    }

    _settle(value) {
        if (this._settled) return;
        this._settled = true;
        this._resolve(value);
    }

    async close(options) {
        this._settle(null);
        return super.close(options);
    }
}

