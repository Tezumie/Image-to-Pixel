// Minimal MP4 (ISO BMFF) muxer for one H.264 video track and, optionally, one AAC or Opus audio track.
// Everything is buffered in memory and written with the 'moov' box first ("fast start"), so the file
// plays and seeks while downloading.
// Video input: AVCC samples (length-prefixed NAL units, as WebCodecs' VideoEncoder emits with
// avc.format 'avc') plus the AVCDecoderConfigurationRecord ('description').
// Audio input: raw AAC frames plus the AudioSpecificConfig ('description'), as AudioEncoder emits with
// aac.format 'aac'; or Opus packets.

import { parseOpusHead } from './audio.js';

const ENC = new TextEncoder();

class Writer {
  constructor() { this.parts = []; this.size = 0; }
  u8(v) { return this.bytes([v & 255]); }
  u16(v) { return this.bytes([(v >>> 8) & 255, v & 255]); }
  u32(v) { return this.bytes([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  str(s) { return this.bytes(ENC.encode(s)); }
  bytes(b) { const a = b instanceof Uint8Array ? b : Uint8Array.from(b); this.parts.push(a); this.size += a.length; return this; }
  zeros(n) { return this.bytes(new Uint8Array(n)); }
  out() { const r = new Uint8Array(this.size); let o = 0; for (const p of this.parts) { r.set(p, o); o += p.length; } return r; }
}

/** A box: 4-byte size, 4-char type, then the body produced by fill(w). */
function box(type, fill) {
  const w = new Writer();
  fill(w);
  const body = w.out();
  const head = new Writer().u32(body.length + 8).str(type).out();
  const r = new Uint8Array(body.length + 8); r.set(head); r.set(body, 8);
  return r;
}
const fullBox = (type, version, flags, fill) => box(type, w => { w.u8(version).u8(flags >> 16).u8(flags >> 8).u8(flags); fill(w); });
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

const toBytes = d => new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));

/** MPEG-4 descriptor: tag, one-byte length (every descriptor here is under 128 bytes), body. */
const descriptor = (tag, body) => [tag, body.length, ...body];
const be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** 'esds' for AAC: ES_Descriptor > DecoderConfigDescriptor > DecoderSpecificInfo (the AudioSpecificConfig). */
function esds(asc, bitrate) {
  const decSpecific = descriptor(0x05, [...asc]);
  // 0x40 = MPEG-4 audio, 0x15 = audio stream type; buffer size 0; max and average bitrate
  const decConfig = descriptor(0x04, [0x40, 0x15, 0, 0, 0, ...be32(bitrate), ...be32(bitrate), ...decSpecific]);
  const sl = descriptor(0x06, [0x02]);
  return fullBox('esds', 0, 0, b => b.bytes(descriptor(0x03, [0x00, 0x02, 0x00, ...decConfig, ...sl])));   // ES_ID 2
}

// ---- H.264 decoder configuration (avcC)
// Some encoders hand WebCodecs a malformed avcC: Chrome on Windows (Media Foundation) has been seen
// repeating each parameter set's NAL header byte, which strict players (Windows Media Player, QuickTime)
// refuse. The encoder also writes SPS/PPS into the keyframes, so the muxer checks the record and, if it
// doesn't hold together, rebuilds it from those in-band parameter sets.

const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

/** Is this a well-formed AVCDecoderConfigurationRecord whose SPS agrees with its header? */
export function isValidAvcC(d) {
  if (!d || d.length < 7 || d[0] !== 1) return false;
  let o = 5;
  const nSps = d[o++] & 31;
  if (!nSps) return false;
  for (let i = 0; i < nSps; i++) {
    if (o + 2 > d.length) return false;
    const len = (d[o] << 8) | d[o + 1]; o += 2;
    if (len < 4 || o + len > d.length) return false;
    const sps = d.subarray(o, o + len);
    if ((sps[0] & 31) !== 7) return false;
    if (i === 0 && (sps[1] !== d[1] || sps[2] !== d[2] || sps[3] !== d[3])) return false;   // profile, constraints, level
    o += len;
  }
  if (o >= d.length) return false;
  const nPps = d[o++];
  if (!nPps) return false;
  for (let i = 0; i < nPps; i++) {
    if (o + 2 > d.length) return false;
    const len = (d[o] << 8) | d[o + 1]; o += 2;
    if (len < 1 || o + len > d.length || (d[o] & 31) !== 8) return false;
    o += len;
  }
  return true;
}

/** NAL units of an AVCC sample (4-byte lengths). */
function nalUnits(data) {
  const out = [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let o = 0; o + 4 <= data.length;) {
    const len = dv.getUint32(o); o += 4;
    if (!len || o + len > data.length) break;
    out.push(data.subarray(o, o + len)); o += len;
  }
  return out;
}

/** chroma_format_idc and bit depths from an SPS (High profiles), for the avcC extension. */
function spsChroma(sps) {
  const rbsp = [];
  for (let i = 1; i < sps.length; i++) {   // skip the NAL header; drop emulation-prevention bytes
    if (i >= 3 && sps[i] === 3 && sps[i - 1] === 0 && sps[i - 2] === 0) continue;
    rbsp.push(sps[i]);
  }
  let bit = 24;   // after profile_idc, constraint flags, level_idc
  const u1 = () => { const v = (rbsp[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; return v; };
  const ue = () => { let z = 0; while (bit < rbsp.length * 8 && !u1()) z++; let v = 0; for (let i = 0; i < z; i++) v = v * 2 + u1(); return (2 ** z) - 1 + v; };
  ue();                                    // seq_parameter_set_id
  const chroma = ue();
  if (chroma === 3) u1();                  // separate_colour_plane_flag
  return { chroma, lumaBits: ue(), chromaBits: ue() };
}

/** Build an avcC from the SPS/PPS carried inside a keyframe, or null if it has none. */
export function avcCFromSample(data) {
  const nals = nalUnits(data);
  const sps = nals.filter(n => (n[0] & 31) === 7);
  const pps = nals.filter(n => (n[0] & 31) === 8);
  if (!sps.length || !pps.length || sps[0].length < 4) return null;
  const out = [1, sps[0][1], sps[0][2], sps[0][3], 0xff, 0xe0 | sps.length];
  for (const s of sps) out.push(s.length >> 8, s.length & 255, ...s);
  out.push(pps.length);
  for (const p of pps) out.push(p.length >> 8, p.length & 255, ...p);
  if (HIGH_PROFILES.has(sps[0][1])) {
    const c = spsChroma(sps[0]);
    out.push(0xfc | (c.chroma & 3), 0xf8 | (c.lumaBits & 7), 0xf8 | (c.chromaBits & 7), 0);
  }
  return Uint8Array.from(out);
}

/** Collapse a list of numbers into [count, value] runs (stts / ctts). */
function runs(list) {
  const out = [];
  for (const v of list) { const last = out[out.length - 1]; if (last && last[1] === v) last[0]++; else out.push([1, v]); }
  return out;
}

/**
 * @param {{ width: number, height: number, timescale?: number,
 *           audio?: { codec: 'aac' | 'opus', sampleRate: number, numberOfChannels: number, bitrate?: number } }} opts
 *   audio: add a second track. Feed it with addAudioChunk() (AudioEncoder output) or addAudioSample().
 */
export function createMp4Muxer({ width, height, timescale = 90000, audio = null }) {
  const samples = [];        // video: { data, key, ts, dur }, ts/dur in microseconds
  const audioSamples = [];   // audio: { data, ts, dur }, microseconds
  let description = null;
  let audioDescription = null;

  /** Durations, sample entry and length of the audio track; null when there is none. */
  function audioTrack() {
    if (!audio || !audioSamples.length) return null;
    const rate = audio.sampleRate;
    const ch = audio.numberOfChannels;
    const t0 = audioSamples[0].ts;
    const starts = audioSamples.map(s => Math.round((s.ts - t0) * rate / 1e6));
    const lastDur = Math.round(audioSamples[audioSamples.length - 1].dur * rate / 1e6) || (audio.codec === 'aac' ? 1024 : 960);
    const durs = starts.map((s, i) => (i + 1 < starts.length ? Math.max(1, starts[i + 1] - s) : lastDur));
    let entry;
    if (audio.codec === 'aac') {
      if (!audioDescription) throw new Error('The audio encoder gave no AAC decoder configuration (AudioSpecificConfig)');
      entry = box('mp4a', a => {
        a.zeros(6).u16(1).zeros(8).u16(ch).u16(16).u16(0).u16(0).u32(rate <= 0xffff ? rate * 65536 : 0);
        a.bytes(esds(audioDescription, audio.bitrate || 128000));
      });
    } else {
      // Opus in ISO BMFF: an 'Opus' sample entry (always 48 kHz) with a 'dOps' box (big-endian, unlike OpusHead)
      const head = parseOpusHead(audioDescription);
      const preSkip = head ? head.preSkip : 312;
      entry = box('Opus', a => {
        a.zeros(6).u16(1).zeros(8).u16(ch).u16(16).u16(0).u16(0).u32(48000 * 65536);
        a.bytes(box('dOps', d => d.u8(0).u8(ch).u16(preSkip).u32(rate).u16(0).u8(0)));
      });
    }
    return { rate, durs, entry, mediaDur: durs.reduce((a, b) => a + b, 0) };
  }

  return {
    /** Use with a VideoEncoder `output` callback. */
    addChunk(chunk, meta) {
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) description = toBytes(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key', ts: chunk.timestamp, dur: chunk.duration || 0 });
    },
    /** Lower-level: add an AVCC sample directly. ts/dur in microseconds. */
    addSample(data, { key, timestamp, duration }) { samples.push({ data, key: !!key, ts: timestamp, dur: duration || 0 }); },
    /** AVCDecoderConfigurationRecord ('avcC' contents). */
    setDescription(d) { description = d; },

    /** Use with an AudioEncoder `output` callback (needs the `audio` option). */
    addAudioChunk(chunk, meta) {
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !audioDescription) audioDescription = toBytes(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      audioSamples.push({ data, ts: chunk.timestamp, dur: chunk.duration || 0 });
    },
    /** Lower-level: add one encoded audio frame, in order. ts/dur in microseconds. */
    addAudioSample(data, { timestamp, duration }) { audioSamples.push({ data, ts: timestamp, dur: duration || 0 }); },
    /** AAC AudioSpecificConfig (for Opus, an optional OpusHead to take the pre-skip from). */
    setAudioDescription(d) { audioDescription = d; },

    /** @returns {Uint8Array} the .mp4 file */
    finish() {
      if (!samples.length) throw new Error('No video frames were encoded');
      // Trust the encoder's avcC only if it holds together; otherwise use the keyframe's own SPS/PPS.
      if (!isValidAvcC(description)) {
        const key = samples.find(s => s.key) || samples[0];
        description = avcCFromSample(key.data) || description;
      }
      if (!description) throw new Error('The encoder gave no H.264 decoder configuration (avcC)');
      // Samples arrive in decode order with presentation timestamps (B-frames make them non-monotonic).
      // Decode times are the sorted presentation times; 'ctts' holds the difference when there is one.
      const t = us => Math.round(us * timescale / 1e6);
      const pts = samples.map(s => t(s.ts));
      const dts = pts.slice().sort((a, b) => a - b);
      const lastDur = t(samples[samples.length - 1].dur) || (dts.length > 1 ? dts[dts.length - 1] - dts[dts.length - 2] : t(33333));
      const durs = dts.map((d, i) => (i + 1 < dts.length ? dts[i + 1] - d : lastDur));
      const offsets = pts.map((p, i) => p - dts[i]);
      const hasOffsets = offsets.some(o => o !== 0);
      const mediaDur = durs.reduce((a, b) => a + b, 0);
      const videoMs = Math.round(mediaDur * 1000 / timescale);

      const stts = runs(durs);
      const ctts = runs(offsets);
      const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
      const videoSize = samples.reduce((a, s) => a + s.data.length, 0);

      const at = audioTrack();
      const audioMs = at ? Math.round(at.mediaDur * 1000 / at.rate) : 0;
      const audioSize = at ? audioSamples.reduce((a, s) => a + s.data.length, 0) : 0;
      const movieDur = Math.max(videoMs, audioMs);
      const dataSize = videoSize + audioSize;

      const ftyp = box('ftyp', w => w.str('isom').u32(512).str('isom').str('iso2').str('avc1').str('mp41'));
      const dinf = () => box('dinf', di => di.bytes(fullBox('dref', 0, 0, b => { b.u32(1); b.bytes(fullBox('url ', 0, 1, () => { })); })));
      // one chunk per track: all video samples, then all audio samples
      const stsc = n => fullBox('stsc', 0, 0, b => b.u32(1).u32(1).u32(n).u32(1));
      const stsz = list => fullBox('stsz', 0, 0, b => { b.u32(0).u32(list.length); for (const s of list) b.u32(s.data.length); });
      const stco = offset => fullBox('stco', 0, 0, b => b.u32(1).u32(offset));

      const buildMoov = dataStart => box('moov', w => {
        w.bytes(fullBox('mvhd', 0, 0, b => {
          b.u32(0).u32(0).u32(1000).u32(movieDur).u32(0x00010000).u16(0x0100).zeros(10);
          MATRIX.forEach(v => b.u32(v)); b.zeros(24).u32(at ? 3 : 2);   // next track ID
        }));
        // ---- video
        w.bytes(box('trak', tr => {
          tr.bytes(fullBox('tkhd', 0, 3, b => {
            b.u32(0).u32(0).u32(1).u32(0).u32(videoMs).zeros(8).u16(0).u16(0).u16(0).u16(0);
            MATRIX.forEach(v => b.u32(v)); b.u32(width << 16).u32(height << 16);
          }));
          tr.bytes(box('mdia', md => {
            md.bytes(fullBox('mdhd', 0, 0, b => b.u32(0).u32(0).u32(timescale).u32(mediaDur).u16(0x55c4).u16(0)));
            md.bytes(fullBox('hdlr', 0, 0, b => b.u32(0).str('vide').zeros(12).str('VideoHandler').u8(0)));
            md.bytes(box('minf', mi => {
              mi.bytes(fullBox('vmhd', 0, 1, b => b.u16(0).u16(0).u16(0).u16(0)));
              mi.bytes(dinf());
              mi.bytes(box('stbl', st => {
                st.bytes(fullBox('stsd', 0, 0, b => {
                  b.u32(1);
                  b.bytes(box('avc1', a => {
                    a.zeros(6).u16(1).zeros(16).u16(width).u16(height).u32(0x00480000).u32(0x00480000).u32(0).u16(1);
                    const name = ENC.encode('image-to-pixel').slice(0, 31);
                    a.u8(name.length).bytes(name).zeros(31 - name.length).u16(0x0018).u16(0xffff);
                    a.bytes(box('avcC', c => c.bytes(description)));
                  }));
                }));
                st.bytes(fullBox('stts', 0, 0, b => { b.u32(stts.length); for (const [n, d] of stts) b.u32(n).u32(d); }));
                // version 1: signed offsets, so negative composition offsets are allowed
                if (hasOffsets) st.bytes(fullBox('ctts', 1, 0, b => { b.u32(ctts.length); for (const [n, o] of ctts) b.u32(n).u32(o >>> 0); }));
                if (keys.length < samples.length) st.bytes(fullBox('stss', 0, 0, b => { b.u32(keys.length); for (const k of keys) b.u32(k); }));
                st.bytes(stsc(samples.length));
                st.bytes(stsz(samples));
                st.bytes(stco(dataStart));
              }));
            }));
          }));
        }));
        // ---- audio
        if (at) w.bytes(box('trak', tr => {
          tr.bytes(fullBox('tkhd', 0, 3, b => {
            // layer 0, alternate group 1, volume 1.0
            b.u32(0).u32(0).u32(2).u32(0).u32(audioMs).zeros(8).u16(0).u16(1).u16(0x0100).u16(0);
            MATRIX.forEach(v => b.u32(v)); b.u32(0).u32(0);
          }));
          tr.bytes(box('mdia', md => {
            md.bytes(fullBox('mdhd', 0, 0, b => b.u32(0).u32(0).u32(at.rate).u32(at.mediaDur).u16(0x55c4).u16(0)));
            md.bytes(fullBox('hdlr', 0, 0, b => b.u32(0).str('soun').zeros(12).str('SoundHandler').u8(0)));
            md.bytes(box('minf', mi => {
              mi.bytes(fullBox('smhd', 0, 0, b => b.u16(0).u16(0)));
              mi.bytes(dinf());
              mi.bytes(box('stbl', st => {
                st.bytes(fullBox('stsd', 0, 0, b => { b.u32(1); b.bytes(at.entry); }));
                const r = runs(at.durs);
                st.bytes(fullBox('stts', 0, 0, b => { b.u32(r.length); for (const [n, d] of r) b.u32(n).u32(d); }));
                st.bytes(stsc(audioSamples.length));
                st.bytes(stsz(audioSamples));
                st.bytes(stco(dataStart + videoSize));
              }));
            }));
          }));
        }));
      });
      // the moov size doesn't depend on the offset values, so measure once and build again
      const moovSize = buildMoov(0).length;
      const offset = ftyp.length + moovSize + 8;
      if (offset + dataSize > 0xffffffff) throw new Error('Video is larger than 4 GB');
      const moov = buildMoov(offset);
      const out = new Uint8Array(offset + dataSize);
      out.set(ftyp, 0); out.set(moov, ftyp.length);
      const dv = new DataView(out.buffer);
      dv.setUint32(ftyp.length + moov.length, dataSize + 8);
      out.set(ENC.encode('mdat'), ftyp.length + moov.length + 4);
      let o = offset;
      for (const s of samples) { out.set(s.data, o); o += s.data.length; }
      if (at) for (const s of audioSamples) { out.set(s.data, o); o += s.data.length; }
      return out;
    },
  };
}
