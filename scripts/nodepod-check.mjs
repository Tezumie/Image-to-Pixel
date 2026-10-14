// Probes the Node APIs this project's build relies on and reports which behave like real Node.
// Written to pin down gaps in in-browser runtimes (Codevre / Nodepod). Every check passes on Node 22.
//   node scripts/nodepod-check.mjs
// Needs `npm install` first (for the esbuild checks). Writes only inside a temp folder it removes.

import * as fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TMP = join(ROOT, '.nodepod-check');
const results = [];
const describe = e => (e ? `${e.name || 'Error'}: ${JSON.stringify(e.message || '')} code=${e.code ?? '∅'} syscall=${e.syscall ?? '∅'} path=${e.path ?? '∅'}` : '');

async function check(id, what, fn) {
  try {
    const note = await fn();
    results.push({ id, what, ok: true, note: note || '' });
  } catch (e) {
    results.push({ id, what, ok: false, note: describe(e) });
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(join(TMP, 'dir/sub'), { recursive: true });
fs.writeFileSync(join(TMP, 'dir/file.txt'), 'hello');
fs.writeFileSync(join(TMP, 'entry.js'), 'export const x = 1; console.log(x);\n');
fs.writeFileSync(join(TMP, 'other.js'), 'export const y = 2;\n');
fs.writeFileSync(join(TMP, 'font.woff2'), 'not really a font');
fs.writeFileSync(join(TMP, 'style.css'), '@font-face { font-family: X; src: url("font.woff2"); } body { color: red }\n');

// ---------------------------------------------------------------- fs.statSync
await check('stat-file', 'statSync(file) returns Stats', () => {
  const s = fs.statSync(join(TMP, 'dir/file.txt'));
  assert(s.isFile() && !s.isDirectory(), 'isFile/isDirectory wrong');
  assert(s.size === 5, `size ${s.size}`);
  assert(typeof s.mtimeMs === 'number' && s.mtimeMs > 0, `mtimeMs ${s.mtimeMs}`);
});
await check('stat-dir', 'statSync(directory) returns Stats', () => {
  const s = fs.statSync(join(TMP, 'dir'));
  assert(s.isDirectory() && !s.isFile(), 'isDirectory/isFile wrong');
});
await check('stat-root', 'statSync(project root) and statSync(".")', () => {
  assert(fs.statSync(ROOT).isDirectory(), 'root');
  assert(fs.statSync('.').isDirectory(), '"."');
});
await check('stat-missing', 'statSync(missing) throws ENOENT with a message', () => {
  try { fs.statSync(join(TMP, 'nope')); } catch (e) {
    assert(e.code === 'ENOENT', `code is ${e.code}`);
    assert(/ENOENT/.test(e.message) && e.message.includes('nope'), `message is ${JSON.stringify(e.message)}`);
    return;
  }
  throw new Error('did not throw');
});
await check('stat-missing-nothrow', 'statSync(missing, { throwIfNoEntry: false }) returns undefined', () => {
  assert(fs.statSync(join(TMP, 'nope'), { throwIfNoEntry: false }) === undefined, 'did not return undefined');
});
await check('lstat', 'lstatSync(file)', () => { assert(fs.lstatSync(join(TMP, 'dir/file.txt')).isFile(), 'not a file'); });
await check('stat-async', 'fs.promises.stat(directory)', async () => { assert((await fs.promises.stat(join(TMP, 'dir'))).isDirectory(), 'not a dir'); });
await check('dirent', 'readdirSync(dir, { withFileTypes: true })', () => {
  const ents = fs.readdirSync(join(TMP, 'dir'), { withFileTypes: true });
  const sub = ents.find(e => e.name === 'sub'), file = ents.find(e => e.name === 'file.txt');
  assert(sub && sub.isDirectory() && file && file.isFile(), 'Dirent types wrong');
});
await check('readdir-file', 'readdirSync(file) throws ENOTDIR', () => {
  try { fs.readdirSync(join(TMP, 'dir/file.txt')); } catch (e) { assert(e.code === 'ENOTDIR', `code is ${e.code}`); return; }
  throw new Error('did not throw');
});

// ---------------------------------------------------------------- other fs used by the build
await check('cpSync', 'cpSync(dir, dest, { recursive: true })', () => {
  fs.cpSync(join(TMP, 'dir'), join(TMP, 'copy'), { recursive: true });
  assert(fs.readFileSync(join(TMP, 'copy/file.txt'), 'utf8') === 'hello', 'content');
  assert(fs.existsSync(join(TMP, 'copy/sub')), 'empty subfolder not copied');
});
await check('cpSync-filter', 'cpSync with a filter function', () => {
  fs.cpSync(join(TMP, 'dir'), join(TMP, 'copy2'), { recursive: true, filter: src => !src.endsWith('file.txt') });
  assert(!fs.existsSync(join(TMP, 'copy2/file.txt')), 'filter ignored');
});
await check('copyFileSync', 'copyFileSync', () => {
  fs.copyFileSync(join(TMP, 'dir/file.txt'), join(TMP, 'c.txt'));
  assert(fs.readFileSync(join(TMP, 'c.txt'), 'utf8') === 'hello', 'content');
});
await check('rmSync', 'rmSync(dir, { recursive, force })', () => {
  fs.rmSync(join(TMP, 'copy'), { recursive: true, force: true });
  assert(!fs.existsSync(join(TMP, 'copy')), 'still there');
});

// ---------------------------------------------------------------- fs.watch
await check('watch-recursive', 'fs.watch(dir, { recursive: true }) fires for a nested change', () => new Promise((res, rej) => {
  let w;
  try { w = fs.watch(TMP, { recursive: true }, () => { clearTimeout(t); w.close(); res(); }); } catch (e) { rej(e); return; }
  const t = setTimeout(() => { w.close(); rej(new Error('no event within 3 s')); }, 3000);
  setTimeout(() => fs.writeFileSync(join(TMP, 'dir/sub/new.txt'), String(Date.now())), 200);
}));

// ---------------------------------------------------------------- modules
await check('import-query', 'dynamic import() with ?query re-runs a module', async () => {
  fs.writeFileSync(join(TMP, 'counter.mjs'), 'globalThis.__npc = (globalThis.__npc || 0) + 1;\n');
  const url = pathToFileURL(join(TMP, 'counter.mjs')).href;
  await import(`${url}?a`); await import(`${url}?b`);
  assert(globalThis.__npc === 2, `ran ${globalThis.__npc} times`);
});

// ---------------------------------------------------------------- esbuild
let esbuild = null;
await check('esbuild-load', 'import("esbuild")', async () => {
  const m = await import('esbuild');
  esbuild = m.default && m.default.build ? m.default : m;
  return `version ${esbuild.version}`;
});
const eb = (id, what, opts, verify) => check(id, what, async () => {
  if (!esbuild) throw new Error('esbuild did not load');
  await esbuild.build({ bundle: true, logLevel: 'silent', absWorkingDir: TMP, ...opts });
  if (verify) verify();
});
await eb('esbuild-array-outfile', 'entryPoints: [file] + outfile (works today)',
  { entryPoints: [join(TMP, 'entry.js')], outfile: join(TMP, 'out/a.js') },
  () => assert(fs.existsSync(join(TMP, 'out/a.js')), 'no output'));
await eb('esbuild-object-entry', 'entryPoints: { name: file } + outdir',
  { entryPoints: { 'assets/one': join(TMP, 'entry.js') }, outdir: join(TMP, 'out-obj') },
  () => assert(fs.existsSync(join(TMP, 'out-obj/assets/one.js')), 'no output'));
await eb('esbuild-inout-entry', 'entryPoints: [{ in, out }] + outdir',
  { entryPoints: [{ in: join(TMP, 'entry.js'), out: 'two' }], outdir: join(TMP, 'out-inout') },
  () => assert(fs.existsSync(join(TMP, 'out-inout/two.js')), 'no output'));
await eb('esbuild-multi-entry', 'entryPoints: [a, b] + outdir',
  { entryPoints: [join(TMP, 'entry.js'), join(TMP, 'other.js')], outdir: join(TMP, 'out-multi') },
  () => assert(fs.existsSync(join(TMP, 'out-multi/entry.js')) && fs.existsSync(join(TMP, 'out-multi/other.js')), 'missing output'));
await eb('esbuild-splitting', 'splitting: true + format esm + chunkNames',
  { entryPoints: [join(TMP, 'entry.js'), join(TMP, 'other.js')], outdir: join(TMP, 'out-split'), splitting: true, format: 'esm', chunkNames: 'chunks/[name]-[hash]' },
  () => assert(fs.existsSync(join(TMP, 'out-split/entry.js')), 'no output'));
await eb('esbuild-file-loader', 'CSS with loader { .woff2: "file" } + assetNames writes the font',
  { entryPoints: [join(TMP, 'style.css')], outfile: join(TMP, 'out-css/style.css'), loader: { '.woff2': 'file' }, assetNames: 'fonts/[name]' },
  () => {
    assert(fs.existsSync(join(TMP, 'out-css/fonts/font.woff2')), 'font asset not written');
    assert(/url\("?\.\/fonts\/font\.woff2"?\)/.test(fs.readFileSync(join(TMP, 'out-css/style.css'), 'utf8')), 'url() not rewritten');
  });
await eb('esbuild-external-glob', 'CSS with external: ["*.woff2"] keeps url() as written (works today)',
  { entryPoints: [join(TMP, 'style.css')], outfile: join(TMP, 'out-ext/style.css'), external: ['*.woff2'] },
  () => assert(/font\.woff2/.test(fs.readFileSync(join(TMP, 'out-ext/style.css'), 'utf8')), 'url() lost'));
await check('esbuild-error', 'a failing build rejects with a readable message', async () => {
  if (!esbuild) throw new Error('esbuild did not load');
  try { await esbuild.build({ entryPoints: [join(TMP, 'missing.js')], outfile: join(TMP, 'x.js'), logLevel: 'silent' }); }
  catch (e) { assert(/missing\.js/.test(e.message), `message is ${JSON.stringify(e.message)}`); return; }
  throw new Error('did not reject');
});

// ---------------------------------------------------------------- report
fs.rmSync(TMP, { recursive: true, force: true });
const w = Math.max(...results.map(r => r.id.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(w)}  ${r.what}${r.note ? `\n      ${r.note}` : ''}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
