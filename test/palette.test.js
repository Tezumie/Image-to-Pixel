import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePalette, toGPL, toHexFile, toPaletteJSON, extractPalette, lospecSlug, fetchLospec, thresholdMap, parseMatrix, bayer, KERNELS } from '../lib/index.js';
import { kernelSkew, waveCount } from '../lib/core/dither/kernels.js';

const GPL = `GIMP Palette
Name: Test Pal
Columns: 4
#
  0   0   0\tblack
255 255 255\twhite
 18  52  86
`;

test('parses .gpl', () => {
  assert.deepEqual(parsePalette(GPL, 'x.gpl'), { name: 'Test Pal', colors: ['#000000', '#ffffff', '#123456'] });
});
test('parses .hex, Paint.NET .txt, JASC .pal, JSON and loose text', () => {
  assert.deepEqual(parsePalette('ff0000\n00ff00\n', 'p.hex').colors, ['#ff0000', '#00ff00']);
  assert.deepEqual(parsePalette('; paint.net\nFFFF0000\nFF0000FF\n', 'p.txt').colors, ['#ff0000', '#0000ff']);
  assert.deepEqual(parsePalette('JASC-PAL\n0100\n2\n1 2 3\n4 5 6\n', 'p.pal').colors, ['#010203', '#040506']);
  assert.deepEqual(parsePalette('{"name":"L","colors":["aabbcc","112233"]}').colors, ['#aabbcc', '#112233']);
  assert.deepEqual(parsePalette('["#aabbcc", "#112233"]').colors, ['#aabbcc', '#112233']);
  assert.deepEqual(parsePalette('Colours: #ff8800, #0088ff and #ff8800.').colors, ['#ff8800', '#0088ff']);
  assert.throws(() => parsePalette('nothing here'), /No colours/);
});
test('writers round-trip through the parser', () => {
  const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff'];
  assert.deepEqual(parsePalette(toGPL('Four', colors), 'f.gpl'), { name: 'Four', colors });
  assert.deepEqual(parsePalette(toHexFile(colors), 'f.hex').colors, colors);
  assert.deepEqual(parsePalette(toPaletteJSON('Four', colors), 'f.json'), { name: 'Four', colors });
});
test('extractPalette finds the dominant colours, deterministically', () => {
  const w = 40, h = 40, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = i % w < 20 ? [200, 30, 30] : (i / w < 20 ? [20, 20, 220] : [240, 240, 240]);
    data.set([...c, 255], i * 4);
  }
  const a = extractPalette({ width: w, height: h, data }, 3);
  assert.deepEqual(a.slice().sort(), ['#1414dc', '#c81e1e', '#f0f0f0'].sort());
  assert.deepEqual(extractPalette({ width: w, height: h, data }, 3), a);
});
test('lospec slugs and fetch', async () => {
  assert.equal(lospecSlug('https://lospec.com/palette-list/rgbg-36'), 'rgbg-36');
  assert.equal(lospecSlug('Endesga-32.json'), 'endesga-32');
  const fake = async url => ({ ok: true, json: async () => ({ name: 'Fake', author: 'me', colors: ['000000', 'ffffff'], url }) });
  const p = await fetchLospec('fake-2', { fetch: fake });
  assert.deepEqual(p, { name: 'Fake', author: 'me', colors: ['#000000', '#ffffff'], slug: 'fake-2' });
  await assert.rejects(fetchLospec('../etc', { fetch: fake }), /slug/);
});
test('threshold maps are permutations', () => {
  for (const id of ['bayer2', 'bayer4', 'bayer8', 'bayer16', 'cluster4', 'cluster8', 'lines']) {
    const m = thresholdMap(id);
    assert.equal(m.values.length, m.w * m.h);
    assert.deepEqual([...m.values].sort((a, b) => a - b), Array.from({ length: m.levels }, (_, i) => i), id);
  }
  const bn = thresholdMap('bluenoise');
  assert.equal(bn.values.length, 64 * 64);
  const hist = new Array(256).fill(0); for (const v of bn.values) hist[v]++;
  assert.ok(hist.every(n => n === 16), 'blue noise is evenly distributed');
  assert.deepEqual(bayer(2), [[0, 2], [3, 1]]);
  assert.deepEqual(parseMatrix('[0, 2]\n[3, 1]\n/ 4'), [[0, 2], [3, 1]]);
  assert.throws(() => parseMatrix('1 2\n3'), /same number/);
});
test('diffusion kernels sum to ≤ 1 and have the right wavefront skew', () => {
  const skews = {};
  for (const [id, k] of Object.entries(KERNELS)) {
    const sum = k.reduce((s, [, , w]) => s + w, 0);
    assert.ok(sum <= 1 + 1e-9, id);
    skews[id] = kernelSkew(k);
    // every push lands on a later wave
    for (const [dx, dy] of k) assert.ok(dx + skews[id] * dy > 0, `${id} ${dx},${dy}`);
  }
  assert.equal(skews['floyd-steinberg'], 2);
  assert.equal(skews.jarvis, 3);
  assert.equal(waveCount(96, 64, 2), 96 + 2 * 63);
});
