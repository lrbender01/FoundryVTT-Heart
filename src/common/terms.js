// Highlight Heart game terms inside rendered text (2026-09-29), each with
// its one-line rule as a tooltip (2026-09-30, see termTooltipKey below).
//
// Ability descriptions come from two places - the core book's lang strings
// (no markup at all) and fvtt-heart-content's W&M YAML (partly marked up) -
// so rather than rewriting hundreds of strings, text is run through this at
// render time. Highlighted as <strong class="heart-term">:
//   - skills and domains ("Skill+Domain" rolls stay one unit)
//   - resistances / fallout types (Blood, Mind, Echo, Fortune, Supplies)
//   - fallout severities with their type ("Minor Mind fallout")
//   - Protection
//   - equipment / resource tags (Brutal, Piercing, Point-Blank, ...)
//   - dice (D4 ... D20, either case)
//
// Capitalisation-sensitive (2026-09-29 review): the transcriptions capitalise
// game terms, so only capitalised words count ("Kill", not "kill"; "Protection",
// not "protection"; fallout needs "Fallout" or a "Minor/Major/Critical" lead). Dice
// are the exception - "d6" and "D6" are both standard notation.
//
// Only text between tags is touched, and text already inside <strong>/<b> is
// left alone. A word term that merely starts a sentence and is followed by an
// ordinary lowercase word ("Wild animals are scared of you") is skipped.

const SKILLS_AND_DOMAINS = [
    'Compel', 'Delve', 'Discern', 'Endure', 'Evade', 'Hunt', 'Kill', 'Mend', 'Sneak',
    'Cursed', 'Desolate', 'Haven', 'Occult', 'Religion', 'Technology', 'Warren', 'Wild',
];
// (+ the party's Provisions track, house rule 2026-09-30)
const RESISTANCE_TERMS = ['Blood', 'Mind', 'Echo', 'Fortune', 'Supplies', 'Provisions'];
// action difficulties (2026-09-30; "Dangerous" is also a tag name, below)
const DIFFICULTIES = ['Standard', 'Risky', 'Impossible'];
// Tag names from the fork's tags pack and fvtt-heart-content's catalog (both
// spellings of Double-Barrel(l)ed occur). Multi-word names first.
const TAGS = [
    'Extreme Range', 'Double-Barrelled', 'Double-Barreled', 'Point-Blank', 'One-Shot',
    'Awkward', 'Beacon', 'Block', 'Bloodbound', 'Brutal', 'Conduit', 'Dangerous', 'Debilitating',
    'Degenerating', 'Deteriorating', 'Distressing', 'Expensive', 'Fragile', 'Harmful', 'Loud', 'Mobile',
    'Niche', 'Obscuring', 'Piercing', 'Potent', 'Ranged', 'Reload', 'Smoke', 'Spread', 'Taboo', 'Tiring',
    'Trusty', 'Unreliable', 'Volatile', 'Wyrd',
    // (2026-10-01 sweep) the catalog's Rare marker and Limited X counter,
    // "Limited 5" as one term (LIMITED below)
    'Rare', 'Limited',
];
// a fallout severity on its own: "downgrade a Major to a Minor", "Two
// Majors". Not a beat's or an ability's level ("Minor beat", "Major
// ability", "each Major advance"; LONE_SEVERITY).
const SEVERITY_WORDS = ['Minor', 'Major', 'Critical', 'Minors', 'Majors', 'Criticals'];
// single words with no other form: the game's Stress and Mastery
// (capitalised in the content since 2026-09-30). Never ordinary words, so
// they skip the sentence-start check below.
const SINGLES = ['Stress', 'Mastery'];
// the mechanics' own names, capitalised in the content when they mean the
// mechanic (2026-09-30, Luke): "a Skill of your choice", "Delve+Domain"
const GENERICS = ['Skill', 'Skills', 'Domain', 'Domains', 'Resistance', 'Resistances', 'Knack', 'Knacks'];
const WORD = [...SKILLS_AND_DOMAINS, ...RESISTANCE_TERMS].join('|');
const WORD_TERMS = [...TAGS, ...SKILLS_AND_DOMAINS, ...RESISTANCE_TERMS, ...DIFFICULTIES, ...GENERICS, ...SEVERITY_WORDS].join('|');
const SEVERITY = '(?:Minor|Major|Critical)';
const RES = `(?:${RESISTANCE_TERMS.join('|')})`;
// "Blood", "Blood and Mind", "Blood, Mind or Supplies", "Blood, Mind, or
// Supplies" (with or without the serial comma)
const LIST_SEP = '(?:,\\s*(?:and\\s+|or\\s+)?|\\s+and\\s+|\\s+or\\s+)';
const RES_LIST = `${RES}(?:${LIST_SEP}${RES})*`;
const DIE_SIZE = '[dD](?:4|6|8|10|12|20)';

