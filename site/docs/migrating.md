---
title: Migrating from 2.x
group: Project
order: 1
description: The classic pixelate() call still works. Here is what changed around it.
---

# Migrating from 2.x

## The classic call still works

```js
const canvas = await ImageToPixel.pixelate({
  image: myCanvas,
  width: 128,
  dither: 'Floyd-Steinberg',
  strength: 20,
  palette: ['#1b1b1e', '#f4f1de', '#e07a5f'],
  resolution: 'original',
});
```

`pixelate()` with a single object argument behaves like 2.x and returns a canvas. The global is now `ImageToPixel.pixelate` rather than a bare `pixelate`, and the script is `dist/image-to-pixel.min.js`. The old file at the repository root (`image-to-pixel.js`) is unchanged, so existing links to it keep working.

| 2.x `dither` | 3.x `method` |
| --- | --- |
| `'Floyd-Steinberg'` | `'floyd-steinberg'` |
| `'atkinson'` | `'atkinson'` |
| `'2x2 Bayer'`, `'4x4 Bayer'` | `'bayer2'`, `'bayer4'` |
| `'ordered'` | `'bayer8'` |
| `'Clustered 4x4'` | `'cluster4'` |

`strength` was 0–100; it is 0–1 in the new settings.

## What is different

- Colour matching defaults to OKLab instead of RGB distance; set `palette.distance: 'rgb'` for the old behaviour.
- Ordered dithering scales with the palette, so the same strength looks similar for any palette.
- Results are p5/q5-agnostic. The new API returns a result object; call `result.toCanvas()` and draw that with `image()`. Passing a p5 or q5 image *in* still works.
- The editor was rewritten. The old one is at [classic](../../classic/).
