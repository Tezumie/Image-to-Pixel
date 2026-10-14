// File helpers for the build scripts that rely only on existsSync, readdirSync, readFileSync,
// writeFileSync and mkdirSync. They never need statSync to succeed, so they also work in
// in-browser Node environments (Codevre / Nodepod) where statSync can throw.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** True when `p` is a directory. Uses statSync when it works, otherwise tries to list it. */
export function isDir(p) {
  if (!existsSync(p)) return false;
  try { return statSync(p).isDirectory(); } catch { /* fall through */ }
  try { readdirSync(p); return true; } catch { return false; }
}

/** Copy a file or a folder tree. Missing sources are skipped. */
export function copy(src, dest, filter = () => true) {
  if (!existsSync(src) || !filter(src)) return;
  if (isDir(src)) {
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(src)) copy(join(src, f), join(dest, f), filter);
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src));
  }
}

/** Number of files under a folder. */
export function countFiles(dir) {
  let n = 0;
  for (const f of readdirSync(dir)) { const p = join(dir, f); n += isDir(p) ? countFiles(p) : 1; }
  return n;
}

/** A value that changes whenever a file under `dir` changes (mtimes, or sizes when stat is unavailable). */
export function treeStamp(dir) {
  let s = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (isDir(p)) { s += treeStamp(p); continue; }
    try { s += statSync(p).mtimeMs; } catch { s += readFileSync(p).length * 31 + f.length; }
  }
  return s;
}
