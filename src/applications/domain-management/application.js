import applicationHTML from './application.html';
import HeartApplication from '../base/application';

// Pick domains + knacks. Rewritten 2026-09-29: edits used to save per field on
// "change", but knack boxes are <textarea>s and only input[type=text] was
// listened to, so knacks never saved; there was also no <form> to submit.
// Now everything is a normal form applied by the explicit Save button.
export default class DomainsManagementApplication extends HeartApplication {
    constructor(actor, options = {}) {
        super(actor, options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: applicationHTML.path,
            // 380 (was 520): the knack boxes had far more width than they use
            width: 380,
            height: "auto",
            resizable: true,
            closeOnSubmit: true,
            submitOnChange: false,
            submitOnClose: false,
        });
    }

    static get formType() {
        return 'domains-management'
    }

    getData() {
        const data = super.getData();
        return foundry.utils.mergeObject(data, {
            domains: this.actor.system.domains,
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Live visual state for the checkboxes; the data only changes on Save.
        html.find('input[type="checkbox"]').change(ev => {
            const row = ev.currentTarget.closest('.domain-edit-row');
            row?.classList.toggle('selected', ev.currentTarget.checked);
            row?.classList.toggle('unselected', !ev.currentTarget.checked);
            // the knack box sits right after the row in the grid; it only
            // takes input once the domain is ticked (a disabled box keeps its
            // saved text: disabled fields are left out of the submitted form)
            const knack = row?.nextElementSibling;
            if (knack?.classList.contains('knack-input')) knack.disabled = !ev.currentTarget.checked;
        });

        html.find('[data-action=save]').click(ev => {
            ev.preventDefault();
            this.submit();
        });
    }

    async _updateObject(event, formData) {
        await this.actor.update(formData);
    }
}
