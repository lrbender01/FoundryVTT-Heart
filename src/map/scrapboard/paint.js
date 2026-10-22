// The Heart map's painter (2026-10-02; the map's story is in the monorepo's
// HEART.md and this fork's CHANGELOG): draws a look and a board view (model.js) with canvas 2D. The one drawing
// code both editors run: the Heart Map Board mock (docs/mocks/heart-map/,
// the primary editor and the source of truth for how the map looks) inlines
// it into its page; the system's map scene paints it into tiles (render.js)
// shown as PIXI sprites under the tokens. Change how the map looks
// here, then rebuild the mock (node build.mjs there).
//
// What differs between the two comes in through `env`:
//   img(id)     a loaded image for a texture or art id, or null (not yet)
//   piece(id)   its metadata: { w, h, group, thick (strings), ... } or null
//   measure(text, px, font)  a text width in px
//   pxs()       bitmap px per board px (for shadows and blurs)
// Call set({ look, view, geo }) before drawing.
import {
    hashSeed, rng, pickFrom, markMax, cssColor, mixColor, inkAt, handLine, clipArtBox, stringPoints, pointAlong, pathLength,
    pinScale, pinUpright, brushColor, nearestOnPath, sheetOutline, foldLines, foldCrossings, ledgerRules, sheetPanels, pxPerInch, printOf,
} from './model.js';

// The sheet's geometry for a look (`tone(id)`, `safe(id)`: a paper's mean
// colour and solid region, from the texture set's metadata)
export function sheetGeometry(look, tone = () => null, safe = () => null) {
    return { outline: sheetOutline(look), folds: foldLines(look), crossings: foldCrossings(look), ledger: ledgerRules(look), panels: sheetPanels(look, tone, safe) };
}

// A pin's picture for a picker (Luke, 2026-10-06: the cards should size to
// the pins themselves): stood upright as the board stands it, cut to what is
// drawn of it, and fitted to a px square. A canvas.
export function pinThumb(im, tex, px = 64) {
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const out = document.createElement("canvas"); out.width = out.height = px;
  if (!iw || !ih) return out;
  const D = Math.ceil(Math.hypot(iw, ih)), c = document.createElement("canvas"); c.width = c.height = D;
  const x = c.getContext("2d");
  x.translate(D / 2, D / 2); x.rotate(pinUpright(tex)); x.drawImage(im, -iw / 2, -ih / 2); x.setTransform(1, 0, 0, 1, 0, 0);
  let x0 = 0, y0 = 0, x1 = D, y1 = D;
  try {
    const p = x.getImageData(0, 0, D, D).data;
    x0 = D; y0 = D; x1 = 0; y1 = 0;
    for (let y = 0; y < D; y++) for (let i = 0; i < D; i++) if (p[(y * D + i) * 4 + 3] > 40) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = D; y1 = D; }
  } catch { /* (a tainted image: the whole of it) */ }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = (px * 0.86) / Math.max(w, h);
  out.getContext("2d").drawImage(c, x0, y0, w, h, (px - w * k) / 2, (px - h * k) / 2, w * k, h * k);
  return out;
}

// A run of numbers (a stroke's or a string's points) as a short string that
// changes when any of them does (Luke, 2026-10-21: every change hashed or
// stringified every point of every stroke): two 32-bit hashes of each
// number's own bits, kept per array (a laid-out stroke's points never change
// in place). `round`: to a tenth first, as the renderer's piece signatures
// compare numbers.
const pointHashes = new WeakMap();
const hashWord = new Float64Array(1);
const hashHalves = new Uint32Array(hashWord.buffer);
export function pointsHash(pts, { round = false } = {}) {
  let memo = pointHashes.get(pts);
  if (!memo || memo.n !== pts.length) pointHashes.set(pts, (memo = { n: pts.length }));
  const slot = round ? "r" : "e";
  if (memo[slot] !== undefined) return memo[slot];
  let a = 0x811c9dc5 ^ pts.length, b = 0x9e3779b9 ^ pts.length;
  for (let i = 0; i < pts.length; i++) {
    hashWord[0] = round ? Math.round(pts[i] * 10) : +pts[i];
    const lo = hashHalves[0], hi = hashHalves[1];
    a = Math.imul(a ^ lo, 0x01000193); a = Math.imul(a ^ hi, 0x01000193);
    b = Math.imul(b ^ hi, 0x85ebca6b); b ^= b >>> 13; b = Math.imul(b ^ lo, 0xc2b2ae35); b ^= b >>> 16;
  }
  return (memo[slot] = `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`);
}

// The brush's painted layers, kept (Luke, 2026-10-21): pieces of a stroke's
// layer (a canvas and the part of the layer it holds, i0..i1 x j0..j1 in the
// layer's own px), found by the stroke's key and any piece that covers the
// part asked for, the most recently used kept within `budget` bytes. A piece
// larger than a quarter of the budget is used once and not kept.
export class StrokeLayerCache {
  constructor(budget) {
    this.budget = budget;
    this.bytes = 0;
    this.pieces = new Map();
    this.byStroke = new Map();
  }

  get(key, i0, j0, i1, j1) {
    for (const id of this.byStroke.get(key) ?? []) {
      const p = this.pieces.get(id);
      if (p.i0 <= i0 && p.j0 <= j0 && p.i1 >= i1 && p.j1 >= j1) {
        this.pieces.delete(id);
        this.pieces.set(id, p);
        return p;
      }
    }
    return null;
  }

  put(key, p) {
    const bytes = (p.i1 - p.i0) * (p.j1 - p.j0) * 4;
    if (bytes > this.budget / 4) return p;
    const id = `${key}#${p.i0},${p.j0},${p.i1},${p.j1}`;
    // (the stroke's smaller pieces inside this one are no use now)
    for (const other of this.byStroke.get(key) ?? []) {
      const q = this.pieces.get(other);
      if (q.i0 >= p.i0 && q.j0 >= p.j0 && q.i1 <= p.i1 && q.j1 <= p.j1) this.#drop(other);
    }
    Object.assign(p, { key, bytes });
    this.pieces.set(id, p);
    let ids = this.byStroke.get(key);
    if (!ids) this.byStroke.set(key, (ids = new Set()));
    ids.add(id);
    this.bytes += bytes;
    for (const old of this.pieces.keys()) {
      if (this.bytes <= this.budget) break;
      if (old !== id) this.#drop(old);
    }
    return p;
  }

  #drop(id) {
    const p = this.pieces.get(id);
    if (!p) return;
    this.pieces.delete(id);
    this.bytes -= p.bytes;
    const ids = this.byStroke.get(p.key);
    ids?.delete(id);
    if (ids && !ids.size) this.byStroke.delete(p.key);
  }

  clear() {
    this.pieces.clear();
    this.byStroke.clear();
    this.bytes = 0;
  }
}

// Images that came (a host's ids) against what was drawn short of them while
// it watched (painter watch / unwatch: [{ id, box }], box in board px, null
// where it may be anywhere): the parts to paint again (`whole` when one of
// them could be anywhere; more than eight parts become the one box round
// them, as a change of strokes does) and the uses still waiting
export function arrivalAreas(uses, arrived) {
  const rest = [], areas = [];
  let whole = false;
  for (const u of uses ?? []) {
    if (!arrived.has(u.id)) rest.push(u);
    else if (!u.box) whole = true;
    else areas.push(u.box);
  }
  if (whole) return { whole, areas: [], rest };
  if (areas.length <= 8) return { whole, areas, rest };
  return { whole, areas: [areas.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }))], rest };
}

// A part of the board (board px) cut into bands `rows` bitmap px tall at
// `scale`, top to bottom: a tile's sheet painted a band at a time (Luke,
// 2026-10-21: a tile froze the page for seconds)
export function sheetBands(R, scale, rows = 256) {
  const out = [], step = rows / scale;
  for (let y = R.y0; y < R.y1; y += step) out.push({ x0: R.x0, y0: y, x1: R.x1, y1: Math.min(R.y1, y + step) });
  return out;
}

export function createPainter(env) {
let look = null, view = null, geo = null;
let missing = false;
const piece = (id) => env.piece(id);
// (an image the host has only a small preview of yet counts as missing: what
// it is drawn into is done again when the whole one comes)
// While a host watches (watch / unwatch), each image drawn short is noted
// with where it lies (`where()`: a box in board px, or null for anywhere), so
// only those parts are painted again when it comes (Luke, 2026-10-21: every
// image that came repainted whole tiles of the sheet)
let watching = null;
const img = (id, where = null) => {
  const im = env.img(id);
  if ((!im || im.preview) && id) {
    missing = true;
    if (watching) watching.push({ id, box: where ? where() : null });
  }
  return im;
};
// a box round a point (board px)
const around = (x, y, rad) => ({ x0: x - rad, y0: y - rad, x1: x + rad, y1: y + rad });
// where a texture drawn w wide (h tall, or at its own shape) about a point
// reaches, turned any way (null when its shape isn't known)
const reachOf = (id, x, y, w, h = null, extra = 0) => {
  const meta = piece(id);
  const hh = h ?? (meta?.w && meta?.h ? (w * meta.h) / meta.w : null);
  return hh === null || !Number.isFinite(hh) ? null : around(x, y, Math.hypot(w, hh) / 2 + extra + 4);
};
const measure = (text, px, font) => env.measure(text, px, font);
const rgba = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const line = (g, pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); };
const shrink = (pts, cx, cy, k) => pts.map((v, i) => (i % 2 ? cy + (v - cy) * k : cx + (v - cx) * k));
// board px to bitmap px: the viewer's (env.pxs), or the bake's scale while baking
let BAKING = 0;
const pxs = () => (BAKING || env.pxs());
const BLEND = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", lighten: "lighten" };
// a grade as a canvas filter (PIXI: a ColorMatrixFilter with the same three steps)
const gradeFilter = (g) => (g ? `saturate(${g.sat}%) sepia(${g.sepia}%) brightness(${g.bright}%)` : "none");

// A graded copy of an image (a canvas, kept per image and filter): drawing
// through a canvas filter every frame is slow, so each grade is made once.
// Where canvas filters don't exist (older Safari) the grade is done by hand
// on the pixels, so the colours still match. `cap`: the copy's longest side
// at most (it is drawn small anyway).
const HAS_FILTER = typeof document.createElement("canvas").getContext("2d").filter === "string";
const gradedCache = new WeakMap();
function graded(im, filter, cap = 1400) {
  if (!im || !filter || filter === "none") return im;
  let per = gradedCache.get(im);
  if (!per) gradedCache.set(im, (per = new Map()));
  const key = `${filter}|${Math.round(cap / 64)}`;
  const have = per.get(key);
  if (have) return have;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const k = Math.min(1, cap / Math.max(iw, ih));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
  c.naturalWidth = c.width; c.naturalHeight = c.height;
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
  if (HAS_FILTER) { x.filter = filter; x.drawImage(im, 0, 0, c.width, c.height); }
  else { x.drawImage(im, 0, 0, c.width, c.height); gradeByHand(x, c.width, c.height, filter); }
  per.set(key, c);
  return c;
}
// saturate(), sepia(), and brightness() as the filter spec defines them,
// one pixel at a time
function gradeByHand(x, w, h, filter) {
  let d;
  try { d = x.getImageData(0, 0, w, h); } catch { return; }
  const ops = [...filter.matchAll(/(saturate|sepia|brightness)\(([\d.]+)(%?)\)/g)].map((m) => [m[1], Number(m[2]) / (m[3] ? 100 : 1)]);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], gg = px[i + 1], b = px[i + 2];
    for (const [op, v] of ops) {
      if (op === "saturate") [r, gg, b] = [(0.213 + 0.787 * v) * r + (0.715 - 0.715 * v) * gg + (0.072 - 0.072 * v) * b, (0.213 - 0.213 * v) * r + (0.715 + 0.285 * v) * gg + (0.072 - 0.072 * v) * b, (0.213 - 0.213 * v) * r + (0.715 - 0.715 * v) * gg + (0.072 + 0.928 * v) * b];
      else if (op === "sepia") { const a = 1 - Math.min(1, v); [r, gg, b] = [(0.393 + 0.607 * a) * r + (0.769 - 0.769 * a) * gg + (0.189 - 0.189 * a) * b, (0.349 - 0.349 * a) * r + (0.686 + 0.314 * a) * gg + (0.168 - 0.168 * a) * b, (0.272 - 0.272 * a) * r + (0.534 - 0.534 * a) * gg + (0.131 + 0.869 * a) * b]; }
      else { r *= v; gg *= v; b *= v; }
    }
    px[i] = r; px[i + 1] = gg; px[i + 2] = b;
  }
  x.putImageData(d, 0, 0);
}

