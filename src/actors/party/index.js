// Party actor (Provisions house rule, 2026-09-30). Picked up by the
// './**/index.js' module glob in src/index.js, which calls initialise() after
// game.heart exists. The proxy and the sheet register through
// src/actors/index.js like every other actor type.
import { getParty, registerPartyHooks } from './party';

registerPartyHooks();

export function initialise() {
    // game.heart.party: the world's one party actor (undefined before ready,
    // or until a GM has loaded the world once)
    Object.defineProperty(game.heart, 'party', { get: getParty, configurable: true, enumerable: true });
}
