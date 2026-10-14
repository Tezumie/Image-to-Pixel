// CPU reference implementation of every pipeline stage.
// The GLSL in gpu/shaders.js mirrors these functions line for line; tests compare the two.
// Working buffers are Float32Array RGBA, rows top-down, values 0..1.

import { oklab, LUMA } from '../color.js';

/**
 * Resample to w × h. 'box' averages up to 16×16 evenly spaced source texels per output pixel
 * (alpha-weighted); 'nearest' takes the centre texel. Integer maths, identical on the GPU.
 */
export function resample(src, w, h, mode = 'box', crop = null) {
  const ox = crop ? crop.x : 0, oy = crop ? crop.y : 0;
  const sw = crop ? crop.w : src.width, sh = crop ? crop.h : src.height, d = src.data, stride = src.width;
  const out = new Float32Array(w * h * 4);
  const nx = mode === 'nearest' ? 1 : Math.min(16, Math.max(1, Math.ceil(sw / w)));
  const ny = mode === 'nearest' ? 1 : Math.min(16, Math.max(1, Math.ceil(sh / h)));
  const xs = new Int32Array(w * nx), ys = new Int32Array(h * ny);
  for (let x = 0; x < w; x++) for (let i = 0; i < nx; i++) xs[x * nx + i] = ox + Math.min(sw - 1, Math.floor(((2 * (x * nx + i) + 1) * sw) / (2 * w * nx)));
  for (let y = 0; y < h; y++) for (let j = 0; j < ny; j++) ys[y * ny + j] = oy + Math.min(sh - 1, Math.floor(((2 * (y * ny + j) + 1) * sh) / (2 * h * ny)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ny; j++) {
        const row = ys[y * ny + j] * stride;
        for (let i = 0; i < nx; i++) {
          const o = (row + xs[x * nx + i]) * 4;
          const al = d[o + 3] / 255;
          r += d[o] / 255 * al; g += d[o + 1] / 255 * al; b += d[o + 2] / 255 * al; a += al;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / (nx * ny);
    }
  }
  return out;
}

/** Brightness, contrast, saturation, hue, gamma — in that order, in place. */
export function adjust(buf, { brightness = 0, contrast = 0, saturation = 0, hue = 0, gamma = 1 }) {
  if (!brightness && !contrast && !saturation && !hue && gamma === 1) return buf;
  const f = contrast >= 0 ? 1 / (1 - 0.99 * contrast) : 1 + contrast;
  const ig = 1 / gamma;
  // luminance-preserving hue rotation: the CSS hue-rotate() matrix (rows sum to 1, so greys stay grey)
  const hk = Math.cos(hue * Math.PI / 180), hq = Math.sin(hue * Math.PI / 180);
  const M = [
    0.213 + 0.787 * hk - 0.213 * hq, 0.715 - 0.715 * hk - 0.715 * hq, 0.072 - 0.072 * hk + 0.928 * hq,
    0.213 - 0.213 * hk + 0.143 * hq, 0.715 + 0.285 * hk + 0.140 * hq, 0.072 - 0.072 * hk - 0.283 * hq,
    0.213 - 0.213 * hk - 0.787 * hq, 0.715 - 0.715 * hk + 0.715 * hq, 0.072 + 0.928 * hk + 0.072 * hq,
  ];
  for (let o = 0; o < buf.length; o += 4) {
    let r = buf[o] + brightness, g = buf[o + 1] + brightness, b = buf[o + 2] + brightness;
    r = (r - 0.5) * f + 0.5; g = (g - 0.5) * f + 0.5; b = (b - 0.5) * f + 0.5;
    const l = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
    const k = 1 + saturation;
    r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
    if (hue) {
      const r2 = M[0] * r + M[1] * g + M[2] * b, g2 = M[3] * r + M[4] * g + M[5] * b, b2 = M[6] * r + M[7] * g + M[8] * b;
      r = r2; g = g2; b = b2;
    }
    buf[o] = Math.pow(clamp01(r), ig); buf[o + 1] = Math.pow(clamp01(g), ig); buf[o + 2] = Math.pow(clamp01(b), ig);
  }
  return buf;
}

/** Binary alpha: below the threshold becomes fully transparent, the rest fully opaque. */
export function alphaCut(buf, threshold) {
  for (let o = 3; o < buf.length; o += 4) buf[o] = buf[o] >= threshold && buf[o] > 0 ? 1 : 0;
  return buf;
}

export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Precompute what nearest() needs for a palette. */
export function paletteSpace(palette, distance) {
  const n = palette.length;
  const coords = new Float64Array(n * 3);
  const rgb = new Float64Array(n * 3);
  palette.forEach((c, i) => {
    rgb.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3);
    coords.set(distance === 1 ? [c[0] / 255, c[1] / 255, c[2] / 255] : oklab(c[0] / 255, c[1] / 255, c[2] / 255), i * 3);
  });
  return { n, coords, rgb, distance };
}

const W_RGB = [0.299, 0.587, 0.114];

