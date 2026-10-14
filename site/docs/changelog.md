---
title: Changelog
group: Project
order: 3
description: What changed between versions.
---

# Changelog

## Unreleased

- Per-file settings: any file can have its own look. Switch in the inspector (All files / This file) or from a file's ⋯ menu, which also copies, pastes and applies settings to all files. Each file with its own settings has its own undo history.
- Duplicate a file to compare two looks; reorder files with the menu or Alt+Shift+↑/↓.
- Frame: crop to an aspect ratio (1:1, 4:3, 16:9, 9:16 …), zoom in and position the frame. GPU and CPU match exactly.
- Hue adjustment.
- Export at the source's full resolution (Export → Size → Source size), like 2.x's full-resolution download.
- Videos the browser can't play fail immediately with the codec named, instead of timing out.
- Steadier canvas: changing size or presets no longer moves the view.
- Video export uses the project's own MP4 and WebM muxers. `mp4-muxer` and `webm-muxer` (deprecated) are gone, so the only runtime dependency is ShaderMate.

## 3.0.0

A rewrite.

- New editor: three panes, batches, video, presets with live thumbnails, before/after compare, zoom and pan, undo/redo, keyboard shortcuts, dark and light themes, tablet and phone layouts.
- New engine on WebGL 2 through ShaderMate, with a CPU path that produces identical output.
- 16 dither methods, including blue noise, clustered dot, custom matrices and six error-diffusion kernels (run on the GPU as a wavefront).
- Palettes: extraction from the image, .gpl/.hex/.pal/.txt/JSON import and export, Lospec lookup, colour picking, OKLab matching.
- Cleanup (stray pixels, majority smoothing), inner and outer outlines, alpha cutoff, tone adjustments.
- Exports: indexed PNG, integer scaling with grid lines, ZIP, GIF, WebM, MP4, PNG sequences, sprite sheets with JSON atlases, tilesets with maps.
- Settings as share links and JSON files.
- npm package with ESM, CJS and script builds and TypeScript types. MIT licence for everything.
- The 2.x editor and library stay available unchanged.

## 2.x

The single-page editor, now at [classic](../../classic/).
