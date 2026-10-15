---
title: The editor
group: Editor
order: 1
description: What each pane does and how to move around.
---

# The editor

The editor has three panes. The **library** on the left holds your files, presets and palettes. The **canvas** in the middle shows the result. The **inspector** on the right holds every setting, in collapsible sections, plus the Export tab.

## Opening files

- Drag files anywhere onto the window, use **Add files**, or press <kbd>Ctrl</kbd> <kbd>O</kbd>.
- Paste an image with <kbd>Ctrl</kbd> <kbd>V</kbd>. Paste text that contains hex colours to use them as a palette.
- Images: PNG, JPEG, WebP, GIF (first frame), SVG, AVIF, BMP. Videos: MP4, WebM, MOV (whatever your browser can play).
- Palette files (.gpl, .hex, .pal, .txt) dropped on the window are imported as palettes. A settings .json is loaded as settings.

Sources larger than 4096 px on a side are scaled down first. That is far more detail than any pixel-art output needs.

## Names and saving

- **Rename** a file by clicking its name in the header, with <kbd>F2</kbd>, by double-clicking it in the Files list, or from its ⋯ menu. Exports are named after it. The extension stays.
- **Save** (next to Export) keeps every open file, its name and its settings in this browser, and they reopen next time. Nothing is uploaded. **Forget**, at the bottom of the Files list, removes them; clearing the site's data does too. Browsers limit this storage, so long videos may not fit.

## The canvas

| Action | How |
| --- | --- |
| Zoom | Mouse wheel, pinch, <kbd>+</kbd> <kbd>-</kbd>, or the zoom menu in the top bar |
| Pan | Drag, or two-finger scroll on a trackpad |
| Fit | <kbd>F</kbd>, double-click, or the fit button |
| Compare | <kbd>C</kbd>. Drag the round handle; arrow keys move it when focused |
| Pixel grid | <kbd>G</kbd>. Shown from 6× zoom |

Zoom snaps to whole numbers when fitting, so every output pixel is the same size on screen.

## The inspector

The header shows the output size, how many palette colours are actually used, and the render time. Hover the time to see whether the GPU or the CPU drew it.

The **Setup** tab holds [Size and Frame](../size/), [Palette](../palettes/), [Dither](../dithering/) and [Adjust, cleanup and outline](../adjust-cleanup/). With two or more files open, **Settings apply to** above the tabs switches between the shared settings and settings for just this file (see [Batches](../batch/)). The **Export** tab is covered in [Exporting](../export/).

Sections start collapsed, apart from Size; the editor remembers which ones you open. When a section differs from the defaults, a reset icon appears next to its title and puts just that section back.

Sliders show their value in a box you can type into. Double-click a slider to reset it. **Reset to defaults** at the bottom resets everything. Every reset can be undone.

## Undo and redo

Every change can be undone with <kbd>Ctrl</kbd> <kbd>Z</kbd> and redone with <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> or <kbd>Ctrl</kbd> <kbd>Y</kbd>. Dragging a slider counts as one step.

## Picking colours from the image

In the Palette section, **Pick** turns the canvas into a colour picker and opens the compare view. Click the original side to add a colour to a custom palette. Press <kbd>Esc</kbd> when done.

## Themes and panels

<kbd>T</kbd> switches between dark and light. <kbd>\</kbd> hides the library and <kbd>/</kbd> hides the inspector. On a tablet the library becomes a drawer; on a phone the inspector sits under the canvas.

Settings, theme, panel state and your saved palettes are remembered in this browser.
