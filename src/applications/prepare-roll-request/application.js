import applicationHTML from './application.html';
import HeartApplication from '../base/application';
import { helperPool } from '../../actors/party/view';
import { normalizeStakes, hasStakes } from '../../rolls/stress-roll/rules';

// Prepare Roll Request (GM): pick a difficulty, who rolls, the skills and
// domains on offer, and who may help; posts a roll request card
// (chat-message.html) each named character rolls from. Opened from the
// Actors sidebar's GM-only "Request Roll" button (2026-09-30, Luke: it had
// no way in since the character sheet's button went).
export default class PrepareRollRequestApplication extends HeartApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: applicationHTML.path,
            width: 560,
        });
    }

    static get formType() {
        return 'prepare-roll-request';
    }

    static open() {
        if (!game.user.isGM) return null;
        return new this({}).render(true);
    }

    getData() {
        const data = super.getData();
        // the party's members first, the same list the roll prompt offers
        // as helpers (actors/party/view.js helperPool; Luke, 2026-10-21, R27)
        const people = helperPool().map(a => ({ id: a.id, name: a.name }));
        const labels = (list, kind) => Object.fromEntries(list.map(k => [k, game.i18n.localize(`heart.${kind}.${k}`)]));
        return foundry.utils.mergeObject(data, {
            characters: people,
            skills: labels(game.heart.skills, 'skill'),
            domains: labels(game.heart.domains, 'domain'),
            difficulties: labels(game.heart.difficulties, 'difficulty'),
            // the stakes (2026-10-21): the five tracks and Provisions, D4 to D12
            stakeResistances: labels(game.heart.stress_targets ?? [], 'resistance'),
            stakeDice: Object.fromEntries((game.heart.stress_dice ?? []).map(d => [d, d.toUpperCase()])),
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html.get(0);

        html.find('[data-action=submit]').click(async ev => {
            ev.preventDefault();
            const data = new FormData(form);
            const characters = data.getAll('character');
            if (!characters.length) {
                ui.notifications.warn(game.i18n.localize('heart.applications.prepare-roll-request.no-character'));
                return;
            }

            // the stakes, each optional: blank means the roller chooses
            // (Luke, 2026-10-21)
            const stakes = normalizeStakes({
                resistance: data.get('stake-resistance'),
                die_size: data.get('stake-die'),
                passive: data.get('stake-passive'),
            }, game.heart.stress_targets ?? []);

            // waited for, so a failure is reported, not left unhandled
            // (2026-10-21, R24); the window stays open to try again
            try {
                await CONFIG.ChatMessage.documentClass.create({
                    speaker: { alias: game.user.name },
                    flags: {
                        heart: {
                            ["roll-request"]: {
                                difficulty: data.get('difficulty'),
                                characters,
                                skills: data.getAll('skill'),
                                domains: data.getAll('domain'),
                                validHelpers: data.getAll('helper'),
                                ...(hasStakes(stakes) ? { stakes } : {}),
                            }
                        }
                    }
                });
            } catch (err) {
                console.error('heart | the roll request could not be posted', err);
                ui.notifications.error(game.i18n.localize('heart.relay.failed'));
                return;
            }

            await this.close();
        });
    }
}

// Launch point (GM): a button in the Actors sidebar header, beside Beat
// Tracker
export function initialise() {
    Hooks.on("renderActorDirectory", (app, html) => {
        if (!game.user.isGM) return;
        const root = html instanceof jQuery ? html[0] : html;
        const actions = root.querySelector(".header-actions");
        if (!actions || actions.querySelector(".heart-roll-request-button")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "heart-roll-request-button";
        button.innerHTML = `<i class="fas fa-comment-dots"></i> ${game.i18n.localize("heart.applications.prepare-roll-request.open")}`;
        button.addEventListener("click", (ev) => {
            ev.preventDefault();
            PrepareRollRequestApplication.open();
        });
        actions.append(button);
    });
}
