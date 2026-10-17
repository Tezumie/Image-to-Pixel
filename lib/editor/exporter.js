// Every export the editor offers. Long ones show a progress toast that can be cancelled.

import { encodePNG } from '../core/export/png.js';
import { encodeGIF } from '../core/export/gif.js';
import { createZip } from '../core/export/zip.js';
import { packSpriteSheet, buildTileset } from '../core/export/sheet.js';
import { downloadBlob } from '../core/export/canvas.js';
import { forEachFrame } from '../core/video/frames.js';
import { mergeSettings, settingsToJSON } from '../core/settings.js';
import { toast } from './ui.js';

const base = name => (name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
const pngOpts = s => ({ scale: s.export.scale, grid: s.export.grid, gridColor: s.export.gridColor, indexed: s.export.indexed });

/** Pixel size of an exported image: whole-number scale, or the framed part of the source at full resolution. */
export function exportSize(s, r, item) {
  if (s.export.size === 'source' && r && item && r.crop) return { width: Math.max(1, Math.round(r.crop.w * item.width)), height: Math.max(1, Math.round(r.crop.h * item.height)) };
  return { width: r ? r.width * s.export.scale : 0, height: r ? r.height * s.export.scale : 0 };
}
/** PNG options for one exported image. */
const imageOpts = (s, r, item) => (s.export.size === 'source' && item ? { ...exportSize(s, r, item), indexed: s.export.indexed } : pngOpts(s));

/**
 * Whole-number scales to try for a video, best first. 'scale' = the PNG export scale; otherwise a target
 * height ('1080', '720', '2160', measured on the short side), falling back to smaller sizes if the
 * browser's encoder refuses the big one. Never below 240 px tall.
 */
export function videoScales(size, r, exportScale = 4) {
  const min = Math.max(1, Math.ceil(240 / Math.min(r.width, r.height)));
  const fit = target => {
    const long = Math.round(target * 16 / 9), portrait = r.height > r.width;
    const W = portrait ? target : long, H = portrait ? long : target;
    return Math.max(min, Math.min(Math.floor(W / r.width), Math.floor(H / r.height)));
  };
  const first = size === 'scale' ? Math.max(min, exportScale) : fit(Number(size) || 1080);
  const list = [first, fit(1080), fit(720), min].filter((v, i, a) => v <= first && a.indexOf(v) === i);
  return list.sort((a, b) => b - a);
}

/** Snapshot selected frames before an asynchronous export can change files or settings. */
export function selectedFrameOptions(opts, selection) {
  if (!selection?.active) return opts;
  if (!selection.complete) throw new Error('Wait for the selected interval to finish loading');
  if (!selection.renderedFrames.length) throw new Error('Select frames on the canvas first');
  return { ...opts, source: 'video', item: selection.item, settings: selection.settings,
    fps: selection.fps, start: selection.start, end: selection.end, audio: false,
    renderedFrames: selection.renderedFrames.map(frame => ({ ...frame })) };
}

export function createExporter(app) {
  const S = () => app.store.settings;
  /** While frame selection is on, its tile canvas replaces the preview, so `app.result` is stale. */
  const blockSelectingFrames = () => {
    if (!app.frameSelection?.()?.active) return false;
    toast('Turn off frame selection to export the current frame', { kind: 'error' });
    return true;
  };
  const frameOptions = opts => {
    try { return selectedFrameOptions(opts, app.frameSelection?.()); }
    catch (e) { toast(e.message, { kind: 'error' }); return null; }
  };

  async function exportPNG() {
    if (blockSelectingFrames()) return;
    if (!app.result) return toast('Open an image first', { kind: 'error' });
    const s = S();
    const bytes = await encodePNG(app.result, imageOpts(s, app.result, app.current));
    const out = exportSize(s, app.result, app.current);
    const suffix = s.export.size === 'source' ? `-${out.width}x${out.height}` : s.export.scale > 1 ? `@${s.export.scale}x` : '';
    downloadBlob(bytes, `${base(app.current.name)}-${app.result.width}x${app.result.height}${suffix}.png`, 'image/png');
    toast(`Saved ${out.width} × ${out.height} PNG`, { kind: 'ok' });
  }

  async function copyImage() {
    if (blockSelectingFrames()) return;
    if (!app.result) return;
    try {
      const bytes = await encodePNG(app.result, { ...imageOpts(S(), app.result, app.current), indexed: false });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
      toast('Image copied', { kind: 'ok' });
    } catch (e) { toast(`Couldn't copy: ${e.message}`, { kind: 'error' }); }
  }

  /** Run `fn` with a cancellable progress toast. */
  async function task(label, fn) {
    if (app.exporting) return toast('An export is already running');
    const ctrl = new AbortController();
    const t = toast(label, { progress: true, onCancel: () => ctrl.abort() });
    app.exporting = true;
    try {
      const msg = await fn(ctrl.signal, (p, m) => { t.progress(p); if (m) t.update(m); });
      t.done(msg);
    } catch (e) {
      t.close();
      if (e.name !== 'AbortError') { toast(`Export failed: ${e.message}`, { kind: 'error' }); console.error(e); }
      else toast('Export cancelled');
    } finally {
      app.exporting = false;
      app.schedule();
    }
  }

  async function exportZip() {
    const items = app.items.slice();
    if (!items.length) return;
    await task(`Processing ${items.length} files`, async (signal, progress) => {
      const entries = [];
      const own = [];
      for (let i = 0; i < items.length; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const it = items[i];
        const s = app.settingsFor(it);             // each file with its own settings, if it has them
        if (it.type === 'video') app.engine.invalidate();
        const r = await app.engine.process(it.source, s);
        entries.push({ name: `${base(it.name)}.png`, data: await encodePNG(r, imageOpts(s, r, it)) });
        if (it.own) own.push({ name: `${base(it.name)}.settings.json`, data: settingsToJSON(s) });
        progress((i + 1) / items.length, `Processed ${i + 1} of ${items.length}`);
      }
      entries.push({ name: 'settings.json', data: settingsToJSON(app.shared) }, ...own);
      downloadBlob(createZip(entries), 'pixel-art.zip', 'application/zip');
      return `Saved ${items.length} images as a ZIP`;
    });
  }

  /** Process the frames chosen in the Animation section; calls onFrame(result, i, total). */
  async function processVideoFrames(opts, signal, progress, onFrame) {
    const s = S();
    const item = app.current;
    if (!item || item.type !== 'video') throw new Error('Open a video first');
    const video = item.source;
    const end = opts.end > opts.start ? opts.end : video.duration;
    return forEachFrame(video, {
      fps: opts.fps, start: opts.start, end, signal,
      onFrame: async ({ index, total }) => {
        app.engine.invalidate();
        const r = await app.engine.process(video, s);
        await onFrame(r, index, total, `${base(item.name)}-${String(index).padStart(4, '0')}`);
        progress((index + 1) / total, `Frame ${index + 1} of ${total}`);
      },
    });
  }

  /** Process the frames chosen in the Animation section; calls onFrame(result, i, total). */
  async function frames(opts, signal, progress, onFrame) {
    if (opts.renderedFrames) {
      for (let i = 0; i < opts.renderedFrames.length; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const { result, index } = opts.renderedFrames[i];
        await onFrame(result, i, opts.renderedFrames.length, `${base(opts.item.name)}-${String(index).padStart(4, '0')}`);
        progress((i + 1) / opts.renderedFrames.length, `Frame ${i + 1} of ${opts.renderedFrames.length}`);
      }
      return opts.renderedFrames.length;
    }
    if (opts.source === 'files') {
      const items = app.items.filter(i => i.type === 'image');
      let size = null;
      for (let i = 0; i < items.length; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        // each file keeps its own look, but every frame must share the first frame's size
        const own = app.settingsFor(items[i]);
        const r = await app.engine.process(items[i].source, size ? mergeSettings(own, { size }) : own);
        if (!size) size = { mode: 'width', width: r.width, height: r.height };
        await onFrame(r, i, items.length, items[i].name);
        progress((i + 1) / items.length, `Frame ${i + 1} of ${items.length}`);
      }
      return items.length;
    }
    return processVideoFrames(opts, signal, progress, onFrame);
  }

  async function exportAnimation(opts) {
    opts = frameOptions(opts);
    if (!opts) return;
    const name = opts.source === 'files' ? 'animation' : base((opts.item || app.current)?.name);
    const s = opts.settings || S();
    const delay = 1000 / opts.fps;
    if (opts.format === 'gif' || opts.format === 'png-seq') {
      await task('Rendering frames', async (signal, progress) => {
        const list = [];
        await frames(opts, signal, progress, async (r, i, total, frameName) => {
          if (opts.format === 'gif') list.push({ width: r.width, height: r.height, data: r.data, delay });
          else list.push({ name: `${frameName}.png`, data: await encodePNG(r, pngOpts(s)) });
        });
        if (opts.format === 'gif') {
          progress(1, 'Encoding GIF');
          await new Promise(r => setTimeout(r, 0));
          const bytes = encodeGIF(list, { scale: s.export.scale, loop: 0 });
          downloadBlob(bytes, `${name}.gif`, 'image/gif');
          return `Saved GIF (${list.length} frames, ${(bytes.length / 1024).toFixed(0)} KB)`;
        }
        downloadBlob(createZip(list), `${name}-frames.zip`, 'application/zip');
        return `Saved ${list.length} PNG frames`;
      });
      return;
    }
    // MP4 / WebM through WebCodecs
    await task(`Encoding ${opts.format.toUpperCase()}`, async (signal, progress) => {
      const { createVideoEncoder, decodeAudio } = await import('../video.js');
      // Keep audio: the video's own soundtrack, cut to the exported range (null when it has none)
      const item = app.current;
      let audio = null;
      if (opts.audio && opts.source === 'video' && item && item.type === 'video' && item.file) {
        progress(0, 'Reading audio');
        const end = opts.end > opts.start ? opts.end : item.source.duration;
        audio = await decodeAudio(item.file, { start: opts.start, end }).catch(e => { console.warn('[export] audio', e); return null; });
      }
      let enc = null;
      await frames(opts, signal, progress, async r => {
        if (!enc) {
          // Players stretch small videos with smoothing, which blurs pixel art. So the frames are upscaled
          // by a whole number to about the chosen size first (and H.264's colour subsampling stays inside each pixel).
          let tries = videoScales(opts.videoSize, r, s.export.scale), err = null;
          for (const scale of tries) {
            try { enc = await createVideoEncoder({ format: opts.format, fps: opts.fps, width: r.width, height: r.height, scale, audio }); break; }
            catch (e) { err = e; if (!/encoder available/.test(e.message)) throw e; }
          }
          if (!enc) throw err;
        }
        await enc.add(r);
      });
      if (audio && enc.audioCodec) progress(1, 'Encoding audio');
      const blob = await enc.finish();
      downloadBlob(blob, `${name}.${opts.format}`);
      const sound = !opts.audio || opts.source !== 'video' ? ''
        : enc.audioCodec === 'opus' && opts.format === 'mp4' ? ', with Opus audio: VLC and browsers play it, Windows Media Player and QuickTime may not'
        : enc.audioCodec ? ', with audio'
        : audio ? ", without audio (this browser can't encode it)"
        : ', no audio track in the source';
      return `Saved ${opts.format.toUpperCase()} (${(blob.size / 1024 / 1024).toFixed(1)} MB${sound})`;
    });
  }

  async function exportSheet(opts) {
    opts = frameOptions(opts);
    if (!opts) return;
    const name = opts.source === 'files' ? 'sheet' : `${base((opts.item || app.current)?.name)}-sheet`;
    const s = opts.settings || S();
    await task('Building sprite sheet', async (signal, progress) => {
      const list = [];
      await frames(opts, signal, progress, (r, i, total, frameName) => { list.push({ width: r.width, height: r.height, data: r.data, name: frameName ? base(frameName) : undefined, delay: 1000 / opts.fps }); });
      const { image, atlas } = packSpriteSheet(list, { columns: opts.columns, padding: opts.padding, name });
      if (s.export.scale > 1) {
        // scale the atlas coordinates with the image
        const k = s.export.scale;
        for (const f of Object.values(atlas.frames)) { for (const key of ['x', 'y', 'w', 'h']) f.frame[key] *= k; f.sourceSize.w *= k; f.sourceSize.h *= k; }
        atlas.meta.size.w *= k; atlas.meta.size.h *= k; atlas.meta.scale = String(k);
      }
      const png = await encodePNG(image, pngOpts(s));
      downloadBlob(createZip([{ name: `${name}.png`, data: png }, { name: `${name}.json`, data: JSON.stringify(atlas, null, 2) }]), `${name}.zip`, 'application/zip');
      return `Saved a ${list.length}-frame sprite sheet`;
    });
  }

  async function exportTileset({ tile, flips }) {
    if (blockSelectingFrames()) return;
    if (!app.result) return toast('Open an image first', { kind: 'error' });
    const s = S();
    const ts = buildTileset(app.result, { tileWidth: tile, tileHeight: tile, flips });
    const name = `${base(app.current.name)}-tiles`;
    const png = await encodePNG(ts.image, pngOpts(s));
    const map = { ...ts.map, image: `${name}.png`, note: 'tiles[] holds one tile index per cell, row by row' + (flips ? '; flips[] is 0 none, 1 horizontal, 2 vertical, 3 both' : '') };
    downloadBlob(createZip([{ name: `${name}.png`, data: png }, { name: `${name}.json`, data: JSON.stringify(map, null, 2) }]), `${name}.zip`, 'application/zip');
    toast(`Saved ${ts.count} unique tiles (${ts.map.width} × ${ts.map.height} map)`, { kind: 'ok' });
  }

  return { exportPNG, copyImage, exportZip, exportAnimation, exportSheet, exportTileset };
}