// The pins' view (board px) while they are drawn: one out of it is passed over
let pinView = null;
// A small sprite with its shadow, turned and baked once (a shadow blurred
// every frame, for every pin, is slow): kept per texture, size, and turn
const shadowed = new Map();
function shadowedSprite(im, id, w, hh, rot, flip, flipY, shadow, filter) {
  // (id carries a pin's tint)
  const q = cacheQ();
  const key = `${id}|${filter}|${Math.round(w * 4)}|${Math.round(hh * 4)}|${Math.round(rot * 200)}|${flip}|${flipY}|${shadow}|${q}`;
  let e = shadowed.get(key);
  if (e) return e;
  const half = Math.hypot(w, hh) / 2 + shadow * 2.2;
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(1, Math.ceil(half * 2 * q));
  const x = c.getContext("2d");
  x.shadowColor = "rgba(0,0,0,0.6)"; x.shadowBlur = shadow * q; x.shadowOffsetX = shadow * 0.45 * q; x.shadowOffsetY = shadow * 0.7 * q;
  x.setTransform(q, 0, 0, q, half * q, half * q);
  x.rotate(rot); x.scale(flip ? -1 : 1, flipY ? -1 : 1);
  x.imageSmoothingQuality = "high";
  x.drawImage(im, -w / 2, -hh / 2, w, hh);
  e = { canvas: c, half };
  shadowed.set(key, e);
  if (shadowed.size > 800) shadowed.delete(shadowed.keys().next().value);
  return e;
}
// a sprite: the texture centred at cx, cy, w wide, turned rot (radians)
function sprite(g, id, cx, cy, w, rot, { alpha = 1, flip = false, flipY = false, shadow = 0, blend = "source-over", h = null, filter = "none", tint = null } = {}) {
  if (pinView && (cx < pinView.x0 || cx > pinView.x1 || cy < pinView.y0 || cy > pinView.y1)) return;
  const raw = img(id, () => reachOf(id, cx, cy, w, h, shadow * 2.2)); if (!raw) return;
  // (a pin in its string's colour)
  const im0 = tint === null || tint === undefined ? raw : tintedPin(raw, tint);
  if (shadow && blend === "source-over" && !BAKING && w * pxs() < 400) {
    const im = graded(im0, filter, Math.max(256, w * 2 * pxs()));
    const hh = h ?? w * ((im0.naturalHeight || im0.height) / (im0.naturalWidth || im0.width));
    // (a preview's sprite is not the whole image's: Luke, 2026-10-21, a pin
    // first drawn from its preview stayed blurred once the whole one came)
    const e = shadowedSprite(im, `${tint === null || tint === undefined ? id : `${id}#${tint}`}${raw.preview ? "~preview" : ""}`, w, hh, rot, flip, flipY, shadow, filter);
    g.save(); g.globalAlpha = alpha; g.imageSmoothingQuality = "high";
    g.drawImage(e.canvas, cx - e.half, cy - e.half, e.half * 2, e.half * 2);
    g.restore();
    return;
  }
  const im = graded(im0, filter, Math.max(256, w * 2 * pxs()));
  const ww = w, hh = h ?? w * ((im0.naturalHeight || im0.height) / (im0.naturalWidth || im0.width));
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = blend;
  if (shadow) { g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = shadow * pxs(); g.shadowOffsetX = shadow * 0.45 * pxs(); g.shadowOffsetY = shadow * 0.7 * pxs(); }
  g.translate(cx, cy); g.rotate(rot); g.scale(flip ? -1 : 1, flipY ? -1 : 1);
  g.drawImage(im, -ww / 2, -hh / 2, ww, hh);
  g.restore();
}

// A pin's drawing in a colour (Luke, 2026-10-06): its light and shade kept,
// its hue the colour's (the string's own); made once
const pinTints = new Map();
function tintedPin(im, color) {
  const key = `${im.src ?? ""}#${color}`;
  if (pinTints.has(key)) return pinTints.get(key);
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(im, 0, 0);
  let d;
  try { d = x.getImageData(0, 0, w, h); } catch { pinTints.set(key, im); return im; }
  const px = d.data, cr = (color >> 16) & 255, cg = (color >> 8) & 255, cb = color & 255;
  let top = 1;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 60) top = Math.max(top, 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]);
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / top;
    // (the colour in its mid tones, its ink outlines staying dark, a glint lighter)
    const k = Math.pow(l, 0.85) * 1.2, hi = Math.max(0, l - 0.82) * 1.1;
    px[i] = Math.min(255, cr * k + 255 * hi); px[i + 1] = Math.min(255, cg * k + 255 * hi); px[i + 2] = Math.min(255, cb * k + 255 * hi);
  }
  x.putImageData(d, 0, 0);
  c.naturalWidth = w; c.naturalHeight = h; c.src = key;
  pinTints.set(key, c);
  return c;
}

// (a line's glyphs laid out once: the writing is painted every frame now)
const handCache = new WeakMap();
function hand(g, ln, color, alpha, depth) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.textBaseline = "middle";
  g.font = `${ln.style ? `${ln.style} ` : ""}${ln.size}px "${ln.font ?? look.fonts.hands[0]}"`;
  let hl = handCache.get(ln);
  if (!hl || hl.depth !== depth || hl.font !== g.font) {
    hl = { ...handLine(ln.text, (ch) => g.measureText(ch).width, depth, ln.seed), depth, font: g.font };
    handCache.set(ln, hl);
  }
  // (aligned left or right: from that edge of what was measured, so the
  // hand's own spacing never pushes it past its box)
  const half = (ln.w ?? hl.width) / 2;
  g.translate(ln.x, ln.y); g.rotate(ln.rot); g.translate(ln.align === "left" ? -half : ln.align === "right" ? half - hl.width : -hl.width / 2, 0);
  for (const gl of hl.glyphs) { g.save(); g.translate(gl.x, gl.y); g.rotate(gl.rot); g.fillText(gl.ch, 0, 0); g.restore(); }
  // underlined, struck through: a pen line along it, a little unsteady
  // (the face's own letter heights, about the middle baseline: a strike
  // through the middle of its small letters, or its capitals when it has
  // none; an underline just under where its letters sit)
  const met = (ch) => { const m = g.measureText(ch); return { a: m.actualBoundingBoxAscent || ln.size * 0.3, d: m.actualBoundingBoxDescent || ln.size * 0.2 }; };
  const xm = met("x"), cap = met("H");
  const lower = /[a-z]/.test(ln.text);
  const strikeY = lower ? (xm.d - xm.a) / 2 : (cap.d - cap.a) / 2;
  const underY = cap.d + ln.size * 0.12;
  for (const [on, y] of [[ln.underline, underY], [ln.strike, strikeY]]) {
    if (!on) continue;
    const r = rng(`rule:${ln.seed}:${y}`), w = hl.width;
    g.strokeStyle = color; g.lineCap = "round"; g.lineWidth = ln.size * (ln.style?.includes("bold") ? 0.085 : 0.06);
    g.beginPath(); g.moveTo(-w * 0.02, y + (r() - 0.5) * ln.size * 0.06);
    g.quadraticCurveTo(w * (0.35 + r() * 0.3), y + (r() - 0.5) * ln.size * 0.12, w * 1.02, y + (r() - 0.5) * ln.size * 0.08);
    g.stroke();
  }
  g.restore();
}

// an image stretched to cover a box, flipped as asked, its spare overhang
// used to shift which part shows (dx, dy in 0..1)
// (src: the part of the image to use, as fractions x0, y0, x1, y1)
function cover(g, im, x, y, w, h, { flipX = false, flipY = false, dx = 0.5, dy = 0.5, extra = 1, src = null } = {}) {
  const [a, b, c, d] = src ?? [0, 0, 1, 1];
  const sx = a * im.naturalWidth, sy = b * im.naturalHeight, sw = (c - a) * im.naturalWidth, sh = (d - b) * im.naturalHeight;
  const k = Math.max(w / sw, h / sh) * extra;
  const iw = sw * k, ih = sh * k;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.translate(x + w / 2, y + h / 2); g.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  g.drawImage(im, sx, sy, sw, sh, -w / 2 - (iw - w) * dx, -h / 2 - (ih - h) * dy, iw, ih);
  g.restore();
}
function tiled(g, id, tile, x, y, w, h, { alpha = 1, blend = "source-over" } = {}) {
  const im = img(id, () => ({ x0: x - 2, y0: y - 2, x1: x + w + 2, y1: y + h + 2 })); if (!im) return;
  const pat = g.createPattern(im, "repeat"); const k = tile / im.naturalWidth;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = blend; g.fillStyle = pat; g.fillRect(x, y, w, h); g.restore();
}

