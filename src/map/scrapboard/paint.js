// The Heart map's painter (2026-10-02, monorepo docs/plans/heart-map.md):
// draws a look and a board view (model.js) with canvas 2D. The one drawing
// code both editors run: the Heart Map Board mock (docs/mocks/heart-map/,
// the primary editor and the source of truth for how the map looks) inlines
// it into its page; the system's map scene paints into an offscreen canvas
// and shows it as a PIXI texture under the tokens. Change how the map looks
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
    pinScale, nearestOnPath, sheetOutline, foldLines, foldCrossings, ledgerRules, sheetPanels,
} from './model.js';

// The sheet's geometry for a look (`tone(id)`, `safe(id)`: a paper's mean
// colour and solid region, from the texture set's metadata)
export function sheetGeometry(look, tone = () => null, safe = () => null) {
    return { outline: sheetOutline(look), folds: foldLines(look), crossings: foldCrossings(look), ledger: ledgerRules(look), panels: sheetPanels(look, tone, safe) };
}

export function createPainter(env) {
let look = null, view = null, geo = null;
let missing = false;
const piece = (id) => env.piece(id);
// (an image the host has only a small preview of yet counts as missing: what
// it is drawn into is done again when the whole one comes)
const img = (id) => { const im = env.img(id); if ((!im || im.preview) && id) missing = true; return im; };
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
function sprite(g, id, cx, cy, w, rot, { alpha = 1, flip = false, flipY = false, shadow = 0, blend = "source-over", h = null, filter = "none" } = {}) {
  if (pinView && (cx < pinView.x0 || cx > pinView.x1 || cy < pinView.y0 || cy > pinView.y1)) return;
  const im0 = img(id); if (!im0) return;
  if (shadow && blend === "source-over" && !BAKING && w * pxs() < 400) {
    const im = graded(im0, filter, Math.max(256, w * 2 * pxs()));
    const hh = h ?? w * ((im0.naturalHeight || im0.height) / (im0.naturalWidth || im0.width));
    const e = shadowedSprite(im, id, w, hh, rot, flip, flipY, shadow, filter);
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
  for (const [on, y] of [[ln.underline, ln.size * 0.4], [ln.strike, ln.size * 0.06]]) {
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
  const im = img(id); if (!im) return;
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
      const im = img(p.tex); if (!im) continue;
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
  // the marker, on the paper, under everything that has happened to it since
  drawInk(g, area);
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
  drawFolds(g);
  sheetGrime(g, near);
  const wash = g.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, `rgba(8,3,2,${look.wash.top / 100})`); wash.addColorStop(1, `rgba(8,3,2,${look.wash.bottom / 100})`);
  g.fillStyle = wash; fill();
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
  g.save(); // the edge itself: a dark line with a pale lip, like the fold seams
  g.save(); g.lineJoin = "round"; g.strokeStyle = "rgba(8,4,2,0.6)"; g.lineWidth = 3; poly(g, out); g.stroke();
  g.strokeStyle = "rgba(230,205,170,0.18)"; g.lineWidth = 6; poly(g, shrink(out, look.w / 2, look.h / 2, 0.996)); g.stroke(); g.restore();
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
  const pool = look.pools.stains ?? [];
  if (pool.length) {
    for (let i = 0, n = Math.round(18 * A); i < n; i++) {
      const x = r() * W, y = r() * H, w = 120 + r() * 360, rot = r() * 6.3, a = 0.18 + r() * 0.25;
      if (near(x, y, w)) stain(g, pickFrom(pool, `sheet:soot:${i}`), x, y, w, rot, a, SOOT);
    }
    for (let i = 0, n = Math.round(26 * B); i < n; i++) {
      const y = H * (0.2 + 0.8 * Math.sqrt(r()));
      const x = r() * W, w = 90 + r() * 380 * (0.5 + y / H), rot = r() * 6.3, a = 0.25 + r() * 0.35;
      if (near(x, y, w)) stain(g, pickFrom(pool, `sheet:blood:${i}`), x, y, w, rot, a, BLOOD[i % BLOOD.length]);
    }
  }
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
    const r = sr;
    const len = 220 + r() * 520, total = pathLength(f.pts), from = r() * Math.max(1, total - len);
    const slant = 0.35 + r() * 0.3;
    for (let d = from; d < from + len; d += 13 + r() * 9) {
      const p = pointAlong(f.pts, d), q = pointAlong(f.pts, d + 1);
      const ang = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
      const half = 6 + r() * 4, sl = half * slant;
      const ax = p.x - nx * half - tx * sl, ay = p.y - ny * half - ty * sl, bx = p.x + nx * half + tx * sl, by = p.y + ny * half + ty * sl;
      g.strokeStyle = "rgba(24,14,10,0.8)"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = "rgba(170,140,105,0.28)"; g.lineWidth = 0.9; g.beginPath(); g.moveTo(ax + nx * 0.6, ay + ny * 0.6); g.lineTo(bx - nx * 0.6, by - ny * 0.6); g.stroke();
      g.fillStyle = "rgba(10,6,4,0.85)";
      for (const [hx, hy] of [[ax, ay], [bx, by]]) { g.beginPath(); g.arc(hx, hy, 1.4, 0, 6.3); g.fill(); }
    }
  }
  g.restore();
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
const mirrors = new Map();
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
function tinted(im, color, variant = 0) {
  let per = tints.get(im);
  if (!per) tints.set(im, (per = new Map()));
  const key = `${color}|${variant}`;
  if (per.has(key)) return per.get(key);
  const c = document.createElement("canvas");
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const k = Math.min(1, 600 / Math.max(iw, ih));
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

// A stain at a point: a splatter from the look's stains, tinted (blood,
// soot) or as drawn, multiplied in
function stain(g, tex, x, y, w, rot, alpha, color = null) {
  const im = img(tex); if (!im) return;
  const src = color ? tinted(im, color, hashSeed(`${tex}:${Math.round(x)}:${Math.round(y)}`) % 5) : im;
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
  const pool = look.pools.stains ?? [];
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
  const key = JSON.stringify([s.key, s.seed, s.ink, s.marks, s.parts, s.type, s.lib, s.uuid, s.name, s.text, s.art, s.s, s.paper, s.fix, s.hand, s.state, s.look, Math.round(P.w), Math.round(L.depth * 20), q, lookStamp, s.lib ? look.library[s.lib]?.clip : null, s.lib ? look.library[s.lib]?.name : null]);
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
    scrapFace(g, s);
    // the grime, clipped to what is drawn
    const mask = document.createElement("canvas"); mask.width = c.width; mask.height = c.height;
    mask.getContext("2d").drawImage(c, 0, 0);
    g.setTransform(q, 0, 0, q, (P.w / 2 + pad) * q, (P.h / 2 + pad) * q);
    scrapGrime(g, s, P.w, P.h);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-in"; g.drawImage(mask, 0, 0); g.globalCompositeOperation = "source-over";
    g.setTransform(q, 0, 0, q, (P.w / 2 + pad) * q, (P.h / 2 + pad) * q);
    g.rotate(-P.rot); g.translate(-P.cx, -P.cy);
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
function scrapFace(g, s) {
  const L = s.layout, P = L.paper;
  const ink = cssColor(inkAt(L.depth, L.ink ?? look.ink.text));
  const G = look.grime.scraps / 100;
  extras(g, s, "under");
  if (P.tex) sprite(g, P.tex, P.cx, P.cy, P.w, P.rot, { h: P.h, filter: gradeFilter(jitterGrade(look.grade.paper, s.layout.seedKey ?? s.key, G)) });
  else { g.save(); g.fillStyle = "#dccfb3"; poly(g, L.hull); g.fill(); g.restore(); }
  extras(g, s, "on");
  // the marker on it, only on its paper, under its grime (Luke, 2026-10-03)
  if (L.strokes?.length) {
    g.save(); g.globalCompositeOperation = "source-atop";
    for (const st of L.strokes) brush(g, { ...st, w: Math.min(st.w, markMax(look)) }, look.ink.sheet[st.c] ?? look.ink.sheet[0] ?? 0xa39a86, rng(`cmark:${s.key}:${st.id}`));
    g.restore();
  }
  if (L.clip) {
    const C = L.clip, B = C.box;
    g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 7 * pxs(); g.shadowOffsetY = 3 * pxs();
    g.fillStyle = "#e9dfcb"; poly(g, C.pts); g.fill(); g.restore();
    const art = img(C.art);
    const inner = shrink(C.pts, B.cx, B.cy, 1 - 10 / Math.max(B.w, 1));
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
  const inner = shrink(C.pts, B.cx, B.cy, 1 - 10 / Math.max(B.w, 1));
  const ab = clipArtBox({ w: B.w - 10, h: B.h - 10 }, (art.naturalWidth || art.width) / (art.naturalHeight || art.height), C.frame);
  g.save(); poly(g, inner); g.clip();
  g.translate(B.cx, B.cy); g.rotate(B.rot); g.imageSmoothingQuality = "high";
  g.drawImage(art, ab.x, ab.y, ab.w, ab.h);
  g.restore();
}

function drawScrap(g, s) {
  const L = s.layout, ghost = s.look === "ghost", a = ghost ? 0.32 : 1;
  if (L.bare) {
    // grease pencil straight on the sheet, warming to rust the deeper it is
    const chalk = cssColor(mixColor(L.ink ?? look.ink.scrawl, 0x8a2a1e, Math.pow(L.depth, 1.4) * 0.35));
    for (const ln of L.lines) hand(g, ln, chalk, a * 0.88, L.depth);
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

// A rope texture laid along a line (PIXI: SimpleRope with a repeating
// texture, one mesh). Translucent strings are drawn whole into a layer and
// faded together, so the segments' overlaps don't bead.
// A string: the straight middle of one of Luke's string drawings, a seamless
// strip repeated along the curve from pin to pin (from a point along it set
// by the string's seed, so neighbours don't repeat in step), scaled so its
// string is `thick` board px wide (PIXI: a SimpleRope with a repeating
// texture). Translucent strings are drawn whole into a layer and faded
// together, so the segments' overlaps don't bead.
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

// a scratch canvas the size of the one being drawn on
const layers = new WeakMap();
function layerCanvas(g) {
  let L = layers.get(g.canvas);
  if (!L) { L = document.createElement("canvas"); layers.set(g.canvas, L); }
  if (L.width !== g.canvas.width || L.height !== g.canvas.height) { L.width = g.canvas.width; L.height = g.canvas.height; }
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
  const R = look.ropes[l.kind] ?? look.ropes.path;
  const ghost = l.look === "ghost";
  // see-through only when the players can't see it (the GM's ghost)
  const alpha = ghost ? 0.35 : 1;
  // (in its own colour, or its kind's)
  const color = l.color === null || l.color === undefined ? null : look.ink.sheet[l.color] ?? null;
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
  // (mostly upright: a third of the pull, never past 25 degrees)
  const own = ((hashSeed(seed) % 9) - 4) * Math.PI / 180;
  return Math.max(-0.44, Math.min(0.44, d * 0.3)) + own;
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
    if (pa?.tex && !pa.shared) sprite(g, pa.tex, pa.x, pa.y, pa.w, lean(pa, { x: P[Math.min(6, n - 2)], y: P[Math.min(7, n - 1)] }, l.id + "a"), { alpha: a, shadow: 6 });
    if (pb?.tex && !pb.shared) sprite(g, pb.tex, pb.x, pb.y, pb.w, lean(pb, { x: P[Math.max(0, n - 8)], y: P[Math.max(1, n - 7)] }, l.id + "b"), { alpha: a, shadow: 6 });
    // a named string's junction pin and the pins it is pulled through keep
    // to the string itself (Luke, 2026-10-02: never leaning toward a tag or
    // a note); the pin through the tag leans toward the junction
    const T = tagOf(l);
    if (T) {
      const J = l.junction;
      if (J?.tex) sprite(g, J.tex, J.x, J.y, J.w, lean(J, alongString(l, J), l.id + "j"), { alpha: a, shadow: 6 });
      if (!T.over && T.pin?.tex) sprite(g, T.pin.tex, T.pin.x, T.pin.y, T.pin.w, lean(T.pin, T.mid, l.id + "t"), { alpha: a, shadow: 6 });
    }
    for (const j of l.joints ?? []) if (j.tex && !j.shared) sprite(g, j.tex, j.x, j.y, j.w, lean(j, alongString(l, j), `${l.id}j${j.idx}`), { alpha: a, shadow: 6 });
  }
  // the board's own pins (loose, or in a scrap)
  for (const p of view.pins ?? []) if (p.tex && !p.hidden) sprite(g, p.tex, p.x, p.y, p.w, p.r === null && p.pulls?.length ? lean(p, pulledBy(p), p.id) : p.rot, { alpha: p.look === "ghost" ? 0.35 : 1, shadow: 6 });
  for (const s of view.scraps) {
    if (s.layout.bare) continue;
    const al = s.look === "ghost" ? 0.35 : 1;
    // its own pin, when nothing else holds it (or the GM wants it anyway)
    if (!s.layout.pinOff && (!s.tied || s.pinShow)) {
      const p = s.layout.pin;
      if (p.tex) sprite(g, p.tex, p.x, p.y, p.w, p.rot, { alpha: al, shadow: 6 });
      else { g.save(); g.fillStyle = "#8f1d18"; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill(); g.restore(); }
    }
    // pins through the clipping, and pins the GM added
    for (const p of [...(s.layout.clipPins ?? []), ...(s.layout.pins ?? [])]) if (p.tex) sprite(g, p.tex, p.x, p.y, p.w, p.rot, { alpha: al, shadow: 6 });
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
let bake = null;
// the strokes as they are: id -> [what it is, where it reaches]
function markState() {
  const out = new Map();
  for (const [layer, strokes] of Object.entries(view?.marks ?? {})) {
    for (const [id, m] of Object.entries(strokes)) {
      let h = m.pts.length;
      for (let i = 0; i < m.pts.length; i++) h = (h * 31 + m.pts[i] * (i + 1)) % 1000003;
      out.set(`${layer}:${id}`, { sig: `${m.c}|${m.w}|${h}`, box: markBox(m) });
    }
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
  if (area) {
    g.beginPath(); g.rect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0); g.clip();
    g.clearRect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
  }
  const wasBaking = BAKING;
  BAKING = scale;
  try { drawSheet(g, area); drawDecor(g, look.decor); } finally { BAKING = wasBaking; g.restore(); }
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
function sharpenBackground(key, area, q) {
  const A = { x0: Math.max(-BAKE_PAD, Math.floor(area.x0)), y0: Math.max(-BAKE_PAD, Math.floor(area.y0)), x1: Math.min(look.w + BAKE_PAD, Math.ceil(area.x1)), y1: Math.min(look.h + BAKE_PAD, Math.ceil(area.y1)) };
  const w = A.x1 - A.x0, h = A.y1 - A.y0;
  if (w < 2 || h < 2) { patch = null; return null; }
  const k = Math.min(q, 2.5, PATCH_SIDE / w, PATCH_SIDE / h);
  if (patch && patch.key === key && patch.complete && patch.k >= k * 0.99 && patch.A.x0 <= A.x0 && patch.A.y0 <= A.y0 && patch.A.x1 >= A.x1 && patch.A.y1 >= A.y1) return patch;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
  const before = missing;
  missing = false;
  paintSheet(c, k, -A.x0 * k, -A.y0 * k);
  patch = { key, A, k, canvas: c, complete: !missing, marks: markState() };
  missing = before || missing;
  return patch;
}
function drawBackground(g, { key = "", live = false, scale = 1, sharp = true } = {}) {
  drawTable(g);
  if (live) { drawSheet(g); drawDecor(g, look.decor); return; }
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
// A brush's stroke (Luke, 2026-10-03: a brush texture in the marker; no
// soak or shadow under it): a thin wash, then a dozen or so bristles along
// it, each its own weight and shade, with dry gaps, more of them at its edges.
// Its opacity (o, 0 to 1) is its own.
function brush(g, m, c, r) {
  const P = m.pts, n = P.length / 2;
  if (n < 2) return;
  const o = m.o ?? 0.85;
  // each point's way across the stroke
  const nx = new Float32Array(n), ny = new Float32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = P[2 * b] - P[2 * a], dy = P[2 * b + 1] - P[2 * a + 1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    nx[i] = -dy; ny[i] = dx;
    if (i) total += Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]);
  }
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  g.strokeStyle = cssColor(c); g.globalAlpha = o * 0.42; g.lineWidth = m.w * 0.88; line(g, P); g.stroke();
  const bristles = Math.max(5, Math.min(14, Math.round(m.w * 1.1)));
  for (let k = 0; k < bristles; k++) {
    const t = k / (bristles - 1) - 0.5, edge = Math.abs(t) * 2;
    const off = t * m.w * 0.92 + (r() - 0.5) * m.w * 0.08;
    const pts = new Array(P.length);
    for (let i = 0; i < n; i++) { pts[2 * i] = P[2 * i] + nx[i] * off; pts[2 * i + 1] = P[2 * i + 1] + ny[i] * off; }
    // (dry: gaps along it, more and longer toward the edges)
    const dash = [];
    for (let run = 0; run < total;) {
      const on = Math.max(1, m.w * (2 + r() * 10) * (1 - edge * 0.55));
      const gap = r() < 0.2 + edge * 0.5 ? m.w * (0.3 + r() * 1.4) : 0.4;
      dash.push(on, gap); run += on + gap;
    }
    g.setLineDash(dash); g.lineDashOffset = r() * m.w * 4;
    g.strokeStyle = cssColor(mixColor(c, r() < 0.5 ? 0x120a06 : 0xe2d6bc, r() * 0.2));
    g.globalAlpha = o * (0.5 + r() * 0.5) * (1 - edge * 0.3);
    g.lineWidth = Math.max(0.6, (m.w / bristles) * (1.1 + r() * 0.9));
    line(g, pts); g.stroke();
  }
  g.restore();
}
function drawInk(g, area = null) {
  const pal = look.ink.sheet;
  for (const strokes of Object.values(view?.marks ?? {})) {
    for (const [id, m0] of Object.entries(strokes)) {
      if (area && !meets(markBox(m0), area)) continue;
      const c = pal[m0.c] ?? pal[0] ?? 0xa39a86;
      // (never wider than three strings, however it was drawn)
      const m = { ...m0, w: Math.min(m0.w, markMax(look)) };
      brush(g, m, c, rng(`mark:${id}:${m.pts.length}`));
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
  for (const s of view.scraps) if (scrapShows(s, r)) drawScrap(g, s);
  for (const l of view.links) if (linkShows(l, r)) drawLink(g, l);
  pinView = r;
  try { drawPins(g); } finally { pinView = null; }
  drawDecor(g, view.decor, "over");
}

return {
  set(s) {
    if (s.look && s.look !== look) { look = s.look; lookStamp = JSON.stringify([look.grade, look.ink, look.fonts, look.grime, look.scrap, look.pools.stains, look.pools.papers, look.pools.notes]); }
    if (s.view) view = s.view; if (s.geo) geo = s.geo;
  },
  drawTable, drawSheet, drawBackground, bakeBackground, sharpenBackground, drawPatch, paintSheet, markState, markChanges, drawForeground,
  // (the bake and patch let go: a picture painted, or the board left)
  dropBake() { bake = null; patch = null; },
  resetMissing() { missing = false; }, drawLight, drawDecor, drawScrap, drawLink, drawPins, drawInk,
  tagOf, onTag, ropeFor, layerCanvas, poly, line, shrink, gradeFilter, graded,
  get missing() { return missing; },
};
}
