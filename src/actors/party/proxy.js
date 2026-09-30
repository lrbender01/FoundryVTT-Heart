import { provisionsOf, activePartyFallouts, PARTY_API } from './party';

// actor.proxy for the party: derived Provisions data plus the API
// (game.heart.party.proxy.markProvisions(...), etc.)
export default {
    'party': function Party(actor) {
        return new Proxy(actor, {
            get(actor, name) {
                if (name === 'provisions') return provisionsOf(actor);

                // FalloutRoll reads totalStress; for the party it is Provisions
                if (name === 'totalStress') return Number(actor.system.provisions?.value) || 0;

                if (name === 'fallouts') return activePartyFallouts(actor);

                if (name === 'isFull') {
                    const p = provisionsOf(actor);
                    return p.value >= p.max;
                }

                if (name === 'effects') {
                    return actor.items.reduce((o, item) => o.concat(item.transferredEffects), []);
                }

                if (Object.prototype.hasOwnProperty.call(PARTY_API, name)) return PARTY_API[name];
            }
        });
    }
};
