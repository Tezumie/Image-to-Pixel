// Frame-accurate stepping through an HTMLVideoElement by seeking to the middle of each frame.
// Seeking (instead of playing) means every frame is visited exactly once, regardless of how
// long processing takes, and the same input always produces the same frames.

const wait = (el, ev, ms = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => { el.removeEventListener(ev, ok); rej(new Error(`Timed out waiting for "${ev}"`)); }, ms);
  const ok = () => { clearTimeout(t); res(); };
  el.addEventListener(ev, ok, { once: true });
});

const MEDIA_ERRORS = {
  1: 'loading was aborted',
  2: 'a network error stopped the download',
  3: 'the browser could not decode it',
  4: "this browser can't play this video's format",
};

/** Turn a <video>'s MediaError into a readable Error (err.code is the MediaError code). */
export function mediaError(video) {
  const code = video.error ? video.error.code : 0;
  const err = new Error(MEDIA_ERRORS[code] || 'the video could not be loaded');
  err.code = code;
  if (video.error && video.error.message) err.detail = video.error.message;
  return err;
}

/** Resolve on `ok`, reject straight away if the media element reports an error. */
const waitOrFail = (video, ok, ms) => new Promise((res, rej) => {
  const done = () => { clearTimeout(t); video.removeEventListener(ok, onOk); video.removeEventListener('error', onErr); };
  const onOk = () => { done(); res(); };
  const onErr = () => { done(); rej(mediaError(video)); };
  const t = setTimeout(() => { done(); rej(new Error(`no response from the video decoder after ${ms / 1000} s`)); }, ms);
  video.addEventListener(ok, onOk, { once: true });
  video.addEventListener('error', onErr, { once: true });
});

/**
 * Wait until a video's metadata (size, duration) and first frame are available.
 * Rejects immediately with a readable message when the browser can't play the file.
 */
export async function videoReady(video, { timeout = 60000 } = {}) {
  if (video.error) throw mediaError(video);
  if (video.readyState < 1) await waitOrFail(video, 'loadedmetadata', timeout);
  if (video.readyState < 2) await waitOrFail(video, 'loadeddata', timeout).catch(e => { if (e.code) throw e; });
  return video;
}

/**
 * Best-effort codec name for an MP4/MOV/WebM file, read from its bytes. Used to explain playback errors.
 * @param {Blob} file
 * @returns {Promise<string>} e.g. 'H.265 (HEVC)', or '' when unknown
 */
export async function sniffVideoCodec(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const NAMES = { avc1: 'H.264', avc3: 'H.264', hvc1: 'H.265 (HEVC)', hev1: 'H.265 (HEVC)', av01: 'AV1', vp09: 'VP9', vp08: 'VP8', mp4v: 'MPEG-4 Part 2', apcn: 'ProRes', apch: 'ProRes', apcs: 'ProRes', apco: 'ProRes', ap4h: 'ProRes 4444', dvh1: 'Dolby Vision', dvhe: 'Dolby Vision' };
  // MP4/MOV: the first sample entry of the 'stsd' box names the codec
  for (let i = 0; i + 24 < buf.length; i++) {
    if (buf[i] === 0x73 && buf[i + 1] === 0x74 && buf[i + 2] === 0x73 && buf[i + 3] === 0x64) {
      const type = String.fromCharCode(buf[i + 16], buf[i + 17], buf[i + 18], buf[i + 19]);
      if (NAMES[type]) return NAMES[type];
    }
  }
  // WebM/Matroska: CodecID strings such as V_VP9, V_AV1, V_MPEGH/ISO/HEVC
  const head = new TextDecoder('latin1').decode(buf.subarray(0, Math.min(buf.length, 1 << 20)));
  const m = /V_(VP8|VP9|AV1|MPEG4\/ISO\/AVC|MPEGH\/ISO\/HEVC)/.exec(head);
  if (m) return { VP8: 'VP8', VP9: 'VP9', AV1: 'AV1', 'MPEG4/ISO/AVC': 'H.264', 'MPEGH/ISO/HEVC': 'H.265 (HEVC)' }[m[1]];
  return '';
}

/**
 * Does this MP4/MOV/WebM file have an audio track? Reads only the container headers: for MP4/MOV the
 * top-level boxes are walked to 'moov' (which phones often write at the end) and only that box is read.
 * @param {Blob} file
 * @returns {Promise<boolean | null>} null when it can't tell
 */
