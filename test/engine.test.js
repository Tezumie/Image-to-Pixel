import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPixelator, makePlan, runCPU, normalizeSettings, parseColor, detectGrid, upscale, uniqueColors, DITHER_METHODS } from '../lib/index.js';
import { resample, removeOrphans, smoothMajority, outline, alphaCut } from '../lib/core/cpu/stages.js';

function gradient(w = 64, h = 48, alpha = false) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    data.set([x / (w - 1) * 255, y / (h - 1) * 255, 128, alpha && (x - w / 2) ** 2 + (y - h / 2) ** 2 > (h / 3) ** 2 ? 0 : 255], o);
  }
  return { width: w, height: h, data };
}
const pal = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];

test('Node uses the CPU backend and returns a result', async () => {
  const px = await createPixelator();
  assert.equal(px.backend, 'cpu');
  const r = await px.process(gradient(), { size: { width: 32 } });
  assert.equal(r.width, 32); assert.equal(r.height, 24);
  assert.equal(r.data.length, 32 * 24 * 4);
  assert.equal(r.backend, 'cpu');
  const png = await r.toPNG({ scale: 2 });
  assert.deepEqual([...png.slice(1, 4)].map(c => String.fromCharCode(c)).join(''), 'PNG');
});

test('every method only produces palette colours', () => {
  const src = gradient();
  for (const m of DITHER_METHODS) {
    const plan = makePlan({ size: { width: 40 }, palette: { source: 'custom', colors: pal }, dither: { method: m.id, strength: 1, matrix: [[0, 3], [2, 1]] } }, src);
    const px = runCPU(plan, src);
    const used = uniqueColors({ data: px });
    for (const c of used) assert.ok(pal.includes(c), `${m.id} produced ${c}`);
  }
});

test('dithering preserves average tone better than plain rounding', () => {
  const w = 64, h = 16, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([90, 90, 90, 255], i * 4);   // a grey no palette entry matches
  const src = { width: w, height: h, data };
  const mean = px => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i]; return s / (px.length / 4); };
  const run = (method, distance = 'rgb') => mean(runCPU(makePlan({ size: { width: w }, palette: { source: 'custom', colors: ['#000000', '#ffffff'], distance }, dither: { method, strength: 1 } }, src), src));
  assert.equal(run('none'), 0);
  for (const m of ['bayer8', 'bluenoise', 'floyd-steinberg', 'jarvis']) assert.ok(Math.abs(run(m) - 90) < 12, `${m}: ${run(m)}`);
  assert.ok(run('atkinson') > 40, 'atkinson keeps some tone');
  // perceptual matching moves the black/white boundary, so ordered patterns land a little lighter
  assert.ok(run('bayer8', 'oklab') > 90 && run('bayer8', 'oklab') < 130);
  assert.ok(Math.abs(run('floyd-steinberg', 'oklab') - 90) < 12, 'diffusion is driven by the error, not the boundary');
});

test('box resampling averages, nearest picks the centre', () => {
  const src = { width: 4, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]) };
  const box = resample(src, 1, 1, 'box');
  assert.ok(Math.abs(box[0] - 0.5) < 1e-6);
  const near = resample(src, 2, 1, 'nearest');
  assert.equal(near[0], 1); assert.equal(near[4], 1);
  // alpha-weighted: a transparent black pixel does not darken its neighbour
  const t = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]) };
  const r = resample(t, 1, 1, 'box');
  assert.equal(r[0], 1); assert.equal(r[3], 0.5);
});

test('alpha cut, outline and cleanup', () => {
  const buf = new Float32Array([0, 0, 0, 0.2, 0, 0, 0, 0.6]);
  alphaCut(buf, 0.5);
  assert.deepEqual([buf[3], buf[7]], [0, 1]);

  // 5×5 with an opaque 3×3 centre
  const w = 5, h = 5, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) px.set([200, 0, 0, 255], (y * w + x) * 4);
  const outer = outline(px.slice(), w, h, { mode: 'outer', color: [0, 0, 255], corners: false });
  assert.deepEqual([...outer.slice((0 * w + 2) * 4, (0 * w + 2) * 4 + 4)], [0, 0, 255, 255], 'edge above is outlined');
  assert.equal(outer[(0 * w + 0) * 4 + 3], 0, 'corner stays empty without diagonals');
  const outer8 = outline(px.slice(), w, h, { mode: 'outer', color: [0, 0, 255], corners: true });
  assert.equal(outer8[3], 255, 'corner filled with diagonals');
  const inner = outline(px.slice(), w, h, { mode: 'inner', color: [0, 255, 0], corners: false });
  assert.deepEqual([...inner.slice((2 * w + 2) * 4, (2 * w + 2) * 4 + 4)], [200, 0, 0, 255], 'centre untouched');
  assert.deepEqual([...inner.slice((1 * w + 1) * 4, (1 * w + 1) * 4 + 4)], [0, 255, 0, 255], 'edge recoloured');

  // a single stray pixel in a flat field
  const f = new Uint8ClampedArray(9 * 4);
  for (let i = 0; i < 9; i++) f.set([10, 10, 10, 255], i * 4);
  f.set([250, 250, 250, 255], 4 * 4);
  removeOrphans(f, 3, 3);
  assert.deepEqual([...f.slice(16, 20)], [10, 10, 10, 255]);
  const g = new Uint8ClampedArray(9 * 4);
  for (let i = 0; i < 9; i++) g.set(i < 6 ? [1, 1, 1, 255] : [9, 9, 9, 255], i * 4);
  g.set([9, 9, 9, 255], 4 * 4);                       // a speck in the middle of the light area
  smoothMajority(g, 3, 3);
  assert.deepEqual([...g.slice(4 * 4, 4 * 4 + 4)], [1, 1, 1, 255], 'the speck joins the majority');
  assert.deepEqual([...g.slice(7 * 4, 7 * 4 + 4)], [9, 9, 9, 255], 'the bottom row (edges clamped) keeps its colour');
});

