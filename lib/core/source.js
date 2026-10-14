// Turning whatever the caller has into a "frame": { width, height, canvas?, data }.
// Accepts URLs, Blobs/Files, <img>, <canvas>, OffscreenCanvas, ImageBitmap, <video> (current frame),
// VideoFrame, ImageData or any { width, height, data } RGBA object, plus p5 / q5 images.

export const MAX_SOURCE = 4096;
const hasDOM = typeof document !== 'undefined';

const isRGBA = s => s && typeof s === 'object' && 'data' in s && 'width' in s && 'height' in s && s.data && s.data.length === s.width * s.height * 4;

/** Load a URL or Blob into something drawable. */
export async function loadImage(src) {
  if (typeof Blob !== 'undefined' && src instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(src); } catch { /* fall through (e.g. SVG) */ }
    }
    src = URL.createObjectURL(src);
  }
  if (!hasDOM) throw new Error('Loading images by URL needs a browser; pass { width, height, data } in Node.');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

/** Natural pixel size of a drawable. */
export function sizeOf(el) {
  return {
    width: el.naturalWidth || el.videoWidth || el.displayWidth || el.codedWidth || el.width || 0,
    height: el.naturalHeight || el.videoHeight || el.displayHeight || el.codedHeight || el.height || 0,
  };
}

function unwrap(src) {
  // p5.Image / q5 image / p5.Graphics / p5.Renderer
  if (src && !isRGBA(src) && typeof src === 'object') {
    if (src.canvas && typeof src.canvas === 'object' && 'getContext' in src.canvas) return src.canvas;
    if (src.elt && typeof src.elt === 'object' && 'getContext' in src.elt) return src.elt;
  }
  return src;
}

/**
 * @param {any} source
 * @param {{ maxSize?: number, canvas?: HTMLCanvasElement }} [opts] canvas: scratch canvas to reuse
 */
export async function toFrame(source, opts = {}) {
  const maxSize = opts.maxSize || MAX_SOURCE;
  let src = unwrap(source);
  if (typeof src === 'string' || (typeof Blob !== 'undefined' && src instanceof Blob)) src = await loadImage(src);
  if (src && typeof src.complete === 'boolean' && !src.complete && src.decode) await src.decode();

  if (isRGBA(src)) {
    const frame = { width: src.width, height: src.height, data: src.data, canvas: null };
    if (hasDOM) {
      Object.defineProperty(frame, 'canvas', {
        configurable: true,
        get() {
          const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
          const img = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
          c.getContext('2d').putImageData(img, 0, 0);
          Object.defineProperty(frame, 'canvas', { value: c });
          return c;
        },
      });
    }
    return frame;
  }
  if (!hasDOM) throw new Error('Unsupported source in a non-browser environment. Pass { width, height, data }.');

  let { width, height } = sizeOf(src);
  if (!width || !height) throw new Error('Source has no size yet (is the image or video loaded?)');
  const k = Math.min(1, maxSize / Math.max(width, height));
  width = Math.max(1, Math.round(width * k)); height = Math.max(1, Math.round(height * k));

  const canvas = opts.canvas || document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = k < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  let cached = null;
  return {
    width, height, canvas, dirty: true,
    get data() { return (cached ||= ctx.getImageData(0, 0, width, height).data); },
  };
}
