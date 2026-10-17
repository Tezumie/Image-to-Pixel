import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedFrameOptions } from '../lib/editor/exporter.js';

test('turning frame selection off preserves the original export options and pipeline', () => {
  const opts = { source: 'video', fps: 12, start: 1, end: 2, audio: true };
  assert.equal(selectedFrameOptions(opts, null), opts);
  assert.equal(selectedFrameOptions(opts, { active: false }), opts);
  assert.equal(selectedFrameOptions({ source: 'files' }, null).source, 'files');
});

test('selected animation and sheet exports snapshot only chosen frames at Animation FPS', () => {
  const frames = [2, 5, 9].map(index => ({ index, result: { width: 2, height: 2 } }));
  const selection = { active: true, complete: true, renderedFrames: frames,
    item: { name: 'clip.webm' }, settings: { export: { scale: 2 } }, fps: 6, start: 0.2, end: 1 };
  for (const opts of [{ format: 'gif' }, { format: 'webm', audio: true }, { columns: 3, padding: 2 }]) {
    const out = selectedFrameOptions({ source: 'video', fps: 30, ...opts }, selection);
    assert.deepEqual(out.renderedFrames.map(f => f.index), [2, 5, 9]);
    assert.notEqual(out.renderedFrames, frames);
    assert.notEqual(out.renderedFrames[0], frames[0]);
    assert.equal(out.renderedFrames[0].result, frames[0].result);
    assert.equal(out.item, selection.item);
    assert.equal(out.settings, selection.settings);
    assert.equal(out.fps, 6);
    assert.equal(out.start, 0.2);
    assert.equal(out.end, 1);
    assert.equal(out.audio, false);
    for (const key of ['format', 'columns', 'padding']) if (key in opts) assert.equal(out[key], opts[key]);
  }
});

test('active frame selection never silently falls back to exporting the entire clip', () => {
  assert.throws(() => selectedFrameOptions({}, { active: true, complete: false }), /finish loading/);
  assert.throws(() => selectedFrameOptions({}, { active: true, complete: true, renderedFrames: [] }), /Select frames/);
});