// The party's ledger: one enormous folded sheet of dark, torn, scratched
// paper, spread out on a table by the fire. In panels mode every fold panel
// is its own whole paper, so nothing repeats.
// the table under the sheet, and the fire's light on it (drawn every frame)
function drawTable(g) {
  const W = look.w, H = look.h;
  g.fillStyle = "#0b0705"; g.fillRect(-3000, -3000, W + 6000, H + 6000);
  fireLight(g, 1, "source-over");
}
// The sheet as it stands: its paper, the marker worked into it, and the
// grime, folds, and wear over both (Luke, 2026-10-03: the marker under the
// filth, not drawn on top of it). `area` (board px): only what lies in it is
// painted, for a part of the bake redone (the caller clips to it).
function drawSheet(g, area = null) {
  const W = look.w, H = look.h, S = look.sheet, out = geo.outline;
  // a fill over the whole sheet, kept to the area (and a margin for a blur's
  // reach, so the area's edge shows nothing)
  const fill = (m = 0) => {
    if (!area) { g.fillRect(0, 0, W, H); return; }
    const x0 = Math.max(0, area.x0 - m), y0 = Math.max(0, area.y0 - m), x1 = Math.min(W, area.x1 + m), y1 = Math.min(H, area.y1 + m);
    if (x1 > x0 && y1 > y0) g.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  const near = (x, y, rad) => !area || (x + rad >= area.x0 && x - rad <= area.x1 && y + rad >= area.y0 && y - rad <= area.y1);
  g.save(); g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowBlur = 16 * pxs(); g.shadowOffsetY = 6 * pxs();
  g.fillStyle = "#3a2a20"; poly(g, out); g.fill(); g.restore();
  g.save(); poly(g, out); g.clip();
  if (S.mode === "panels") {
    for (const p of geo.panels) {
      const im = img(p.tex, () => ({ x0: p.x - 3, y0: p.y - 3, x1: p.x + p.w + 3, y1: p.y + p.h + 3 })); if (!im) continue;
      // the paper zoomed past its own border, its tone evened toward the
      // sheet's (PIXI: one ColorMatrixFilter scaling r, g, b by p.gain; here a
      // brightness lift to the largest gain, then a multiply by the rest)
      const k = Math.max(...p.gain), lift = p.gain.map((v) => Math.round(255 * v / k));
      g.save();
      cover(g, graded(im, `${gradeFilter(look.grade.panel)} brightness(${k})`, 1600), p.x - 1, p.y - 1, p.w + 2, p.h + 2, { flipX: p.flipX, flipY: p.flipY, extra: p.zoom, dx: p.dx, dy: p.dy, src: p.src });
      g.restore();
      g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = `rgb(${lift.join(",")})`; g.fillRect(p.x, p.y, p.w, p.h); g.restore();
      if (p.shade) { g.fillStyle = p.shade > 0 ? `rgba(0,0,0,${p.shade})` : `rgba(255,240,220,${-p.shade * 0.6})`; g.fillRect(p.x, p.y, p.w, p.h); }
    }
  } else tiled(g, S.paper, S.tile, 0, 0, W, H);
  g.globalCompositeOperation = "multiply"; g.fillStyle = cssColor(mixColor(0xffffff, S.tint, S.darken / 100)); fill();
  g.globalCompositeOperation = "source-over";
  // the ledger's printed rules, under the folds (PIXI: Graphics lines, multiplied)
  g.save(); g.globalCompositeOperation = "multiply"; g.lineCap = "round";
  for (const r of geo.ledger) { g.globalAlpha = r.o; g.strokeStyle = cssColor(r.color); g.lineWidth = r.w; line(g, r.pts); g.stroke(); }
  g.restore();
  // pages pasted on it (the look's decorations of the 'page' layer), each
  // lifted a little (Luke, 2026-10-03: a collage of scraps)
  drawPages(g, area);
  // the marker and the writing on the sheet, on the paper, under everything
  // that has happened to it since (Luke, 2026-10-03)
  // (the bright strokes' layers held for their light pass below)
  const hold = new Map();
  drawInk(g, area, { hold });
  drawSheetWriting(g, area);
  // the grime runs across the whole sheet, over the folds, at about its own
  // resolution: tiled mirrored (no seams), each layer turned and shifted by
  // its seed so the repeats don't line up (PIXI: a TilingSprite of the
  // mirrored texture, with tileTransform, alpha, blend mode, and a BlurFilter)
  S.scratches.forEach((sc, i) => {
    const im = img(sc.tex); if (!im) return;
    const r = rng(`overlay:${i}:${sc.tex}`);
    const pat = g.createPattern(mirrorTile(im), "repeat"); const k = sc.tile / im.naturalWidth;
    const ox = r() * sc.tile * 2, oy = r() * sc.tile * 2, turn = r() * 360;
    pat.setTransform(new DOMMatrix().translate(ox, oy).rotate(sc.angle ?? turn).scale(k));
    g.save(); g.globalAlpha = sc.o / 100; g.globalCompositeOperation = BLEND[sc.blend];
    if (sc.blur) g.filter = `blur(${sc.blur * pxs()}px)`;
    g.fillStyle = pat; fill(sc.blur ? sc.blur * 3 + 4 : 0); g.restore();
  });
  sheetGrime(g, near);
  sheetDamp(g, near);
  drawFolds(g);
  const wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, `rgba(8,3,2,${look.wash.top / 100})`); wash.addColorStop(1, `rgba(8,3,2,${look.wash.bottom / 100})`);
  g.fillStyle = wash; fill();
  // (a bright stroke laid over its grime a little too: Luke 2026-10-06, the
  // players' paint dulled and see-through under it)
  drawInk(g, area, { over: true, hold });
  if (look.glow) {
    g.save(); g.translate(W / 2, H * 0.92); g.scale(W * 0.8, H * 0.22);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    rg.addColorStop(0, `rgba(150,18,12,${0.5 * look.glow / 100})`); rg.addColorStop(1, "rgba(120,10,8,0)");
    g.globalCompositeOperation = "multiply"; g.fillStyle = rg; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  if (S.edge.burn) {
    g.strokeStyle = "rgba(14,7,4,0.9)"; g.lineWidth = S.edge.burn; g.lineJoin = "round";
    g.shadowColor = "rgba(14,7,4,1)"; g.shadowBlur = S.edge.burn * 0.6 * pxs(); poly(g, out); g.stroke();
  }
  g.restore();
  // the edge itself: a dark line with a pale lip, like the fold seams (Luke,
  // 2026-10-03: a second save here, never restored, kept the first repaint's
  // clip on the canvas; marker strokes drawn later showed only inside it)
  g.save(); g.lineJoin = "round"; g.strokeStyle = "rgba(8,4,2,0.6)"; g.lineWidth = 3; poly(g, out); g.stroke();
  g.strokeStyle = "rgba(230,205,170,0.18)"; g.lineWidth = 6; poly(g, shrink(out, look.w / 2, look.h / 2, 0.996)); g.stroke(); g.restore();
}

// Bloody prints on the sheet (Luke, 2026-10-06), at their own size (a
// hand about 7.5 inches, a foot about 11; the board's inches: model.js
// pxPerInch) and placed as hands and feet would leave them: hands by the
// sheet's edges, as if it was held, fingers in; a trail of footprints
// walking down toward the Heart; a fingertip smear or two by an edge
function sheetPrints(g, near) {
  const B = look.grime.blood / 100;
  const prints = (look.pools.stains ?? []).filter((id) => printOf(id));
  if (!B || !prints.length) return;
  const W = look.w, H = look.h, ppi = pxPerInch(look), r = rng("sheet:prints");
  const of = (kind) => prints.filter((id) => printOf(id).kind === kind);
  const put = (id, x, y, rot, a) => {
    const P = printOf(id);
    // (the texture drawn so its one print is its own length)
    const w = (P.inches * ppi) / P.frac;
    // (its colour drawn whether or not it is in the part being painted: the
    // draws stay the same for every part)
    const col = BLOOD[Math.floor(r() * BLOOD.length)];
    if (near(x, y, w * 0.6)) stain(g, id, x, y, w, rot, a, col, { crisp: true });
  };
  // hands at the edges, mostly the lower half, fingers pointing in
  const hands = [...of("hand"), ...of("fingers")];
  for (let i = 0, n = Math.round(4 * B); i < n && hands.length; i++) {
    const side = r() < 0.5 ? -1 : 1, y = H * (0.35 + 0.6 * r());
    const x = side < 0 ? W * (0.02 + r() * 0.05) : W * (0.93 + r() * 0.05);
    // (an image's fingers point up: turned so they point across the sheet)
    put(pickFrom(hands, `hand:${i}`), x, y, -side * Math.PI / 2 + (r() - 0.5) * 0.7, 0.35 + r() * 0.25);
  }
  // a trail of footprints walking down (the images' toes point up)
  const trails = of("trail"), feet = of("foot");
  for (let i = 0, n = Math.max(trails.length || feet.length ? 1 : 0, Math.round(2 * B)); i < n; i++) {
    const x = W * (0.2 + 0.6 * r()), y = H * (0.6 + 0.3 * r()), rot = Math.PI + (r() - 0.5) * 0.6;
    if (trails.length && r() < 0.7) put(pickFrom(trails, `trail:${i}`), x, y, rot, 0.3 + r() * 0.2);
    else if (feet.length) {
      // (two or three steps, one after another down the sheet)
      const steps = 2 + Math.floor(r() * 2), stride = 26 * ppi;
      // (each step on along the way it faces, left and right of its line)
      const fx = Math.sin(rot), fy = -Math.cos(rot), sx = Math.cos(rot), sy = Math.sin(rot);
      for (let s = 0; s < steps; s++) { const side = (s % 2 ? 1 : -1) * 4 * ppi; put(pickFrom(feet, `foot:${i}:${s}`), x + fx * stride * s + sx * side, y + fy * stride * s + sy * side, rot, 0.3 + r() * 0.2); }
    }
  }
}

// Damp (Luke, 2026-10-06, the raggedness mock's D): tide stains in from the
// sheet's edges with a darker tide line, a few water rings, and freckles of
// foxing; over the paper and the pages, under the folds
function sheetDamp(g, near) {
  const s = (look.grime.damp ?? 0) / 100;
  if (!s) return;
  const W = look.w, H = look.h, r = rng("sheet:damp"), m = look.sheet.edge.margin ?? 10;
  g.save(); g.globalCompositeOperation = "multiply";
  const sides = [
    { ax: "y", at: m, a: m, b: W - m, out: -1 }, { ax: "x", at: W - m, a: m, b: H - m, out: 1 },
    { ax: "y", at: H - m, a: m, b: W - m, out: 1 }, { ax: "x", at: m, a: m, b: H - m, out: -1 },
  ];
  for (const E of sides) {
    for (let i = 0, n = Math.round(1.6 * s * (E.b - E.a) / 1300); i < n; i++) {
      const len = 260 + r() * 420, t0 = E.a + r() * Math.max(1, E.b - E.a - len), depth = (50 + r() * 110) * Math.min(1.4, s * 1.4), ph = r() * 6.28;
      const pts = [E.ax === "x" ? [E.at, t0] : [t0, E.at]];
      for (let t = 0; t <= len; t += 8) {
        const k = Math.sin((t / len) * Math.PI), d = depth * Math.pow(k, 0.6) * (0.75 + 0.25 * Math.sin(t * 0.04 + ph) + 0.1 * Math.sin(t * 0.17));
        pts.push(E.ax === "x" ? [E.at - E.out * d, t0 + t] : [t0 + t, E.at - E.out * d]);
      }
      pts.push(E.ax === "x" ? [E.at, t0 + len] : [t0 + len, E.at]);
      const mx = pts.reduce((v, p) => v + p[0], 0) / pts.length, my = pts.reduce((v, p) => v + p[1], 0) / pts.length;
      if (!near(mx, my, len)) continue;
      g.fillStyle = `rgba(110,78,48,${0.2 * Math.min(1.4, s * 1.4)})`; g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      g.strokeStyle = `rgba(80,48,24,${0.45 * Math.min(1.4, s * 1.4)})`; g.lineWidth = 2.4; g.lineJoin = "round";
      g.beginPath(); pts.slice(1, -1).forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }
  }
  // water rings (a glass, a lamp set down)
  for (let i = 0, n = Math.round(14 * s); i < n; i++) {
    const x = W * (0.06 + r() * 0.88), y = H * (0.06 + r() * 0.88), rad = 38 + r() * 60, gap = r() < 0.6 ? r() * 2 : 0, lw = 2 + r() * 1.5;
    if (!near(x, y, rad + 4)) continue;
    g.strokeStyle = `rgba(90,58,30,${0.4 * Math.min(1.3, s * 1.3)})`; g.lineWidth = lw;
    g.beginPath();
    for (let a = gap; a <= Math.PI * 2; a += 0.05) { const k = 1 + 0.03 * Math.sin(a * 5 + x); const px = x + Math.cos(a) * rad * k, py = y + Math.sin(a) * rad * k; a === gap ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.stroke();
    g.fillStyle = `rgba(130,96,60,${0.06 * s})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  // foxing: freckles of rust-brown in clusters
  for (let i = 0, n = Math.round(56 * s); i < n; i++) {
    const cx = r() * W, cy = r() * H, k = 6 + Math.floor(r() * 22), spread = 30 + r() * 70;
    const far = !near(cx, cy, spread * 1.5);
    for (let j = 0; j < k; j++) {
      const x = cx + (r() - 0.5) * spread * 2, y = cy + (r() - 0.5) * spread * 2, rad = 1.2 + r() * r() * 7, a = 0.3 + r() * 0.35;
      if (far) continue;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(125,70,30,${a})`); rg.addColorStop(1, "rgba(125,70,30,0)");
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  g.restore();
}

// The sheet's own wear (baked with it): soot, blood thickening toward the
// Heart, gunpowder specks, tape mending the folds, and stitching along some
// (Luke, 2026-10-02: "stitched together and scrapped and barely working")
function sheetGrime(g, near = () => true) {
  const A = look.grime.sheet / 100, B = look.grime.blood / 100;
  if (!A && !B && !look.grime.stitches && !look.grime.mends) return;
  const W = look.w, H = look.h, r = rng("sheet:grime");
  g.save();
  // soot: broad dark smudges
  g.globalCompositeOperation = "multiply";
  for (let i = 0, n = Math.round(26 * A); i < n; i++) {
    const x = r() * W, y = r() * H, rad = 220 + r() * 820, a0 = 0.18 + r() * 0.3 * A;
    if (!near(x, y, rad)) continue;
    const sg = g.createRadialGradient(x, y, 0, x, y, rad);
    sg.addColorStop(0, `rgba(30,18,12,${a0})`); sg.addColorStop(0.6, `rgba(30,18,12,${0.08 * A})`); sg.addColorStop(1, "rgba(30,18,12,0)");
    g.fillStyle = sg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
  // stains: soot and blood, the blood gathering toward the Heart below
  // (the prints apart: their own size, placed with care)
  const pool = (look.pools.stains ?? []).filter((id) => !printOf(id));
  if (pool.length) {
    for (let i = 0, n = Math.round(18 * A); i < n; i++) {
      const x = r() * W, y = r() * H, w = 120 + r() * 360, rot = r() * 6.3, a = 0.18 + r() * 0.25;
      if (near(x, y, w * 1.6)) stain(g, pickFrom(pool, `sheet:soot:${i}`), x, y, w, rot, a, SOOT);
    }
    // (Luke, 2026-10-06: much more of it, larger toward the Heart)
    // (Luke, 2026-10-06: none blown up past what its texture holds: more of
    // them, none huge)
    for (let i = 0, n = Math.round(44 * B); i < n; i++) {
      const y = H * (0.15 + 0.85 * Math.sqrt(r()));
      const x = r() * W, w = 90 + r() * 300 * (0.5 + y / H), rot = r() * 6.3, a = 0.3 + r() * 0.4;
      if (near(x, y, w * 1.6)) stain(g, pickFrom(pool, `sheet:blood:${i}`), x, y, w, rot, a, BLOOD[i % BLOOD.length]);
    }
  }
  sheetPrints(g, near);
  // gunpowder
  g.save(); g.fillStyle = "rgba(14,9,7,0.8)";
  for (let i = 0, n = Math.round(2600 * A); i < n; i++) {
    const a = 0.3 + r() * 0.6, x = r() * W, y = r() * H, rad = 0.5 + r() * r() * 2.4;
    if (!near(x, y, rad)) continue;
    g.globalAlpha = a; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
  }
  g.restore();
  // tape mending the folds, across them
  const tapes = look.pools.tapes ?? [];
  if (tapes.length) for (let i = 0, n = Math.round(10 * (look.grime.mends ?? 0) / 100); i < n; i++) {
    const f = geo.folds[Math.floor(r() * geo.folds.length)]; if (!f) break;
    const k = Math.floor(r() * (f.pts.length / 2 - 2)) * 2;
    const x = f.pts[k], y = f.pts[k + 1];
    sprite(g, pickFrom(tapes, `sheet:mend:${i}`), x, y, 110 + r() * 90, (f.along === "y" ? 0 : Math.PI / 2) + (r() - 0.5) * 0.6, { alpha: 0.8, filter: gradeFilter(jitterGrade(look.grade.paper, `mend:${i}`)) });
  }
  // stitches: a stretch of fold sewn shut, thread whipped across it, each
  // stitch its own length and slant, the needle holes dark
  g.save(); g.lineCap = "round";
  const sr = rng("sheet:stitches");
  for (let i = 0, n = Math.round(14 * (look.grime.stitches ?? 0) / 100); i < n; i++) {
    const f = geo.folds[Math.floor(sr() * geo.folds.length)]; if (!f) break;
    const len = 220 + sr() * 520, total = pathLength(f.pts), from = sr() * Math.max(1, total - len);
    stitchRun(g, f.pts, from, len, sr);
  }
  g.restore();
}
// A stretch of seam along a line: thread whipped across it, each stitch its
// own length and slant, the needle holes dark (the folds' and the pages')
function stitchRun(g, pts, from, len, r) {
  const slant = 0.35 + r() * 0.3;
  for (let d = from; d < from + len; d += 13 + r() * 9) {
    const p = pointAlong(pts, d), q = pointAlong(pts, d + 1);
    const ang = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
    const half = 6 + r() * 4, sl = half * slant;
    const ax = p.x - nx * half - tx * sl, ay = p.y - ny * half - ty * sl, bx = p.x + nx * half + tx * sl, by = p.y + ny * half + ty * sl;
    g.strokeStyle = "rgba(24,14,10,0.8)"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = "rgba(170,140,105,0.28)"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(ax + nx * 0.6, ay + ny * 0.6); g.lineTo(bx - nx * 0.6, by - ny * 0.6); g.stroke();
    g.fillStyle = "rgba(10,6,4,0.85)";
    for (const [hx, hy] of [[ax, ay], [bx, by]]) { g.beginPath(); g.arc(hx, hy, 1.4, 0, 6.3); g.fill(); }
  }
}

function drawFolds(g) {
  const o = look.sheet.folds.o / 100; if (!o) return;
  const off = (f, d) => f.pts.map((v, i) => (f.along === "y" ? (i % 2 ? v : v + d) : (i % 2 ? v + d : v)));
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  for (const f of geo.folds) {
    for (const [w, a, d] of [[60, 0.07, 14], [30, 0.1, 8], [12, 0.14, 4]]) { g.strokeStyle = `rgba(10,5,2,${a * o})`; g.lineWidth = w; line(g, off(f, d)); g.stroke(); }
    g.strokeStyle = `rgba(8,4,2,${0.55 * o})`; g.lineWidth = 3; line(g, f.pts); g.stroke();
    g.strokeStyle = `rgba(230,205,170,${0.13 * o})`; g.lineWidth = 12; line(g, off(f, -8)); g.stroke();
  }
  // where the folds cross, the paper is rubbed pale (and worn through a
  // little at the edge)
  const wear = look.sheet.folds.wear / 100;
  if (wear) for (const c of geo.crossings) {
    const rr = rng(`wear:${c.x}:${c.y}`), rad = (c.edge ? 70 : 120) * (0.8 + rr() * 0.4);
    g.save(); g.translate(c.x, c.y); g.rotate(rr() * Math.PI); g.scale(1, 0.55 + rr() * 0.3);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, rad);
    rg.addColorStop(0, `rgba(238,220,190,${0.3 * wear})`); rg.addColorStop(0.5, `rgba(230,210,180,${0.12 * wear})`); rg.addColorStop(1, "rgba(230,210,180,0)");
    g.globalCompositeOperation = "screen"; g.fillStyle = rg; g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.restore();
  }
  g.restore();
}

// a texture with its mirror images beside and below it: tiles with no seams
// (weak: an image let go, a new detail's, takes its mirror with it)
const mirrors = new WeakMap();
function mirrorTile(im) {
  if (mirrors.has(im)) return mirrors.get(im);
  const w = im.naturalWidth, h = im.naturalHeight, c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2;
  const x = c.getContext("2d");
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { x.save(); x.translate(sx < 0 ? w * 2 : 0, sy < 0 ? h * 2 : 0); x.scale(sx, sy); x.drawImage(im, 0, 0); x.restore(); }
  mirrors.set(im, c); return c;
}

function fireLight(g, k, blend) {
  if (!look.fire) return;
  const W = look.w, H = look.h;
  g.save(); g.globalCompositeOperation = blend; g.translate(W / 2, H + 380); g.scale(W * 1.05, H * 0.95);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  rg.addColorStop(0, `rgba(255,150,70,${0.55 * k * look.fire / 100})`); rg.addColorStop(0.45, `rgba(220,110,50,${0.22 * k * look.fire / 100})`); rg.addColorStop(1, "rgba(200,90,40,0)");
  g.fillStyle = rg; g.fillRect(-1, -1, 2, 2); g.restore();
}

function drawLight(g) {
  const W = look.w, H = look.h;
  if (look.vignette) {
    g.save(); g.translate(W / 2, H / 2); g.scale(W * 0.75, H * 0.75);
    const vg = g.createRadialGradient(0, 0, 0.45, 0, 0, 1);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${0.8 * look.vignette / 100})`);
    g.fillStyle = vg; g.fillRect(-1.5, -1.5, 3, 3); g.restore();
  }
  fireLight(g, 0.55, "screen");
}

function drawDecor(g, list, layer = null) {
  for (const d of list.filter((x) => !layer || x.layer === layer)) {
    // (art as itself: Luke, 2026-10-03)
    const fx = piece(d.tex)?.group === "art" ? null : d.fx ?? null;
    sprite(g, d.tex, d.x, d.y, d.w, d.r * Math.PI / 180, { alpha: d.o / 100, flip: d.flip, blend: BLEND[d.blend], shadow: layer === "over" && d.blend === "normal" ? 8 : 0, filter: gradeFilter(fx) });
  }
}

// A colour's silhouette of an image (a stain recoloured: blood, soot), kept
const tints = new WeakMap();
// (Luke, 2026-10-03: never flat: each of a few variants pooled darker in
// places, thinned in others, and smudged off to one side)
function tinted(im, color, variant = 0, cap = 600) {
  let per = tints.get(im);
  if (!per) tints.set(im, (per = new Map()));
  const key = `${color}|${variant}|${cap}`;
  if (per.has(key)) return per.get(key);
  const c = document.createElement("canvas");
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const k = Math.min(1, cap / Math.max(iw, ih));
  c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k));
  const x = c.getContext("2d");
  x.drawImage(im, 0, 0, c.width, c.height);
  x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  const r = rng(`stain:${variant}:${color}:${c.width}`), W = c.width, H = c.height, M = Math.max(W, H);
  const blot = (op, rgba, n, size) => {
    x.globalCompositeOperation = op;
    for (let i = 0; i < n; i++) {
      const px = r() * W, py = r() * H, rad = M * (size[0] + r() * size[1]);
      const gr = x.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, rgba(0.35 + r() * 0.5)); gr.addColorStop(1, rgba(0));
      x.fillStyle = gr; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  };
  // pooled darker
  blot("source-atop", (a) => `rgba(12,4,2,${a * 0.75})`, 3 + Math.floor(r() * 4), [0.08, 0.22]);
  // thinned, dried paler
  blot("destination-out", (a) => `rgba(0,0,0,${a * 0.8})`, 3 + Math.floor(r() * 4), [0.06, 0.2]);
  // smudged: dragged off to one side, fading
  const ang = r() * Math.PI * 2, len = M * (0.04 + r() * 0.08);
  const copy = document.createElement("canvas"); copy.width = W; copy.height = H; copy.getContext("2d").drawImage(c, 0, 0);
  x.globalCompositeOperation = "destination-over";
  for (let k = 1; k <= 5; k++) { x.globalAlpha = 0.22 * (1 - k / 6); x.drawImage(copy, Math.cos(ang) * len * k / 5, Math.sin(ang) * len * k / 5); }
  x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  per.set(key, c);
  return c;
}

// A small texture drawn large, crisp (Luke, 2026-10-06: the blood prints
// soft at their own size; the sources are small): enlarged smoothly, then its
// edge sharpened (its alpha through a narrow ramp), so a print reads clean
// without an upscaler's artifacts. Kept per image and size.
const crisps = new WeakMap();
function crispen(im, px) {
  const cap = Math.min(768, Math.max(256, Math.round(px / 128) * 128));
  let per = crisps.get(im);
  if (!per) crisps.set(im, (per = new Map()));
  if (per.has(cap)) return per.get(cap);
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const k = cap / Math.max(iw, ih);
  if (k <= 1.05) { per.set(cap, im); return im; }
  const c = document.createElement("canvas");
  c.width = Math.round(iw * k); c.height = Math.round(ih * k);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, 0, 0, c.width, c.height);
  try {
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 3; i < p.length; i += 4) { const a = Math.max(0, Math.min(1, (p[i] / 255 - 0.3) / 0.32)); p[i] = Math.round(255 * a * a * (3 - 2 * a)); }
    x.putImageData(d, 0, 0);
  } catch { /* (a tainted image: smooth only) */ }
  c.naturalWidth = c.width; c.naturalHeight = c.height;
  per.set(cap, c);
  return c;
}
// A stain at a point: a splatter from the look's stains, tinted (blood,
// soot) or as drawn, multiplied in
function stain(g, tex, x, y, w, rot, alpha, color = null, { crisp = false } = {}) {
  const im0 = img(tex, () => reachOf(tex, x, y, w)); if (!im0) return;
  // (a blood stain drawn far past its own size is sharpened too: Luke
  // 2026-10-06, the big splats soft; two looks of each, to keep memory low)
  const iw0 = Math.max(im0.naturalWidth || im0.width, im0.naturalHeight || im0.height);
  const sharp = crisp || (color && color !== SOOT && w * pxs() > iw0 * 1.15);
  const im = sharp ? crispen(im0, w * pxs()) : im0;
  const src = color ? tinted(im, color, hashSeed(`${tex}:${Math.round(x)}:${Math.round(y)}`) % (sharp ? 2 : 5), sharp ? 768 : 600) : im;
  const h = w * ((im.naturalHeight || im.height) / (im.naturalWidth || im.width));
  g.save(); g.globalCompositeOperation = "multiply"; g.globalAlpha = alpha;
  g.translate(x, y); g.rotate(rot); g.drawImage(src, -w / 2, -h / 2, w, h); g.restore();
}

const BLOOD = ["#5c0a07", "#6e1209", "#4a0605"];
const SOOT = "#1c130e";

// The grime on one scrap, in its paper's frame (origin at the paper's
// middle, x along it): a shift of tone, darkened edges, soot, stains (some of
// them blood, more the deeper it sits), and gunpowder specks; dirtier the
// deeper it is. Clipped afterwards to what is already drawn (the paper, its
// clipping, the writing).
function scrapGrime(g, s, W, H) {
  const G = look.grime.scraps / 100;
  if (!G) return;
  const depth = s.layout.depth;
  const amt = G * (0.85 + 0.9 * depth);
  const sk = s.layout.seedKey ?? s.key;
  const r = rng(`grime:${sk}`);
  g.save();
  // a shift of tone: some papers darker, warmer, or greyer than others
  g.globalCompositeOperation = "multiply";
  const tone = [[120, 92, 64], [104, 96, 86], [126, 84, 58], [96, 84, 70]][Math.floor(r() * 4)];
  g.fillStyle = `rgba(${tone.join(",")},${(0.16 + r() * 0.3) * Math.min(1.3, amt)})`; g.fillRect(-W, -H, W * 2, H * 2);
  // the edges darkened with handling
  const ox = (r() - 0.5) * W * 0.3, oy = (r() - 0.5) * H * 0.3;
  const eg = g.createRadialGradient(ox, oy, Math.min(W, H) * 0.25, ox, oy, Math.max(W, H) * 0.78);
  eg.addColorStop(0, "rgba(60,40,24,0)"); eg.addColorStop(0.55, `rgba(50,32,20,${Math.min(0.3, 0.2 * amt)})`); eg.addColorStop(1, `rgba(34,20,12,${Math.min(0.85, 0.75 * amt)})`);
  g.fillStyle = eg; g.fillRect(-W, -H, W * 2, H * 2);
  // soot: dark smudges, mostly toward the edges
  const soots = 1 + Math.floor(r() * 4 * amt);
  for (let i = 0; i < soots; i++) {
    const a = r() * Math.PI * 2, d = 0.25 + r() * 0.3;
    const x = Math.cos(a) * W * d, y = Math.sin(a) * H * d, rad = Math.min(W, H) * (0.12 + r() * 0.25);
    const sg = g.createRadialGradient(x, y, 0, x, y, rad);
    sg.addColorStop(0, `rgba(26,16,10,${0.45 * Math.min(1.3, amt)})`); sg.addColorStop(1, "rgba(26,16,10,0)");
    g.fillStyle = sg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
  // stains: splatters, rings, fingerprints; blood more often the deeper
  // (never a hand or footprint: Luke 2026-10-06, they are the sheet's)
  const pool = (look.pools.stains ?? []).filter((id) => !printOf(id));
  const n = pool.length ? Math.floor(0.6 + r() * (1.4 + 3 * amt)) : 0;
  const bloodChance = (look.grime.blood / 100) * (0.25 + depth);
  for (let i = 0; i < n; i++) {
    const tex = pickFrom(pool, `${sk}:stain:${i}`);
    const blood = r() < bloodChance;
    const color = blood ? BLOOD[Math.floor(r() * BLOOD.length)] : r() < 0.4 ? SOOT : null;
    stain(g, tex, (r() - 0.5) * W * 0.9, (r() - 0.5) * H * 0.9, W * (0.18 + r() * 0.42), r() * Math.PI * 2, (blood ? 0.35 : 0.2) + r() * 0.3 * Math.min(1, amt), color);
  }
  // gunpowder: fine dark specks
  const specks = Math.floor(110 * amt * (0.4 + r()));
  g.save(); g.fillStyle = "rgba(18,12,9,0.75)";
  for (let i = 0; i < specks; i++) {
    const x = (r() - 0.5) * W, y = (r() - 0.5) * H, rad = 0.35 + r() * r() * 1.6;
    g.globalAlpha = 0.35 + r() * 0.6; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
  }
  g.restore();
}

// One scrap's paper, clipping, blot, and grime, painted once into a canvas
// in its paper's frame and reused while nothing about it changes, so a
// repaint only places it. `q`: its bitmap px per board px (stepped, so
// zooming in the mock makes few copies). Its writing is not in it: that is
// painted every frame, as type, so it is sharp at any zoom on any screen
// (Luke, 2026-10-02: the writing fuzzy zoomed in, in Chrome and Foundry).
// The cache keeps to a memory budget, larger on a device with more memory.
const scrapCache = new Map();
let lookStamp = "";
const cacheQ = () => Math.min(4, Math.max(0.5, 2 ** Math.ceil(Math.log2(Math.max(0.01, pxs())))));
const CACHE_BYTES = Math.min(384, Math.max(96, (globalThis.navigator?.deviceMemory ?? 8) * 32)) * 2 ** 20;
const cacheBytes = (E) => E.canvas.width * E.canvas.height * 4 * (E.lit ? 2 : 1);
function keepScrap(key, E) {
  scrapCache.set(key, E);
  let total = 0;
  for (const e of scrapCache.values()) total += cacheBytes(e);
  for (const [k, e] of scrapCache) {
    if (total <= CACHE_BYTES || scrapCache.size <= 1) break;
    total -= cacheBytes(e); scrapCache.delete(k);
  }
}
function scrapImage(s) {
  const L = s.layout, P = L.paper, q = cacheQ();
  const key = JSON.stringify([s.key, s.seed, s.ink, s.paint, s.bright, s.pturn, s.marks, s.parts, s.drop, s.type, s.lib, s.uuid, s.name, s.text, s.art, s.s, s.paper, s.fix, s.hand, s.state, s.look, Math.round(P.w), Math.round(L.depth * 20), q, lookStamp, s.lib ? look.library[s.lib]?.clip : null, s.lib ? look.library[s.lib]?.name : null]);
  const have = scrapCache.get(key);
  // (most recently used last)
  if (have) { scrapCache.delete(key); scrapCache.set(key, have); return have; }
  // (room for its shadow)
  const pad = Math.max(P.w, P.h) * 0.2 + 32;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil((P.w + pad * 2) * q)); c.height = Math.max(1, Math.ceil((P.h + pad * 2) * q));
  const g = c.getContext("2d");
  const before = missing, wasBaking = BAKING;
  missing = false; BAKING = q;
  try {
    // world coordinates, mapped into the paper's frame
    g.setTransform(q, 0, 0, q, (P.w / 2 + pad) * q, (P.h / 2 + pad) * q);
    g.rotate(-P.rot); g.translate(-P.cx, -P.cy);
    // (its bright strokes' layers held for their light pass over the grime)
    const hold = new Map();
    scrapFace(g, s, hold);
    // the grime, clipped to what is drawn
    const mask = document.createElement("canvas"); mask.width = c.width; mask.height = c.height;
    mask.getContext("2d").drawImage(c, 0, 0);
    g.setTransform(q, 0, 0, q, (P.w / 2 + pad) * q, (P.h / 2 + pad) * q);
    scrapGrime(g, s, P.w, P.h);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-in"; g.drawImage(mask, 0, 0); g.globalCompositeOperation = "source-over";
    g.setTransform(q, 0, 0, q, (P.w / 2 + pad) * q, (P.h / 2 + pad) * q);
    g.rotate(-P.rot); g.translate(-P.cx, -P.cy);
    const bright = (L.strokes ?? []).filter((st) => st.b === 2);
    if (bright.length) {
      g.save();
      if (L.clip) {
        g.beginPath(); g.rect(-1e6, -1e6, 2e6, 2e6);
        const C = L.clip.pts; g.moveTo(C[0], C[1]); for (let i = 2; i < C.length; i += 2) g.lineTo(C[i], C[i + 1]); g.closePath();
        g.clip("evenodd");
      }
      for (const st of bright) brush(g, { ...st, w: Math.min(st.w, markMax(look)) }, look.ink.marker[st.c] ?? look.ink.marker[0] ?? 0xa39a86, `cmark:${s.key}:${st.id}`, { atop: true, over: true, hold });
      g.restore();
    }
    clipArt(g, s);
  } finally { BAKING = wasBaking; }
  const E = { canvas: c, pad, q, lit: null, complete: !missing };
  missing = before || missing;
  if (E.complete) keepScrap(key, E);
  return E;
}

// The scrap's bitmap with its drop shadow, made once for its turn: a shadow
// blurred every frame is among the slowest things a canvas does. (The
// shadow falls the same way on the board however the paper is turned.)
function litScrap(E, rot) {
  if (E.lit && E.lit.rot === rot) return E.lit.canvas;
  const c = E.canvas, q = E.q;
  const out = document.createElement("canvas");
  out.width = c.width; out.height = c.height;
  const x = out.getContext("2d");
  const ox = 18 * 0.45 * q, oy = 18 * 0.7 * q, cs = Math.cos(-rot), sn = Math.sin(-rot);
  x.shadowColor = "rgba(0,0,0,0.6)"; x.shadowBlur = 18 * q;
  x.shadowOffsetX = ox * cs - oy * sn; x.shadowOffsetY = ox * sn + oy * cs;
  x.drawImage(c, 0, 0);
  E.lit = { rot, canvas: out };
  return out;
}

// A grade nudged by a seed (each scrap's paper a little off the next), in
// steps of 5 so the graded copies stay few
function jitterGrade(gr, seed, k = 1) {
  if (!gr) return gr;
  const r = rng(`grade:${seed}`), q = (v) => Math.round(v / 5) * 5;
  return { sat: q(gr.sat + (r() - 0.5) * 40 * k), sepia: q(Math.max(0, gr.sepia + (r() - 0.5) * 36 * k)), bright: q(gr.bright - r() * 16 * k) };
}

// What a scrap shows on itself (in world coordinates): its paper, the
// clipping, a rumour's blot, and the writing
// a card's extra pieces of one layer (model.js cardExtras): under its paper,
// on it (only where there is paper), or over it
function extras(g, s, layer) {
  for (const e of s.layout.extras ?? []) {
    if (e.layer !== layer) continue;
    sprite(g, e.tex, e.cx, e.cy, e.w, e.rot, { h: e.h ?? null, flip: Boolean(e.flip), alpha: e.alpha ?? 1, blend: layer === "on" ? "source-atop" : "source-over", filter: e.grade ? gradeFilter(jitterGrade(look.grade.paper, `${s.layout.seedKey ?? s.key}:${e.tex}`, 1)) : "none" });
  }
}
// a clipping's torn paper rim round its art, either side (board px; Luke,
// 2026-10-03: the jagged rim kept, but thin)
const CLIP_RIM = 4;
function scrapFace(g, s, hold = null) {
  const L = s.layout, P = L.paper;
  const ink = cssColor(inkAt(L.depth, L.ink ?? look.ink.text));
  const G = look.grime.scraps / 100;
  extras(g, s, "under");
  // (its paper turned a quarter at a time and mirrored as its layout says:
  // the texture drawn turned, its own width along the card's height)
  const odd = (P.turn ?? 0) % 2 === 1;
  if (P.tex) sprite(g, P.tex, P.cx, P.cy, odd ? P.h : P.w, P.rot + (P.turn ?? 0) * Math.PI / 2, { h: odd ? P.w : P.h, flip: Boolean(P.flip), filter: gradeFilter(jitterGrade(look.grade.paper, s.layout.seedKey ?? s.key, G)) });
  else { g.save(); g.fillStyle = "#dccfb3"; poly(g, L.hull); g.fill(); g.restore(); }
  extras(g, s, "on");
  // the marker on it, only on its paper, under its grime (Luke, 2026-10-03)
  if (L.strokes?.length) {
    g.save(); g.globalCompositeOperation = "source-atop";
    for (const st of L.strokes) brush(g, { ...st, w: Math.min(st.w, markMax(look)) }, look.ink.marker[st.c] ?? look.ink.marker[0] ?? 0xa39a86, `cmark:${s.key}:${st.id}`, { atop: true, hold });
    g.restore();
  }
  if (L.clip) {
    const C = L.clip, B = C.box;
    g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 7 * pxs(); g.shadowOffsetY = 3 * pxs();
    g.fillStyle = "#e9dfcb"; poly(g, C.pts); g.fill(); g.restore();
    const art = img(C.art);
    const inner = shrink(C.pts, B.cx, B.cy, 1 - CLIP_RIM / Math.max(B.w, 1));
    g.save(); poly(g, inner); g.clip();
    // (the art itself goes on after the grime: clipArt)
    if (!art) {
      g.fillStyle = "#d9cdb2"; g.fill();
      g.translate(B.cx, B.cy); g.rotate(B.rot); g.fillStyle = rgba(0x6e6056, 0.5); g.font = `${B.h * 0.5}px Mosherif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(s.name || look.library[s.lib]?.name || "?").replace(/^the\s+/i, "").charAt(0).toUpperCase(), 0, 0);
    }
    g.restore();
  }
  if (L.blot) { g.save(); g.globalAlpha = 0.85; g.fillStyle = ink; for (const p of L.blot) { poly(g, p); g.fill(); } g.restore(); }
  extras(g, s, "over");
}

