// Checks the published bundles: they exist, load as ESM, CJS and a script global, and agree with the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const dist = f => new URL(`dist/${f}`, root);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

test('package.json is publishable', () => {
  assert.equal(pkg.license, 'MIT');
  assert.ok(existsSync(new URL('LICENSE', root)));
  assert.match(readFileSync(new URL('LICENSE', root), 'utf8'), /MIT License/);
  for (const k of ['main', 'module', 'types', 'unpkg']) assert.ok(existsSync(new URL(pkg[k], root)), `${k}: ${pkg[k]}`);
  for (const [k, v] of Object.entries(pkg.exports)) {
    if (typeof v === 'string') { if (!v.includes('*')) assert.ok(existsSync(new URL(v, root)), `${k}`); continue; }
    for (const f of Object.values(v)) assert.ok(existsSync(new URL(f, root)), `${k}: ${f}`);
  }
  assert.equal(pkg.scripts.test, 'npm run build:site && node --test', 'node --test without arguments');
});

test('every bundle was built', () => {
  for (const f of ['image-to-pixel.esm.js', 'image-to-pixel.cjs', 'image-to-pixel.js', 'image-to-pixel.min.js', 'image-to-pixel.bundle.esm.js', 'video.esm.js', 'editor.esm.js', 'editor.css'])
    assert.ok(existsSync(dist(f)), f);
  assert.match(readFileSync(dist('image-to-pixel.min.js'), 'utf8'), /^\/\*! image-to-pixel v3 \| MIT/);
});

test('ESM build matches the source API', async () => {
  const src = await import('../lib/index.js');
  const built = await import(dist('image-to-pixel.esm.js').href);
  assert.deepEqual(Object.keys(built).sort(), Object.keys(src).sort());
  const px = await built.createPixelator();
  const data = new Uint8ClampedArray(16 * 16 * 4).fill(200);
  const r = await px.process({ width: 16, height: 16, data }, { size: { width: 4 } });
  assert.equal(r.width, 4);
});

test('CJS build loads with require()', () => {
  const require = createRequire(import.meta.url);
  const m = require('../dist/image-to-pixel.cjs');
  assert.equal(typeof m.createPixelator, 'function');
  assert.equal(m.PALETTES.length, 24);
});

test('script build defines the ImageToPixel global', () => {
  for (const f of ['image-to-pixel.js', 'image-to-pixel.min.js']) {
    const ctx = { console, TextEncoder, TextDecoder, Uint8Array, atob, btoa };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(readFileSync(dist(f), 'utf8'), ctx);
    assert.equal(typeof ctx.ImageToPixel.createPixelator, 'function', f);
    assert.equal(typeof ctx.ImageToPixel.pixelate, 'function', f);
    assert.equal(ctx.ImageToPixel.VERSION, pkg.version);
  }
});

test('types cover every runtime export', () => {
  const dts = readFileSync(new URL('types/index.d.ts', root), 'utf8');
  return import('../lib/index.js').then(m => {
    for (const name of Object.keys(m)) assert.match(dts, new RegExp(`export (declare )?(function|const|type|interface) ${name}\\b`), name);
  });
});
