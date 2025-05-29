
class HTMLElement extends Object {
    constructor() {
        super(...arguments);
    }
};

import * as PIXI from "/home/cian/Downloads/FoundryVTT/resources/app/node_modules/pixi.js/dist/pixi.mjs"

global.HTMLElement = HTMLElement;
global.BiquadFilterNode = HTMLElement;
global.ConvolverNode = HTMLElement;
global.PIXI = PIXI;

global.window = {
    customElements: {
        define: () => {}
    }
};