// Minimal MP4 (ISO BMFF) muxer for one H.264 video track. Everything is buffered in memory and
// written with the 'moov' box first ("fast start"), so the file plays and seeks while downloading.
// Input: AVCC samples (length-prefixed NAL units, as WebCodecs' VideoEncoder emits with
// avc.format 'avc') plus the AVCDecoderConfigurationRecord ('description').

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

/**
 * @param {{ width: number, height: number, timescale?: number }} opts
 */
export function createMp4Muxer({ width, height, timescale = 90000 }) {
  const samples = [];   // { data, key, ts, dur } with ts/dur in microseconds
  let description = null;

  return {
    /** Use with a VideoEncoder `output` callback. */
    addChunk(chunk, meta) {
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) {
        const d = meta.decoderConfig.description;
        description = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key', ts: chunk.timestamp, dur: chunk.duration || 0 });
    },
    /** Lower-level: add an AVCC sample directly. ts/dur in microseconds. */
    addSample(data, { key, timestamp, duration }) { samples.push({ data, key: !!key, ts: timestamp, dur: duration || 0 }); },
    /** AVCDecoderConfigurationRecord ('avcC' contents). */
    setDescription(d) { description = d; },

    /** @returns {Uint8Array} the .mp4 file */
    finish() {
      if (!samples.length) throw new Error('No video frames were encoded');
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
      const movieDur = Math.round(mediaDur * 1000 / timescale);

      const stts = [];
      for (const d of durs) { const last = stts[stts.length - 1]; if (last && last[1] === d) last[0]++; else stts.push([1, d]); }
      const ctts = [];
      for (const o of offsets) { const last = ctts[ctts.length - 1]; if (last && last[1] === o) last[0]++; else ctts.push([1, o]); }
      const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);
      const dataSize = samples.reduce((a, s) => a + s.data.length, 0);

      const ftyp = box('ftyp', w => w.str('isom').u32(512).str('isom').str('iso2').str('avc1').str('mp41'));
      const buildMoov = chunkOffset => box('moov', w => {
        w.bytes(fullBox('mvhd', 0, 0, b => {
          b.u32(0).u32(0).u32(1000).u32(movieDur).u32(0x00010000).u16(0x0100).zeros(10);
          MATRIX.forEach(v => b.u32(v)); b.zeros(24).u32(2);
        }));
        w.bytes(box('trak', tr => {
          tr.bytes(fullBox('tkhd', 0, 3, b => {
            b.u32(0).u32(0).u32(1).u32(0).u32(movieDur).zeros(8).u16(0).u16(0).u16(0).u16(0);
            MATRIX.forEach(v => b.u32(v)); b.u32(width << 16).u32(height << 16);
          }));
          tr.bytes(box('mdia', md => {
            md.bytes(fullBox('mdhd', 0, 0, b => b.u32(0).u32(0).u32(timescale).u32(mediaDur).u16(0x55c4).u16(0)));
            md.bytes(fullBox('hdlr', 0, 0, b => b.u32(0).str('vide').zeros(12).str('VideoHandler').u8(0)));
            md.bytes(box('minf', mi => {
              mi.bytes(fullBox('vmhd', 0, 1, b => b.u16(0).u16(0).u16(0).u16(0)));
              mi.bytes(box('dinf', di => di.bytes(fullBox('dref', 0, 0, b => { b.u32(1); b.bytes(fullBox('url ', 0, 1, () => { })); }))));
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
                st.bytes(fullBox('stsc', 0, 0, b => b.u32(1).u32(1).u32(samples.length).u32(1)));
                st.bytes(fullBox('stsz', 0, 0, b => { b.u32(0).u32(samples.length); for (const s of samples) b.u32(s.data.length); }));
                st.bytes(fullBox('stco', 0, 0, b => b.u32(1).u32(chunkOffset)));
              }));
            }));
          }));
        }));
      });
      // the moov size doesn't depend on the offset value, so measure once and build again
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
      return out;
    },
  };
}
