---
title: Presets and sharing
group: Editor
order: 9
description: Built-in looks, share links and settings files.
---

# Presets and sharing

## Presets

The **Presets** tab shows each preset applied to your current image. Click one to replace the current settings; undo brings the old ones back. Presets keep your export options.

| Preset | Look |
| --- | --- |
| Balanced | Endesga 32 with Bayer 4×4 |
| Game Boy | Four greens, 160 px |
| PICO-8 | 128 px, PICO-8 palette, blue noise |
| 1-bit Atkinson | Two colours, Atkinson diffusion |
| Faithful colour | 24 colours from the image, Floyd–Steinberg |
| Clean sprite | No dither, nearest, stray-pixel cleanup, dark outline |
| CGA | 16 hard colours, Bayer 8×8 |
| Newsprint | Grey clustered-dot halftone |
| Soft painterly | Resurrect 64, Sierra Lite, smoothing |

## Share links

**Copy link** (Export tab, or the Export menu) copies the editor URL with your settings in the hash: `editor/#s=…`. Opening it restores the settings. The link holds settings only, never the image, and only what differs from the defaults, so it stays short. With several files, it carries the settings of the file you're looking at (its own, or the shared ones).

## Settings files

**Save JSON** downloads the settings; **Load settings file**, or dropping the file on the window, restores them. The same JSON works with the library:

```js
import { settingsFromJSON } from 'image-to-pixel';
const settings = settingsFromJSON(await (await fetch('my-look.json')).text());
const result = await px.process(image, settings);
```

Batch ZIPs include the `settings.json` that produced them.
