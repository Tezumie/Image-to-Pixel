---
title: Size and resampling
group: Editor
order: 2
description: How big the pixel art is, and how source pixels are combined.
---

# Size and resampling

## Width or pixel size

**Width** sets the output width in pixels. Height follows the image's aspect ratio unless you type one. The slider goes to 512; type up to 2048 in the box.

**Pixel size** sets how many source pixels become one output pixel. A 960 px image with a pixel size of 8 becomes 120 px wide. Use it when you think in "chunkiness" rather than final size, or for upscaled pixel art (below).

<kbd>[</kbd> and <kbd>]</kbd> change the width by one pixel; hold <kbd>Shift</kbd> for steps of eight.

## Frame

The **Frame** section chooses which part of the source becomes pixel art, before it is resized.

| Control | Does |
| --- | --- |
| Aspect ratio | Original, 1:1, 4:3, 3:4, 3:2, 2:3, 16:9 or 9:16. The largest rectangle of that shape that fits the source is used |
| Zoom | 1× to 8×: crops further into the frame |
| Horizontal / vertical position | Where the frame sits, from left to right and top to bottom. Shown only when there's room to move |

Width and pixel size apply to the framed part, so a 1:1 frame with a width of 64 gives exactly 64 × 64. The compare view (<kbd>C</kbd>) shows the same framed part of the original.

## Resample: average or nearest

| Mode | What it does | Use it for |
| --- | --- | --- |
| Average | Averages up to 16 × 16 evenly spaced source pixels per output pixel, weighted by alpha | Photos, illustrations, anything smooth |
| Nearest | Takes the source pixel at the centre of each block | Art that is already pixelated, or when you want hard edges |

Averaging is alpha-aware: a half-transparent edge doesn't darken the colour next to it.

## Detect grid

Pixel art is often shared upscaled (a 32 px sprite saved at 8×). **Detect grid** measures the size of the solid blocks and switches to **Pixel size** with that value and **Nearest**, which recovers the original pixels exactly. It tolerates mild JPEG noise.

If it reports no grid, the image is not a clean upscale.
