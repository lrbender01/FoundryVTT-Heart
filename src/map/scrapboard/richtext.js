// A card's writing edited a stretch at a time (Luke, 2026-10-25): bold,
// italic, underlined, or struck through over what is selected, and over what
// is typed next, in a box that shows it so; the card keeps it as `fmt`
// (model.js: [[start, end, flags]] over its text). One copy for Foundry's
// note window and the map editor's popover (the editor inlines it: no
// Foundry globals here).
import { fmtFlags, fmtRanges, FMT_FLAGS } from './model.js';

const RICH_TAG = { b: 'b', i: 'i', u: 'u', s: 's' };
const RICH_CMD = { b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough' };
const richEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const richOrder = (f) => [...FMT_FLAGS].filter((c) => f.includes(c)).join('');

// The box's HTML for `text` set by `fmt`; `all`: flags over all of it (a
// card set bold, italic, underlined, or struck through whole, before)
export function richHtml(text, fmt = [], all = '') {
    const t = String(text ?? '');
    const F = fmtFlags(fmt, t.length).map((f) => richOrder(f + all));
    let out = '';
    for (let i = 0; i < t.length;) {
        let j = i + 1;
        while (j < t.length && F[j] === F[i]) j++;
        let h = richEsc(t.slice(i, j)).replace(/\n/g, '<br>');
        for (const c of FMT_FLAGS) if (F[i].includes(c)) h = `<${RICH_TAG[c]}>${h}</${RICH_TAG[c]}>`;
        out += h;
        i = j;
    }
    // (a last empty line shows only with a break after it)
    return t.endsWith('\n') ? `${out}<br>` : out;
}

// The box's writing as { text, fmt }: its letters and how each is set (the
// tags the browser writes, or their styles), lines from its breaks and
// blocks; trimmed, as a card's writing is
export function readRich(el) {
    let text = '';
    const flags = [];
    const walk = (node, f) => {
        if (node.nodeType === 3) {
            const s = String(node.nodeValue ?? '').replace(/\u00a0/g, ' ');
            text += s;
            for (let i = 0; i < s.length; i++) flags.push(f);
            return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        if (tag === 'BR') {
            text += '\n';
            flags.push('');
            return;
        }
        const st = node.style ?? {};
        const deco = `${st.textDecoration ?? ''} ${st.textDecorationLine ?? ''}`;
        let g = f;
        if (tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) g += 'b';
        if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') g += 'i';
        if (tag === 'U' || deco.includes('underline')) g += 'u';
        if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || deco.includes('line-through')) g += 's';
        // (a line the browser made a block of starts on a line of its own)
        if ((tag === 'DIV' || tag === 'P') && text.length && !text.endsWith('\n')) {
            text += '\n';
            flags.push('');
        }
        for (const c of node.childNodes) walk(c, g);
    };
    for (const c of el.childNodes) walk(c, '');
    let a = 0;
    let b = text.length;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    return { text: text.slice(a, b), fmt: fmtRanges(flags.slice(a, b).map(richOrder)) };
}

// The flags on where the caret is (what is typed next takes)
function richState(doc = document) {
    return [...FMT_FLAGS].filter((c) => {
        try {
            return doc.queryCommandState(RICH_CMD[c]);
        } catch {
            return false;
        }
    }).join('');
}

// One flag switched over the selection (or, with none, for what is typed next)
function richToggle(flag, doc = document) {
    if (!RICH_CMD[flag]) return;
    try {
        doc.execCommand('styleWithCSS', false, false);
    } catch {
        // (older browsers: tags either way)
    }
    doc.execCommand(RICH_CMD[flag], false, null);
}

// The box made ready: its buttons ([data-rich-flag]) switch a flag and light
// up for the caret's, Ctrl+B, I, U switch theirs, a paste comes in as plain
// writing; `changed()` after each change. Returns a function that lights the
// buttons again.
export function wireRich(el, root, changed = () => {}) {
    const doc = el.ownerDocument ?? document;
    const light = () => {
        const on = doc.activeElement === el || el.contains(doc.getSelection?.()?.anchorNode ?? null) ? richState(doc) : '';
        for (const b of root.querySelectorAll('[data-rich-flag]')) b.classList.toggle('on', on.includes(b.dataset.richFlag));
    };
    for (const b of root.querySelectorAll('[data-rich-flag]')) {
        // (pressed, the selection kept in the box)
        b.addEventListener('mousedown', (ev) => ev.preventDefault());
        b.addEventListener('click', (ev) => {
            ev.preventDefault();
            el.focus();
            richToggle(b.dataset.richFlag, doc);
            light();
            changed();
        });
    }
    el.addEventListener('keydown', (ev) => {
        if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
        const flag = { b: 'b', i: 'i', u: 'u' }[String(ev.key).toLowerCase()];
        if (!flag) return;
        ev.preventDefault();
        richToggle(flag, doc);
        light();
        changed();
    });
    el.addEventListener('paste', (ev) => {
        ev.preventDefault();
        const t = ev.clipboardData?.getData('text/plain') ?? '';
        doc.execCommand('insertText', false, t);
    });
    el.addEventListener('input', () => {
        light();
        changed();
    });
    for (const k of ['keyup', 'mouseup', 'focus']) el.addEventListener(k, light);
    // (let go with the box)
    const onSel = () => (el.isConnected ? light() : doc.removeEventListener('selectionchange', onSel));
    doc.addEventListener('selectionchange', onSel);
    light();
    return light;
}
