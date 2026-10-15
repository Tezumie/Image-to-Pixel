// The saved workspace: every open file (its bytes, name and own settings) plus the shared settings,
// kept in this browser's IndexedDB. Nothing is uploaded. One workspace per browser profile.

const DB = 'image-to-pixel';
const STORE = 'workspace';
const KEY = 'current';
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error || (req && req.error));
      tx.onabort = () => reject(tx.error || new Error('Saving was cancelled'));
    });
  } finally {
    db.close();
  }
}

/**
 * Save the workspace.
 * @param {{ shared: object, current: number, items: { name: string, type: 'image'|'video', file: Blob, own: object|null }[] }} ws
 * @returns {Promise<number>} total bytes of the saved files
 */
export async function saveWorkspace(ws) {
  const record = { version: VERSION, savedAt: Date.now(), ...ws };
  await run('readwrite', s => s.put(record, KEY));
  return ws.items.reduce((a, it) => a + (it.file ? it.file.size : 0), 0);
}

/** The saved workspace, or null. */
export async function loadWorkspace() {
  try {
    const rec = await run('readonly', s => s.get(KEY));
    return rec && rec.version === VERSION && Array.isArray(rec.items) ? rec : null;
  } catch (_) {
    return null;
  }
}

export async function forgetWorkspace() {
  await run('readwrite', s => s.delete(KEY));
}

/** True when the error means the browser ran out of storage for us. */
export const isQuotaError = e => !!e && (e.name === 'QuotaExceededError' || /quota|space/i.test(e.message || ''));

export const fmtBytes = n => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
