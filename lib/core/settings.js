// The settings object is the one contract between the engine, the editor, presets,
// share links and saved JSON. Everything goes through normalizeSettings().

import { getPalette } from './palette/builtin.js';
import { normHex, isColor } from './color.js';

export const SETTINGS_VERSION = 1;
export const MAX_SIZE = 2048;

/** Dither methods. `kind` decides which pipeline runs them. */
export const DITHER_METHODS = [
  { id: 'none', label: 'None', kind: 'none' },
  { id: 'bayer2', label: 'Bayer 2×2', kind: 'ordered' },
  { id: 'bayer4', label: 'Bayer 4×4', kind: 'ordered' },
  { id: 'bayer8', label: 'Bayer 8×8', kind: 'ordered' },
  { id: 'bayer16', label: 'Bayer 16×16', kind: 'ordered' },
  { id: 'cluster4', label: 'Clustered dot 4×4', kind: 'ordered' },
  { id: 'cluster8', label: 'Clustered dot 8×8', kind: 'ordered' },
  { id: 'lines', label: 'Horizontal lines', kind: 'ordered' },
  { id: 'bluenoise', label: 'Blue noise', kind: 'ordered' },
  { id: 'custom', label: 'Custom matrix', kind: 'ordered' },
  { id: 'floyd-steinberg', label: 'Floyd–Steinberg', kind: 'diffusion' },
  { id: 'atkinson', label: 'Atkinson', kind: 'diffusion' },
  { id: 'sierra-lite', label: 'Sierra Lite', kind: 'diffusion' },
  { id: 'sierra', label: 'Sierra', kind: 'diffusion' },
  { id: 'burkes', label: 'Burkes', kind: 'diffusion' },
  { id: 'jarvis', label: 'Jarvis–Judice–Ninke', kind: 'diffusion' },
  { id: 'stucki', label: 'Stucki', kind: 'diffusion' },
];
export const ditherKind = id => (DITHER_METHODS.find(m => m.id === id) || { kind: 'none' }).kind;

/** Names the classic image-to-pixel.js used, mapped to the new ids. */
export const LEGACY_DITHER = {
  'none': 'none', 'floyd-steinberg': 'floyd-steinberg', 'atkinson': 'atkinson',
  'ordered': 'bayer8', '2x2 bayer': 'bayer2', '4x4 bayer': 'bayer4', 'clustered 4x4': 'cluster4',
};

export const DEFAULTS = Object.freeze({
  version: SETTINGS_VERSION,
  size: { mode: 'width', width: 96, height: 0, block: 8, resample: 'box' },
  adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 1 },
  frame: { aspect: 'original', zoom: 1, x: 0.5, y: 0.5 },
  palette: { source: 'builtin', id: 'endesga-32', name: 'Endesga 32', colors: [], count: 16, distance: 'oklab' },
  dither: { method: 'bayer4', strength: 0.6, matrix: null },
  alpha: { threshold: 0.5 },
  cleanup: { orphans: false, smooth: false },
  outline: { mode: 'none', color: '#000000', corners: false },
  export: { size: 'scale', scale: 4, indexed: true, grid: false, gridColor: '#000000' },
});

const clamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** Deep copy of the defaults (palette colours resolved). */
export function defaultSettings() {
  return normalizeSettings({});
}

/**
 * Fill in defaults, clamp ranges, resolve built-in palette colours and drop unknown keys.
 * Never throws on bad values; it falls back to the default for that field.
 * @param {object} input partial settings
 */
