import { h } from './dom.js';
import { icon } from './icons.js';
import { ZOOM_STEPS } from './stage.js';
import { forEachFrame } from '../core/video/frames.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const seconds = n => `${n.toFixed(3)}s`;
const TILE_W = 140, TILE_H = 124, TILE_GAP = 10;
/** How much of a long clip the first frame-selection load covers. */
export const INITIAL_INTERVAL_SECONDS = 3;
/** The tile canvas never loads more frames than this at once; longer intervals load a window. */
export const MAX_TILE_FRAMES = 1000;
const DEFAULT_END_TOLERANCE = 0.05;
/** Slider geometry: the thumbs travel between the 7px track insets (see .itp-story-range-track). */
const THUMB_INSET = 7;
const GRAB_RADIUS = 11;

/** Both the frames and the animation use the same canvas/world coordinates. */
export function storyboardLayout(videoFps, frameCount, showAnimation = false) {
  const cols = Math.max(1, Math.min(Math.max(1, frameCount), Math.round(videoFps / 2)));
  const rows = Math.max(1, Math.ceil(frameCount / cols));
  const frameWidth = cols * TILE_W + (cols - 1) * TILE_GAP;
  const frameHeight = rows * TILE_H + (rows - 1) * TILE_GAP;
  const animation = showAnimation ? { x: frameWidth + 24, y: 0, w: TILE_W, h: TILE_H + 24 } : null;
  return { cols, width: animation ? animation.x + animation.w : frameWidth,
    height: Math.max(frameHeight, animation?.h || 0), animation };
}

/** Frame-boundary indices; the end is exclusive, including a partial final frame. */
export function videoFrameRange(duration, fps, start = 0, end = duration) {
  const count = Math.max(1, Math.ceil(duration * fps - 1e-6));
  const first = clamp(Math.round(start * fps), 0, count - 1);
  const last = clamp(end >= duration ? count : Math.round(end * fps), first + 1, count);
  return { count, first, last };
}

/** Is this Animation End the untouched full-clip default? Its rounding to one decimal counts too. */
export function isFullClipDefault(end, duration) {
  const roundedDuration = Math.round(duration * 10) / 10;
  // Frame-boundary End values can include a few extra milliseconds (for example 10.005s).
  return end >= duration - DEFAULT_END_TOLERANCE || Math.abs(end - roundedDuration) < 1e-6;
}

/** Keep a frame interval inside the tile budget, holding the edge that is not being dragged. */
export function limitVideoRange({ first, last }, keepEnd = false) {
  if (last - first <= MAX_TILE_FRAMES) return { first, last };
  return keepEnd ? { first: last - MAX_TILE_FRAMES, last } : { first, last: first + MAX_TILE_FRAMES };
}

/** Thumb centre in client px for a frame-boundary value on the interval bar. */
export function sliderThumbX(value, rect, count) {
  const inset = Math.min(THUMB_INSET, rect.width / 2);
  const travel = Math.max(0, rect.width - inset * 2);
  return rect.left + inset + (value / Math.max(1, count)) * travel;
}

/** Frame-boundary index under a pointer position on the interval bar. */
export function sliderIndexAt(clientX, rect, count) {
  const inset = Math.min(THUMB_INSET, rect.width / 2);
  const travel = Math.max(1, rect.width - inset * 2);
  return Math.round(clamp((clientX - rect.left - inset) / travel, 0, 1) * count);
}

/** Keep the first frame-selection load bounded for long videos, and every tile load inside its budget. */
export function initialVideoFrameRange(duration, fps, { start = 0, end = 0, rangeTouched = false } = {}) {
  const explicit = rangeTouched || start > 1e-6 || (end > start && !isFullClipDefault(end, duration));
  const requestedEnd = explicit ? end || duration : Math.min(duration, start + INITIAL_INTERVAL_SECONDS);
  const requested = videoFrameRange(duration, fps, start, requestedEnd);
  const limited = limitVideoRange(requested);
  return limited.last === requested.last ? requested : { ...requested, last: limited.last, capped: true };
}