// Whole phrases, each one highlight (2026-09-30 review). Signs need a
// space, "(" or the start before them, so ranges like "2-5" never match.
const SIGN = '(?<![\\w-])[+-]';
// "+2 Echo Protection", "+1 Blood and Mind Protection", "+1 Protection",
// "Blood Protection +2", "Protection 5"
const PROTECTION_UNIT = `${SIGN}\\d+\\s+(?:${RES_LIST}\\s+)?Protections?\\b`
    + `|\\b${RES}\\s+Protections?\\s+[+-]\\d+\\b|\\bProtections?\\s+\\d+\\b`;
// "D6 Stress to Mind", "+2 Stress to Blood", "D4, D6 or D10 Stress",
// "all Mind Stress", "Mind Stress", "Stress dice", "4 total Stress",
// "4 or more Stress", "Mind Stress to 0" (the quantity always in the unit)
const STRESS_UNIT = `(?:(?:${SIGN}|(?<![\\w-]))(?:\\d+(?:\\s+or\\s+(?:more|fewer|less))?|${DIE_SIZE})(?:${LIST_SEP}${DIE_SIZE})*\\s+(?:total\\s+)?(?:${RES}\\s+)?`
    + `|\\ball\\s+(?:${RES}\\s+)?|\\b${RES}\\s+|\\b)Stress(?:\\s+(?:dice|die))?(?:\\s+(?:to|from)\\s+${RES_LIST}|\\s+to\\s+(?:0|zero))?\\b`;
// "Minor Blood fallout", "Critical Fallout", "Fallouts", and lists:
// "Major or Minor Blood, Mind or Supplies Fallout"
const SEVERITY_LIST = `${SEVERITY}(?:\\s+or\\s+${SEVERITY})?`;
const FALLOUT = `\\b(?:${SEVERITY_LIST}\\s+(?:${RES_LIST}\\s+)?[Ff]allouts?|(?:${SEVERITY_LIST}\\s+)?(?:${RES_LIST}\\s+)?Fallouts?)\\b`;
// singular and plural ("Protections")
const PROTECTION = '\\bProtections?\\b';
// dice with a count, a plural, or a sign: "D6", "2D10", "D8s", "+D4"
const DICE = `(?:${SIGN}|(?<![\\w+-]))\\d*${DIE_SIZE}s?\\b`;
// a skill, domain, or resistance with what joins it: "Endure+Occult",
// "Delve+Domain", "Discern+[Domain]", "Skill+Domain", "Kill Skill",
// "Occult Domain", "Blood Resistance"
const TRAIT = `\\b(?:${WORD}|Skill|Domain)`
    + `(?:\\s*\\+\\s*(?:\\[(?:Skill|Domain)\\]|(?:${WORD}|Skill|Domain)\\b)|\\s+(?:Skill|Domain|Resistance|Knack)s?\\b)?(?!\\w)`;
const LIMITED = '\\bLimited(?:\\s+(?:\\d+|X))?\\b';
// (nor part of a name: "Critical Injury", a Major fallout; "Critical
// Success", a roll result)
const LONE_SEVERITY = `\\b(?:${SEVERITY_WORDS.join('|')})\\b`
    + `(?!(?:\\s+or\\s+${SEVERITY})?\\s+(?:beats?|abilit(?:y|ies)|advances?)\\b)(?!\\s+[A-Z])`;
const TERM_RE = new RegExp([
    PROTECTION_UNIT,
    STRESS_UNIT,
    FALLOUT,
    DICE,
    PROTECTION,
    TRAIT,
    LIMITED,
    `\\b(?:${TAGS.join('|')})\\b`,
    LONE_SEVERITY,
    `\\b(?:${[...DIFFICULTIES, ...SINGLES, ...GENERICS].join('|')})\\b`,
].join('|'), 'g');
// single capitalised words that could just be starting a sentence ("Smoke
// rises", "Wild animals"); combos like "Endure+Occult" are always terms
const WORD_START = new RegExp(`^(?:${WORD_TERMS})$`);

