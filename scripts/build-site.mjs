// Builds the static site into _site/ (what GitHub Pages serves).
//   node scripts/build-site.mjs        (run `npm run build` first, or use `npm run build:site`)
// Every link is relative, so the site works at any sub-path (/Image-to-Pixel/) or from a plain folder.

import { esbuild } from './esbuild.mjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { copy, isDir, countFiles } from './fsutil.mjs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, frontMatter, esc } from './markdown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const OUT = join(ROOT, process.env.SITE_OUT || '_site');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const REPO = 'https://github.com/Tezumie/Image-to-Pixel';

const write = (rel, content) => { const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content); };
const read = rel => readFileSync(join(SITE, rel), 'utf8');
const up = depth => (depth ? '../'.repeat(depth) : './');

// ---------------------------------------------------------------- shell
const NAV = [['editor/', 'Editor'], ['docs/', 'Docs'], ['examples/', 'Examples']];

function page({ title, description = pkg.description, depth, body, active = '', scripts = [], styles = [], bodyClass = '' }) {
  const r = up(depth);
  const nav = NAV.map(([href, label]) => `<a href="${r}${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="${r}assets/favicon.svg" type="image/svg+xml">
<script>try{var t=JSON.parse(localStorage.getItem('itp:theme'));if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="${r}assets/site.css">
${styles.map(s => `<link rel="stylesheet" href="${r}${s}">`).join('\n')}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-top">
  <a class="brand" href="${r}"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span>Image-to-Pixel</span></a>
  <nav class="site-nav" aria-label="Main">${nav}</nav>
  <div class="site-actions">
    <a class="icon-link" href="${REPO}" aria-label="Source on GitHub" title="Source on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.2c0-1 .1-1.4-.5-2 2.6-.3 5.5-1.3 5.5-5.8a4.5 4.5 0 0 0-1.2-3.1 4.2 4.2 0 0 0-.1-3.1s-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C6.6 3.5 5.6 3.8 5.6 3.8a4.2 4.2 0 0 0-.1 3.1A4.5 4.5 0 0 0 4.3 10c0 4.5 2.9 5.5 5.5 5.8-.6.6-.6 1.2-.5 2V21"/></svg></a>
    <button class="icon-link theme-toggle" type="button" aria-label="Toggle theme" title="Toggle theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z"/></svg></button>
  </div>
</header>
${body}
<script src="${r}assets/site.js"></script>
${scripts.map(s => `<script type="module" src="${r}${s}"></script>`).join('\n')}
</body>
</html>
`;
}

const footer = depth => `<footer class="site-foot"><div class="wrap">
  <span>Image-to-Pixel ${pkg.version}. MIT licence.</span>
  <span class="links"><a href="${up(depth)}docs/">Docs</a><a href="${up(depth)}examples/">Examples</a><a href="${up(depth)}classic/">Classic editor</a><a href="${REPO}">GitHub</a></span>
</div></footer>`;

// ---------------------------------------------------------------- build
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// bundles: one build per output file, array entryPoints + outfile, no code splitting.
// That's the subset every esbuild flavour handles (native, esbuild-wasm, in-browser IDE shims).
const bundle = (entry, outfile, opts = {}) => esbuild.build({
  entryPoints: [entry], outfile: join(OUT, outfile), bundle: true, minify: true, logLevel: 'warning', ...opts,
});
const pageJS = { format: 'esm', sourcemap: true, target: 'es2022', external: ['node:*'] };
await bundle(join(SITE, 'assets/editor-page.js'), 'assets/editor.js', pageJS);
await bundle(join(SITE, 'assets/landing.js'), 'assets/landing.js', pageJS);
await bundle(join(SITE, 'assets/gallery.js'), 'assets/gallery.js', pageJS);
await bundle(join(SITE, 'assets/site.js'), 'assets/site.js', { format: 'iife', target: 'es2018' });
// fonts stay as plain url("fonts/…") references and are copied next to the CSS below,
// rather than emitted by esbuild's file loader
const css = { external: ['*.woff2'] };
await bundle(join(SITE, 'assets/site.css'), 'assets/site.css', css);
await bundle(join(ROOT, 'lib/editor/styles/editor.css'), 'assets/editor.css', css);
copy(join(ROOT, 'lib/editor/styles/fonts'), join(OUT, 'assets/fonts'));

// static assets
for (const f of readdirSync(join(SITE, 'assets'))) {
  if (/\.(svg|png|ico|webmanifest|jpg)$/.test(f)) copy(join(SITE, 'assets', f), join(OUT, 'assets', f));
}
// sample images as files, for the examples
const { SAMPLES } = await import('../lib/editor/samples.js');
for (const smp of SAMPLES) write(`assets/samples/${smp.id}.svg`, smp.svg);
// library builds, for examples and anyone who wants to grab them from the site
if (!existsSync(join(ROOT, 'dist/image-to-pixel.js'))) throw new Error('dist/ is missing: run `npm run build` first');
mkdirSync(join(OUT, 'lib'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'dist'))) if (/\.(js|css|cjs)$/.test(f)) copy(join(ROOT, 'dist', f), join(OUT, 'lib', f));
copy(join(ROOT, 'lib/editor/styles/fonts'), join(OUT, 'lib/fonts'));

