// Settings store with undo/redo. Rapid edits to the same control (a slider drag) are
// coalesced into one history step.
//
// The store edits one "target" at a time: the shared settings, or one file's own settings.
// Each target keeps its own undo history, so switching files never mixes their histories.

import { mergeSettings, normalizeSettings } from '../core/settings.js';

export function createStore(initialSettings) {
  let settings = normalizeSettings(initialSettings);
  let target = 'shared';
  let past = [], future = [];
  const histories = new Map();   // target → { past, future }
  const subs = new Set();
  let lastKey = null, lastTime = 0;
  const LIMIT = 200;

  const emit = (why) => { for (const fn of subs) fn(settings, why); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  return {
    get settings() { return settings; },
    /** 'shared' or a file id. */
    get target() { return target; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    /**
     * Patch settings ({ dither: { strength: 0.5 } }).
     * @param {object} patch
     * @param {{ key?: string, history?: boolean }} [opts] key: coalesce consecutive edits with the same key
     */
    update(patch, opts = {}) {
      const next = mergeSettings(settings, patch);
      if (same(next, settings)) return;
      const now = Date.now();
      const coalesce = opts.key && opts.key === lastKey && now - lastTime < 1200;
      if (opts.history !== false && !coalesce) {
        past.push(settings); if (past.length > LIMIT) past.shift();
        future.length = 0;
      }
      lastKey = opts.key || null; lastTime = now;
      settings = next;
      emit('update');
    },

    /** Replace everything (preset, loaded JSON, share link). One undo step. */
    replace(next, why = 'replace') {
      next = normalizeSettings(next);
      if (same(next, settings)) return;
      past.push(settings); future.length = 0; lastKey = null;
      settings = next;
      emit(why);
    },

    /**
     * Switch what is being edited. The current target's history is kept for when it comes back.
     * @param {string} key 'shared' or a file id
     * @param {object} value the settings to edit
     */
    setTarget(key, value) {
      histories.set(target, { past, future });
      target = key;
      const h = histories.get(key) || { past: [], future: [] };
      past = h.past; future = h.future; lastKey = null;
      settings = normalizeSettings(value);
      emit('target');
    },

    /** Forget a target's history (its file was removed or relinked). */
    dropTarget(key) { if (key !== target) histories.delete(key); },

    /** End the current coalescing group (call on slider release). */
    commit() { lastKey = null; },

    undo() { if (!past.length) return false; future.push(settings); settings = past.pop(); lastKey = null; emit('undo'); return true; },
    redo() { if (!future.length) return false; past.push(settings); settings = future.pop(); lastKey = null; emit('redo'); return true; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
