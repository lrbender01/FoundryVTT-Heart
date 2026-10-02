// Bonds, hirelings, and animals (2026-10-01). Picked up by the './**/index.js'
// module glob in src/index.js, which calls initialise() after game.heart
// exists. The `bond` item type and the `hireling` actor type register
// through items/ and actors/ like every other type.
import { BOND_API, registerBondHooks } from './bonds';
import { registerBondRequests } from './flow';
import './bonds.sass';

registerBondHooks();
// a player's "request a bond" chat card and its GM buttons (2026-10-01)
registerBondRequests();

export function initialise() {
    // game.heart.bonds: addBond, hire, removeBond, transferStress,
    // healFallout, markBondStress, rollBondFallout, setBondStress,
    // clearBondStress, bondAction, and the readers bondsOf / bondTarget /
    // bondFallouts / bondState
    game.heart.bonds = BOND_API;
}