/** Main-preview interval picker and selectable, processed frame grid. */
export function createVideoStoryboard(app, { onModeChange, onZoomChange, onRangeChange, onSelectionChange, animationOptions }) {
  let item = null, active = false, initialized = false, complete = false;
  let fps = 30, playbackFps = 12, count = 1, first = 0, last = 1, zoom = 1;
  let records = [], selected = new Set(), settingsKey = '';
  let generation = 0, controller = null, timer = null;
  let rangeDragging = false, pendingLoad = false, displayedCount = 0;
  let playing = false, animationTimer = null, animationRecord = null, animationIndex = 0, animationFrames = [];
  const button = (text, onclick, cls = '', props = {}) => h(`button.itp-btn.small${cls}`, { type: 'button', text, onclick, ...props });

  const status = h('span.itp-story-status', { role: 'status', text: 'Choose a time interval below' });
  const selectionLabel = h('span.num', { text: '0 selected' });
  const selectAll = button('Select all', () => {
    records.forEach(r => selected.add(r.index)); syncSelection();
  });
  const clear = button('Clear', () => { selected.clear(); syncSelection(); });
  const zoomLabel = h('span.num', { text: 'Fit' });
  const zoomOut = button('', () => zoomStep(-1), '.icon', { html: icon('zoomOut'), 'aria-label': 'Smaller frame tiles' });
  const zoomIn = button('', () => zoomStep(1), '.icon', { html: icon('zoomIn'), 'aria-label': 'Larger frame tiles' });
  const play = button('', toggleAnimation, '.icon.outline', { html: icon('play'), 'aria-label': 'Play selected', title: 'Play selected (Space)', 'aria-pressed': 'false' });
  const grid = h('div.itp-story-grid', { role: 'group', 'aria-label': 'Video frames. Drag to pan, use the wheel to zoom, and click a frame to select it.' });
  const board = h('canvas.itp-story-canvas', { tabindex: '0', 'aria-label': 'Video frames and selected animation. Drag to pan, scroll to zoom.' });
  const overlay = h('div.itp-story-overlay', {},
    h('div.itp-float.itp-story-head', {}, status, selectionLabel),
    h('div.itp-float.itp-story-actions', {}, selectAll, clear,
      h('div.itp-story-zoom', { role: 'group', 'aria-label': 'Frame tile size' }, zoomOut, zoomLabel, zoomIn), play));
  grid.append(board, overlay);
  const el = h('section.itp-storyboard', { 'aria-label': 'Select video frames', hidden: true }, grid);
  const boardState = { x: 0, y: 0, z: 1, fitted: true, vw: 0, vh: 0, dpr: 1 };

  const startSlider = h('input', { type: 'range', min: 0, max: 1, step: 1, value: 0, 'aria-label': 'Interval start frame' });
  const endSlider = h('input', { type: 'range', min: 0, max: 1, step: 1, value: 1, 'aria-label': 'Interval end frame' });
  const range = h('div.itp-story-range', {}, h('div.itp-story-range-track'), startSlider, endSlider);
  const startInput = h('input.itp-input.num', { type: 'number', min: 0, step: '0.001', value: 0, 'aria-label': 'Interval start seconds' });
  const endInput = h('input.itp-input.num', { type: 'number', min: 0, step: '0.001', value: 0, 'aria-label': 'Interval end seconds' });
  const fpsLabel = h('span.muted.num');
  const transport = h('div.itp-transport.itp-transport-tiled', { hidden: true, role: 'group', 'aria-label': 'Video time interval' },
    h('label.itp-story-time', {}, 'In', startInput), range, h('label.itp-story-time', {}, 'Out', endInput), fpsLabel);
  startSlider.addEventListener('input', () => changeRange(Number(startSlider.value), last, 'start'));
  endSlider.addEventListener('input', () => changeRange(first, Number(endSlider.value), 'end'));
  startInput.addEventListener('change', () => changeRange(Math.round(Number(startInput.value) * fps), last, 'start'));
  endInput.addEventListener('change', () => changeRange(first, Math.round(Number(endInput.value) * fps), 'end'));
  // The two inputs stay keyboard-operable, but pointer drags are handled here so the handles work in
  // every browser: Firefox never forwards pointer events to ::-moz-range-thumb, so a transparent
  // input cannot rely on its native thumb.
  let dragEdge = null, dragPointer = null;
  range.addEventListener('pointerdown', e => {
    if (!initialized || rangeDragging || e.button !== 0) return;
    const rect = range.getBoundingClientRect();
    const dStart = Math.abs(e.clientX - sliderThumbX(first, rect, count));
    const dEnd = Math.abs(e.clientX - sliderThumbX(last, rect, count));
    const nearStart = dStart <= dEnd;
    if ((nearStart ? dStart : dEnd) > GRAB_RADIUS) return;   // the track: normal arrow, clicks do nothing
    dragEdge = nearStart ? 'start' : 'end';
    (nearStart ? startSlider : endSlider).focus({ preventScroll: true });
    rangeDragging = true; dragPointer = e.pointerId;
    range.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (pendingLoad) clearTimeout(timer);
  });
  range.addEventListener('pointermove', e => {
    if (rangeDragging && e.pointerId !== dragPointer) return;   // a second finger never moves the handle
    const rect = range.getBoundingClientRect();
    if (!rangeDragging) {
      const distance = Math.min(Math.abs(e.clientX - sliderThumbX(first, rect, count)), Math.abs(e.clientX - sliderThumbX(last, rect, count)));
      range.style.cursor = distance <= GRAB_RADIUS ? 'ew-resize' : '';
      return;
    }
    const frame = sliderIndexAt(e.clientX, rect, count);
    if (dragEdge === 'start') changeRange(frame, last, 'start'); else changeRange(first, frame, 'end');
  });
  range.addEventListener('pointerleave', () => { if (!rangeDragging) range.style.cursor = ''; });
  const endRangeDrag = e => {
    if (!rangeDragging || e.pointerId !== dragPointer) return;
    rangeDragging = false; dragEdge = null; dragPointer = null;
    if (pendingLoad) queueLoad();
  };
  window.addEventListener('pointerup', endRangeDrag);
  window.addEventListener('pointercancel', endRangeDrag);

  function syncRange(user = false) {
    startSlider.max = endSlider.max = String(count);
    startSlider.value = String(first); endSlider.value = String(last);
    startSlider.setAttribute('aria-valuetext', seconds(first / fps));
    endSlider.setAttribute('aria-valuetext', seconds(Math.min(item.duration, last / fps)));
    startInput.max = endInput.max = String(item.duration);
    startInput.value = (first / fps).toFixed(3);
    endInput.value = Math.min(item.duration, last / fps).toFixed(3);
    range.style.setProperty('--from', `${first / count * 100}%`);
    range.style.setProperty('--to', `${last / count * 100}%`);
    // Keep both thumbs reachable when the interval is only one frame wide.
    startSlider.style.zIndex = first > count / 2 ? '3' : '2';
    fpsLabel.textContent = `${fps} fps`;
    onRangeChange?.({ start: first / fps, end: Math.min(item.duration, last / fps), user });
  }

  function changeRange(a, b, edge) {
    if (!initialized || !Number.isFinite(a) || !Number.isFinite(b)) { if (item) syncRange(); return; }
    const nextFirst = clamp(a, 0, edge === 'start' ? last - 1 : count - 1);
    const nextLast = clamp(b, edge === 'end' ? first + 1 : nextFirst + 1, count);
    const limited = limitVideoRange({ first: nextFirst, last: nextLast }, edge === 'end');
    if (limited.first !== nextFirst || limited.last !== nextLast) notifyCapped();
    applyRange(limited.first, limited.last, true);
  }

  function applyRange(a, b, user = false) {
    if (a === first && b === last) { syncRange(user); return; }
    first = a; last = b;
    selected = new Set([...selected].filter(i => i >= first && i < last));
    syncRange(user); queueLoad();
  }

  function setRange(start, end) {
    if (!active || !initialized) return;
    // An empty or backwards End follows the export rule: run to the end of the clip.
    const r = videoFrameRange(item.duration, fps, start, end > start ? end : item.duration);
    const limited = limitVideoRange(r);
    if (limited.first !== r.first || limited.last !== r.last) notifyCapped();
    applyRange(limited.first, limited.last);
  }

  function boardMetrics() {
    return storyboardLayout(fps, displayedCount, !!animationRecord);
  }

  function boardResize() {
    const r = grid.getBoundingClientRect();
    const d = Math.min(3, window.devicePixelRatio || 1);
    boardState.vw = r.width; boardState.vh = r.height; boardState.dpr = d;
    board.width = Math.max(1, Math.round(r.width * d)); board.height = Math.max(1, Math.round(r.height * d));
    if (boardState.fitted) fitBoard(); else drawBoard();
  }

  function fitBoard(notify = true) {
    const m = boardMetrics();
    if (!records.length) { boardState.x = boardState.vw / 2; boardState.y = boardState.vh / 2; drawBoard(); return; }
    const height = boardContentHeight();
    boardState.z = Math.max(0.05, Math.min(128, (boardState.vw - 24) / m.width, (height - 24) / m.height));
    boardState.x = (boardState.vw - m.width * boardState.z) / 2;
    boardState.y = (height - m.height * boardState.z) / 2;
    boardState.fitted = true; syncZoom();
    drawBoard(); if (notify) onZoomChange?.();
  }

  function focusAnimation() {
    const r = boardMetrics().animation;
    if (!r) return;
    // Focus by panning only: playing must not change the canvas zoom.
    const height = boardContentHeight();
    boardState.x = boardState.vw / 2 - (r.x + r.w / 2) * boardState.z;
    boardState.y = height / 2 - (r.y + r.h / 2) * boardState.z;
    boardState.fitted = false; syncZoom(); drawBoard(); onZoomChange?.();
    board.focus({ preventScroll: true });
  }

  function boardContentHeight() {
    // Fit above the floating controls without shrinking the interactive canvas.
    return Math.max(1, boardState.vh - overlay.offsetHeight - 24);
  }

  function tileRect(i) {
    const m = boardMetrics();
    const col = i % m.cols, row = Math.floor(i / m.cols);
    return { x: col * (TILE_W + TILE_GAP), y: row * (TILE_H + TILE_GAP), w: TILE_W, h: TILE_H };
  }

  function drawBoard() {
    const ctx = board.getContext('2d');
    const { dpr, vw, vh, x, y, z } = boardState;
    const css = getComputedStyle(el);
    const stageColor = css.getPropertyValue('--stage').trim() || '#1b1c20';
    const panelColor = css.getPropertyValue('--panel').trim() || '#25262b';
    const raisedColor = css.getPropertyValue('--raised').trim() || '#303137';
    const mutedColor = css.getPropertyValue('--muted').trim() || '#a1a3ad';
    const accentColor = css.getPropertyValue('--accent').trim() || '#ffbd4a';
    const accentSoft = css.getPropertyValue('--accent-soft').trim() || '#40351e';
    const lineColor = css.getPropertyValue('--line').trim() || '#45464d';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, board.width, board.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = stageColor; ctx.fillRect(0, 0, vw, vh);
    ctx.imageSmoothingEnabled = false;
    const font = css.getPropertyValue('--font-ui').trim() || 'sans-serif';
    function drawTile(record, r, isAnimation = false) {
      const sx = x + r.x * z, sy = y + r.y * z, sw = r.w * z, sh = r.h * z;
      if (sx > vw || sy > vh || sx + sw < 0 || sy + sh < 0) return;
      const highlight = isAnimation || selected.has(record.index);
      ctx.fillStyle = highlight ? accentSoft : panelColor;
      ctx.fillRect(sx, sy, sw, sh);
      const pad = 6 * z, labelH = 18 * z, titleH = isAnimation ? 24 * z : 0;
      const scale = Math.min((sw - pad * 2) / record.canvas.width, (sh - titleH - labelH - pad * 2) / record.canvas.height);
      const iw = record.canvas.width * scale, ih = record.canvas.height * scale;
      ctx.fillStyle = raisedColor;
      ctx.fillRect(sx + pad, sy + titleH + pad, sw - pad * 2, sh - titleH - labelH - pad * 2);
      ctx.drawImage(record.canvas, sx + (sw - iw) / 2, sy + titleH + pad + (sh - titleH - labelH - pad * 2 - ih) / 2, iw, ih);
      ctx.save(); ctx.beginPath(); ctx.rect(sx + pad, sy, sw - pad * 2, sh); ctx.clip();
      ctx.font = `${11 * z}px ${font}`; ctx.fillStyle = mutedColor;
      if (isAnimation) {
        ctx.fillStyle = accentColor;
        ctx.fillText('Selected animation', sx + pad, sy + 17 * z);
        ctx.fillStyle = mutedColor;
        ctx.fillText(`${animationIndex + 1} of ${animationFrames.length} / ${playbackFps} fps`, sx + pad, sy + sh - 6 * z);
      } else ctx.fillText(`#${record.index} / ${seconds(record.time)}`, sx + pad, sy + sh - 6 * z);
      ctx.restore();
      ctx.strokeStyle = highlight ? accentColor : lineColor;
      ctx.lineWidth = Math.max(1, z); ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    }
    records.forEach((record, i) => drawTile(record, tileRect(i)));
    if (animationRecord) drawTile(animationRecord, boardMetrics().animation, true);
  }

  function selectBoardPoint(clientX, clientY) {
    if (!complete) return;
    const r = grid.getBoundingClientRect();
    const wx = (clientX - r.left - boardState.x) / boardState.z;
    const wy = (clientY - r.top - boardState.y) / boardState.z;
    const hit = records.find((record, i) => { const t = tileRect(i); return wx >= t.x && wx <= t.x + t.w && wy >= t.y && wy <= t.y + t.h; });
    if (!hit) return;
    if (selected.has(hit.index)) selected.delete(hit.index); else selected.add(hit.index);
    syncSelection();
  }

  let boardDrag = null;
  const boardPointers = new Map();
  board.addEventListener('pointerdown', e => {
    board.focus({ preventScroll: true }); board.setPointerCapture(e.pointerId);
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (boardPointers.size === 2) { boardDrag = null; return; }
    boardDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, ox: boardState.x, oy: boardState.y, moved: false };
  });
  board.addEventListener('pointermove', e => {
    if (!boardPointers.has(e.pointerId)) return;
    const previous = boardPointers.get(e.pointerId);
    boardPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (boardPointers.size === 2) {
      const [a, b] = [...boardPointers.values()];
      const oldOther = [...boardPointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (oldOther) {
        const oldDistance = Math.hypot(previous.x - oldOther.x, previous.y - oldOther.y);
        const newDistance = Math.hypot(a.x - b.x, a.y - b.y);
        const r = grid.getBoundingClientRect();
        if (oldDistance > 0) zoomTo(boardState.z * newDistance / oldDistance, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      boardDrag = null;
      return;
    }
    if (!boardDrag || boardDrag.pointerId !== e.pointerId) return;
    const dx = e.clientX - boardDrag.x, dy = e.clientY - boardDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) boardDrag.moved = true;
    boardState.x = boardDrag.ox + dx; boardState.y = boardDrag.oy + dy; boardState.fitted = false; drawBoard();
  });
  board.addEventListener('pointerup', e => {
    boardPointers.delete(e.pointerId);
    if (!boardDrag || boardDrag.pointerId !== e.pointerId) return;
    const click = !boardDrag.moved; const { x, y } = e; boardDrag = null;
    if (click) selectBoardPoint(x, y);
    syncZoom(); onZoomChange?.();
  });
  board.addEventListener('pointercancel', e => { boardPointers.delete(e.pointerId); boardDrag = null; });
  board.addEventListener('wheel', e => {
    e.preventDefault();
    const r = grid.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (trackpadPan) { boardState.x -= e.deltaX; boardState.y -= e.deltaY; boardState.fitted = false; drawBoard(); syncZoom(); onZoomChange?.(); return; }
    if (e.ctrlKey && e.deltaMode === 0) zoomTo(boardState.z * Math.exp(-e.deltaY * 0.01), cx, cy);
    else zoomStep(e.deltaY < 0 ? 1 : -1, cx, cy);
  }, { passive: false });
  board.addEventListener('dblclick', () => fitBoard());
  new ResizeObserver(boardResize).observe(grid);
  new ResizeObserver(() => { if (active && boardState.fitted) fitBoard(); }).observe(overlay);

  /** Long intervals load a window of their frames; say so once, not on every drag step. */
  let cappedNotice = 0;
  function notifyCapped() {
    const now = performance.now();
    if (now - cappedNotice < 2000) return;
    cappedNotice = now;
    app.toast(`This interval is longer than ${MAX_TILE_FRAMES} frames, so only ${MAX_TILE_FRAMES} are loaded. Narrow the range to reach the rest.`);
  }

  function cancelLoad() {
    generation++; clearTimeout(timer); controller?.abort(); controller = null;
    pendingLoad = false;
    grid.setAttribute('aria-busy', 'false');
  }

  function visualKey() {
    const { export: ignored, ...visual } = app.store.settings;
    return JSON.stringify(visual);
  }

  function queueLoad() {
    cancelLoad(); stopAnimation(true); complete = false;
    syncButtons();
    if (!active || !initialized) return;
    pendingLoad = true;
    status.textContent = `Waiting to load ${last - first} frames...`;
    grid.setAttribute('aria-busy', 'true');
    const token = generation;
    if (!rangeDragging) timer = setTimeout(() => loadFrames(token), 300);
  }

  async function loadFrames(token) {
    const sourceItem = item, from = first, to = last, rate = fps;
    pendingLoad = false; displayedCount = to - from;
    records = []; drawBoard(); syncButtons();
    status.textContent = `Loading ${to - from} frames...`;
    const settings = app.store.settings;
    settingsKey = visualKey();
    const ctrl = new AbortController(); controller = ctrl;
    const valid = () => token === generation && active && item === sourceItem && !ctrl.signal.aborted;
    // A separate decoder never seeks or resumes the main preview's video.
    const decoder = h('video', { muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    decoder.muted = true; decoder.src = sourceItem.source.currentSrc || sourceItem.source.src;
    try {
      const times = Array.from({ length: to - from }, (_, i) => Math.min((from + i + 0.5) / rate, sourceItem.duration - 1e-4));
      await forEachFrame(decoder, { fps: rate, times, signal: ctrl.signal, onFrame: async ({ index: offset, time, total }) => {
        if (!valid()) return;
        const result = await app.engine.process(decoder, settings);
        if (!valid()) return;
        const index = from + offset, canvas = result.toCanvas(1);
        records.push({ index, time, result, canvas });
        if (boardState.fitted && records.length === 1) fitBoard(); else drawBoard();
        status.textContent = `Loading ${offset + 1} / ${total} frames`;
        syncButtons();
      } });
      if (!valid()) return;
      complete = true;
      if (boardState.fitted) fitBoard();
      status.textContent = `${records.length} frames / ${seconds(from / rate)} - ${seconds(Math.min(sourceItem.duration, to / rate))}`;
    } catch (e) {
      if (valid() && e.name !== 'AbortError') {
        status.textContent = `Could not load frames: ${e.message}`;
        app.toast(status.textContent, { kind: 'error' });
      }
    } finally {
      decoder.pause(); decoder.removeAttribute('src'); decoder.load();
      if (valid()) { controller = null; grid.setAttribute('aria-busy', 'false'); syncButtons(); }
    }
  }

  function syncButtons() {
    const n = records.filter(r => selected.has(r.index)).length;
    selectionLabel.textContent = `${n} selected`;
    selectAll.disabled = !complete || !records.length;
    clear.disabled = !selected.size;
    play.disabled = !complete || !n;
    onSelectionChange?.({ active, complete, count: n, result: records[0]?.result || null });
  }

  function syncSelection() {
    syncButtons();
    if (animationRecord) {
      const resume = playing;
      stopAnimation();
      animationFrames = records.filter(r => selected.has(r.index));
      if (!animationFrames.length) { stopAnimation(true); return; }
      animationIndex = Math.max(0, animationFrames.findIndex(r => r.index === animationRecord.index));
      animationRecord = animationFrames[animationIndex];
      if (resume) { startAnimation(false); return; }
    }
    drawBoard();
  }

  function startAnimation(focus = true) {
    const frames = records.filter(r => selected.has(r.index));
    if (!active || !complete || !frames.length) return;
    cancelAnimationFrame(animationTimer);
    animationFrames = frames;
    animationIndex = Math.max(0, frames.findIndex(r => r.index === animationRecord?.index));
    playing = true; animationRecord = frames[animationIndex];
    if (focus) focusAnimation();
    syncPlayButton();
    const rate = playbackFps;
    const started = performance.now() - animationIndex * 1000 / rate;
    const tick = () => {
      const i = Math.floor((performance.now() - started) * rate / 1000) % frames.length;
      if (animationIndex !== i) { animationRecord = frames[i]; animationIndex = i; drawBoard(); }
      animationTimer = requestAnimationFrame(tick);
    };
    drawBoard();
    tick();
  }

  function stopAnimation(hide = false) {
    const wasVisible = !!animationRecord;
    cancelAnimationFrame(animationTimer); animationTimer = null; playing = false;
    if (hide) { animationRecord = null; animationFrames = []; animationIndex = 0; }
    syncPlayButton();
    if (hide && wasVisible) { boardState.fitted = true; fitBoard(); return; }
    drawBoard();
  }

  function toggleAnimation() { if (playing) stopAnimation(); else startAnimation(); }

  function syncPlayButton() {
    const label = playing ? 'Pause selected' : 'Play selected';
    play.innerHTML = icon(playing ? 'pause' : 'play');
    play.setAttribute('aria-label', label);
    play.title = `${label} (Space)`;
    play.setAttribute('aria-pressed', String(playing));
  }

  function setPlaybackFps(value) {
    const next = clamp(Number(value) || 12, 1, 60);
    if (next === playbackFps) return;
    playbackFps = next;
    if (playing) startAnimation(false); else drawBoard();
  }

  function exportSelection() {
    if (!active) return null;
    return { active, complete, item, settings: app.store.settings, fps: playbackFps,
      start: first / fps, end: Math.min(item.duration, last / fps),
      renderedFrames: records.filter(r => selected.has(r.index)).map(r => ({ result: r.result, index: r.index })) };
  }

  async function initialize() {
    const target = item;
    status.textContent = 'Detecting video frame rate...';
    startSlider.disabled = endSlider.disabled = startInput.disabled = endInput.disabled = true;
    if (target.fpsReady) await target.fpsReady;
    if (item !== target || !active) return;
    target.source.pause(); fps = target.fps || 30;
    const opts = animationOptions();
    const initial = initialVideoFrameRange(target.duration, fps, opts);
    ({ count, first, last } = initial);
    if (initial.capped) notifyCapped();
    setPlaybackFps(opts.fps);
    initialized = true;
    startSlider.disabled = endSlider.disabled = startInput.disabled = endInput.disabled = false;
    syncRange(); queueLoad();
  }

  function setMode(tiled) {
    if (!item || item.type !== 'video' || tiled === active) return;
    active = tiled;
    el.hidden = transport.hidden = !active;
    if (active) {
      boardResize();
      if (!item.fpsReady) item.source.pause();
      if (!initialized) initialize();
      else {
        const opts = animationOptions();
        setRange(opts.start, opts.end || item.duration);
        setPlaybackFps(opts.fps);
        if (!complete || settingsKey !== visualKey()) queueLoad();
      }
    } else { rangeDragging = false; dragEdge = null; dragPointer = null; cancelLoad(); stopAnimation(true); }
    syncButtons();
    onModeChange(active);
  }

  function setItem(next) {
    if (next === item) return;
    if (active) setMode(false);
    cancelLoad(); stopAnimation(true);
    item = next; records = []; displayedCount = 0; selected.clear(); drawBoard();
    initialized = complete = false; settingsKey = '';
    syncButtons();
  }

  function refresh() {
    if (active && initialized && settingsKey !== visualKey()) queueLoad();
  }

  function syncZoom() {
    zoom = boardState.z;
    zoomLabel.textContent = boardState.fitted ? 'Fit' : zoom >= 1 ? `${Math.round(zoom * 10) / 10}\u00d7` : `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 0.05; zoomIn.disabled = zoom >= 128;
  }

  function zoomTo(value, cx, cy) {
    const nextZoom = clamp(value, 0.05, 128);
    cx ??= boardState.vw / 2; cy ??= boardState.vh / 2;
    const px = (cx - boardState.x) / boardState.z, py = (cy - boardState.y) / boardState.z;
    boardState.z = nextZoom; boardState.x = cx - px * nextZoom; boardState.y = cy - py * nextZoom; boardState.fitted = false;
    drawBoard();
    syncZoom();
    onZoomChange?.();
  }
  function zoomStep(direction, cx, cy) {
    const next = direction > 0 ? ZOOM_STEPS.find(z => z > zoom + 1e-6) || zoom * 1.5
      : [...ZOOM_STEPS].reverse().find(z => z < zoom - 1e-6) || zoom / 1.5;
    zoomTo(next, cx, cy);
  }

  syncButtons();
  return { el, transport, range,
    get active() { return active; }, get zoom() { return zoom; }, get fitted() { return boardState.fitted; },
    frameCanvas: index => records.find(r => r.index === index)?.canvas,
    /** The processed frame the tiles currently show, for stats and size readouts. */
    currentResult: () => records[0]?.result || null,
    setItem, setMode, setRange, setPlaybackFps, exportSelection, refresh, toggleAnimation, zoomTo, zoomStep, fit: fitBoard };
}
