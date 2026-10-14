import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSettings, normalizeSettings, mergeSettings, resolveSize, encodeSettings, decodeSettings,
  settingsToJSON, settingsFromJSON, compactSettings, DITHER_METHODS, PALETTES, getPalette,
} from '../lib/index.js';

test('defaults are complete and stable', () => {
  const s = defaultSettings();
  assert.equal(s.version, 1);
  assert.equal(s.size.width, 96);
  assert.equal(s.palette.source, 'builtin');
  assert.equal(s.palette.colors.length, getPalette(s.palette.id).colors.length);
  assert.deepEqual(normalizeSettings(s), s);
});

test('normalize clamps and falls back instead of throwing', () => {
  const s = normalizeSettings({ size: { width: 99999, resample: 'bogus' }, dither: { method: 'nope', strength: 7 }, adjust: { gamma: 'x' }, outline: { color: 'red-ish' } });
  assert.equal(s.size.width, 2048);
  assert.equal(s.size.resample, 'box');
  assert.equal(s.dither.method, 'bayer4');
  assert.equal(s.dither.strength, 1);
  assert.equal(s.adjust.gamma, 1);
  assert.equal(s.outline.color, '#000000');
});

test('custom palettes keep valid colours only', () => {
  const s = normalizeSettings({ palette: { source: 'custom', colors: ['#fff', 'zzz', 'ABCDEF', [1, 2, 3]] } });
  assert.deepEqual(s.palette.colors, ['#ffffff', '#abcdef', '#010203']);
});

test('new groups normalise: frame, hue, export size', () => {
  const s = normalizeSettings({ frame: { aspect: '16:9', zoom: 2.5, x: 2 }, adjust: { hue: -45 }, export: { size: 'source' } });
  assert.deepEqual(s.frame, { aspect: '16:9', zoom: 2.5, x: 1, y: 0.5 });
  assert.equal(s.adjust.hue, -45);
  assert.equal(s.export.size, 'source');
  assert.equal(normalizeSettings({ export: { size: 'huge' } }).export.size, 'scale');
  assert.deepEqual(decodeSettings(encodeSettings(s)), s);
});

test('resolveSize keeps aspect, block mode divides', () => {
  assert.deepEqual(resolveSize(960, 640, { mode: 'width', width: 96, height: 0 }), { width: 96, height: 64 });
  assert.deepEqual(resolveSize(960, 640, { mode: 'width', width: 96, height: 10 }), { width: 96, height: 10 });
  assert.deepEqual(resolveSize(960, 640, { mode: 'block', block: 8 }), { width: 120, height: 80 });
});

test('mergeSettings patches one group at a time', () => {
  const s = mergeSettings(defaultSettings(), { dither: { strength: 0.25 } });
  assert.equal(s.dither.strength, 0.25);
  assert.equal(s.dither.method, 'bayer4');
});

test('share links round-trip and stay short', () => {
  const s = normalizeSettings({ size: { width: 128 }, palette: { source: 'custom', name: 'Mine', colors: ['#000000', '#ff0000'] }, dither: { method: 'custom', matrix: [[0, 2], [3, 1]] } });
  const code = encodeSettings(s);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSettings(code), s);
  assert.deepEqual(decodeSettings(`https://x.test/editor/#s=${code}`), s);
  assert.ok(encodeSettings(defaultSettings()).length < 16, 'defaults encode to almost nothing');
  const builtin = normalizeSettings({ palette: { id: 'pico-8' } });
  assert.equal(compactSettings(builtin).palette.colors, undefined, 'built-in colours are not stored');
  assert.deepEqual(decodeSettings(encodeSettings(builtin)), builtin);
});

test('settings JSON round-trips', () => {
  const s = normalizeSettings({ outline: { mode: 'outer', color: '#123456' }, export: { scale: 8 } });
  const json = settingsToJSON(s);
  assert.equal(JSON.parse(json).$schema, 'image-to-pixel/settings');
  assert.deepEqual(settingsFromJSON(json), s);
});

test('every dither method and palette is well formed', () => {
  assert.equal(DITHER_METHODS.length, 17);
  assert.equal(new Set(DITHER_METHODS.map(m => m.id)).size, DITHER_METHODS.length);
  assert.equal(PALETTES.length, 24);
  for (const p of PALETTES) {
    assert.match(p.id, /^[a-z0-9-]+$/);
    assert.ok(p.colors.length >= 2 && p.colors.length <= 256, p.id);
    for (const c of p.colors) assert.match(c, /^[0-9a-f]{6}$/, `${p.id} ${c}`);
  }
});
