// Remove build output. Cross-platform replacement for `rm -rf dist _site`.
import { rmSync } from 'node:fs';
for (const d of ['dist', '_site']) rmSync(new URL(`../${d}`, import.meta.url), { recursive: true, force: true });
console.log('removed dist/ and _site/');