export function normalizeSettings(input = {}) {
  const d = DEFAULTS;
  const i = input || {};
  const s = {}; const size = i.size || {}; const adj = i.adjust || {}; const pal = i.palette || {};
  const dit = i.dither || {}; const al = i.alpha || {}; const cl = i.cleanup || {}; const ol = i.outline || {};
  const ex = i.export || {};

  s.version = SETTINGS_VERSION;
  s.size = {
    mode: oneOf(size.mode, ['width', 'block'], d.size.mode),
    width: Math.round(clamp(size.width, 1, MAX_SIZE, d.size.width)),
    height: Math.round(clamp(size.height, 0, MAX_SIZE, d.size.height)),
    block: clamp(size.block, 1, 256, d.size.block),
    resample: oneOf(size.resample, ['box', 'nearest'], d.size.resample),
  };
  s.adjust = {
    brightness: clamp(adj.brightness, -1, 1, 0),
    contrast: clamp(adj.contrast, -1, 1, 0),
    saturation: clamp(adj.saturation, -1, 1, 0),
    hue: clamp(adj.hue, -180, 180, 0),
    gamma: clamp(adj.gamma, 0.2, 5, 1),
  };
  const fr = i.frame || {};
  s.frame = {
    aspect: oneOf(fr.aspect, ASPECTS.map(a => a.id), 'original'),
    zoom: clamp(fr.zoom, 1, 8, 1),
    x: clamp(fr.x, 0, 1, 0.5),
    y: clamp(fr.y, 0, 1, 0.5),
  };

  const source = oneOf(pal.source, ['builtin', 'custom', 'extract', 'none'], d.palette.source);
  s.palette = {
    source,
    id: typeof pal.id === 'string' ? pal.id : (source === 'builtin' ? d.palette.id : ''),
    name: typeof pal.name === 'string' ? pal.name : '',
    colors: [],
    count: Math.round(clamp(pal.count, 2, 256, d.palette.count)),
    distance: oneOf(pal.distance, ['oklab', 'rgb'], d.palette.distance),
  };
  if (source === 'builtin') {
    const p = getPalette(s.palette.id) || getPalette(d.palette.id);
    s.palette.id = p.id; s.palette.name = p.name; s.palette.colors = p.colors.map(c => '#' + c);
  } else if (source === 'custom') {
    s.palette.colors = (Array.isArray(pal.colors) ? pal.colors : []).filter(isColor).map(normHex).slice(0, 256);
    if (!s.palette.colors.length) s.palette.colors = ['#000000', '#ffffff'];
    s.palette.name = s.palette.name || 'Custom';
  } else if (source === 'extract') {
    s.palette.name = `Extracted (${s.palette.count})`;
  } else {
    s.palette.name = 'None';
  }

  const method = DITHER_METHODS.some(m => m.id === dit.method) ? dit.method : d.dither.method;
  s.dither = {
    method,
    strength: clamp(dit.strength, 0, 1, d.dither.strength),
    matrix: normalizeMatrix(dit.matrix),
  };
  s.alpha = { threshold: clamp(al.threshold, 0, 1, d.alpha.threshold) };
  s.cleanup = { orphans: bool(cl.orphans, false), smooth: bool(cl.smooth, false) };
  s.outline = {
    mode: oneOf(ol.mode, ['none', 'outer', 'inner'], 'none'),
    color: isColor(ol.color) ? normHex(ol.color) : d.outline.color,
    corners: bool(ol.corners, false),
  };
  s.export = {
    size: oneOf(ex.size, ['scale', 'source'], 'scale'),
    scale: Math.round(clamp(ex.scale, 1, 64, d.export.scale)),
    indexed: bool(ex.indexed, d.export.indexed),
    grid: bool(ex.grid, false),
    gridColor: isColor(ex.gridColor) ? normHex(ex.gridColor) : d.export.gridColor,
  };
  return s;
}

/** A custom threshold matrix: 2D array of numbers. Ranks are derived from the order of the values. */
export function normalizeMatrix(m) {
  if (!Array.isArray(m) || !m.length || !Array.isArray(m[0])) return null;
  const h = Math.min(16, m.length), w = Math.min(16, m[0].length);
  const out = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) { const v = Number((m[y] || [])[x]); row.push(Number.isFinite(v) ? v : 0); }
    out.push(row);
  }
  return out;
}

/** Frame aspect ratios. `ratio` is width / height; null keeps the source's. */
export const ASPECTS = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

