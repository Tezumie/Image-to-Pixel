// Animated GIF encoder. Pixel art already uses a small palette, so frames are written
// losslessly with one global colour table whenever the whole animation fits in 256 colours
// (255 + transparency). Otherwise each frame gets its own table, reduced by median cut if needed.

import { upscale } from './scale.js';
import { extractPalette } from '../palette/extract.js';
import { parseColor } from '../color.js';

class ByteWriter {
  constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
  byte(b) { if (this.n === this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; } this.buf[this.n++] = b; }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
  u16(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  result() { return this.buf.slice(0, this.n); }
}

/** GIF-flavoured LZW for one frame of indices. */
export function lzwEncode(indices, minCodeSize, w) {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let codeSize = minCodeSize + 1, next = eoi + 1;
  let dict = new Map();
  let cur = 0, curBits = 0;
  const sub = [];
  let block = [];
  const emit = code => {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { block.push(cur & 255); cur >>>= 8; curBits -= 8; if (block.length === 255) { sub.push(block); block = []; } }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear); dict = new Map(); codeSize = minCodeSize + 1; next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) block.push(cur & 255);
  if (block.length) sub.push(block);
  w.byte(minCodeSize);
  for (const b of sub) { w.byte(b.length); w.bytes(b); }
  w.byte(0);
}

const keyOf = (d, o) => (d[o + 3] < 128 ? -1 : (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);

function tableFor(colorKeys, transparent) {
  const list = [...colorKeys].filter(k => k !== -1);
  const colors = list.map(k => [k >> 16, (k >> 8) & 255, k & 255]);
  const tIndex = transparent ? colors.length : -1;
  if (transparent) colors.push([0, 0, 0]);
  let bits = 1; while ((1 << bits) < colors.length) bits++;
  while (colors.length < (1 << bits)) colors.push([0, 0, 0]);
  const index = new Map(list.map((k, i) => [k, i]));
  return { colors, bits, tIndex, index };
}

function reduce(frame, max) {
  // > max colours: median-cut palette, then nearest colour per pixel
  const pal = extractPalette(frame, max).map(parseColor);
  const d = new Uint8ClampedArray(frame.data);
  const cache = new Map();
  for (let o = 0; o < d.length; o += 4) {
    if (d[o + 3] < 128) continue;
    const k = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
    let best = cache.get(k);
    if (best === undefined) {
      let bd = Infinity; best = 0;
      for (let i = 0; i < pal.length; i++) {
        const dr = d[o] - pal[i][0], dg = d[o + 1] - pal[i][1], db = d[o + 2] - pal[i][2];
        const dist = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (dist < bd) { bd = dist; best = i; }
      }
      cache.set(k, best);
    }
    d.set(pal[best], o);
  }
  return { ...frame, data: d };
}

/**
 * @param {{ width: number, height: number, data: ArrayLike<number>, delay?: number }[]} frames delay in ms
 * @param {{ loop?: number, scale?: number, delay?: number }} [opts] loop: 0 = forever, -1 = play once
 * @returns {Uint8Array}
 */
export function encodeGIF(frames, opts = {}) {
  if (!frames.length) throw new Error('No frames');
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const fr = frames.map(f => ({ ...(scale > 1 ? upscale(f, scale) : f), delay: f.delay ?? opts.delay ?? 100 }));
  const W = fr[0].width, H = fr[0].height;

  // collect colours
  let transparent = false;
  const all = new Set();
  const perFrame = fr.map(f => {
    const s = new Set();
    for (let o = 0; o < f.data.length; o += 4) { const k = keyOf(f.data, o); if (k === -1) transparent = true; s.add(k); all.add(k); }
    return s;
  });
  const opaqueCount = s => s.size - (s.has(-1) ? 1 : 0);
  const globalOK = opaqueCount(all) + (transparent ? 1 : 0) <= 256;
  const global = globalOK ? tableFor(all, transparent) : null;

  const w = new ByteWriter();
  w.str('GIF89a');
  w.u16(W); w.u16(H);
  w.byte(global ? 0xf0 | (global.bits - 1) : 0x00);
  w.byte(0); w.byte(0);
  if (global) for (const c of global.colors) w.bytes(c);
  if (fr.length > 1 && opts.loop !== -1) {
    w.byte(0x21); w.byte(0xff); w.byte(11); w.str('NETSCAPE2.0'); w.byte(3); w.byte(1); w.u16(opts.loop || 0); w.byte(0);
  }

  fr.forEach((f0, i) => {
    let f = f0, table = global, set = perFrame[i];
    if (!table) {
      const max = transparent ? 255 : 256;
      if (opaqueCount(set) > max) {
        f = reduce(f0, max);
        set = new Set(); for (let o = 0; o < f.data.length; o += 4) set.add(keyOf(f.data, o));
      }
      table = tableFor(set, set.has(-1));
    }
    // graphic control extension
    w.byte(0x21); w.byte(0xf9); w.byte(4);
    w.byte(((transparent ? 2 : 1) << 2) | (table.tIndex >= 0 ? 1 : 0));
    w.u16(Math.max(2, Math.round(f.delay / 10)));
    w.byte(table.tIndex >= 0 ? table.tIndex : 0);
    w.byte(0);
    // image descriptor
    w.byte(0x2c); w.u16(0); w.u16(0); w.u16(W); w.u16(H);
    w.byte(table === global ? 0 : 0x80 | (table.bits - 1));
    if (table !== global) for (const c of table.colors) w.bytes(c);
    const idx = new Uint8Array(W * H);
    for (let p = 0; p < idx.length; p++) {
      const k = keyOf(f.data, p * 4);
      idx[p] = k === -1 ? table.tIndex : table.index.get(k);
    }
    lzwEncode(idx, Math.max(2, table.bits), w);
  });
  w.byte(0x3b);
  return w.result();
}