export async function hasAudioTrack(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
      // WebM/Matroska: Tracks sit near the start; audio CodecIDs all begin with A_
      const text = new TextDecoder('latin1').decode(await file.slice(0, 4 << 20).arrayBuffer());
      return /A_(OPUS|VORBIS|AAC|MPEG|AC3|EAC3|FLAC|PCM|DTS|TRUEHD|ALAC)/.test(text);
    }
    for (let o = 0; o + 8 <= file.size;) {
      const dv = new DataView(await file.slice(o, o + 16).arrayBuffer());
      let size = dv.getUint32(0);
      const type = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
      if (size === 1) size = Number(dv.getBigUint64(8));
      else if (size === 0) size = file.size - o;
      if (size < 8) return null;
      if (type === 'moov') {
        const moov = new Uint8Array(await file.slice(o, o + size).arrayBuffer());
        // each track's 'hdlr' box names its kind 12 bytes after the box type: 'vide', 'soun', …
        for (let i = 4; i + 16 <= moov.length; i++) {
          if (moov[i] === 0x68 && moov[i + 1] === 0x64 && moov[i + 2] === 0x6c && moov[i + 3] === 0x72
            && moov[i + 12] === 0x73 && moov[i + 13] === 0x6f && moov[i + 14] === 0x75 && moov[i + 15] === 0x6e) return true;
        }
        return false;
      }
      o += size;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Seek and resolve once the frame at `time` is decoded and paintable. */
export async function seekTo(video, time) {
  time = Math.max(0, Math.min(time, (video.duration || 0) - 1e-4));
  if (Math.abs(video.currentTime - time) < 1e-6 && video.readyState >= 2) return;
  const presented = 'requestVideoFrameCallback' in video
    ? new Promise(res => { video.requestVideoFrameCallback(() => res()); setTimeout(res, 500); })
    : null;
  const seeked = wait(video, 'seeked');
  video.currentTime = time;
  await seeked;
  if (presented) await presented;
}

/**
 * Estimate the frame rate from presented frames (requestVideoFrameCallback), falling back to `fallback`.
 * Plays muted for a moment and restores the position.
 */
export async function estimateFps(video, fallback = 30) {
  if (!('requestVideoFrameCallback' in video)) return fallback;
  await videoReady(video);
  const was = { t: video.currentTime, muted: video.muted, paused: video.paused };
  const times = [];
  try {
    video.muted = true;
    await new Promise((res) => {
      const done = setTimeout(res, 1200);
      const cb = (_, meta) => {
        times.push(meta.mediaTime);
        if (times.length >= 12) { clearTimeout(done); res(); } else video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
      video.play().catch(() => { clearTimeout(done); res(); });
    });
  } finally {
    video.pause();
    video.muted = was.muted;
    await seekTo(video, was.t).catch(() => { });
  }
  const deltas = [];
  for (let i = 1; i < times.length; i++) { const d = times[i] - times[i - 1]; if (d > 0.001) deltas.push(d); }
  if (deltas.length < 3) return fallback;
  deltas.sort((a, b) => a - b);
  const fps = 1 / deltas[Math.floor(deltas.length / 2)];
  // snap to common rates
  for (const r of [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]) if (Math.abs(fps - r) < 0.6) return r;
  return Math.round(fps);
}

/** Frame times (seconds, middle of each frame) for a clip. */
export function frameTimes({ duration, fps, start = 0, end = duration, maxFrames = Infinity }) {
  const out = [];
  const n = Math.min(maxFrames, Math.max(1, Math.floor((end - start) * fps + 1e-6)));
  for (let i = 0; i < n; i++) out.push(start + (i + 0.5) / fps);
  return out;
}

/**
 * Visit frames one by one.
 * @param {HTMLVideoElement} video
 * @param {{ fps: number, start?: number, end?: number, maxFrames?: number, times?: number[], signal?: AbortSignal,
 *           onFrame: (info: { index: number, time: number, total: number }) => any }} opts
 */
export async function forEachFrame(video, opts) {
  await videoReady(video);
  const wasPaused = video.paused;
  video.pause();
  // Explicit timestamps allow non-contiguous frame selections.
  const times = Array.isArray(opts.times)
    ? opts.times.filter(t => Number.isFinite(t)).slice(0, opts.maxFrames ?? Infinity)
    : frameTimes({ duration: video.duration, ...opts });
  try {
    for (let i = 0; i < times.length; i++) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await seekTo(video, times[i]);
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      await opts.onFrame({ index: i, time: times[i], total: times.length });
    }
  } finally {
    if (!wasPaused) video.play().catch(() => { });
  }
  return times.length;
}
