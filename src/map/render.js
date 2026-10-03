// The Heart map on the canvas (2026-10-02; the scrapbook map the same day):
// draws a viewer's map (model.js viewFor) into one PIXI container in the
// primary canvas group, above the scene's background and below tiles,
// drawings, and tokens, so the delvers' tokens walk on it. Bottom to top:
// the board, the depth wash and the Heart's glow, the backdrop pieces under
// the scraps, the depth gauge strip, the routes, the scraps (shadow, paper,
// art in its torn circle, ink ring, name, pin or tape), the pieces over the
// scraps. The map is a fixed art piece: its colours are the book's ink and
// paper and the layout's ink, not theme roles.
//
// Until the book texture set lands, the board and the scraps' paper are
// generated (specks, fibres, and stains); the layout's board / scraps
// images replace them. Nothing here is interactive; the GM's tools are the
// HeartMapLayer (layer.js) in the interface group.
import {
    inkAt, cssColor, dashes, railTies, blob, roughAt, inkBlot, sketchPass, gaugeStrip,
    artBox, pointAlong, pathLength, tornRect,
} from './model';
import { sceneView, nodeDoc } from './api';
import { mapArtUrl } from './layout';
import { artOf } from '../common/art';

const SPENT = 0x6f645b;
const FONT_DISPLAY = 'Mosherif, "Alegreya SC", Georgia, serif';
const FONT_BODY = 'Alegreya, Georgia, serif';
// above the scene background (SCENE = 0), below tiles (500)
const SORT_LAYER = 100;
// the generated papers' tints (a scrap takes one by its seed)
const PAPERS = ['#ddd0b2', '#e6dcc4', '#d4c39c'];

/* -------------------------------------------- */
/*  Generated textures (made once)              */
/* -------------------------------------------- */

const made = {};

function canvasTexture(key, w, h, paint) {
    if (made[key] && !made[key].destroyed) return made[key];
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    paint(el.getContext('2d'), w, h);
    const tex = PIXI.Texture.from(el);
    tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    made[key] = tex;
    return tex;
}

// specks, fibres, and a few stains over a ground (seeded, so every client
// matches)
function grain(g, w, h, seed, dark) {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tone = dark ? '230,210,190' : '70,48,32';
    for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${tone},${(dark ? 0.02 : 0.04) + r() * (dark ? 0.05 : 0.1)})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
        g.strokeStyle = `rgba(${tone},${0.03 + r() * 0.06})`;
        const x = r() * w;
        const y = r() * h;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 60, y + (r() - 0.5) * 60);
        g.stroke();
    }
    for (let i = 0; i < 5; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 30 + r() * 90;
        const st = g.createRadialGradient(x, y, 0, x, y, rad);
        st.addColorStop(0, `rgba(${dark ? '0,0,0' : '120,80,40'},${dark ? 0.25 : 0.07})`);
        st.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = st;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
}

function boardTexture() {
    return canvasTexture('board', 512, 512, (g, w, h) => {
        g.fillStyle = '#1e1613';
        g.fillRect(0, 0, w, h);
        grain(g, w, h, 11, true);
    });
}

function paperTexture(i) {
    const k = ((i % PAPERS.length) + PAPERS.length) % PAPERS.length;
    return canvasTexture(`paper${k}`, 512, 512, (g, w, h) => {
        g.fillStyle = PAPERS[k];
        g.fillRect(0, 0, w, h);
        grain(g, w, h, 7 + k * 13, false);
    });
}