// The clipping's art, as it is (Luke, 2026-10-03: the art in the photos is
// always just the art, however graded and grimed the rest is): no grade, no
// grain, no grime; laid on last
function clipArt(g, s) {
  const C = s.layout.clip;
  if (!C) return;
  const art = img(C.art);
  if (!art) return;
  const B = C.box;
  const inner = shrink(C.pts, B.cx, B.cy, 1 - CLIP_RIM / Math.max(B.w, 1));
  const ab = clipArtBox({ w: B.w - CLIP_RIM, h: B.h - CLIP_RIM }, (art.naturalWidth || art.width) / (art.naturalHeight || art.height), C.frame);
  g.save(); poly(g, inner); g.clip();
  g.translate(B.cx, B.cy); g.rotate(B.rot); g.imageSmoothingQuality = "high";
  g.drawImage(art, ab.x, ab.y, ab.w, ab.h);
  g.restore();
}

function drawScrap(g, s) {
  const L = s.layout, ghost = s.look === "ghost", a = ghost ? 0.32 : 1;
  if (L.bare) {
    // (its writing is the sheet's: drawSheet; a hidden one's outline here)
    if (ghost) { g.save(); g.strokeStyle = "#e2d4ba"; g.globalAlpha = 0.5; g.lineWidth = 3; g.setLineDash([14, 10]); poly(g, L.hull); g.stroke(); g.restore(); }
    return;
  }
  const P = L.paper, E = scrapImage(s);
  g.save(); g.globalAlpha = a; g.imageSmoothingQuality = "high";
  g.translate(P.cx, P.cy); g.rotate(P.rot);
  g.drawImage(ghost ? E.canvas : litScrap(E, P.rot), -(P.w / 2 + E.pad), -(P.h / 2 + E.pad), P.w + E.pad * 2, P.h + E.pad * 2);
  g.restore();
  // the writing, soaked into the paper (multiplied: its grime shows through)
  const ink = cssColor(inkAt(L.depth, L.ink ?? look.ink.text));
  g.save(); g.globalCompositeOperation = "multiply";
  for (const ln of L.lines) hand(g, ln, ink, a, L.depth);
  g.restore();
  for (const t of L.tapes ?? []) sprite(g, t.tex, t.cx, t.cy, t.w, t.rot, { alpha: a * 0.92, filter: gradeFilter(look.grade.paper) });
  if (ghost) { g.save(); g.strokeStyle = "#e2d4ba"; g.globalAlpha = 0.7; g.lineWidth = 3; g.setLineDash([14, 10]); poly(g, L.hull); g.stroke(); g.restore(); }
}

