// image-to-pixel/video: encode processed frames to MP4 (H.264) or WebM (VP9/VP8) with WebCodecs,
// optionally with the source's soundtrack (AAC or Opus in MP4, Opus in WebM).
// The muxers are this project's own (lib/core/video/mux-*.js): MIT, no dependencies.

import { createMp4Muxer } from './core/video/mux-mp4.js';
import { createWebmMuxer } from './core/video/mux-webm.js';
import { decodeAudio, encodeAudio, audioCodecSupported, findAudioConfig } from './core/video/audio.js';
import { upscale } from './core/export/scale.js';

export { forEachFrame, estimateFps, seekTo, frameTimes, videoReady } from './core/video/frames.js';
export { createMp4Muxer, createWebmMuxer, decodeAudio, encodeAudio, audioCodecSupported, findAudioConfig };

const AVC = ['avc1.640033', 'avc1.4d0033', 'avc1.42003e', 'avc1.640028', 'avc1.42001f'];
const VP = [['vp09.00.10.08', 'vp9'], ['vp8', 'vp8']];

/** Which formats this browser can encode. `aac` / `opus`: audio for MP4 (either) and WebM (Opus). */
export async function videoSupport(width = 640, height = 480) {
  const out = { mp4: false, webm: false, webcodecs: typeof VideoEncoder !== 'undefined', aac: false, opus: false };
  if (out.webcodecs) {
    for (const codec of AVC) if ((await VideoEncoder.isConfigSupported({ codec, width, height }).catch(() => ({}))).supported) { out.mp4 = true; break; }
    for (const [codec] of VP) if ((await VideoEncoder.isConfigSupported({ codec, width, height }).catch(() => ({}))).supported) { out.webm = true; break; }
  }
  out.aac = await audioCodecSupported('aac');
  out.opus = await audioCodecSupported('opus');
  return out;
}

const even = n => n + (n & 1);

/** The audio codec and encoder config for a container, or null when the browser can't encode a suitable one. */
async function pickAudio(format, pcm, bitrate) {
  const order = format === 'mp4' ? ['aac', 'opus'] : ['opus'];   // WebM only holds Opus (or Vorbis)
  for (const codec of order) {
    const config = await findAudioConfig(codec, pcm.sampleRate, pcm.numberOfChannels, bitrate);
    if (config) return { codec, config };
  }
  return null;
}

/**
 * Start an encoder; add frames one at a time (so a long clip never sits in memory), then finish().
 * @param {{ format: 'mp4' | 'webm', fps: number, width: number, height: number, scale?: number, bitrate?: number,
 *           audio?: { sampleRate: number, numberOfChannels: number, channels: Float32Array[] } | null,
 *           audioBitrate?: number }} opts
 *   width/height: size of the frames you will add (before scaling)
 *   audio: PCM to add as a soundtrack, e.g. from decodeAudio(file, { start, end }). It is cut to the
 *          video's length. When the browser can't encode audio the video is still made, without it
 *          (check `encoder.audioCodec`).
 */
export async function createVideoEncoder(opts) {
  const scale = Math.max(1, Math.round(opts.scale || 1));
  const W = even(opts.width * scale), H = even(opts.height * scale);
  const fps = opts.fps || 30;
  const bitrate = opts.bitrate || Math.min(20e6, Math.max(2e6, W * H * fps * 0.15));
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs VideoEncoder. Export a GIF or PNG sequence instead.');

  let codec = null, muxCodec = null;
  const list = opts.format === 'mp4' ? AVC.map(c => [c, 'avc']) : VP;
  for (const [c, m] of list) {
    const ok = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: fps }).catch(() => ({}));
    if (ok.supported) { codec = c; muxCodec = m; break; }
  }
  if (!codec) throw new Error(`No ${opts.format.toUpperCase()} encoder available in this browser at ${W}×${H}.`);

  const pcm = opts.audio && opts.audio.channels && opts.audio.channels.length ? opts.audio : null;
  const picked = pcm ? await pickAudio(opts.format, pcm, opts.audioBitrate || 128000) : null;
  const audioCodec = picked ? picked.codec : null;
  const audioTrack = picked ? { codec: audioCodec, sampleRate: picked.config.sampleRate, numberOfChannels: picked.config.numberOfChannels, bitrate: picked.config.bitrate || 128000 } : null;

  const muxer = opts.format === 'mp4'
    ? createMp4Muxer({ width: W, height: H, audio: audioTrack })
    : createWebmMuxer({ width: W, height: H, codec: muxCodec, fps, audio: audioTrack });

  let error = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addChunk(chunk, meta),
    error: e => { error = e; },
  });
  // avc.format 'avc': length-prefixed NAL units plus a decoder config record, which MP4 needs
  encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality', ...(opts.format === 'mp4' ? { avc: { format: 'avc' } } : {}) });

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  let i = 0;
  const frameUs = 1e6 / fps;

  return {
    width: W, height: H, codec,
    /** 'aac' or 'opus' when the soundtrack will be included, null otherwise. */
    audioCodec,
    /** @param {{ width, height, data }} img */
    async add(img) {
      if (error) throw error;
      const up = scale > 1 ? upscale(img, scale) : img;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(up.data), up.width, up.height), 0, 0);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 });
      frame.close();
      i++;
      if (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
    },
    /** @returns {Promise<Blob>} */
    async finish() {
      await encoder.flush();
      if (error) throw error;
      encoder.close();
      if (audioCodec && i > 0) {
        // the soundtrack ends with the last frame
        await encodeAudio(pcm, { config: picked.config, maxDuration: i / fps, onChunk: (chunk, meta) => muxer.addAudioChunk(chunk, meta) });
      }
      return new Blob([muxer.finish()], { type: opts.format === 'mp4' ? 'video/mp4' : 'video/webm' });
    },
  };
}

/** Convenience: encode an array of frames in one go. */
export async function encodeVideo(frames, opts) {
  const enc = await createVideoEncoder({ ...opts, width: frames[0].width, height: frames[0].height });
  for (const f of frames) await enc.add(f);
  return enc.finish();
}
