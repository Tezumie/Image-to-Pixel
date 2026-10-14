// Local server for the built site.
//   node scripts/serve.mjs          serve _site/ as GitHub Pages would (under /Image-to-Pixel/)
//   node scripts/serve.mjs --dev    build, then rebuild when lib/ or site/ change
// PORT=3000 to change the port. Cross-platform: no shell features, no child processes.
// The site is also served from the root and behind path-prefixing preview proxies (Codevre and
// similar), because every link in it is relative and this server never sends absolute redirects.

import { createServer } from 'node:http';
import { readFileSync, existsSync, watch } from 'node:fs';
import { isDir, treeStamp } from './fsutil.mjs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const BASE = '/Image-to-Pixel/';
const PORT = Number(process.env.PORT) || 8080;
const dev = process.argv.includes('--dev');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.map': 'application/json', '.gif': 'image/gif', '.txt': 'text/plain' };

// Builds run in this process (no child processes), re-importing the build scripts each time.
let lastError = null;
async function run(script) {
  try { await import(`${pathToFileURL(join(ROOT, script)).href}?t=${Date.now()}`); return 0; }
  catch (e) {
    lastError = `${script} failed:\n${(e && e.stack) || e}`;
    console.error(lastError);
    return 1;
  }
}

async function build() {
  const t = Date.now();
  lastError = null;
  if ((await run('esbuild.config.mjs')) !== 0) return;
  if ((await run('scripts/build-site.mjs')) !== 0) return;
  console.log(`rebuilt in ${Date.now() - t} ms`);
}

/**
 * Watch a folder: recursive fs.watch where it works, plus a once-a-second poll, because some
 * environments accept fs.watch and then never fire (or don't support it at all).
 * Returns refresh(): call after a build so the poll doesn't report changes the watcher already handled.
 */
function watchTree(dir, onChange) {
  try { watch(dir, { recursive: true }, onChange); } catch { /* polling below covers it */ }
  let last = treeStamp(dir);
  setInterval(() => { try { const now = treeStamp(dir); if (now !== last) { last = now; onChange(); } } catch { /* file vanished mid-scan */ } }, 1000);
  return () => { try { last = treeStamp(dir); } catch { /* ignore */ } };
}

if (dev) {
  await build();
  let timer = null, busy = false, again = false;
  const kick = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) { again = true; return; }
      busy = true; await build(); refreshers.forEach(r => r()); busy = false;
      if (again) { again = false; kick(); }
    }, 150);
  };
  const refreshers = ['lib', 'site'].map(dir => watchTree(join(ROOT, dir), kick));
} else if (!existsSync(join(OUT, 'index.html'))) {
  console.error('_site/ not found. Run `npm run build:site` first, or `npm run dev`.');
  process.exit(1);
}

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (lastError || !existsSync(join(OUT, 'index.html'))) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`The site has not been built.\n\n${lastError || 'Run npm run build:site.'}\n`);
  }
  // /Image-to-Pixel/x, /some/proxy/prefix/Image-to-Pixel/x and plain /x all map to _site/x
  const at = url.indexOf(BASE);
  const rel = at >= 0 ? url.slice(at + BASE.length) : url.replace(/^\/+/, '');
  let file = normalize(join(OUT, rel));
  if (!file.startsWith(OUT)) { res.writeHead(403); return res.end(); }
  const dir = isDir(file);
  if (dir && rel && !url.endsWith('/')) {
    // relative redirect, so it survives proxies that add a path prefix
    res.writeHead(301, { Location: `${url.split('/').pop()}/` });
    return res.end();
  }
  if (dir) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(existsSync(join(OUT, '404.html')) ? readFileSync(join(OUT, '404.html')) : 'Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`${dev ? 'Dev' : 'Preview'}: http://localhost:${PORT}${BASE}  (also served at /)`));