test('extracted palettes are used and reported', async () => {
  const px = await createPixelator({ backend: 'cpu' });
  const r = await px.process(gradient(), { palette: { source: 'extract', count: 5 }, size: { width: 30 } });
  assert.equal(r.palette.length, 5);
  for (const c of r.usedColors()) assert.ok(r.palette.includes(c));
});

test('transparent pixels stay transparent', async () => {
  const px = await createPixelator({ backend: 'cpu' });
  const r = await px.process(gradient(64, 48, true), { size: { width: 64 } });
  assert.equal(r.data[3], 0);
  assert.equal(r.data[(24 * 64 + 32) * 4 + 3], 255);
});

test('palette none keeps colours, no dithering', async () => {
  const px = await createPixelator({ backend: 'cpu' });
  const r = await px.process(gradient(), { palette: { source: 'none' }, size: { width: 16 } });
  assert.equal(r.palette, null);
  assert.ok(r.usedColors().length > 50);
});

test('detectGrid recovers the scale of upscaled pixel art', () => {
  const small = { width: 6, height: 4, data: new Uint8ClampedArray(6 * 4 * 4) };
  for (let i = 0; i < 24; i++) small.data.set([(i * 37) % 255, (i * 91) % 255, (i * 13) % 255, 255], i * 4);
  assert.equal(detectGrid(upscale(small, 7)), 7);
  assert.equal(detectGrid(gradient()), 1);
  const plan = makePlan({ size: { mode: 'block', block: 7, resample: 'nearest' }, palette: { source: 'none' } }, upscale(small, 7));
  const back = runCPU(plan, upscale(small, 7));
  assert.deepEqual([...back], [...small.data], 'block + nearest restores the original pixels');
});

test('parseColor', () => {
  assert.deepEqual(parseColor('#abc'), [170, 187, 204]);
  assert.throws(() => parseColor('nope'));
  assert.equal(normalizeSettings({}).palette.colors[0].length, 7);
});

test('cropRect: largest rectangle of the aspect, divided by zoom, placed by x/y', async () => {
  const { cropRect } = await import('../lib/index.js');
  assert.deepEqual(cropRect(960, 640, { aspect: 'original' }), { x: 0, y: 0, w: 960, h: 640 });
  assert.deepEqual(cropRect(960, 640, { aspect: '1:1' }), { x: 160, y: 0, w: 640, h: 640 });
  assert.deepEqual(cropRect(960, 640, { aspect: '1:1', x: 0 }), { x: 0, y: 0, w: 640, h: 640 });
  assert.deepEqual(cropRect(960, 640, { aspect: '16:9', y: 1 }), { x: 0, y: 100, w: 960, h: 540 });
  assert.deepEqual(cropRect(960, 640, { aspect: 'original', zoom: 2, x: 1, y: 0 }), { x: 480, y: 0, w: 480, h: 320 });
  assert.deepEqual(cropRect(1080, 1920, { aspect: '1:1' }), { x: 0, y: 420, w: 1080, h: 1080 });
});

test('framing equals processing a pre-cropped copy', () => {
  const src = gradient(90, 60);
  const crop = { x: 15, y: 0, w: 60, h: 60 };
  const copy = { width: 60, height: 60, data: new Uint8ClampedArray(60 * 60 * 4) };
  for (let y = 0; y < 60; y++) copy.data.set(src.data.subarray((y * 90 + 15) * 4, (y * 90 + 75) * 4), y * 60 * 4);
  const settings = { size: { width: 20 }, palette: { source: 'custom', colors: pal }, dither: { method: 'floyd-steinberg' } };
  const a = runCPU(makePlan({ ...settings, frame: { aspect: '1:1' } }, src), src);
  const b = runCPU(makePlan(settings, copy), copy);
  assert.deepEqual([...a], [...b]);
  assert.deepEqual(makePlan({ frame: { aspect: '1:1' } }, src).crop, crop);
});

test('hue: 0 and 360-equivalent do nothing, 180 changes colours but keeps grey', async () => {
  const { adjust } = await import('../lib/core/cpu/stages.js');
  const px = () => new Float32Array([0.8, 0.2, 0.1, 1, 0.5, 0.5, 0.5, 1]);
  const turned = adjust(px(), { hue: 180 });
  assert.ok(Math.abs(turned[0] - 0.8) > 0.2, 'red is no longer red');
  for (let k = 4; k < 7; k++) assert.ok(Math.abs(turned[k] - 0.5) < 1e-6, 'grey stays grey');
  const zero = adjust(px(), { hue: 0 });
  assert.deepEqual([...zero], [...px()]);
  assert.equal(normalizeSettings({ adjust: { hue: 999 } }).adjust.hue, 180);
  assert.deepEqual(normalizeSettings({ frame: { aspect: 'bogus', zoom: 50 } }).frame, { aspect: 'original', zoom: 8, x: 0.5, y: 0.5 });
});
