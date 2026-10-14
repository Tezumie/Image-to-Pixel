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

While it plays, each frame is processed as it is shown. When paused, the current frame is shown exactly. The frame rate is detected when the file opens and shown at the right of the bar.

## Exporting

In **Export → Animation**, choose the format, frames per second and the start and end time.

| Format | Notes |
| --- | --- |
| GIF | Lossless for pixel art: frames share one palette when they fit in 256 colours |
| WebM | VP9 (or VP8) through WebCodecs |
| MP4 | H.264 through WebCodecs |
| PNG sequence | A ZIP of numbered PNGs, for editors and game engines |

Export is **frame-accurate**: the video is not played, it is seeked to the middle of each frame in turn, processed, and only then moved on. A slow computer takes longer but never skips or repeats a frame. The export can be cancelled from its progress message.

Videos are scaled up by whole numbers to at least 240 px tall, so players and sites don't blur the pixels.

> [!TIP]
> For animation, prefer ordered dithering (Bayer or blue noise). Error diffusion changes from frame to frame and shimmers.

WebM and MP4 need WebCodecs (Chrome, Edge, and recent Safari and Firefox). GIF and PNG sequences work everywhere.
