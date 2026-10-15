// The MP4 and WebM muxers: structure checks that need no browser and no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMp4Muxer } from '../lib/core/video/mux-mp4.js';
import { createWebmMuxer } from '../lib/core/video/mux-webm.js';
import { isValidAvcC, avcCFromSample } from '../lib/core/video/mux-mp4.js';
import { hasAudioTrack } from '../lib/core/video/frames.js';

/** Parse ISO BMFF boxes into { type, start, size, body, children }. */
function boxes(buf, start = 0, end = buf.length) {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  const out = [];
  for (let o = start; o + 8 <= end;) {
    const size = dv.getUint32(o), type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
    assert.ok(size >= 8 && o + size <= end, `bad size for ${type}`);
    const b = { type, start: o, size, body: o + 8 };
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf'].includes(type)) b.children = boxes(buf, o + 8, o + size);
    out.push(b); o += size;
  }
  return out;
}
const find = (list, path) => { let cur = { children: list }; for (const t of path.split('/')) cur = cur.children.find(b => b.type === t); return cur; };

const avcC = Uint8Array.from([1, 0x42, 0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0, 0x1f, 1, 0, 2, 0x68, 0xce]);
const sample = (n, fill) => { const d = new Uint8Array(4 + n); new DataView(d.buffer).setUint32(0, n); d.fill(fill, 4); return d; };

test('MP4: fast-start layout, sample tables and offsets point at the data', () => {
  const m = createMp4Muxer({ width: 64, height: 48 });
  m.setDescription(avcC);
  const sizes = [30, 10, 12, 11, 40, 9];
  sizes.forEach((n, i) => m.addSample(sample(n, i + 1), { key: i % 4 === 0, timestamp: Math.round(i * 1e6 / 30), duration: Math.round(1e6 / 30) }));
  const buf = m.finish();
  const top = boxes(buf);
  assert.deepEqual(top.map(b => b.type), ['ftyp', 'moov', 'mdat'], 'moov comes before mdat');
  const dv = new DataView(buf.buffer);
  const stsz = find(top, 'moov/trak/mdia/minf/stbl').children.find(b => b.type === 'stsz');
  assert.equal(dv.getUint32(stsz.body + 8), sizes.length);
  for (let i = 0; i < sizes.length; i++) assert.equal(dv.getUint32(stsz.body + 12 + i * 4), sizes[i] + 4);
  const stco = find(top, 'moov/trak/mdia/minf/stbl').children.find(b => b.type === 'stco');
  const offset = dv.getUint32(stco.body + 8);
  const mdat = top[2];
  assert.equal(offset, mdat.body, 'chunk offset is the start of the mdat payload');
  assert.equal(buf[offset + 4], 1, 'first sample payload');
  const stss = find(top, 'moov/trak/mdia/minf/stbl').children.find(b => b.type === 'stss');
  assert.deepEqual([dv.getUint32(stss.body + 4), dv.getUint32(stss.body + 8), dv.getUint32(stss.body + 12)], [2, 1, 5], 'two sync samples: 1 and 5');
  const mdhd = find(top, 'moov/trak/mdia').children.find(b => b.type === 'mdhd');
  assert.equal(dv.getUint32(mdhd.body + 12), 90000);
  assert.equal(dv.getUint32(mdhd.body + 16), 6 * 3000, 'six frames of 1/30 s at 90 kHz');
  assert.equal(find(top, 'moov/trak/mdia/minf/stbl').children.find(b => b.type === 'ctts'), undefined, 'no ctts without B-frames');
});

test('MP4: B-frame order writes signed composition offsets', () => {
  const m = createMp4Muxer({ width: 64, height: 48 });
  m.setDescription(avcC);
  // decode order I P B B, display order I B B P
  [0, 3, 1, 2].forEach((r, i) => m.addSample(sample(8, i + 1), { key: i === 0, timestamp: Math.round(r * 1e6 / 30), duration: Math.round(1e6 / 30) }));
  const buf = m.finish();
  const stbl = find(boxes(buf), 'moov/trak/mdia/minf/stbl');
  const ctts = stbl.children.find(b => b.type === 'ctts');
  assert.ok(ctts, 'ctts present');
  const dv = new DataView(buf.buffer);
  assert.equal(buf[ctts.body], 1, 'version 1 (signed offsets)');
  const n = dv.getUint32(ctts.body + 4), offsets = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < dv.getUint32(ctts.body + 8 + i * 8); k++) offsets.push(dv.getInt32(ctts.body + 12 + i * 8));
  assert.deepEqual(offsets, [0, 6000, -3000, -3000]);
});

test('MP4: refuses to write without frames or decoder configuration', () => {
  assert.throws(() => createMp4Muxer({ width: 8, height: 8 }).finish(), /No video frames/);
  const m = createMp4Muxer({ width: 8, height: 8 }); m.addSample(sample(4, 1), { key: true, timestamp: 0 });
  assert.throws(() => m.finish(), /decoder configuration/);
});

