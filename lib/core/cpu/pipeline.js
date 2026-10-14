// The whole pipeline on the CPU. Used when WebGL 2 is unavailable, in Node, and as the
// reference the GPU output is tested against.

import { resample, adjust, alphaCut, quantizeOrdered, quantizeDiffusion, removeOrphans, smoothMajority, outline } from './stages.js';

/**
 * @param {ReturnType<import('../plan.js').makePlan>} plan
 * @param {{ width: number, height: number, data: ArrayLike<number> }} src RGBA bytes, rows top-down
 * @returns {Uint8ClampedArray} RGBA bytes, plan.width × plan.height
 */
export function runCPU(plan, src) {
  const { width: w, height: h, settings: s } = plan;
  const buf = resample(src, w, h, s.size.resample, plan.crop);
  adjust(buf, s.adjust);
  alphaCut(buf, s.alpha.threshold);
  const px = plan.kind === 'diffusion' ? quantizeDiffusion(buf, w, h, plan) : quantizeOrdered(buf, w, h, plan);
  if (s.cleanup.orphans) removeOrphans(px, w, h);
  if (s.cleanup.smooth) smoothMajority(px, w, h);
  outline(px, w, h, plan.outline);
  return px;
}
