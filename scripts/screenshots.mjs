// Screenshot the built site in a headless browser (dark and light) and fail on console errors.
//   npm run build:site && npm run screenshots
// Needs Playwright: `npm i -D playwright && npx playwright install chromium`
// (or set PLAYWRIGHT_MODULE to an existing install). Output: _screenshots/

import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SHOTS = join(ROOT, '_screenshots');
const BASE = '/Image-to-Pixel/';

let playwright;
try {
  playwright = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
if (!existsSync(OUT)) { console.error('Run `npm run build:site` first.'); process.exit(1); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!url.startsWith(BASE)) { res.writeHead(404); return res.end(); }
  let f = normalize(join(OUT, url.slice(BASE.length)));
  try { if (statSync(f).isDirectory()) f = join(f, 'index.html'); } catch { /* */ }
  if (!f.startsWith(OUT) || !existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const origin = `http://localhost:${server.address().port}${BASE}`;

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

async function shot(name, path, { theme = 'dark', width = 1440, height = 900, prepare } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript(t => { try { localStorage.setItem('itp:theme', JSON.stringify(t)); } catch { /* */ } }, theme);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|GPU stall|GL Driver/.test(m.text())) problems.push(`${name}: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  await page.goto(origin + path, { waitUntil: 'networkidle' });
  if (prepare) await prepare(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`) });
  await ctx.close();
}

const editorReady = async (page, sample) => {
  await page.waitForFunction(() => window.itpEditor, null, { timeout: 30000 });
  if (sample) {
    await page.evaluate(s => window.itpEditor.openSample(s), sample);
    await page.waitForFunction(() => window.itpEditor.result, null, { timeout: 30000 });
    await page.evaluate(() => window.itpEditor.idle());
  }
};

for (const theme of ['dark', 'light']) {
  await shot('landing', '', { theme, prepare: p => p.waitForFunction(() => document.querySelector('.demo-meta')?.textContent) });
  await shot('editor-empty', 'editor/', { theme, prepare: p => editorReady(p) });
  await shot('editor', 'editor/', { theme, prepare: p => editorReady(p, 'dusk') });
  await shot('editor-compare', 'editor/', {
    theme, prepare: async p => {
      await editorReady(p, 'still-life');
      await p.keyboard.press('c');
      await p.evaluate(() => window.itpEditor.store.update({ dither: { method: 'floyd-steinberg' }, palette: { source: 'builtin', id: 'resurrect-64' } }));
      await p.evaluate(() => window.itpEditor.idle());
    },
  });
  await shot('editor-sprite', 'editor/', {
    theme, prepare: async p => {
      await editorReady(p, 'potion');
      await p.evaluate(() => window.itpEditor.applyPreset('sprite'));
      await p.evaluate(() => window.itpEditor.idle());
      await p.click('text=Cleanup & outline');
    },
  });
  await shot('editor-presets', 'editor/', {
    theme, prepare: async p => {
      await editorReady(p, 'dusk');
      await p.click('.itp-lib [role=tab]:nth-child(2)');
      await p.waitForFunction(() => document.querySelectorAll('.itp-preset canvas').length >= 9, null, { timeout: 60000 });
    },
  });
  await shot('editor-export', 'editor/', { theme, prepare: async p => { await editorReady(p, 'dusk'); await p.click('#itp-tab-export'); } });
  await shot('docs', 'docs/library/', { theme });
  await shot('examples', 'examples/', { theme, prepare: p => p.waitForTimeout(1500) });
}
await shot('editor-tablet', 'editor/', { width: 820, height: 1180, prepare: p => editorReady(p, 'dusk') });
await shot('editor-phone', 'editor/', { width: 390, height: 844, prepare: p => editorReady(p, 'dusk') });
await shot('landing-phone', '', { width: 390, height: 844, theme: 'light' });
await shot('example-basic', 'examples/basic/', { prepare: p => p.waitForFunction(() => document.getElementById('info')?.textContent) });

