// The Heart map's tools and buttons (2026-10-25, split out of layer.js): the
// scene control Foundry shows on a board, the same list the board's own
// toolbar (rail.js) draws, and the Help window explaining them.
import { toolsFor } from './controls.js';
import { isBoardScene, exportBoard, importBoard, restoreBackup, hasBackup, downloadBoard } from './api.js';
import { exportDialog, importDialog, binDialog, backupsDialog, askBoard, sheetDialog } from './notes.js';
import { reloadBoardLook } from './look.js';
import { bringInFromEditor, hasPublished } from './editor-link.js';
import { statsDialog, qualityDialog } from './stats.js';
import { layersDialog } from './layers.js';
import { drawnRoofPieces } from './pieces-draw.js';
import { railGroups } from './rail-groups.js';
import { gmNotesShown } from './render.js';
import { symbols } from './crowd.js';
import { heartDialogOptions } from '../../common/dialog.js';

const loc = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ''));


const ICONS = {
    move: 'fa-solid fa-up-down-left-right', reveal: 'fa-solid fa-eye', string: 'fa-solid fa-route', pin: 'fa-solid fa-thumbtack',
    // (the brush is a paintbrush everywhere, as on its palette's Draw)
    note: 'fa-solid fa-note-sticky', write: 'fa-solid fa-pencil', mark: 'fa-solid fa-paintbrush', erase: 'fa-solid fa-eraser',
    inspect: 'fa-solid fa-magnifying-glass',
};

// The Heart Map's help (Luke, 2026-10-21): each tool, then everything the
// tooltips leave out (undo, Delete, File, the views, the palette's extras,
// the keyboard). A player's own text where theirs differs.
// A help text as HTML (Luke, 2026-10-25: short paragraphs and bullets, the
// controls in bold): lines starting "- " are bullets, a blank line ends a
// paragraph, **these** are bold; escaped first
function helpHtml(text) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    let out = '';
    for (const block of String(text ?? '').split(/\n\s*\n/)) {
        let list = [];
        let para = [];
        const flush = () => {
            if (para.length) out += `<p>${para.map(inline).join('<br>')}</p>`;
            if (list.length) out += `<ul>${list.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`;
            para = [];
            list = [];
        };
        for (const line of block.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            if (t.startsWith('- ')) {
                if (para.length) flush();
                list.push(t.slice(2));
            } else {
                if (list.length) flush();
                para.push(t);
            }
        }
        flush();
    }
    return out;
}

function helpDialog(user, tools, buttons) {
    const editor = user.isGM || user.owner;
    const has = new Set(buttons.map((b) => b.name));
    const text = (name) => {
        const mine = `heart.board.help.${name}-player`;
        // (File: the GM's whole menu, else only the picture)
        const theirs = name === 'file' ? !has.has('bin') : !editor;
        return loc(theirs && game.i18n.has(mine) ? mine : `heart.board.help.${name}`);
    };
    // (each row shows the icon of the button it explains, both where two
    // buttons share it: Luke, 2026-10-23)
    const row = (icons, title, body) => `<div class="heart-board-help-row"><span class="icons">${[].concat(icons).map((i) => `<i class="${i}"></i>`).join('')}</span><div><b class="topic">${esc(title)}</b>${helpHtml(body)}</div></div>`;
    const brush = tools.some((t) => t.name === 'mark');
    const topics = [
        // (in the toolbar's order, Luke 2026-10-24)
        ['undo', ['fa-solid fa-rotate-left', 'fa-solid fa-rotate-right'], 'heart.board.help.undo-title', has.has('undo')],
        ['preview', 'fa-solid fa-user-secret', 'heart.board.tool.preview', has.has('preview')],
        ['share', 'fa-solid fa-users', 'heart.board.help.share-title', has.has('share')],
        // (the GM's two switches, 2026-10-28: both were on the bar with a
        // tooltip and nothing in the Help)
        ['gmnotes', 'fa-solid fa-user-lock', 'heart.board.help.gmnotes-title', has.has('gmnotes')],
        ['symbols', 'fa-solid fa-location-dot', 'heart.board.help.symbols-title', has.has('symbols')],
        ['file', 'fa-solid fa-folder-open', 'heart.board.tool.file', true],
        ['delete', 'fa-solid fa-delete-left', 'heart.board.help.delete-title', true],
        ['alone', 'fa-solid fa-toggle-on', 'heart.board.mark-alone', brush],
        ['doodles', 'fa-solid fa-toggle-on', 'heart.board.doodles', brush],
        ['keys', 'fa-solid fa-keyboard', 'heart.board.help.keys-title', true],
    ].filter((t) => t[3]);
    const intro = editor ? '' : `<div class="intro">${helpHtml(loc('heart.board.help.intro-player'))}</div>`;
    // (the groups other modules put on the rail, each with the help it brought:
    // the toolkit's Story group; only those this person may use)
    const modules = railGroups.list({ gm: user.isGM }).filter((g) => g.help && game.i18n.has(g.help)).map((g) => row(g.icon, loc(g.label), loc(g.help))).join('');
    const content = `<div class="heart-board-help">${intro}<h3>${esc(loc('heart.board.help.tools-head'))}</h3>${tools.map((t) => row(t.icon, t.title, text(t.name))).join('')}
        <h3>${esc(loc('heart.board.help.more-head'))}</h3>${topics.map(([name, icon, title]) => row(icon, loc(title), text(name))).join('')}${modules}</div>`;
    new Dialog({ title: loc('heart.board.help.title'), content, buttons: { close: { label: loc('Close') } }, default: 'close' }, heartDialogOptions({ classes: ['heart-board-dialog'], width: 600 })).render(true);
}

