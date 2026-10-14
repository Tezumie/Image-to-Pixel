// Threshold maps for ordered dithering.
// A map is { w, h, levels, values: Uint8Array } and the threshold of a cell is (value + 0.5) / levels.
// The GPU reads the same bytes from a texture, so CPU and GPU agree exactly.

import { BLUE_NOISE_B64, BLUE_NOISE_SIZE } from './bluenoise-data.js';

function fromB64(b64) {
  if (typeof atob === 'function') return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Bayer index matrix of size n (power of two). */
export function bayer(n) {
  let m = [[0]];
  for (let s = 1; s < n; s *= 2) {
    const next = [];
    for (let y = 0; y < s * 2; y++) next.push(new Array(s * 2));
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = 4 * m[y][x];
      next[y][x] = v; next[y][x + s] = v + 2; next[y + s][x] = v + 3; next[y + s][x + s] = v + 1;
    }
    m = next;
  }
  return m;
}

/** Turn arbitrary numbers into ranks 0..n-1 (ties keep reading order). */
export function toRanks(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ i: y * w + x, v: rows[y][x] });
  cells.sort((a, b) => a.v - b.v || a.i - b.i);
  const out = new Uint8Array(w * h);
  cells.forEach((c, r) => { out[c.i] = r; });
  return out;
}

/** Clustered-dot screen: cells ranked by a dot function, two dots per tile at 45°. */
function clustered(n) {
  const rows = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n * 2 * Math.PI, v = (y + 0.5) / n * 2 * Math.PI;
      row.push(-(Math.cos(u) + Math.cos(v)) + (x * n + y) * 1e-9);
    }
    rows.push(row);
  }
  return rows;
}

const CLUSTER4 = [[7, 13, 11, 4], [12, 16, 14, 8], [10, 15, 6, 2], [5, 9, 3, 1]];   // classic editor's matrix
const cache = new Map();

/**
 * Threshold map for an ordered method id ('bayer4', 'bluenoise', 'custom' …).
 * @param {string} method
 * @param {number[][]|null} [custom] matrix for 'custom'
 */
export function thresholdMap(method, custom = null) {
  if (method === 'custom') {
    const m = custom && custom.length ? custom : bayer(4);
    return { w: m[0].length, h: m.length, levels: m.length * m[0].length, values: toRanks(m) };
  }
  if (cache.has(method)) return cache.get(method);
  let map;
  const sq = rows => ({ w: rows[0].length, h: rows.length, levels: rows.length * rows[0].length, values: toRanks(rows) });
  switch (method) {
    case 'bayer2': map = sq(bayer(2)); break;
    case 'bayer4': map = sq(bayer(4)); break;
    case 'bayer8': map = sq(bayer(8)); break;
    case 'bayer16': map = sq(bayer(16)); break;
    case 'cluster4': map = sq(CLUSTER4); break;
    case 'cluster8': map = sq(clustered(8)); break;
    case 'lines': map = sq([[0], [2], [1], [3]]); break;
    case 'bluenoise': map = { w: BLUE_NOISE_SIZE, h: BLUE_NOISE_SIZE, levels: 256, values: fromB64(BLUE_NOISE_B64) }; break;
    default: map = sq(bayer(4));
  }
  cache.set(method, map);
  return map;
}

/**
 * Parse a custom matrix typed by a person: rows on lines, numbers separated by spaces or commas.
 * Accepts an optional "/ 16" style divisor line, which is ignored (only the order matters).
 */
export function parseMatrix(text) {
  const rows = String(text).split(/\r?\n|;/).map(l => l.trim()).filter(l => l && !/^\//.test(l))
    .map(l => l.replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean).map(Number));
  if (!rows.length) throw new Error('Matrix is empty');
  const w = rows[0].length;
  if (rows.some(r => r.length !== w || r.some(v => !Number.isFinite(v)))) throw new Error('Every row needs the same number of values');
  if (w > 16 || rows.length > 16) throw new Error('Matrices are limited to 16×16');
  return rows;
}
