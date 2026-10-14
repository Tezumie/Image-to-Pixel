// Palette extraction: median cut on the image's colours, refined by a few k-means passes.
// Deterministic (no randomness), so the same image always gives the same palette.

import { toHex } from '../color.js';

/**
 * @param {{ data: ArrayLike<number>, width: number, height: number }} img RGBA bytes
 * @param {number} count number of colours (2..256)
 * @param {{ maxSamples?: number, alphaThreshold?: number }} [opts]
 * @returns {string[]} '#rrggbb' colours sorted dark → light
 */
export function extractPalette(img, count = 16, opts = {}) {
  const { maxSamples = 40000, alphaThreshold = 0.5 } = opts;
  const n = img.width * img.height;
  const step = Math.max(1, Math.floor(n / maxSamples));
  const pts = [];
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    if (img.data[o + 3] < alphaThreshold * 255) continue;
    pts.push([img.data[o], img.data[o + 1], img.data[o + 2]]);
  }
  if (!pts.length) return ['#000000', '#ffffff'].slice(0, Math.max(1, count));

  // ---- median cut
  let boxes = [pts];
  while (boxes.length < count) {
    let bi = -1, bestRange = -1, bestAxis = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255, hi = 0;
        for (const p of b) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; }
        // weight by population so big flat areas get split before tiny noisy ones
        const r = (hi - lo) * Math.sqrt(b.length);
        if (r > bestRange) { bestRange = r; bi = i; bestAxis = a; }
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const b = boxes[bi].slice().sort((p, q) => p[bestAxis] - q[bestAxis]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  let centers = boxes.map(b => mean(b));

  // ---- k-means refinement
  for (let iter = 0; iter < 6; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dr = p[0] - centers[c][0], dg = p[1] - centers[c][1], db = p[2] - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = c; }
      }
      const s = sums[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
  }

  const hexes = [...new Set(centers.map(c => toHex(c)))];
  const lum = h => { const v = parseInt(h.slice(1), 16); return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255); };
  return hexes.sort((a, b) => lum(a) - lum(b));
}

function mean(list) {
  let r = 0, g = 0, b = 0;
  for (const p of list) { r += p[0]; g += p[1]; b += p[2]; }
  return [r / list.length, g / list.length, b / list.length];
}
