// GPU backend: one ShaderMate instance, six passes, rendered on demand (never animating).

import { createShader } from 'shadermate';
import { COMMON, PREP, QUANT, DIFFUSE, RESOLVE, ORPHAN, SMOOTH, OUTLINE } from './shaders.js';
import { MAX_KERNEL } from '../dither/kernels.js';

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/**
 * Create the WebGL 2 backend. Rejects when WebGL 2 or float render targets are missing,
 * so the caller can fall back to the CPU.
 */
export async function createGPUBackend() {
  if (typeof document === 'undefined') throw new Error('No DOM');
  const probe = canvasOf(1, 1).getContext('webgl2');
  if (!probe) throw new Error('WebGL 2 is not available');
  if (!probe.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets are not available');
  const dbg = probe.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(dbg ? probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : probe.getParameter(probe.RENDERER));
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  const canvas = canvasOf(1, 1);
  const source = canvasOf(1, 1);
  const palette = canvasOf(256, 1);
  const matrix = canvasOf(1, 1);
  const nearest = el => ({ element: el, filter: 'nearest', wrap: 'clamp' });

  const sm = createShader({
    canvas,
    webgl: 2,
    size: [1, 1],
    pixelRatio: 1,
    autoplay: false,
    pauseWhenHidden: false,
    pointer: false,
    errorOverlay: false,
    warnMissingUniforms: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    antialias: false,
    dialect: 'shadermate',
    common: COMMON,
    samplers: { u_palette: nearest(palette), u_matrix: nearest(matrix) },
    uniforms: {
      u_count: 1, u_distance: 0, u_resample: 0, u_adjust: [0, 0, 0, 1], u_hue: 0, u_crop: [0, 0, 1, 1], u_alphaCut: 0.5,
      u_mode: 0, u_levels: 1, u_amount: 0,
      u_skew: 1, u_strength: 1, u_kn: 0, u_kernel: new Float32Array(MAX_KERNEL * 3),
      u_outline: 0, u_corners: 0, u_outlineColor: [0, 0, 0],
    },
    passes: [
      { name: 'prep', shader: PREP, float: 'full', filter: 'nearest', channels: [{ ...nearest(source), dynamic: false }] },
      { name: 'quant', shader: QUANT, filter: 'nearest', channels: ['prep'] },
      { name: 'diffuse', shader: DIFFUSE, float: 'full', filter: 'nearest', pingpong: true, iterations: 2, channels: ['prep', 'diffuse'] },
      { name: 'resolve', shader: RESOLVE, filter: 'nearest', channels: ['quant', 'diffuse'] },
      { name: 'orphan', shader: ORPHAN, filter: 'nearest', channels: ['resolve'] },
      { name: 'smooth', shader: SMOOTH, filter: 'nearest', channels: ['orphan'] },
      { name: 'out', shader: OUTLINE, screen: true, channels: ['smooth'] },
    ],
  });

  let failure = null;
  sm.on('error', e => { failure = e; });
  await sm.ready;
  if (failure || sm.error) { sm.destroy(); throw failure || sm.error; }

  // `u_on` is a per-pass switch: same name, different value in each pass
  const passUniforms = (name, values) => { for (const k in values) sm.set(k, values[k], name); };

  let lastSource = null;
  let paletteKey = '', matrixKey = '';

  async function setSource(frame) {
    if (frame.canvas === lastSource && !frame.dirty) return;
    source.width = frame.width; source.height = frame.height;
    const ctx = source.getContext('2d');
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(frame.canvas, 0, 0);
    await sm.setChannel(0, { ...nearest(source), dynamic: false }, 'prep');
    lastSource = frame.canvas;
  }

  function setPalette(plan) {
    const key = plan.palette.map(c => c.join(',')).join(';');
    if (key === paletteKey) return;
    paletteKey = key;
    const ctx = palette.getContext('2d');
    const img = ctx.createImageData(256, 1);
    plan.palette.forEach((c, i) => img.data.set([c[0], c[1], c[2], 255], i * 4));
    ctx.putImageData(img, 0, 0);
  }

  function setMatrix(map) {
    const key = map ? `${map.w}x${map.h}:${map.levels}:${map.values.join(',')}` : 'none';
    if (key === matrixKey) return;
    matrixKey = key;
    const m = map || { w: 1, h: 1, values: [0] };
    matrix.width = m.w; matrix.height = m.h;
    const ctx = matrix.getContext('2d');
    const img = ctx.createImageData(m.w, m.h);
    for (let i = 0; i < m.values.length; i++) img.data.set([m.values[i], 0, 0, 255], i * 4);
    ctx.putImageData(img, 0, 0);
  }

  /**
   * @param {ReturnType<import('../plan.js').makePlan>} plan
   * @param {{ canvas: HTMLCanvasElement, width: number, height: number, dirty?: boolean }} frame
   * @returns {Promise<Uint8ClampedArray>} RGBA bytes, rows top-down
   */
  async function run(plan, frame) {
    const s = plan.settings;
    await setSource(frame);
    if (plan.quantize) setPalette(plan);
    setMatrix(plan.map);
    if (sm.width !== plan.width || sm.height !== plan.height) sm.setSize(plan.width, plan.height);

    const diffusion = plan.kind === 'diffusion';
    const kernel = new Array(MAX_KERNEL).fill(null).map((_, i) => (plan.kernel && plan.kernel[i]) || [0, 0, 0]);
    sm.set({
      u_count: plan.palette.length || 1,
      u_distance: plan.distance,
      u_resample: s.size.resample === 'nearest' ? 1 : 0,
      u_adjust: [s.adjust.brightness, s.adjust.contrast, s.adjust.saturation, s.adjust.gamma],
      u_hue: s.adjust.hue,
      u_crop: [plan.crop.x, plan.crop.y, plan.crop.w, plan.crop.h],
      u_alphaCut: s.alpha.threshold,
      u_mode: !plan.quantize ? 0 : plan.kind === 'ordered' ? 2 : 1,
      u_levels: plan.map ? plan.map.levels : 1,
      u_amount: plan.map ? plan.spread * s.dither.strength : 0,
      u_skew: plan.skew,
      u_strength: s.dither.strength,
      u_kn: plan.kernel ? plan.kernel.length : 0,
      u_kernel: new Float32Array(kernel.flat()),
      u_outline: { none: 0, outer: 1, inner: 2 }[plan.outline.mode],
      u_corners: plan.outline.corners ? 1 : 0,
      u_outlineColor: plan.outline.color.map(v => v / 255),
    });
    passUniforms('diffuse', { u_on: diffusion ? 1 : 0 });
    passUniforms('resolve', { u_on: diffusion ? 1 : 0 });
    passUniforms('orphan', { u_on: s.cleanup.orphans ? 1 : 0 });
    passUniforms('smooth', { u_on: s.cleanup.smooth ? 1 : 0 });
    sm.getPass('diffuse').cfg.iterations = diffusion ? plan.waves : 1;

    const { data } = sm.readPixels();
    // GL rows are bottom-up
    const w = plan.width, h = plan.height, out = new Uint8ClampedArray(w * h * 4), row = w * 4;
    for (let y = 0; y < h; y++) out.set(data.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return out;
  }

  return {
    name: 'webgl',
    renderer,
    /** Software rasterisers (SwiftShader, llvmpipe) are slower than the CPU path for error diffusion. */
    software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer),
    run,
    shader: sm,
    destroy() { sm.destroy(); },
  };
}