// whether the GM's doing is shown live (File's switch)
function liveShareOn() {
    try {
        return game.settings.get('heart', 'boardLiveShare') !== false;
    } catch {
        return true;
    }
}

// The Heart Map's tools and buttons for this user (Foundry's scene controls
// and the Heart Map's own toolbar, rail.js, both show these): { tools,
// buttons, list }
export function boardTools() {
    const gm = game.user.isGM;
    const layer = canvas.heartBoard;
    const scene = canvas.scene;
    const user = layer?.user ?? { id: game.user.id, isGM: gm };
    // (a players' board's owners have the GM's names for the tools they share)
    const tool = (name, extra = {}) => ({ name, icon: ICONS[name] ?? extra.icon, title: loc(`heart.board.tool.${user.isGM || user.owner ? name : `${name}-player`}`), ...extra });
    // (a button's name is the same for everyone: a player's Undo and Redo
    // had looked for player names that don't exist, and showed no tooltip;
    // Luke, 2026-10-23)
    const button = (name, icon, onClick) => ({ name, icon, title: loc(`heart.board.tool.${name}`), button: true, onClick });
    const preview = { name: 'preview', icon: 'fa-solid fa-user-secret', title: loc('heart.board.tool.preview'), toggle: true, active: Boolean(layer?.preview), onClick: (on) => layer?.setPreview(on) };
    const tools = toolsFor(user).map((t) => tool(t));
    // a picture of the map as this user sees it (everyone's)
    const snapshot = { name: 'snapshot', icon: 'fa-solid fa-download', title: loc('heart.board.tool.snapshot'), button: true, onClick: () => layer?.saveSnapshot() };
    // (everyone's, under File: the board's statistics, and its quality in one
    // click; Luke 2026-10-25)
    const statsB = button('stats', 'fa-solid fa-gauge-high', () => statsDialog());
    const qualityB = button('quality', 'fa-solid fa-sliders', () => qualityDialog());
    // the tools' long help, in a window of its own (the tooltips are short)
    const help = { name: 'help', icon: 'fa-solid fa-circle-question', title: loc('heart.board.tool.help'), button: true, onClick: () => helpDialog(user, tools, buttons) };
    // (each user's own edits; Luke 2026-10-06)
    const undoB = button('undo', 'fa-solid fa-rotate-left', () => layer?.history('undo'));
    const redoB = button('redo', 'fa-solid fa-rotate-right', () => layer?.history('redo'));
    // (the selection made public, or its maker's again: everyone's, Luke 2026-10-24)
    const shareB = button('share', 'fa-solid fa-users', () => layer?.share());
    // (Luke, 2026-10-24: one order for everyone, the GM's own where they
    // fall: Look, Move, Brush, Note, Write, String, Pin, Erase, Undo, Redo,
    // Player view, Reveal, Public, File (the picture and the GM's own),
    // Help; the players' strings alone gone, Luke 2026-10-25)
    const fileGM = gm && !layer?.preview ? [
        // (Luke, 2026-10-21: a place invented at the table; the selected
        // cards put together afresh, Shift+R)
        button('place', 'fa-solid fa-map-pin', () => layer?.newPlace()),
        button('reshuffle', 'fa-solid fa-shuffle', () => layer?.reshuffle()),
        // (Luke, 2026-10-24: pages added or taken away on any side)
        button('sheet', 'fa-solid fa-expand', () => sheetDialog(scene)),
        // (a baked map's overlays, roofs, and NPC fog: Luke 2026-10-25)
        // (and a board of drawn roof pieces with no baked map under it: its
        // roofs lift here too, as the window itself already allowed)
        ...(layer?.backdrop?.on || drawnRoofPieces().length ? [button('layers', 'fa-solid fa-layer-group', () => layersDialog(scene, layer?.backdrop))] : []),
        button('bin', 'fa-solid fa-box-archive', () => binDialog(scene)),
        button('history', 'fa-solid fa-clock-rotate-left', () => backupsDialog(scene)),
        // (Luke, 2026-10-21: the board saved as a file, Import loads it back)
        button('download', 'fa-solid fa-file-arrow-down', () => downloadBoard(scene)),
        button('export', 'fa-solid fa-file-export', () => exportDialog(exportBoard(scene))),
        button('import', 'fa-solid fa-file-import', async () => {
            const text = await importDialog();
            if (!text) return;
            // (asked first, naming the scene it replaces: Luke 2026-10-25, the
            // map safety fixes)
            const ok = await askBoard({ title: loc('heart.board.import-confirm-title', { scene: scene.name }), content: loc('heart.board.import-confirm', { scene: scene.name }), yes: loc('heart.board.ask.replace-it'), no: loc('heart.board.ask.keep-this') });
            if (ok) await importBoard(scene, text);
        }),
        button('restore', 'fa-solid fa-right-left', async () => {
            if (!hasBackup(scene)) return ui.notifications.info(loc('heart.board.no-backup'));
            const ok = await askBoard({ title: loc('heart.board.tool.restore'), content: loc('heart.board.restore-confirm'), yes: loc('heart.board.ask.swap-in'), no: loc('heart.board.ask.keep-this') });
            if (ok) await restoreBackup(scene);
        }),
        // (Map Dreamer's map, on a board whose map it has published: one step, asked first
        // only when this scene has no record of what Map Dreamer drew; editor-link.js, 2026-10-28)
        ...(hasPublished(scene) ? [{ name: 'editor', icon: 'fa-solid fa-cloud-arrow-down', title: loc('heart.board.editor-tool'), button: true, onClick: () => bringInFromEditor(scene) }] : []),
        // (the GM's doing shown to the table as it happens, or not: Luke 2026-10-25)
        { name: 'live', icon: 'fa-solid fa-tower-broadcast', title: loc('heart.board.tool.live'), toggle: true, active: liveShareOn(), onClick: async (on) => game.settings.set('heart', 'boardLiveShare', Boolean(on)) },
        button('reload', 'fa-solid fa-rotate', async () => {
            await reloadBoardLook();
            await layer?.refresh();
            ui.notifications.info(loc('heart.board.reloaded'));
        }),
    ] : [];
    // (Player view: the players' own tools, and the way back; no Undo there)
    const undoing = !(gm && layer?.preview);
    // (the GM's own notes shown or hidden on this client: Plenty finish item 2;
    // never in Player view, which hides them anyway)
    const gmNotesB = gm && !layer?.preview ? [{ name: 'gmnotes', icon: 'fa-solid fa-user-lock', title: loc('heart.board.tool.gmnotes'), toggle: true, active: gmNotesShown(), onClick: async (on) => game.settings.set('heart', 'boardGmNotes', Boolean(on)) }] : [];
    // (symbol detail, the GM's way of finding people through the roofs: on the
    // bar beside the GM notes as well as Shift+Y and Setup, Luke 2026-10-28,
    // "leave nothing built but not in the app"; the state is the client's)
    const symbolsB = gm && !layer?.preview ? [{ name: 'symbols', icon: 'fa-solid fa-location-dot', title: loc('heart.board.tool.symbols'), toggle: true, active: Boolean(symbols.get()), onClick: async (on) => symbols.set(Boolean(on)) }] : [];
    const buttons = [...(undoing ? [undoB, redoB] : []), ...(gm ? [preview] : []), ...gmNotesB, ...symbolsB, shareB, snapshot, statsB, qualityB, ...fileGM, help];
    const reveal = tools.filter((t) => t.name === 'reveal');
    const before = tools.filter((t) => t.name !== 'reveal');
    const list = [...before, ...(undoing ? [undoB, redoB] : []), ...(gm ? [preview] : []), ...reveal, ...gmNotesB, ...symbolsB, shareB, snapshot, statsB, qualityB, ...fileGM, help];
    return { tools, buttons, list };
}

export function boardControls(controls) {
    if (!isBoardScene(canvas?.scene)) return;
    const { tools, list } = boardTools();
    controls.push({
        name: 'heartBoard',
        title: loc('heart.board.control'),
        layer: 'heartBoard',
        icon: 'fa-solid fa-thumbtack',
        visible: true,
        activeTool: tools[0].name,
        tools: list,
    });
}
