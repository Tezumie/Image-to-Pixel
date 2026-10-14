// The MP4 and WebM muxers: structure checks that need no browser and no ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMp4Muxer } from '../lib/core/video/mux-mp4.js';
import { createWebmMuxer } from '../lib/core/video/mux-webm.js';

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
