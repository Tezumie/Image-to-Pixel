// Link checker for the built site (run `npm run build:site` first; `npm test` does).
// Every href/src must be relative and resolve to a file inside _site/, so the site works under any sub-path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../_site/', import.meta.url));

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = existsSync(SITE) ? walk(SITE) : [];
const pages = files.filter(f => f.endsWith('.html'));
const rel = f => relative(SITE, f).split(sep).join('/');

test('the site was built', () => {
  assert.ok(pages.length > 20, `found ${pages.length} pages; run npm run build:site`);
  for (const p of ['index.html', 'editor/index.html', 'docs/index.html', 'docs/library/index.html', 'examples/index.html', 'examples/basic/index.html', '404.html', 'classic/index.html', 'classic/image-to-pixel.js', '.nojekyll'])
    assert.ok(existsSync(join(SITE, p)), p);
});

test('the classic editor is copied byte for byte', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const f of ['index.html', 'image-to-pixel.js', 'css/main.css', 'src/picker.js'])
    assert.equal(readFileSync(join(SITE, 'classic', f), 'utf8'), readFileSync(join(root, f), 'utf8'), f);
});

test('every page has a title, a language and one h1', () => {
  for (const p of pages.filter(p => !rel(p).startsWith('classic/'))) {
    const html = readFileSync(p, 'utf8');
    assert.match(html, /<html lang="en">/, rel(p));
    assert.match(html, /<title>[^<]+<\/title>/, rel(p));
    if (!/editor\/index\.html$/.test(rel(p))) assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${rel(p)} h1 count`);
  }
});

test('all links are relative and resolve', () => {
  const broken = [];
  for (const p of pages) {
    if (rel(p).startsWith('classic/')) continue;      // unchanged 2.x page, external CDN links only
    const html = readFileSync(p, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => (/\ssrc=/.test(m.split('>')[0]) ? m.split('>')[0] + '>' : ''))
      .replace(/<pre[\s\S]*?<\/pre>/gi, '');
    const re = /\s(href|src)="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[2];
      if (/^(https?:|mailto:|data:|#|javascript:)/.test(url)) continue;
      if (url.startsWith('/')) { broken.push(`${rel(p)}: absolute link ${url}`); continue; }
      const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
      if (!clean) continue;
      let target = join(dirname(p), clean);
      if (clean.endsWith('/')) target = join(target, 'index.html');
      if (!target.startsWith(SITE)) { broken.push(`${rel(p)}: escapes the site: ${url}`); continue; }
      if (!existsSync(target)) broken.push(`${rel(p)}: ${url}`);
      else if (statSync(target).isDirectory() && !existsSync(join(target, 'index.html'))) broken.push(`${rel(p)}: ${url} (directory without index.html)`);
    }
  }
  assert.deepEqual(broken, []);
});

test('url() references in stylesheets resolve', () => {
  const broken = [];
  for (const css of files.filter(f => f.endsWith('.css'))) {
    for (const [, raw] of readFileSync(css, 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(raw)) continue;
      if (!existsSync(join(dirname(css), raw.split(/[?#]/)[0]))) broken.push(`${rel(css)}: ${raw}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('in-page anchors exist', () => {
  const missing = [];
  for (const p of pages.filter(p => rel(p).startsWith('docs/'))) {
    const html = readFileSync(p, 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(id)) missing.push(`${rel(p)}#${id}`);
  }
  assert.deepEqual(missing, []);
});

test('module scripts and stylesheets referenced by pages exist', () => {
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    for (const [, src] of html.matchAll(/import [^;]*? from '([^']+)'/g)) {
      if (/^https?:/.test(src) || !src.startsWith('.')) continue;
      assert.ok(existsSync(join(dirname(p), src)), `${rel(p)} imports ${src}`);
    }
  }
});

test('docs cover every editor feature area', () => {
  const docs = readdirSync(join(SITE, 'docs')).filter(d => statSync(join(SITE, 'docs', d)).isDirectory());
  for (const d of ['getting-started', 'editor', 'size', 'palettes', 'dithering', 'adjust-cleanup', 'batch', 'video', 'export', 'sharing', 'shortcuts', 'library', 'settings', 'video-api', 'embedding', 'how-it-works', 'migrating', 'contributing'])
    assert.ok(docs.includes(d), d);
});
