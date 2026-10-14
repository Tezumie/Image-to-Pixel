---
title: Getting started
group: Start
order: 1
description: Your first image in the editor, then the same thing in code.
---

# Getting started

## In the editor

1. Open the [editor](../../editor/).
2. Drop an image onto the window, paste one with <kbd>Ctrl</kbd> <kbd>V</kbd>, or pick one of the samples.
3. Move **Pixel width** in the Size section. The preview updates as you drag.
4. Choose a palette and a dither method. Press <kbd>C</kbd> to compare with the original.
5. Press **Export** (or <kbd>Ctrl</kbd> <kbd>S</kbd>) to save a PNG at the scale set under Export.

Nothing leaves your computer. Images are processed in the page, on the GPU when WebGL 2 is available and on the CPU otherwise.

> [!TIP]
> Not sure where to start? Open the **Presets** tab in the left panel. Each preset shows a live thumbnail of your image.

## In code

```bash
npm i image-to-pixel
```

```js
import { createPixelator } from 'image-to-pixel';

const px = await createPixelator();
const result = await px.process(document.querySelector('img'), {
  size: { width: 128 },
  palette: { source: 'builtin', id: 'sweetie-16' },
  dither: { method: 'bayer4', strength: 0.8 },
});

document.body.append(result.toCanvas(4));      // 4× nearest-neighbour upscale
```

Without a bundler, use the script build. It defines a global `ImageToPixel`:

```html
<script src="https://cdn.jsdelivr.net/npm/image-to-pixel@3/dist/image-to-pixel.min.js"></script>
<script>
  const px = await ImageToPixel.createPixelator();
</script>
```

Next: [the editor in detail](../editor/), or the [library reference](../library/).
