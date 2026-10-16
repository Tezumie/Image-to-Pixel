# Image-to-Pixel

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-♥-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Tezumie)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Turn images and video into pixel art. A free, open-source editor that runs in your browser, and the engine behind it as an npm package.

**[Open the editor](https://tezumie.github.io/Image-to-Pixel/editor/)** · [Docs](https://tezumie.github.io/Image-to-Pixel/docs/) · [Examples](https://tezumie.github.io/Image-to-Pixel/examples/) · [Classic 2.x editor](https://tezumie.github.io/Image-to-Pixel/classic/)

- **16 dither methods**: Bayer 2–16, clustered dot, blue noise, custom matrices, and Floyd–Steinberg, Atkinson, Sierra, Burkes, Jarvis and Stucki diffusion.
- **Palettes**: 24 built in, extracted from the image, picked by hand, or imported from .gpl, .hex, .pal, .txt, JSON and Lospec.
- **Batches and video**: one set of settings for many files; frame-accurate video export to GIF, WebM, MP4 or PNG sequences, keeping the soundtrack in WebM and MP4.
- **Game-ready output**: integer-scaled and indexed PNGs, sprite sheets with JSON atlases, deduplicated tilesets.
- **GPU first**: every step is a WebGL 2 shader pass run by [ShaderMate](https://github.com/Tezumie/ShaderMate). The CPU path gives identical pixels when WebGL isn't there, including in Node.

## Library

```bash
npm i image-to-pixel
```

```js
import { createPixelator } from 'image-to-pixel';

const px = await createPixelator();
const result = await px.process(imageElement, {
  size: { width: 128 },
  palette: { source: 'builtin', id: 'pico-8' },
  dither: { method: 'floyd-steinberg', strength: 0.8 },
});

document.body.append(result.toCanvas(4));
const png = await result.toBlob({ scale: 4 });
```

Script tag (global `ImageToPixel`):

```html
<script src="https://cdn.jsdelivr.net/npm/image-to-pixel@3/dist/image-to-pixel.min.js"></script>
```

The 2.x call, `pixelate({ image, width, dither, strength, palette, resolution })`, still works. See [Migrating](https://tezumie.github.io/Image-to-Pixel/docs/migrating/).

| Entry | |
| --- | --- |
| `image-to-pixel` | The engine, settings, palettes, encoders (PNG, GIF, ZIP), sprite sheets, tilesets, video stepping |
| `image-to-pixel/video` | MP4 and WebM encoding with WebCodecs |
| `image-to-pixel/editor` + `editor.css` | The full editor, mountable in any element |

## Development

Node 22. Every script is plain Node, so it works the same in PowerShell, bash and browser IDEs.

```bash
npm install
npm run dev          # http://localhost:8080/Image-to-Pixel/, rebuilds on change
npm test             # build dist/ and _site/, then node --test
npm run build:site   # static site in _site/ (what GitHub Pages serves)
npm run preview      # serve _site/
```

Pushing to `main` runs the tests and deploys the site with `.github/workflows/site.yml`. Set Pages to "GitHub Actions" in the repository settings.

Repository layout, tests and how to add a dither method, palette, docs page or example: [Contributing](https://tezumie.github.io/Image-to-Pixel/docs/contributing/).

The classic editor (`index.html`, `image-to-pixel.js`, `css/`, `src/`) is kept unchanged at the root and published at `/classic/`.

## Licence

MIT, see [LICENSE](LICENSE). This covers everything in the repository: the library, the editor, the site and the classic 2.x files.

Built-in palettes come from [Lospec](https://lospec.com/palette-list) and are credited to their authors in the editor. Geist and JetBrains Mono are under the SIL Open Font License.