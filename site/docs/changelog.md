---
title: Changelog
group: Project
order: 3
description: What changed between versions.
---

# Changelog

## 3.1.0

- Video export keeps the sound: WebM and MP4 exports include the source's audio, cut to the exported range (Export → Animation → Keep audio). AAC or Opus in MP4, Opus in WebM, encoded with WebCodecs. In the library: `decodeAudio()` and the `audio` option of `createVideoEncoder()`; the MP4 and WebM muxers take an optional audio track.
- Sound in the editor: videos with audio get a speaker button that opens a volume slider (and <kbd>M</kbd> to mute). Videos still start muted.
- Video playback loops reliably: some MOV/MP4 files used to stall at the end and lose their sound after Chrome's built-in loop.
- Rename files: click the name in the header, press F2, double-click it in the list, or use the ⋯ menu. Exports are named after it.
- Save: keeps the open files with their names and settings in this browser (IndexedDB), and reopens them next time. Forget removes them.
- Sharp video exports: WebM and MP4 are upscaled by a whole number to about Full HD by default (Export → Animation → Video size), so they no longer look blurry in players.
- Narrow library panel: the tabs tighten up, then the inactive ones shrink to icons (names on hover) so nothing gets cut off.
- MP4 export from Chrome on Windows plays in Windows Media Player and QuickTime: its encoder's malformed H.264 configuration (avcC) is now detected and rebuilt from the keyframe's own SPS/PPS.
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