// A rope texture scaled down once, smoothly, to the drawn thickness (x2 for
// zooming in), so a narrow string doesn't sparkle (PIXI: the texture's
// mipmaps do this)
const ropeCache = new Map();
function ropeTex(im, H) {
  const key = `${im.src}|${H}`;
  if (ropeCache.has(key)) return ropeCache.get(key);
  let src = im, w = im.naturalWidth, h = im.naturalHeight;
  const th = Math.max(4, Math.ceil(H * 2));
  while (h / 2 >= th) { // halve step by step: a clean box filter
    const c = document.createElement("canvas"); c.width = Math.round(w / 2); c.height = Math.round(h / 2);
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * th / h)); c.height = th;
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
  ropeCache.set(key, c); return c;
}

// A rope drawing in another colour (Luke, 2026-10-03: any string in any
// colour): its light and shade kept, its hue the colour's; made once
const ropeTints = new Map();
function tintedRope(im, color) {
  const key = `${im.src}#${color}`;
  if (ropeTints.has(key)) return ropeTints.get(key);
  const w = im.naturalWidth, h = im.naturalHeight;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(im, 0, 0);
  let d;
  try { d = x.getImageData(0, 0, w, h); } catch { ropeTints.set(key, im); return im; }
  const px = d.data, cr = (color >> 16) & 255, cg = (color >> 8) & 255, cb = color & 255;
  let top = 1;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 40) top = Math.max(top, 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]);
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / top;
    // (the colour at the twist's middle tones, lighter at its highlights)
    const k = l * 1.25, hi = Math.max(0, l - 0.8) * 0.9;
    px[i] = Math.min(255, cr * k + 255 * hi); px[i + 1] = Math.min(255, cg * k + 255 * hi); px[i + 2] = Math.min(255, cb * k + 255 * hi);
  }
  x.putImageData(d, 0, 0);
  c.naturalWidth = w; c.naturalHeight = h; c.src = key;
  ropeTints.set(key, c);
  return c;
}
// A string: the straight middle of one of Luke's string drawings, a seamless
// strip repeated along the curve from pin to pin (from a point along it set
// by the string's seed, so neighbours don't repeat in step), scaled so its
// string is `thick` board px wide (PIXI: a SimpleRope with a repeating
// texture). Translucent strings are drawn whole into a layer and faded
// together, so the segments' overlaps don't bead.
function drawRope(g, pts, texId, thick, alpha, seed = "", color = null) {
  if (alpha < 1) {
    const L = layerCanvas(g); const lg = L.getContext("2d");
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, L.width, L.height); lg.setTransform(g.getTransform());
    drawRope(lg, pts, texId, thick, 1, seed, color);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(L, 0, 0); g.restore();
    return;
  }
  const im00 = img(texId), meta = piece(texId);
  if (!im00) { g.save(); g.strokeStyle = color === null ? "#8a1d16" : cssColor(color); g.lineWidth = thick; line(g, pts); g.stroke(); g.restore(); return; }
  const im0 = color === null ? im00 : tintedRope(im00, color);
  const H = thick * im0.naturalHeight / (meta?.thick || im0.naturalHeight / 2.2);
  const im = ropeTex(im0, H);
  const k = im.height / H, tl = im.width / k;
  g.save(); g.imageSmoothingQuality = "high";
  let s = (hashSeed(seed || texId) % 1000) / 1000 * tl;
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2], y0 = pts[i - 1], len = Math.hypot(pts[i] - x0, pts[i + 1] - y0); if (!len) continue;
    g.save(); g.translate(x0, y0); g.rotate(Math.atan2(pts[i + 1] - y0, pts[i] - x0));
    let done = 0;
    while (done < len - 0.01) {
      const u = (s + done) % tl, take = Math.min(len - done, tl - u);
      g.drawImage(im, u * k, 0, Math.max(1, take * k), im.height, done, -H / 2, take + 0.8, H);
      done += take;
    }
    g.restore(); s += len;
  }
  g.restore();
}
// which of its kind's drawings a string uses (the same one every time)
const ropeFor = (kind, seed) => {
  const R = look.ropes[kind] ?? look.ropes.path;
  const have = R.texs.filter((id) => piece(id));
  return pickFrom(have.length ? have : R.texs, seed);
};

// a scratch canvas the size of the one being drawn on, one per size (Luke,
// 2026-10-21: one per tile kept a tile's memory for every tile a faded string
// ever crossed); used and done with at once, so shared
const layers = new Map();
function layerCanvas(g) {
  const key = `${g.canvas.width}x${g.canvas.height}`;
  let L = layers.get(key);
  if (!L) {
    L = document.createElement("canvas"); L.width = g.canvas.width; L.height = g.canvas.height;
    layers.set(key, L);
    if (layers.size > 4) layers.delete(layers.keys().next().value);
  }
  return L;
}

