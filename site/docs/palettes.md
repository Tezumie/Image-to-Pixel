---
title: Palettes
group: Editor
order: 3
description: Choosing, building, importing and saving the colours your image is reduced to.
---

# Palettes

Every output pixel is set to the nearest colour in the palette. Pick where the palette comes from under **Source**.

| Source | Meaning |
| --- | --- |
| Built-in palette | One of the 24 included palettes |
| Custom colours | Your own list. Click a swatch to change it, <kbd>Alt</kbd>-click to remove it, **+** to add one |
| From the image | A palette of *n* colours extracted from the image (median cut refined by k-means) |
| None (keep colours) | Only resize and adjust; colours are not reduced and dithering is off |

Clicking a swatch of a built-in palette copies it into a custom palette you can edit.

## Built-in palettes

Mostly from [Lospec](https://lospec.com/palette-list), credited to their authors in the Palettes tab: Apollo, Batpalette, Beached Boogaloo, CC-29, CGA 16, Chaotic Neutral, Endesga 32, Fantasy 24, Game Boy (DMG), Grayscale 4, Hidden Library, Intacto14, Journey, Lospec500, Nyx8, Oil 6, PICO-8, Resurrect 64, SLSO8, Sweet Canyon Extended 64, Sweetie 16, Toxic Haze, Vinik24 and 1-Bit Monitor.

## Importing

**Import** (or drop a file on the window) reads:

| Format | Notes |
| --- | --- |
| `.gpl` | GIMP, Aseprite, Krita, Inkscape |
| `.hex` | One hex colour per line (Lospec's "HEX file") |
| `.pal` | JASC-PAL (Paint Shop Pro, Aseprite) |
| `.txt` | Paint.NET (`AARRGGBB` per line, `;` comments) |
| `.json` | Lospec JSON (`{ "name", "colors": [] }`), this tool's export, or a plain array |

Anything else is scanned for hex colours, so you can paste a list from a website straight into the window.

**Lospec** fetches a palette by slug (`rgbg-36`) or by its URL. This needs an internet connection; everything else works offline.

## Saving and exporting

**Save** stores the current colours under **Your palettes** in the Palettes tab (in this browser) and can download them as `.gpl`, `.hex` or `.json`. Delete a saved palette with its trash button; the toast lets you undo.

## Colour matching

**Perceptual** compares colours in OKLab, which matches how different two colours look. **RGB** uses luma-weighted RGB distance, which some people prefer for very small palettes because it keeps hues more literal.
