---
title: Dithering
group: Editor
order: 4
description: The sixteen methods, what strength does, and custom threshold matrices.
---

# Dithering

Dithering mixes palette colours in small patterns so that, from a distance, you see colours and gradients the palette doesn't have.

## Methods

| Method | Family | Character |
| --- | --- | --- |
| None | – | Flat areas, hard banding. Best for sprites and logos |
| Bayer 2×2, 4×4, 8×8, 16×16 | Ordered | The classic cross-hatch. Larger matrices give more tone levels |
| Clustered dot 4×4, 8×8 | Ordered | Halftone dots, like print |
| Horizontal lines | Ordered | Scan-line bands |
| Blue noise | Ordered | Even, grain-like, no visible pattern. Stable across animation frames |
| Custom matrix | Ordered | Your own threshold pattern (below) |
| Floyd–Steinberg | Error diffusion | Fine and organic; the default choice for photos |
| Atkinson | Error diffusion | Spreads only ¾ of the error: lighter, contrasty, the early-Mac look |
| Sierra Lite, Sierra | Error diffusion | Close to Floyd–Steinberg; Sierra is smoother |
| Burkes, Jarvis–Judice–Ninke, Stucki | Error diffusion | Wider kernels: smoother gradients, softer detail |

**Ordered** methods decide each pixel independently, so they are fast, predictable and don't flicker between video frames. **Error diffusion** carries each pixel's rounding error to its neighbours, which preserves detail but changes a lot from frame to frame.

<kbd>D</kbd> and <kbd>Shift</kbd> <kbd>D</kbd> step through common methods.

## Strength

For ordered methods, strength scales the threshold offset. At 100% the pattern spans the distance between neighbouring palette colours (the textbook amount), so the same strength means the same thing for a 2-colour and a 64-colour palette. Lower values leave flatter areas.

For error diffusion, strength is the fraction of the error passed on. 0% is the same as no dithering.

With **Perceptual** colour matching, ordered patterns put slightly more of the lighter colour into mid-tones than the textbook algorithm, because the boundary between two colours sits at their perceptual midpoint. Choose **RGB** matching under Palette for the classic tone curve. Error diffusion keeps the average tone either way.

## Custom matrices

Choose **Custom matrix** and type rows of numbers, up to 16 × 16:

```
0 8 2 10
12 4 14 6
3 11 1 9
15 7 13 5
```

Only the *order* of the numbers matters: the smallest becomes the first threshold. Commas, brackets and a trailing `/ 16` line are accepted, so you can paste matrices from papers or other tools.
