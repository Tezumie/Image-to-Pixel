// Error-diffusion kernels as push offsets [dx, dy, weight] (weights already divided).
// `skew` is the wavefront slope the GPU needs: pixels with x + skew*y = k only depend on
// earlier waves, so each wave is one draw (see docs/how-it-works.md).

const k = (div, list) => list.map(([dx, dy, w]) => [dx, dy, w / div]);

export const KERNELS = {
  'floyd-steinberg': k(16, [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]),
  'atkinson': k(8, [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]]),
  'sierra-lite': k(4, [[1, 0, 2], [-1, 1, 1], [0, 1, 1]]),
  'sierra': k(32, [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]]),
  'burkes': k(32, [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]]),
  'jarvis': k(48, [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]]),
  'stucki': k(42, [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]]),
};

export const MAX_KERNEL = 12;

/** Smallest integer s so that every push offset lands on a later wave x + s*y. */
export function kernelSkew(kernel) {
  let s = 1;
  for (const [dx, dy] of kernel) if (dy > 0) s = Math.max(s, Math.floor(-dx / dy) + 1);
  return s;
}

/** Number of waves (GPU draws) for an image of w × h. */
export const waveCount = (w, h, skew) => (w - 1) + skew * (h - 1) + 1;
