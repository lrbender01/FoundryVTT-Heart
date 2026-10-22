import { activeOf, bySort } from '../proxy-lists';

// (2026-10-21: the dead ActiveEffect branch, the class branches (a landmark
// has no class), and a totalStress that read a field landmarks don't have
// went)
export default {
    'landmark': function Landmark(actor) {
        return new Proxy(actor, {
            get(actor, name) {
                if (name === 'haunts') return activeOf(actor, 'haunt', { sorted: true });
                if (name === 'resources') return activeOf(actor, 'resource', { sorted: true });

                // Gear the book lists at a landmark (2026-09-29): active
                // equipment items, shown in their own panel when present
                if (name === 'equipment') {
                    return bySort(actor.items.filter(item => item.type === 'equipment' && (item.system.active ?? true)));
                }
            }
        });
    }
}
