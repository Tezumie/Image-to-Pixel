---
title: Video API
group: Library
order: 3
description: image-to-pixel/video encodes processed frames to MP4 or WebM with WebCodecs.
---

# Video API

Frame stepping (`forEachFrame`, `estimateFps`) is in the main package. Encoding lives in a separate entry, `image-to-pixel/video`, with this project's own MP4 and WebM muxers (MIT, no dependencies).

```js
import { createPixelator, forEachFrame, encodeGIF } from 'image-to-pixel';
import { createVideoEncoder, videoSupport } from 'image-to-pixel/video';

const px = await createPixelator();
const settings = { size: { width: 160 }, dither: { method: 'bluenoise' } };

let encoder;
await forEachFrame(video, {
  fps: 24, start: 0, end: 4,
  async onFrame({ index, total }) {
    const frame = await px.process(video, settings);
    encoder ??= await createVideoEncoder({ format: 'mp4', fps: 24, width: frame.width, height: frame.height, scale: 4 });
    await encoder.add(frame);
  },
});
const blob = await encoder.finish();     // video/mp4
```

## forEachFrame(video, options)

Seeks to the middle of each frame, waits until it is decoded, and calls `onFrame`. The next seek waits for `onFrame` to finish, so no frame is skipped or repeated however slow the processing is.

| Option | |
| --- | --- |
| `fps` | Frames per second to sample |
| `start`, `end` | Seconds. `end` defaults to the duration |
| `maxFrames` | Upper bound |
| `signal` | An `AbortSignal` to cancel |
| `onFrame({ index, time, total })` | May return a promise |

`estimateFps(video, fallback = 30)` plays the video muted for a moment and measures presented frames with `requestVideoFrameCallback`, snapping to common rates.

## createVideoEncoder(options)

| Option | |
| --- | --- |
| `format` | `'mp4'` (H.264) or `'webm'` (VP9, falling back to VP8) |
| `fps` | Frame rate |
| `width`, `height` | Size of the frames you will add |
| `scale` | Whole-number upscale applied to each frame (sizes are rounded up to even numbers) |
| `bitrate` | Bits per second. Defaults to a value suited to flat pixel art |

Returns `{ add(frame), finish() }`. `add` takes any `{ width, height, data }`, such as a result. `finish` resolves with a `Blob`.

`encodeVideo(frames, options)` does the same for an array. `videoSupport()` reports `{ mp4, webm, webcodecs }` for the current browser.

## GIF

GIF needs no add-on: `encodeGIF(frames, { scale, loop })` from the main package takes `{ width, height, data, delay }` frames (delay in ms) and returns the bytes. When all frames fit in 256 colours, which pixel art always does, they share one colour table and the output is lossless.

## Muxers

The muxers are exported too, for encoders of your own.

```js
import { createMp4Muxer, createWebmMuxer } from 'image-to-pixel/video';

const mux = createMp4Muxer({ width, height });
const encoder = new VideoEncoder({ output: (chunk, meta) => mux.addChunk(chunk, meta), error: console.error });
encoder.configure({ codec: 'avc1.42001f', width, height, avc: { format: 'avc' } });
// … encode frames, await encoder.flush()
const bytes = mux.finish();   // Uint8Array, a complete .mp4
```

| | MP4 | WebM |
| --- | --- | --- |
| Codecs | H.264 | VP8, VP9, AV1 |
| Layout | `moov` first, so it plays and seeks while downloading | SeekHead and Cues, so players can seek |
| B-frames | Supported (composition offsets are written) | Not applicable |
| Limits | One video track, under 4 GB, held in memory | One video track, held in memory |

`addChunk(chunk, meta)` takes `VideoEncoder` output directly. For MP4, configure the encoder with `avc: { format: 'avc' }` so it emits the decoder configuration the file needs. Lower-level `addSample()` / `addFrame()` take raw encoded frames with timestamps in microseconds.
