---
title: Video
group: Editor
order: 7
description: Preview while it plays, step frame by frame, export every frame exactly once.
---

# Video

Open an MP4, WebM or MOV like an image. A transport bar appears under the canvas.

| Control | Keys |
| --- | --- |
| Play / pause | <kbd>Space</kbd> |
| Previous / next frame | <kbd>,</kbd> <kbd>.</kbd> |
| Scrub | Drag the bar |
| Volume | The speaker button (videos with sound) opens a slider; drag it to the bottom to mute. <kbd>M</kbd> mutes and unmutes |

Videos start muted. Unmuting and the volume are remembered for every video you open.

While it plays, each frame is processed as it is shown. When paused, the current frame is shown exactly. The frame rate is detected when the file opens and shown at the right of the bar.

Hover over the bottom timeline to see a small processed-frame preview and its timestamp, like a video player. This also works on the **Frame selection** interval bar, which keeps a normal arrow on the track and shows a horizontal resize cursor over each handle. Drag the handles to adjust the interval; clicking the track does not change it. Hovering never seeks the original video or changes the selected interval.

## Exporting

In **Export → Animation**, choose the format, frames per second and the start and end time.

## Selecting frames in the main preview

Turn on **Export → Animation → Frame selection** to replace the main preview with the tiled frame canvas. There are no separate preview tabs. The playback scrubber becomes a two-handle **In / Out** time-range selector, initially using Animation's **Start / End** times. If those fields still contain the untouched full-clip default, a video longer than three seconds starts at `0–3s` instead. Drag its handles, or enter precise times in either place: Start / End and the interval bar stay synchronised in both directions, snapping to source frame boundaries. An empty or reversed **End** runs to the end of the clip.

For a long video, the first activation uses the first three seconds so the canvas stays responsive. Videos shorter than three seconds load in full. Adjust the interval to load more frames; an explicitly chosen Animation range is preserved. Intervals longer than 1,000 frames load only their first 1,000: narrow the range to reach the rest.

Frame decoding is debounced by 300 ms. While dragging, only the interval and time fields change; the existing frames stay visible until the drag ends and the new interval is ready to load. Exports stay disabled until the interval has finished loading and at least one frame is selected.

Each row contains half the video's original FPS, rounded to the nearest whole frame (at least one): 30 fps gives 15 frames per row; 60 fps gives 30. All source frames in the chosen interval are shown. Animation's FPS changes playback speed, not the source frame count or row layout.

Click frames to toggle selection, or use **Select all** and **Clear**. Drag the canvas to pan; use the zoom buttons, the main zoom menu, <kbd>+</kbd> / <kbd>-</kbd>, or the mouse wheel to zoom around the pointer.

The zoom menu offers the same **1×, 2×, 4×, 8×, 16× and 32×** presets as **Preview**. Buttons, keyboard shortcuts and the wheel use Preview's stepped zoom levels, while pinch gestures remain smooth. **Fit** restores the full frame grid.

Frame status, selection counts and actions float over the bottom of the canvas, like the controls in **Preview**. Fitting the canvas leaves room above these controls so they do not cover the fitted frames or animation.

The **Play selected** icon (or <kbd>Space</kbd>) adds an animated preview beside the frame grid **in the same canvas**, then pans the view to it without changing the zoom. The animation uses the same width and zoom scale as a regular frame, with a separate title row above it. The icon changes to **Pause selected** during playback, with its action shown on hover. Frames remain on the canvas while the selection loops in chronological order at **Animation → Frames per second**. Changing that FPS immediately updates playback without reloading the source frames. Both the animation and the frames move and scale together. Pause keeps the animation tile visible; double-click or press <kbd>F</kbd> to fit both the frames and the animation into view. Changing selection updates the animation without moving the view again; clearing the selection removes it.

**Compare with original** and **Pixel grid**, including their <kbd>C</kbd> / <kbd>G</kbd> shortcuts, are disabled in frame-selection mode. Turning **Frame selection** off restores these controls and preserves their previous settings.

With **Frame selection** on, **Export animation** and **Sprite sheet → Download sprite sheet** both use only the selected, processed frames, in chronological order and at Animation's FPS. Sprite sheets use their normal columns, padding and PNG export scale, and download as one PNG plus a JSON atlas in a ZIP. There is no separate build button on the canvas. Selection is preserved while adjusting processing settings, so the thumbnails and exported frames keep the same look. Selected-frame video exports omit source audio, since a discontinuous selection may not match the original soundtrack. **PNG**, **Copy image** and **Tileset** are disabled while **Frame selection** is on: they belong to the main preview, which the tiles replace.

Turn **Frame selection** off to restore the normal preview and export workflow, without seeking the original video. Animation and sprite sheet exports then use the original video interval/FPS or the chosen image files as before.

## Export formats

| Format | Notes |
| --- | --- |
| GIF | Lossless for pixel art: frames share one palette when they fit in 256 colours |
| WebM | VP9 (or VP8) through WebCodecs, with Opus audio |
| MP4 | H.264 through WebCodecs, with AAC audio (Opus where the browser can't encode AAC) |
| PNG sequence | A ZIP of numbered PNGs, for editors and game engines |

## Audio

**Keep audio** (on by default) puts the video's soundtrack into WebM and MP4 exports, cut to the same start and end as the frames. Surround sound is mixed down to stereo. GIF and PNG sequences have no sound.

MP4 sound is AAC, which plays everywhere. Browsers that can't encode AAC (Firefox, and Chrome on Linux) write Opus instead: browsers and VLC play it, but Windows Media Player and QuickTime may not, so choose WebM there. The Animation section says when this applies.

The soundtrack is decoded by the browser and encoded with WebCodecs. If the browser can't decode the source's audio, or can't encode any audio codec the format holds, the video is still exported, without sound, and the message at the end says so.

Export is **frame-accurate**: the video is not played, it is seeked to the middle of each frame in turn, processed, and only then moved on. A slow computer takes longer but never skips or repeats a frame. The export can be cancelled from its progress message.

**Video size** (WebM and MP4) scales the frames up by a whole number to about Full HD (or 720p, 4K, or the PNG export scale) before encoding. Players stretch small videos with smoothing, so a 96-pixel-wide video looks blurry full screen; at Full HD every pixel stays a sharp square, and H.264's colour compression stays inside each pixel. If the browser can't encode the chosen size, the next smaller one is used. GIF and PNG sequences use the export scale.

> [!TIP]
> For animation, prefer ordered dithering (Bayer or blue noise). Error diffusion changes from frame to frame and shimmers.

WebM and MP4 need WebCodecs (Chrome, Edge, and recent Safari and Firefox). GIF and PNG sequences work everywhere.
