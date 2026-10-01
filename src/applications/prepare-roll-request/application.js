import applicationHTML from './application.html';
import HeartApplication from '../base/application';
import { partyMembers } from '../../actors/party/view';

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
        // the party's members when there is a party with members, else every
        // character
        const party = game.heart.party;
        const members = party ? partyMembers(party) : [];
        const people = (members.length ? members : game.actors.filter(a => a.type === 'character'))
            .map(a => ({ id: a.id, name: a.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const labels = (list, kind) => Object.fromEntries(list.map(k => [k, game.i18n.localize(`heart.${kind}.${k}`)]));
        return foundry.utils.mergeObject(data, {
            characters: people,
            skills: labels(game.heart.skills, 'skill'),
            domains: labels(game.heart.domains, 'domain'),
            difficulties: labels(game.heart.difficulties, 'difficulty'),
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

            CONFIG.ChatMessage.documentClass.create({
                speaker: { alias: game.user.name },
                flags: {
                    heart: {
                        ["roll-request"]: {
                            difficulty: data.get('difficulty'),
                            characters,
                            skills: data.getAll('skill'),
                            domains: data.getAll('domain'),
                            validHelpers: data.getAll('helper'),
                        }
                    }
                }
            });

            this.close();
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