// ---- landing
write('index.html', page({
  title: 'Image-to-Pixel: turn images and video into pixel art',
  description: 'A free, open-source pixel-art editor and library. Dithering, palettes, batch and video, in your browser on the GPU.',
  depth: 0, active: '', body: read('index.html').replace(/\{\{root\}\}/g, './').replace('{{footer}}', footer(0)).replace(/\{\{version\}\}/g, pkg.version),
  scripts: ['assets/landing.js'], bodyClass: 'landing',
}));

// ---- editor
write('editor/index.html', page({
  title: 'Editor · Image-to-Pixel', description: 'Turn images and video into pixel art in your browser.',
  depth: 1, active: 'editor/', body: read('editor/index.html'), styles: ['assets/editor.css'], scripts: ['assets/editor.js'], bodyClass: 'app',
}));

// ---- docs
const docs = readdirSync(join(SITE, 'docs')).filter(f => f.endsWith('.md')).map(f => {
  const { data, body } = frontMatter(readFileSync(join(SITE, 'docs', f), 'utf8'));
  return { slug: f.replace(/\.md$/, ''), ...data, body };
});
const GROUPS = ['Start', 'Editor', 'Library', 'Project'];
docs.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order ?? 99) - (b.order ?? 99));
const pages = docs.filter(d => d.slug !== 'index');

