// The editor UI. mountEditor(element) builds the whole app inside `element`.
// The core engine (lib/core) has no idea this file exists.

import { createPixelator } from '../core/engine.js';
import { defaultSettings, decodeSettings, encodeSettings, settingsToJSON, settingsFromJSON, mergeSettings } from '../core/settings.js';
import { parsePalette, toGPL, toHexFile, toPaletteJSON } from '../core/palette/parse.js';
import { fetchLospec } from '../core/palette/lospec.js';
import { detectGrid } from '../core/export/scale.js';
import { toHex } from '../core/color.js';
import { estimateFps, videoReady, seekTo, sniffVideoCodec } from '../core/video/frames.js';
import { downloadBlob } from '../core/export/canvas.js';
import { PRESETS } from '../core/presets.js';
import { h, render, pickFiles } from './dom.js';
import { icon } from './icons.js';
import { createStore } from './store.js';
import { createStage } from './stage.js';
import { createInspector } from './inspector.js';
import { createLibrary, fmtTime } from './library.js';
import { createExporter } from './exporter.js';
import { toast, menu, closeMenu, dialog } from './ui.js';
import { SAMPLES, loadSample, sampleURL } from './samples.js';
import * as persist from './persist.js';

const IMAGE_TYPES = /^image\//;
const VIDEO_TYPES = /^video\//;
const PALETTE_EXT = /\.(gpl|hex|pal|txt|json)$/i;

/**
 * Mount the editor.
 * @param {HTMLElement} root
 * @param {{ settings?: object, persist?: boolean, samples?: boolean, homeHref?: string, docsHref?: string }} [options]
 */