// Lowercase words that still mark a real game term after a sentence-start
// match ("Kill skill", "Occult domain", "Mind stress", "Delve roll").
const TERM_FOLLOWERS = new Set(['skill', 'skills', 'domain', 'domains', 'roll', 'rolls', 'check', 'checks',
    'stress', 'protection', 'fallout', 'resistance', 'resistances', 'difficulty', 'action', 'actions', 'dice', 'die',
    // "Delve equipment you create", "Desolate regions almost always"
    'equipment', 'region', 'regions']);

// Term tooltips (2026-09-30, Luke): every highlight that names a rule carries
// data-tooltip="<lang key>", and Foundry's tooltip (common/tooltip.js: Heart
// styling, plain text, the long Heart hover delay) shows that rule. Inside a
// phrase each word keeps its own rule (2026-10-01, Luke; termMarkup below):
// in "+2 Echo Protection", Echo shows Echo and Protection shows Protection.
// termTooltipKey names the single rule for a whole name (a tag's, say; the
// heartTip helper uses it). Skills, domains, and resistances reuse their
// sheet tooltips (heart.tip.*); difficulties reuse the roll prompt's. Dice
// and ability references get none (the rule is the die, or the referenced
// ability).
const lower = (list) => new Set(list.map(w => w.toLowerCase()));
const SKILL_SET = lower(['Compel', 'Delve', 'Discern', 'Endure', 'Evade', 'Hunt', 'Kill', 'Mend', 'Sneak']);
const DOMAIN_SET = lower(['Cursed', 'Desolate', 'Haven', 'Occult', 'Religion', 'Technology', 'Warren', 'Wild']);
const RESISTANCE_SET = lower(RESISTANCE_TERMS);
const DIFFICULTY_SET = lower(DIFFICULTIES);
const TAG_SET = lower(TAGS);
const GENERIC_KEYS = { skill: 'skill', domain: 'domain', resistance: 'resistance', knack: 'knack' };
// "Double-Barrelled" -> double_barreled (the catalog's slug)
const tagSlug = (name) => name.toLowerCase().replace(/barrelled/, 'barreled').replace(/[^a-z]+/g, '_');

function traitKey(word) {
    const w = word.toLowerCase();
    if (SKILL_SET.has(w)) return `heart.tip.skill.${w}`;
    if (DOMAIN_SET.has(w)) return `heart.tip.domain.${w}`;
    if (RESISTANCE_SET.has(w)) return `heart.tip.resistance.${w}`;
    const generic = GENERIC_KEYS[w.replace(/s$/, '')];
    return generic ? `heart.term.${generic}` : '';
}

// The lang key of the rule a highlighted phrase names, or '' for none
export function termTooltipKey(match) {
    const m = String(match ?? '').trim();
    if (!m) return '';
    if (/\bProtections?\b/.test(m)) return 'heart.term.protection';
    if (/\bStress\b/.test(m)) return 'heart.term.stress';
    if (/\b[Ff]allouts?\b/.test(m)) {
        const severities = new Set(m.match(/\b(?:Minor|Major|Critical)\b/g) ?? []);
        return severities.size === 1 ? `heart.term.${[...severities][0].toLowerCase()}-fallout` : 'heart.term.fallout';
    }
    if (/^[+-]?\d*[dD]\d/.test(m)) return '';
    // Skill+Domain combinations: the roll itself
    if (m.includes('+')) return 'heart.term.roll';
    // a severity on its own ("a Major", "Two Minors")
    const severity = /^(Minor|Major|Critical)s?$/.exec(m);
    if (severity) return `heart.term.${severity[1].toLowerCase()}-fallout`;
    // "Limited 5": the Limited X tag
    const w = m.toLowerCase().replace(/^limited\s+(?:\d+|x)$/, 'limited');
    // a difficulty and a tag at once: both rules
    if (w === 'dangerous') return 'heart.term.dangerous';
    if (TAG_SET.has(w)) return `heart.term.tag.${tagSlug(w)}`;
    const words = m.split(/\s+/);
    if (words.length === 2) {
        // "Kill Skill", "Occult Domain", "Blood Resistance", "Technology Knack"
        if (/^Knacks?$/.test(words[1])) return 'heart.term.knack';
        return traitKey(words[0]);
    }
    if (DIFFICULTY_SET.has(w)) return `heart.roll-prompt.difficulty-tip.${w}`;
    if (w === 'stress' || w === 'mastery') return `heart.term.${w}`;
    return traitKey(m);
}

