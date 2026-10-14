---
title: Contributing
group: Project
order: 2
description: Repository layout, scripts and tests.
---

# Contributing

## Layout

```
lib/
  index.js            core entry (no UI)
  video.js            image-to-pixel/video entry
  core/               settings, palettes, dithering, CPU stages, GPU passes, encoders
  editor/             the editor UI and its styles
site/                 landing page, editor page, docs (Markdown), examples
scripts/              build, serve, screenshots, blue-noise generator
test/                 node --test suites
types/                TypeScript declarations
index.html, image-to-pixel.js, css/, src/    the classic 2.x editor, unchanged
```

## Scripts

All scripts are plain Node, so they behave the same in PowerShell, cmd, bash and browser IDEs such as Codevre. The build only needs basic file reads and writes (no `statSync`, no esbuild-emitted assets). The dev server builds in-process (no child processes), polls for changes alongside `fs.watch`, and serves the site at `/`, at `/Image-to-Pixel/` and behind preview proxies that add a path prefix. If the native esbuild binary can't run, `npm i -D esbuild-wasm` and the build uses it instead (`ESBUILD=wasm` forces it).

| Command | |
| --- | --- |
| `npm run build` | Library bundles into `dist/` |
| `npm run build:site` | Bundles + the static site into `_site/` |
| `npm run dev` | Build, serve at `http://localhost:8080/Image-to-Pixel/`, rebuild on change |
| `npm run preview` | Serve `_site/` as GitHub Pages would |
| `npm test` | Build the site, then `node --test` |
| `npm run screenshots` | Headless screenshots of the site in both themes (needs Playwright) |
| `npm run bluenoise` | Regenerate the blue-noise texture |
| `npm run clean` | Remove `dist/` and `_site/` |
| `npm run check:runtime` | Probe the Node APIs the build uses (for in-browser runtimes); all pass on Node 22 |

## Tests

`node --test` finds everything in `test/`. The suites cover settings and share links, palette parsing and extraction, every CPU stage, the PNG, GIF and ZIP encoders (decoded again in the test), sprite sheets and tilesets, the bundles (ESM, CJS and the script global), and a link checker that walks the built site and fails on any broken or absolute link.

GPU output is compared with the CPU in a real browser by `npm run screenshots`, which also fails on console errors.

## Adding things

- **A dither method:** add it to `DITHER_METHODS` in `lib/core/settings.js`, then a threshold map in `dither/matrices.js` or a kernel in `dither/kernels.js`. No shader change is needed.
- **A palette:** add it to `lib/core/palette/builtin.js`.
- **A docs page:** a Markdown file in `site/docs/` with `title`, `group` and `order` front matter.
- **An example:** a folder in `site/examples/` with `index.html` (just the body) and `example.json`.

## Deployment

`.github/workflows/site.yml` runs the tests and publishes `_site/` to GitHub Pages on every push to `main`. In the repository settings, set Pages to deploy from GitHub Actions.
