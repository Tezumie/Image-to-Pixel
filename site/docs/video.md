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

## Exporting

In **Export → Animation**, choose the format, frames per second and the start and end time.

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
