import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePNG, encodeGIF, createZip, packSpriteSheet, buildTileset, upscale } from '../lib/index.js';
import { crc32 } from '../lib/core/export/crc32.js';

const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4); return { width: w, height: h, data: d }; };

function readPNG(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  let o = 8; const chunks = {}; const idat = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(...bytes.slice(o + 4, o + 8)), data = bytes.slice(o + 8, o + 8 + len);
    assert.equal(dv.getUint32(o + 8 + len), crc32(bytes.slice(o + 4, o + 8 + len)), `${type} crc`);
    if (type === 'IDAT') idat.push(data); else chunks[type] = data;
    o += 12 + len;
  }
  const ih = new DataView(chunks.IHDR.buffer);
  const w = ih.getUint32(0), h = ih.getUint32(4), bits = chunks.IHDR[8], ct = chunks.IHDR[9];
  const raw = inflateSync(Buffer.concat(idat.map(b => Buffer.from(b))));
  const out = new Uint8ClampedArray(w * h * 4);
  if (ct === 6) {
    for (let y = 0; y < h; y++) { assert.equal(raw[y * (w * 4 + 1)], 0); out.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4); }
  } else {
    const stride = Math.ceil(w * bits / 8);
    const pal = chunks.PLTE, trns = chunks.tRNS || [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const byte = raw[y * (stride + 1) + 1 + ((x * bits) >> 3)];
      const v = (byte >> (8 - bits - ((x * bits) & 7))) & ((1 << bits) - 1);
      out.set([pal[v * 3], pal[v * 3 + 1], pal[v * 3 + 2], v < trns.length ? trns[v] : 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, bits, colorType: ct, data: out };
}

test('PNG: indexed and RGBA decode back to the same pixels', async () => {
  const a = img(13, 7, (x, y) => (x + y) % 3 === 0 ? [255, 0, 0, 255] : (x % 5 === 0 ? [0, 0, 0, 0] : [10, 200, 30, 255]));
  const idx = readPNG(await encodePNG(a));
  assert.equal(idx.colorType, 3); assert.equal(idx.bits, 2);
  assert.deepEqual([...idx.data], [...a.data]);
  const rgba = readPNG(await encodePNG(a, { indexed: false }));
  assert.equal(rgba.colorType, 6);
  assert.deepEqual([...rgba.data], [...a.data]);
  const many = img(20, 20, (x, y) => [x * 12, y * 12, (x * y) % 256, 255]);
  assert.equal(readPNG(await encodePNG(many)).colorType, 6, '> 256 colours falls back to RGBA');
  const scaled = readPNG(await encodePNG(a, { scale: 3 }));
  assert.equal(scaled.width, 39); assert.equal(scaled.height, 21);
  assert.deepEqual([...scaled.data], [...upscale(a, 3).data]);
});

function readGIF(bytes) {
  let o = 6;
  const W = bytes[o] | (bytes[o + 1] << 8), H = bytes[o + 2] | (bytes[o + 3] << 8), flags = bytes[o + 4]; o += 7;
  let gct = null;
  if (flags & 0x80) { const n = 2 << (flags & 7); gct = bytes.slice(o, o + n * 3); o += n * 3; }
  const frames = []; let tIndex = -1, delay = 0, loop = null;
  while (bytes[o] !== 0x3b) {
    if (bytes[o] === 0x21) {
      const label = bytes[o + 1];
      if (label === 0xf9) { tIndex = bytes[o + 3] & 1 ? bytes[o + 6] : -1; delay = bytes[o + 4] | (bytes[o + 5] << 8); }
      if (label === 0xff) loop = bytes[o + 16] | (bytes[o + 17] << 8);
      o += 2; while (bytes[o]) o += bytes[o] + 1; o++;
      continue;
    }
    assert.equal(bytes[o], 0x2c);
    const fl = bytes[o + 9]; o += 10;
    let ct = gct;
    if (fl & 0x80) { const n = 2 << (fl & 7); ct = bytes.slice(o, o + n * 3); o += n * 3; }
    const min = bytes[o++]; const data = [];
    while (bytes[o]) { data.push(...bytes.slice(o + 1, o + 1 + bytes[o])); o += bytes[o] + 1; }
    o++;
    // LZW decode
    const clear = 1 << min, eoi = clear + 1;
    let size = min + 1, dict = [], prev = null, bit = 0; const out = [];
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = min + 1; prev = null; };
    reset();
    for (;;) {
      let code = 0; for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry = dict[code] ? dict[code] : [...dict[prev], dict[prev][0]];
      if (prev !== null && dict.length < 4096) dict.push([...dict[prev], entry[0]]);
      out.push(...entry); prev = code;
      if (dict.length === (1 << size) && size < 12) size++;
    }
    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) px.set(out[i] === tIndex ? [0, 0, 0, 0] : [ct[out[i] * 3], ct[out[i] * 3 + 1], ct[out[i] * 3 + 2], 255], i * 4);
    frames.push({ data: px, delay });
  }
  return { width: W, height: H, frames, loop, global: !!gct };
}