// ---- end-to-end flows in the editor: batch ZIP, PNG, tileset, video (made in the page with our own encoder) → GIF and WebM
{
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`flows: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) problems.push(`flows: ${m.text()}`); });
  await page.goto(origin + 'editor/', { waitUntil: 'networkidle' });
  await editorReady(page, 'dusk');
  const download = async (fn) => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.evaluate(fn)]);
    const path = join(SHOTS, `download-${d.suggestedFilename()}`);
    await d.saveAs(path);
    return { name: d.suggestedFilename(), size: statSync(path).size };
  };
  const got = [];
  got.push(await download(() => window.itpEditor.app.exportPNG()));
  got.push(await download(() => window.itpEditor.app.exportTileset({ tile: 16, flips: true })));
  await page.evaluate(async () => { await window.itpEditor.openSample('still-life'); await window.itpEditor.openSample('potion'); });
  // per-file settings: the potion gets its own look, the others keep the shared one
  const perFile = await page.evaluate(async () => {
    const { app, store } = window.itpEditor;
    app.setOwn(app.current, true);
    store.update({ dither: { method: 'atkinson' }, frame: { aspect: '1:1' } });
    await window.itpEditor.idle();
    return app.items.map(i => `${app.settingsFor(i).dither.method}/${app.settingsFor(i).frame.aspect}${i.own ? '*' : ''}`).join(' ');
  });
  if (perFile !== 'bayer4/original bayer4/original atkinson/1:1*') problems.push(`flows: per-file settings wrong: ${perFile}`);
  got.push(await download(() => window.itpEditor.app.exportZip()));
  got.push(await download(() => window.itpEditor.app.exportAnimation({ source: 'files', format: 'gif', fps: 4, start: 0, end: 0 })));
  got.push(await download(() => window.itpEditor.app.exportSheet({ source: 'files', format: 'gif', fps: 4, columns: 0, padding: 1 })));
  // make a short WebM in the page, open it as a video, export it
  const madeVideo = await page.evaluate(async () => {
    const { createVideoEncoder, videoSupport } = await import('../lib/video.esm.js');
    const sup = await videoSupport(160, 120);
    if (!sup.webm) return false;
    const enc = await createVideoEncoder({ format: 'webm', fps: 10, width: 160, height: 120 });
    for (let i = 0; i < 20; i++) {
      const data = new Uint8ClampedArray(160 * 120 * 4);
      for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) data.set([(x + i * 8) % 160 * 1.6, y * 2, (i * 12) % 255, 255], (y * 160 + x) * 4);
      await enc.add({ width: 160, height: 120, data });
    }
    const blob = await enc.finish();
    await window.itpEditor.addFiles([new File([blob], 'clip.webm', { type: 'video/webm' })]);
    await window.itpEditor.idle();
    return true;
  });
  if (madeVideo) {
    await page.waitForFunction(() => window.itpEditor.app.current?.type === 'video' && window.itpEditor.result, null, { timeout: 30000 });
    await page.keyboard.press('.'); await page.keyboard.press('.');
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, 'editor-video-dark.png') });
    got.push(await download(() => window.itpEditor.app.exportAnimation({ source: 'video', format: 'gif', fps: 10, start: 0, end: 2 })));
    got.push(await download(() => window.itpEditor.app.exportAnimation({ source: 'video', format: 'webm', fps: 10, start: 0, end: 2 })));
    // MP4 needs an H.264 encoder, which open-source Chromium builds may not have
    if (await page.evaluate(async () => (await (await import('../lib/video.esm.js')).videoSupport(160, 120)).mp4)) {
      got.push(await download(() => window.itpEditor.app.exportAnimation({ source: 'video', format: 'mp4', fps: 10, start: 0, end: 2 })));
    } else console.log('MP4 export skipped: this browser has no H.264 encoder');
    got.push(await download(() => window.itpEditor.app.exportAnimation({ source: 'video', format: 'png-seq', fps: 5, start: 0, end: 1 })));
  } else problems.push('flows: this browser cannot encode WebM, video flow skipped');
  for (const g of got) if (!g.size) problems.push(`flows: empty download ${g.name}`);
  console.log('downloads: ' + got.map(g => `${g.name} (${(g.size / 1024).toFixed(1)} KB)`).join(', '));
  await ctx.close();
}

// ---- GPU (ShaderMate) vs CPU: the two backends must produce the same pixels
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`parity: ${e.message}`));
  await page.goto(origin + 'examples/', { waitUntil: 'networkidle' });
  const rows = await page.evaluate(async () => {
    const I = await import('../lib/image-to-pixel.bundle.esm.js');
    const w = 173, h = 131, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      data[o] = (Math.sin(x * 0.07) * 0.5 + 0.5) * 255; data[o + 1] = y / h * 255; data[o + 2] = ((x ^ y) & 63) * 4;
      data[o + 3] = (x - 80) ** 2 + (y - 60) ** 2 < 2500 ? 255 : (x < 20 ? 0 : 255);
    }
    const src = { width: w, height: h, data };
    const gpu = await I.createPixelator({ backend: 'webgl', diffusion: 'gpu' });
    const cpu = await I.createPixelator({ backend: 'cpu' });
    const cases = [
      {}, { dither: { method: 'none' } }, { dither: { method: 'bayer8' } }, { dither: { method: 'bluenoise' } }, { dither: { method: 'cluster8' } },
      { dither: { method: 'custom', matrix: [[3, 1], [0, 2]] } },
      { dither: { method: 'floyd-steinberg' } }, { dither: { method: 'atkinson' } }, { dither: { method: 'jarvis' } }, { dither: { method: 'sierra' } },
      { palette: { source: 'none' } }, { palette: { source: 'extract', count: 12 }, dither: { method: 'stucki' } },
      { size: { width: 40, resample: 'nearest' }, cleanup: { orphans: true, smooth: true }, outline: { mode: 'outer', corners: true } },
      { size: { width: 64 }, outline: { mode: 'inner', color: '#ff0000' }, adjust: { brightness: 0.1, contrast: 0.3, saturation: -0.5, gamma: 1.4 }, palette: { distance: 'rgb' } },
      { size: { mode: 'block', block: 3 }, dither: { method: 'burkes' } },
      { frame: { aspect: '1:1', zoom: 1.5, x: 0.2, y: 0.8 }, adjust: { hue: 120 }, dither: { method: 'bayer4' } },
      { frame: { aspect: '9:16' }, size: { width: 30 }, adjust: { hue: -60, saturation: 0.3 }, dither: { method: 'atkinson' } },
    ];
    const out = [];
    for (const s of cases) {
      const a = await gpu.process(src, s), b = await cpu.process(src, s);
      let diff = 0, maxDelta = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        let d = 0; for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.data[i + k] - b.data[i + k]));
        if (d) diff++; maxDelta = Math.max(maxDelta, d);
      }
      out.push({ settings: JSON.stringify(s), backend: a.backend, size: `${a.width}x${a.height}`, diffPct: diff / (a.width * a.height) * 100, maxDelta, kind: a.kind, quantize: !!a.palette });
    }
    return out;
  });
  for (const r of rows) {
    // palette 'none' keeps raw colours: ±1 rounding on exact .5 averages is allowed
    const ok = r.backend === 'webgl' && (r.quantize ? r.diffPct <= (r.kind === 'diffusion' ? 0.5 : 0) : r.maxDelta <= 1);
    if (!ok) problems.push(`GPU/CPU mismatch: ${r.settings} → ${r.diffPct.toFixed(3)}% pixels differ (max Δ ${r.maxDelta}, backend ${r.backend})`);
  }
  console.log(`GPU/CPU parity: ${rows.filter(r => r.diffPct === 0).length}/${rows.length} identical, the rest within tolerance`);
  await ctx.close();
}

await browser.close();
server.close();
if (problems.length) { console.error('Console errors:\n' + problems.join('\n')); process.exit(1); }
console.log(`screenshots written to _screenshots/`);
