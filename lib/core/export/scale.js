// Pure pixel helpers (no DOM): integer upscaling, grid lines, colour counting.

import { parseColor, toHex } from '../color.js';

/**
 * Nearest-neighbour integer upscale.
 * @param {{ width: number, height: number, data: ArrayLike<number> }} img
 * @param {number} k scale factor (integer ≥ 1)
 * @param {{ grid?: boolean, gridColor?: string, gridAlpha?: number }} [opts] grid: 1px lines between source pixels
 */
export function upscale(img, k = 1, opts = {}) {
  k = Math.max(1, Math.round(k));
  const w = img.width * k, h = img.height * k;
  const out = new Uint8ClampedArray(w * h * 4);
  const src = img.data, sw = img.width;
  for (let y = 0; y < h; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < w; x++) {
      const so = (sy * sw + ((x / k) | 0)) * 4, o = (y * w + x) * 4;
      out[o] = src[so]; out[o + 1] = src[so + 1]; out[o + 2] = src[so + 2]; out[o + 3] = src[so + 3];
    }
  }
  if (opts.grid && k >= 3) {
    const [r, g, b] = parseColor(opts.gridColor || '#000000');
    const a = opts.gridAlpha ?? 0.35;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x % k && y % k) continue;
      const o = (y * w + x) * 4;
      const sa = out[o + 3] / 255, oa = a + sa * (1 - a);
      out[o] = (r * a + out[o] * sa * (1 - a)) / oa;
      out[o + 1] = (g * a + out[o + 1] * sa * (1 - a)) / oa;
      out[o + 2] = (b * a + out[o + 2] * sa * (1 - a)) / oa;
      out[o + 3] = oa * 255;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Nearest-neighbour resize to any size (used to export at the source's resolution, like 2.x's
 * "full resolution" download). Pixels may differ by one in size when the ratio isn't whole.
 */
export function resizeNearest(img, width, height) {
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  const out = new Uint8ClampedArray(width * height * 4);
  const xs = new Int32Array(width);
  for (let x = 0; x < width; x++) xs[x] = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / width));
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / height));
    for (let x = 0; x < width; x++) {
      const so = (sy * img.width + xs[x]) * 4, o = (y * width + x) * 4;
      out[o] = img.data[so]; out[o + 1] = img.data[so + 1]; out[o + 2] = img.data[so + 2]; out[o + 3] = img.data[so + 3];
    }
  }
  return { width, height, data: out };
}

/** Distinct opaque colours in an image ('#rrggbb'), in order of first appearance. */
export function uniqueColors(img, limit = Infinity) {
  const seen = new Set();
  const d = img.data;
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] === 0) continue;
    seen.add((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
    if (seen.size > limit) break;
  }
  return [...seen].map(v => toHex([v >> 16, (v >> 8) & 255, v & 255]));
}

/** True when the image has at least one non-opaque pixel. */
export function hasTransparency(img) {
  for (let o = 3; o < img.data.length; o += 4) if (img.data[o] < 255) return true;
  return false;
}

/**
 * Detect the pixel-grid size of an upscaled pixel-art image (e.g. a sprite saved at 4×).
 * Returns the largest block size b such that the image is made of b×b solid blocks
 * (allowing a small tolerance for JPEG noise), or 1.
 */
export function detectGrid(img, tolerance = 8) {
  const { width: w, height: h, data: d } = img;
  const same = (a, b) => Math.abs(d[a] - d[b]) <= tolerance && Math.abs(d[a + 1] - d[b + 1]) <= tolerance && Math.abs(d[a + 2] - d[b + 2]) <= tolerance && Math.abs(d[a + 3] - d[b + 3]) <= tolerance;
  // run lengths along rows and columns; the block size divides all of them (mostly)
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let g = 0;
  const stepY = Math.max(1, Math.floor(h / 64)), stepX = Math.max(1, Math.floor(w / 64));
  for (let y = 0; y < h; y += stepY) {
    let run = 1;
    for (let x = 1; x < w; x++) {
      if (same((y * w + x) * 4, (y * w + x - 1) * 4)) run++;
      else { g = gcd(g, run); run = 1; if (g === 1) return 1; }
    }
  }
  for (let x = 0; x < w; x += stepX) {
    let run = 1;
    for (let y = 1; y < h; y++) {
      if (same((y * w + x) * 4, ((y - 1) * w + x) * 4)) run++;
      else { g = gcd(g, run); run = 1; if (g === 1) return 1; }
    }
  }
  return g || 1;
}
