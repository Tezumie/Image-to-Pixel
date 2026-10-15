// Left panel: Files (the batch), Presets (live thumbnails) and Palettes.

import { h, render } from './dom.js';
import { menu } from './ui.js';
import { icon } from './icons.js';
import { PRESETS } from '../core/presets.js';
import { PALETTES } from '../core/palette/builtin.js';
import { mergeSettings, defaultSettings } from '../core/settings.js';

export function createLibrary(app) {
  let tab = 'files';
  const tabBtn = (id, label, ic) => h('button', { type: 'button', role: 'tab', title: label, 'aria-selected': String(id === tab), html: `${icon(ic)}<span>${label}</span>`, onclick: () => setTab(id) });
  const tFiles = tabBtn('files', 'Files', 'files');
  const tPresets = tabBtn('presets', 'Presets', 'presets');
  const tPalettes = tabBtn('palettes', 'Palettes', 'palette');
  const filesCount = h('span.count', {});
  tFiles.append(filesCount);
  const tabs = h('div.itp-seg', { role: 'tablist', 'aria-label': 'Library' }, tFiles, tPresets, tPalettes);

  const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search the library' });
  const searchBox = h('div.itp-search', {}, h('span', { html: icon('search') }), search);
  search.addEventListener('input', () => renderTab());

  const body = h('div.itp-panel-body', {});
  const el = h('aside.itp-lib', { 'aria-label': 'Library' }, h('div.itp-panel-head', {}, tabs), searchBox, body);

  function setTab(t) {
    tab = t;
    for (const [b, id] of [[tFiles, 'files'], [tPresets, 'presets'], [tPalettes, 'palettes']]) b.setAttribute('aria-selected', String(id === t));
    search.value = '';
    renderTab();
    if (t === 'presets' && !thumbs.size) refreshThumbs();
  }
  const q = () => search.value.trim().toLowerCase();

  // ---- files
  function fileMenu(it, anchor) {
    const i = app.items.indexOf(it), many = app.items.length > 1;
    menu(anchor, [
      it.own
        ? { label: 'Use shared settings', sub: 'Drop this file\'s own settings', icon: 'link', onClick: () => app.setOwn(it, false) }
        : { label: 'Give it its own settings', sub: 'Edits stop affecting other files', icon: 'unlink', disabled: !many, onClick: () => app.setOwn(it, true) },
      'sep',
      { label: 'Copy settings', icon: 'copy', onClick: () => app.copySettings(it) },
      { label: 'Paste settings', sub: app.clipboard ? 'Gives this file its own settings' : 'Copy settings from a file first', icon: 'clipboard', disabled: !app.clipboard, onClick: () => app.pasteSettings(it) },
      { label: 'Apply these settings to all files', icon: 'layers', disabled: !many, onClick: () => app.applyToAll(it) },
      'sep',
      { label: 'Rename', sub: 'Exports are named after it', icon: 'rename', kbd: 'F2', onClick: () => app.startRename(it) },
      { label: 'Duplicate', sub: 'A copy with its own settings, to compare looks', icon: 'copy', onClick: () => app.duplicate(it) },
      { label: 'Move up', icon: 'arrowUp', kbd: 'Alt Shift ↑', disabled: i <= 0, onClick: () => app.move(it, -1) },
      { label: 'Move down', icon: 'arrowDown', kbd: 'Alt Shift ↓', disabled: i >= app.items.length - 1, onClick: () => app.move(it, 1) },
      'sep',
      { label: 'Remove', icon: 'trash', kbd: 'Del', onClick: () => app.removeItem(it) },
    ], { align: 'start' });
  }

  function renderFiles() {
    const items = app.items.filter(i => !q() || i.name.toLowerCase().includes(q()));
    const list = h('ul.itp-files', { 'aria-label': 'Files' });
    for (const it of items) {
      const more = h('button.itp-btn.small.icon', { type: 'button', 'aria-label': `Options for ${it.name}`, 'aria-haspopup': 'menu', title: 'Settings, duplicate, order', html: icon('more'), onclick: e => { e.stopPropagation(); fileMenu(it, more); } });
      const sub = it.type === 'video' ? `Video, ${fmtTime(it.duration)}` : `${it.width} × ${it.height}`;
      const row = h('li.itp-file-row', { tabindex: '0', 'aria-current': String(app.current === it), 'data-own': it.own ? 'true' : null },
        h('img.thumb', { src: it.thumb || '', alt: '' }),
        h('div', { style: { minWidth: 0 } },
          h('div.title', { text: it.name }),
          h('div.sub', {}, sub, it.own ? h('span.itp-own', { title: 'This file has its own settings', html: `${icon('unlink')}<span>Own</span>` }) : null)),
        h('div.actions', {}, more,
          h('button.itp-btn.small.icon.danger', { type: 'button', 'aria-label': `Remove ${it.name}`, title: 'Remove', html: icon('x'), onclick: e => { e.stopPropagation(); app.removeItem(it); } })));
      row.addEventListener('click', () => app.select(it));
      row.addEventListener('dblclick', e => { if (e.target.closest('.title')) app.startRename(it); });
      row.addEventListener('contextmenu', e => { e.preventDefault(); app.select(it); fileMenu(it, more); });
      row.addEventListener('keydown', e => {
        if (e.target !== row) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.select(it); }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); app.removeItem(it); }
        if (e.altKey) return;   // Alt+arrows are global shortcuts (next file, move file)
        if (e.key === 'ArrowDown') { e.preventDefault(); row.nextElementSibling?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); row.previousElementSibling?.focus(); }
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); fileMenu(it, more); }
      });
      list.append(row);
    }
    const nOwn = app.items.filter(i => i.own).length;
    const summary = !app.items.length ? 'No files yet'
      : app.items.length === 1 ? '1 file'
      : nOwn ? `${app.items.length} files, ${nOwn} with ${nOwn === 1 ? 'its' : 'their'} own settings`
      : `${app.items.length} files, shared settings`;
    const head = h('div.itp-group', {}, h('span', { text: summary }),
      app.items.length > 1 ? h('button.itp-link', { type: 'button', text: 'Clear', onclick: () => app.clearItems() }) : null);
    const add = h('div', { style: { padding: '4px 12px 12px', display: 'flex', gap: '6px' } },
      h('button.itp-btn.outline.small', { type: 'button', html: `${icon('plus')}<span>Add files</span>`, onclick: () => app.openFiles() }),
      h('button.itp-btn.small', { type: 'button', html: `${icon('clipboard')}<span>Paste</span>`, title: 'Paste an image from the clipboard (Ctrl+V)', onclick: () => app.pasteFromClipboard() }));
    const saved = app.savedWorkspace && app.savedWorkspace();
    const savedNote = saved ? h('div.itp-group.itp-saved', {},
      h('span', { text: `Saved in this browser: ${saved.count} file${saved.count === 1 ? '' : 's'}`, title: 'Kept in this browser\'s storage, never uploaded. Clearing the site\'s data also removes it.' }),
      h('button.itp-link', { type: 'button', text: 'Forget', title: 'Remove the saved files from this browser', onclick: () => app.forgetWorkspace() })) : null;
    render(body, head, list, add, savedNote, h('div.itp-group', {}, h('span', { text: 'Drop images or videos anywhere in the window. Files share one set of settings unless you give one its own (⋯ menu or right-click). Save keeps them in this browser for next time.' })));
  }

  // ---- presets (thumbnails rendered from the current image)
  const thumbs = new Map();   // preset id → canvas
  let thumbGen = 0;
  function renderPresets() {
    const cur = app.store.settings;
    const list = PRESETS.filter(p => !q() || (p.name + p.description).toLowerCase().includes(q()));
    const grid = h('div.itp-presets', {});
    for (const p of list) {
      const active = app.activePreset === p.id;
      const pic = thumbs.get(p.id) || h('div.ph', {});
      const b = h('button.itp-preset', { type: 'button', 'aria-pressed': String(active), title: p.description, onclick: () => app.applyPreset(p) },
        pic, h('span.t', { text: p.name }), h('span.d', { text: p.description }));
      grid.append(b);
    }
    render(body, h('div.itp-group', {}, h('span', { text: 'Presets replace the current settings. Undo with Ctrl+Z.' })), grid);
    void cur;
  }
  async function refreshThumbs() {
    const gen = ++thumbGen;
    const item = app.current;
    if (!item || !app.engine) return;
    for (const p of PRESETS) {
      if (gen !== thumbGen) return;
      const s = mergeSettings(defaultSettings(), p.settings);
      // small, fast previews: cap the width and skip slow-on-CPU diffusion sizes
      s.size = { ...s.size, mode: 'width', width: Math.min(s.size.width, 72), height: 0 };
      try {
        const r = await app.engine.process(item.source, s);
        if (gen !== thumbGen) return;
        const c = r.toCanvas(1);
        thumbs.set(p.id, c);
        if (tab === 'presets') renderPresets();
      } catch { /* ignore a failed thumbnail */ }
    }
  }

  // ---- palettes
  function palRow(p, active, removable) {
    const strip = h('div.itp-strip', {}, ...p.colors.slice(0, 64).map(c => h('i', { style: { background: c.startsWith('#') ? c : '#' + c } })));
    const row = h('li.itp-pal', { tabindex: '0', role: 'button', 'aria-pressed': String(active) },
      h('div.row', {}, h('span', { text: p.name }), h('span.n', { text: String(p.colors.length), title: p.author ? `by ${p.author}` : null })), strip);
    const pick = () => app.usePalette(p);
    row.addEventListener('click', pick);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } if (removable && (e.key === 'Delete')) app.deletePalette(p); });
    if (removable) {
      const del = h('button.itp-btn.small.icon.danger', { type: 'button', 'aria-label': `Delete ${p.name}`, title: 'Delete', html: icon('trash'), onclick: e => { e.stopPropagation(); app.deletePalette(p); } });
      row.firstChild.append(del);
    }
    return row;
  }
  function renderPalettes() {
    const s = app.store.settings.palette;
    const match = p => !q() || (p.name + ' ' + (p.author || '')).toLowerCase().includes(q()) || String(p.colors.length) === q();
    const mine = app.userPalettes.filter(match);
    const built = PALETTES.filter(match);
    const actions = h('div', { style: { padding: '0 12px 4px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      h('button.itp-btn.outline.small', { type: 'button', html: `${icon('upload')}<span>Import file</span>`, onclick: () => app.importPalette() }),
      h('button.itp-btn.small', { type: 'button', html: `${icon('palette')}<span>From Lospec</span>`, onclick: () => app.lospecDialog() }));
    const yours = mine.length ? [h('div.itp-group', {}, h('span', { text: 'Your palettes' }), h('span.itp-badge', { text: String(mine.length) })),
      h('ul.itp-pal-list', {}, ...mine.map(p => palRow(p, s.source === 'custom' && s.name === p.name, true)))] : [];
    render(body, actions, ...yours,
      h('div.itp-group', {}, h('span', { text: 'Built-in' }), h('span.itp-badge', { text: String(built.length) })),
      h('ul.itp-pal-list', {}, ...built.map(p => palRow({ ...p, colors: p.colors.map(c => '#' + c) }, s.source === 'builtin' && s.id === p.id, false))));
  }

  function renderTab() {
    filesCount.textContent = app.items.length ? String(app.items.length) : '';
    if (tab === 'files') renderFiles();
    else if (tab === 'presets') renderPresets();
    else renderPalettes();
  }

  return {
    el,
    refresh: renderTab,
    setTab,
    /** Focus a file's row (after it moved). */
    focusFile(item) { if (tab === 'files') body.querySelectorAll('.itp-file-row')[app.items.indexOf(item)]?.focus(); },
    /** The current image changed: rebuild preset thumbnails. */
    sourceChanged() { thumbs.clear(); thumbGen++; if (tab === 'presets') { renderTab(); refreshThumbs(); } },
    get tab() { return tab; },
  };
}

export function fmtTime(t = 0) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
