// The editor UI. mountEditor(element) builds the whole app inside `element`.
// The core engine (lib/core) has no idea this file exists.

import { createPixelator } from '../core/engine.js';
import { defaultSettings, decodeSettings, encodeSettings, settingsToJSON, settingsFromJSON, mergeSettings } from '../core/settings.js';
import { parsePalette, toGPL, toHexFile, toPaletteJSON } from '../core/palette/parse.js';
import { fetchLospec } from '../core/palette/lospec.js';
import { detectGrid } from '../core/export/scale.js';
import { toHex } from '../core/color.js';
import { estimateFps, videoReady, seekTo, sniffVideoCodec, hasAudioTrack } from '../core/video/frames.js';
import { downloadBlob } from '../core/export/canvas.js';
import { PRESETS } from '../core/presets.js';
import { h, render, pickFiles } from './dom.js';
import { icon } from './icons.js';
import { createStore } from './store.js';
import { createStage } from './stage.js';
import { createInspector } from './inspector.js';
import { createLibrary, fmtTime } from './library.js';
import { createExporter } from './exporter.js';
import { createVideoStoryboard } from './storyboard.js';
import { createTimelinePreview } from './timeline-preview.js';
import { toast, menu, closeMenu, dialog } from './ui.js';
import { SAMPLES, loadSample, sampleURL } from './samples.js';
import * as persist from './persist.js';
import { saveWorkspace, loadWorkspace, forgetWorkspace, isQuotaError, fmtBytes } from './workspace.js';

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
  // click the name to rename (F2); the extension stays as it was
  fileName.addEventListener('click', () => { if (app.current) startRename(app.current); });
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
  const saveBtn = h('button.itp-btn.outline', { type: 'button', title: 'Save these files and their settings in this browser', html: `${icon('save')}<span class="hide-sm">Save</span>`, onclick: () => saveNow() });
  saveBtn.hidden = !usePersist;
  const brand = h('a.itp-brand', { href: options.homeHref || '#', title: 'Image-to-Pixel' }, h('span.itp-mark', { 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, () => h('i'))), h('span.hide-sm', { text: 'Image-to-Pixel' }));
  if (!options.homeHref) brand.addEventListener('click', e => e.preventDefault());

  const top = h('header.itp-top', {},
    libBtn, brand, h('span.sep.hide-sm'),
    h('div.itp-file', {}, fileName, fileMeta),
    h('div.spacer'),
    h('span.hide-sm.contents', {}, undoBtn, redoBtn, h('span.sep')),
    compareBtn, gridBtn, zoomBtn,
    h('span.sep.hide-sm'), h('span.hide-sm.contents', {}, themeBtn, helpBtn), inspBtn,
    h('span', { style: { width: '6px' } }), saveBtn, exportBtn);

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
  // sound: muted by default; the choice (and volume) is remembered and applies to every video
  const sound = { muted: persist.load('muted', true) !== false, volume: Number(persist.load('volume', 1)) };
  if (!(sound.volume >= 0 && sound.volume <= 1)) sound.volume = 1;
  // YouTube-style: the speaker button opens a vertical volume slider; all the way down is mute.
  const muteBtn = btn('volumeOff', 'Volume (M mutes)', () => toggleVolPop(), { 'aria-haspopup': 'true', 'aria-expanded': 'false' });
  const volFill = h('div.fill');
  const volThumb = h('div.thumb');
  const volSlider = h('div.itp-vslider', { role: 'slider', tabindex: '0', 'aria-label': 'Volume', 'aria-orientation': 'vertical', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div.track', {}, volFill, volThumb));
  const volValue = h('span.num', {});
  const volPop = h('div.itp-volpop', { hidden: true }, volValue, volSlider);
  const soundBox = h('div.itp-sound', { hidden: true }, volPop, muteBtn);
  const setLevel = v => setSound(v <= 0.005 ? { muted: true } : { muted: false, volume: Math.min(1, v) });
  const levelAt = e => { const r = volSlider.querySelector('.track').getBoundingClientRect(); return Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height)); };
  volSlider.addEventListener('pointerdown', e => {
    e.preventDefault(); volSlider.focus(); volSlider.setPointerCapture(e.pointerId);
    const before = sound.muted ? 0 : sound.volume;
    setLevel(levelAt(e));
    const move = ev => setLevel(levelAt(ev));
    const up = () => {
      volSlider.removeEventListener('pointermove', move); volSlider.removeEventListener('pointerup', up); volSlider.removeEventListener('pointercancel', up);
      // dragged down to mute: M brings back the volume it had before the drag
      if (sound.muted && before > 0) setSound({ muted: true, volume: before });
    };
    volSlider.addEventListener('pointermove', move); volSlider.addEventListener('pointerup', up); volSlider.addEventListener('pointercancel', up);
  });
  volSlider.addEventListener('keydown', e => {
    const cur = sound.muted ? 0 : sound.volume;
    const next = { ArrowUp: cur + 0.05, ArrowRight: cur + 0.05, ArrowDown: cur - 0.05, ArrowLeft: cur - 0.05, PageUp: cur + 0.2, PageDown: cur - 0.2, Home: 0, End: 1 }[e.key];
    if (next === undefined) { if (e.key === 'Escape') { e.preventDefault(); toggleVolPop(false); muteBtn.focus(); } return; }
    e.preventDefault(); e.stopPropagation(); setLevel(next);
  });
  volSlider.addEventListener('wheel', e => { e.preventDefault(); setLevel((sound.muted ? 0 : sound.volume) - Math.sign(e.deltaY) * 0.05); }, { passive: false });
  function toggleVolPop(open = volPop.hidden) {
    volPop.hidden = !open;
    muteBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const close = e => { if (!soundBox.contains(e.target)) { toggleVolPop(false); document.removeEventListener('pointerdown', close, true); } };
      document.addEventListener('pointerdown', close, true);
    }
  }
  const transport = h('div.itp-transport', { role: 'group', 'aria-label': 'Video' },
    btn('stepBack', 'Previous frame (,)', () => stepFrame(-1)), playBtn, btn('stepForward', 'Next frame (.)', () => stepFrame(1)),
    timeLabel, scrub, soundBox, fpsLabel);
  // The frame-selection canvas replaces the preview while it is on, so its tiles feed the stats.
  let statsResult = null;
  function updateStats(res) {
    if (res === statsResult) return false;
    statsResult = res;
    inspector.setStats(res);
    return true;
  }
  const timelinePreview = createTimelinePreview(app);
  const storyboard = createVideoStoryboard(app, {
    onModeChange: active => {
      timelinePreview.hide();
      stage.el.hidden = active;
      transport.hidden = active;
      compareBtn.disabled = gridBtn.disabled = active;
      if (!active) { stage.resize(); schedule(); }
      updateZoomLabel();
    },
    onZoomChange: updateZoomLabel,
    onRangeChange: range => inspector.setAnimationRange(range),
    onSelectionChange: state => {
      inspector.setFrameSelectionState(state);
      const res = state.active ? state.result : app.result;
      if (updateStats(res) && res && state.active) inspector.sync(store.settings, res);
    },
    animationOptions: () => inspector.animationOptions(),
  });
  app.setFrameSelection = enabled => storyboard.setMode(enabled);
  app.setFrameRange = (start, end) => storyboard.setRange(start, end);
  app.setAnimationFps = fps => storyboard.setPlaybackFps(fps);
  app.frameSelection = () => storyboard.exportSelection();
  /** The result the stats and size readouts describe: the main preview, or the selection's frame. */
  const previewResult = () => (storyboard.active ? storyboard.currentResult() : app.result);
  const stageWrap = h('main.itp-stage', { 'data-video': 'false' }, stage.el, storyboard.el, transport, storyboard.transport, timelinePreview.el);
  timelinePreview.bind(scrub);
  timelinePreview.bind(storyboard.range, { getFrame: storyboard.frameCanvas });

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
    if (app.exporting || storyboard.active) return;
    dirty = false;
    const item = app.current;
    if (!item) { app.result = null; stage.clear(); updateStatus(); return; }
    running = true;
    const slow = setTimeout(() => { busy.hidden = false; }, 250);
    try {
      if (item.type === 'video') app.engine.invalidate();
      const res = await app.engine.process(item.source, store.settings);
      if (item !== app.current || storyboard.active) return;
      app.result = res;
      res.toCanvas(1, { canvas: outCanvas });
      stage.show(outCanvas, item.source, res.crop);
      updateStats(res);
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
    const view = storyboard.active ? storyboard : stage;
    zoomBtn.querySelector('span').textContent = !app.current || view.fitted ? 'Fit' : view.zoom >= 1 ? `${Math.round(view.zoom * 10) / 10}×` : `${Math.round(view.zoom * 100)}%`;
    if (app.result) updateStatus();
  }

  store.subscribe((s, why) => {
    // write the edit back to whatever is being edited: this file's own settings, or the shared ones
    const cur = app.current;
    if (cur && cur.own && store.target === cur.id) cur.own = s;
    else if (store.target === 'shared') app.shared = s;
    inspector.sync(s, previewResult());
    undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
    if (why !== 'preset') app.activePreset = null;
    if (usePersist) saveSoon();
    if (library.tab === 'palettes') library.refresh();
    timelinePreview.reset();
    storyboard.refresh();
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
    // No `loop` attribute: looping by hand on 'ended' is more reliable (some MOV/MP4 files stalled at the
    // end and lost their sound after Chrome's built-in loop).
    const video = h('video', { muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
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
    // measuring plays the video muted for a moment; Play waits for it so the two don't fight
    item.fpsReady = estimateFps(video, 30).catch(() => 30).then(f => { item.fps = f; item.fpsReady = null; if (app.current === item) updateTransport(); inspector.syncAnim(); });
    // null = can't tell from the container: the sound controls stay, just in case
    hasAudioTrack(file).then(a => { item.hasAudio = a; if (app.current === item) updateTransport(); });
    video.addEventListener('timeupdate', () => { if (app.current === item) updateTransport(); });
    video.addEventListener('play', () => { if (app.current === item) { updateTransport(); pumpVideo(item); } });
    video.addEventListener('pause', () => { if (app.current === item) { updateTransport(); schedule(); } });
    video.addEventListener('seeked', () => { if (app.current === item && !app.exporting) schedule(); });
    video.addEventListener('ended', () => {
      if (app.current !== item || app.exporting || item.fpsReady || storyboard.active) return;
      video.currentTime = 0;
      video.play().catch(() => { });
    });
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
    const item = await addImage(`${s.name}.svg`, img, new File([s.svg], `${s.name}.svg`, { type: 'image/svg+xml' }));
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
    timelinePreview.reset();
    storyboard.setItem(item);
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
    inspector.sync(store.settings, previewResult());
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
    const res = previewResult();
    inspector.sync(store.settings, res);
    if (res) updateStats(res);
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

  // ================================================================ rename
  const splitExt = name => { const m = /^(.*?)(\.[^.\s]{1,5})?$/.exec(name); return [m[1], m[2] || '']; };
  /** Rename a file. The extension is kept: exports are named after it ("<name>@4x.png"). */
  app.rename = (item, next) => {
    const [, ext] = splitExt(item.name);
    let base = String(next || '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length);
    if (!base || base + ext === item.name) return;
    item.name = base + ext;
    library.refresh();
    updateStatus();
  };
  /** Edit the name in place in the header, with the name (not the extension) selected. */
  function startRename(item) {
    if (!item || fileName.hidden) return;
    if (app.current !== item) select(item);
    const [base] = splitExt(item.name);
    const input = h('input.itp-name-input', { type: 'text', value: item.name, 'aria-label': 'File name', spellcheck: false });
    input.style.width = `${Math.min(40, Math.max(12, item.name.length + 2))}ch`;
    fileName.hidden = true;
    fileName.after(input);
    input.focus();
    input.setSelectionRange(0, base.length);
    let done = false;
    const finish = commit => {
      if (done) return;
      done = true;
      if (commit) app.rename(item, input.value);
      input.remove();
      fileName.hidden = false;
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }
  app.startRename = startRename;

  // ================================================================ saved workspace
  // Files (their bytes), names, per-file settings and the shared settings, in this browser's IndexedDB.
  let savedInfo = null;   // { count, bytes, savedAt } of what is saved, or null
  app.savedWorkspace = () => savedInfo;

  /** A Blob for a file, for saving: the original bytes, or a PNG of what was added without a file. */
  async function bytesOf(item) {
    if (item.file) return item.file;
    const c = document.createElement('canvas');
    c.width = item.width; c.height = item.height;
    c.getContext('2d').drawImage(item.source, 0, 0);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }

  async function saveNow() {
    if (!usePersist) return;
    if (!app.items.length) {
      if (savedInfo) { await forgetSaved(); return; }
      toast('Add files first, then Save keeps them here for next time.');
      return;
    }
    saveBtn.disabled = true;
    try {
      const items = [];
      for (const it of app.items) items.push({ name: it.name, type: it.type, file: await bytesOf(it), own: it.own ? clone(it.own) : null });
      const bytes = await saveWorkspace({ shared: clone(app.shared), current: Math.max(0, app.items.indexOf(app.current)), items });
      const first = !savedInfo;
      savedInfo = { count: items.length, bytes, savedAt: Date.now() };
      library.refresh();
      toast(first
        ? `Saved ${items.length} file${items.length === 1 ? '' : 's'} (${fmtBytes(bytes)}) in this browser only. They reopen next time; remove them with Forget in the Files list.`
        : `Saved ${items.length} file${items.length === 1 ? '' : 's'} (${fmtBytes(bytes)})`, { kind: 'ok', timeout: first ? 7000 : 2200 });
    } catch (e) {
      console.error(e);
      toast(isQuotaError(e) ? "Not enough browser storage to save these files. Remove some (videos are large) and try again." : `Couldn't save: ${e.message}`, { kind: 'error' });
    } finally {
      saveBtn.disabled = false;
    }
  }
  app.saveWorkspace = saveNow;

  async function forgetSaved() {
    try { await forgetWorkspace(); } catch (e) { toast(`Couldn't remove the saved files: ${e.message}`, { kind: 'error' }); return; }
    savedInfo = null;
    library.refresh();
    toast('Removed the saved files from this browser. Files open now stay open.');
  }
  app.forgetWorkspace = forgetSaved;

  /** Reopen the saved workspace (on start, when nothing else was opened). */
  async function restoreSaved() {
    const ws = await loadWorkspace();
    if (!ws) return;
    savedInfo = { count: ws.items.length, bytes: ws.items.reduce((a, it) => a + (it.file ? it.file.size : 0), 0), savedAt: ws.savedAt };
    if (app.items.length || !ws.items.length) { library.refresh(); return; }
    if (ws.shared && !/[#&]s=/.test(location.hash)) store.setTarget('shared', ws.shared);   // a share link's settings win
    const t = ws.items.length > 2 ? toast(`Opening ${ws.items.length} saved files`, { progress: true }) : null;
    const added = [];
    for (let i = 0; i < ws.items.length; i++) {
      const s = ws.items[i];
      try {
        const file = s.file instanceof File ? s.file : new File([s.file], s.name, { type: s.file.type });
        let item;
        if (s.type === 'video') item = await addVideo(s.name, file);
        else {
          let drawable;
          try { drawable = await createImageBitmap(file); } catch { drawable = new Image(); drawable.src = URL.createObjectURL(file); await drawable.decode(); }
          item = await addImage(s.name, drawable, file);
        }
        item.own = s.own || null;
        added.push(item);
      } catch (e) { console.warn('[workspace] skipped', s.name, e); }
      t?.progress((i + 1) / ws.items.length);
    }
    t?.close();
    const cur = added[Math.min(ws.current || 0, added.length - 1)];
    if (cur) select(cur);
    library.refresh();
    if (added.length) toast(`Reopened your saved files (${added.length})`, { timeout: 2200 });
  }

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
    soundBox.hidden = it.hasAudio === false;
    applySound(v);
  }
  /** Mute/volume on the current video and in the controls. */
  function applySound(v) {
    if (v && !app.exporting && !app.current?.fpsReady) {
      if (v.muted !== sound.muted) v.muted = sound.muted;
      if (v.volume !== sound.volume) v.volume = sound.volume;
    }
    const level = sound.muted ? 0 : sound.volume;
    const pct = Math.round(level * 100);
    muteBtn.innerHTML = icon(level ? 'volume' : 'volumeOff');
    const label = level ? `Volume ${pct}% (M mutes)` : 'Muted (M unmutes)';
    muteBtn.setAttribute('aria-label', label); muteBtn.title = label;
    volSlider.setAttribute('aria-valuenow', String(pct));
    volSlider.setAttribute('aria-valuetext', level ? `${pct}%` : 'Muted');
    volSlider.style.setProperty('--v', `${pct}%`);
    volValue.textContent = level ? String(pct) : 'Off';
  }
  function setSound(patch) {
    Object.assign(sound, patch);
    // unmuting at zero volume brings the volume back up
    if (patch.muted === false && !sound.volume) sound.volume = 1;
    persist.save('muted', sound.muted); persist.save('volume', sound.volume);
    applySound(app.current && app.current.type === 'video' ? app.current.source : null);
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
  async function togglePlay() {
    const it = app.current;
    if (!it || it.type !== 'video') return;
    if (storyboard.active) { storyboard.toggleAnimation(); return; }
    if (!it.source.paused) { it.source.pause(); return; }
    if (it.fpsReady) await it.fpsReady;      // still measuring the frame rate (plays muted for a moment)
    if (app.current !== it || storyboard.active) return;
    applySound(it.source);
    if (it.source.ended) it.source.currentTime = 0;
    it.source.play().catch(e => toast(e.message, { kind: 'error' }));
  }
  function stepFrame(dir) {
    const it = app.current;
    if (!it || it.type !== 'video' || storyboard.active) return;
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
    if (storyboard.active) return;
    const on = force ?? !stage.compare;
    stage.setCompare(on); compareBtn.setAttribute('aria-pressed', String(on));
  }
  function toggleGrid(force) {
    if (storyboard.active) return;
    const on = force ?? !stage.grid;
    stage.setGrid(on); gridBtn.setAttribute('aria-pressed', String(on));
    if (on && stage.zoom < 6 && app.result) toast('The grid shows from 6× zoom');
  }
  function zoomMenu(anchor) {
    const view = storyboard.active ? storyboard : stage;
    menu(anchor, [
      { label: storyboard.active ? 'Fit canvas to view' : 'Fit to view', kbd: 'F', icon: 'fit', onClick: () => view.fit() },
      'sep',
      ...[1, 2, 4, 8, 16, 32].map(z => ({ label: `${z}×`, sub: z === 1 && !storyboard.active ? 'One screen pixel per pixel' : null, onClick: () => view.zoomTo(z) })),
      'sep',
      { label: 'Zoom in', kbd: '+', icon: 'zoomIn', onClick: () => view.zoomStep(1) },
      { label: 'Zoom out', kbd: '-', icon: 'zoomOut', onClick: () => view.zoomStep(-1) },
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
    const selecting = storyboard.active;
    const offNote = selecting ? 'Turn off frame selection first' : null;
    menu(anchor, [
      { group: 'Image' },
      { label: 'PNG', sub: offNote || (app.result ? `${app.result.width * s.export.scale} × ${app.result.height * s.export.scale}, ${s.export.scale}× scale` : 'Open an image first'), icon: 'image', kbd: 'Ctrl S', disabled: !app.result || selecting, onClick: () => app.exportPNG() },
      { label: 'Copy to clipboard', sub: offNote, icon: 'copy', disabled: !app.result || selecting, onClick: () => app.copyImage() },
      { label: app.items.length > 1 ? `All ${app.items.length} files as ZIP` : 'All files as ZIP', sub: app.items.length > 1 ? null : 'Add two or more files', icon: 'zip', disabled: app.items.length < 2, onClick: () => app.exportZip() },
      { group: 'Animation' },
      { label: video ? 'GIF from this video' : 'GIF from all images', icon: 'gif', disabled: !video && images < 2, onClick: () => app.exportAnimation({ ...animDefaults(), format: 'gif' }) },
      { label: 'More formats…', sub: 'WebM, MP4, PNG sequence, sprite sheet', icon: 'film', onClick: () => { inspector.setTab('export'); if (shell.dataset.insp !== 'open') togglePanel('insp'); } },
      { group: 'Other' },
      { label: 'Tileset', sub: offNote || '16 × 16 tiles, duplicates removed', icon: 'tiles', disabled: !app.result || selecting, onClick: () => app.exportTileset({ tile: 16, flips: false }) },
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
      ['Next / previous dither', 'D  Shift D'], ['Play / pause video', 'Space'], ['Mute / unmute video', 'M'], ['Rename file', 'F2'], ['Step one frame', ', .'], ['Library', '\\'], ['Inspector', '/'],
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
      case 'f': case 'F': if (storyboard.active) storyboard.fit(); else stage.fit(); break;
      case '+': case '=': if (storyboard.active) storyboard.zoomStep(1); else stage.zoomIn(); break;
      case '-': case '_': if (storyboard.active) storyboard.zoomStep(-1); else stage.zoomOut(); break;
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
      case ' ': if (e.target.closest('button')) break; if (app.current?.type === 'video') { e.preventDefault(); togglePlay(); } break;
      case 'F2': if (app.current) { e.preventDefault(); startRename(app.current); } break;
      case 'm': case 'M': if (app.current?.type === 'video' && !soundBox.hidden) { e.preventDefault(); setSound({ muted: !sound.muted }); } break;
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
  if (usePersist && options.restore !== false) restoreSaved().catch(e => console.warn('[workspace]', e));

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