// The Heart's glow: a soft red pool
function glowTexture() {
    return canvasTexture('glow', 256, 256, (g, w, h) => {
        const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grad.addColorStop(0, 'rgba(190,24,18,0.6)');
        grad.addColorStop(0.5, 'rgba(150,16,12,0.25)');
        grad.addColorStop(1, 'rgba(120,10,8,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
    });
}

// The depth wash: clear at the top, darkening toward the foot
function washTexture(top, bottom) {
    return canvasTexture(`wash:${top}:${bottom}`, 4, 512, (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(10,3,2,${top / 100})`);
        grad.addColorStop(1, `rgba(10,3,2,${bottom / 100})`);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
    });
}

/* -------------------------------------------- */
/*  Drawing helpers                             */
/* -------------------------------------------- */

function polyline(g, pts) {
    if (pts.length < 4) return;
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
}

const closed = (pts) => [...pts, pts[0], pts[1]];
const shifted = (pts, dx, dy) => pts.map((v, i) => v + (i % 2 ? dy : dx));

// a stroke drawn twice, the second pass fainter and a little off
function sketch(g, pts, width, color, alpha, seed) {
    g.lineStyle({ width, color, alpha, cap: 'round', join: 'round' });
    polyline(g, pts);
    g.lineStyle({ width: Math.max(1, width * 0.45), color, alpha: alpha * 0.55, cap: 'round', join: 'round' });
    polyline(g, sketchPass(pts, seed, 1.6 + width * 0.25));
}

// a polygon filled with a texture, tiled `tile` map px wide (or stretched
// over `box`)
function texturedPoly(texture, pts, { tile = null, box = null, alpha = 1 } = {}) {
    const g = new PIXI.LegacyGraphics();
    const m = new PIXI.Matrix();
    if (box) m.scale(box.w / texture.width, box.h / texture.height).translate(box.x, box.y);
    else if (tile) m.scale(tile / texture.width, tile / texture.width);
    g.beginTextureFill({ texture, alpha, matrix: m }).drawPolygon(pts).endFill();
    return g;
}

function text(str, style) {
    // (Foundry's classes are global bindings, not window properties)
    const Cls = typeof PreciseText === 'undefined' ? PIXI.Text : PreciseText;
    return new Cls(str, new PIXI.TextStyle({ align: 'center', padding: 6, lineJoin: 'round', ...style }));
}

const BLENDS = {
    normal: PIXI.BLEND_MODES.NORMAL,
    multiply: PIXI.BLEND_MODES.MULTIPLY,
    screen: PIXI.BLEND_MODES.SCREEN,
    overlay: PIXI.BLEND_MODES.OVERLAY,
    luminosity: PIXI.BLEND_MODES.LUMINOSITY,
};

/* -------------------------------------------- */
/*  The renderer                                */
/* -------------------------------------------- */

let fontsReady = null;
function loadFonts() {
    fontsReady ??= Promise.all([
        document.fonts?.load?.('34px Mosherif'),
        document.fonts?.load?.('italic 30px Alegreya'),
        document.fonts?.load?.('30px Alegreya'),
    ]).catch(() => null);
    return fontsReady;
}

export class HeartMapRenderer {
    #container = null;
    #ticket = 0;
    view = null;
    layout = null;

    get drawn() {
        return Boolean(this.#container && !this.#container.destroyed);
    }

    clear() {
        this.#ticket++;
        const c = this.#container;
        this.#container = null;
        this.view = null;
        if (c && !c.destroyed) {
            c.parent?.removeChild(c);
            c.destroy({ children: true });
        }
    }

    // Draw a scene's map for a viewer ('gm' | 'player'); a newer draw
    // started meanwhile wins
    async draw(scene, viewer) {
        const ticket = ++this.#ticket;
        const { layout, view } = await sceneView(scene, viewer);
        for (const n of view.nodes) {
            n.doc = nodeDoc(n);
            n.art = artOf(n.doc);
        }
        await loadFonts();
        const textures = await this.#loadTextures(view);
        if (ticket !== this.#ticket || canvas.scene !== scene || !canvas.primary) return null;

        const old = this.#container;
        const c = this.#build(view, textures);
        const d = canvas.dimensions;
        c.position.set(d.sceneX, d.sceneY);
        c.scale.set(d.sceneWidth / view.w, d.sceneHeight / view.h);
        c.elevation = 0;
        c.sortLayer = SORT_LAYER;
        c.sort = 0;
        c.zIndex = 0;
        c.eventMode = 'none';
        canvas.primary.addChild(c);
        canvas.primary.sortDirty = true;
        if (old && !old.destroyed) {
            old.parent?.removeChild(old);
            old.destroy({ children: true });
        }
        this.#container = c;
        this.view = view;
        this.layout = layout;
        return view;
    }

    // Map px <-> canvas px (the container may be scaled to a resized scene)
    toMap(pt) {
        const d = canvas.dimensions;
        const v = this.view ?? this.layout;
        if (!v) return { x: pt.x, y: pt.y };
        return { x: ((pt.x - d.sceneX) * v.w) / d.sceneWidth, y: ((pt.y - d.sceneY) * v.h) / d.sceneHeight };
    }

    toCanvas(pt) {
        const d = canvas.dimensions;
        const v = this.view ?? this.layout;
        if (!v) return { x: pt.x, y: pt.y };
        return { x: d.sceneX + (pt.x * d.sceneWidth) / v.w, y: d.sceneY + (pt.y * d.sceneHeight) / v.h };
    }

    get scale() {
        const v = this.view;
        return v ? canvas.dimensions.sceneWidth / v.w : 1;
    }

    async #loadTextures(view) {
        const srcs = new Set();
        if (view.board.img) srcs.add(mapArtUrl(view.board.img));
        for (const img of view.scraps.imgs) srcs.add(mapArtUrl(img));
        for (const d of view.decor) srcs.add(mapArtUrl(d.img));
        for (const n of view.nodes) if (n.art?.src && n.look !== 'rumoured') srcs.add(n.art.src);
        const out = new Map();
        await Promise.all([...srcs].map(async src => {
            const tex = await loadTexture(src, { fallback: null }).catch(() => null);
            if (tex) out.set(src, tex);
        }));
        // the board and the scraps' paper tile
        for (const src of [view.board.img, ...view.scraps.imgs].filter(Boolean).map(mapArtUrl)) {
            const tex = out.get(src);
            if (tex) tex.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
        }
        return out;
    }

    // the paper for a scrap (the layout's papers, else a generated one)
    #paper(view, textures, seed) {
        const imgs = view.scraps.imgs.map(i => textures.get(mapArtUrl(i))).filter(Boolean);
        if (imgs.length) return { texture: imgs[seed % imgs.length], tile: view.scraps.w };
        return { texture: paperTexture(seed), tile: 512 };
    }

    #build(view, textures) {
        const c = new PIXI.Container();
        c.name = 'heart-map';
        c.addChild(this.#board(view, textures));
        c.addChild(this.#decor(view, textures, 'under'));
        c.addChild(this.#gauge(view, textures));
        c.addChild(this.#links(view));
        for (const n of view.nodes) c.addChild(this.#scrap(n, view, textures));
        c.addChild(this.#decor(view, textures, 'over'));
        return c;
    }

    #board(view, textures) {
        const box = new PIXI.Container();
        const rect = [0, 0, view.w, 0, view.w, view.h, 0, view.h];
        const tex = view.board.img ? textures.get(mapArtUrl(view.board.img)) : null;
        const base = new PIXI.LegacyGraphics();
        base.beginFill(0x1e1613).drawRect(0, 0, view.w, view.h).endFill();
        box.addChild(base);
        box.addChild(texturedPoly(tex ?? boardTexture(), rect, { tile: tex ? view.board.w : 512, alpha: tex ? view.board.o / 100 : 1 }));
        const wash = new PIXI.Sprite(washTexture(view.wash.top, view.wash.bottom));
        wash.width = view.w;
        wash.height = view.h;
        box.addChild(wash);
        // the Heart's glow, on its mark (else near the foot)
        const heart = view.gauge.marks.find(b => b.id === 'heart');
        const cy = heart ? (heart.y + heart.y1) / 2 : view.h * 0.9;
        const glow = new PIXI.Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.position.set(view.w / 2, cy);
        glow.width = view.w * 1.4;
        glow.height = (heart ? heart.y1 - heart.y : view.h * 0.15) * 2.6;
        box.addChild(glow);
        return box;
    }

    #decor(view, textures, layer) {
        const box = new PIXI.Container();
        for (const d of view.decor.filter(x => x.layer === layer)) {
            const tex = textures.get(mapArtUrl(d.img));
            if (!tex) continue;
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5);
            s.position.set(d.x, d.y);
            const k = d.w / tex.width;
            s.scale.set(d.flip ? -k : k, k);
            s.rotation = (d.r * Math.PI) / 180;
            s.alpha = d.o / 100;
            s.blendMode = BLENDS[d.blend] ?? PIXI.BLEND_MODES.NORMAL;
            box.addChild(s);
        }
        return box;
    }

    // the paper strip down the margin, ruled with the tiers
    #gauge(view, textures) {
        const box = new PIXI.Container();
        const strip = gaugeStrip(view);
        const shadow = new PIXI.LegacyGraphics();
        shadow.beginFill(0x000000, 0.4).drawPolygon(shifted(strip.pts, 7, 9)).endFill();
        box.addChild(shadow);
        const paper = this.#paper(view, textures, 1);
        box.addChild(texturedPoly(paper.texture, strip.pts, { tile: paper.tile }));
        const g = new PIXI.Graphics();
        sketch(g, strip.line, 3, inkAt(0.3, view.ink.text), 0.8, 'gauge');
        for (const t of strip.ticks) sketch(g, t.pts, 3 + t.depth * 2, inkAt(t.depth, view.ink.text), 0.9, `tick:${t.id}`);
        box.addChild(g);
        const left = view.gauge.x - view.gauge.w / 2 + 10;
        for (const t of strip.ticks) {
            const ink = cssColor(inkAt(t.depth, view.ink.text));
            const label = text(t.label, { fontFamily: FONT_DISPLAY, fontSize: 28, fill: ink, align: 'left' });
            label.position.set(left, t.y + 6);
            label.rotation = ((t.depth - 0.3) * 3 * Math.PI) / 180;
            box.addChild(label);
            if (t.sub) {
                // written down the strip, under its tick
                const sub = text(t.sub, {
                    fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 22, fill: ink, align: 'left',
                    wordWrap: true, wordWrapWidth: Math.max(120, t.y1 - t.y - 80),
                });
                sub.rotation = Math.PI / 2;
                sub.position.set(view.gauge.x + view.gauge.w * 0.42, t.y + 46);
                box.addChild(sub);
            }
        }
        return box;
    }

    #links(view) {
        const box = new PIXI.Container();
        const g = new PIXI.Graphics();
        box.addChild(g);
        for (const l of view.links) {
            const pts = l.points;
            if (pts.length < 4) continue;
            const ghost = l.look === 'ghost';
            const alpha = ghost ? 0.35 : 1;
            const dashed = ghost || l.look === 'rumoured';
            const color = l.look === 'crossed' ? SPENT : view.ink[l.kind] ?? view.ink.path;
            const width = l.kind === 'delve' ? 5 : l.kind === 'rail' ? 6 : 4;
            const draw = (p, w, c, a, seed) => {
                if (dashed) {
                    g.lineStyle({ width: w, color: c, alpha: a, cap: 'round', join: 'round' });
                    for (const s of dashes(p, 22, 16)) polyline(g, s);
                } else sketch(g, p, w, c, a, seed);
            };
            // its shadow on the board, then the line
            draw(shifted(pts, 5, 7), width, 0x000000, alpha * 0.35, `${l.id}:shadow`);
            draw(pts, width, color, alpha, l.id);
            if (l.kind === 'rail') {
                g.lineStyle({ width: 3, color, alpha: alpha * 0.85, cap: 'round' });
                for (const t of railTies(pts, 26, 11, l.id)) polyline(g, t);
            }
            // a delve's name and resistance at its middle, on a torn tag
            if (l.kind === 'delve' && l.delve && !ghost && l.look !== 'rumoured') {
                const mid = pointAlong(pts, pathLength(pts) / 2);
                const label = l.max ? `${l.delveName ?? ''}  ${Math.max(0, l.resistance)} / ${l.max}` : (l.delveName ?? '');
                const t = text(label, { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 26, fill: cssColor(view.ink.text) });
                t.anchor.set(0.5);
                t.position.set(mid.x, mid.y);
                const tag = tornRect(mid.x, mid.y, t.width + 24, t.height + 8, 0, { seed: `tag:${l.id}`, jag: 2.5, step: 8 });
                const back = new PIXI.LegacyGraphics();
                back.beginFill(0x000000, 0.35).drawPolygon(shifted(tag, 3, 4)).endFill();
                back.beginFill(l.look === 'crossed' ? 0xb8ad9c : 0xe2d6bb, 1).drawPolygon(tag).endFill();
                box.addChild(back, t);
            }
        }
        return box;
    }

    #scrap(n, view, textures) {
        const box = new PIXI.Container();
        const ghost = n.look === 'ghost';
        const rumoured = n.look === 'rumoured';
        const ink = inkAt(n.depth, view.ink.text);
        const scrap = n.scrap;

        // the shadow it casts on the board, then the paper
        if (!ghost) {
            const shadow = new PIXI.LegacyGraphics();
            shadow.beginFill(0x000000, 0.45).drawPolygon(shifted(scrap.pts, 7, 10)).endFill();
            box.addChild(shadow);
        }
        const paper = this.#paper(view, textures, scrap.paper);
        box.addChild(texturedPoly(paper.texture, scrap.pts, { tile: paper.tile, alpha: ghost ? 0.25 : 1 }));
        const edge = new PIXI.Graphics();
        if (ghost) {
            edge.lineStyle({ width: 3, color: 0xd6c6a4, alpha: 0.6, cap: 'round' });
            for (const s of dashes(closed(scrap.pts), 18, 14)) polyline(edge, s);
        } else {
            // a faint darker edge where the paper tore
            edge.lineStyle({ width: 2, color: 0x6b5a45, alpha: 0.35, join: 'round' });
            polyline(edge, closed(scrap.pts));
        }
        box.addChild(edge);

        if (rumoured) {
            const g = new PIXI.LegacyGraphics();
            for (const part of inkBlot(n)) g.beginFill(ink, 0.8).drawPolygon(part.pts).endFill();
            box.addChild(g);
        } else {
            const circle = blob(n.x, n.y, n.radius, { seed: `node:${n.key}`, rough: roughAt(n.depth) });
            const tex = n.art?.src ? textures.get(n.art.src) : null;
            if (tex) {
                const b = artBox(n, Number(n.art.ar) || tex.width / tex.height);
                box.addChild(texturedPoly(tex, circle, { box: b, alpha: ghost ? 0.3 : 1 }));
            } else if (!ghost) {
                // no art: the landmark's initial, faint, in the ring
                const initial = String(n.name ?? '?').replace(/^the\s+/i, '').charAt(0).toUpperCase();
                const t = text(initial, { fontFamily: FONT_DISPLAY, fontSize: n.radius * 1.1, fill: cssColor(ink) });
                t.anchor.set(0.5);
                t.alpha = 0.3;
                t.position.set(n.x, n.y);
                box.addChild(t);
            }
            const ring = new PIXI.Graphics();
            if (ghost) {
                ring.lineStyle({ width: 3, color: 0xd6c6a4, alpha: 0.5, cap: 'round' });
                for (const s of dashes(closed(circle), 18, 14)) polyline(ring, s);
            } else {
                sketch(ring, closed(circle), 5 + n.depth * 3, ink, 0.95, `ring:${n.key}`);
            }
            box.addChild(ring);
        }

        // the name, inked on the scrap
        const p = n.place;
        const label = text(p.lines.join('\n'), {
            fontFamily: rumoured || ghost ? FONT_BODY : FONT_DISPLAY,
            fontStyle: rumoured || ghost ? 'italic' : 'normal',
            fontSize: p.size,
            lineHeight: p.lineHeight,
            fill: ghost ? '#d6c6a4' : cssColor(ink),
        });
        label.anchor.set(0.5, 0);
        label.position.set(p.x, p.y);
        label.rotation = p.rot + scrap.rot * 0.6;
        label.alpha = ghost ? 0.7 : rumoured ? 0.9 : 1;
        box.addChild(label);

        if (!ghost) box.addChild(this.#fixture(scrap.fix, scrap.paper));
        return box;
    }

    // what holds a scrap on: a pin's head, or a strip of tape
    #fixture(fix, seed) {
        const g = new PIXI.LegacyGraphics();
        if (fix.kind === 'pin') {
            const head = [0x8f1d18, 0xb08d3c, 0x2b2b2b][seed % 3];
            g.beginFill(0x000000, 0.45).drawCircle(fix.x + 4, fix.y + 6, fix.r).endFill();
            g.beginFill(head).drawCircle(fix.x, fix.y, fix.r).endFill();
            g.beginFill(0xffffff, 0.45).drawCircle(fix.x - fix.r * 0.35, fix.y - fix.r * 0.35, fix.r * 0.3).endFill();
        } else {
            const tape = tornRect(fix.x, fix.y, fix.w, fix.h, fix.rot, { seed: `tape:${seed}`, jag: 2, step: 10 });
            g.beginFill(0xe8dcb8, 0.55).drawPolygon(tape).endFill();
        }
        return g;
    }
}
