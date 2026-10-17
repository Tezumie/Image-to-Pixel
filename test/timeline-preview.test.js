import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineFrameAt, timelineTime } from '../lib/editor/timeline-preview.js';

test('timeline hover maps the thumb-centred track to source frame timestamps', () => {
  const track = { left: 100, width: 214 };
  assert.deepEqual(timelineFrameAt(107, track, 2, 10), { index: 0, time: 0, seekTime: 0.05 });
  assert.deepEqual(timelineFrameAt(207, track, 2, 10), { index: 10, time: 1, seekTime: 1.05 });
  assert.deepEqual(timelineFrameAt(307, track, 2, 10), { index: 19, time: 1.9, seekTime: 1.95 });
});

test('timeline hover clamps outside the track and handles partial final frames', () => {
  const track = { left: 0, width: 100 };
  assert.equal(timelineFrameAt(-10, track, 2, 10).index, 0);
  assert.equal(timelineFrameAt(110, track, 2, 10).index, 19);
  const final = timelineFrameAt(100, track, 0.35, 10);
  assert.equal(final.index, 3);
  assert.ok(final.seekTime < 0.35 && final.seekTime >= 0.3);
  assert.ok(Number.isFinite(timelineFrameAt(0, { left: 0, width: 0 }, 1, 30).seekTime));
});

test('timeline timestamps include precise short-clip times and roll over minutes and hours', () => {
  assert.equal(timelineTime(0), '0:00.00');
  assert.equal(timelineTime(1.25), '0:01.25');
  assert.equal(timelineTime(59.999), '1:00.00');
  assert.equal(timelineTime(3661.25), '1:01:01.25');
});