function docNav(current, depth) {
  const r = up(depth);
  return GROUPS.map(g => {
    const list = pages.filter(p => p.group === g);
    if (!list.length) return '';
    return `<div class="nav-group"><div class="nav-label">${g}</div>${list.map(p => `<a href="${r}docs/${p.slug}/"${p.slug === current ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('')}</div>`;
  }).join('');
}

for (const d of docs) {
  const isIndex = d.slug === 'index';
  const depth = isIndex ? 1 : 2;
  const { html, toc, h1 } = renderMarkdown(d.body);
  const idx = pages.indexOf(d);
  const prev = idx > 0 ? pages[idx - 1] : null, next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;
  const r = up(depth);
  const pager = isIndex ? '' : `<nav class="pager" aria-label="Pages">${prev ? `<a class="prev" href="${r}docs/${prev.slug}/"><small>Previous</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${r}docs/${next.slug}/"><small>Next</small>${esc(next.title)}</a>` : ''}</nav>`;
  // links in the markdown are written relative to docs/<slug>/; the index lives one level up
  const content = isIndex ? html.replace(/href="\.\.\//g, 'href="') : html;
  const body = `<div class="docs" id="main">
  <button class="docs-menu" type="button" aria-expanded="false" aria-controls="docs-nav">Menu</button>
  <nav class="docs-nav" id="docs-nav" aria-label="Documentation">${docNav(d.slug, depth)}</nav>
  <article class="prose">
    <header class="doc-head"><p class="crumb">${esc(d.group || 'Docs')}</p><h1>${esc(h1 || d.title)}</h1>${d.description ? `<p class="lede">${esc(d.description)}</p>` : ''}</header>
    ${content}
    ${pager}
  </article>
  ${toc.length > 2 ? `<aside class="toc" aria-label="On this page"><div class="nav-label">On this page</div>${toc.map(t => `<a class="d${t.depth}" href="#${t.id}">${esc(t.text)}</a>`).join('')}</aside>` : '<aside class="toc"></aside>'}
</div>${footer(depth)}`;
  write(isIndex ? 'docs/index.html' : `docs/${d.slug}/index.html`, page({ title: `${d.title} · Image-to-Pixel docs`, description: d.description, depth, body, active: 'docs/' }));
}

// ---- examples
const exDir = join(SITE, 'examples');
const examples = readdirSync(exDir).filter(n => isDir(join(exDir, n))).map(n => ({ slug: n, ...JSON.parse(readFileSync(join(exDir, n, 'example.json'), 'utf8')) }))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
for (const ex of examples) {
  copy(join(exDir, ex.slug), join(OUT, 'examples', ex.slug), src => !src.endsWith('example.json'));
  const htmlFile = join(OUT, 'examples', ex.slug, 'index.html');
  const inner = readFileSync(htmlFile, 'utf8');
  // examples are authored as plain bodies; wrap them in the site shell
  if (!/^<!doctype/i.test(inner.trim())) {
    const body = `<main class="example" id="main"><div class="wrap">
  <p class="crumb"><a href="../">Examples</a></p>
  <h1>${esc(ex.title)}</h1><p class="lede">${esc(ex.description)}</p>
  ${inner}
  <details class="source"><summary>Source</summary><figure class="code"><pre><code>${esc(inner.trim())}</code></pre><button class="copy" type="button" aria-label="Copy code">Copy</button></figure></details>
</div></main>${footer(2)}`;
    writeFileSync(htmlFile, page({ title: `${ex.title} · Image-to-Pixel examples`, description: ex.description, depth: 2, body, active: 'examples/', bodyClass: 'example-page' }));
  }
}
const cards = examples.map(ex => `<a class="ex-card" href="${ex.slug}/">
  <canvas class="ex-thumb" width="160" height="120" data-preset='${esc(JSON.stringify(ex.preview || {}))}' data-sample="${esc(ex.sample || 'dusk')}" aria-hidden="true"></canvas>
  <span class="t">${esc(ex.title)}</span><span class="d">${esc(ex.description)}</span>
  <span class="tags">${(ex.tags || []).map(t => `<span>${esc(t)}</span>`).join('')}</span>
</a>`).join('\n');
write('examples/index.html', page({
  title: 'Examples · Image-to-Pixel', description: 'Small, copyable examples of the Image-to-Pixel library.', depth: 1, active: 'examples/',
  body: `<main class="gallery" id="main"><div class="wrap"><h1>Examples</h1><p class="lede">Each one is a single HTML page using the library from <code>lib/</code>. Thumbnails are rendered live with the engine.</p><div class="ex-grid">${cards}</div></div></main>${footer(1)}`,
  scripts: ['assets/gallery.js'],
}));

// ---- 404
write('404.html', page({
  title: 'Not found · Image-to-Pixel', depth: 0, active: '',
  body: `<main class="notfound" id="main"><div class="wrap"><h1>Nothing at this address</h1><p class="lede">The page may have moved. Try the <a href="./editor/">editor</a> or the <a href="./docs/">docs</a>.</p></div></main>`,
}).replace('<meta charset="utf-8">', `<meta charset="utf-8">
<script>/* GitHub Pages serves this page at any missing path: resolve links from the site root */
(function(){var h=location.hostname,s=location.pathname.split('/')[1];var b=document.createElement('base');b.href=(/github\\.io$/.test(h)&&s?'/'+s+'/':'/');document.head.appendChild(b);})();</script>`));

// ---- the classic (v2) editor, copied unchanged
const classic = ['index.html', 'image-to-pixel.js', 'css', 'src', 'images'];
for (const f of classic) if (existsSync(join(ROOT, f))) copy(join(ROOT, f), join(OUT, 'classic', f));

write('.nojekyll', '');
console.log(`site built: ${relative(ROOT, OUT)}/ (${countFiles(OUT)} files, ${docs.length} docs pages, ${examples.length} examples)`);
