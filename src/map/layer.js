// The Heart map's tools (2026-10-02): a canvas layer with its own scene
// controls, shown only on a map scene. The map itself is drawn by
// render.js in the primary group; this layer (in the interface group) only
// takes the clicks and draws the tools' marks (the first end of a new link,
// a landmark being dragged).
//
// The GM places landmarks by dropping them on the map (index.js). Tools:
// Reveal (click: hidden -> rumoured -> known; right-click back), Move (drag
// a landmark's scrap), Link (click two landmarks), Erase (take a landmark
// off the map, or remove a link), Player view (the map as players see it),
// and Reload layout. With Link, a click on a link
// changes its kind, state, or delve. Players get Inspect: click a
// known landmark to open it (or see its art). With Move, a double-click opens
// a landmark or a delve (with Reveal it would also change the state).
import { nodeAt, linkAt, nextState } from './model';
import { HeartMapRenderer } from './render';
import { reloadMapLayout } from './layout';
import {
    isMapScene, nodeDoc, setNodeState, setLinkState, setNode, setLink, addLink, removeNode, removeLink,
} from './api';
import { linkDialog, confirmRemove } from './dialogs';
import { showArt } from '../common/art';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export class HeartMapLayer extends InteractionLayer {
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, { name: 'heartMap', zIndex: 260 });
    }

    renderer = new HeartMapRenderer();
    // the GM sees the map as players do (the Player view tool)
    preview = false;
    #overlay = null;
    #from = null;
    #drag = null;

    get isMap() {
        return isMapScene(canvas.scene);
    }

    get viewer() {
        return game.user.isGM && !this.preview ? 'gm' : 'player';
    }

    async _draw(options) {
        await super._draw(options);
        this.#overlay = this.addChild(new PIXI.Graphics());
        this.#from = null;
        this.#drag = null;
    }

    async _tearDown(options) {
        this.renderer.clear();
        this.#overlay = null;
        return super._tearDown(options);
    }

    _deactivate() {
        this.#from = null;
        this.#drag = null;
        this.#drawOverlay();
    }

    // Draw (or clear) the map for the scene on the canvas now
    async refresh() {
        if (!canvas.ready && !canvas.scene) return;
        if (!this.isMap) {
            this.renderer.clear();
            return;
        }
        await this.renderer.draw(canvas.scene, this.viewer);
        this.#drawOverlay();
    }

    // Many updates in a moment (a delve's resistance ticking, several
    // reveals) redraw once
    queueRefresh = foundry.utils.debounce(() => this.refresh(), 80);

    async setPreview(on) {
        this.preview = Boolean(on);
        await this.refresh();
    }

    /* -------------------------------------------- */
    /*  What is under the pointer                   */
    /* -------------------------------------------- */

    #pointOf(event, which = 'origin') {
        const p = event.interactionData?.[which] ?? event.getLocalPosition?.(this);
        return p ? this.renderer.toMap(p) : null;
    }

    #nodeAt(event, which) {
        const view = this.renderer.view;
        const pt = this.#pointOf(event, which);
        return view && pt ? nodeAt(view, pt) : null;
    }

    #linkAt(event) {
        const view = this.renderer.view;
        const pt = this.#pointOf(event);
        return view && pt ? linkAt(view, pt, 24) : null;
    }

    /* -------------------------------------------- */
    /*  The tools' marks                            */
    /* -------------------------------------------- */

    #drawOverlay() {
        const g = this.#overlay;
        if (!g || g.destroyed) return;
        g.clear();
        const r = this.renderer;
        if (!r.view) return;
        const k = r.scale;
        const ring = (node, color, x = node.x, y = node.y) => {
            const c = r.toCanvas({ x, y });
            g.lineStyle({ width: 6, color, alpha: 0.9 }).drawCircle(c.x, c.y, (node.radius + 14) * k);
        };
        if (this.#from) {
            const n = r.view.nodes.find(x => x.key === this.#from);
            if (n) ring(n, 0xef5a4d);
        }
        if (this.#drag?.to) {
            const n = r.view.nodes.find(x => x.key === this.#drag.key);
            if (n) {
                ring(n, 0x8a7a6a);
                ring(n, 0xef5a4d, this.#drag.to.x, this.#drag.to.y);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Clicks                                      */
    /* -------------------------------------------- */

    async _onClickLeft(event) {
        if (!this.isMap || !this.renderer.view) return;
        const tool = game.activeTool;
        const node = this.#nodeAt(event);
        const scene = canvas.scene;
        if (!game.user.isGM || tool === 'inspect') return node ? this.#inspect(node) : undefined;
        if (tool === 'reveal') {
            if (node) return setNodeState(scene, node.key, nextState(node.state, 1));
            const link = this.#linkAt(event);
            if (link) return setLinkState(scene, link.id, nextState(link.state, 1));
        } else if (tool === 'link') {
            if (!node) {
                this.#from = null;
                this.#drawOverlay();
                // a click on a link changes it (its kind, state, or delve)
                const link = this.#linkAt(event);
                if (!link) return;
                const a = this.renderer.view.nodes.find(x => x.key === link.a);
                const b = this.renderer.view.nodes.find(x => x.key === link.b);
                const answer = await linkDialog(a, b, { kind: link.kind, state: link.state, delve: link.delve ?? '' });
                if (answer) return setLink(scene, link.id, answer);
                return;
            }
            if (!this.#from || this.#from === node.key) {
                this.#from = this.#from === node.key ? null : node.key;
                return this.#drawOverlay();
            }
            const a = this.renderer.view.nodes.find(x => x.key === this.#from);
            this.#from = null;
            this.#drawOverlay();
            const answer = await linkDialog(a, node);
            if (answer) return addLink(scene, { a: a.key, b: node.key, ...answer });
        } else if (tool === 'erase') {
            const link = node ? null : this.#linkAt(event);
            const target = node ?? link;
            if (!target) return;
            // (a link from the layout can only be hidden; a placed landmark
            // of any kind comes off the map)
            if (!node && !target.custom) return ui.notifications.info(loc('heart.map.erase-book-link'));
            const name = node ? node.name : `${this.#nameOf(link.a)} - ${this.#nameOf(link.b)}`;
            if (!(await confirmRemove(name))) return;
            return node ? removeNode(scene, node.key) : removeLink(scene, link.id);
        }
    }

    async _onClickRight(event) {
        if (!this.isMap || !this.renderer.view || !game.user.isGM) return;
        const tool = game.activeTool;
        const scene = canvas.scene;
        const node = this.#nodeAt(event);
        if (tool === 'reveal') {
            if (node) return setNodeState(scene, node.key, nextState(node.state, -1));
            const link = this.#linkAt(event);
            if (link) return setLinkState(scene, link.id, nextState(link.state, -1));
        } else if (tool === 'link') {
            this.#from = null;
            this.#drawOverlay();
        }
    }

    async _onClickLeft2(event) {
        if (!this.isMap || !this.renderer.view || !game.user.isGM || game.activeTool !== 'move') return;
        const node = this.#nodeAt(event);
        if (node) return this.#open(node);
        const link = this.#linkAt(event);
        if (link?.delve) (await fromUuid(link.delve))?.sheet?.render(true);
    }

    #nameOf(key) {
        return this.renderer.view?.nodes.find(n => n.key === key)?.name ?? key;
    }

    // The GM opens the world copy, else the book's entry
    async #open(node) {
        const doc = node.doc ?? nodeDoc(node);
        const full = doc?.sheet ? doc : await fromUuid(doc?.uuid ?? node.uuid);
        full?.sheet?.render(true);
    }

    // A player opens a known landmark they may see, else its art
    async #inspect(node) {
        if (node.look === 'rumoured') return ui.notifications.info(loc('heart.map.rumoured-note', { name: node.name }));
        if (node.look !== 'known' && !game.user.isGM) return;
        const doc = node.doc ?? nodeDoc(node);
        if (doc?.sheet && doc.testUserPermission?.(game.user, 'OBSERVER')) return doc.sheet.render(true);
        if (node.art?.src && doc) return showArt(doc);
        ui.notifications.info(node.name);
    }

    /* -------------------------------------------- */
    /*  Dragging a landmark (Move)                  */
    /* -------------------------------------------- */

    _canDragLeftStart(user, event) {
        return Boolean(user.isGM && this.isMap && game.activeTool === 'move' && this.#nodeAt(event));
    }

    _onDragLeftStart(event) {
        const node = this.#nodeAt(event);
        this.#drag = node ? { key: node.key, dx: 0, dy: 0, start: this.#pointOf(event), node: { x: node.x, y: node.y } } : null;
    }

    _onDragLeftMove(event) {
        if (!this.#drag) return;
        const p = this.#pointOf(event, 'destination');
        if (!p) return;
        this.#drag.to = { x: this.#drag.node.x + (p.x - this.#drag.start.x), y: this.#drag.node.y + (p.y - this.#drag.start.y) };
        this.#drawOverlay();
    }

    async _onDragLeftDrop(event) {
        const drag = this.#drag;
        this.#drag = null;
        this.#drawOverlay();
        if (!drag?.to) return;
        const view = this.renderer.view;
        const x = Math.round(Math.min(view.w, Math.max(0, drag.to.x)));
        const y = Math.round(Math.min(view.h, Math.max(0, drag.to.y)));
        return setNode(canvas.scene, drag.key, { x, y });
    }

    _onDragLeftCancel() {
        this.#drag = null;
        this.#drawOverlay();
    }
}

/* -------------------------------------------- */
/*  Scene controls                              */
/* -------------------------------------------- */

export function mapControls(controls) {
    if (!isMapScene(canvas?.scene)) return;
    const gm = game.user.isGM;
    const layer = canvas.heartMap;
    const tool = (name, icon, extra = {}) => ({ name, icon, title: loc(`heart.map.tool.${name}`), ...extra });
    controls.push({
        name: 'heartMap',
        title: loc('heart.map.control'),
        layer: 'heartMap',
        icon: 'fa-solid fa-stairs',
        visible: true,
        activeTool: gm ? 'reveal' : 'inspect',
        tools: gm
            ? [
                tool('reveal', 'fa-solid fa-eye'),
                tool('move', 'fa-solid fa-up-down-left-right'),
                tool('link', 'fa-solid fa-route'),
                tool('erase', 'fa-solid fa-eraser'),
                tool('preview', 'fa-solid fa-user-secret', {
                    toggle: true,
                    active: Boolean(layer?.preview),
                    onClick: on => layer?.setPreview(on),
                }),
                tool('reload', 'fa-solid fa-rotate', {
                    button: true,
                    onClick: async () => {
                        await reloadMapLayout();
                        await layer?.refresh();
                        ui.notifications.info(loc('heart.map.reloaded'));
                    },
                }),
            ]
            : [tool('inspect', 'fa-solid fa-magnifying-glass')],
    });
}