test('GIF: lossless frames with a shared palette, transparency and delays', () => {
  const f1 = img(37, 23, (x, y) => (x * y) % 7 === 0 ? [0, 0, 0, 0] : [(x * 9) % 256 & 0xf0, (y * 11) % 256 & 0xf0, 64, 255]);
  const f2 = img(37, 23, (x, y) => [x & 1 ? 255 : 0, 0, y & 1 ? 255 : 0, 255]);
  const g = readGIF(encodeGIF([{ ...f1, delay: 100 }, { ...f2, delay: 250 }]));
  assert.equal(g.width, 37); assert.equal(g.frames.length, 2); assert.equal(g.loop, 0); assert.ok(g.global);
  assert.deepEqual([...g.frames[0].data], [...f1.data]);
  assert.deepEqual([...g.frames[1].data], [...f2.data]);
  assert.deepEqual(g.frames.map(f => f.delay), [10, 25]);
});

test('GIF: big frames exercise LZW table resets', () => {
  const noisy = img(200, 150, (x, y) => { const v = (x * 7919 + y * 104729) % 251; return [v, (v * 3) % 256, (v * 7) % 256, 255]; });
  const g = readGIF(encodeGIF([noisy]));
  assert.deepEqual([...g.frames[0].data], [...noisy.data]);
});

test('GIF: more than 256 colours are reduced per frame', () => {
  const many = img(40, 40, (x, y) => [x * 6, y * 6, 128, 255]);
  const g = readGIF(encodeGIF([many, many]));
  assert.equal(g.global, false);
  assert.equal(g.frames.length, 2);
});

test('ZIP: valid structure, CRCs and unique names', () => {
  const zip = createZip([{ name: 'a.txt', data: 'hello' }, { name: 'a.txt', data: new Uint8Array([1, 2, 3]) }, { name: 'dir/ü.txt', data: '' }]);
  const dv = new DataView(zip.buffer);
  const end = zip.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), 3);
  let o = dv.getUint32(end + 16, true);
  const names = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(dv.getUint32(o, true), 0x02014b50);
    const crc = dv.getUint32(o + 16, true), size = dv.getUint32(o + 20, true), nlen = dv.getUint16(o + 28, true), off = dv.getUint32(o + 42, true);
    const name = new TextDecoder().decode(zip.slice(o + 46, o + 46 + nlen));
    names.push(name);
    const lnlen = dv.getUint16(off + 26, true);
    const data = zip.slice(off + 30 + lnlen, off + 30 + lnlen + size);
    assert.equal(crc32(data), crc, name);
    o += 46 + nlen;
  }
  assert.deepEqual(names, ['a.txt', 'a-2.txt', 'dir/ü.txt']);
});

test('sprite sheets pack frames and describe them', () => {
  const frames = [0, 1, 2, 3, 4].map(i => ({ ...img(8, 6, () => [i * 50, 0, 0, 255]), name: `f${i}`, delay: 100 }));
  const { image, atlas } = packSpriteSheet(frames, { padding: 1 });
  assert.equal(atlas.meta.columns, 3);
  assert.equal(image.width, 3 * 8 + 2); assert.equal(image.height, 2 * 6 + 1);
  assert.deepEqual(atlas.frames.f4.frame, { x: 9, y: 7, w: 8, h: 6 });
  assert.equal(atlas.frames.f4.duration, 100);
  assert.equal(image.data[(7 * image.width + 9) * 4], 200);
});

test('tilesets dedupe tiles, optionally with flips', () => {
  // 4×1 tiles of 2×2: A, B, A, mirror(B)
  const A = [[1, 2], [3, 4]], B = [[5, 6], [7, 8]], Bm = [[6, 5], [8, 7]];
  const tiles = [A, B, A, Bm];
  const src = img(8, 2, (x, y) => [tiles[x >> 1][y][x & 1] * 20, 0, 0, 255]);
  const plain = buildTileset(src, { tileWidth: 2 });
  assert.equal(plain.count, 3);
  assert.deepEqual(plain.map.tiles, [0, 1, 0, 2]);
  const flipped = buildTileset(src, { tileWidth: 2, flips: true });
  assert.equal(flipped.count, 2);
  assert.deepEqual(flipped.map.tiles, [0, 1, 0, 1]);
  assert.deepEqual(flipped.map.flips, [0, 0, 0, 1]);
});

test('sniffVideoCodec names the codec of MP4 and WebM files', async () => {
  const { sniffVideoCodec } = await import('../lib/index.js');
  const mp4 = type => { const b = new Uint8Array(64); b.set([...'moov'].map(c => c.charCodeAt(0)), 4); const o = 20; b.set([...'stsd'].map(c => c.charCodeAt(0)), o); b.set([...type].map(c => c.charCodeAt(0)), o + 16); return new Blob([b]); };
  assert.equal(await sniffVideoCodec(mp4('hvc1')), 'H.265 (HEVC)');
  assert.equal(await sniffVideoCodec(mp4('avc1')), 'H.264');
  assert.equal(await sniffVideoCodec(mp4('av01')), 'AV1');
  assert.equal(await sniffVideoCodec(new Blob(['\x1aE\xdf\xa3 ... V_VP9 ...'])), 'VP9');
  assert.equal(await sniffVideoCodec(new Blob(['nothing useful'])), '');
});

test('resizeNearest: any target size, nearest pixel', async () => {
  const { resizeNearest } = await import('../lib/index.js');
  const src = img(2, 2, (x, y) => [x * 255, y * 255, 0, 255]);
  const out = resizeNearest(src, 5, 3);
  assert.equal(out.width, 5); assert.equal(out.height, 3);
  assert.deepEqual([...out.data.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...out.data.slice((2 * 5 + 4) * 4, (2 * 5 + 4) * 4 + 4)], [255, 255, 0, 255]);
  const png = readPNG(await encodePNG(src, { width: 7, height: 4 }));
  assert.equal(png.width, 7); assert.equal(png.height, 4);
});
