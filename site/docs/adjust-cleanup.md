---
title: Adjust, cleanup and outline
group: Editor
order: 5
description: Tone controls before quantising, and tidy-up passes after.
---

# Adjust, cleanup and outline

## Adjust

Applied after resizing and before colours are matched, in this order:

| Control | Range | Effect |
| --- | --- | --- |
| Brightness | −100 to 100 | Adds to every channel |
| Contrast | −100 to 100 | Stretches or flattens around mid-grey |
| Saturation | −100 to 100 | −100 is greyscale; positive values push colours apart |
| Hue | −180° to 180° | Rotates every colour around the colour wheel. Greys stay grey |
| Gamma | 0.2 to 3 | Above 1 lifts shadows, below 1 deepens them |

Small contrast boosts often help a limited palette: the image uses more of its extremes.

## Alpha cutoff

Pixel art has no half-transparent pixels. After resizing, pixels whose opacity is below the cutoff become fully transparent and the rest fully opaque. At 0 only completely transparent pixels stay transparent.

## Cleanup

**Remove stray pixels** replaces any pixel that matches none of its four neighbours with the most common neighbouring colour. It removes single-pixel noise without blurring edges.

**Smooth small specks** sets a pixel to a colour that fills at least five of the nine cells around it. It removes small clusters and jagged steps.

Both run after dithering, so they also thin out dither patterns. Use them with **None** or light dithering.

## Outline

Outlines follow transparent edges, so they suit sprites and cut-out art.

| Mode | Draws |
| --- | --- |
| Outside | On transparent pixels touching the shape: the sprite grows by one pixel |
| Inside | On the shape's own edge pixels: the size stays the same |

**Include diagonals** also counts corner neighbours, which closes the gaps in diagonal edges.
