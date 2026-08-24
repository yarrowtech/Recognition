import assert from 'node:assert/strict';
import test from 'node:test';
import { durationSeconds, shouldClose } from './sessionEngine.js';

test('short disappearance remains inside grace period', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  assert.equal(shouldClose(start, new Date('2026-01-01T00:00:02Z'), 7), false);
});

test('disappearance beyond grace period closes session', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-01T00:00:08Z');
  assert.equal(shouldClose(start, end, 7), true);
  assert.equal(durationSeconds(start, end), 8);
});