/** Index of the nearest palette colour (ties: lowest index). */
export function nearest(sp, r, g, b) {
  let p0, p1, p2, w0 = 1, w1 = 1, w2 = 1;
  if (sp.distance === 1) { p0 = r; p1 = g; p2 = b; w0 = W_RGB[0]; w1 = W_RGB[1]; w2 = W_RGB[2]; }
  else [p0, p1, p2] = oklab(r, g, b);
  let best = 0, bd = Infinity;
  const c = sp.coords;
  for (let i = 0; i < sp.n; i++) {
    const d0 = p0 - c[i * 3], d1 = p1 - c[i * 3 + 1], d2 = p2 - c[i * 3 + 2];
    const dist = w0 * d0 * d0 + w1 * d1 * d1 + w2 * d2 * d2;
    if (dist < bd) { bd = dist; best = i; }
  }
  return best;
}

/** No dithering / ordered dithering → RGBA bytes. */
export function quantizeOrdered(buf, w, h, plan) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sp = plan.quantize ? paletteSpace(plan.palette, plan.distance) : null;
  const map = plan.kind === 'ordered' ? plan.map : null;
  const amt = map ? plan.spread * plan.settings.dither.strength : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (buf[o + 3] < 0.5) continue;                 // transparent stays 0,0,0,0
      let r = buf[o], g = buf[o + 1], b = buf[o + 2];
      if (sp) {
        if (map) {
          const t = (map.values[(y % map.h) * map.w + (x % map.w)] + 0.5) / map.levels - 0.5;
          r = clamp01(r + t * amt); g = clamp01(g + t * amt); b = clamp01(b + t * amt);
        }
        const i = nearest(sp, r, g, b);
        out[o] = plan.palette[i][0]; out[o + 1] = plan.palette[i][1]; out[o + 2] = plan.palette[i][2];
      } else {
        out[o] = Math.round(r * 255); out[o + 1] = Math.round(g * 255); out[o + 2] = Math.round(b * 255);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Error diffusion (left → right, top → bottom) → RGBA bytes. */
export function quantizeDiffusion(buf, w, h, plan) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sp = paletteSpace(plan.palette, plan.distance);
  const acc = new Float32Array(w * h * 3);
  const strength = plan.settings.dither.strength;
  const kernel = plan.kernel;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, o = p * 4;
      if (buf[o + 3] < 0.5) continue;
      const r = clamp01(buf[o] + acc[p * 3] * strength);
      const g = clamp01(buf[o + 1] + acc[p * 3 + 1] * strength);
      const b = clamp01(buf[o + 2] + acc[p * 3 + 2] * strength);
      const i = nearest(sp, r, g, b);
      const er = r - sp.rgb[i * 3], eg = g - sp.rgb[i * 3 + 1], eb = b - sp.rgb[i * 3 + 2];
      for (const [dx, dy, wt] of kernel) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= w || yy >= h) continue;
        const q = (yy * w + xx) * 3;
        acc[q] += er * wt; acc[q + 1] += eg * wt; acc[q + 2] += eb * wt;
      }
      out[o] = plan.palette[i][0]; out[o + 1] = plan.palette[i][1]; out[o + 2] = plan.palette[i][2]; out[o + 3] = 255;
    }
  }
  return out;
}

const key = (d, o) => (d[o + 3] === 0 ? -1 : (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Replace pixels that share no colour with any 4-neighbour by their most common neighbour. */
export function removeOrphans(px, w, h) {
  const src = px.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, c = key(src, o);
      const ks = [], os = [];
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const oo = (yy * w + xx) * 4;
        ks.push(key(src, oo)); os.push(oo);
      }
      if (ks.length < 2 || ks.includes(c)) continue;
      let best = 0, bc = 0;
      for (let i = 0; i < ks.length; i++) {
        let n = 0; for (let j = 0; j < ks.length; j++) if (ks[j] === ks[i]) n++;
        if (n > bc) { bc = n; best = i; }
      }
      px.set(src.subarray(os[best], os[best] + 4), o);
    }
  }
  return px;
}

/** 3×3 majority: a colour that fills at least 5 of the 9 cells wins. */
export function smoothMajority(px, w, h) {
  const src = px.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, c = key(src, o);
      const ks = [], os = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
        const oo = (yy * w + xx) * 4; ks.push(key(src, oo)); os.push(oo);
      }
      for (let i = 0; i < 9; i++) {
        if (ks[i] === c) continue;
        let n = 0; for (let j = 0; j < 9; j++) if (ks[j] === ks[i]) n++;
        if (n >= 5) { px.set(src.subarray(os[i], os[i] + 4), o); break; }
      }
    }
  }
  return px;
}

/** Outline around (outer) or inside (inner) the opaque shape. */
export function outline(px, w, h, { mode, color, corners }) {
  if (mode === 'none') return px;
  const src = px.slice();
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const nb = corners ? [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] : N4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const me = opaque(x, y);
      let hit = false;
      for (const [dx, dy] of nb) {
        const xx = x + dx, yy = y + dy;
        if (!inside(xx, yy)) continue;
        if (mode === 'outer' ? (!me && opaque(xx, yy)) : (me && !opaque(xx, yy))) { hit = true; break; }
      }
      if (hit) { const o = (y * w + x) * 4; px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; px[o + 3] = 255; }
    }
  }
  return px;
}
