---
title: Settings reference
group: Library
order: 2
description: Every field of the settings object, its range and its default.
---

# Settings reference

Settings are plain JSON. Every field is optional when you pass them in; `normalizeSettings()` fills in defaults and clamps ranges (a bad value falls back to the default instead of throwing).

## size

| Field | Default | Range | |
| --- | --- | --- | --- |
| `mode` | `'width'` | `'width'`, `'block'` | Size by output width or by pixel size (`'block'`, labelled *Pixel size* in the editor) |
| `width` | `96` | 1 to 2048 | Output width |
| `height` | `0` | 0 to 2048 | `0` keeps the aspect ratio |
| `block` | `8` | 1 to 256 | Pixel size: source pixels per output pixel (`mode: 'block'`) |
| `resample` | `'box'` | `'box'`, `'nearest'` | Average or centre sample |

## frame

Which part of the source is used, before resizing. `cropRect(width, height, frame)` returns it in source pixels.

| Field | Default | Range | |
| --- | --- | --- | --- |
| `aspect` | `'original'` | `'original'`, `'1:1'`, `'4:3'`, `'3:4'`, `'3:2'`, `'2:3'`, `'16:9'`, `'9:16'` | Shape of the frame |
| `zoom` | `1` | 1 to 8 | Crops further in |
| `x`, `y` | `0.5` | 0 to 1 | Position of the frame: 0 is left / top, 1 is right / bottom |

## adjust

| Field | Default | Range |
| --- | --- | --- |
| `brightness` | `0` | −1 to 1 |
| `contrast` | `0` | −1 to 1 |
| `saturation` | `0` | −1 to 1 |
| `hue` | `0` | −180 to 180 (degrees) |
| `gamma` | `1` | 0.2 to 5 |

## palette

| Field | Default | |
| --- | --- | --- |
| `source` | `'builtin'` | `'builtin'`, `'custom'`, `'extract'`, `'none'` |
| `id` | `'endesga-32'` | Built-in palette id (see `PALETTES`) |
| `colors` | | `'#rrggbb'` strings for `'custom'` (up to 256). Filled in for built-ins |
| `name` | | Display name |
| `count` | `16` | Colours to extract (2 to 256) for `'extract'` |
| `distance` | `'oklab'` | `'oklab'` or `'rgb'` colour matching |

## dither

| Field | Default | |
| --- | --- | --- |
| `method` | `'bayer4'` | `none`, `bayer2`, `bayer4`, `bayer8`, `bayer16`, `cluster4`, `cluster8`, `lines`, `bluenoise`, `custom`, `floyd-steinberg`, `atkinson`, `sierra-lite`, `sierra`, `burkes`, `jarvis`, `stucki` |
| `strength` | `0.6` | 0 to 1 |
| `matrix` | `null` | For `custom`: rows of numbers, up to 16 × 16 |

## alpha

| Field | Default | |
| --- | --- | --- |
| `threshold` | `0.5` | Pixels less opaque than this become transparent; the rest become opaque |

## cleanup

| Field | Default | |
| --- | --- | --- |
| `orphans` | `false` | Remove pixels unlike all four neighbours |
| `smooth` | `false` | 3 × 3 majority filter |

## outline

| Field | Default | |
| --- | --- | --- |
| `mode` | `'none'` | `'none'`, `'outer'`, `'inner'` |
| `color` | `'#000000'` | |
| `corners` | `false` | Count diagonal neighbours |

## export

Used by the editor and by `toPNG()` callers who pass it along. The engine ignores it.

| Field | Default | |
| --- | --- | --- |
| `size` | `'scale'` | `'scale'` (whole-number scale) or `'source'` (the framed part at source resolution) |
| `scale` | `4` | 1 to 64 |
| `indexed` | `true` | Indexed PNG when possible |
| `grid` | `false` | Grid lines (from 3× scale) |
| `gridColor` | `'#000000'` | |

## Example file

```json
{
  "$schema": "image-to-pixel/settings",
  "version": 1,
  "size": { "width": 128 },
  "palette": { "id": "pico-8" },
  "dither": { "method": "bluenoise", "strength": 0.7 }
}
```

`settingsToJSON()` writes only what differs from the defaults, like this.
