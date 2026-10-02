import { trackStress } from '../../bonds/rules';

// actor.proxy for a hireling / animal: FalloutRoll and the GM's bond check
// read totalStress (its five tracks, like a delver)
export default {
    'hireling': function Hireling(actor) {
        return new Proxy(actor, {
            get(actor, name) {
                if (name === 'totalStress') return trackStress(actor.system.resistances);
                if (name === 'fallouts') return actor.items.filter(i => i.type === 'fallout' && !i.system?.complete);
                // the characters whose bonds link this hireling
                if (name === 'employers') {
                    return game.actors.filter(a => a.type === 'character'
                        && a.items.some(i => i.type === 'bond' && i.system.target === actor.uuid));
                }
                if (name === 'effects') {
                    return actor.items.reduce((o, item) => o.concat(item.transferredEffects), []);
                }
            }
        });
    }
};
