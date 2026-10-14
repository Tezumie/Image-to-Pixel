// The preview canvas: crisp integer zoom, pan, before/after split, pixel grid, eyedropper.

import { h } from './dom.js';
import { icon } from './icons.js';

export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

export function createStage({ onPick, onViewChange } = {}) {
  const screen = h('canvas.screen', { role: 'img', 'aria-label': 'Preview' });
  const splitLeft = h('span.lbl.l', { text: 'Original' });
  const splitRight = h('span.lbl.r', { text: 'Pixel' });
  const handle = h('button', { type: 'button', 'aria-label': 'Drag to compare original and result', html: icon('compare') });
  const split = h('div.itp-split', { hidden: true }, splitLeft, splitRight, handle);
  const el = h('div.itp-view', { tabindex: '0', 'aria-label': 'Canvas. Scroll to zoom, drag to pan.' }, screen, split);
  const ctx = screen.getContext('2d');

  const st = {
    result: null,       // canvas, output size
    original: null,     // drawable, any size
    crop: null,         // part of the original shown, as fractions { x, y, w, h }
    w: 0, h: 0,
    x: 0, y: 0, z: 1,   // top-left in css px, css px per output pixel
    fitted: true,
    compare: false, splitAt: 0.5,
    grid: false, picking: false,
  };
  let dpr = 1, vw = 0, vh = 0, pattern = null, patternKey = '';

  function checker() {
    const css = getComputedStyle(el);
    const a = css.getPropertyValue('--checker-a').trim() || '#1a1b1f', b = css.getPropertyValue('--checker-b').trim() || '#222';
    const key = a + b;
    if (key === patternKey) return pattern;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, 16, 16); g.fillStyle = b; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    patternKey = key; pattern = ctx.createPattern(c, 'repeat');
    return pattern;
  }

  function resize() {
    const r = el.getBoundingClientRect();
    const d = Math.min(3, window.devicePixelRatio || 1);
    // ignore resize notifications where nothing actually changed size
    if (Math.abs(r.width - vw) < 0.5 && Math.abs(r.height - vh) < 0.5 && d === dpr && screen.width > 1) { draw(); return; }
    dpr = d; vw = r.width; vh = r.height;
    screen.width = Math.max(1, Math.round(vw * dpr)); screen.height = Math.max(1, Math.round(vh * dpr));
    if (st.fitted) fit(false); else draw();
  }

  function fitZoom() {
    if (!st.w) return 1;
    const pad = vw < 600 ? 16 : 48;
    // exact, not rounded: a fitted image always fills the same box, whatever its pixel size
    return Math.max(0.05, Math.min((vw - pad) / st.w, (vh - pad) / st.h));
  }

  function fit(notify = true) {
    st.z = fitZoom();
    st.x = (vw - st.w * st.z) / 2; st.y = (vh - st.h * st.z) / 2;
    st.fitted = true;
    draw(); if (notify && onViewChange) onViewChange(view());
  }

  function zoomTo(z, cx = vw / 2, cy = vh / 2) {
    z = Math.max(0.05, Math.min(128, z));
    const px = (cx - st.x) / st.z, py = (cy - st.y) / st.z;
    st.z = z; st.x = cx - px * z; st.y = cy - py * z;
    st.fitted = false;
    draw(); if (onViewChange) onViewChange(view());
  }

  function zoomStep(dir, cx, cy) {
    const cur = st.z;
    let next;
    if (dir > 0) next = ZOOM_STEPS.find(s => s > cur + 1e-6) || cur * 1.5;
    else next = [...ZOOM_STEPS].reverse().find(s => s < cur - 1e-6) || cur / 1.5;
    zoomTo(next, cx, cy);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, screen.width, screen.height);
    if (!st.result) { split.hidden = true; return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // snap the image rect to device pixels so every output pixel is the same size
    const x = Math.round(st.x * dpr) / dpr, y = Math.round(st.y * dpr) / dpr;
    const w = Math.round(st.w * st.z * dpr) / dpr, hh = Math.round(st.h * st.z * dpr) / dpr;
    ctx.fillStyle = checker();
    ctx.fillRect(x, y, w, hh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(st.result, x, y, w, hh);

    if (st.compare && st.original) {
      const sx = x + w * st.splitAt;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, Math.max(0, sx - x), hh); ctx.clip();
      ctx.fillStyle = checker(); ctx.fillRect(x, y, w, hh);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      try {
        const ow = st.original.naturalWidth || st.original.videoWidth || st.original.width;
        const oh = st.original.naturalHeight || st.original.videoHeight || st.original.height;
        const c = st.crop || { x: 0, y: 0, w: 1, h: 1 };
        ctx.drawImage(st.original, c.x * ow, c.y * oh, c.w * ow, c.h * oh, x, y, w, hh);
      } catch { /* video not ready */ }
      ctx.restore();
      split.hidden = false;
      split.style.left = `${sx}px`;
      split.style.top = `${Math.max(0, y)}px`; split.style.bottom = `${Math.max(0, vh - (y + hh))}px`;
    } else split.hidden = true;

    if (st.grid && st.z >= 6) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
      ctx.strokeStyle = 'rgba(127,127,127,0.35)';
      ctx.lineWidth = 1 / dpr;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-st.x / st.z)), x1 = Math.min(st.w, Math.ceil((vw - st.x) / st.z));
      const y0 = Math.max(0, Math.floor(-st.y / st.z)), y1 = Math.min(st.h, Math.ceil((vh - st.y) / st.z));
      for (let i = x0; i <= x1; i++) { const px = Math.round((x + i * st.z) * dpr) / dpr + 0.5 / dpr; ctx.moveTo(px, Math.max(y, 0)); ctx.lineTo(px, Math.min(y + hh, vh)); }
      for (let j = y0; j <= y1; j++) { const py = Math.round((y + j * st.z) * dpr) / dpr + 0.5 / dpr; ctx.moveTo(Math.max(x, 0), py); ctx.lineTo(Math.min(x + w, vw), py); }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- input
  let drag = null;
  const pointers = new Map();
  el.addEventListener('pointerdown', e => {
    if (e.target === handle || handle.contains(e.target)) return;
    // overlays inside the view (empty state, floating tools) get normal clicks: only the canvas pans
    if (e.target !== el && e.target !== screen) return;
    el.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
    if (st.picking && e.button === 0 && pointers.size === 1) {
      const r = el.getBoundingClientRect();
      const u = (e.clientX - r.left - st.x) / (st.w * st.z), v = (e.clientY - r.top - st.y) / (st.h * st.z);
      if (u >= 0 && v >= 0 && u < 1 && v < 1 && onPick) onPick(u, v);
      return;
    }
    drag = { x: e.clientX, y: e.clientY, ox: st.x, oy: st.y };
    el.classList.add('panning');
  });
  el.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // pinch
      const [a, b] = [...pointers.values()];
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0) {
        const r = el.getBoundingClientRect();
        zoomTo(st.z * d1 / d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      drag = null;
      return;
    }
    if (!drag) return;
    st.x = drag.ox + e.clientX - drag.x; st.y = drag.oy + e.clientY - drag.y;
    st.fitted = false;
    draw();
  });
  const end = e => { pointers.delete(e.pointerId); if (!pointers.size) { drag = null; el.classList.remove('panning'); if (onViewChange) onViewChange(view()); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0;
    if (trackpadPan) { st.x -= e.deltaX; st.y -= e.deltaY; st.fitted = false; draw(); return; }
    if (e.ctrlKey && e.deltaMode === 0) zoomTo(st.z * Math.exp(-e.deltaY * 0.01), cx, cy);   // pinch on trackpads
    else zoomStep(e.deltaY < 0 ? 1 : -1, cx, cy);
  }, { passive: false });
  el.addEventListener('dblclick', () => fit());

  // split handle
  handle.addEventListener('pointerdown', e => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId);
    const move = ev => {
      const r = el.getBoundingClientRect();
      st.splitAt = Math.min(1, Math.max(0, (ev.clientX - r.left - st.x) / (st.w * st.z)));
      draw();
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation();
      st.splitAt = Math.min(1, Math.max(0, st.splitAt + (e.key === 'ArrowLeft' ? -0.05 : 0.05))); draw();
    }
  });

  new ResizeObserver(resize).observe(el);
  const view = () => ({ zoom: st.z, fitted: st.fitted, x: st.x, y: st.y });

  return {
    el,
    /** Show a result canvas (and the original for compare). */
    show(result, original, crop) {
      const sizeChanged = !st.result || result.width !== st.w || result.height !== st.h;
      const oldRect = { w: st.w * st.z, cx: st.x + st.w * st.z / 2, cy: st.y + st.h * st.z / 2 };
      st.result = result; st.original = original || st.original; st.crop = crop || null;
      if (sizeChanged) {
        st.w = result.width; st.h = result.height;
        if (st.fitted || !oldRect.w) {
          // not zoomed or panned by hand: fit exactly, so the image fills the same box as before
          fit();
        } else {
          // zoomed or panned: keep the same centre and on-screen width
          const z = oldRect.w / st.w;
          st.z = z; st.x = oldRect.cx - st.w * z / 2; st.y = oldRect.cy - st.h * z / 2;
          draw();
          if (onViewChange) onViewChange(view());
        }
      } else draw();
    },
    clear() { st.result = null; st.original = null; st.w = st.h = 0; st.fitted = true; draw(); },
    fit, zoomTo, zoomStep,
    zoomIn() { zoomStep(1); }, zoomOut() { zoomStep(-1); },
    get zoom() { return st.z; },
    get fitted() { return st.fitted; },
    /** Where the image sits on screen (css px), for tests and integrations. */
    get rect() { return { x: st.x, y: st.y, width: st.w * st.z, height: st.h * st.z, zoom: st.z }; },
    setCompare(on) { st.compare = on; draw(); },
    get compare() { return st.compare; },
    setGrid(on) { st.grid = on; draw(); },
    get grid() { return st.grid; },
    setPicking(on) { st.picking = on; el.classList.toggle('picking', on); },
    get picking() { return st.picking; },
    redraw: draw,
    resize,
  };
}
