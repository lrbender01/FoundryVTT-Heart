import TraitsManagementApplication from '../base/traits';

// Pick domains + knacks (the shared window: applications/base/traits.js,
// since 2026-10-21)
export default class DomainsManagementApplication extends TraitsManagementApplication {
    static get kind() {
        return 'domain';
    }

    static get formType() {
        return 'domains-management';
    }
}