export async function mountEditor(root, options = {}) {
  const usePersist = options.persist !== false;
  const narrow = () => matchMedia('(max-width: 900px)').matches;

  // ---- initial settings: share link > saved > defaults
  let initial = options.settings || (usePersist && persist.load('settings', null)) || defaultSettings();
  if (/[#&]s=/.test(location.hash)) {
    try { initial = decodeSettings(location.hash); } catch { toast('That share link could not be read; using your last settings', { kind: 'error' }); }
  }
  const store = createStore(initial);

  const app = {
    store,
    engine: null,
    items: [],
    current: null,
    result: null,
    exporting: false,
    activePreset: null,
    userPalettes: usePersist ? persist.load('palettes', []) : [],
    /** Settings shared by every file that doesn't have its own. */
    shared: store.settings,
    /** Settings copied with "Copy settings", ready to paste onto another file. */
    clipboard: null,
    videoSupport: { mp4: false, webm: false },
    toast: (m, o) => toast(m, o),
  };

  // ================================================================ layout
  const stage = createStage({ onPick: pickAt, onViewChange: () => updateZoomLabel() });
  const inspector = createInspector(app);
  const library = createLibrary(app);
  const exporter = createExporter(app);

  const btn = (ic, label, onclick, extra = {}) => h('button.itp-btn.icon', { type: 'button', 'aria-label': label, title: label, html: icon(ic), onclick, ...extra });

  const fileName = h('span.name', { text: 'No image' });
  const fileMeta = h('span.meta.num', {});
  const undoBtn = btn('undo', 'Undo (Ctrl+Z)', () => store.undo());
  const redoBtn = btn('redo', 'Redo (Ctrl+Shift+Z)', () => store.redo());
  const compareBtn = btn('compare', 'Compare with original (C)', () => toggleCompare(), { 'aria-pressed': 'false' });
  const gridBtn = btn('grid', 'Pixel grid (G)', () => toggleGrid(), { 'aria-pressed': 'false' });
  const zoomBtn = h('button.itp-btn.itp-zoom.num', { type: 'button', 'aria-label': 'Zoom', 'aria-haspopup': 'menu', html: `<span>Fit</span>${icon('chevronDown')}`, onclick: e => zoomMenu(e.currentTarget) });
  const themeBtn = btn('moon', 'Toggle theme (T)', () => toggleTheme());
  const libBtn = btn('sidebarLeft', 'Toggle library (\\)', () => togglePanel('lib'));
  const inspBtn = btn('sidebarRight', 'Toggle inspector (/)', () => togglePanel('insp'));
  const helpBtn = btn('keyboard', 'Keyboard shortcuts (?)', () => showHelp());
  const exportBtn = h('button.itp-btn.primary', { type: 'button', 'aria-haspopup': 'menu', html: `${icon('download')}<span>Export</span>`, onclick: e => exportMenu(e.currentTarget) });
  const brand = h('a.itp-brand', { href: options.homeHref || '#', title: 'Image-to-Pixel' }, h('span.itp-mark', { 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, () => h('i'))), h('span.hide-sm', { text: 'Image-to-Pixel' }));
  if (!options.homeHref) brand.addEventListener('click', e => e.preventDefault());

  const top = h('header.itp-top', {},
    libBtn, brand, h('span.sep.hide-sm'),
    h('div.itp-file', {}, fileName, fileMeta),
    h('div.spacer'),
    h('span.hide-sm.contents', {}, undoBtn, redoBtn, h('span.sep')),
    compareBtn, gridBtn, zoomBtn,
    h('span.sep.hide-sm'), h('span.hide-sm.contents', {}, themeBtn, helpBtn), inspBtn,
    h('span', { style: { width: '6px' } }), exportBtn);

  // stage extras
  const sampleButtons = options.samples === false ? null : h('div.samples', {}, ...SAMPLES.map(s => h('button', { type: 'button', title: `Try "${s.name}"`, 'aria-label': `Open sample: ${s.name}`, onclick: () => openSample(s) }, h('img', { src: sampleURL(s), alt: '' }))));
  const empty = h('div.itp-empty', {}, h('div.itp-drop', {},
    h('h2', { text: 'Drop an image or a video' }),
    h('p', { text: 'PNG, JPG, WebP, GIF, SVG, MP4 or WebM. Add several files to process them as a batch. You can also paste with Ctrl+V.' }),
    h('div.actions', {},
      h('button.itp-btn.primary', { type: 'button', html: `${icon('upload')}<span>Choose files</span>`, onclick: () => openFiles() }),
      h('button.itp-btn.outline', { type: 'button', html: `${icon('clipboard')}<span>Paste</span>`, onclick: () => pasteFromClipboard() })),
    sampleButtons ? h('p', { style: { fontSize: 'var(--fs-xs)', color: 'var(--faint)' }, text: 'Or start from a sample' }) : null,
    sampleButtons));
  const status = h('div.itp-float.bl', { 'aria-live': 'polite' });
  const busy = h('div.itp-busy.itp-float', { hidden: true, style: { padding: '6px 10px', alignItems: 'center', gap: '8px', fontSize: 'var(--fs-xs)', color: 'var(--muted)', display: 'flex' } }, h('span.itp-spinner'), h('span', { text: 'Rendering' }));
  const viewTools = h('div.itp-float.br', {},
    btn('zoomOut', 'Zoom out (-)', () => stage.zoomOut()),
    btn('fit', 'Fit to view (F)', () => stage.fit()),
    btn('zoomIn', 'Zoom in (+)', () => stage.zoomIn()));
  stage.el.append(empty, status, busy, viewTools);

  // transport
  const playBtn = btn('play', 'Play (Space)', () => togglePlay());
  const timeLabel = h('span.itp-time', {});
  const scrub = h('input.itp-scrub', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Video position' });
  const fpsLabel = h('span.muted.num', { style: { fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' } });
  const transport = h('div.itp-transport', { role: 'group', 'aria-label': 'Video' },
    btn('stepBack', 'Previous frame (,)', () => stepFrame(-1)), playBtn, btn('stepForward', 'Next frame (.)', () => stepFrame(1)),
    timeLabel, scrub, fpsLabel);
  const stageWrap = h('main.itp-stage', { 'data-video': 'false' }, stage.el, transport);

  // on narrow screens the library is a drawer: a tap on the canvas closes it
  stageWrap.addEventListener('pointerdown', () => { if (narrow() && shell.dataset.lib === 'open') togglePanel('lib'); }, true);
  const shell = h('div.itp.itp-app', { 'data-lib': narrow() ? 'closed' : persist.load('lib', 'open'), 'data-insp': persist.load('insp', 'open') }, top, library.el, stageWrap, inspector.el);
  render(root, shell);
  applyTheme(persist.load('theme', null));

  // ================================================================ engine
  status.textContent = 'Starting…';
  try {
    app.engine = await createPixelator();
  } catch (e) {
    toast(`Could not start: ${e.message}`, { kind: 'error' });
    throw e;
  }
  inspector.el.querySelector('#itp-backend').textContent = app.engine.backend === 'webgl' ? 'GPU · ShaderMate' : 'CPU';
  inspector.el.querySelector('#itp-backend').title = app.engine.backend === 'webgl' ? `WebGL 2: ${app.engine.renderer}` : (app.engine.fallbackReason || 'CPU renderer');
  import('../video.js').then(m => m.videoSupport()).then(v => { app.videoSupport = v; }).catch(() => { });

  // ================================================================ rendering
  let dirty = false, running = false, lastSource = null;
  const outCanvas = document.createElement('canvas');

  function schedule() {
    dirty = true;
    if (!running) requestAnimationFrame(run);
  }
  app.schedule = schedule;

  async function run() {
    if (running || !dirty) return;
    if (app.exporting) return;
    dirty = false;
    const item = app.current;
    if (!item) { app.result = null; stage.clear(); updateStatus(); return; }
    running = true;
    const slow = setTimeout(() => { busy.hidden = false; }, 250);
    try {
      if (item.type === 'video') app.engine.invalidate();
      const res = await app.engine.process(item.source, store.settings);
      if (item !== app.current) return;
      app.result = res;
      res.toCanvas(1, { canvas: outCanvas });
      stage.show(outCanvas, item.source, res.crop);
      inspector.setStats(res);
      inspector.sync(store.settings, res);
      if (lastSource !== item) { lastSource = item; }
      updateStatus();
    } catch (e) {
      console.error(e);
      toast(`Rendering failed: ${e.message}`, { kind: 'error' });
    } finally {
      clearTimeout(slow); busy.hidden = true;
      running = false;
      if (dirty) requestAnimationFrame(run);
    }
  }

  function updateStatus() {
    const r = app.result, it = app.current;
    fileName.textContent = it ? it.name : 'No image';
    fileMeta.textContent = it ? (it.type === 'video' ? `${it.width} × ${it.height}, ${fmtTime(it.duration)}` : `${it.width} × ${it.height}`) : '';
    empty.hidden = !!it;
    viewTools.hidden = !it;
    if (!it || !r) { status.hidden = true; return; }
    status.hidden = false;
    render(status, h('span', {}, h('b', { text: `${r.width} × ${r.height}` }), ' px'), h('span', { text: `${Math.round(stage.zoom * 100) / 100}× zoom` }));
    undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
  }
  function updateZoomLabel() {
    zoomBtn.querySelector('span').textContent = !app.current || stage.fitted ? 'Fit' : stage.zoom >= 1 ? `${Math.round(stage.zoom * 10) / 10}×` : `${Math.round(stage.zoom * 100)}%`;
    if (app.result) updateStatus();
  }

  store.subscribe((s, why) => {
    // write the edit back to whatever is being edited: this file's own settings, or the shared ones
    const cur = app.current;
    if (cur && cur.own && store.target === cur.id) cur.own = s;
    else if (store.target === 'shared') app.shared = s;
    inspector.sync(s, app.result);
    undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
    if (why !== 'preset') app.activePreset = null;
    if (usePersist) saveSoon();
    if (library.tab === 'palettes') library.refresh();
    schedule();
  });
  let saveT = null;
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(() => persist.save('settings', app.shared), 300); };

  // ================================================================ files
  async function makeThumb(drawable, w, hgt) {
    const c = document.createElement('canvas');
    const k = 72 / Math.max(w, hgt);
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hgt * k));
    try { c.getContext('2d').drawImage(drawable, 0, 0, c.width, c.height); } catch { /* not ready */ }
    return c.toDataURL();
  }

  async function addImage(name, drawable, file = null) {
    const w = drawable.naturalWidth || drawable.width, hh = drawable.naturalHeight || drawable.height;
    const item = { id: crypto.randomUUID?.() || String(Math.random()), name, type: 'image', source: drawable, width: w, height: hh, file };
    item.thumb = await makeThumb(drawable, w, hh);
    app.items.push(item);
    return item;
  }

  async function addVideo(name, file) {
    const video = h('video', { muted: true, playsInline: true, loop: true, preload: 'auto', crossOrigin: 'anonymous' });
    video.muted = true;
    video.src = URL.createObjectURL(file);
    try {
      await videoReady(video);
    } catch (e) {
      URL.revokeObjectURL(video.src);
      if (e.code === 3 || e.code === 4) {
        const codec = await sniffVideoCodec(file).catch(() => '');
        const alt = codec === 'H.264' ? 'WebM (VP9)' : codec === 'VP9' ? 'H.264 MP4' : 'H.264 MP4 or WebM (VP9)';
        const err = new Error(codec
          ? `it's ${codec}, which this browser can't play. Re-save it as ${alt}, or open the editor in a browser that plays ${codec}.`
          : `this browser can't play this video's format. Re-save it as ${alt}.`);
        err.code = e.code;
        throw err;
      }
      throw e;
    }
    const item = { id: crypto.randomUUID?.() || String(Math.random()), name, type: 'video', source: video, width: video.videoWidth, height: video.videoHeight, duration: video.duration, fps: 30, file };
    await seekTo(video, Math.min(0.05, video.duration / 2)).catch(() => { });
    item.thumb = await makeThumb(video, item.width, item.height);
    app.items.push(item);
    estimateFps(video, 30).then(f => { item.fps = f; if (app.current === item) updateTransport(); inspector.syncAnim(); });
    video.addEventListener('timeupdate', () => { if (app.current === item) updateTransport(); });
    video.addEventListener('play', () => { if (app.current === item) { updateTransport(); pumpVideo(item); } });
    video.addEventListener('pause', () => { if (app.current === item) { updateTransport(); schedule(); } });
    video.addEventListener('seeked', () => { if (app.current === item && !app.exporting) schedule(); });
    return item;
  }

  async function addFiles(files) {
    const media = [], palettes = [], settingsFiles = [];
    for (const f of files) {
      if (PALETTE_EXT.test(f.name) && !/^image|^video/.test(f.type)) {
        if (/\.json$/i.test(f.name)) settingsFiles.push(f); else palettes.push(f);
      } else if (IMAGE_TYPES.test(f.type) || VIDEO_TYPES.test(f.type) || /\.(png|jpe?g|gif|webp|bmp|svg|avif|mp4|webm|mov)$/i.test(f.name)) media.push(f);
    }
    for (const f of palettes) await importPaletteFile(f);
    for (const f of settingsFiles) {
      const text = await f.text();
      try {
        const obj = JSON.parse(text);
        if (obj.colors || Array.isArray(obj)) await importPaletteFile(f, text);
        else { store.replace(settingsFromJSON(obj)); toast(`Loaded settings from ${f.name}`, { kind: 'ok' }); }
      } catch (e) { toast(`${f.name}: ${e.message}`, { kind: 'error' }); }
    }
    let first = null;
    const t = media.length > 2 ? toast(`Loading ${media.length} files`, { progress: true }) : null;
    for (let i = 0; i < media.length; i++) {
      const f = media[i];
      try {
        let item;
        if (VIDEO_TYPES.test(f.type) || /\.(mp4|webm|mov)$/i.test(f.name)) item = await addVideo(f.name, f);
        else {
          let drawable;
          try { drawable = await createImageBitmap(f); } catch {
            drawable = new Image(); drawable.src = URL.createObjectURL(f); await drawable.decode();
          }
          item = await addImage(f.name, drawable, f);
        }
        first ||= item;
      } catch (e) { toast(`${f.name} could not be opened: ${e.message}`, { kind: 'error' }); }
      t?.progress((i + 1) / media.length);
    }
    t?.close();
    if (first) select(first);
    library.refresh();
    if (media.length > 1) toast(`Added ${media.length} files. They share one set of settings.`, { kind: 'ok' });
  }
  app.addFiles = addFiles;

  async function openFiles() {
    const files = await pickFiles({ accept: 'image/*,video/*,.gpl,.hex,.pal,.txt,.json', multiple: true });
    if (files.length) addFiles(files);
  }
  app.openFiles = openFiles;

  async function openSample(s) {
    const img = await loadSample(s);
    const item = await addImage(`${s.name}.svg`, img);
    select(item);
    library.refresh();
  }

  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const it of items) for (const type of it.types) if (IMAGE_TYPES.test(type)) {
        const b = await it.getType(type);
        files.push(new File([b], `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${type.split('/')[1]}`, { type }));
      }
      if (files.length) addFiles(files); else toast('The clipboard has no image', { kind: 'error' });
    } catch {
      toast('Press Ctrl+V (⌘V) to paste. The browser blocked direct clipboard access.');
    }
  }
  app.pasteFromClipboard = pasteFromClipboard;

  function select(item) {
    if (app.current && app.current.type === 'video' && app.current !== item) app.current.source.pause();
    app.current = item;
    editTarget(item);
    stageWrap.dataset.video = String(item && item.type === 'video');
    if (item && item.type === 'video') updateTransport();
    stage.clear();
    app.result = null;
    if (stage.picking) togglePicker();
    library.refresh();
    library.sourceChanged();
    schedule();
    updateStatus();
  }
  app.select = select;

  function removeItem(item) {
    const i = app.items.indexOf(item);
    if (i < 0) return;
    app.items.splice(i, 1);
    store.dropTarget(item.id);
    if (item.type === 'video') { item.source.pause(); URL.revokeObjectURL(item.source.src); }
    if (item.source.close && !app.items.some(i => i.source === item.source)) item.source.close();   // duplicates share a bitmap
    if (app.current === item) select(app.items[Math.min(i, app.items.length - 1)] || null);
    library.refresh();
    inspector.sync(store.settings, app.result);
  }
  app.removeItem = removeItem;
  app.clearItems = () => { for (const it of app.items.slice()) removeItem(it); };

  // ================================================================ per-file settings
  /** The settings a file renders with. */
  const settingsFor = item => (item === app.current ? store.settings : (item && item.own) || app.shared);
  app.settingsFor = settingsFor;
  const clone = v => JSON.parse(JSON.stringify(v));

  /** Point the store at the right settings for this file (its own, or the shared ones). */
  function editTarget(item, force = false) {
    const key = item && item.own ? item.id : 'shared';
    if (store.target === key && !force) return;
    store.setTarget(key, key === 'shared' ? app.shared : item.own);
  }

  /** Give a file its own settings (a copy of what it uses now), or link it back to the shared ones. */
  function setOwn(item, own, { quiet = false } = {}) {
    if (!item || !!item.own === own) return;
    if (own) {
      item.own = clone(settingsFor(item));
      if (item === app.current) editTarget(item);
      if (!quiet) toast(`${item.name} now has its own settings. Changes no longer affect other files.`);
    } else {
      const was = item.own;
      item.own = null;
      store.dropTarget(item.id);
      if (item === app.current) editTarget(item);
      if (!quiet) toast(`${item.name} uses the shared settings again`, { action: { label: 'Undo', onClick: () => { item.own = was; if (item === app.current) editTarget(item); afterScopeChange(); } } });
    }
    afterScopeChange();
  }
  function afterScopeChange() {
    library.refresh();
    inspector.sync(store.settings, app.result);
    if (app.result) inspector.setStats(app.result);
    schedule();
  }
  app.setOwn = setOwn;

  app.copySettings = item => {
    app.clipboard = clone(settingsFor(item));
    toast(`Copied the settings of ${item.name}`, { timeout: 1800 });
    library.refresh();
  };
  app.pasteSettings = item => {
    if (!app.clipboard) return;
    if (!item.own) setOwn(item, true, { quiet: true });
    if (item === app.current) store.replace(app.clipboard, 'paste');
    else item.own = clone(app.clipboard);
    toast(`Pasted settings onto ${item.name}`, { kind: 'ok', timeout: 1800 });
    afterScopeChange();
  };
  /** Make this file's settings the shared ones, and link every file to them. */
  app.applyToAll = item => {
    const snapshot = { shared: app.shared, own: new Map(app.items.map(i => [i, i.own])) };
    app.shared = clone(settingsFor(item));
    for (const it of app.items) { if (it.own) store.dropTarget(it.id); it.own = null; }
    store.setTarget('shared', app.shared);
    if (usePersist) saveSoon();
    toast(`Every file now uses the settings of ${item.name}`, {
      action: { label: 'Undo', onClick: () => {
        app.shared = snapshot.shared;
        for (const [it, own] of snapshot.own) it.own = own;
        editTarget(app.current, true);
        afterScopeChange();
      } },
    });
    afterScopeChange();
  };
  /** A second copy of a file with its own settings, for comparing two looks. */
  app.duplicate = async item => {
    let copy;
    if (item.type === 'video') copy = await addVideo(nameCopy(item.name), item.file);
    else copy = await addImage(nameCopy(item.name), item.source, item.file);
    // place it right after the original
    app.items.splice(app.items.indexOf(copy), 1);
    app.items.splice(app.items.indexOf(item) + 1, 0, copy);
    copy.own = clone(settingsFor(item));
    select(copy);
    toast(`Duplicated ${item.name}. The copy has its own settings.`, { timeout: 2400 });
  };
  const nameCopy = name => { const m = /^(.*?)(\.[^.]*)?$/.exec(name); return `${m[1]} copy${m[2] || ''}`; };
  app.move = (item, dir) => {
    const i = app.items.indexOf(item), j = i + dir;
    if (i < 0 || j < 0 || j >= app.items.length) return;
    [app.items[i], app.items[j]] = [app.items[j], app.items[i]];
    library.refresh();
    if (document.activeElement === document.body || document.activeElement?.closest?.('.itp-files')) library.focusFile(item);
  };

  // ================================================================ video
  function updateTransport() {
    const it = app.current;
    if (!it || it.type !== 'video') return;
    const v = it.source;
    playBtn.innerHTML = icon(v.paused ? 'play' : 'pause');
    playBtn.setAttribute('aria-label', v.paused ? 'Play (Space)' : 'Pause (Space)');
    const frame = Math.floor(v.currentTime * it.fps + 1e-6);
    timeLabel.innerHTML = `${fmtTime(v.currentTime)} <span>/ ${fmtTime(v.duration)}</span>`;
    timeLabel.title = `Frame ${frame}`;
    scrub.value = String(Math.round(v.currentTime / (v.duration || 1) * 1000));
    scrub.style.setProperty('--p', `${scrub.value / 10}%`);
    fpsLabel.textContent = `${it.fps} fps`;
  }
  function pumpVideo(item) {
    const v = item.source;
    const tick = () => {
      if (v.paused || app.current !== item) return;
      schedule();
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
    };
    tick();
  }
  function togglePlay() {
    const it = app.current;
    if (!it || it.type !== 'video') return;
    if (it.source.paused) it.source.play().catch(e => toast(e.message, { kind: 'error' })); else it.source.pause();
  }
  function stepFrame(dir) {
    const it = app.current;
    if (!it || it.type !== 'video') return;
    const v = it.source; v.pause();
    const frame = Math.floor(v.currentTime * it.fps + 1e-6) + dir;
    seekTo(v, (Math.max(0, frame) + 0.5) / it.fps).then(() => { updateTransport(); schedule(); });
  }
  scrub.addEventListener('input', () => {
    const it = app.current; if (!it || it.type !== 'video') return;
    it.source.currentTime = scrub.value / 1000 * it.source.duration;
  });

  // ================================================================ view
  function toggleCompare(force) {
    const on = force ?? !stage.compare;
    stage.setCompare(on); compareBtn.setAttribute('aria-pressed', String(on));
  }
  function toggleGrid(force) {
    const on = force ?? !stage.grid;
    stage.setGrid(on); gridBtn.setAttribute('aria-pressed', String(on));
    if (on && stage.zoom < 6 && app.result) toast('The grid shows from 6× zoom');
  }
  function zoomMenu(anchor) {
    menu(anchor, [
      { label: 'Fit to view', kbd: 'F', icon: 'fit', onClick: () => stage.fit() },
      'sep',
      ...[1, 2, 4, 8, 16, 32].map(z => ({ label: `${z}×`, sub: z === 1 ? 'One screen pixel per pixel' : null, onClick: () => stage.zoomTo(z) })),
      'sep',
      { label: 'Zoom in', kbd: '+', icon: 'zoomIn', onClick: () => stage.zoomIn() },
      { label: 'Zoom out', kbd: '-', icon: 'zoomOut', onClick: () => stage.zoomOut() },
    ]);
  }
  function togglePanel(which) {
    const key = which === 'lib' ? 'lib' : 'insp';
    const open = shell.dataset[key] !== 'open';
    shell.dataset[key] = open ? 'open' : 'closed';
    if (!narrow() || which === 'insp') persist.save(key, shell.dataset[key]);
    requestAnimationFrame(() => stage.resize());
  }
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme (T)' : 'Switch to dark theme (T)');
    stage.redraw();
  }
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'dark' ? 'light' : 'dark';
    persist.save('theme', next);
    applyTheme(next);
  }

  // ================================================================ palettes
  function pixelsOf(item, maxSize = 4096) {
    const w = item.width, hh = item.height, k = Math.min(1, maxSize / Math.max(w, hh));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(item.source, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  }
  function pickAt(u, v) {
    const it = app.current; if (!it) return;
    const img = pixelsOf(it, 1024);
    const c = app.result ? app.result.crop : { x: 0, y: 0, w: 1, h: 1 };
    const x = Math.min(img.width - 1, Math.floor((c.x + u * c.w) * img.width)), y = Math.min(img.height - 1, Math.floor((c.y + v * c.h) * img.height));
    const o = (y * img.width + x) * 4;
    const hex = toHex([img.data[o], img.data[o + 1], img.data[o + 2]]);
    const s = store.settings;
    const colors = s.palette.source === 'custom' ? s.palette.colors : [];
    if (colors.includes(hex)) return toast(`${hex} is already in the palette`);
    store.update({ palette: { source: 'custom', name: s.palette.source === 'custom' ? s.palette.name : 'Picked', colors: [...colors, hex] } });
    toast(`Added ${hex}`, { kind: 'ok', timeout: 1500 });
  }
  let pickerBtn = null;
  function togglePicker(button) {
    if (button) pickerBtn = button;
    const on = !stage.picking;
    stage.setPicking(on);
    pickerBtn?.setAttribute('aria-pressed', String(on));
    if (on) {
      toggleCompare(true);
      toast('Click the image to add colours. Press Esc when done.');
    }
  }
  app.togglePicker = togglePicker;

  function usePalette(p) {
    if (p.id && !p.custom) store.update({ palette: { source: 'builtin', id: p.id } });
    else store.update({ palette: { source: 'custom', name: p.name, colors: p.colors } });
  }
  app.usePalette = usePalette;

  function rememberPalette(name, colors) {
    const list = app.userPalettes.filter(p => p.name !== name);
    list.unshift({ name, colors, custom: true });
    app.userPalettes = list.slice(0, 100);
    if (usePersist) persist.save('palettes', app.userPalettes);
    if (library.tab === 'palettes') library.refresh();
  }
  async function importPaletteFile(file, text) {
    try {
      const p = parsePalette(text ?? await file.text(), file.name);
      rememberPalette(p.name || 'Imported', p.colors);
      store.update({ palette: { source: 'custom', name: p.name || 'Imported', colors: p.colors } });
      toast(`Imported "${p.name}" (${p.colors.length} colours)`, { kind: 'ok' });
    } catch (e) { toast(`${file.name}: ${e.message}`, { kind: 'error' }); }
  }
  app.importPalette = async () => {
    const [f] = await pickFiles({ accept: '.gpl,.hex,.pal,.txt,.json' });
    if (f) importPaletteFile(f);
  };
  app.savePalette = () => {
    const s = store.settings;
    const colors = s.palette.source === 'extract' ? (app.result?.palette || []) : s.palette.colors;
    if (!colors.length) return toast('There is no palette to save', { kind: 'error' });
    const input = h('input.itp-input', { value: s.palette.source === 'custom' ? s.palette.name : `${s.palette.name} copy`, 'aria-label': 'Palette name' });
    const fmt = h('select.itp-select', { 'aria-label': 'Also download as' }, h('option', { value: '', text: "Don't download" }), h('option', { value: 'gpl', text: '.gpl (GIMP, Aseprite)' }), h('option', { value: 'hex', text: '.hex (Lospec)' }), h('option', { value: 'json', text: '.json' }));
    dialog('Save palette', [h('div.itp-field', {}, h('div.lab', {}, h('span', { text: 'Name' })), input), h('div.itp-field', {}, h('div.lab', {}, h('span', { text: 'Also download as' })), fmt),
      h('div.itp-strip', { style: { height: '18px' } }, ...colors.map(c => h('i', { style: { background: c } })))], {
      actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
        const name = input.value.trim() || 'Palette';
        rememberPalette(name, colors);
        store.update({ palette: { source: 'custom', name, colors } });
        const slug = name.replace(/[^\w-]+/g, '-').toLowerCase();
        if (fmt.value === 'gpl') downloadBlob(toGPL(name, colors), `${slug}.gpl`, 'text/plain');
        if (fmt.value === 'hex') downloadBlob(toHexFile(colors), `${slug}.hex`, 'text/plain');
        if (fmt.value === 'json') downloadBlob(toPaletteJSON(name, colors), `${slug}.json`, 'application/json');
        toast(`Saved "${name}" to Your palettes`, { kind: 'ok' });
      } }],
    });
    input.select();
  };
  app.deletePalette = p => {
    app.userPalettes = app.userPalettes.filter(x => x !== p);
    if (usePersist) persist.save('palettes', app.userPalettes);
    library.refresh();
    toast(`Deleted "${p.name}"`, { action: { label: 'Undo', onClick: () => rememberPalette(p.name, p.colors) } });
  };
  app.lospecDialog = () => {
    const input = h('input.itp-input', { placeholder: 'e.g. rgbg-36 or a lospec.com palette URL', 'aria-label': 'Lospec slug or URL' });
    const note = h('div.help', { text: 'Looks the palette up on lospec.com. Needs an internet connection.' });
    const d = dialog('Palette from Lospec', [h('div.itp-field', {}, h('div.lab', {}, h('span', { text: 'Slug or URL' })), input, note)], {
      actions: [{ label: 'Cancel' }, { label: 'Fetch', primary: true, onClick: async () => {
        note.textContent = 'Fetching…'; note.style.color = '';
        try {
          const p = await fetchLospec(input.value);
          rememberPalette(p.name, p.colors);
          store.update({ palette: { source: 'custom', name: p.name, colors: p.colors } });
          toast(`Loaded "${p.name}" from Lospec`, { kind: 'ok' });
          return true;
        } catch (e) { note.textContent = e.message; note.style.color = 'var(--danger)'; return false; }
      } }],
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') d.querySelector('footer .primary').click(); });
    input.focus();
  };

  app.detectGrid = () => {
    const it = app.current; if (!it || it.type !== 'image') return toast('Open an image first', { kind: 'error' });
    const b = detectGrid(pixelsOf(it));
    if (b <= 1) return toast('No pixel grid found. This image doesn\'t look upscaled.');
    store.update({ size: { mode: 'block', block: b, resample: 'nearest' } });
    toast(`Found ${b} px blocks: switched to pixel size ${b} with nearest sampling`, { kind: 'ok' });
  };

  // ================================================================ settings
  app.settingsJSON = () => settingsToJSON(store.settings);
  app.copyLink = async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeSettings(store.settings)}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied. It holds the settings, not the image.', { kind: 'ok' }); }
    catch { dialog('Share link', [h('textarea.itp-input', { rows: 3, readOnly: true, value: url })]); }
    history.replaceState(null, '', `#s=${encodeSettings(store.settings)}`);
  };
  app.saveSettingsFile = () => downloadBlob(settingsToJSON(store.settings), 'image-to-pixel-settings.json', 'application/json');
  app.loadSettingsFile = async () => {
    const [f] = await pickFiles({ accept: '.json,application/json' });
    if (!f) return;
    try { store.replace(settingsFromJSON(await f.text())); toast(`Loaded ${f.name}`, { kind: 'ok' }); } catch (e) { toast(`${f.name}: ${e.message}`, { kind: 'error' }); }
  };
  app.resetSettings = () => { store.replace(defaultSettings()); toast('Settings reset', { action: { label: 'Undo', onClick: () => store.undo() } }); };
  app.applyPreset = p => {
    store.replace(mergeSettings(defaultSettings(), { ...p.settings, export: store.settings.export }), 'preset');
    app.activePreset = p.id;
    library.refresh();
  };

  Object.assign(app, exporter);

  function exportMenu(anchor) {
    const it = app.current;
    const video = it && it.type === 'video';
    const images = app.items.filter(i => i.type === 'image').length;
    const s = store.settings;
    menu(anchor, [
      { group: 'Image' },
      { label: 'PNG', sub: app.result ? `${app.result.width * s.export.scale} × ${app.result.height * s.export.scale}, ${s.export.scale}× scale` : 'Open an image first', icon: 'image', kbd: 'Ctrl S', disabled: !app.result, onClick: () => app.exportPNG() },
      { label: 'Copy to clipboard', icon: 'copy', disabled: !app.result, onClick: () => app.copyImage() },
      { label: app.items.length > 1 ? `All ${app.items.length} files as ZIP` : 'All files as ZIP', sub: app.items.length > 1 ? null : 'Add two or more files', icon: 'zip', disabled: app.items.length < 2, onClick: () => app.exportZip() },
      { group: 'Animation' },
      { label: video ? 'GIF from this video' : 'GIF from all images', icon: 'gif', disabled: !video && images < 2, onClick: () => app.exportAnimation({ ...animDefaults(), format: 'gif' }) },
      { label: 'More formats…', sub: 'WebM, MP4, PNG sequence, sprite sheet', icon: 'film', onClick: () => { inspector.setTab('export'); if (shell.dataset.insp !== 'open') togglePanel('insp'); } },
      { group: 'Other' },
      { label: 'Tileset', sub: '16 × 16 tiles, duplicates removed', icon: 'tiles', disabled: !app.result, onClick: () => app.exportTileset({ tile: 16, flips: false }) },
      { label: 'Copy settings link', icon: 'link', onClick: () => app.copyLink() },
      { label: 'Settings as JSON', icon: 'braces', onClick: () => app.saveSettingsFile() },
    ]);
  }
  const animDefaults = () => {
    const it = app.current;
    const video = it && it.type === 'video';
    return { source: video ? 'video' : 'files', fps: video ? Math.min(30, Math.round(it.fps || 12)) : 8, start: 0, end: video ? it.duration : 0 };
  };

  // ================================================================ help
  function showHelp() {
    const keys = [
      ['Open files', 'Ctrl O'], ['Paste image', 'Ctrl V'], ['Export PNG', 'Ctrl S'], ['Undo', 'Ctrl Z'], ['Redo', 'Ctrl Shift Z'],
      ['Compare', 'C'], ['Pixel grid', 'G'], ['Fit', 'F'], ['Zoom in / out', '+ -'], ['Pixel width ±1', '[ ]'], ['Pixel width ±8', 'Shift [ ]'],
      ['Next / previous dither', 'D  Shift D'], ['Play / pause video', 'Space'], ['Step one frame', ', .'], ['Library', '\\'], ['Inspector', '/'],
      ['Theme', 'T'], ['Next / previous file', 'Alt ↓ ↑'], ['Move file down / up', 'Alt Shift ↓ ↑'], ['This list', '?'],
    ];
    dialog('Keyboard shortcuts', [h('div.itp-keys', {}, ...keys.map(([a, k]) => h('div', {}, h('span', { text: a }), h('span', {}, ...k.split(' ').filter(Boolean).map(x => h('kbd', { text: x }))))))]);
  }

  // ================================================================ input
  const typing = e => e.target.closest('input, select, textarea, [contenteditable="true"]') && !(e.target.type === 'range' || e.target.type === 'checkbox');
  const DITHER_ORDER = ['none', 'bayer4', 'bayer8', 'bluenoise', 'cluster4', 'floyd-steinberg', 'atkinson', 'sierra-lite', 'jarvis'];
  window.addEventListener('keydown', e => {
    if (!shell.isConnected) return;
    if (document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') { if (typing(e)) return; e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
    if (mod && k.toLowerCase() === 'y') { if (typing(e)) return; e.preventDefault(); store.redo(); return; }
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); app.exportPNG(); return; }
    if (mod && k.toLowerCase() === 'o') { e.preventDefault(); openFiles(); return; }
    if (mod || e.altKey && !['ArrowUp', 'ArrowDown'].includes(k)) return;
    if (typing(e)) { if (k === 'Escape') e.target.blur(); return; }
    const s = store.settings;
    switch (k) {
      case 'c': case 'C': toggleCompare(); break;
      case 'g': case 'G': toggleGrid(); break;
      case 'f': case 'F': stage.fit(); break;
      case '+': case '=': stage.zoomIn(); break;
      case '-': case '_': stage.zoomOut(); break;
      case 't': case 'T': toggleTheme(); break;
      case '\\': togglePanel('lib'); break;
      case '/': togglePanel('insp'); break;
      case '?': showHelp(); break;
      case '[': case '{': store.update({ size: { mode: 'width', width: Math.max(8, s.size.width - (e.shiftKey ? 8 : 1)) } }, { key: 'kw' }); break;
      case ']': case '}': store.update({ size: { mode: 'width', width: s.size.width + (e.shiftKey ? 8 : 1) } }, { key: 'kw' }); break;
      case 'd': case 'D': {
        const i = DITHER_ORDER.indexOf(s.dither.method);
        const next = DITHER_ORDER[(i + (e.shiftKey ? -1 : 1) + DITHER_ORDER.length) % DITHER_ORDER.length];
        store.update({ dither: { method: next } });
        toast(next === 'none' ? 'No dither' : next.replace(/-/g, ' '), { timeout: 900 });
        break;
      }
      case ' ': if (app.current?.type === 'video') { e.preventDefault(); togglePlay(); } break;
      case ',': stepFrame(-1); break;
      case '.': stepFrame(1); break;
      case 'Escape': if (stage.picking) togglePicker(); else closeMenu(); break;
      case 'ArrowDown': case 'ArrowUp':
        if (e.altKey && e.shiftKey && app.current) { e.preventDefault(); app.move(app.current, k === 'ArrowDown' ? 1 : -1); break; }
        if (e.altKey && app.items.length > 1) {
          e.preventDefault();
          const i = app.items.indexOf(app.current);
          select(app.items[(i + (k === 'ArrowDown' ? 1 : -1) + app.items.length) % app.items.length]);
        }
        break;
      default: return;
    }
  });

  // drag & drop, paste
  let dragDepth = 0;
  shell.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; shell.classList.add('itp-dragging'); } });
  shell.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; shell.classList.remove('itp-dragging'); } });
  shell.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  shell.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; shell.classList.remove('itp-dragging');
    if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  });
  window.addEventListener('paste', e => {
    if (!shell.isConnected || typing(e)) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    const text = e.clipboardData?.getData('text') || '';
    if (/#?[0-9a-f]{6}/i.test(text) && /\n|,|\s/.test(text.trim())) {
      try { const p = parsePalette(text); store.update({ palette: { source: 'custom', name: 'Pasted', colors: p.colors } }); toast(`Pasted a ${p.colors.length}-colour palette`, { kind: 'ok' }); } catch { /* not a palette */ }
    }
  });
  window.addEventListener('hashchange', () => {
    if (/[#&]s=/.test(location.hash)) { try { store.replace(decodeSettings(location.hash)); } catch { /* ignore */ } }
  });

  // first paint
  inspector.sync(store.settings, null);
  library.refresh();
  updateStatus();
  undoBtn.disabled = redoBtn.disabled = true;

  const api = {
    app, store,
    /** Add File objects (images, videos, palettes, settings JSON). */
    addFiles,
    /** Add an image-like source directly. */
    async addImage(source, name = 'image') { const it = await addImage(name, source); select(it); library.refresh(); return it; },
    openSample: id => openSample(SAMPLES.find(s => s.id === id) || SAMPLES[0]),
    applyPreset: id => { const p = PRESETS.find(x => x.id === id); if (p) app.applyPreset(p); },
    setTheme: t => { persist.save('theme', t); applyTheme(t); },
    get result() { return app.result; },
    /** On-screen rectangle of the image in the canvas. */
    get view() { return stage.rect; },
    /** Resolves after pending renders finish. */
    async idle() { for (let i = 0; i < 200 && (dirty || running); i++) await new Promise(r => setTimeout(r, 25)); },
  };
  return api;
}

export { SAMPLES };
