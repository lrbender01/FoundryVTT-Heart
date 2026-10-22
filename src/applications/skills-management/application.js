import TraitsManagementApplication from '../base/traits';

// Pick skills + knacks (the shared window: applications/base/traits.js,
// since 2026-10-21)
export default class SkillsManagementApplication extends TraitsManagementApplication {
    static get kind() {
        return 'skill';
    }

    static get formType() {
        return 'skills-management';
    }
}
