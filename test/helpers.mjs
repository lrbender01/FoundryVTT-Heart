// Fakes and utilities shared by the rules tests (2026-09-30, Luke). Actors and
// items are plain objects in the shape the rules read; nothing here needs
// Foundry.

/**
 * A character (or other actor) with the skills, domains, and fallouts given.
 * skills / domains: a list of slugs the character has, or an object of
 * { slug: { value, knack } }.
 */
export function makeActor({
  id = "vess",
  name = "Vess",
  type = "character",
  skills = [],
  domains = [],
  fallouts = [],
  items = [],
} = {}) {
  const traits = (t) =>
    Array.isArray(t) ? Object.fromEntries(t.map((s) => [s, { value: true }])) : t;
  return {
    id,
    name,
    type,
    system: { skills: traits(skills), domains: traits(domains) },
    items: [...fallouts.map((f) => makeFallout(f)), ...items],
  };
}

/** A fallout item: a name, or { name, complete } */
export function makeFallout(f) {
  const { name, complete = false } = typeof f === "string" ? { name: f } : f;
  return { type: "fallout", name, system: { complete } };
}

/** Register actors in game.actors (the setup clears it before each test) */
export function addActors(...actors) {
  for (const a of actors) game.actors.set(a.id, a);
  return actors;
}

/** The highlighted texts in emphasizeTerms output, in order */
export function highlights(html) {
  return [...String(html).matchAll(/<strong class="heart-term[^"]*"[^>]*>(.*?)<\/strong>/g)].map(
    (m) => m[1],
  );
}

/** The ability references (heart-ability-ref) in emphasizeTerms output */
export function abilityRefs(html) {
  return [
    ...String(html).matchAll(/<strong class="[^"]*\bheart-ability-ref\b[^"]*"[^>]*>(.*?)<\/strong>/g),
  ].map((m) => m[1]);
}

/** The text with every tag removed (highlighting must never change it) */
export function plainText(html) {
  return String(html).replace(/<[^>]+>/g, "");
}

/** A small seeded PRNG (mulberry32), so the randomized checks are repeatable */
export function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** an integer in [min, max] */
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  /** one element of a list */
  next.pick = (list) => list[Math.floor(next() * list.length)];
  return next;
}

/**
 * Foundry v12's DiceTerm._keepOrDrop, as PoolTerm's dh / kh modifiers run it
 * on a pool's results: sorts the ACTIVE results, discards those past the cut
 * value, then discards ties in index order until the count is reached.
 */
function keepOrDrop(results, number, { keep = true, highest = true } = {}) {
  const ascending = keep === highest;
  const values = results
    .filter((r) => r.active)
    .map((r) => r.result)
    .sort((a, b) => (ascending ? a - b : b - a));
  number = Math.min(Math.max(keep ? values.length - number : number, 0), values.length);
  const cut = values[number];
  let discarded = 0;
  const ties = [];
  for (const r of results) {
    if (!r.active) continue;
    const discard = ascending ? r.result < cut : r.result > cut;
    if (discard) {
      r.active = false;
      r.discarded = true;
      discarded++;
    } else if (r.result === cut) ties.push(r);
  }
  for (const r of ties) {
    if (discarded < number) {
      r.active = false;
      r.discarded = true;
      discarded++;
    }
  }
  return discarded;
}

/**
 * Evaluate a pool formula's modifiers the way Foundry does for
 * `{1d10, ...}dh<cut>kh`: drop the `cut` highest, keep the highest left.
 * values: the dice as rolled. Returns the pool's results with active flags.
 */
export function evaluatePool(values, cut) {
  const results = values.map((result) => ({ result, active: true }));
  if (cut) keepOrDrop(results, cut, { keep: false, highest: true });
  keepOrDrop(results, 1, { keep: true, highest: true });
  return results;
}
