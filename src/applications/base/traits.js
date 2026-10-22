import traitsHTML from './traits.html';
import HeartApplication from './application';

// Pick skills or domains, with their knacks. Rewritten 2026-09-29: edits used
// to save per field on "change", but knack boxes are <textarea>s and only
// input[type=text] was listened to, so knacks never saved; there was also no
// <form> to submit. Now everything is a normal form applied by the explicit
// Save button. One class for both since 2026-10-21 (Luke: the skills and
// domains windows were the same code twice); skills-management and
// domain-management keep their registered names and set the kind.
export default class TraitsManagementApplication extends HeartApplication {
    constructor(actor, options = {}) {
        super(actor, options);
        this.actor = actor;
    }

    // 'skill' or 'domain'
    static get kind() {
        return 'skill';
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: traitsHTML.path,
            // 380 (was 520): the knack boxes had far more width than they use
            width: 380,
            height: "auto",
            resizable: true,
            closeOnSubmit: true,
            submitOnChange: false,
            submitOnClose: false,
        });
    }

    getData() {
        const data = super.getData();
        const kind = this.constructor.kind;
        const group = `${kind}s`;
        return foundry.utils.mergeObject(data, { kind, group, traits: this.actor.system[group] });
    }

    activateListeners(html) {
        super.activateListeners(html);
        const kind = this.constructor.kind;

        // Live visual state for the checkboxes; the data only changes on Save.
        html.find('input[type="checkbox"]').change(ev => {
            const row = ev.currentTarget.closest(`.${kind}-edit-row`);
            row?.classList.toggle('selected', ev.currentTarget.checked);
            row?.classList.toggle('unselected', !ev.currentTarget.checked);
            // the knack box sits right after the row in the grid; it only
            // takes input once the trait is ticked (a disabled box keeps its
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
