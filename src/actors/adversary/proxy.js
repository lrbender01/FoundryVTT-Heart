import { activeOf } from '../proxy-lists';

// (2026-10-21: the dead ActiveEffect branch and the class branches went;
// an adversary has no class, so actor.proxy.class was always undefined)
export default {
    'adversary': function Adversary(actor) {
        return new Proxy(actor, {
            get(actor, name) {
                if (name === 'totalStress') {
                    return actor.system.resistance;
                }
                if (name === 'resources') return activeOf(actor, 'resource', { sorted: true });
                if (name === 'equipment') return activeOf(actor, 'equipment', { sorted: true });
            }
        });
    }
}
