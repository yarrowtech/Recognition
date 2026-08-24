import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrateFaceThreshold } from './faceCalibration.js';

test('calibration separates genuine and impostor enrollment pairs', () => {
  const result = calibrateFaceThreshold([
    ...[0, 0.01, 0.02, 0.03, 0.04].map((offset) => ({ personId: 'a', embedding: new Float32Array([1, offset]) })),
    ...[0, 0.01, 0.02, 0.03, 0.04].map((offset) => ({ personId: 'b', embedding: new Float32Array([offset, 1]) })),
  ]);
  assert.equal(result.ready, true);
  assert.equal(result.genuine?.pairs, 20);
  assert.equal(result.impostor?.pairs, 25);
  assert.equal(result.observedFalseAcceptRate, 0);
  assert.equal(result.observedFalseRejectRate, 0);
});

test('calibration requires multiple samples and identities', () => {
  const result = calibrateFaceThreshold([
    { personId: 'a', embedding: new Float32Array([1, 0]) },
    { personId: 'b', embedding: new Float32Array([0, 1]) },
  ]);
  assert.equal(result.ready, false);
  assert.match(result.reason ?? '', /five varied samples/i);
});
