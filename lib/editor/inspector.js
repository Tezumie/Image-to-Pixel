// Right-hand inspector: Setup (everything that changes the image) and Export.

import { h, render } from './dom.js';
import { icon } from './icons.js';
import { section, slider, select, segmented, toggle, colorInput, numberInput, field } from './controls.js';
import { exportSize } from './exporter.js';
import { isFullClipDefault, INITIAL_INTERVAL_SECONDS } from './storyboard.js';
import { DITHER_METHODS, ditherKind, defaultSettings, ASPECTS, cropRect } from '../core/settings.js';
import * as persist from './persist.js';
import { PALETTES } from '../core/palette/builtin.js';
import { parseMatrix } from '../core/dither/matrices.js';

export function createInspector(app) {
  const { store } = app;
  const up = (patch, key) => store.update(patch, { key });
  const commit = () => store.commit();
  const S = () => store.settings;
  const DEF = defaultSettings();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Sections start collapsed except the first of each tab; the person's choice is remembered.
  const openState = persist.load('sections', {});
  const sec = (key, title, defaultOpen, groups, ...children) => section(title, {
    open: openState[key] ?? defaultOpen,
    onToggle: open => { openState[key] = open; persist.save('sections', openState); },
    onReset: groups ? () => {
      const patch = {};
      for (const g of groups) patch[g] = JSON.parse(JSON.stringify(DEF[g]));
      store.update(patch);
    } : null,
  }, ...children);

  // ---- head: stats + tabs
  const statSize = h('div.v', { text: '–' });
  const statColors = h('div.v', { text: '–' });
  const statTime = h('div.v', { text: '–' });
  const stats = h('div.itp-stats', { 'aria-live': 'polite' },
    h('div.itp-stat', {}, h('div.k', { text: 'Output' }), statSize),
    h('div.itp-stat', {}, h('div.k', { text: 'Colours' }), statColors),
    h('div.itp-stat', {}, h('div.k', { text: 'Render' }), statTime));

  const tabSetup = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', id: 'itp-tab-setup', 'aria-controls': 'itp-pane-setup', html: `${icon('sliders')}<span>Setup</span>` });
  const tabExport = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', id: 'itp-tab-export', 'aria-controls': 'itp-pane-export', html: `${icon('download')}<span>Export</span>` });
  const tabs = h('div.itp-seg', { role: 'tablist', 'aria-label': 'Inspector' }, tabSetup, tabExport);

  // ---- which settings am I editing? (only shown with two or more files)
  const scope = segmented({
    label: 'Settings apply to', bare: true,
    options: [{ value: 'shared', label: 'All files', icon: 'layers' }, { value: 'own', label: 'This file', icon: 'unlink' }],
    value: 'shared',
    onChange: v => app.current && app.setOwn(app.current, v === 'own'),
  });
  const scopeNote = h('span.itp-scope-note', {});
  const scopeRow = h('div.itp-scope', { hidden: true }, h('div.lab', {}, h('span', { text: 'Settings apply to' }), scopeNote), scope.el);

  // =========================================================== SETUP
  // ---- size
  const sizeMode = segmented({ label: 'Size by', options: [{ value: 'width', label: 'Width' }, { value: 'block', label: 'Pixel size' }], value: 'width', onChange: v => up({ size: { mode: v } }) });
  const width = slider({ label: 'Pixel width', min: 8, max: 512, step: 1, value: 96, reset: 96, onInput: v => up({ size: { width: v } }, 'width'), onCommit: commit });
  const height = numberInput({ label: 'Height', min: 0, max: 2048, help: 'Leave empty to keep the aspect ratio.', onChange: v => up({ size: { height: v } }) });
  height.input.placeholder = 'Auto';
  const block = slider({ label: 'Pixel size', min: 1, max: 64, step: 1, value: 8, reset: 8, help: 'How many source pixels become one output pixel.', onInput: v => up({ size: { block: v } }, 'block'), onCommit: commit });
  const resample = segmented({ label: 'Resample', options: [{ value: 'box', label: 'Average' }, { value: 'nearest', label: 'Nearest' }], value: 'box', help: 'Nearest keeps hard edges; use it for art that is already pixelated.', onChange: v => up({ size: { resample: v } }) });
  const detect = h('button.itp-btn.small.outline', { type: 'button', html: `${icon('grid')}<span>Detect grid</span>`, title: 'Find the pixel size of upscaled pixel art', onclick: () => app.detectGrid() });
  const widthBox = h('div', { style: { display: 'contents' } }, width.el, height.el);
  const blockBox = h('div', { style: { display: 'contents' } }, block.el);
  const secSize = sec('size', 'Size', true, ['size'], sizeMode.el, widthBox, blockBox, resample.el, h('div.itp-row', {}, detect));

  // ---- frame (crop to an aspect ratio, zoom in, choose the part)
  const aspectBtns = ASPECTS.map(a => {
    const r = a.ratio || 4 / 3;
    const glyph = h('i', { style: { width: `${Math.round(r >= 1 ? 16 : 16 * r)}px`, height: `${Math.round(r >= 1 ? 16 / r : 16)}px` } });
    if (!a.ratio) glyph.classList.add('orig');
    return h('button', { type: 'button', 'aria-pressed': 'false', title: a.id === 'original' ? 'The source\'s own shape' : `Crop to ${a.label}`, onclick: () => up({ frame: { aspect: a.id } }) }, glyph, h('span', { text: a.label }));
  });
  const aspects = h('div.itp-aspects', { role: 'group', 'aria-label': 'Aspect ratio' }, ...aspectBtns);
  const fZoom = slider({ label: 'Zoom', min: 1, max: 8, step: 0.05, value: 1, reset: 1, help: 'Crop into the middle of the frame.', onInput: v => up({ frame: { zoom: v } }, 'fz'), onCommit: commit });
  const fX = slider({ label: 'Horizontal position', min: 0, max: 1, step: 0.01, scale: 100, value: 0.5, reset: 0.5, onInput: v => up({ frame: { x: v } }, 'fx'), onCommit: commit });
  const fY = slider({ label: 'Vertical position', min: 0, max: 1, step: 0.01, scale: 100, value: 0.5, reset: 0.5, onInput: v => up({ frame: { y: v } }, 'fy'), onCommit: commit });
  const secFrame = sec('frame', 'Frame', false, ['frame'], field('Aspect ratio', aspects), fZoom.el, fX.el, fY.el);

  // ---- palette
  const palSource = select({ label: 'Source', options: [
    { value: 'builtin', label: 'Built-in palette' }, { value: 'custom', label: 'Custom colours' },
    { value: 'extract', label: 'From the image' }, { value: 'none', label: 'None (keep colours)' },
  ], onChange: v => up({ palette: { source: v } }) });
  const palBuiltin = select({ label: 'Palette', options: PALETTES.map(p => ({ value: p.id, label: `${p.name} (${p.colors.length})` })), onChange: v => up({ palette: { source: 'builtin', id: v } }) });
  const palCount = slider({ label: 'Number of colours', min: 2, max: 64, step: 1, value: 16, reset: 16, onInput: v => up({ palette: { count: v } }, 'count'), onCommit: commit });
  const swatches = h('div.itp-swatches', { role: 'list', 'aria-label': 'Palette colours' });
  const swCount = h('span.val.num', {});
  const swatchField = field('Colours', swatches, { value: swCount });
  const palDistance = segmented({ label: 'Colour matching', options: [{ value: 'oklab', label: 'Perceptual' }, { value: 'rgb', label: 'RGB' }], value: 'oklab', onChange: v => up({ palette: { distance: v } }) });
  const palActions = h('div.itp-row', { style: { flexWrap: 'wrap' } },
    h('button.itp-btn.small.outline', { type: 'button', html: `${icon('upload')}<span>Import</span>`, title: '.gpl, .hex, .pal, .txt or .json', onclick: () => app.importPalette() }),
    h('button.itp-btn.small.outline', { type: 'button', html: `${icon('palette')}<span>Lospec</span>`, onclick: () => app.lospecDialog() }),
    h('button.itp-btn.small.outline', { type: 'button', html: `${icon('pipette')}<span>Pick</span>`, title: 'Add colours by clicking the image', 'aria-pressed': 'false', onclick: e => app.togglePicker(e.currentTarget) }),
    h('button.itp-btn.small', { type: 'button', html: `${icon('download')}<span>Save</span>`, title: 'Save to Your palettes', onclick: () => app.savePalette() }));
  const secPal = sec('palette', 'Palette', false, ['palette'], palSource.el, palBuiltin.el, palCount.el, swatchField, palDistance.el, palActions);

  // ---- dither
  const groups = { none: 'None', ordered: 'Ordered', diffusion: 'Error diffusion' };
  const dMethod = select({ label: 'Method', options: DITHER_METHODS.map(m => ({ value: m.id, label: m.label, group: groups[m.kind] })), onChange: v => up({ dither: { method: v } }) });
  const dStrength = slider({ label: 'Strength', min: 0, max: 1, step: 0.01, scale: 100, value: 0.6, reset: 0.6, onInput: v => up({ dither: { strength: v } }, 'strength'), onCommit: commit });
  const matrixText = h('textarea.itp-input', { rows: 4, spellcheck: false, 'aria-label': 'Custom threshold matrix', placeholder: '0 8 2 10\n12 4 14 6\n3 11 1 9\n15 7 13 5' });
  const matrixHelp = h('div.help', { text: 'Rows of numbers, up to 16×16. Only their order matters.' });
  matrixText.addEventListener('change', () => {
    try { up({ dither: { method: 'custom', matrix: parseMatrix(matrixText.value) } }); matrixHelp.textContent = 'Rows of numbers, up to 16×16. Only their order matters.'; matrixHelp.style.color = ''; }
    catch (e) { matrixHelp.textContent = e.message; matrixHelp.style.color = 'var(--danger)'; }
  });
  const matrixBox = h('div.itp-field', {}, h('div.lab', {}, h('span', { text: 'Matrix' })), matrixText, matrixHelp);
  const secDither = sec('dither', 'Dither', false, ['dither'], dMethod.el, dStrength.el, matrixBox);

  // ---- adjust
  const pct = { min: -1, max: 1, step: 0.01, scale: 100, value: 0, reset: 0 };
  const aBright = slider({ label: 'Brightness', ...pct, onInput: v => up({ adjust: { brightness: v } }, 'br'), onCommit: commit });
  const aContrast = slider({ label: 'Contrast', ...pct, onInput: v => up({ adjust: { contrast: v } }, 'co'), onCommit: commit });
  const aSat = slider({ label: 'Saturation', ...pct, onInput: v => up({ adjust: { saturation: v } }, 'sa'), onCommit: commit });
  const aHue = slider({ label: 'Hue', min: -180, max: 180, step: 1, value: 0, reset: 0, help: 'Rotates every colour around the colour wheel; greys stay grey.', onInput: v => up({ adjust: { hue: v } }, 'hu'), onCommit: commit });
  const aGamma = slider({ label: 'Gamma', min: 0.2, max: 3, step: 0.05, value: 1, reset: 1, onInput: v => up({ adjust: { gamma: v } }, 'ga'), onCommit: commit });
  const secAdjust = sec('adjust', 'Adjust', false, ['adjust'], aBright.el, aContrast.el, aSat.el, aHue.el, aGamma.el);

  // ---- cleanup & outline
  const alphaCut = slider({ label: 'Alpha cutoff', min: 0, max: 1, step: 0.01, scale: 100, value: 0.5, reset: 0.5, help: 'Pixels less opaque than this become transparent.', onInput: v => up({ alpha: { threshold: v } }, 'alpha'), onCommit: commit });
  const orphans = toggle({ label: 'Remove stray pixels', onChange: v => up({ cleanup: { orphans: v } }) });
  const smooth = toggle({ label: 'Smooth small specks', onChange: v => up({ cleanup: { smooth: v } }) });
  const olMode = segmented({ label: 'Outline', options: [{ value: 'none', label: 'None' }, { value: 'outer', label: 'Outside' }, { value: 'inner', label: 'Inside' }], value: 'none', help: 'Follows transparent edges.', onChange: v => up({ outline: { mode: v } }) });
  const olColor = colorInput({ label: 'Outline colour', onChange: v => up({ outline: { color: v } }, 'olc') });
  const olCorners = toggle({ label: 'Include diagonals', onChange: v => up({ outline: { corners: v } }) });
  const secClean = sec('cleanup', 'Cleanup & outline', false, ['cleanup', 'outline', 'alpha'], orphans.el, smooth.el, alphaCut.el, olMode.el, olColor.el, olCorners.el);

  const setupPane = h('div', { id: 'itp-pane-setup', role: 'tabpanel', 'aria-labelledby': 'itp-tab-setup' }, secSize.el, secFrame.el, secPal.el, secDither.el, secAdjust.el, secClean.el);

  // =========================================================== EXPORT
  const exMode = segmented({ label: 'Size', options: [{ value: 'scale', label: 'Scale' }, { value: 'source', label: 'Source size' }], value: 'scale', help: '', onChange: v => up({ export: { size: v } }) });
  const exScale = slider({ label: 'Scale', min: 1, max: 32, step: 1, value: 4, reset: 4, help: 'Whole-number upscale keeps every pixel square.', onInput: v => up({ export: { scale: v } }, 'scale'), onCommit: commit });
  const exSizeOut = h('span.val.num', {});
  const exGrid = toggle({ label: 'Grid lines', onChange: v => up({ export: { grid: v } }) });
  const exIndexed = toggle({ label: 'Indexed PNG', help: 'Smaller files; up to 256 colours.', onChange: v => up({ export: { indexed: v } }) });
  const btnPNG = h('button.itp-btn.primary.block', { type: 'button', html: `${icon('download')}<span>Download PNG</span>`, onclick: () => app.exportPNG() });
  const btnCopy = h('button.itp-btn.outline.block', { type: 'button', html: `${icon('copy')}<span>Copy image</span>`, onclick: () => app.copyImage() });
  const btnZip = h('button.itp-btn.outline.block', { type: 'button', html: `${icon('zip')}<span>Download all as ZIP</span>`, onclick: () => app.exportZip() });
  const secImage = sec('image', 'Image', true, ['export'], field('Output size', h('div'), { value: exSizeOut }), exMode.el, exScale.el, exGrid.el, exIndexed.el, h('div.itp-grid2', {}, btnPNG, btnCopy), btnZip);

  // animation
  let frameSelection = { active: false, complete: false, count: 0 };
  const anSource = select({ label: 'Frames from', options: [{ value: 'video', label: 'Current video' }, { value: 'files', label: 'All files, in order' }], onChange: () => syncAnim() });
  const anSelect = toggle({ label: 'Frame selection', help: 'Choose individual video frames on the canvas for animation and sprite sheet exports.', onChange: enabled => {
    if (enabled) {
      anSource.set('video');
      // The untouched Animation default is the full clip; start long clips at three seconds.
      const cur = app.current?.type === 'video' ? app.current : null;
      const untouched = cur && !anStart.input.dataset.touched && !anEnd.input.dataset.touched;
      if (untouched && isFullClipDefault(Number(anEnd.input.value) || 0, cur.duration)) {
        anStart.set(0); anEnd.set(Math.min(cur.duration, INITIAL_INTERVAL_SECONDS));
      }
    }
    app.setFrameSelection(enabled);
  } });
  const anFormat = select({ label: 'Format', options: [
    { value: 'gif', label: 'GIF' }, { value: 'webm', label: 'WebM video' }, { value: 'mp4', label: 'MP4 video' }, { value: 'png-seq', label: 'PNG sequence (ZIP)' },
  ], onChange: () => syncAnim() });
  const anFps = numberInput({ label: 'Frames per second', min: 1, max: 60, onChange: v => {
    anFps.input.dataset.touched = '1'; app.setAnimationFps?.(v);
  } });
  const changeAnimRange = () => {
    anStart.input.dataset.touched = '1'; anEnd.input.dataset.touched = '1';
    app.setFrameRange?.(Number(anStart.input.value) || 0, Number(anEnd.input.value) || 0);
  };
  const anStart = numberInput({ label: 'Start (s)', min: 0, max: 36000, step: 0.001, onChange: changeAnimRange });
  const anEnd = numberInput({ label: 'End (s)', min: 0, max: 36000, step: 0.001, onChange: changeAnimRange });
  const anSize = select({ label: 'Video size', options: [
    { value: '1080', label: 'Full HD (sharp in any player)' }, { value: '720', label: '720p' }, { value: '2160', label: '4K' }, { value: 'scale', label: 'Same scale as PNG' },
  ], onChange: () => { } });
  anSize.set('1080');
  const anAudio = toggle({ label: 'Keep audio', help: "The video's soundtrack, cut to the same start and end. MP4 and WebM only.", onChange: () => syncAnim() });
  const anAudioInput = anAudio.el.querySelector('input');
  const anNote = h('div.help', {});
  const btnAnim = h('button.itp-btn.primary.block', { type: 'button', html: `${icon('film')}<span>Export animation</span>`, onclick: () => app.exportAnimation(animOpts()) });
  const secAnim = sec('animation', 'Animation', false, null, anSource.el, anSelect.el, anFormat.el, anFps.el, h('div.itp-grid2', {}, anStart.el, anEnd.el), anSize.el, anAudio.el, anNote, btnAnim);
  anFps.set(12); anStart.set(0); anEnd.set(0); anAudio.set(true);
  const animOpts = () => ({ source: anSource.select.value, format: anFormat.select.value, fps: Number(anFps.input.value) || 12, start: Number(anStart.input.value) || 0, end: Number(anEnd.input.value) || 0, rangeTouched: !!(anStart.input.dataset.touched || anEnd.input.dataset.touched), audio: anAudioInput.checked, videoSize: anSize.select.value });

  // sprite sheet
  const shCols = numberInput({ label: 'Columns', min: 0, max: 256, help: '0 = as square as possible.', onChange: () => { } });
  const shPad = numberInput({ label: 'Padding', min: 0, max: 64, onChange: () => { } });
  shCols.set(0); shPad.set(0);
  const btnSheet = h('button.itp-btn.outline.block', { type: 'button', html: `${icon('sheet')}<span>Download sprite sheet</span>`, onclick: () => app.exportSheet({ ...animOpts(), columns: Number(shCols.input.value) || 0, padding: Number(shPad.input.value) || 0 }) });
  const secSheet = sec('sheet', 'Sprite sheet', false, null, h('div.help', { text: 'Packs the frames chosen under Animation into one PNG with a JSON atlas (TexturePacker hash format).' }), h('div.itp-grid2', {}, shCols.el, shPad.el), btnSheet);

  // tileset
  const tsSize = select({ label: 'Tile size', options: [8, 12, 16, 24, 32, 48, 64].map(n => ({ value: String(n), label: `${n} × ${n}` })), onChange: () => { } });
  tsSize.set('16');
  const tsFlips = toggle({ label: 'Count mirrored tiles as duplicates', onChange: () => { } });
  const btnTiles = h('button.itp-btn.outline.block', { type: 'button', html: `${icon('tiles')}<span>Download tileset</span>`, onclick: () => app.exportTileset({ tile: Number(tsSize.select.value), flips: tsFlips.el.querySelector('input').checked }) });
  const secTiles = sec('tileset', 'Tileset', false, null, h('div.help', { text: 'Cuts the current result into tiles, keeps one copy of each and writes a tile map.' }), tsSize.el, tsFlips.el, btnTiles);

  // settings
  const secSettings = sec('settings', 'Settings', false, null,
    h('div.itp-grid2', {},
      h('button.itp-btn.outline', { type: 'button', html: `${icon('link')}<span>Copy link</span>`, onclick: () => app.copyLink() }),
      h('button.itp-btn.outline', { type: 'button', html: `${icon('braces')}<span>Save JSON</span>`, onclick: () => app.saveSettingsFile() })),
    h('button.itp-btn.outline.block', { type: 'button', html: `${icon('upload')}<span>Load settings file</span>`, onclick: () => app.loadSettingsFile() }));

  const exportPane = h('div', { id: 'itp-pane-export', role: 'tabpanel', 'aria-labelledby': 'itp-tab-export', hidden: true }, secImage.el, secAnim.el, secSheet.el, secTiles.el, secSettings.el);

  // ---- footer
  const foot = h('div.itp-insp-foot', {},
    h('button.itp-link', { type: 'button', text: 'Reset to defaults', onclick: () => app.resetSettings() }),
    h('span.muted', { style: { fontSize: 'var(--fs-xs)' }, id: 'itp-backend' }));

  const body = h('div.itp-panel-body', {}, setupPane, exportPane);
  const el = h('aside.itp-insp', { 'aria-label': 'Inspector' }, h('div.itp-insp-head', {}, stats, scopeRow, tabs), h('div', { style: { height: '8px' } }), body, foot);

  function setTab(t) {
    const setup = t === 'setup';
    tabSetup.setAttribute('aria-selected', String(setup)); tabExport.setAttribute('aria-selected', String(!setup));
    setupPane.hidden = !setup; exportPane.hidden = setup;
    if (!setup) syncAnim();
  }
  tabSetup.onclick = () => setTab('setup');
  tabExport.onclick = () => setTab('export');
  tabs.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = tabSetup.getAttribute('aria-selected') === 'true' ? tabExport : tabSetup; next.click(); next.focus(); }
  });

  function syncAnim() {
    const cur = app.current?.type === 'video' ? app.current : null;
    const hasVideo = !!cur;
    const nImages = app.items.filter(i => i.type === 'image').length;
    if (!hasVideo && anSource.select.value === 'video' && nImages > 1) anSource.set('files');
    if (hasVideo && anSource.select.value === 'files' && nImages < 2) anSource.set('video');
    const src = anSource.select.value;
    const ok = src === 'video' ? hasVideo : nImages > 1;
    const selecting = frameSelection.active;
    anSelect.el.hidden = !cur;
    anSelect.set(selecting);
    anSource.select.disabled = selecting;
    anStart.el.hidden = anEnd.el.hidden = src !== 'video';
    btnAnim.disabled = btnSheet.disabled = !ok || (selecting && (!frameSelection.complete || !frameSelection.count));
    // The tile canvas is the preview while selecting, so these would export a stale frame.
    btnPNG.disabled = btnCopy.disabled = btnTiles.disabled = selecting;
    if (cur && !Number(anEnd.input.value)) anEnd.set(Math.round((cur.duration || 0) * 10) / 10);
    if (cur && cur.fps && !anFps.input.dataset.touched) anFps.set(Math.min(30, Math.round(cur.fps)));
    app.setAnimationFps?.(Number(anFps.input.value) || 12);
    const f = anFormat.select.value;
    const isVideo = f === 'mp4' || f === 'webm';
    anAudio.el.hidden = selecting || !(src === 'video' && isVideo);
    anSize.el.hidden = !isVideo;
    const vs = app.videoSupport;
    const noAudio = vs && 'opus' in vs && anAudioInput.checked && !anAudio.el.hidden && !(f === 'mp4' ? vs.aac || vs.opus : vs.opus);
    const selectionNote = selecting ? !frameSelection.complete ? 'Loading video frames...'
      : !frameSelection.count ? 'Select frames on the canvas to enable export.'
      : `${frameSelection.count} selected frames, played at ${Number(anFps.input.value) || 12} fps.${isVideo ? ' Selected frames export without source audio.' : ''} Turn off frame selection to use PNG, Copy or Tileset.` : '';
    const formatNote = !ok
      ? (src === 'video' ? 'Open a video to export an animation.' : 'Add two or more images to animate them.')
      : isVideo && !vs?.[f] ? `${f.toUpperCase()} encoding isn't available in this browser. GIF and PNG sequence always work.`
      : noAudio ? "This browser can't encode audio, so the video will be silent."
      : f === 'mp4' && vs && 'aac' in vs && !vs.aac && vs.opus && anAudioInput.checked && !anAudio.el.hidden
        ? "This browser can't encode AAC, so the MP4's sound will be Opus, which Windows Media Player and QuickTime may not play. WebM, or Chrome/Edge on Windows or macOS, avoids that."
      : '';
    anNote.textContent = [selectionNote, formatNote].filter(Boolean).join(' ');
  }
  anFps.input.addEventListener('change', syncAnim);

  // ---- sync from state
  function renderSwatches(colors, editable) {
    render(swatches, ...colors.map((c, i) => {
      const b = h('button.itp-swatch', { type: 'button', role: 'listitem', title: editable ? `${c}. Click to change, Alt+click to remove` : c, style: { background: c } });
      b.setAttribute('aria-label', editable ? `${c}, edit` : c);
      if (editable) {
        b.addEventListener('click', e => {
          if (e.altKey) { const next = S().palette.colors.filter((_, j) => j !== i); if (next.length) up({ palette: { colors: next } }); return; }
          const inp = h('input', { type: 'color', value: c, style: { position: 'fixed', opacity: 0, pointerEvents: 'none' } });
          document.body.append(inp);
          inp.addEventListener('input', () => { const next = S().palette.colors.slice(); next[i] = inp.value; up({ palette: { colors: next } }, 'sw' + i); });
          inp.addEventListener('change', () => inp.remove());
          inp.click();
        });
      } else {
        b.addEventListener('click', () => { up({ palette: { source: 'custom', colors: S().palette.colors.slice(), name: `${S().palette.name} (edited)` } }); app.toast('Copied to a custom palette you can edit'); });
      }
      return b;
    }), editable ? h('button.itp-swatch.add', { type: 'button', 'aria-label': 'Add colour', title: 'Add colour', html: icon('plus'), onclick: () => up({ palette: { colors: [...S().palette.colors, '#808080'] } }) }) : null);
  }

  let lastPaletteKey = '';
  function sync(s, result) {
    sizeMode.set(s.size.mode);
    widthBox.hidden = s.size.mode !== 'width'; blockBox.hidden = s.size.mode !== 'block';
    width.set(s.size.width); height.set(s.size.height || ''); block.set(s.size.block); resample.set(s.size.resample);
    secSize.setHint(result ? `${result.width} × ${result.height}` : '');

    palSource.set(s.palette.source); palBuiltin.set(s.palette.id);
    palBuiltin.el.hidden = s.palette.source !== 'builtin';
    palCount.el.hidden = s.palette.source !== 'extract';
    palCount.set(s.palette.count);
    palDistance.set(s.palette.distance);
    palDistance.el.hidden = s.palette.source === 'none';
    swatchField.hidden = s.palette.source === 'none';
    const shown = s.palette.source === 'extract' ? (result && result.palette) || [] : s.palette.colors;
    const key = s.palette.source + shown.join();
    if (key !== lastPaletteKey) { lastPaletteKey = key; renderSwatches(shown, s.palette.source === 'custom'); }
    swCount.textContent = String(shown.length);
    secPal.setHint(s.palette.source === 'none' ? 'None' : s.palette.name);

    dMethod.set(s.dither.method); dStrength.set(s.dither.strength);
    const kind = ditherKind(s.dither.method);
    dStrength.el.hidden = kind === 'none';
    matrixBox.hidden = s.dither.method !== 'custom';
    if (s.dither.method === 'custom' && document.activeElement !== matrixText) matrixText.value = (s.dither.matrix || []).map(r => r.join(' ')).join('\n');
    secDither.setHint(s.palette.source === 'none' ? 'Needs a palette' : DITHER_METHODS.find(m => m.id === s.dither.method).label);
    secDither.el.querySelector('select').disabled = s.palette.source === 'none';

    aBright.set(s.adjust.brightness); aContrast.set(s.adjust.contrast); aSat.set(s.adjust.saturation); aHue.set(s.adjust.hue); aGamma.set(s.adjust.gamma);
    const adjusted = s.adjust.brightness || s.adjust.contrast || s.adjust.saturation || s.adjust.hue || s.adjust.gamma !== 1;

    // frame
    aspectBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(ASPECTS[i].id === s.frame.aspect)));
    fZoom.set(s.frame.zoom); fX.set(s.frame.x); fY.set(s.frame.y);
    const cur = app.current;
    const crop = cur ? cropRect(cur.width, cur.height, s.frame) : null;
    // position sliders only matter when the frame leaves room to move in that direction
    fX.el.hidden = !crop || crop.w >= cur.width;
    fY.el.hidden = !crop || crop.h >= cur.height;
    const framed = s.frame.aspect !== 'original' || s.frame.zoom > 1;
    secFrame.setHint(!framed ? '' : [s.frame.aspect !== 'original' ? s.frame.aspect : '', s.frame.zoom > 1 ? `${Math.round(s.frame.zoom * 100) / 100}×` : ''].filter(Boolean).join(', '));
    secFrame.setChanged(!same(s.frame, DEF.frame));

    // scope
    const many = app.items.length > 1;
    scopeRow.hidden = !(cur && (many || cur.own));
    scope.set(cur && cur.own ? 'own' : 'shared');
    const nShared = app.items.filter(i => !i.own).length;
    scopeNote.textContent = cur && cur.own ? 'Only this file' : `${nShared} ${nShared === 1 ? 'file' : 'files'}`;
    el.dataset.scope = cur && cur.own ? 'own' : 'shared';
    secAdjust.setHint(adjusted ? 'Changed' : '');

    alphaCut.set(s.alpha.threshold); orphans.set(s.cleanup.orphans); smooth.set(s.cleanup.smooth);
    olMode.set(s.outline.mode); olColor.set(s.outline.color); olCorners.set(s.outline.corners);
    olColor.el.hidden = olCorners.el.hidden = s.outline.mode === 'none';
    const cl = [s.cleanup.orphans && 'strays', s.cleanup.smooth && 'smooth', s.outline.mode !== 'none' && 'outline'].filter(Boolean);
    secClean.setHint(cl.join(', '));

    // reset icons
    secSize.setChanged(!same(s.size, DEF.size));
    secPal.setChanged(!same(s.palette, DEF.palette));
    secDither.setChanged(!same(s.dither, DEF.dither));
    secAdjust.setChanged(!same(s.adjust, DEF.adjust));
    secClean.setChanged(!same([s.cleanup, s.outline, s.alpha], [DEF.cleanup, DEF.outline, DEF.alpha]));
    secImage.setChanged(!same(s.export, DEF.export));

    exScale.set(s.export.scale); exGrid.set(s.export.grid); exIndexed.set(s.export.indexed); exMode.set(s.export.size);
    exScale.el.hidden = exGrid.el.hidden = s.export.size === 'source';
    const out = exportSize(s, result, app.current);
    exSizeOut.textContent = result ? `${out.width} × ${out.height} px` : '–';
    exMode.el.querySelector('.help')?.remove();
    if (s.export.size === 'source') exMode.el.append(h('div.help', { text: 'The size of the framed part of the source, like a full-resolution download. Pixels can differ by one in size when the ratio isn\'t a whole number.' }));
    btnZip.hidden = app.items.length < 2;
    btnZip.querySelector('span').textContent = `Download all ${app.items.length} as ZIP`;
    syncAnim();
  }

  function setStats(result) {
    if (!result) { statSize.textContent = statColors.textContent = statTime.textContent = '–'; return; }
    statSize.innerHTML = `${result.width}<small>× ${result.height}</small>`;
    const used = result.usedColors().length;
    statColors.innerHTML = result.palette ? `${used}<small>/ ${result.palette.length}</small>` : `${used}`;
    statTime.innerHTML = `${result.ms < 10 ? result.ms.toFixed(1) : Math.round(result.ms)}<small>ms</small>`;
    statTime.parentElement.title = result.backend === 'webgl' ? 'Rendered on the GPU (WebGL 2 via ShaderMate)' : 'Rendered on the CPU';
  }

  return { el, sync, setStats, setTab, syncAnim, animationOptions: animOpts,
    setFrameSelectionState(state) { frameSelection = state; syncAnim(); },
    setAnimationRange({ start, end, user = false }) {
      anStart.set(Number(start.toFixed(3))); anEnd.set(Number(end.toFixed(3)));
      if (user) { anStart.input.dataset.touched = '1'; anEnd.input.dataset.touched = '1'; }
    } };
}