// Only keys that exist: a missing key would show as raw text
function knownKey(key) {
    const i18n = globalThis.game?.i18n;
    return key && (typeof i18n?.has !== 'function' || i18n.has(key)) ? key : '';
}

// Phrases with a rule of their own (2026-10-01, Luke): a tag ("Extreme
// Range", "Point-Blank"), a difficulty, Stress, Mastery, and the generic
// "Skill+Domain" (the roll). Anything else is the sum of its words.
const GENERIC_ROLL_RE = /^Skill\s*\+\s*\[?Domain\]?$/;
function wholePhraseKey(match) {
    const w = match.toLowerCase().replace(/^limited\s+(?:\d+|x)$/, 'limited');
    if (w === 'dangerous' || TAG_SET.has(w) || DIFFICULTY_SET.has(w) || w === 'stress' || w === 'mastery') {
        return termTooltipKey(match);
    }
    if (GENERIC_ROLL_RE.test(match)) return 'heart.term.roll';
    return '';
}

// One word inside a highlighted phrase and its own rule. A fallout's
// severity and the word Fallout both name that severity's rule when the
// phrase has one severity ("Minor Blood Fallout"), the general rule when it
// lists several. Dice, numbers, and joining words have none.
const PART_RE = /\[?\b[A-Za-z][A-Za-z-]*\b\]?/g;
function partKey(word, severities) {
    const w = word.replace(/^\[|\]$/g, '');
    if (/^Protections?$/.test(w)) return 'heart.term.protection';
    if (w === 'Stress') return 'heart.term.stress';
    const severity = /^(Minor|Major|Critical)s?$/.exec(w);
    if (severity) return `heart.term.${severity[1].toLowerCase()}-fallout`;
    if (/^[Ff]allouts?$/.test(w)) {
        return severities.length === 1 ? `heart.term.${severities[0].toLowerCase()}-fallout` : 'heart.term.fallout';
    }
    if (/^Knacks?$/.test(w)) return 'heart.term.knack';
    return /^[A-Z]/.test(w) ? traitKey(w) : '';
}

// A highlight with its tooltips (2026-10-01, Luke: every word in a phrase
// keeps its own rule). A phrase with a rule of its own, or whose words all
// name the same rule ("Stress dice", "Minor Fallout"), is one tooltip on the
// whole highlight. Otherwise the highlight stays one red phrase and each
// word that names a rule carries its own tooltip: in "D6 Supplies Stress",
// Supplies shows the Supplies resistance and Stress shows Stress.
function termMarkup(match) {
    const whole = knownKey(wholePhraseKey(match));
    if (whole) return `<strong class="heart-term" data-tooltip="${whole}">${match}</strong>`;

    const severities = [...new Set(match.match(/\b(?:Minor|Major|Critical)\b/g) ?? [])];
    const parts = [...match.matchAll(PART_RE)]
        .map(m => ({ index: m.index, text: m[0], key: knownKey(partKey(m[0], severities)) }))
        .filter(p => p.key);
    const keys = new Set(parts.map(p => p.key));
    if (keys.size === 0) return `<strong class="heart-term">${match}</strong>`;
    if (keys.size === 1) return `<strong class="heart-term" data-tooltip="${[...keys][0]}">${match}</strong>`;

    let out = '';
    let last = 0;
    for (const p of parts) {
        out += `${match.slice(last, p.index)}<span class="heart-term-part" data-tooltip="${p.key}">${p.text}</span>`;
        last = p.index + p.text.length;
    }
    return `<strong class="heart-term">${out}${match.slice(last)}</strong>`;
}

const OPEN_STRONG = /^<(strong|b)\b/i;
const CLOSE_STRONG = /^<\/(strong|b)>/i;

