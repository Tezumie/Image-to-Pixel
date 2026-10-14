// A "plan" is everything both backends need, resolved once from settings + source size:
// output size, palette bytes, threshold map, kernel, and the numbers derived from them.
// Building it in one place keeps the CPU and GPU paths in lock-step.

import { normalizeSettings, resolveSize, ditherKind, cropRect } from './settings.js';
import { parseColor, paletteSpread } from './color.js';
import { thresholdMap } from './dither/matrices.js';
import { KERNELS, kernelSkew, waveCount } from './dither/kernels.js';
import { extractPalette } from './palette/extract.js';
import { resample, adjust } from './cpu/stages.js';

/**
 * @param {object} settings
 * @param {{ width: number, height: number, data: ArrayLike<number> }} src RGBA source (only read for palette extraction)
 */
export function makePlan(settings, src) {
  const s = normalizeSettings(settings);
  const crop = cropRect(src.width, src.height, s.frame);
  const { width, height } = resolveSize(crop.w, crop.h, s.size);

  let colors = s.palette.colors;
  if (s.palette.source === 'extract') colors = extractFrom(src, s, width, height, crop);
  const quantize = s.palette.source !== 'none' && colors.length > 0;
  const palette = quantize ? colors.map(parseColor) : [];

  let kind = quantize ? ditherKind(s.dither.method) : 'none';
  if (s.dither.strength <= 0) kind = 'none';

  const map = kind === 'ordered' ? thresholdMap(s.dither.method, s.dither.matrix) : null;
  const kernel = kind === 'diffusion' ? KERNELS[s.dither.method] : null;
  const skew = kernel ? kernelSkew(kernel) : 1;

  return {
    settings: s,
    srcWidth: src.width, srcHeight: src.height,
    crop,                                      // source pixels kept by the frame settings
    width, height,
    quantize, kind,
    palette,                                   // [[r, g, b] bytes]
    paletteHex: quantize ? colors.slice() : null,
    distance: s.palette.distance === 'rgb' ? 1 : 0,
    spread: quantize ? paletteSpread(palette) : 0,
    map, kernel, skew,
    waves: kernel ? waveCount(width, height, skew) : 0,
    outline: { mode: s.outline.mode, color: parseColor(s.outline.color), corners: s.outline.corners },
  };
}

function extractFrom(src, s, width, height, crop) {
  // extract from what will actually be quantised: the resized + adjusted image (capped for speed)
  const k = Math.min(1, 160 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k)), h = Math.max(1, Math.round(height * k));
  const prep = resample(src, w, h, 'box', crop);
  adjust(prep, s.adjust);
  const bytes = new Uint8ClampedArray(prep.length);
  for (let i = 0; i < prep.length; i++) bytes[i] = Math.round(prep[i] * 255);
  return extractPalette({ data: bytes, width: w, height: h }, s.palette.count, { alphaThreshold: Math.max(0.01, s.alpha.threshold) });
}