/** Minimal EBML reader: returns [{ id, start, dataStart, size }] for the elements in a range. */
function ebml(buf, start, end) {
  const out = [];
  const vint = (o, keepMarker) => {
    const first = buf[o]; let len = 1;
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
    let v = keepMarker ? first : first & (0xff >> len);
    for (let i = 1; i < len; i++) v = v * 256 + buf[o + i];
    return { v, len };
  };
  for (let o = start; o < end;) {
    const id = vint(o, true), size = vint(o + id.len, false);
    const dataStart = o + id.len + size.len;
    out.push({ id: id.v, start: o, dataStart, size: size.v });
    o = dataStart + size.v;
  }
  return out;
}

test('WebM: EBML header, segment with SeekHead, Info, Tracks, Clusters and Cues', () => {
  const m = createWebmMuxer({ width: 64, height: 48, codec: 'vp9', fps: 10 });
  for (let i = 0; i < 25; i++) m.addFrame(Uint8Array.from([i, i, i]), { key: i % 10 === 0, timestamp: i * 100000 });
  const buf = m.finish();
  const top = ebml(buf, 0, buf.length);
  assert.deepEqual(top.map(e => e.id.toString(16)), ['1a45dfa3', '18538067']);
  const seg = top[1];
  const kids = ebml(buf, seg.dataStart, seg.dataStart + seg.size);
  const names = kids.map(e => ({ 0x114d9b74: 'SeekHead', 0x1549a966: 'Info', 0x1654ae6b: 'Tracks', 0x1f43b675: 'Cluster', 0x1c53bb6b: 'Cues' }[e.id]));
  assert.deepEqual(names, ['SeekHead', 'Info', 'Tracks', 'Cluster', 'Cluster', 'Cluster', 'Cues']);
  // every SimpleBlock is in a cluster, with relative timestamps
  let blocks = 0;
  for (const c of kids.filter(e => e.id === 0x1f43b675)) blocks += ebml(buf, c.dataStart, c.dataStart + c.size).filter(e => e.id === 0xa3).length;
  assert.equal(blocks, 25);
  // SeekHead positions point at the elements they name (relative to the segment data)
  const seekHead = kids[0];
  const seeks = ebml(buf, seekHead.dataStart, seekHead.dataStart + seekHead.size).map(s => ebml(buf, s.dataStart, s.dataStart + s.size));
  for (const s of seeks) {
    const idEl = s.find(e => e.id === 0x53ab), posEl = s.find(e => e.id === 0x53ac);
    let pos = 0; for (let i = 0; i < posEl.size; i++) pos = pos * 256 + buf[posEl.dataStart + i];
    const target = kids.find(k => k.start === seg.dataStart + pos);
    assert.ok(target, 'seek target exists');
    const want = [...buf.subarray(idEl.dataStart, idEl.dataStart + idEl.size)].reduce((a, b) => a * 256 + b, 0);
    assert.equal(target.id, want);
  }
});

// ---- audio tracks

const asc = Uint8Array.from([0x11, 0x90]);   // AudioSpecificConfig: AAC-LC, 48 kHz, stereo
const tracksOf = top => find(top, 'moov').children.filter(b => b.type === 'trak');
const handler = (buf, trak) => { const hdlr = find(trak.children, 'mdia').children.find(b => b.type === 'hdlr'); return String.fromCharCode(...buf.subarray(hdlr.body + 8, hdlr.body + 12)); };
const childBoxes = (buf, b, skip = 0) => boxes(buf, b.body + skip, b.start + b.size);

function muxAV(audio, audioFrames, desc) {
  const m = createMp4Muxer({ width: 64, height: 48, audio });
  m.setDescription(avcC);
  for (let i = 0; i < 10; i++) m.addSample(sample(20, 1), { key: i === 0, timestamp: Math.round(i * 1e5), duration: 1e5 });   // 1 s at 10 fps
  if (desc) m.setAudioDescription(desc);
  const dur = audio.codec === 'aac' ? 1024 / 48000 * 1e6 : 20000;
  for (let i = 0; i < audioFrames; i++) m.addAudioSample(new Uint8Array(7).fill(0xa0 + (i & 15)), { timestamp: Math.round(i * dur), duration: Math.round(dur) });
  return m.finish();
}

