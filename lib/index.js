// image-to-pixel core: no UI. Works in browsers (WebGL 2 via ShaderMate, CPU fallback) and,
// for { width, height, data } inputs, in Node on the CPU.

export { createPixelator, pixelate, makeResult } from './core/engine.js';
export {
  DEFAULTS, DITHER_METHODS, SETTINGS_VERSION, MAX_SIZE, LEGACY_DITHER,
  defaultSettings, normalizeSettings, mergeSettings, resolveSize, ditherKind, cropRect, ASPECTS,
  encodeSettings, decodeSettings, compactSettings, settingsToJSON, settingsFromJSON,
} from './core/settings.js';
export { makePlan } from './core/plan.js';
export { runCPU } from './core/cpu/pipeline.js';
export { PALETTES, getPalette } from './core/palette/builtin.js';
export { parsePalette, toGPL, toHexFile, toPaletteJSON } from './core/palette/parse.js';
export { extractPalette } from './core/palette/extract.js';
export { fetchLospec, lospecSlug } from './core/palette/lospec.js';
export { thresholdMap, parseMatrix, bayer } from './core/dither/matrices.js';
export { KERNELS } from './core/dither/kernels.js';
export { PRESETS, getPreset } from './core/presets.js';
export { parseColor, toHex, oklab } from './core/color.js';
export { toFrame, loadImage } from './core/source.js';
export { upscale, resizeNearest, uniqueColors, detectGrid, hasTransparency } from './core/export/scale.js';
export { toCanvas, downloadBlob } from './core/export/canvas.js';
export { encodePNG } from './core/export/png.js';
export { encodeGIF } from './core/export/gif.js';
export { createZip } from './core/export/zip.js';
export { packSpriteSheet, buildTileset } from './core/export/sheet.js';
export { forEachFrame, estimateFps, seekTo, frameTimes, videoReady, mediaError, sniffVideoCodec } from './core/video/frames.js';

/* global __ITP_VERSION__ */
// The build replaces __ITP_VERSION__ with package.json's version; unbundled source reports 'dev'.
export const VERSION = typeof __ITP_VERSION__ === 'string' ? __ITP_VERSION__ : 'dev';
