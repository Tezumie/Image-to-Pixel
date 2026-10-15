// Audio for video export: read a source file's soundtrack as PCM, and encode PCM with WebCodecs.
// The muxers (mux-mp4.js, mux-webm.js) take the encoded chunks as a second track next to the video.

/** WebCodecs codec strings for the audio formats the muxers can store. */
export const AUDIO_CODECS = { aac: 'mp4a.40.2', opus: 'opus' };

const DEFAULT_RATE = 48000;   // Opus only encodes at 48 kHz (and lower); AAC is fine with it too

async function toArrayBuffer(source) {
  if (source instanceof ArrayBuffer) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source.arrayBuffer();
  const url = typeof source === 'string' ? source : source && (source.currentSrc || source.src);
  if (!url) throw new TypeError('decodeAudio() takes a File, Blob, ArrayBuffer, URL or <video>/<audio> element');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load the audio: ${res.status} ${res.statusText}`);
  return res.arrayBuffer();
}

/**
 * Decode the audio track of a video (or audio) file into PCM, resampled and trimmed.
 * Resolves with null when there is no audio track, it can't be decoded, or Web Audio isn't available (Node).
 * More than two channels are mixed down to stereo with the standard Web Audio speaker rules.
 * @param {File|Blob|ArrayBuffer|ArrayBufferView|string|HTMLMediaElement} source
 * @param {{ start?: number, end?: number, sampleRate?: number, channels?: 1 | 2 }} [opts] start/end in seconds
 * @returns {Promise<null | { sampleRate: number, numberOfChannels: number, channels: Float32Array[], duration: number }>}
 */
export async function decodeAudio(source, opts = {}) {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const sampleRate = opts.sampleRate || DEFAULT_RATE;
  const bytes = await toArrayBuffer(source);
  let decoded;
  try {
    decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes);
  } catch (_) {
    return null;                                   // no audio track, or a codec the browser can't decode
  }
  const start = Math.max(0, opts.start || 0);
  const end = Math.min(decoded.duration, opts.end > start ? opts.end : decoded.duration);
  const length = Math.floor((end - start) * sampleRate);
  if (length < 1) return null;
  const numberOfChannels = Math.min(opts.channels || 2, decoded.numberOfChannels);
  // Rendering the decoded buffer through an offline graph trims it and mixes 5.1 etc. down properly.
  const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const node = ctx.createBufferSource();
  node.buffer = decoded;
  node.connect(ctx.destination);
  node.start(0, start, length / sampleRate);
  const out = await ctx.startRendering();
  const channels = [];
  for (let c = 0; c < numberOfChannels; c++) channels.push(out.getChannelData(c));
  return { sampleRate, numberOfChannels, channels, duration: length / sampleRate };
}

/**
 * Find an AudioEncoder configuration this browser accepts for `codec`, or null.
 * Platform AAC encoders (Windows Media Foundation, macOS AudioToolbox) are picky about sample rate and
 * bitrate, so a few common combinations are tried: the requested rate first, then 48 and 44.1 kHz.
 * @returns {Promise<AudioEncoderConfig | null>} the config to pass to encodeAudio({ config })
 */
export async function findAudioConfig(codec, sampleRate = DEFAULT_RATE, numberOfChannels = 2, bitrate = 128000) {
  if (typeof AudioEncoder === 'undefined' || !AUDIO_CODECS[codec]) return null;
  const rates = codec === 'opus' ? [48000] : [...new Set([sampleRate, 48000, 44100])];
  const bitrates = [...new Set([bitrate, 128000, 192000, 160000, 96000, 0])];
  for (const rate of rates) {
    for (const br of bitrates) {
      const config = {
        codec: AUDIO_CODECS[codec], sampleRate: rate, numberOfChannels,
        ...(br ? { bitrate: br } : {}),
        ...(codec === 'aac' ? { aac: { format: 'aac' } } : {}),   // raw frames + AudioSpecificConfig, which MP4 needs
      };
      const r = await AudioEncoder.isConfigSupported(config).catch(() => ({}));
      if (r.supported) return config;
    }
  }
  return null;
}

/** Can this browser encode `codec` ('aac' | 'opus') with these parameters (or a close variant)? */
export async function audioCodecSupported(codec, sampleRate = DEFAULT_RATE, numberOfChannels = 2) {
  return !!(await findAudioConfig(codec, sampleRate, numberOfChannels));
}

/** Resample PCM with Web Audio (browser only). */
export async function resamplePcm(pcm, sampleRate) {
  if (pcm.sampleRate === sampleRate) return pcm;
  const { numberOfChannels, channels } = pcm;
  const length = Math.max(1, Math.round(channels[0].length * sampleRate / pcm.sampleRate));
  const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const buf = ctx.createBuffer(numberOfChannels, channels[0].length, pcm.sampleRate);
  for (let c = 0; c < numberOfChannels; c++) buf.copyToChannel(channels[c], c);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  node.start();
  const out = await ctx.startRendering();
  const res = [];
  for (let c = 0; c < numberOfChannels; c++) res.push(out.getChannelData(c));
  return { sampleRate, numberOfChannels, channels: res, duration: length / sampleRate };
}

/**
 * Encode PCM (as returned by decodeAudio) with WebCodecs' AudioEncoder.
 * @param {{ sampleRate: number, numberOfChannels: number, channels: Float32Array[] }} pcm
 * @param {{ codec?: 'aac' | 'opus', config?: AudioEncoderConfig, bitrate?: number, maxDuration?: number,
 *           onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void }} opts
 *   config: from findAudioConfig(); otherwise built from codec + bitrate. PCM at a different rate is resampled.
 *   maxDuration: seconds; longer audio is cut (used to match the video's length)
 */
export async function encodeAudio(pcm, opts) {
  if (typeof AudioEncoder === 'undefined') throw new Error('This browser has no WebCodecs AudioEncoder');
  const config = opts.config || {
    codec: AUDIO_CODECS[opts.codec], sampleRate: pcm.sampleRate, numberOfChannels: pcm.numberOfChannels,
    bitrate: opts.bitrate || 128000,
    ...(opts.codec === 'aac' ? { aac: { format: 'aac' } } : {}),
  };
  if (config.sampleRate !== pcm.sampleRate) pcm = await resamplePcm(pcm, config.sampleRate);
  const { sampleRate, numberOfChannels, channels } = pcm;
  let error = null;
  const encoder = new AudioEncoder({ output: (chunk, meta) => opts.onChunk(chunk, meta), error: e => { error = e; } });
  encoder.configure(config);
  const limit = Number.isFinite(opts.maxDuration) ? Math.floor(opts.maxDuration * sampleRate) : Infinity;
  const total = Math.min(channels[0].length, limit);
  const BLOCK = Math.round(sampleRate / 10);        // 100 ms per AudioData
  for (let o = 0; o < total; o += BLOCK) {
    if (error) break;
    const n = Math.min(BLOCK, total - o);
    const data = new Float32Array(n * numberOfChannels);
    for (let c = 0; c < numberOfChannels; c++) data.set(channels[c].subarray(o, o + n), c * n);
    const frame = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels, timestamp: Math.round(o * 1e6 / sampleRate), data });
    encoder.encode(frame);
    frame.close();
    if (encoder.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 0));
  }
  if (!error) await encoder.flush().catch(e => { error = e; });
  if (encoder.state !== 'closed') encoder.close();
  if (error) throw error;
}

/** OpusHead (RFC 7845), little-endian: what Matroska's CodecPrivate holds for Opus. */
export function opusHead(numberOfChannels, sampleRate, preSkip = 312) {
  const b = new Uint8Array(19);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]);   // 'OpusHead'
  const dv = new DataView(b.buffer);
  dv.setUint8(8, 1);
  dv.setUint8(9, numberOfChannels);
  dv.setUint16(10, preSkip, true);
  dv.setUint32(12, sampleRate, true);
  dv.setInt16(16, 0, true);
  dv.setUint8(18, 0);
  return b;
}

/** Read { channels, preSkip, sampleRate } from an OpusHead, or null if it isn't one. */
export function parseOpusHead(b) {
  if (!b || b.length < 19 || String.fromCharCode(...b.subarray(0, 8)) !== 'OpusHead') return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { channels: dv.getUint8(9), preSkip: dv.getUint16(10, true), sampleRate: dv.getUint32(12, true) };
}
