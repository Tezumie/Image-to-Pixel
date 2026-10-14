// Loads esbuild. Falls back to esbuild-wasm (`npm i -D esbuild-wasm`) where the native binary
// can't run, such as in-browser Node environments. ESBUILD=wasm forces the wasm build.
let mod;
const tryImport = async name => { try { return await import(name); } catch (e) { return { error: e }; } };
if (process.env.ESBUILD === 'wasm') mod = await tryImport('esbuild-wasm');
if (!mod || mod.error) mod = await tryImport('esbuild');
if (mod.error) {
  const wasm = await tryImport('esbuild-wasm');
  if (wasm.error) throw new Error('esbuild could not be loaded. Run `npm install`, or `npm i -D esbuild-wasm` where native binaries are not supported.\n' + mod.error.message);
  mod = wasm;
}
export const esbuild = mod.default && mod.default.build ? mod.default : mod;