// A string's name tag (its name only, never anything mechanical): a ticket
// stub sized to the writing, its thread tied to the string's junction pin and
// pinned through the tag itself; it sits tagDx, tagDy from the junction,
// turned tagR degrees (or by its seed). Null when the string has no name.
function tagOf(l) {
  if (!l.label || l.look === "rumoured") return null;
  const mid = l.junction ?? pointAlong(l.points, pathLength(l.points) * (l.tagAt ?? 0.5));
  const font = pickFrom(look.fonts.hands, `hand:${l.id}`) ?? look.fonts.hands[0];
  const px = Math.round(look.scrap.w * 0.13 * (look.fonts.scale[font] ?? 1));
  const text = l.label;
  const w = Math.max(px * 2.5, measure(text, px, font) + px * 1.3), h = px * 2.1;
  const tex = piece("tx/paper__strip__paper_ticket_stub_rose_strip") ? "tx/paper__strip__paper_ticket_stub_rose_strip" : look.pools.notes[0];
  const x = mid.x + (l.tagDx ?? 14), y = mid.y + (l.tagDy ?? 80);
  const rot = (l.tagR ?? (hashSeed(l.id) % 13 - 6)) * Math.PI / 180;
  // its thread ties to a pin through the end of the stub facing the junction,
  // clear of the writing
  const c = Math.cos(-rot), s = Math.sin(-rot), dx = mid.x - x, dy = mid.y - y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  const ex = l.tagPinAt ? l.tagPinAt.u * w : (lx < 0 ? -1 : 1) * (w / 2 - h * 0.3);
  const ey = l.tagPinAt ? l.tagPinAt.v * h : Math.max(-h * 0.15, Math.min(h * 0.15, ly));
  const tie = { x: x + ex * Math.cos(rot) - ey * Math.sin(rot), y: y + ex * Math.sin(rot) + ey * Math.cos(rot) };
  const fam = look.pools.ends?.[l.kind]?.length ? look.pools.ends[l.kind] : look.pools.pins;
  const ptex = pickFrom(fam, `${l.id}:tag`);
  const pin = { ...tie, tex: ptex, w: (l.ends?.[0]?.w ?? 34) * pinScale(ptex) / pinScale(l.ends?.[0]?.tex), rot: (hashSeed(`${l.id}:tag`) % 40 - 20) * Math.PI / 180 };
  const T = { mid, tie, pin, font, px, text, w, h, tex, x, y, rot };
  // lying over its junction, the junction's pin holds it: no thread, no pin
  T.over = onTag(T, mid);
  return T;
}

// whether a point lies on a tag
function onTag(T, p, pad = 0) {
  const c = Math.cos(-T.rot), s = Math.sin(-T.rot), dx = p.x - T.x, dy = p.y - T.y;
  return Math.abs(dx * c - dy * s) < T.w / 2 + pad && Math.abs(dx * s + dy * c) < T.h / 2 + pad;
}

function drawLink(g, l) {
  if (l.collapsed) return;
  const ghost = l.look === "ghost";
  // see-through only when the players can't see it (the GM's ghost)
  const alpha = ghost ? 0.35 : 1;
  // (in its own colour, or its kind's)
  const color = l.color === null || l.color === undefined ? null : look.ink.marker[l.color] ?? null;
  drawRope(g, l.points, ropeFor(l.kind, l.id), look.string.w, alpha, l.id, color);
  const T = l.look === "rumoured" ? null : tagOf(l);
  if (T) {
    sprite(g, T.tex, T.x, T.y, T.w, T.rot, { alpha, shadow: ghost ? 0 : 8, h: T.h, filter: gradeFilter(look.grade.paper) });
    const ink = cssColor(inkAt(l.depth, look.ink.text));
    hand(g, { text: T.text, font: T.font, x: T.x, y: T.y, size: T.px, rot: T.rot, seed: `tag:${l.id}` }, ink, alpha, l.depth);
    // the thread over the tag, from the junction pin to the tag's pin (none
    // when the tag lies over the junction: that pin holds it)
    if (!T.over && Math.hypot(T.tie.x - T.mid.x, T.tie.y - T.mid.y) > 6) drawRope(g, stringPoints(T.mid, T.tie, { seed: l.id + "tag", slack: (look.string.slack / 100) * ((l.slack ?? 100) / 100) * 0.6, wander: 0 }), ropeFor(l.kind, l.id + ":tag"), look.string.w, alpha, l.id + ":tag", color);
  }
}

// A pin leaning the way its string pulls: its head tips toward the string
// (part of the way, never past 40 degrees), plus a little of its own tilt
function lean(p, toward, seed) {
  const ang = Math.atan2(toward.y - p.y, toward.x - p.x);
  let d = ang + Math.PI / 2; d = Math.atan2(Math.sin(d), Math.cos(d));
  // (mostly upright: a fifth of the pull, never past 15 degrees; Luke
  // 2026-10-06, they stood too crooked)
  const own = ((hashSeed(seed) % 5) - 2) * Math.PI / 180;
  return Math.max(-0.26, Math.min(0.26, d * 0.2)) + own;
}
// The way the string itself pulls on a pin partway along it: toward the
// middle of the string a little before it and a little after (its sag)
function alongString(l, p) {
  const P = l.points, n = P.length / 2, i = nearestOnPath(P, p).i;
  const a = Math.max(0, i - 5), b = Math.min(n - 1, i + 6);
  return { x: (P[2 * a] + P[2 * b]) / 2, y: (P[2 * a + 1] + P[2 * b + 1]) / 2 + 1 };
}
// where the strings a pin holds pull it, together: the pin plus each pull's
// direction, summed (balanced pulls leave it upright)
function pulledBy(p) {
  let x = 0, y = 0;
  for (const q of p.pulls) { const d = Math.hypot(q.x - p.x, q.y - p.y) || 1; x += (q.x - p.x) / d; y += (q.y - p.y) / d; }
  if (Math.hypot(x, y) < 0.2) y += 1;
  return { x: p.x + x * 20, y: p.y + y * 20 };
}
function drawPins(g) {
  // the pins each string is tied to, each leaning along its string
  for (const l of view.links) {
    const a = l.look === "ghost" ? 0.35 : 1, P = l.points, n = P.length;
    const [pa, pb] = l.ends ?? [];
    if (pa?.tex && !pa.shared) sprite(g, pa.tex, pa.x, pa.y, pa.w, lean(pa, { x: P[Math.min(6, n - 2)], y: P[Math.min(7, n - 1)] }, l.id + "a") + pinUpright(pa.tex), { alpha: a, shadow: 6, tint: pa.tint });
    if (pb?.tex && !pb.shared) sprite(g, pb.tex, pb.x, pb.y, pb.w, lean(pb, { x: P[Math.max(0, n - 8)], y: P[Math.max(1, n - 7)] }, l.id + "b") + pinUpright(pb.tex), { alpha: a, shadow: 6, tint: pb.tint });
    // a named string's junction pin and the pins it is pulled through keep
    // to the string itself (Luke, 2026-10-02: never leaning toward a tag or
    // a note); the pin through the tag leans toward the junction
    const T = tagOf(l);
    if (T) {
      const J = l.junction;
      if (J?.tex) sprite(g, J.tex, J.x, J.y, J.w, lean(J, alongString(l, J), l.id + "j") + pinUpright(J.tex), { alpha: a, shadow: 6, tint: J.tint });
      if (!T.over && T.pin?.tex) sprite(g, T.pin.tex, T.pin.x, T.pin.y, T.pin.w, lean(T.pin, T.mid, l.id + "t") + pinUpright(T.pin.tex), { alpha: a, shadow: 6 });
    }
    for (const j of l.joints ?? []) if (j.tex && !j.shared) sprite(g, j.tex, j.x, j.y, j.w, lean(j, alongString(l, j), `${l.id}j${j.idx}`) + pinUpright(j.tex), { alpha: a, shadow: 6, tint: j.tint });
  }
  // the board's own pins (loose, or in a scrap)
  for (const p of view.pins ?? []) if (p.tex && !p.hidden) sprite(g, p.tex, p.x, p.y, p.w, (p.r === null && p.pulls?.length ? lean(p, pulledBy(p), p.id) : p.rot) + pinUpright(p.tex), { alpha: p.look === "ghost" ? 0.35 : 1, shadow: 6, tint: p.tint });
  for (const s of view.scraps) {
    if (s.layout.bare) continue;
    const al = s.look === "ghost" ? 0.35 : 1;
    // its own pin, when nothing else holds it (or the GM wants it anyway)
    if (!s.layout.pinOff && (!s.tied || s.pinShow)) {
      const p = s.layout.pin;
      if (p.tex) sprite(g, p.tex, p.x, p.y, p.w, p.rot + pinUpright(p.tex), { alpha: al, shadow: 6 });
      else { g.save(); g.fillStyle = "#8f1d18"; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill(); g.restore(); }
    }
    // pins through the clipping, and pins the GM added
    for (const p of [...(s.layout.clipPins ?? []), ...(s.layout.pins ?? [])]) if (p.tex) sprite(g, p.tex, p.x, p.y, p.w, p.rot + pinUpright(p.tex), { alpha: al, shadow: 6 });
  }
}