test('MP4 + AAC: second track with an mp4a/esds entry, audio data after the video data', () => {
  const buf = muxAV({ codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, 47, asc);
  const top = boxes(buf);
  const dv = new DataView(buf.buffer);
  const traks = tracksOf(top);
  assert.deepEqual(traks.map(t => handler(buf, t)), ['vide', 'soun']);
  const mvhd = find(top, 'moov').children.find(b => b.type === 'mvhd');
  assert.equal(dv.getUint32(mvhd.body + 96), 3, 'next track ID');
  const stbl = find(traks[1].children, 'mdia/minf/stbl');
  const stsd = stbl.children.find(b => b.type === 'stsd');
  const entry = childBoxes(buf, stsd, 8)[0];
  assert.equal(entry.type, 'mp4a');
  assert.equal(dv.getUint16(entry.body + 16), 2, 'channels');
  assert.equal(dv.getUint32(entry.body + 24) >>> 16, 48000, 'sample rate');
  const esdsBox = boxes(buf, entry.body + 28, entry.start + entry.size)[0];
  assert.equal(esdsBox.type, 'esds');
  const esdsBytes = [...buf.subarray(esdsBox.body, esdsBox.start + esdsBox.size)];
  const i5 = esdsBytes.indexOf(0x05);
  assert.deepEqual(esdsBytes.slice(i5 + 2, i5 + 4), [...asc], 'AudioSpecificConfig in DecoderSpecificInfo');
  const mdhd = find(traks[1].children, 'mdia').children.find(b => b.type === 'mdhd');
  assert.equal(dv.getUint32(mdhd.body + 12), 48000, 'timescale is the sample rate');
  assert.equal(dv.getUint32(mdhd.body + 16), 47 * 1024, 'duration in samples');
  const stts = stbl.children.find(b => b.type === 'stts');
  assert.deepEqual([dv.getUint32(stts.body + 4), dv.getUint32(stts.body + 8), dv.getUint32(stts.body + 12)], [1, 47, 1024]);
  // chunk offsets: video at the start of mdat, audio right after the video bytes
  const vStco = find(traks[0].children, 'mdia/minf/stbl').children.find(b => b.type === 'stco');
  const aStco = stbl.children.find(b => b.type === 'stco');
  const mdat = top.find(b => b.type === 'mdat');
  assert.equal(dv.getUint32(vStco.body + 8), mdat.body);
  assert.equal(dv.getUint32(aStco.body + 8), mdat.body + 10 * 24);
  assert.equal(buf[dv.getUint32(aStco.body + 8)], 0xa0, 'first audio frame');
  assert.equal(mdat.size, 8 + 10 * 24 + 47 * 7);
});

test('MP4 + Opus: Opus sample entry with dOps', () => {
  const buf = muxAV({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 }, 50, null);
  const traks = tracksOf(boxes(buf));
  const stsd = find(traks[1].children, 'mdia/minf/stbl').children.find(b => b.type === 'stsd');
  const entry = childBoxes(buf, stsd, 8)[0];
  assert.equal(entry.type, 'Opus');
  const dOps = boxes(buf, entry.body + 28, entry.start + entry.size)[0];
  assert.equal(dOps.type, 'dOps');
  const dv = new DataView(buf.buffer);
  assert.equal(buf[dOps.body + 1], 1, 'channel count');
  assert.equal(dv.getUint16(dOps.body + 2), 312, 'default pre-skip');
  assert.equal(dv.getUint32(dOps.body + 4), 48000);
});

test('MP4: the audio option without audio frames writes a video-only file', () => {
  const buf = muxAV({ codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, 0, null);
  assert.equal(tracksOf(boxes(buf)).length, 1);
});

test('MP4 + AAC: refuses to write without the AudioSpecificConfig', () => {
  assert.throws(() => muxAV({ codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, 3, null), /AudioSpecificConfig/);
});

test('WebM + Opus: audio TrackEntry and interleaved blocks in time order', () => {
  const m = createWebmMuxer({ width: 64, height: 48, codec: 'vp9', fps: 10, audio: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 } });
  for (let i = 0; i < 20; i++) m.addFrame(Uint8Array.from([1, i]), { key: i % 10 === 0, timestamp: i * 100000 });
  for (let i = 0; i < 100; i++) m.addAudioFrame(Uint8Array.from([2, i]), { timestamp: i * 20000, duration: 20000 });
  const buf = m.finish();
  const seg = ebml(buf, 0, buf.length)[1];
  const kids = ebml(buf, seg.dataStart, seg.dataStart + seg.size);
  const tracks = kids.find(e => e.id === 0x1654ae6b);
  const entries = ebml(buf, tracks.dataStart, tracks.dataStart + tracks.size);
  assert.equal(entries.length, 2);
  const audioEntry = ebml(buf, entries[1].dataStart, entries[1].dataStart + entries[1].size);
  const codecId = audioEntry.find(e => e.id === 0x86);
  assert.equal(new TextDecoder().decode(buf.subarray(codecId.dataStart, codecId.dataStart + codecId.size)), 'A_OPUS');
  const priv = audioEntry.find(e => e.id === 0x63a2);
  assert.equal(new TextDecoder().decode(buf.subarray(priv.dataStart, priv.dataStart + 8)), 'OpusHead', 'CodecPrivate is an OpusHead');
  // walk every block: absolute times never go backwards, and both tracks are all there
  let last = -1, video = 0, audio = 0;
  for (const c of kids.filter(e => e.id === 0x1f43b675)) {
    const inner = ebml(buf, c.dataStart, c.dataStart + c.size);
    const ts = inner.find(e => e.id === 0xe7);
    let start = 0; for (let i = 0; i < ts.size; i++) start = start * 256 + buf[ts.dataStart + i];
    for (const b of inner.filter(e => e.id === 0xa3)) {
      const track = buf[b.dataStart] & 0x7f;
      const t = start + new DataView(buf.buffer).getInt16(b.dataStart + 1);
      assert.ok(t >= last, 'blocks in time order');
      last = t;
      if (track === 1) video++; else if (track === 2) audio++;
      assert.equal(buf[b.dataStart + 4], track, 'payload belongs to its track');
    }
  }
  assert.deepEqual([video, audio], [20, 100]);
});

test('WebM: only Opus audio is accepted', () => {
  assert.throws(() => createWebmMuxer({ width: 8, height: 8, audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 } }), /Opus/);
});

// ---- broken encoder output (Chrome on Windows) and audio detection

// A real High-profile SPS/PPS pair (from a Chrome/Media Foundation export), and the avcC that encoder
// produced for it, with each parameter set's NAL header byte doubled.
const SPS = Uint8Array.from(Buffer.from('67640016ac2cac0ac33f9e10000003001000000301e0da08845380', 'hex'));
const PPS = Uint8Array.from(Buffer.from('68ce3c30', 'hex'));
const BAD_AVCC = Uint8Array.from(Buffer.from('016400160301001c6767640016ac2cac0ac33f9e10000003001000000301e0da088453800100056868ce3c30', 'hex'));
const nal = n => { const d = new Uint8Array(4 + n.length); new DataView(d.buffer).setUint32(0, n.length); d.set(n, 4); return d; };
const joinBytes = (...parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

test('avcC: a record with doubled NAL headers is rejected and rebuilt from the keyframe', () => {
  assert.equal(isValidAvcC(BAD_AVCC), false);
  assert.equal(isValidAvcC(avcC), true);
  const key = joinBytes(nal(Uint8Array.of(0x09, 0x10)), nal(SPS), nal(PPS), nal(Uint8Array.of(0x65, 0x88, 0x80)));
  const rebuilt = avcCFromSample(key);
  assert.equal(isValidAvcC(rebuilt), true);
  assert.deepEqual([...rebuilt.subarray(0, 6)], [1, 0x64, 0x00, 0x16, 0xff, 0xe1]);
  assert.deepEqual([...rebuilt.subarray(8, 8 + SPS.length)], [...SPS]);
  assert.deepEqual([...rebuilt.subarray(rebuilt.length - 4)], [0xfd, 0xf8, 0xf8, 0], 'High profile: 4:2:0, 8-bit');

  const m = createMp4Muxer({ width: 64, height: 48 });
  m.setDescription(BAD_AVCC);
  m.addSample(key, { key: true, timestamp: 0, duration: 1e5 });
  const buf = m.finish();
  const stsd = find(boxes(buf), 'moov/trak/mdia/minf/stbl').children.find(b => b.type === 'stsd');
  const entry = boxes(buf, stsd.body + 8, stsd.start + stsd.size)[0];
  const avcCBox = boxes(buf, entry.body + 78, entry.start + entry.size).find(b => b.type === 'avcC');
  assert.deepEqual([...buf.subarray(avcCBox.body, avcCBox.start + avcCBox.size)], [...rebuilt], 'the file carries the repaired record');
});

test('hasAudioTrack: reads MP4 and WebM headers', async () => {
  const blob = b => new Blob([b]);
  assert.equal(await hasAudioTrack(blob(muxAV({ codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, 5, asc))), true);
  assert.equal(await hasAudioTrack(blob(muxAV({ codec: 'aac', sampleRate: 48000, numberOfChannels: 2 }, 0, null))), false);
  const w = withAudio => {
    const m = createWebmMuxer({ width: 8, height: 8, fps: 10, audio: withAudio ? { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 } : null });
    m.addFrame(Uint8Array.of(1), { key: true, timestamp: 0 });
    if (withAudio) m.addAudioFrame(Uint8Array.of(2), { timestamp: 0, duration: 20000 });
    return m.finish();
  };
  assert.equal(await hasAudioTrack(blob(w(true))), true);
  assert.equal(await hasAudioTrack(blob(w(false))), false);
  assert.equal(await hasAudioTrack(blob(Uint8Array.of(1, 2, 3))), null);
});
