import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyboardLayout, videoFrameRange, initialVideoFrameRange, limitVideoRange, sliderThumbX, sliderIndexAt, isFullClipDefault, MAX_TILE_FRAMES } from '../lib/editor/storyboard.js';
import { forEachFrame } from '../lib/core/video/frames.js';

test('video intervals use exclusive frame boundaries, including a partial final frame', () => {
  assert.deepEqual(videoFrameRange(4, 30, 1, 2), { count: 120, first: 30, last: 60 });
  assert.deepEqual(videoFrameRange(0.35, 10), { count: 4, first: 0, last: 4 });
  assert.deepEqual(videoFrameRange(2, 29.97), { count: 60, first: 0, last: 60 });
});

test('video intervals clamp to the clip and always contain at least one frame', () => {
  assert.deepEqual(videoFrameRange(1, 12, -3, 0), { count: 12, first: 0, last: 1 });
  assert.deepEqual(videoFrameRange(1, 12, 10, 20), { count: 12, first: 11, last: 12 });
  assert.deepEqual(videoFrameRange(0.01, 30), { count: 1, first: 0, last: 1 });
});

test('initial frame-selection loading uses the first three seconds', () => {
  const bounded = initialVideoFrameRange(300, 60);
  assert.equal(bounded.first, 0);
  assert.equal(bounded.last - bounded.first, 180); // three seconds at 60 fps
  assert.equal(initialVideoFrameRange(300, 240).last, 720);
  assert.equal(initialVideoFrameRange(2, 60).last, 120);
  assert.equal(initialVideoFrameRange(10.005, 30, { end: 10 }).last, 90);
});

test('explicit frame ranges are preserved during initial loading', () => {
  assert.deepEqual(initialVideoFrameRange(300, 60, { start: 10, end: 20 }), videoFrameRange(300, 60, 10, 20));
  assert.deepEqual(initialVideoFrameRange(300, 60, { start: 290, end: 300, rangeTouched: true }), videoFrameRange(300, 60, 290, 300));
});

test('intervals over the tile budget load only their first frames', () => {
  const capped = initialVideoFrameRange(300, 60, { start: 0, end: 300, rangeTouched: true });
  assert.deepEqual(capped, { count: 18000, first: 0, last: MAX_TILE_FRAMES, capped: true });
  assert.deepEqual(limitVideoRange({ first: 600, last: 1200 }), { first: 600, last: 1200 });
  assert.deepEqual(limitVideoRange({ first: 0, last: 5000 }), { first: 0, last: MAX_TILE_FRAMES });
  // the edge being dragged stays under the pointer
  assert.deepEqual(limitVideoRange({ first: 0, last: 5000 }, true), { first: 5000 - MAX_TILE_FRAMES, last: 5000 });
});

test('interval handles map pointer positions to frame boundaries', () => {
  const rect = { left: 100, width: 214 };
  assert.equal(sliderThumbX(0, rect, 10), 107);
  assert.equal(sliderThumbX(5, rect, 10), 207);
  assert.equal(sliderThumbX(10, rect, 10), 307);
  assert.equal(sliderIndexAt(107, rect, 10), 0);
  assert.equal(sliderIndexAt(207, rect, 10), 5);
  assert.equal(sliderIndexAt(307, rect, 10), 10);
  assert.equal(sliderIndexAt(-40, rect, 10), 0);                 // clamped outside the bar
  assert.equal(sliderIndexAt(460, rect, 10), 10);
  assert.equal(sliderIndexAt(3, { left: 0, width: 10 }, 4), 0);  // a degenerate width still clamps
  assert.ok(Number.isFinite(sliderThumbX(3, { left: 0, width: 0 }, 4)));
});

test('the full-clip default accepts rounded, frame-boundary and past-the-end End values', () => {
  assert.equal(isFullClipDefault(10, 10.005), true);
  assert.equal(isFullClipDefault(10.005, 10.005), true);
  assert.equal(isFullClipDefault(10.2, 10.005), true);   // past the end clamps to the clip anyway
  assert.equal(isFullClipDefault(9, 10.005), false);
  assert.equal(isFullClipDefault(10.2, 60), false);
});

test('the animation sits beside the frame grid without replacing or overlapping frames', () => {
  const frames = storyboardLayout(30, 20);
  const combined = storyboardLayout(30, 20, true);
  assert.equal(combined.cols, frames.cols);
  assert.ok(combined.animation.x > frames.width);
  assert.equal(combined.animation.y, 0);
  assert.equal(combined.width, combined.animation.x + combined.animation.w);
  assert.ok(combined.height >= combined.animation.h);
  assert.ok(combined.height >= frames.height);
  assert.equal(frames.animation, null);
});

test('shared canvas layout uses half the source FPS per row and contains the animation', () => {
  for (const fps of [1, 10, 24, 25, 29.97, 30, 60]) {
    for (const count of [1, 2, 90]) {
      const layout = storyboardLayout(fps, count, true);
      assert.ok(layout.cols >= 1 && layout.cols <= count);
      assert.equal(layout.cols, Math.min(count, Math.max(1, Math.round(fps / 2))));
      assert.ok(layout.animation.x > 0);
      assert.ok(layout.animation.x + layout.animation.w <= layout.width);
      assert.ok(layout.animation.h <= layout.height);
    }
  }
});

test('animation uses the regular frame width, with a separate title row', () => {
  const frame = storyboardLayout(30, 1);
  const { animation } = storyboardLayout(30, 1, true);
  assert.equal(animation.w, frame.width);
  assert.equal(animation.h, frame.height + 24);
});

class MockVideo extends EventTarget {
  duration = 5;
  readyState = 2;
  paused = true;
  time = 0;
  onSeek = () => {};
  get currentTime() { return this.time; }
  set currentTime(t) {
    this.time = t;
    setTimeout(() => { this.onSeek(); this.dispatchEvent(new Event('seeked')); }, 0);
  }
  pause() { this.paused = true; }
  async play() { this.paused = false; }
}

test('frame iteration honors explicit non-contiguous timestamps in order', async () => {
  const frames = [];
  const n = await forEachFrame(new MockVideo(), { fps: 12, times: [0.25, NaN, 1.25, 3.25], onFrame: info => frames.push(info) });
  assert.equal(n, 3);
  assert.deepEqual(frames, [
    { index: 0, time: 0.25, total: 3 }, { index: 1, time: 1.25, total: 3 }, { index: 2, time: 3.25, total: 3 },
  ]);
  let called = false;
  assert.equal(await forEachFrame(new MockVideo(), { fps: 12, times: [], onFrame: () => { called = true; } }), 0);
  assert.equal(called, false);
});

test('cancelling during a seek does not deliver a stale frame and restores playback', async () => {
  const video = new MockVideo(), controller = new AbortController();
  video.paused = false;
  video.onSeek = () => controller.abort();
  let called = false;
  await assert.rejects(forEachFrame(video, { fps: 12, times: [0.5], signal: controller.signal, onFrame: () => { called = true; } }), { name: 'AbortError' });
  assert.equal(called, false);
  assert.equal(video.paused, false);
});