// The background (the look: the sheet and its decorations, the same on every
// map) and the foreground (the board: what the GM pins, writes, strings, and
// reveals). The background is baked once into an image the size of the map
// (`scale` bitmap px per board px), redone only when `key` (the look)
// changes; a bake that found a texture not loaded yet is redone next time.
// `live` draws it fresh instead (the mock, while the background is edited).
// The marker is part of the sheet (under its grime), so it is baked with it:
// a stroke drawn or rubbed out redoes only its own part of the bake.
const BAKE_PAD = 40;
// how much the sheet's grime darkens what is under it, about (a multiply:
// a preview of a stroke takes this, so it shows as dark as it will be)
// (measured 2026-10-06: a finished stroke against its preview, three paints)
const GRIME_VEIL = 0xada094;
let bake = null;
// the strokes as they are: id -> [what it is, where it reaches]
function markState() {
  const out = new Map();
  for (const [layer, strokes] of Object.entries(view?.marks ?? {})) {
    for (const [id, m] of Object.entries(strokes)) {
      // (its points' hash kept with them: Luke, 2026-10-21)
      out.set(`${layer}:${id}`, { sig: `${m.c}|${m.w}|${m.o}|${m.b}|${pointsHash(m.pts)}`, box: markBox(m) });
    }
  }
  for (const s of view?.scraps ?? []) {
    if (!s.layout?.bare) continue;
    out.set(`w:${s.key}`, { sig: JSON.stringify([s.layout.lines.map((l) => [l.text, Math.round(l.x), Math.round(l.y), l.size, l.font, Math.round(l.rot * 1000), l.style, l.underline, l.strike, l.align]), s.layout.ink, s.look]), box: writingBox(s) });
  }
  return out;
}
// the parts a change of strokes touches (a few boxes, or one round them all)
function markChanges(was, now) {
  const boxes = [];
  for (const [id, a] of was) { const b = now.get(id); if (!b || b.sig !== a.sig) boxes.push(a.box); }
  for (const [id, b] of now) { const a = was.get(id); if (!a || a.sig !== b.sig) boxes.push(b.box); }
  if (boxes.length <= 8) return boxes;
  return [boxes.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }))];
}
// the sheet and its decorations painted into a canvas mapped by (scale, ox,
// oy), only within `area` (all when null)
function paintSheet(c, scale, ox, oy, area = null) {
  const g = c.getContext("2d");
  g.save();
  g.setTransform(scale, 0, 0, scale, ox, oy);
  // (a part redone on whole bitmap px: a part edge across a px blends the old
  // painting with the new, a seam; Luke 2026-10-03, rectangles on the board)
  if (area) area = { x0: (Math.floor(area.x0 * scale + ox) - ox) / scale, y0: (Math.floor(area.y0 * scale + oy) - oy) / scale, x1: (Math.ceil(area.x1 * scale + ox) - ox) / scale, y1: (Math.ceil(area.y1 * scale + oy) - oy) / scale };
  if (area) {
    g.beginPath(); g.rect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0); g.clip();
    g.clearRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
  }
  const wasBaking = BAKING;
  BAKING = scale;
  try { drawSheet(g, area); drawDecor(g, look.decor.filter((d) => d.layer !== "page")); } finally { BAKING = wasBaking; g.restore(); }
}
function bakeBackground(key, scale = 1) {
  const marks = markState();
  const epoch = env.epoch?.() ?? null;
  if (bake?.key === key && bake.scale === scale && (bake.complete || (epoch !== null && bake.epoch === epoch))) {
    for (const b of markChanges(bake.marks, marks)) paintSheet(bake.canvas, scale, BAKE_PAD * scale, BAKE_PAD * scale, b);
    bake.marks = marks;
    return bake;
  }
  const c = bake?.canvas ?? document.createElement("canvas");
  c.width = Math.round((look.w + BAKE_PAD * 2) * scale); c.height = Math.round((look.h + BAKE_PAD * 2) * scale);
  missing = false;
  paintSheet(c, scale, BAKE_PAD * scale, BAKE_PAD * scale);
  bake = { canvas: c, key, scale, complete: !missing, marks, epoch };
  // (a patch of the old look is no use)
  if (patch && patch.key !== key) patch = null;
  return bake;
}
// A part of the sheet baked finer than the whole (Luke, 2026-10-03: the
// sheet sharp close up as well as the writing): what is in view, at up to
// `q` bitmap px per board px, drawn over the bake. The sheet's own scans hold
// about 2 px per board px, so finer than 2.5 buys nothing.
let patch = null;
const PATCH_SIDE = 4096;
// The finer patch is painted a strip at a time (a big view at once took the
// editor long enough to hang it; Luke 2026-10-03), the old one shown until the
// new one is whole. Returns the patch in use, and says whether one is coming:
// sharpenContinue(ms) paints more of it (true once it is done).
let nextPatch = null;
function sharpenBackground(key, area, q) {
  const A = { x0: Math.max(-BAKE_PAD, Math.floor(area.x0)), y0: Math.max(-BAKE_PAD, Math.floor(area.y0)), x1: Math.min(look.w + BAKE_PAD, Math.ceil(area.x1)), y1: Math.min(look.h + BAKE_PAD, Math.ceil(area.y1)) };
  const w = A.x1 - A.x0, h = A.y1 - A.y0;
  if (w < 2 || h < 2) return patch;
  const k = Math.min(q, 2.5, PATCH_SIDE / w, PATCH_SIDE / h);
  const holds = (P) => P && P.key === key && P.k >= k * 0.99 && P.A.x0 <= A.x0 && P.A.y0 <= A.y0 && P.A.x1 >= A.x1 && P.A.y1 >= A.y1;
  if (holds(patch) && patch.complete) return patch;
  if (holds(nextPatch)) return patch;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
  const step = 256 / k, bands = [];
  for (let y = A.y0; y < A.y1; y += step) bands.push({ x0: A.x0, y0: y, x1: A.x1, y1: Math.min(A.y1, y + step) });
  nextPatch = { key, A, k, canvas: c, complete: true, marks: markState(), bands };
  sharpenContinue(8);
  return patch;
}
function sharpenContinue(ms = 8) {
  const N = nextPatch;
  if (!N) return true;
  const t0 = performance.now();
  const before = missing;
  while (N.bands.length && (performance.now() - t0 < ms)) {
    missing = false;
    paintSheet(N.canvas, N.k, -N.A.x0 * N.k, -N.A.y0 * N.k, N.bands.shift());
    if (missing) N.complete = false;
  }
  missing = before;
  if (N.bands.length) return false;
  patch = N;
  nextPatch = null;
  return true;
}
function drawBackground(g, { key = "", live = false, scale = 1, sharp = true } = {}) {
  drawTable(g);
  if (live) { drawSheet(g); drawDecor(g, look.decor.filter((d) => d.layer !== "page")); return; }
  const B = bakeBackground(key, scale);
  g.drawImage(B.canvas, -BAKE_PAD, -BAKE_PAD, look.w + BAKE_PAD * 2, look.h + BAKE_PAD * 2);
  if (sharp) drawPatch(g, key, B.marks);
}
function drawPatch(g, key, marks = markState()) {
  if (!patch || patch.key !== key) return false;
  const P = patch;
  // (strokes since: their parts of the patch redone too)
  for (const b of markChanges(P.marks, marks)) if (meets(b, P.A)) paintSheet(P.canvas, P.k, -P.A.x0 * P.k, -P.A.y0 * P.k, b);
  P.marks = marks;
  g.save(); g.imageSmoothingQuality = "high";
  g.drawImage(P.canvas, P.A.x0, P.A.y0, P.A.x1 - P.A.x0, P.A.y1 - P.A.y0);
  g.restore();
  return true;
}
// The marker (Luke, 2026-10-02): everyone's strokes, each layer in its own
// order, drawn on the sheet under everything pinned to it, in the sheet's
// paints: brushed and worked into the dark paper, not a pen on it. The
// paint, then a few dry streaks of the brush along it; the sheet's grime
// over it (drawSheet).
// a stroke's extent (board px), with the reach of its streaks
const markBoxes = new WeakMap();
function markBox(m) {
  let b = markBoxes.get(m);
  if (b) return b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < m.pts.length; i += 2) { x0 = Math.min(x0, m.pts[i]); x1 = Math.max(x1, m.pts[i]); y0 = Math.min(y0, m.pts[i + 1]); y1 = Math.max(y1, m.pts[i + 1]); }
  const p = m.w * 1.4 + 4;
  b = { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p };
  markBoxes.set(m, b);
  return b;
}
const meets = (a, b) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1;
// An ink brush's stroke (Luke, 2026-10-03: no soak or shadow; an ink brush,
// not streaks, and not bold, bright, or clean at its edges): painted into a
// layer of its own, pressed down as it starts and easing off at its end, its
// edges ragged; dry where the brush ran thin (gaps along it, more at its
// edges and its end); the ink
// gathered along its middle and rims. Then soaked into the paper
// (multiplied), with a little of its colour laid back over. Its opacity (o, 0
// to 1) is its own. `atop`: only where there is already paper (a card).
// (its brightness, Luke 2026-10-06: dim as it first was, soaked into the
// paper; as it is; bright, laid on all but opaque)
const BRIGHTS = [{ soak: 0.85, lay: 0.38 }, { soak: 0.3, lay: 0.78 }, { soak: 0.06, lay: 0.98 }];
// `over`: a bright stroke's light pass over the grime
const OVER = 0.42;
// The brush's layers, kept (Luke, 2026-10-21: mission critical before live
// sessions; every paint built every stroke's layer anew, 95% of a fill): a
// stroke's layer, or the part of it a paint needs, kept by the stroke itself
// (its points, paint, width, brightness, and seed) and the scale it was
// painted at, the most recently used within a memory budget (StrokeLayerCache;
// larger on a device with more memory). Only the part that shows is built: a
// tile or a part of the sheet painted again builds the stroke's layer where
// it covers them, on the whole layer's own pixel grid with a margin for the
// resampling, never the whole of a stroke that wanders across the board. The
// pixels are the same either way.
const LAYER_BYTES = Math.min(192, Math.max(48, (globalThis.navigator?.deviceMemory ?? 8) * 24)) * 2 ** 20;
const layerCache = new StrokeLayerCache(LAYER_BYTES);
// (layer px round the part a paint needs, the part's edges on an 8 px grid:
// the resampling's reach, and its mipmaps' blocks kept in step)
const LAYER_MARGIN = 8;
const snap8 = (v) => Math.floor(v / 8) * 8;
// a run of points' extent (board px), kept per array
const pointBoxes = new WeakMap();
function pointsBox(P) {
  let b = pointBoxes.get(P);
  if (b && b.n === P.length) return b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length / 2; i++) { x0 = Math.min(x0, P[2 * i]); x1 = Math.max(x1, P[2 * i]); y0 = Math.min(y0, P[2 * i + 1]); y1 = Math.max(y1, P[2 * i + 1]); }
  b = { n: P.length, x0, y0, x1, y1 };
  pointBoxes.set(P, b);
  return b;
}
// `seed`: its brush's random seed. `area` (board px): only what lies in it is
// drawn (a part of the sheet, a tile: the caller clips to it). `keep`: its
// layer kept for the next paint (a stroke laid down; never one being drawn
// or moved). `hold`: a map keeping a bright stroke's layer for its light pass.
function brush(g, m, c0, seed, { atop = false, over = false, layerOnly = false, area = null, keep = false, hold = null } = {}) {
  const P = m.pts, n = P.length / 2;
  if (n < 2) return;
  const o = m.o ?? 0.85;
  const B = BRIGHTS[Math.max(0, Math.min(BRIGHTS.length - 1, m.b ?? 1))];
  const c = brushColor(c0, m.b ?? 1);
  // its own layer, the size of the stroke where it is drawn
  const box = pointsBox(P), pad = m.w + 4;
  const x0 = box.x0 - pad, y0 = box.y0 - pad, x1 = box.x1 + pad, y1 = box.y1 + pad;
  const T = typeof g.getTransform === "function" ? g.getTransform() : null;
  const k = Math.min(T ? Math.hypot(T.a, T.b) || 1 : 1, 4096 / Math.max(1, x1 - x0), 4096 / Math.max(1, y1 - y0));
  const W = Math.max(1, Math.ceil((x1 - x0) * k)), H = Math.max(1, Math.ceil((y1 - y0) * k));
  // (board px per layer px)
  const sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  // the part of its layer this paint needs (layer px): all of it, or where it
  // meets the area
  let i0 = 0, j0 = 0, i1 = W, j1 = H;
  if (area && !layerOnly) {
    i0 = Math.max(0, snap8(Math.floor((area.x0 - x0) / sx) - LAYER_MARGIN));
    j0 = Math.max(0, snap8(Math.floor((area.y0 - y0) / sy) - LAYER_MARGIN));
    i1 = Math.min(W, snap8(Math.ceil((area.x1 - x0) / sx) + LAYER_MARGIN + 7));
    j1 = Math.min(H, snap8(Math.ceil((area.y1 - y0) / sy) + LAYER_MARGIN + 7));
    // (none of it in the area: nothing of it shows)
    if (i1 <= i0 || j1 <= j0) return;
  }
  const key = keep || hold ? `${seed}|${c}|${m.w}|${n}|${pointsHash(P)}|${k}` : null;
  const held = over && hold ? hold.get(key) : null;
  let part = held && held.i0 <= i0 && held.j0 <= j0 && held.i1 >= i1 && held.j1 >= j1 ? held : null;
  if (!part && keep) part = layerCache.get(key, i0, j0, i1, j1);
  if (!part) {
    part = brushLayer(m, c, seed, k, x0, y0, i0, j0, i1, j1);
    if (keep) layerCache.put(key, part);
  }
  if (hold && !over && (m.b ?? 1) >= BRIGHTS.length - 1) hold.set(key, part);
  const lay = part.canvas;
  // (the layer alone, for a host's preview: it composes it as below)
  // (a bright stroke's light pass over the grime too: `over`)
  if (layerOnly) return { canvas: lay, x0, y0, x1, y1, soak: o * B.soak, lay: o * B.lay, over: (m.b ?? 1) >= BRIGHTS.length - 1 ? o * OVER : 0 };
  // (the whole layer, as it always was drawn; a part of it, where that part lies)
  const whole = part.i0 === 0 && part.j0 === 0 && part.i1 === W && part.j1 === H;
  const put = () => {
    if (whole) g.drawImage(lay, x0, y0, x1 - x0, y1 - y0);
    else g.drawImage(lay, 0, 0, lay.width, lay.height, x0 + part.i0 * sx, y0 + part.j0 * sy, (part.i1 - part.i0) * sx, (part.j1 - part.j0) * sy);
  };
  // into the paper: soaked in, then a little of its colour back over it
  g.save();
  g.imageSmoothingQuality = "high";
  // (Luke, 2026-10-03: lighter, its colour kept, on the sheet and on a card
  // alike; a little soaked in, the rest laid on; how much of each by its
  // brightness)
  if (over) {
    g.globalCompositeOperation = atop ? "source-atop" : "source-over";
    g.globalAlpha = o * OVER;
    put();
    g.restore();
    return;
  }
  g.globalCompositeOperation = atop ? "source-atop" : "multiply";
  g.globalAlpha = o * B.soak;
  put();
  g.globalCompositeOperation = atop ? "source-atop" : "source-over";
  g.globalAlpha = o * B.lay;
  put();
  g.restore();
}
// A stroke's painted layer, or the part i0..i1 x j0..j1 of it (layer px, at k
// layer px per board px, the layer's corner at board x0, y0): the brush's own
// drawing, the same pixels wherever the part is cut
function brushLayer(m, c, seed, k, x0, y0, i0, j0, i1, j1) {
  const P = m.pts, n = P.length / 2, r = rng(seed);
  const L = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const dx = P[2 * b] - P[2 * a], dy = P[2 * b + 1] - P[2 * a + 1], d = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / d; ny[i] = dx / d;
  }
  const total = L[n - 1] || 1;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28], f = [0.6 + r() * 0.6, 1.7 + r() * 1.4];
  const width = (i) => {
    const t = L[i] / total, run = L[i];
    const press = Math.min(1, 0.4 + run / Math.max(m.w * 1.5, 1)) * Math.min(1, 0.2 + (total - run) / Math.max(m.w * 3, 1));
    return (m.w / 2) * press * (1 + 0.1 * Math.sin(t * 6.28 * f[0] + ph[0]) + 0.06 * Math.sin(t * 6.28 * f[1] + ph[1]));
  };
  // (ragged: a slow waver and a fine tearing of the edge)
  const edge = (i, k) => 1 + 0.08 * Math.sin(L[i] * 0.19 + ph[2 + k]) + 0.07 * Math.sin(L[i] * 0.83 + ph[3 + k] * 2) + 0.05 * Math.sin(L[i] * 2.3 + ph[4 - k]);
  const lay = document.createElement("canvas");
  lay.width = i1 - i0; lay.height = j1 - j0;
  const x = lay.getContext("2d");
  x.setTransform(k, 0, 0, k, -x0 * k - i0, -y0 * k - j0);
  x.lineCap = "round"; x.lineJoin = "round";
  const outline = () => {
    x.beginPath();
    for (let i = 0; i < n; i++) { const w = width(i) * edge(i, 0); const px = P[2 * i] + nx[i] * w, py = P[2 * i + 1] + ny[i] * w; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    for (let i = n - 1; i >= 0; i--) { const w = width(i) * edge(i, 1); x.lineTo(P[2 * i] - nx[i] * w, P[2 * i + 1] - ny[i] * w); }
    x.closePath();
  };
  x.fillStyle = cssColor(c);
  outline(); x.fill();
  for (const i of [0, n - 1]) { x.beginPath(); x.arc(P[2 * i], P[2 * i + 1], width(i) * 0.9, 0, 6.3); x.fill(); }
  // the ink gathered: denser along its middle and at its rims
  x.globalCompositeOperation = "source-atop";
  x.strokeStyle = cssColor(mixColor(c, 0x0a0503, 0.35));
  x.globalAlpha = 0.28; x.lineWidth = m.w * 0.3; line(x, P); x.stroke();
  x.globalAlpha = 0.35; x.lineWidth = Math.max(0.6, m.w * 0.1); outline(); x.stroke();
  // dry: thin gaps run along it where the brush ran out, more at its edges
  // and toward its end (no specks: Luke 2026-10-03, they read as dots)
  x.globalCompositeOperation = "destination-out";
  const bristles = Math.max(4, Math.round(m.w * 0.9));
  for (let b = 0; b < bristles; b++) {
    const t = (r() - 0.5) * 0.95, edgeK = Math.abs(t) * 2;
    const off = t * m.w;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(P[2 * i] + nx[i] * off, P[2 * i + 1] + ny[i] * off);
    const dash = [];
    for (let run = 0; run < total;) {
      const fade = run / total;
      const on = m.w * (0.6 + r() * 2.2) * (0.5 + fade);
      const gap = m.w * (1.5 + r() * 8) * (1.4 - fade) * (1 - edgeK * 0.5);
      dash.push(on, gap); run += on + gap;
    }
    x.setLineDash(dash); x.lineDashOffset = r() * m.w * 6;
    x.globalAlpha = (0.35 + r() * 0.5) * (0.5 + edgeK * 0.6);
    x.lineWidth = Math.max(0.5, m.w * (0.05 + r() * 0.08));
    line(x, pts); x.stroke();
  }
  x.setLineDash([]);
  return { canvas: lay, i0, j0, i1, j1 };
}

