// Builds the library bundles into dist/.
//   node esbuild.config.mjs           build once
//   node esbuild.config.mjs --watch   rebuild on change
import { esbuild } from './scripts/esbuild.mjs';
import { copy } from './scripts/fsutil.mjs';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const watch = process.argv.includes('--watch');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const banner = { js: `/*! image-to-pixel v${pkg.version} | MIT | https://github.com/Tezumie/Image-to-Pixel */` };
const common = { absWorkingDir: ROOT, define: { __ITP_VERSION__: JSON.stringify(pkg.version) }, bundle: true, sourcemap: true, target: 'es2020', banner, logLevel: 'warning', external: ['node:*'] };

const builds = [
  // core: ShaderMate stays a dependency for bundler users …
  { ...common, entryPoints: ['lib/index.js'], format: 'esm', outfile: 'dist/image-to-pixel.esm.js', external: ['shadermate', 'node:*'] },
  { ...common, entryPoints: ['lib/index.js'], format: 'cjs', outfile: 'dist/image-to-pixel.cjs', external: ['shadermate', 'node:*'], platform: 'neutral', mainFields: ['module', 'main'] },
  // … and is bundled in for <script> / CDN users
  { ...common, entryPoints: ['lib/index.js'], format: 'esm', outfile: 'dist/image-to-pixel.bundle.esm.js', minify: true },
  { ...common, entryPoints: ['lib/index.js'], format: 'iife', globalName: 'ImageToPixel', outfile: 'dist/image-to-pixel.js' },
  { ...common, entryPoints: ['lib/index.js'], format: 'iife', globalName: 'ImageToPixel', outfile: 'dist/image-to-pixel.min.js', minify: true },
  // video encoding add-on
  { ...common, entryPoints: ['lib/video.js'], format: 'esm', outfile: 'dist/video.esm.js', minify: true },
  // the editor UI as an embeddable module (everything bundled) + its stylesheet
  { ...common, entryPoints: ['lib/editor/index.js'], format: 'esm', outfile: 'dist/editor.esm.js', minify: true, splitting: false },
  { ...common, entryPoints: ['lib/editor/styles/editor.css'], outfile: 'dist/editor.css', minify: true, external: ['*.woff2'] },
];

// retries: on Windows a file still open (dev server, antivirus) can make rmdir fail for a moment
if (!watch) { rmSync(new URL('dist', import.meta.url), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
mkdirSync(new URL('dist', import.meta.url), { recursive: true });

if (watch) {
  for (const b of builds) (await esbuild.context(b)).watch();
  console.log('watching lib/ …');
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
  // editor.css refers to fonts/*.woff2; ship them next to it (copied, not emitted by esbuild)
  copy(join(ROOT, 'lib/editor/styles/fonts'), join(ROOT, 'dist/fonts'));
  console.log(`built ${builds.length} bundles into dist/`);
}
