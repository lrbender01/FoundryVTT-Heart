import applicationHTML from './application.html';
import HeartApplication from '../base/application';

// Generic chip picker for the fields a roll still needs (stress stakes,
// fallout character, ...). The Heart action roll has its own prompt
// (applications/heart-roll). A requirement may carry `default` (the value
// preselected; otherwise the first option) and `hint`. `cancel` is called
// when the window closes without submitting (2026-09-30), so callers never
// wait forever.
export default class RequirementApplication extends HeartApplication {
    static get defaultOptions() {
        // Sized to its content (2026-09-29 review): large chips, the window
        // grows with them instead of scrolling
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: applicationHTML.path,
            width: 560,
            height: 'auto',
        });
    }

    static get formType() {
        return 'requirement'
    }

    static build({requirements, callback, cancel, type, description}) {
        new this({}, {
            type,
            requirements,
            callback,
            cancel,
            description
        }).render(true);
    }

    activateListeners(html) {
        super.activateListeners(html);
        const form = html.get(0);

        html.find('[data-action=submit]').click(async ev => {
            const data = new FormData(form);

            const output = Object.entries(this.options.requirements).reduce((map, [key, requirement]) => {
                if(requirement.isCheckbox) {
                    const value = data.get(key);
                    map[key] = value !== null;
                } else if(requirement.isMany) {
                    map[key] = data.getAll(key);
                } else {
                    map[key] = data.get(key);
                }

                return map;
            }, {});

            this._submitted = true;
            this.options.callback(output);
            this.close()
        });
    }

    async close(options) {
        if (!this._submitted && typeof this.options.cancel === 'function') {
            this._submitted = true;
            this.options.cancel();
        }
        return super.close(options);
    }

    get title() {
        const key = `heart.applications.${this.options.type}.title`;
        if (this.options.type && game.i18n.has(key)) return game.i18n.localize(key);
        return game.i18n.localize(`heart.applications.${this.constructor.formType}.title`);
    }
}