// The pages pasted on the sheet: each drawn lifted a little and sewn to the
// sheet along an edge or two (Luke, 2026-10-21: the seams back; the "hatch
// stitching" he meant was the tally strokes asset, never these). A page's
// `seam: false` leaves it unsewn. Those out of the area are passed over.
function drawPages(g, area = null) {
  const pages = (look.decor ?? []).filter((d) => d.layer === "page");
  const T = look.sheet.pages ?? { darken: 0, sepia: 0, contrast: 100, soak: 0 };
  for (const d of pages) {
    const meta = piece(d.tex);
    const ar = meta?.w && meta?.h ? meta.h / meta.w : 1.3;
    const w = d.w, h = d.w * ar, rot = d.r * Math.PI / 180;
    const reach = Math.hypot(w, h) / 2 + 40;
    if (area && !meets({ x0: d.x - reach, y0: d.y - reach, x1: d.x + reach, y1: d.y + reach }, area)) continue;
    const im = img(d.tex, () => around(d.x, d.y, reach));
    if (!im) continue;
    // (Luke, 2026-10-06: browned, quieted, and darkened toward the sheet,
    // their edges soaked in: lying in the sheet, never over the board)
    const page = tonedPage(im, d, T, Math.min(1600, Math.max(256, w * 1.2 * pxs())));
    g.save(); g.globalAlpha = d.o / 100;
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 4 * pxs(); g.shadowOffsetY = 2 * pxs();
    g.translate(d.x, d.y); g.rotate(rot); g.scale(d.flip ? -1 : 1, 1);
    g.imageSmoothingQuality = "high";
    g.drawImage(page, -w / 2, -h / 2, w, h);
    g.restore();
    if (d.seam === false || !look.grime.stitches) continue;
    // (its seams: one edge, or two, by its own seed; a stretch of each)
    const sr = rng(`seam:${d.tex}:${Math.round(d.x)}:${Math.round(d.y)}`);
    const cs = Math.cos(rot), sn = Math.sin(rot), fx = d.flip ? -1 : 1;
    const at = (lx, ly) => ({ x: d.x + lx * fx * cs - ly * sn, y: d.y + lx * fx * sn + ly * cs });
    const edges = [[-w / 2, -h / 2, w / 2, -h / 2], [w / 2, -h / 2, w / 2, h / 2], [w / 2, h / 2, -w / 2, h / 2], [-w / 2, h / 2, -w / 2, -h / 2]];
    const first = Math.floor(sr() * 4);
    g.save(); g.lineCap = "round"; g.globalAlpha = Math.min(1, (d.o / 100) * (0.5 + look.grime.stitches / 200));
    for (const e of sr() < 0.45 ? [first, (first + 1) % 4] : [first]) {
      const [x0, y0, x1, y1] = edges[e];
      // (a little in from the edge, as a seam is)
      const inset = 9, ex = x1 - x0, ey = y1 - y0, el = Math.hypot(ex, ey) || 1, ix = (-ey / el) * -inset, iy = (ex / el) * -inset;
      const a = at(x0 + ix, y0 + iy), b = at(x1 + ix, y1 + iy);
      const total = Math.hypot(b.x - a.x, b.y - a.y), len = total * (0.35 + sr() * 0.45);
      stitchRun(g, [a.x, a.y, b.x, b.y], sr() * Math.max(1, total - len), len, sr);
    }
    g.restore();
  }
}
// A page as it lies in the sheet: browned and its contrast lowered, then
// darkened toward the sheet's own tone, its edges soaked darker the way damp
// paper takes up what it is pasted on. Made once for each page and setting.
const tonedPages = new WeakMap();
function tonedPage(im, d, T, cap) {
  let per = tonedPages.get(im);
  if (!per) tonedPages.set(im, (per = new Map()));
  const S = look.sheet;
  const key = `${Math.round(cap / 64)}|${Math.round(d.w)}|${JSON.stringify(T)}|${JSON.stringify(d.fx ?? null)}|${S.tint}|${S.darken}`;
  if (per.has(key)) return per.get(key);
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const k = Math.min(1, cap / Math.max(iw, ih));
  const W = Math.max(1, Math.round(iw * k)), H = Math.max(1, Math.round(ih * k));
  const canvas = (w = W, h = H) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const c = canvas(), x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  const filter = [d.fx ? gradeFilter(d.fx) : "", T.sepia ? `sepia(${T.sepia}%)` : "", T.contrast !== 100 ? `contrast(${T.contrast}%)` : ""].filter(Boolean).join(" ") || "none";
  if (HAS_FILTER) x.filter = filter;
  x.drawImage(im, 0, 0, W, H);
  x.filter = "none";
  // darkened toward the sheet (as the sheet's own paper is: its tint, by
  // `darken` % of the sheet's darkening), only where the page is
  if (T.darken) {
    x.globalCompositeOperation = "multiply";
    x.fillStyle = cssColor(mixColor(0xffffff, S.tint, (S.darken / 100) * (T.darken / 100)));
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(im, 0, 0, W, H);
  }
  // its edges soaked: darker the nearer its edge (a blur of its outline, turned inside out)
  const r = (T.soak ?? 0) * k * (iw / Math.max(1, d.w || iw));
  if (r >= 1 && HAS_FILTER) {
    const pad = Math.ceil(r * 2);
    const m = canvas(W + pad * 2, H + pad * 2), mx = m.getContext("2d");
    mx.filter = `blur(${r}px)`; mx.drawImage(im, pad, pad, W, H); mx.filter = "none";
    const e = canvas(W + pad * 2, H + pad * 2), ex = e.getContext("2d");
    ex.fillStyle = cssColor(mixColor(S.tint, 0x0a0503, 0.45)); ex.fillRect(0, 0, e.width, e.height);
    ex.globalCompositeOperation = "destination-out"; ex.drawImage(m, 0, 0);
    x.globalCompositeOperation = "source-atop"; x.globalAlpha = 0.85;
    x.drawImage(e, -pad, -pad);
    x.globalAlpha = 1;
  }
  // worn (Luke, 2026-10-06): a crease or two where it was folded, pale on
  // one side and dark on the other, only where the page is
  const wr = rng(`pagewear:${d.id}:${d.tex}`);
  x.globalCompositeOperation = "source-atop";
  for (let i = 0, n = 1 + Math.floor(wr() * 2); i < n; i++) {
    const across = wr() < 0.5, at = (0.25 + wr() * 0.5) * (across ? H : W), tilt = (wr() - 0.5) * 0.12 * (across ? W : H);
    const line = (off, color, lw) => {
      x.strokeStyle = color; x.lineWidth = lw * k * (iw / Math.max(1, d.w || iw)) * 2;
      x.beginPath();
      if (across) { x.moveTo(0, at - tilt + off); x.lineTo(W, at + tilt + off); } else { x.moveTo(at - tilt + off, 0); x.lineTo(at + tilt + off, H); }
      x.stroke();
    };
    const lw = Math.max(1, 1.2 * k * (iw / Math.max(1, d.w || iw)) * 2);
    line(-lw, "rgba(255,245,225,0.22)", 1.4);
    line(lw * 0.6, "rgba(30,18,10,0.3)", 1.1);
  }
  x.globalCompositeOperation = "source-over";
  per.set(key, c);
  return c;
}
// Writing straight on the sheet: grease pencil, warming to rust the deeper it
// is (a hidden one, the GM's, faint)
function drawSheetWriting(g, area = null) {
  for (const s of view?.scraps ?? []) {
    const L = s.layout;
    if (!L?.bare || (area && !meets(writingBox(s), area))) continue;
    const chalk = cssColor(mixColor(L.ink ?? look.ink.scrawl, 0x8a2a1e, Math.pow(L.depth, 1.4) * 0.35));
    for (const ln of L.lines) hand(g, ln, chalk, (s.look === "ghost" ? 0.32 : 1) * 0.88, L.depth);
  }
}
// a sheet writing's extent, with a margin for its hand
const writingBoxes = new WeakMap();
function writingBox(s) {
  let b = writingBoxes.get(s.layout);
  if (b) return b;
  const h = s.layout.hull;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < h.length; i += 2) { x0 = Math.min(x0, h[i]); x1 = Math.max(x1, h[i]); y0 = Math.min(y0, h[i + 1]); y1 = Math.max(y1, h[i + 1]); }
  const p = (s.layout.lines?.[0]?.size ?? 20) * 0.6;
  b = { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p };
  writingBoxes.set(s.layout, b);
  return b;
}
// (`area`: the part being painted, the canvas clipped to it; each stroke's
// layer is kept for the next paint, and only its part in the area is built)
function drawInk(g, area = null, { over = false, hold = null } = {}) {
  const pal = look.ink.marker;
  for (const strokes of Object.values(view?.marks ?? {})) {
    for (const [id, m0] of Object.entries(strokes)) {
      if (over && m0.b !== 2) continue;
      if (area && !meets(markBox(m0), area)) continue;
      const c = pal[m0.c] ?? pal[0] ?? 0xa39a86;
      // (never wider than three strings, however it was drawn)
      const m = { ...m0, w: Math.min(m0.w, markMax(look)) };
      brush(g, m, c, `mark:${id}:${m.pts.length}`, { over, area, keep: true, hold });
    }
  }
}
// The part of the board the canvas shows (board px, with a margin for
// shadows), or null where that can't be told
function inView(g) {
  if (typeof g.getTransform !== "function" || !g.canvas) return null;
  let m;
  try { m = g.getTransform().inverse(); } catch { return null; }
  const W = g.canvas.width, H = g.canvas.height;
  const xs = [], ys = [];
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { const p = m.transformPoint({ x, y }); xs.push(p.x); ys.push(p.y); }
  const pad = 60;
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}
function scrapShows(s, r) {
  if (!r) return true;
  const h = s.layout?.hull;
  if (!h?.length) return true;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < h.length; i += 2) { x0 = Math.min(x0, h[i]); x1 = Math.max(x1, h[i]); y0 = Math.min(y0, h[i + 1]); y1 = Math.max(y1, h[i + 1]); }
  // (and what hangs off it: a sheet behind it, tape, a web)
  for (const e of [...(s.layout.extras ?? []), ...(s.layout.tapes ?? [])]) { const m = Math.max(e.w, e.h ?? 0) * 0.75; x0 = Math.min(x0, e.cx - m); x1 = Math.max(x1, e.cx + m); y0 = Math.min(y0, e.cy - m); y1 = Math.max(y1, e.cy + m); }
  return x1 >= r.x0 && x0 <= r.x1 && y1 >= r.y0 && y0 <= r.y1;
}
// a string's extent (its points; a named one, everywhere: its tag hangs off it)
const linkBoxes = new WeakMap();
function linkShows(l, r) {
  if (!r || l.label) return true;
  let b = linkBoxes.get(l);
  if (!b) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const P = l.points;
    for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
    b = { x0, y0, x1, y1 };
    linkBoxes.set(l, b);
  }
  return meets(b, r);
}
function drawForeground(g, { marksOnly = false } = {}) {
  // (Luke, 2026-10-02: the drawing alone, without the board's pieces; the
  // marker itself is the sheet's, in the background)
  if (marksOnly) return;
  const r = inView(g);
  drawDecor(g, view.decor, "under");
  // (writing on the sheet is the sheet's, baked under its grime; a name tag
  // hangs over the strings, Luke 2026-10-03)
  for (const s of view.scraps) if (!s.tag && scrapShows(s, r)) drawScrap(g, s);
  // (the board's loose pieces: tape and webs taken off cards)
  for (const b of view.bits ?? []) sprite(g, b.tex, b.x, b.y, b.w, b.rot, { flip: b.flip, alpha: b.alpha ?? 1, shadow: 4, filter: gradeFilter(look.grade.paper) });
  for (const l of view.links) if (linkShows(l, r)) drawLink(g, l);
  for (const s of view.scraps) if (s.tag && scrapShows(s, r)) drawScrap(g, s);
  pinView = r;
  try { drawPins(g); } finally { pinView = null; }
  drawDecor(g, view.decor, "over");
}

return {
  set(s) {
    if (s.look && s.look !== look) { look = s.look; lookStamp = JSON.stringify([look.grade, look.ink, look.fonts, look.grime, look.scrap, look.pools.stains, look.pools.papers, look.pools.notes]); }
    if (s.view) view = s.view; if (s.geo) geo = s.geo;
  },
  // a marker stroke as the brush draws it (the tools' marks: one being moved)
  drawStroke(g, m, seed = "") { brush(g, { ...m, w: Math.min(m.w, markMax(look)) }, look.ink.marker[m.c] ?? look.ink.marker[0] ?? 0xa39a86, `mark:${seed}`); },
  // a stroke's own painted layer and how it is laid down (a host's preview
  // composes it the same way: soaked in by multiply, then laid over), and the
  // darkening the sheet's grime gives it once it is down (Luke, 2026-10-06:
  // the preview as dark as the drawing will be)
  strokeLayer(m, scale, seed = "") {
    const g = { getTransform: () => new DOMMatrix([scale, 0, 0, scale, 0, 0]) };
    return brush(g, { ...m, w: Math.min(m.w, markMax(look)) }, look.ink.marker[m.c] ?? look.ink.marker[0] ?? 0xa39a86, `mark:${seed}`, { layerOnly: true });
  },
  get grimeVeil() { return GRIME_VEIL; },
  drawTable, drawSheet, drawBackground, bakeBackground, sharpenBackground, sharpenContinue, drawPatch, paintSheet, markState, markChanges, drawForeground,
  // (the bake and patch let go: a picture painted, or the board left)
  dropBake() { bake = null; patch = null; nextPatch = null; },
  // (the strokes' kept layers let go: the board left; and what they hold)
  dropLayers() { layerCache.clear(); },
  get layers() { return { bytes: layerCache.bytes, pieces: layerCache.pieces.size, budget: layerCache.budget }; },
  // what is drawn from here to unwatch() short of an image, and where
  // (img: [{ id, box }]; a host paints those parts again when it comes)
  watch() { watching = []; },
  unwatch() { const w = watching ?? []; watching = null; return w; },
  resetMissing() { missing = false; }, drawLight, drawDecor, drawScrap, drawLink, drawPins, drawInk,
  tagOf, onTag, ropeFor, layerCanvas, poly, line, shrink, gradeFilter, graded,
  get missing() { return missing; },
};
}
