---
title: How it works
group: Library
order: 5
description: The shader pipeline, the diffusion wavefront and the CPU twin.
---

# How it works

## The pipeline

Every image goes through the same steps. On the GPU each step is a fragment-shader pass run by [ShaderMate](https://github.com/Tezumie/ShaderMate), in plain WebGL 2 GLSL; on the CPU each is a function in `lib/core/cpu/stages.js` written to match its shader line for line.

| Pass | Does | Target |
| --- | --- | --- |
| `prep` | Box or nearest resample, adjust, alpha cut | 32-bit float |
| `quant` | Ordered threshold + nearest palette colour | 8-bit |
| `diffuse` | Error diffusion, one wave per iteration | 32-bit float, ping-pong |
| `resolve` | Palette index → colour (or pass `quant` through) | 8-bit |
| `orphan` | Stray-pixel removal | 8-bit |
| `smooth` | 3 × 3 majority | 8-bit |
| `out` | Outline, drawn to the canvas | canvas |

All passes run at the output size (96 × 64 is 6,144 fragments), so they are cheap. The source is uploaded once and only re-uploaded when it changes. Changing a setting only updates uniforms; nothing recompiles. The palette (up to 256 colours) and the threshold map are small textures; the result is read back once with `readPixels`.

Passes address pixels from the top-left with integer coordinates and `texelFetch`, never filtered sampling, so the GPU and CPU agree to the bit. `npm run screenshots` renders 15 configurations both ways in a headless browser and fails if they differ.

## Choosing colours

Each pixel takes the palette colour at the smallest distance. In **Perceptual** mode the distance is measured in OKLab, where equal distances look equally different. Ordered dithering adds `(threshold − ½) × spread × strength` first, where `spread` is the average distance between neighbouring palette colours, so strength behaves the same for any palette.

## Error diffusion on a GPU

Floyd–Steinberg is sequential: each pixel needs the error of the pixel to its left and of three pixels in the row above. A fragment shader computes every pixel at once, so it can't simply run it.

But the dependency has a shape. If every kernel offset `(dx, dy)` pushes error to a pixel on a later *wave* `x + s·y`, then all pixels on one wave are independent of each other. For Floyd–Steinberg, Atkinson and Sierra Lite `s = 2`; for the wider Jarvis, Stucki, Burkes and Sierra kernels `s = 3`.

The `diffuse` pass uses ShaderMate's `iterations` to draw itself once per wave, reading its previous output (`u_recursion` is the wave number):

- pixels on earlier waves copy what they already have;
- pixels on the current wave *pull* the stored error from their already-finished neighbours, add it to their own colour, choose a palette colour, and store the new error and the palette index;
- pixels on later waves wait.

A 96 × 64 image takes 96 + 2 × 63 = 222 draws. The output equals the sequential algorithm exactly; floating-point summation order can flip a handful of near-tie pixels in very large images.

On software WebGL (SwiftShader, llvmpipe) hundreds of full-screen draws are slower than the plain CPU loop, so `diffusion: 'auto'` uses the CPU there.

## Notes on ShaderMate

The shaders use ShaderMate's plain-GLSL style: `void main()` writing `fragColor`, built-ins like `u_resolution`, and passes wired by name. ShaderMate also runs ShaderToy-style `mainImage` shaders, which is handy if you want to prototype a new effect elsewhere and bring it in as a pass.
