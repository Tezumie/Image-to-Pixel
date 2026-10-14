// The public engine: createPixelator() picks a backend and turns sources into pixel art.

import { makePlan } from './plan.js';
import { runCPU } from './cpu/pipeline.js';
import { createGPUBackend } from './gpu/backend.js';
import { toFrame } from './source.js';
import { normalizeSettings, LEGACY_DITHER } from './settings.js';
import { uniqueColors } from './export/scale.js';
import { toCanvas } from './export/canvas.js';
import { encodePNG } from './export/png.js';

const isVideo = s => typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement;
const isVideoFrame = s => typeof VideoFrame !== 'undefined' && s instanceof VideoFrame;

/**
 * Create an engine. Reuse one for many images: the GPU backend compiles its shaders once.
 * @param {{ backend?: 'auto' | 'webgl' | 'cpu', diffusion?: 'auto' | 'gpu' | 'cpu', maxSourceSize?: number }} [options]
 *   diffusion: where error diffusion runs. 'auto' uses the GPU unless WebGL is software-rendered.
 */
export async function createPixelator(options = {}) {
  const want = options.backend || 'auto';
  let gpu = null, gpuError = null;
  if (want !== 'cpu' && typeof document !== 'undefined') {
    try { gpu = await createGPUBackend(); } catch (e) {
      gpuError = e;
      if (want === 'webgl') throw e;
    }
  }
  const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let last = { source: null, frame: null };
  let queue = Promise.resolve();

  async function frameFor(source) {
    if (source === last.source && last.frame && !isVideo(source) && !isVideoFrame(source)) {
      last.frame.dirty = false;
      return last.frame;
    }
    const frame = await toFrame(source, { maxSize: options.maxSourceSize, canvas: scratch });
    last = { source, frame };
    return frame;
  }

  async function processNow(source, settings) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const frame = await frameFor(source);
    const plan = makePlan(settings, frame);
    let data, backend = 'cpu';
    const diffusionOnCPU = plan.kind === 'diffusion' && (options.diffusion === 'cpu' || (options.diffusion !== 'gpu' && gpu && gpu.software));
    if (gpu && frame.canvas && !diffusionOnCPU) {
      data = await gpu.run(plan, frame);
      backend = 'webgl';
    } else {
      data = runCPU(plan, frame);
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return makeResult(plan, data, backend, ms);
  }

  return {
    /** 'webgl' or 'cpu' */
    get backend() { return gpu ? 'webgl' : 'cpu'; },
    /** GPU renderer string (WebGL backend only). */
    get renderer() { return gpu ? gpu.renderer : ''; },
    /** Why the GPU backend is not in use, if it isn't. */
    get fallbackReason() { return gpuError ? String(gpuError.message || gpuError) : ''; },
    /**
     * Process one source. Calls are queued, so it is safe to call from input handlers.
     * @returns {Promise<PixelResult>}
     */
    process(source, settings = {}) {
      const run = queue.then(() => processNow(source, settings));
      queue = run.catch(() => { });
      return run;
    },
    /** Forget the cached source (call after drawing new content into the same canvas). */
    invalidate() { last = { source: null, frame: null }; },
    destroy() { if (gpu) gpu.destroy(); gpu = null; },
    /** The underlying ShaderMate instance (GPU backend only), for debugging. */
    get shader() { return gpu ? gpu.shader : null; },
  };
}

/**
 * @typedef {object} PixelResult
 * @property {number} width
 * @property {number} height
 * @property {Uint8ClampedArray} data RGBA, rows top-down
 * @property {string[]} palette colours actually available ('#rrggbb')
 * @property {object} settings normalised settings used
 * @property {'webgl'|'cpu'} backend
 * @property {number} ms processing time
 */
export function makeResult(plan, data, backend = 'cpu', ms = 0) {
  const result = {
    width: plan.width,
    height: plan.height,
    data,
    palette: plan.paletteHex ? plan.paletteHex.slice() : null,
    settings: plan.settings,
    kind: plan.kind,
    waves: plan.waves,
    /** The framed part of the source, as fractions of its width and height. */
    crop: { x: plan.crop.x / plan.srcWidth, y: plan.crop.y / plan.srcHeight, w: plan.crop.w / plan.srcWidth, h: plan.crop.h / plan.srcHeight },
    backend,
    ms,
    /** Distinct colours actually used in the image. */
    usedColors() { return uniqueColors(this); },
    toImageData() { return new ImageData(new Uint8ClampedArray(this.data), this.width, this.height); },
    /** Canvas at `scale` × (nearest-neighbour), optional grid lines. */
    toCanvas(scale = 1, opts = {}) { return toCanvas(this, scale, opts); },
    /** PNG bytes (indexed when ≤ 256 colours unless `indexed: false`). */
    toPNG(opts = {}) { return encodePNG(this, opts); },
    async toBlob(opts = {}) { return new Blob([await encodePNG(this, opts)], { type: 'image/png' }); },
  };
  return result;
}

let shared = null;
/** One-shot helper with a shared engine. `pixelate(source, settings)`. */
export async function pixelate(source, settings) {
  // classic API: pixelate({ image, width, dither, strength, palette, resolution }) → canvas
  if (settings === undefined && source && typeof source === 'object' && 'image' in source && 'width' in source) {
    return pixelateClassic(source);
  }
  shared ||= createPixelator();
  return (await shared).process(source, settings);
}

/** Compatibility with image-to-pixel.js 2.x. Returns a canvas like the old function did. */
async function pixelateClassic(opts) {
  const { image, width, dither = 'none', strength = 0, palette = null, resolution = 'original' } = opts;
  let pal = { source: 'none' };
  if (Array.isArray(palette)) pal = { source: 'custom', colors: palette };
  else if (typeof palette === 'string') {
    const { fetchLospec } = await import('./palette/lospec.js');
    const p = await fetchLospec(palette);
    pal = { source: 'custom', colors: p.colors, name: p.name };
  }
  const settings = normalizeSettings({
    size: { width },
    palette: pal,
    dither: { method: LEGACY_DITHER[String(dither).toLowerCase()] || 'none', strength: strength / 100 },
    alpha: { threshold: 0 },
  });
  shared ||= createPixelator();
  const engine = await shared;
  const res = await engine.process(image, settings);
  if (resolution === 'original') {
    const frame = await toFrame(image);
    const c = document.createElement('canvas');
    c.width = frame.width; c.height = frame.height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(res.toCanvas(1), 0, 0, c.width, c.height);
    return c;
  }
  return res.toCanvas(1);
}
