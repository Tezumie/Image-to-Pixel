// Minimal PNG encoder: indexed (colour type 3, with tRNS) when the image has ≤ 256 colours,
// otherwise RGBA. Uses CompressionStream('deflate'), so it works in browsers and in Node 18+.

import { crc32 } from './crc32.js';
import { upscale, resizeNearest } from './scale.js';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

async function deflate(bytes) {
  if (typeof CompressionStream === 'function') {
    const cs = new CompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { deflateSync } = await import('node:zlib');
  return new Uint8Array(deflateSync(bytes));
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Map pixels to palette indices. Returns null when there are more than 256 colours. */
export function indexImage(img) {
  const d = img.data, n = img.width * img.height;
  const map = new Map(), colors = [], idx = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const k = d[o + 3] === 0 ? -1 : ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
    let v = map.get(k);
    if (v === undefined) {
      if (colors.length === 256) return null;
      v = colors.length; map.set(k, v);
      colors.push(k === -1 ? [0, 0, 0, 0] : [d[o], d[o + 1], d[o + 2], d[o + 3]]);
    }
    idx[i] = v;
  }
  return { colors, indices: idx };
}

/**
 * @param {{ width: number, height: number, data: ArrayLike<number> }} img
 * @param {{ scale?: number, grid?: boolean, gridColor?: string, indexed?: boolean, width?: number, height?: number }} [opts]
 *   width/height: resize to exactly this size (nearest neighbour) instead of scaling
 * @returns {Promise<Uint8Array>}
 */
export async function encodePNG(img, opts = {}) {
  if (opts.width && opts.height) img = resizeNearest(img, opts.width, opts.height);
  else if ((opts.scale && opts.scale > 1) || opts.grid) img = upscale(img, opts.scale || 1, opts);
  const { width: w, height: h } = img;
  const ix = opts.indexed === false ? null : indexImage(img);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  const parts = [new Uint8Array(SIG)];
  let raw;
  if (ix) {
    const bits = ix.colors.length <= 2 ? 1 : ix.colors.length <= 4 ? 2 : ix.colors.length <= 16 ? 4 : 8;
    ihdr.set([bits, 3, 0, 0, 0], 8);
    const stride = Math.ceil(w * bits / 8);
    raw = new Uint8Array((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      const row = y * (stride + 1) + 1;
      for (let x = 0; x < w; x++) {
        const v = ix.indices[y * w + x];
        const bit = x * bits;
        raw[row + (bit >> 3)] |= v << (8 - bits - (bit & 7));
      }
    }
    parts.push(chunk('IHDR', ihdr));
    parts.push(chunk('PLTE', Uint8Array.from(ix.colors.flatMap(c => c.slice(0, 3)))));
    if (ix.colors.some(c => c[3] < 255)) {
      let last = ix.colors.length; while (last > 0 && ix.colors[last - 1][3] === 255) last--;
      parts.push(chunk('tRNS', Uint8Array.from(ix.colors.slice(0, last).map(c => c[3]))));
    }
  } else {
    ihdr.set([8, 6, 0, 0, 0], 8);
    raw = new Uint8Array((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) raw.set(img.data.subarray ? img.data.subarray(y * w * 4, (y + 1) * w * 4) : Array.prototype.slice.call(img.data, y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    parts.push(chunk('IHDR', ihdr));
  }
  parts.push(chunk('IDAT', await deflate(raw)));
  parts.push(chunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
