// Minimal WebM (Matroska) muxer for one VP8/VP9/AV1 video track. Buffered in memory, written with
// a SeekHead and Cues so players can seek. Input: encoded frames from WebCodecs' VideoEncoder.

const ENC = new TextEncoder();

/** EBML variable-length size, always 8 bytes (simple and valid for any size). */
function size8(n) {
  const b = new Uint8Array(8);
  b[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) { b[i] = v % 256; v = Math.floor(v / 256); }
  return b;
}
function idBytes(id) {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  return out;
}
function concat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** An element: id, 8-byte size, data. */
const el = (id, data) => concat([Uint8Array.from(idBytes(id)), size8(data.length), data]);
const uint = (id, v, bytes = 0) => {
  const b = [];
  for (let x = v; x > 0 || b.length === 0; x = Math.floor(x / 256)) b.unshift(x % 256);
  while (b.length < bytes) b.unshift(0);
  return el(id, Uint8Array.from(b));
};
const str = (id, s) => el(id, ENC.encode(s));
const float64 = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
const master = (id, children) => el(id, concat(children));

const ID = {
  EBML: 0x1A45DFA3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42F7, EBMLMaxIDLength: 0x42F2, EBMLMaxSizeLength: 0x42F3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
  Info: 0x1549A966, TimestampScale: 0x2AD7B1, Duration: 0x4489, MuxingApp: 0x4D80, WritingApp: 0x5741,
  Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackUID: 0x73C5, TrackType: 0x83, FlagLacing: 0x9C,
  CodecID: 0x86, CodecPrivate: 0x63A2, DefaultDuration: 0x23E383, Video: 0xE0, PixelWidth: 0xB0, PixelHeight: 0xBA,
  Cluster: 0x1F43B675, Timestamp: 0xE7, SimpleBlock: 0xA3,
  Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7, CueClusterPosition: 0xF1,
};

const CODEC_IDS = { vp8: 'V_VP8', vp9: 'V_VP9', av1: 'V_AV1' };

/**
 * @param {{ width: number, height: number, codec: 'vp8' | 'vp9' | 'av1', fps?: number }} opts
 */
export function createWebmMuxer({ width, height, codec = 'vp9', fps = 0 }) {
  const frames = [];   // { data, key, ms }
  let codecPrivate = null;

  return {
    addChunk(chunk, meta) {
      if (meta && meta.decoderConfig && meta.decoderConfig.description && !codecPrivate) {
        const d = meta.decoderConfig.description;
        codecPrivate = new Uint8Array(d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push({ data, key: chunk.type === 'key', ms: chunk.timestamp / 1000 });
    },
    /** Lower-level: add one encoded frame. timestamp in microseconds. */
    addFrame(data, { key, timestamp }) { frames.push({ data, key: !!key, ms: timestamp / 1000 }); },

    /** @returns {Uint8Array} the .webm file */
    finish() {
      if (!frames.length) throw new Error('No video frames were encoded');
      // VP8/VP9/AV1 frames from WebCodecs arrive in decode order, which is the order they're stored in
      const frameMs = fps ? 1000 / fps : (frames.length > 1 ? (frames[frames.length - 1].ms - frames[0].ms) / (frames.length - 1) : 33.333);
      const duration = frames[frames.length - 1].ms + frameMs;

      const info = master(ID.Info, [
        uint(ID.TimestampScale, 1000000),            // 1 ms
        float64(ID.Duration, duration),
        str(ID.MuxingApp, 'image-to-pixel'), str(ID.WritingApp, 'image-to-pixel'),
      ]);
      const tracks = master(ID.Tracks, [master(ID.TrackEntry, [
        uint(ID.TrackNumber, 1), uint(ID.TrackUID, 1), uint(ID.TrackType, 1), uint(ID.FlagLacing, 0),
        str(ID.CodecID, CODEC_IDS[codec] || codec),
        ...(codecPrivate ? [el(ID.CodecPrivate, codecPrivate)] : []),
        uint(ID.DefaultDuration, Math.round(frameMs * 1e6)),
        master(ID.Video, [uint(ID.PixelWidth, width), uint(ID.PixelHeight, height)]),
      ])]);

      // clusters: a new one at each keyframe, and before the 16-bit relative timestamp overflows
      const clusters = [];
      let cur = null;
      for (const f of frames) {
        const t = Math.round(f.ms);
        if (!cur || f.key || t - cur.start > 30000) { cur = { start: t, key: f.key, blocks: [] }; clusters.push(cur); }
        const head = new Uint8Array(4);
        head[0] = 0x81;                                      // track 1
        new DataView(head.buffer).setInt16(1, t - cur.start);
        head[3] = f.key ? 0x80 : 0x00;
        cur.blocks.push(el(ID.SimpleBlock, concat([head, f.data])));
      }
      const clusterBytes = clusters.map(c => master(ID.Cluster, [uint(ID.Timestamp, c.start), ...c.blocks]));

      // SeekHead with fixed-width positions, so its size is known before the positions are
      const seekHead = (posInfo, posTracks, posCues) => master(ID.SeekHead, [
        [ID.Info, posInfo], [ID.Tracks, posTracks], [ID.Cues, posCues],
      ].map(([id, pos]) => master(ID.Seek, [el(ID.SeekID, Uint8Array.from(idBytes(id))), uint(ID.SeekPosition, pos, 8)])));
      const shSize = seekHead(0, 0, 0).length;
      const posInfo = shSize, posTracks = posInfo + info.length;
      let pos = posTracks + tracks.length;
      const cuePoints = [];
      clusters.forEach((c, i) => {
        if (c.key) cuePoints.push(master(ID.CuePoint, [uint(ID.CueTime, c.start), master(ID.CueTrackPositions, [uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, pos)])]));
        pos += clusterBytes[i].length;
      });
      const cues = master(ID.Cues, cuePoints.length ? cuePoints : [master(ID.CuePoint, [uint(ID.CueTime, 0), master(ID.CueTrackPositions, [uint(ID.CueTrack, 1), uint(ID.CueClusterPosition, posTracks + tracks.length)])])]);
      const posCues = pos;

      const header = master(ID.EBML, [
        uint(ID.EBMLVersion, 1), uint(ID.EBMLReadVersion, 1), uint(ID.EBMLMaxIDLength, 4), uint(ID.EBMLMaxSizeLength, 8),
        str(ID.DocType, 'webm'), uint(ID.DocTypeVersion, 4), uint(ID.DocTypeReadVersion, 2),
      ]);
      const segment = master(ID.Segment, [seekHead(posInfo, posTracks, posCues), info, tracks, ...clusterBytes, cues]);
      return concat([header, segment]);
    },
  };
}
