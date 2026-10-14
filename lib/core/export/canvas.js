// DOM helpers: canvases and downloads.

import { upscale } from './scale.js';

/** RGBA image → <canvas>, upscaled by an integer factor with optional grid lines. */
export function toCanvas(img, scale = 1, opts = {}) {
  const up = scale > 1 || opts.grid ? upscale(img, scale, opts) : img;
  const c = opts.canvas || document.createElement('canvas');
  c.width = up.width; c.height = up.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(up.data), up.width, up.height), 0, 0);
  return c;
}

/** Trigger a browser download for a Blob or bytes. */
export function downloadBlob(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
