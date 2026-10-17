import { h, nextId } from './dom.js';
import { seekTo, videoReady } from '../core/video/frames.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Account for the slider thumb's inset and sample the middle of the hovered frame. */
export function timelineFrameAt(clientX, { left, width }, duration, fps) {
  const inset = Math.min(7, width / 2);
  const fraction = clamp((clientX - left - inset) / Math.max(1, width - inset * 2), 0, 1);
  const count = Math.max(1, Math.ceil(duration * fps - 1e-6));
  const index = Math.min(count - 1, Math.floor(fraction * duration * fps));
  return { index, time: index / fps, seekTime: Math.max(0, Math.min((index + 0.5) / fps, duration - 1e-4)) };
}

export function timelineTime(time) {
  const total = Math.max(0, Math.round(time * 100));
  const hours = Math.floor(total / 360000), minutes = Math.floor(total / 6000) % 60;
  const seconds = String(Math.floor(total / 100) % 60).padStart(2, '0');
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : minutes}:${seconds}.${String(total % 100).padStart(2, '0')}`;
}

/** A shared player-style hover preview for the playback and interval timelines. */
export function createTimelinePreview(app) {
  const canvas = h('canvas', { hidden: true, 'aria-label': 'Frame at hovered time' });
  const hint = h('span', { text: 'Loading frame...' });
  const time = h('span.num.itp-timeline-time');
  const el = h('div.itp-timeline-preview', { id: nextId('itp-timeline'), role: 'tooltip', hidden: true },
    h('div.itp-timeline-image', {}, canvas, hint), time);
  let request = null, session = null, timer = null, idleTimer = null;

  function release(s) {
    s.video.pause(); s.video.removeAttribute('src'); s.video.load(); s.cache.clear();
  }

  function dispose() {
    if (!session) return;
    session.disposed = true;
    if (!session.running) release(session);
    session = null;
  }

  function hide() {
    el.hidden = true; request = null; clearTimeout(timer); clearTimeout(idleTimer);
    idleTimer = setTimeout(dispose, 10000);
  }

  function reset() { hide(); clearTimeout(idleTimer); dispose(); }

  function position(target, clientX) {
    const host = el.parentElement.getBoundingClientRect(), track = target.getBoundingClientRect();
    const width = Math.min(180, Math.max(1, host.width - 16));
    el.style.width = `${width}px`;
    el.style.left = `${clamp(clientX - host.left - width / 2, 8, Math.max(8, host.width - width - 8))}px`;
    el.style.bottom = `${host.bottom - track.top + 10}px`;
  }

  function paint(frame) {
    canvas.width = frame.width; canvas.height = frame.height;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, 0, 0);
    canvas.hidden = false; hint.hidden = true;
  }

  function thumbnail(frame) {
    const scale = Math.min(1, 168 / frame.width, 104 / frame.height);
    const c = h('canvas', { width: Math.max(1, Math.round(frame.width * scale)), height: Math.max(1, Math.round(frame.height * scale)) });
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, 0, 0, c.width, c.height);
    return c;
  }

  async function render(s) {
    if (s.running || s.failed) return;
    s.running = true;
    try {
      await s.ready;
      while (!s.disposed && request?.item === s.item) {
        const current = request;
        let frame = s.cache.get(current.key);
        if (!frame) {
          // Never seek the main video's decoder: hover must not affect playback or selection.
          await seekTo(s.video, current.seekTime);
          if (s.disposed) break;
          if (request?.key !== current.key) continue;
          const result = await app.engine.process(s.video, current.settings);
          if (s.disposed) break;
          frame = thumbnail(result.toCanvas(1));
          s.cache.set(current.key, frame);
          if (s.cache.size > 32) s.cache.delete(s.cache.keys().next().value);
        }
        if (request?.key === current.key && app.current === s.item) { paint(frame); break; }
      }
    } catch {
      if (!s.disposed) {
        s.failed = true;
        if (request?.item === s.item) { canvas.hidden = true; hint.hidden = false; hint.textContent = 'Preview unavailable'; }
      }
    } finally {
      s.running = false;
      if (s.disposed) release(s);
    }
  }

  function load() {
    if (!request || !app.engine) return;
    if (session?.item !== request.item) {
      dispose();
      const video = h('video', { muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
      video.muted = true; video.src = request.item.source.currentSrc || request.item.source.src;
      session = { item: request.item, video, cache: new Map(), running: false, disposed: false, failed: false,
        ready: videoReady(video, { timeout: 10000 }) };
    }
    render(session);
  }

  function bind(target, { getFrame } = {}) {
    target.setAttribute('aria-describedby', el.id);
    target.addEventListener('pointermove', e => {
      const item = app.current;
      if (e.pointerType === 'touch' || item?.type !== 'video' || !Number.isFinite(item.duration) || item.duration <= 0) { hide(); return; }
      clearTimeout(idleTimer);
      const fps = item.fps || 30;
      const frame = timelineFrameAt(e.clientX, target.getBoundingClientRect(), item.duration, fps);
      const { export: ignored, ...visual } = app.store.settings;
      const key = `${fps}/${frame.index}/${JSON.stringify(visual)}`;
      const previous = request;
      request = { item, key, ...frame, settings: app.store.settings };
      position(target, e.clientX); el.hidden = false; time.textContent = timelineTime(frame.time);
      const cached = getFrame?.(frame.index) || (session?.item === item && session.cache.get(key));
      if (cached) { clearTimeout(timer); paint(cached); return; }
      if (previous?.item === item && previous.key === key) return;
      canvas.hidden = true; hint.hidden = false; hint.textContent = session?.failed ? 'Preview unavailable' : 'Loading frame...';
      clearTimeout(timer); timer = setTimeout(load, 80);
    });
    target.addEventListener('pointerleave', hide);
    target.addEventListener('pointercancel', hide);
    target.addEventListener('blur', hide);
  }

  window.addEventListener('resize', hide);
  return { el, bind, hide, reset };
}