function isSentenceStart(textBefore, segmentFollowsTag) {
    const trimmed = textBefore.replace(/\s+$/, '');
    if (trimmed === '') return segmentFollowsTag;
    return /[.!?:]$/.test(trimmed);
}

// Ability references (2026-09-30, Luke): the book names another ability in
// capitals ("as per HEARTSBLOOD", "your BLOODBOUND BEAST", "OATH OF FURY").
// A run of capitalised words (four letters or more in all; joining words of
// two letters or more, so "OF" and "THE" stay in) is one reference: red, in
// the ability-title face at body size (.heart-ability-ref). On only for
// ability, class, and calling text, where every capitalised run in the
// content is an ability's title; elsewhere capitals are ordinary ("AWOL", a
// book title on a trinket). A content-wide scan on 2026-09-30 found 37
// references across the core classes and no other use there.
const ABILITY_REF_RE = /(?<![\w'’-])[A-Z][A-Z'’-]+(?:\s+[A-Z][A-Z'’-]+)*(?![\w'’-])/g;
const isAbilityRef = (run) => run.replace(/[^A-Z]/g, '').length >= 4;

// Highlight the game terms in one run of plain text
function emphasizeText(text, followsTag) {
    return text.replace(TERM_RE, (match, offset, whole) => {
        if (WORD_START.test(match)) {
            const after = whole.slice(offset + match.length);
            const nextWord = /^\s+([a-z][a-z-]*)/.exec(after);
            if (nextWord && !TERM_FOLLOWERS.has(nextWord[1]) && isSentenceStart(whole.slice(0, offset), followsTag)) {
                return match;
            }
        }
        return termMarkup(match);
    });
}

// abilityRefs: also mark capitalised ability references (see above)
export function emphasizeTerms(html, { abilityRefs = false } = {}) {
    if (typeof html !== 'string' || html === '') return html ?? '';

    const parts = html.split(/(<[^>]+>)/);
    let strongDepth = 0;
    let previousWasTag = true; // start of the string counts as a block start

    return parts.map((part) => {
        if (part.startsWith('<')) {
            if (OPEN_STRONG.test(part)) strongDepth++;
            else if (CLOSE_STRONG.test(part)) strongDepth = Math.max(0, strongDepth - 1);
            previousWasTag = true;
            return part;
        }
        const followsTag = previousWasTag;
        previousWasTag = false;
        if (strongDepth > 0 || part === '') return part;
        if (!abilityRefs) return emphasizeText(part, followsTag);

        // references first, then the game terms in the text between them
        let out = '';
        let last = 0;
        for (const m of part.matchAll(ABILITY_REF_RE)) {
            if (!isAbilityRef(m[0])) continue;
            out += emphasizeText(part.slice(last, m.index), last === 0 && followsTag);
            out += `<strong class="heart-term heart-ability-ref">${m[0]}</strong>`;
            last = m.index + m[0].length;
        }
        return out + emphasizeText(part.slice(last), last === 0 && followsTag);
    }).join('');
}

// Highlight already-rendered text (description panels etc.) in place. Only
// the displayed view changes: Foundry opens an editor from the stored data,
// not from this DOM. A data flag keeps it idempotent.
export function highlightRendered(root, selector, options = {}) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.heartTerms) return;
        if (el.closest('[contenteditable="true"]')) return;
        el.innerHTML = emphasizeTerms(el.innerHTML, options);
        el.dataset.heartTerms = '1';
    });
}

// Journal pages (2026-09-29, approved sweep): highlight terms in DISPLAYED
// journal text only. The stored page HTML is never changed and edit mode is
// left alone. Page views can render just after the sheet's render hook, so
// each pass runs now and once more on the next tick. Content links and
// inline rolls keep working: Foundry handles their clicks with delegated
// listeners on the document.
function highlightJournal(root) {
    root.querySelectorAll('.journal-page-content').forEach((el) => {
        if (el.dataset.heartTerms) return;
        if (el.closest('[contenteditable="true"], .editor-container')) return;
        el.innerHTML = emphasizeTerms(el.innerHTML);
        el.dataset.heartTerms = '1';
    });
}

export function registerJournalTerms() {
    const handler = (app, html) => {
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root) return;
        highlightJournal(root);
        setTimeout(() => highlightJournal(root), 0);
    };
    Hooks.on('renderJournalSheet', handler);
    Hooks.on('renderJournalPageSheet', handler);
}
