// Highlight Heart game terms inside rendered text (2026-09-29).
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
const RESISTANCE_TERMS = ['Blood', 'Mind', 'Echo', 'Fortune', 'Supplies'];
// Tag names from the fork's tags pack and fvtt-heart-content's catalog (both
// spellings of Double-Barrel(l)ed occur). Multi-word names first.
const TAGS = [
    'Extreme Range', 'Double-Barrelled', 'Double-Barreled', 'Point-Blank', 'One-Shot',
    'Awkward', 'Beacon', 'Block', 'Bloodbound', 'Brutal', 'Conduit', 'Dangerous', 'Debilitating',
    'Degenerating', 'Deteriorating', 'Distressing', 'Expensive', 'Fragile', 'Harmful', 'Loud', 'Mobile',
    'Niche', 'Obscuring', 'Piercing', 'Potent', 'Ranged', 'Reload', 'Smoke', 'Spread', 'Taboo', 'Tiring',
    'Trusty', 'Unreliable', 'Volatile', 'Wyrd',
];
const WORD = [...SKILLS_AND_DOMAINS, ...RESISTANCE_TERMS].join('|');
const WORD_TERMS = [...TAGS, ...SKILLS_AND_DOMAINS, ...RESISTANCE_TERMS].join('|');
// "Minor Blood fallout" (book style) or any capitalised "Fallout" with its
// optional severity / resistance ("Mind Fallout", "Critical Fallout")
const SEVERITY = '(?:Minor|Major|Critical)';
const RES = `(?:${RESISTANCE_TERMS.join('|')})`;
const FALLOUT = `${SEVERITY}\\s+(?:${RES}\\s+)?[Ff]allout|(?:${SEVERITY}\\s+)?(?:${RES}\\s+)?Fallout`;
const PROTECTION = 'Protection';
const DIE = '[dD](?:4|6|8|10|12|20)';
const TERM_RE = new RegExp(`\\b(?:${FALLOUT}|${DIE}|${PROTECTION}|(?:${WORD})(?:\\s*\\+\\s*(?:${WORD}))?|${TAGS.join('|')})\\b`, 'g');
// single capitalised words that could just be starting a sentence ("Smoke
// rises", "Wild animals"); combos like "Endure+Occult" are always terms
const WORD_START = new RegExp(`^(?:${WORD_TERMS})$`);

// Lowercase words that still mark a real game term after a sentence-start
// match ("Kill skill", "Occult domain", "Mind stress", "Delve roll").
const TERM_FOLLOWERS = new Set(['skill', 'skills', 'domain', 'domains', 'roll', 'rolls', 'check', 'checks',
    'stress', 'protection', 'fallout', 'resistance', 'resistances']);

const OPEN_STRONG = /^<(strong|b)\b/i;
const CLOSE_STRONG = /^<\/(strong|b)>/i;

function isSentenceStart(textBefore, segmentFollowsTag) {
    const trimmed = textBefore.replace(/\s+$/, '');
    if (trimmed === '') return segmentFollowsTag;
    return /[.!?:]$/.test(trimmed);
}

export function emphasizeTerms(html) {
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

        return part.replace(TERM_RE, (match, offset, whole) => {
            if (WORD_START.test(match)) {
                const after = whole.slice(offset + match.length);
                const nextWord = /^\s+([a-z][a-z-]*)/.exec(after);
                if (nextWord && !TERM_FOLLOWERS.has(nextWord[1]) && isSentenceStart(whole.slice(0, offset), followsTag)) {
                    return match;
                }
            }
            return `<strong class="heart-term">${match}</strong>`;
        });
    }).join('');
}

// Highlight already-rendered text (description panels etc.) in place. Only
// the displayed view changes: Foundry opens an editor from the stored data,
// not from this DOM. A data flag keeps it idempotent.
export function highlightRendered(root, selector) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.heartTerms) return;
        if (el.closest('[contenteditable="true"]')) return;
        el.innerHTML = emphasizeTerms(el.innerHTML);
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
