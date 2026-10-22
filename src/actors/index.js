
import sheet_modules from './*/sheet.js';
import proxies from './*/proxy.js';
import { resistanceBarOf, resistanceOf, marksForLeft } from './adversary/resistance';
import { registerResistanceBarSync, correctResistanceBars } from './adversary/resistance-sync';

class HeartActor extends Actor {
    // An adversary's Resistance bar is what is left (Luke, 2026-10-21;
    // adversary/resistance.js). Derived here too, so an unlinked token's
    // copy shows the right bar whatever its stored field says.
    prepareDerivedData() {
        super.prepareDerivedData();
        if (this.type === 'adversary' && this.system) this.system.resistanceBar = resistanceBarOf(this.system);
    }

    // Editing that bar on a token (by value or by +/-) moves the marks, so
    // the boxes and the bar always agree
    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        if (this.type === 'adversary' && attribute === 'resistanceBar') {
            const { left } = resistanceOf(this.system);
            const next = isDelta ? left + (Number(value) || 0) : value;
            return this.update({ 'system.resistance': marksForLeft(this.system, next) });
        }
        return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    }

    get proxy() {
        if(this._proxy === undefined && this.constructor.proxies[this.type] !== undefined) {
            this._proxy = this.constructor.proxies[this.type](this);
        }

        return this._proxy;
    }

    // (heart_effects, the dead ActiveEffect chain, and the "@" branch of
    // getEmbeddedDocument went 2026-10-21: actors hold no system.children)
}

HeartActor.proxies = {};

export function initialise() {
    Actors.unregisterSheet('core', ActorSheet);

    sheet_modules.forEach(function(module) {
        const Sheet = module.default;
        const type = Sheet.type;

        if(game.heart.actors === undefined) {
            game.heart.actors = {}
        }

        if(game.heart.actors[type] === undefined) {
            game.heart.actors[type] = {}
        }
        
        CONFIG.Actor.typeLabels[type] = `heart.${type}.label-single`;

        game.heart.actors[type].sheet = Sheet

        if(type === 'base') return;

        Actors.registerSheet('heart', Sheet, {
            types: [type],
            makeDefault: true,
            // a string key (2026-10-02): `heart.${type}` names a lang section,
            // which Sheet Config showed as "[object Object]"
            label: `heart.${type}.label-single`
        });
    });

    CONFIG.Actor.documentClass = HeartActor;
    // Create Actor preselects Adversary, the type the GM makes most often
    // (2026-09-30 review)
    CONFIG.Actor.defaultType = 'adversary';

    proxies.forEach(function(module) {
        Object.entries(module.default).forEach(([type, proxy]) => {
            HeartActor.proxies[type] = proxy;
        });
    });

    // An adversary's stored Resistance bar follows its marks, and older
    // adversaries get one once on the active GM's client (2026-10-21)
    registerResistanceBarSync();
    Hooks.once('ready', () => correctResistanceBars());
}