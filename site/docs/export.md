---
title: Exporting
group: Editor
order: 8
description: PNG, GIF, video, sprite sheets and tilesets.
---

# Exporting

The **Export** button in the top bar opens the common exports. The **Export** tab of the inspector holds all of them with their options.

## Images

| Option | Effect |
| --- | --- |
| Size | **Scale** (below) or **Source size**: the framed part of the source at its full resolution, like the 2.x full-resolution download. Pixels can differ by one in size when the ratio isn't a whole number |
| Scale | Whole-number upscale (nearest neighbour), so every pixel stays square. 1× is the true pixel size |
| Grid lines | Thin lines between pixels, from 3× scale. Useful for references and tutorials |
| Indexed PNG | Writes a palette PNG when there are 256 colours or fewer: often 3 to 5 times smaller, identical pixels |

**Download PNG** (<kbd>Ctrl</kbd> <kbd>S</kbd>) saves the current image. **Copy image** puts it on the clipboard. **Download all as ZIP** appears when you have several files; see [Batches](../batch/).

## Animation

See [Video](../video/). The same section turns several images into an animation.

## Sprite sheet

Packs the frames chosen under Animation into one PNG, with a JSON atlas in the TexturePacker "hash" format that Phaser, PixiJS, Godot importers and most engines read. Set **Columns** (0 = as square as possible) and **Padding** between cells. Frame durations are included.

## Tileset

Cuts the current result into square tiles (8 to 64 px), keeps one copy of each distinct tile, and downloads the tileset PNG with a JSON map:

```json
{
  "width": 12, "height": 8, "tileWidth": 16, "tileHeight": 16,
  "tiles": [0, 1, 1, 2, …],
  "image": "dusk-tiles.png"
}
```

`tiles` holds one index per cell, row by row. With **Count mirrored tiles as duplicates**, a flipped copy of an existing tile reuses it, and a `flips` array says how (1 horizontal, 2 vertical, 3 both).

## Settings

**Copy link** and **Save JSON** are covered in [Presets and sharing](../sharing/).
