// localStorage wrappers. Every access is guarded: storage may be disabled or full.

const PREFIX = 'itp:';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}
