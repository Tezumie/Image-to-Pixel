---
title: Library
group: Library
order: 1
description: The engine without the UI. ES module, CommonJS or script tag, with TypeScript types.
---

# Library

## Install

```bash
npm i image-to-pixel
```

| Build | File | Use |
| --- | --- | --- |
| ES module | `dist/image-to-pixel.esm.js` | Bundlers. `shadermate` is a dependency |
| CommonJS | `dist/image-to-pixel.cjs` | `require('image-to-pixel')` |
| ES module, self-contained | `dist/image-to-pixel.bundle.esm.js` | `<script type="module">` from a CDN |
| Script tag | `dist/image-to-pixel.min.js` | Global `ImageToPixel` |

```html
<script src="https://cdn.jsdelivr.net/npm/image-to-pixel@3/dist/image-to-pixel.min.js"></script>
```

Types are in `types/` and picked up automatically.

## createPixelator()

```js
import { createPixelator } from 'image-to-pixel';
const px = await createPixelator({ backend: 'auto' });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `backend` | `'auto'` | `'auto'` uses WebGL 2 when available and the CPU otherwise. `'webgl'` fails instead of falling back. `'cpu'` never touches the GPU |
| `diffusion` | `'auto'` | Where error diffusion runs. `'auto'` uses the GPU unless WebGL is software-rendered (SwiftShader, llvmpipe), where the CPU is faster |
| `maxSourceSize` | `4096` | Larger sources are scaled down first |

Create one engine and reuse it: the GPU backend compiles its shaders once.

| Member | |
| --- | --- |
| `process(source, settings)` | Returns a `Promise` of a result. Calls are queued, so it is safe from input handlers |
| `backend` | `'webgl'` or `'cpu'` |
| `renderer` | The GPU's name (WebGL only) |
| `fallbackReason` | Why the GPU is not used, if it isn't |
| `invalidate()` | Forget the cached source. Call it after drawing new content into the same canvas |
| `destroy()` | Free the GPU resources |

### Sources

`process()` accepts an `<img>`, `<canvas>`, `OffscreenCanvas`, `ImageBitmap`, `<video>` (its current frame), `VideoFrame`, `ImageData`, any `{ width, height, data }` RGBA object, a `Blob` or `File`, a URL string, and p5 / q5 images. The same source object is uploaded to the GPU once and reused while you change settings.

### Settings

A partial settings object. Anything left out uses the default. See the [settings reference](../settings/).

```js
await px.process(img, {
  size: { width: 96 },
  palette: { source: 'custom', colors: ['#0d2b45', '#203c56', '#544e68', '#8d697a', '#d08159', '#ffaa5e', '#ffd4a3', '#ffecd6'] },
  dither: { method: 'bluenoise', strength: 0.7 },
  outline: { mode: 'outer', color: '#0d2b45' },
});
```

## The result

| Member | |
| --- | --- |
| `width`, `height` | Output size in pixels |
| `data` | `Uint8ClampedArray` of RGBA bytes, rows from the top |
| `palette` | The palette used, as `'#rrggbb'` strings (`null` with `source: 'none'`) |
| `crop` | The framed part of the source, as fractions `{ x, y, w, h }` |
| `usedColors()` | The distinct colours actually present |
| `toCanvas(scale = 1, { grid, gridColor, canvas })` | A canvas, upscaled by a whole number. Pass `canvas` to reuse one |
| `toImageData()` | An `ImageData` |
| `toPNG({ scale, grid, indexed })` | `Promise<Uint8Array>` of PNG bytes. Indexed when ≤ 256 colours unless `indexed: false` |
| `toBlob(opts)` | The same as a `Blob` |
| `settings` | The normalised settings used |
| `backend`, `ms` | Who drew it and how long it took |

## Helpers

| Function | |
| --- | --- |
| `pixelate(source, settings)` | One-shot with a shared engine. Also accepts the [2.x call](../migrating/) |
| `normalizeSettings(partial)`, `defaultSettings()`, `mergeSettings(a, patch)` | Build complete settings |
| `encodeSettings(s)`, `decodeSettings(str)` | Share-link strings (`#s=…`) |
| `settingsToJSON(s)`, `settingsFromJSON(text)` | Settings files |
| `PALETTES`, `getPalette(id)` | The built-in palettes |
| `parsePalette(text, filename?)` | Read .gpl, .hex, .pal, .txt, JSON or loose hex |
| `toGPL(name, colors)`, `toHexFile(colors)`, `toPaletteJSON(name, colors)` | Write palette files |
| `extractPalette(imageData, count)` | Median cut + k-means |
| `fetchLospec(slugOrUrl)` | Fetch a palette from lospec.com |
| `PRESETS`, `getPreset(id)` | The editor's presets |
| `DITHER_METHODS`, `KERNELS`, `thresholdMap(id)`, `parseMatrix(text)` | Dither data |
| `upscale(img, k, opts)`, `resizeNearest(img, w, h)`, `detectGrid(img)`, `uniqueColors(img)` | Pixel utilities |
| `cropRect(w, h, frame)`, `ASPECTS` | The source pixels a frame keeps; the aspect ratios |
| `encodePNG(img, opts)`, `encodeGIF(frames, opts)`, `createZip(entries)` | Encoders. No DOM needed |
| `packSpriteSheet(frames, opts)`, `buildTileset(img, opts)` | Game exports |
| `forEachFrame(video, opts)`, `estimateFps(video)` | Frame-accurate video stepping |
| `videoReady(video)`, `mediaError(video)`, `sniffVideoCodec(file)` | Wait for a video, explain why it can't play, name its codec |
| `toCanvas(img, scale)`, `downloadBlob(data, name)` | Browser conveniences |

## Node

In Node there is no WebGL, so the CPU backend runs. Pass decoded pixels as `{ width, height, data }`:

```js
import { createPixelator } from 'image-to-pixel';
import { writeFile } from 'node:fs/promises';

const px = await createPixelator();               // backend: 'cpu'
const result = await px.process({ width, height, data }, { size: { width: 64 } });
await writeFile('out.png', await result.toPNG({ scale: 4 }));
```

Decode images with any library you like (`sharp`, `pngjs`, `@napi-rs/canvas`).

## TypeScript

```ts
import { createPixelator, type Settings, type PixelResult } from 'image-to-pixel';
const look: Partial<Settings> = { dither: { method: 'atkinson', strength: 1 } };
```