/**
 * The part of a srcW × srcH source that `frame` keeps, in whole source pixels.
 * The largest rectangle of the chosen aspect that fits, divided by zoom, placed by x/y (0 = left/top, 1 = right/bottom).
 */
export function cropRect(srcW, srcH, frame = {}) {
  const a = (ASPECTS.find(x => x.id === frame.aspect) || ASPECTS[0]).ratio || srcW / srcH;
  let w = srcW, h = srcW / a;
  if (h > srcH) { h = srcH; w = srcH * a; }
  const zoom = Math.max(1, frame.zoom || 1);
  w = Math.max(1, Math.min(srcW, Math.round(w / zoom)));
  h = Math.max(1, Math.min(srcH, Math.round(h / zoom)));
  const fx = frame.x ?? 0.5, fy = frame.y ?? 0.5;
  return { x: Math.round((srcW - w) * fx), y: Math.round((srcH - h) * fy), w, h };
}

/** Output size in pixels for a source of srcW × srcH. */
export function resolveSize(srcW, srcH, size) {
  let w, h;
  if (size.mode === 'block') {
    w = Math.max(1, Math.round(srcW / size.block));
    h = Math.max(1, Math.round(srcH / size.block));
  } else {
    w = size.width;
    h = size.height || Math.max(1, Math.round(w * srcH / srcW));
  }
  return { width: Math.min(MAX_SIZE, w), height: Math.min(MAX_SIZE, h) };
}

// ---- sharing ---------------------------------------------------------------

function diff(a, b) {
  // keys of `a` whose value differs from `b` (one level deep per group)
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'version') continue;
    const va = a[k], vb = b[k];
    if (va && typeof va === 'object' && !Array.isArray(va)) {
      const g = {};
      for (const kk of Object.keys(va)) if (JSON.stringify(va[kk]) !== JSON.stringify(vb && vb[kk])) g[kk] = va[kk];
      if (Object.keys(g).length) out[k] = g;
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) out[k] = va;
  }
  return out;
}

const b64url = {
  enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  },
};

/** Settings → the smallest JSON that rebuilds them (only what differs from the defaults). */
export function compactSettings(settings) {
  const s = normalizeSettings(settings);
  const out = diff(s, defaultSettings());
  if (out.palette) {
    if (s.palette.source !== 'custom') { delete out.palette.colors; delete out.palette.name; }   // a built-in id is enough
    if (s.palette.source !== 'builtin') delete out.palette.id;
    if (s.palette.source !== 'extract') delete out.palette.count;
  }
  if (out.palette && !Object.keys(out.palette).length) delete out.palette;
  return out;
}

/** Settings → URL-safe string for `#s=…`. */
export function encodeSettings(settings) {
  return b64url.enc(JSON.stringify({ v: SETTINGS_VERSION, ...compactSettings(settings) }));
}

/** `#s=…` string (or a whole URL / hash) → settings. Throws on garbage. */
export function decodeSettings(str) {
  let s = String(str);
  const m = /[#&?]s=([A-Za-z0-9_-]+)/.exec(s);
  if (m) s = m[1];
  const obj = JSON.parse(b64url.dec(s));
  delete obj.v;
  return normalizeSettings(obj);
}

/** Settings → pretty JSON for saving to a file. */
export function settingsToJSON(settings) {
  return JSON.stringify({ $schema: 'image-to-pixel/settings', version: SETTINGS_VERSION, ...compactSettings(settings) }, null, 2);
}

/** JSON text → settings. Accepts a full or partial settings object. */
export function settingsFromJSON(text) {
  const obj = typeof text === 'string' ? JSON.parse(text) : text;
  delete obj.$schema;
  return normalizeSettings(obj);
}

/** Apply a partial patch on top of settings (one level deep per group). */
export function mergeSettings(base, patch) {
  const out = JSON.parse(JSON.stringify(base));
  for (const k of Object.keys(patch || {})) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && out[k] && typeof out[k] === 'object') {
      Object.assign(out[k], patch[k]);
    } else out[k] = patch[k];
  }
  return normalizeSettings(out);
}
